const Group = require("../models/Group");
const Staff = require("../models/Staff");
const User = require("../models/User");
const Post = require("../models/Post");
const HttpStatusHelper = require("../utils/HttpStatuHelper");
const { Op } = require("sequelize");
const Graduate = require("../models/Graduate");
const GroupMember = require("../models/GroupMember");
const Invitation = require("../models/Invitation");
const checkStaffPermission = require("../utils/permissionChecker");
const { notifyAddedToGroup } = require("../services/notificationService");
const { getCollegeNameByCode } = require("../services/facultiesService");
const { normalizeCollegeName } = require("../services/facultiesService");

// Import logger utilities
const { logger, securityLogger } = require("../utils/logger");

/**
 * Get graduates available for group invitation (not members, no pending invitation)
 * @route GET /api/groups/:groupId/graduates-for-invitation
 * @access Private (Admin, Staff, Group Members)
 */
const getGraduatesForGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const currentUserId = req.user.id;
    const currentUserType = req.user["user-type"];

    // Log request initiation
    logger.info("Get graduates for group invitation request initiated", {
      userId: currentUserId,
      userType: currentUserType,
      groupId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Check if user type is allowed
    const isAllowedUser =
      currentUserType === "admin" ||
      currentUserType === "staff" ||
      currentUserType === "graduate";

    if (!isAllowedUser) {
      // Log unauthorized access
      logger.warn("Unauthorized user type for group invitations", {
        userId: currentUserId,
        userType: currentUserType,
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        error: "Only admins, staff and graduates can invite others to groups.",
      });
    }

    // If user is graduate, verify they are a group member
    if (currentUserType === "graduate") {
      const isGroupMember = await GroupMember.findOne({
        where: {
          "group-id": groupId,
          "user-id": currentUserId,
        },
      });

      if (!isGroupMember) {
        // Log non-member attempt
        logger.warn("Graduate not a member of group for invitations", {
          userId: currentUserId,
          groupId,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          error: "You must be a member of the group to invite others.",
        });
      }
    }

    // Get existing group members
    const groupMembers = await GroupMember.findAll({
      where: { "group-id": groupId },
      attributes: ["user-id"],
    });
    const memberIds = groupMembers.map((m) => m["user-id"]);

    // Get user's pending invitations
    const userPendingInvitations = await Invitation.findAll({
      where: {
        group_id: groupId,
        sender_id: currentUserId,
        status: "pending",
      },
      attributes: ["id", "receiver_id"],
    });

    const pendingMap = {};
    userPendingInvitations.forEach((i) => {
      pendingMap[i.receiver_id] = i.id;
    });
    const pendingIds = Object.keys(pendingMap).map((id) => parseInt(id));

    // Get graduates who are not members and have accepted status
    const graduates = await User.findAll({
      where: {
        "user-type": "graduate",
        id: {
          [Op.notIn]: memberIds,
          [Op.ne]: currentUserId, // Prevent self-invitation
        },
      },
      include: [
        {
          model: Graduate,
          where: { "status-to-login": "accepted" },
          attributes: [
            "profile-picture-url",
            "faculty_code",
            "graduation-year",
          ],
          required: true,
        },
      ],
      attributes: ["id", "first-name", "last-name"],
    });

    // Convert faculty_code to faculty name
    const lang = req.headers["accept-language"] || req.user?.language || "ar";

    // Build response
    const result = graduates.map((g) => {
      const facultyName = getCollegeNameByCode(g.Graduate?.faculty_code, lang);

      return {
        id: g.id,
        fullName: `${g["first-name"]} ${g["last-name"]}`,
        profilePicture: g.Graduate?.["profile-picture-url"] || null,
        faculty: facultyName,
        graduationYear: g.Graduate?.["graduation-year"] || null,
        invitationStatus: pendingIds.includes(g.id) ? "pending" : "not_invited",
        invitationId: pendingMap[g.id] || null,
      };
    });

    // Log successful retrieval
    logger.info("Graduates for group invitation retrieved successfully", {
      userId: currentUserId,
      groupId,
      availableGraduatesCount: result.length,
      pendingInvitationsCount: pendingIds.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json(result);
  } catch (error) {
    // Log error
    logger.error("Error getting graduates for group invitation", {
      userId: req.user?.id,
      groupId: req.params.groupId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error in getGraduatesForGroup:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

/**
 * Create a new group (Admin/Staff only)
 * @route POST /api/groups
 * @access Private (Admin/Staff only)
 */
const createGroup = async (req, res) => {
  try {
    const { groupName, description } = req.body;
    const user = req.user;

    // Log request initiation
    logger.info("Create group request initiated", {
      userId: user?.id,
      userType: user?.["user-type"],
      groupName,
      hasDescription: !!description,
      hasFile: !!req.file,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!groupName || !description) {
      // Log missing fields
      logger.warn("Missing required fields for group creation", {
        userId: user?.id,
        hasGroupName: !!groupName,
        hasDescription: !!description,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: "fail",
        message: "Group name and description are required",
        data: [],
      });
    }

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to create group", {
        userId: user?.id,
        userType: user?.["user-type"],
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: "fail",
        message: "Access denied.",
        data: [],
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Communities management",
        "add"
      );

      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for creating group", {
          userId: user.id,
          permission: "Communities management",
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: "fail",
          message: "Access denied. You don't have permission to create groups.",
          data: [],
        });
      }
    }

    // 4. Extract faculty_code and graduation_year
    let faculty_code = groupName ? normalizeCollegeName(groupName) : groupName;
    let graduation_year = null;

    // Extract year from description
    const yearMatch = description.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      graduation_year = parseInt(yearMatch[0]);
    } else {
      // If no year in description, try to extract from groupName
      const yearMatchFromName = groupName.match(/\b(19|20)\d{2}\b/);
      if (yearMatchFromName) {
        graduation_year = parseInt(yearMatchFromName[0]);
      }
    }

    // 5. Check if group already exists with same faculty and year
    if (faculty_code && graduation_year) {
      const existingGroup = await Group.findOne({
        where: {
          faculty_code: faculty_code,
          graduation_year: graduation_year,
        },
      });

      if (existingGroup) {
        // Log duplicate group attempt
        logger.warn("Group already exists with same faculty and year", {
          userId: user.id,
          faculty_code,
          graduation_year,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          status: "fail",
          message: `Group already exists for ${faculty_code} - ${graduation_year}`,
          data: [],
        });
      }
    }

    // 6. Handle image upload
    let imageUrl = null;
    if (req.file) {
      imageUrl = req.file.path || req.file.url || req.file.location || null;
      // Log image upload
      logger.debug("Group image uploaded", {
        userId: user.id,
        hasImage: !!imageUrl,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    // 7. Create group
    const group = await Group.create({
      "group-name": groupName,
      description,
      "created-date": new Date(),
      "group-image": imageUrl,
      faculty_code: faculty_code,
      graduation_year: graduation_year || new Date().getFullYear(),
    });

    const memberCount = await GroupMember.count({
      where: { "group-id": group.id },
    });

    // Log successful creation
    logger.info("Group created successfully", {
      userId: user.id,
      userType: user["user-type"],
      groupId: group.id,
      groupName: group["group-name"],
      faculty_code,
      graduation_year,
      memberCount,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(201).json({
      status: "success",
      message: "Group created successfully",
      data: {
        id: group.id,
        groupName: group["group-name"],
        description: group.description,
        createdDate: group["created-date"],
        groupImage: group["group-image"],
        faculty_code: group.faculty_code,
        graduation_year: group.graduation_year,
        memberCount,
      },
    });
  } catch (err) {
    // Log error
    logger.error("Error creating group", {
      userId: req.user?.id,
      groupName: req.body.groupName,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error in createGroup:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to create group",
      error: err.message,
      data: [],
    });
  }
};

/**
 * Get all groups (Admin, Staff, Graduate)
 * @route GET /api/groups
 * @access Private
 */
const getGroups = async (req, res) => {
  try {
    // Log request initiation
    logger.info("Get all groups request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff", "graduate"];

    // 2. Check if user type is allowed
    if (!req.user || !allowedUserTypes.includes(req.user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to view groups", {
        userId: req.user?.id,
        userType: req.user?.["user-type"],
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
        data: [],
      });
    }

    // 3. Staff can proceed directly to view groups
    // 4. Get all groups
    const groups = await Group.findAll();

    // Get member count for each group
    const groupsWithCount = await Promise.all(
      groups.map(async (group) => {
        const membersCount = await GroupMember.count({
          where: { "group-id": group.id },
        });

        return {
          id: group.id,
          groupName: group["group-name"],
          description: group.description,
          createdDate: group["created-date"],
          groupImage: group["group-image"],
          membersCount,
        };
      })
    );

    // Log successful retrieval
    logger.info("All groups retrieved successfully", {
      userId: req.user.id,
      userType: req.user["user-type"],
      groupsCount: groupsWithCount.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: "success",
      message: "Groups fetched successfully",
      data: groupsWithCount,
    });
  } catch (err) {
    // Log error
    logger.error("Error getting all groups", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: err.message,
      data: [],
    });
  }
};

/**
 * Add user to group (Admin/Staff only)
 * @route POST /api/groups/add-user
 * @access Private (Admin/Staff only)
 */
const addUserToGroup = async (req, res) => {
  try {
    const { groupId, userId } = req.body;
    const user = req.user;

    // Log request initiation
    logger.info("Add user to group request initiated", {
      adminUserId: user?.id,
      adminUserType: user?.["user-type"],
      targetUserId: userId,
      groupId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to add user to group", {
        userId: user?.id,
        userType: user?.["user-type"],
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: "fail",
        message: "Access denied.",
        data: [],
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Community Members management",
        "add"
      );

      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for adding user to group", {
          userId: user.id,
          permission: "Community Members management",
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: "fail",
          message:
            "Access denied. You don't have permission to add users to groups.",
          data: [],
        });
      }
    }

    // 4. Verify group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      // Log group not found
      logger.warn("Group not found for adding user", {
        groupId,
        adminUserId: user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "fail",
        message: "Group not found",
        data: [],
      });
    }

    // Verify user exists
    const member = await User.findByPk(userId);
    if (!member) {
      // Log user not found
      logger.warn("User not found for adding to group", {
        targetUserId: userId,
        adminUserId: user.id,
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "fail",
        message: "User not found",
        data: [],
      });
    }

    // Check if user is already a member
    const existingMember = await GroupMember.findOne({
      where: { "group-id": groupId, "user-id": userId },
    });
    if (existingMember) {
      // Log duplicate membership
      logger.warn("User already member of group", {
        targetUserId: userId,
        groupId,
        adminUserId: user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: "fail",
        message: "User already in this group",
        data: [],
      });
    }

    // Add member to group
    await GroupMember.create({
      "group-id": groupId,
      "user-id": userId,
    });

    // Create notification for the user being added
    await notifyAddedToGroup(userId, user.id, group["group-name"], groupId);

    // Log successful addition
    logger.info("User added to group successfully", {
      adminUserId: user.id,
      adminUserType: user["user-type"],
      targetUserId: userId,
      targetUserName: `${member["first-name"]} ${member["last-name"]}`,
      groupId,
      groupName: group["group-name"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(201).json({
      status: "success",
      message: "User added to group successfully",
      data: [
        {
          groupId: group.id,
          groupName: group["group-name"],
          userId: member.id,
          userName: `${member["first-name"]} ${member["last-name"]}`,
        },
      ],
    });
  } catch (err) {
    // Log error
    logger.error("Error adding user to group", {
      userId: req.user?.id,
      targetUserId: req.body.userId,
      groupId: req.body.groupId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: err.message,
      data: [],
    });
  }
};

/**
 * Edit group details (Admin/Staff only)
 * @route PUT /api/groups/:groupId
 * @access Private (Admin/Staff only)
 */
const editGroup = async (req, res) => {
  try {
    const user = req.user;
    const { groupId } = req.params;
    const { groupName, description, removeGroupImage } = req.body;

    // Log request initiation
    logger.info("Edit group request initiated", {
      userId: user?.id,
      userType: user?.["user-type"],
      groupId,
      hasGroupName: !!groupName,
      hasDescription: !!description,
      removeGroupImage: !!removeGroupImage,
      hasFile: !!req.file,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to edit group", {
        userId: user?.id,
        userType: user?.["user-type"],
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: "fail",
        message: "Access denied.",
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Communities management",
        "edit"
      );

      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for editing group", {
          userId: user.id,
          permission: "Communities management",
          groupId,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: "fail",
          message: "Access denied. You don't have permission to edit groups.",
        });
      }
    }

    // 4. Find group
    const group = await Group.findByPk(groupId);
    if (!group) {
      // Log group not found
      logger.warn("Group not found for editing", {
        groupId,
        userId: user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res
        .status(404)
        .json({ status: "fail", message: "Group not found" });
    }

    // 5. Extract faculty_code and graduation_year from groupName and description
    let faculty_code = group.faculty_code;
    let graduation_year = group.graduation_year;

    // Extract year from description
    if (description && description !== group.description) {
      const yearMatch = description.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        graduation_year = parseInt(yearMatch[0]);
      }
    }

    // Extract faculty from groupName
    if (groupName && groupName !== group["group-name"]) {
      faculty_code = groupName ? normalizeCollegeName(groupName) : groupName;

      // If no year in description, try to extract from groupName
      if (!graduation_year || graduation_year === group.graduation_year) {
        const yearMatchFromName = groupName.match(/\b(19|20)\d{2}\b/);
        if (yearMatchFromName) {
          graduation_year = parseInt(yearMatchFromName[0]);
        }
      }
    }

    // 6. Check for duplicate group
    if (faculty_code && graduation_year) {
      const existingGroup = await Group.findOne({
        where: {
          faculty_code: faculty_code,
          graduation_year: graduation_year,
          id: { [Op.ne]: groupId },
        },
      });

      if (existingGroup) {
        // Log duplicate group
        logger.warn("Duplicate group found during edit", {
          groupId,
          faculty_code,
          graduation_year,
          existingGroupId: existingGroup.id,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(400).json({
          status: "fail",
          message: `Another group already exists for ${faculty_code} - ${graduation_year}`,
        });
      }
    }

    // 7. Update data
    const oldGroupName = group["group-name"];
    const oldDescription = group.description;

    if (groupName) group["group-name"] = groupName;
    if (description) group.description = description;
    group.faculty_code = faculty_code;
    group.graduation_year = graduation_year;

    // 8. Remove group image if requested
    if (removeGroupImage) {
      // Log image removal
      logger.debug("Removing group image as requested", {
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      group["group-image"] = null;
    }

    // 9. Upload new image
    if (req.file) {
      const imageUrl = req.file.path || req.file.url || req.file.location;
      group["group-image"] = imageUrl;
      // Log new image upload
      logger.debug("New group image uploaded", {
        groupId,
        hasNewImage: !!imageUrl,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    await group.save();

    const membersCount = await GroupMember.count({
      where: { "group-id": group.id },
    });

    // Log successful update
    logger.info("Group updated successfully", {
      userId: user.id,
      userType: user["user-type"],
      groupId,
      changes: {
        groupName: oldGroupName !== group["group-name"],
        description: oldDescription !== group.description,
        faculty_code: faculty_code !== group.faculty_code,
        graduation_year: graduation_year !== group.graduation_year,
      },
      newFacultyCode: faculty_code,
      newGraduationYear: graduation_year,
      membersCount,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: "success",
      message: "Group updated successfully",
      data: {
        id: group.id,
        groupName: group["group-name"],
        description: group.description,
        groupImage: group["group-image"],
        createdDate: group["created-date"],
        faculty_code: group.faculty_code,
        graduation_year: group.graduation_year,
        membersCount,
      },
    });
  } catch (err) {
    // Log error
    logger.error("Error editing group", {
      userId: req.user?.id,
      groupId: req.params.groupId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error(err);
    return res
      .status(500)
      .json({ status: "error", message: err.message, data: [] });
  }
};

/**
 * Delete group and associated data (Admin/Staff only)
 * @route DELETE /api/groups/:groupId
 * @access Private (Admin/Staff only)
 */
const deleteGroup = async (req, res) => {
  try {
    const user = req.user;
    const { groupId } = req.params;

    // Log request initiation
    logger.info("Delete group request initiated", {
      userId: user?.id,
      userType: user?.["user-type"],
      groupId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to delete group", {
        userId: user?.id,
        userType: user?.["user-type"],
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: "fail",
        message: "Access denied.",
        data: [],
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Communities management",
        "delete"
      );

      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for deleting group", {
          userId: user.id,
          permission: "Communities management",
          groupId,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: "fail",
          message: "Access denied. You don't have permission to delete groups.",
          data: [],
        });
      }
    }

    // 4. Find group
    const group = await Group.findByPk(groupId);
    if (!group) {
      // Log group not found
      logger.warn("Group not found for deletion", {
        groupId,
        userId: user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "fail",
        message: "Group not found",
        data: [],
      });
    }

    // Save group info before deletion
    const groupInfo = {
      id: group.id,
      name: group["group-name"],
      faculty_code: group.faculty_code,
      graduation_year: group.graduation_year,
    };

    // Count posts and members before deletion
    const postsCount = await Post.count({ where: { "group-id": groupId } });
    const membersCount = await GroupMember.count({
      where: { "group-id": groupId },
    });

    // Delete associated posts
    await Post.destroy({ where: { "group-id": groupId } });

    // Delete members
    await GroupMember.destroy({ where: { "group-id": groupId } });

    // Delete group
    await group.destroy();

    // Log successful deletion
    logger.info("Group deleted successfully", {
      userId: user.id,
      userType: user["user-type"],
      groupId,
      groupName: groupInfo.name,
      facultyCode: groupInfo.faculty_code,
      graduationYear: groupInfo.graduation_year,
      deletedPostsCount: postsCount,
      deletedMembersCount: membersCount,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: "success",
      message: "Group, members, and posts deleted successfully",
      data: [],
    });
  } catch (err) {
    // Log error
    logger.error("Error deleting group", {
      userId: req.user?.id,
      groupId: req.params.groupId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error deleting group:", err);
    return res.status(500).json({
      status: "error",
      message: err.message,
      data: [],
    });
  }
};

/**
 * Get group members count (Admin, Staff, Graduate)
 * @route GET /api/groups/:groupId/members-count
 * @access Private
 */
const getGroupMembersCount = async (req, res) => {
  try {
    const user = req.user;
    const { groupId } = req.params;

    // Log request initiation
    logger.info("Get group members count request initiated", {
      userId: user?.id,
      userType: user?.["user-type"],
      groupId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff", "graduate"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to view group members count", {
        userId: user?.id,
        userType: user?.["user-type"],
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: "fail",
        message: "Access denied.",
        data: [],
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Communities management",
        "view"
      );

      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for viewing members count", {
          userId: user.id,
          permission: "Communities management",
          groupId,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: "fail",
          message:
            "Access denied. You don't have permission to view members count.",
          data: [],
        });
      }
    }

    // 4. Verify group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      // Log group not found
      logger.warn("Group not found for members count", {
        groupId,
        userId: user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "fail",
        message: "Group not found",
        data: [],
      });
    }

    // Count members
    const membersCount = await GroupMember.count({
      where: { "group-id": groupId },
    });

    // Log successful retrieval
    logger.info("Group members count retrieved successfully", {
      userId: user.id,
      userType: user["user-type"],
      groupId,
      groupName: group["group-name"],
      membersCount,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: "success",
      message: "Group members count fetched successfully",
      data: [
        {
          groupId: group.id,
          groupName: group["group-name"],
          membersCount,
        },
      ],
    });
  } catch (err) {
    // Log error
    logger.error("Error getting group members count", {
      userId: req.user?.id,
      groupId: req.params.groupId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: err.message,
      data: [],
    });
  }
};

/**
 * Join a group (Graduate only)
 * @route POST /api/groups/join
 * @access Private (Graduate only)
 */
const joinGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.body;

    // Log request initiation
    logger.info("Join group request initiated", {
      userId,
      groupId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Get user data
    const user = await User.findByPk(userId);
    if (!user) {
      // Log user not found
      logger.warn("User not found for joining group", {
        userId,
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "User not found",
      });
    }

    // Must be graduate to join
    if (user["user-type"] !== "graduate") {
      // Log non-graduate attempt
      logger.warn("Non-graduate user attempted to join group", {
        userId,
        userType: user["user-type"],
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: HttpStatusHelper.FAIL,
        message: "Only graduates can join groups",
      });
    }

    // Get group data
    const group = await Group.findByPk(groupId);
    if (!group) {
      // Log group not found
      logger.warn("Group not found for joining", {
        userId,
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Group not found",
      });
    }

    // Check if already a member
    const existingMember = await GroupMember.findOne({
      where: { "group-id": groupId, "user-id": userId },
    });

    if (existingMember) {
      // Log duplicate membership
      logger.warn("User already member of group", {
        userId,
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: HttpStatusHelper.FAIL,
        message: "You are already a member of this group",
      });
    }

    // Add as new member
    await GroupMember.create({
      "group-id": groupId,
      "user-id": userId,
    });

    // Note: No notification when user joins themselves

    // Count members after addition
    const memberCount = await GroupMember.count({
      where: { "group-id": groupId },
    });

    // Log successful join
    logger.info("User joined group successfully", {
      userId,
      userName: `${user["first-name"]} ${user["last-name"]}`,
      groupId,
      groupName: group["group-name"],
      memberCount,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(201).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Joined group successfully",
      data: {
        groupId: group.id,
        groupName: group["group-name"],
        memberCount: memberCount,
      },
    });
  } catch (error) {
    // Log error
    logger.error("Error joining group", {
      userId: req.user?.id,
      groupId: req.body.groupId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error(error);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

/**
 * Leave a group (Graduate only)
 * @route DELETE /api/groups/:groupId/leave
 * @access Private (Graduate only)
 */
const leaveGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    // Log request initiation
    logger.info("Leave group request initiated", {
      userId,
      groupId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Find group
    const group = await Group.findByPk(groupId);
    if (!group) {
      // Log group not found
      logger.warn("Group not found for leaving", {
        userId,
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.ERROR,
        message: "Group not found",
      });
    }

    // Check if member
    const membership = await GroupMember.findOne({
      where: {
        "group-id": groupId,
        "user-id": userId,
      },
    });

    if (!membership) {
      // Log non-member attempt
      logger.warn("User not a member of group for leaving", {
        userId,
        groupId,
        groupName: group["group-name"],
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: HttpStatusHelper.ERROR,
        message: "You are not a member of this group",
      });
    }

    // Delete membership
    await GroupMember.destroy({
      where: {
        "group-id": groupId,
        "user-id": userId,
      },
    });

    // Log successful leave
    logger.info("User left group successfully", {
      userId,
      userName: `${req.user?.["first-name"]} ${req.user?.["last-name"]}`,
      groupId,
      groupName: group["group-name"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "You have left the group successfully",
    });
  } catch (error) {
    // Log error
    logger.error("Error leaving group", {
      userId: req.user?.id,
      groupId: req.params.groupId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error in leaveGroup:", error);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Failed to leave group: " + error.message,
    });
  }
};

/**
 * Get groups the authenticated user is a member of
 * @route GET /api/groups/my-groups
 * @access Private (Graduate only)
 */
const getMyGroups = async (req, res) => {
  try {
    const userId = req.user.id;

    // Log request initiation
    logger.info("Get my groups request initiated", {
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Get groups user is member of
    const groups = await Group.findAll({
      include: [
        {
          model: User,
          where: { id: userId },
          attributes: [],
          through: { attributes: [] },
        },
      ],
      attributes: [
        "id",
        "group-name",
        "description",
        "created-date",
        "group-image",
      ],
    });

    if (!groups || groups.length === 0) {
      // Log no groups
      logger.info("User has no groups", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(200).json({
        status: HttpStatusHelper.FAIL,
        message: "You are not a member of any group",
      });
    }

    // Add member count to each group
    const formattedGroups = await Promise.all(
      groups.map(async (group) => {
        const membersCount = await GroupMember.count({
          where: { "group-id": group.id },
        });

        return {
          id: group.id,
          groupName: group["group-name"],
          description: group.description,
          createdDate: group["created-date"],
          groupImage: group["group-image"],
          membersCount,
        };
      })
    );

    // Log successful retrieval
    logger.info("User groups retrieved successfully", {
      userId,
      groupsCount: formattedGroups.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "These are your groups",
      data: formattedGroups,
    });
  } catch (err) {
    // Log error
    logger.error("Error getting user groups", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error in getMyGroups:", err);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Something went wrong",
    });
  }
};

/**
 * Get all users in a specific group
 * @route GET /api/groups/:groupId/users
 * @access Private (Admin, Staff, Graduate)
 */
const getGroupUsers = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Log request initiation
    logger.info("Get group users request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      groupId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff", "graduate"];

    // 2. Check if user type is allowed
    if (!req.user || !allowedUserTypes.includes(req.user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to view group users", {
        userId: req.user?.id,
        userType: req.user?.["user-type"],
        groupId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
      });
    }

    // 3. Check staff permissions
    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Community Members management",
        "view"
      );

      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for viewing group users", {
          userId: req.user.id,
          permission: "Community Members management",
          groupId,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to view group members.",
        });
      }
    }

    // 4. Get group with users
    const group = await Group.findByPk(groupId, {
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          through: { attributes: [] },
          include: [
            {
              model: Graduate,
              attributes: [
                "faculty_code",
                "graduation-year",
                "profile-picture-url",
              ],
            },
          ],
        },
      ],
    });

    if (!group) {
      // Log group not found
      logger.warn("Group not found for users list", {
        groupId,
        userId: req.user?.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "error",
        message: "Group not found",
      });
    }

    // Convert faculty_code to faculty name
    const lang = req.headers["accept-language"] || req.user?.language || "ar";

    const usersWithGraduateInfo = group.Users.map((user) => {
      const facultyName = getCollegeNameByCode(
        user.Graduate?.faculty_code,
        lang
      );

      return {
        id: user.id,
        "first-name": user["first-name"],
        "last-name": user["last-name"],
        email: user.email,
        "user-type": user["user-type"],
        Graduate: {
          faculty: facultyName,
          "graduation-year": user.Graduate
            ? user.Graduate["graduation-year"]
            : null,
          "profile-picture-url": user.Graduate
            ? user.Graduate["profile-picture-url"]
            : null,
          faculty_code: user.Graduate?.faculty_code,
        },
      };
    });

    // Log successful retrieval
    logger.info("Group users retrieved successfully", {
      groupId,
      groupName: group["group-name"],
      usersCount: usersWithGraduateInfo.length,
      userId: req.user.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      status: "success",
      count: group.Users.length,
      data: usersWithGraduateInfo,
    });
  } catch (error) {
    // Log error
    logger.error("Error fetching group users", {
      userId: req.user?.id,
      groupId: req.params.groupId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error fetching group users:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch group users",
      error: error.message,
    });
  }
};

/**
 * Get sorted groups with user's faculty first
 * @route GET /api/groups/sorted
 * @access Private
 */
const getSortedGroups = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userType = req.user?.["user-type"];

    // Log request initiation
    logger.info("Get sorted groups request initiated", {
      userId,
      userType,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 1. Get graduate's faculty if user is graduate
    let userFaculty = null;

    if (userType === "graduate") {
      const graduate = await Graduate.findOne({
        where: { graduate_id: userId },
        attributes: ["faculty_code"],
      });

      if (graduate) {
        userFaculty = graduate.faculty_code;
        logger.debug("User faculty retrieved", {
          userId,
          faculty_code: userFaculty,
        });
      }
    }

    // 2. Get all groups
    const groups = await Group.findAll({
      include: [
        {
          model: User,
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
      order: [["group-name", "ASC"]],
    });

    // 3. Convert faculty_code to faculty name
    const lang = req.headers["accept-language"] || req.user?.language || "ar";

    const groupsWithDetails = groups.map((group) => {
      // Get faculty name
      const facultyName = group.faculty_code
        ? getCollegeNameByCode(group.faculty_code, lang)
        : "General";

      return {
        id: group.id,
        name: group["group-name"],
        description: group.description,
        image: group["group-image"],
        faculty_code: group.faculty_code,
        faculty_name: facultyName,
        graduation_year: group.graduation_year,
        members_count: group.Users?.length || 0,
        created_date: group["created-date"],
      };
    });

    // 4. Sort groups: user's faculty groups first, then others alphabetically
    const sortedGroups = [...groupsWithDetails].sort((a, b) => {
      // If a is user's faculty and b is not → a first
      if (
        userFaculty &&
        a.faculty_code === userFaculty &&
        b.faculty_code !== userFaculty
      ) {
        return -1;
      }
      // If b is user's faculty and a is not → b first
      if (
        userFaculty &&
        b.faculty_code === userFaculty &&
        a.faculty_code !== userFaculty
      ) {
        return 1;
      }
      // If both same faculty or no faculty → alphabetical
      return a.name.localeCompare(b.name);
    });

    // 5. Add flag for user's faculty groups
    const groupsWithFlags = sortedGroups.map((group) => ({
      ...group,
      is_user_faculty: userFaculty ? group.faculty_code === userFaculty : false,
    }));

    // Log successful retrieval
    logger.info("Groups sorted and retrieved successfully", {
      userId,
      userFaculty,
      totalGroups: groupsWithFlags.length,
      userFacultyGroups: groupsWithFlags.filter((g) => g.is_user_faculty)
        .length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      status: "success",
      count: groupsWithFlags.length,
      user_faculty: userFaculty
        ? getCollegeNameByCode(userFaculty, lang)
        : null,
      data: groupsWithFlags,
    });
  } catch (error) {
    // Log error
    logger.error("Error fetching sorted groups", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    console.error("Error fetching sorted groups:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch groups",
      error: error.message,
    });
  }
};

module.exports = {
  createGroup,
  getGroups,
  addUserToGroup,
  editGroup,
  deleteGroup,
  getGroupMembersCount,
  joinGroup,
  leaveGroup,
  getMyGroups,
  getGroupUsers,
  getGraduatesForGroup,
  getSortedGroups,
};

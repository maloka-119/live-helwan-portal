const Invitation = require("../models/Invitation");
const GroupMember = require("../models/GroupMember");
const Group = require("../models/Group");
const { Op } = require("sequelize");
const User = require("../models/User");
const Graduate = require("../models/Graduate");
const Notification = require("../models/Notification");
const { findMatchingGroup } = require("../utils/groupUtils");
const sequelize = require("../config/db");
const { getCollegeNameByCode } = require("../services/facultiesService");
const axios = require("axios"); 
// Import logger utilities
const { logger, securityLogger } = require("../utils/logger");
const aes = require("../utils/aes");// عدل المسار حسب مكان الملف
const SYSTEM_USER_ID = 1;
/**
 * Send a group invitation
 * @route POST /api/invitations
 * @access Private (Group members only)
 */
const sendInvitation = async (req, res) => {
  try {
    const sender_id = req.user.id;
    const { receiver_id, group_id } = req.body;

    // Log request initiation
    logger.info("Send invitation request initiated", {
      sender_id,
      receiver_id,
      group_id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!receiver_id || !group_id) {
      // Log missing fields
      logger.warn("Missing required fields for sending invitation", {
        sender_id,
        hasReceiverId: !!receiver_id,
        hasGroupId: !!group_id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res
        .status(400)
        .json({ message: "receiver_id and group_id are required" });
    }

    // Check if sender is a group member
    const isMember = await GroupMember.findOne({
      where: { "group-id": group_id, "user-id": sender_id },
    });

    if (!isMember) {
      // Log non-member attempt
      logger.warn("Sender not a member of group for invitation", {
        sender_id,
        group_id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res
        .status(403)
        .json({ message: "You are not a member of this group" });
    }

    // Create invitation
    const invitation = await Invitation.create({
      sender_id,
      receiver_id,
      group_id,
    });

    // Log successful creation
    logger.info("Invitation sent successfully", {
      invitationId: invitation.id,
      sender_id,
      receiver_id,
      group_id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json(invitation);
  } catch (err) {
    // Log error
    logger.error("Error sending invitation", {
      sender_id: req.user?.id,
      receiver_id: req.body.receiver_id,
      group_id: req.body.group_id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ error: err.message });
  }
};

/**
 * Accept a group invitation
 * @route PUT /api/invitations/:id/accept
 * @access Private (Invitation receiver only)
 */
const acceptInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Log request initiation
    logger.info("Accept invitation request initiated", {
      userId,
      invitationId: id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const invitation = await Invitation.findByPk(id);
    if (!invitation) {
      // Log not found
      logger.warn("Invitation not found for acceptance", {
        invitationId: id,
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Verify that the current user is the receiver
    if (invitation.receiver_id !== userId) {
      // Log unauthorized attempt
      securityLogger.warn("Unauthorized invitation acceptance attempt", {
        userId,
        invitationReceiverId: invitation.receiver_id,
        invitationId: id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res
        .status(403)
        .json({ message: "Not authorized to accept this invitation" });
    }

    const oldStatus = invitation.status;
    invitation.status = "accepted";
    await invitation.save();

    // Add member to group
    await GroupMember.create({
      "group-id": invitation.group_id,
      "user-id": invitation.receiver_id,
    });

    // Log successful acceptance
    logger.info("Invitation accepted successfully", {
      invitationId: id,
      userId,
      oldStatus,
      newStatus: "accepted",
      groupId: invitation.group_id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json(invitation);
  } catch (err) {
    // Log error
    logger.error("Error accepting invitation", {
      userId: req.user?.id,
      invitationId: req.params.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete invitation by receiver (soft delete)
 * @route DELETE /api/invitations/:id
 * @access Private (Invitation receiver only)
 */
const deleteInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Log request initiation
    logger.info("Delete invitation request initiated", {
      userId,
      invitationId: id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const invitation = await Invitation.findByPk(id);
    if (!invitation) {
      // Log not found
      logger.warn("Invitation not found for deletion", {
        invitationId: id,
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Verify that the current user is the receiver
    if (invitation.receiver_id !== userId) {
      // Log unauthorized attempt
      securityLogger.warn("Unauthorized invitation deletion attempt", {
        userId,
        invitationReceiverId: invitation.receiver_id,
        invitationId: id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res
        .status(403)
        .json({ message: "Not authorized to delete this invitation" });
    }

    const invitationInfo = {
      id: invitation.id,
      sender_id: invitation.sender_id,
      receiver_id: invitation.receiver_id,
      group_id: invitation.group_id,
      status: invitation.status,
    };

    await invitation.destroy();

    // Log successful deletion
    logger.info("Invitation deleted by receiver", {
      invitationId: id,
      userId,
      invitationInfo,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: "Invitation deleted from your side" });
  } catch (err) {
    // Log error
    logger.error("Error deleting invitation", {
      userId: req.user?.id,
      invitationId: req.params.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ error: err.message });
  }
};

/**
 * Cancel invitation by sender
 * @route DELETE /api/invitations/:id/cancel
 * @access Private (Invitation sender only)
 */
const cancelInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Log request initiation
    logger.info("Cancel invitation request initiated", {
      userId,
      invitationId: id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const invitation = await Invitation.findByPk(id);
    if (!invitation) {
      // Log not found
      logger.warn("Invitation not found for cancellation", {
        invitationId: id,
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({ message: "Invitation not found" });
    }

    // Verify that the current user is the sender
    if (invitation.sender_id !== userId) {
      // Log unauthorized attempt
      securityLogger.warn("Unauthorized invitation cancellation attempt", {
        userId,
        invitationSenderId: invitation.sender_id,
        invitationId: id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res
        .status(403)
        .json({ message: "Not authorized to cancel this invitation" });
    }

    const invitationInfo = {
      id: invitation.id,
      sender_id: invitation.sender_id,
      receiver_id: invitation.receiver_id,
      group_id: invitation.group_id,
      status: invitation.status,
    };

    await invitation.destroy();

    // Log successful cancellation
    logger.info("Invitation cancelled by sender", {
      invitationId: id,
      userId,
      invitationInfo,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: "Invitation cancelled successfully" });
  } catch (err) {
    // Log error
    logger.error("Error cancelling invitation", {
      userId: req.user?.id,
      invitationId: req.params.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all pending invitations received by the user
 * @route GET /api/invitations/received
 * @access Private
 */
const getReceivedInvitations = async (req, res) => {
  try {
    const receiver_id = req.user.id;
    const lang = req.headers["accept-language"] || req.user?.language || "ar";

    // Log request initiation
    logger.info("Get received invitations request initiated", {
      receiver_id,
      lang,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const invitations = await Invitation.findAll({
      where: { receiver_id, status: "pending" },
      attributes: [
        "id",
        "status",
        "sent_date",
        "sender_id",
        "receiver_id",
        "group_id",
      ],
      include: [
        {
          model: Group,
          attributes: ["id", "group-name"],
        },
        {
          model: User,
          as: "sender",
          attributes: ["id", "first-name", "last-name"],
          include: [
            {
              model: Graduate,
              attributes: [
                "faculty_code",
                "graduation-year",
                "current-job",
                "profile-picture-url",
              ],
            },
          ],
        },
      ],
    });

    // Format result with faculty name from code
    const result = invitations.map((inv) => {
      const firstName = inv.sender?.["first-name"] || "";
      const lastName = inv.sender?.["last-name"] || "";
      const fullName = `${firstName} ${lastName}`.trim();

      // Convert faculty_code to faculty name
      const facultyName = getCollegeNameByCode(
        inv.sender?.Graduate?.faculty_code,
        lang
      );

      return {
        invitationId: inv.id,
        status: inv.status,
        sent_date: inv.sent_date,
        sender_id: inv.sender_id,
        receiver_id: inv.receiver_id,
        group_id: inv.group_id,
        groupName: inv.Group ? inv.Group["group-name"] : null,
        senderFullName: fullName,
        senderFaculty: facultyName,
        senderGraduationYear: inv.sender?.Graduate?.["graduation-year"] || null,
        senderCurrentJob: inv.sender?.Graduate?.["current-job"] || null,
        senderProfilePicture:
          inv.sender?.Graduate?.["profile-picture-url"] || null,
      };
    });

    // Log successful retrieval
    logger.info("Received invitations retrieved successfully", {
      receiver_id,
      invitationsCount: result.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json(result);
  } catch (err) {
    // Log error
    logger.error("Error getting received invitations", {
      receiver_id: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error in getReceivedInvitations:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all pending invitations sent by the user
 * @route GET /api/invitations/sent
 * @access Private
 */
const getSentInvitations = async (req, res) => {
  try {
    const sender_id = req.user.id;
    const lang = req.headers["accept-language"] || req.user?.language || "ar";

    // Log request initiation
    logger.info("Get sent invitations request initiated", {
      sender_id,
      lang,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const invitations = await Invitation.findAll({
      where: { sender_id, status: "pending" },
      attributes: [
        "id",
        "status",
        "sent_date",
        "sender_id",
        "receiver_id",
        "group_id",
      ],
      include: [
        {
          model: Group,
          attributes: ["id", "group-name"],
        },
        {
          model: User,
          as: "receiver",
          attributes: ["id", "first-name", "last-name"],
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

    // Format result with faculty name from code
    const result = invitations.map((inv) => {
      const firstName = inv.receiver?.["first-name"] || "";
      const lastName = inv.receiver?.["last-name"] || "";
      const fullName = `${firstName} ${lastName}`.trim();

      // Convert faculty_code to faculty name
      const facultyName = getCollegeNameByCode(
        inv.receiver?.Graduate?.faculty_code,
        lang
      );

      return {
        invitationId: inv.id,
        status: inv.status,
        sent_date: inv.sent_date,
        sender_id: inv.sender_id,
        receiver_id: inv.receiver_id,
        group_id: inv.group_id,
        groupName: inv.Group ? inv.Group["group-name"] : null,
        receiverFullName: fullName,
        receiverFaculty: facultyName,
        receiverGraduationYear:
          inv.receiver?.Graduate?.["graduation-year"] || null,
        receiverProfilePicture:
          inv.receiver?.Graduate?.["profile-picture-url"] || null,
      };
    });

    // Log successful retrieval
    logger.info("Sent invitations retrieved successfully", {
      sender_id,
      invitationsCount: result.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json(result);
  } catch (err) {
    // Log error
    logger.error("Error getting sent invitations", {
      sender_id: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error in getSentInvitations:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Auto-send group invitation after graduate registration
 * @param {number} userId - Graduate user ID
 * @returns {Promise<boolean>} Success status
 */
/**
 * Auto-send group invitation after graduate registration
 * @param {number} userId - Graduate user ID
 * @returns {Promise<boolean>} Success status
 */
const sendAutoGroupInvitation = async (userId) => {
  try {
    console.log("\n" + "📨".repeat(30));
    console.log("📨 SEND AUTO GROUP INVITATION at:", new Date().toISOString());
    console.log("📨 User ID:", userId);
    console.log("📨".repeat(30));
    
    logger.info("Auto group invitation process started", {
      userId,
      timestamp: new Date().toISOString(),
    });

    // 📍 [1] GET GRADUATE DATA with null safety
    console.log("\n📍 [1] FETCHING GRADUATE DATA:");
    const graduate = await Graduate.findOne({
      where: { graduate_id: userId },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "national-id"],
        },
      ],
    });

    if (!graduate) {
      console.log("   ❌ Graduate not found");
      return false;
    }

    console.log("   ✅ Graduate found:");
    console.log(`      - User ID: ${userId}`);
    console.log(`      - Faculty Code: ${graduate.faculty_code || 'null'}`);
    console.log(`      - Graduation Year: ${graduate["graduation-year"] || 'null'}`);

    // 📍 [2] ENSURE FACULTY CODE
    if (!graduate.faculty_code) {
      console.log("\n📍 [2] FACULTY CODE IS NULL - TRYING TO FETCH FROM API");
      
      const nationalId = graduate.User?.getDataValue("national-id") || graduate.User?.["national-id"];
      
      if (nationalId) {
        try {
          const decrypted = aes.decryptNationalId(nationalId);
          if (decrypted) {
            console.log(`   - Decrypted national ID: ${decrypted.substring(0, 6)}****`);
            
            const apiUrl = `${process.env.GRADUATE_API_URL}?nationalId=${decrypted}`;
            console.log(`   - Calling: ${apiUrl}`);
            
            const response = await axios.get(apiUrl, { timeout: 5000 });
            
            if (response.data && response.data.faculty) {
              console.log("   ✅ Got fresh data from API:");
              console.log(`      - Faculty: ${response.data.faculty}`);
              console.log(`      - Department: ${response.data.department}`);
              
              const facultyCode = normalizeCollegeName(response.data.faculty);
              if (facultyCode) {
                graduate.faculty_code = facultyCode;
                graduate["graduation-year"] = response.data["graduation-year"] || graduate["graduation-year"];
                graduate.skills = response.data.department || graduate.skills;
                
                await graduate.save();
                console.log(`   ✅ Updated faculty_code to: ${facultyCode}`);
              }
            }
          }
        } catch (error) {
          console.log(`   ⚠️ Could not fetch from API: ${error.message}`);
        }
      }
      
      if (!graduate.faculty_code) {
        console.log("   ❌ Faculty code still null after API attempt");
        console.log("   ➡️ No invitation will be sent (waiting for faculty data)");
        
        logger.info("Faculty code null, skipping auto invitation", {
          userId,
          timestamp: new Date().toISOString(),
        });
        
        return false;
      }
    }

    // 📍 [3] FIND MATCHING GROUP
    console.log("\n📍 [3] FINDING MATCHING GROUP:");
    console.log(`   - Using faculty_code: "${graduate.faculty_code}"`);
    console.log(`   - graduationYear: ${graduate["graduation-year"]}`);

    const matchingGroup = await findMatchingGroup(
      graduate.faculty_code,
      graduate["graduation-year"]
    );

    if (!matchingGroup) {
      console.log("   ❌ NO MATCHING GROUP FOUND");
      console.log("   ➡️ No invitation sent (no group for this faculty)");
      
      logger.info("No matching group found for auto invitation", {
        userId,
        facultyCode: graduate.faculty_code,
        graduationYear: graduate["graduation-year"],
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    console.log("   ✅ MATCHING GROUP FOUND:");
    console.log(`      - Group ID: ${matchingGroup.id}`);
    console.log(`      - Group Name: ${matchingGroup["group-name"]}`);

    // 📍 [4] USE TRANSACTION FOR ALL CHECKS AND OPERATIONS
    console.log("\n📍 [4] CHECKING MEMBERSHIP AND INVITATION WITH TRANSACTION:");
    
    let invitation = null;
    let notification = null;
    let isAlreadyMember = false;
    let isAlreadyInvited = false;
    
    await sequelize.transaction(async (t) => {
      // Check membership inside transaction (using correct kebab-case)
      const facultyGroups = await Group.findAll({
  where: { faculty_code: graduate.faculty_code },
  attributes: ['id'],
  transaction: t,
});

const facultyGroupIds = facultyGroups.map(g => g.id);

const membership = facultyGroupIds.length > 0 
  ? await GroupMember.findOne({
      where: {
        'user-id': userId,
        'group-id': facultyGroupIds,
      },
      transaction: t,
    })
  : null;

      if (membership) {
        console.log("   ✅ User is already a member of this group");
        console.log("   ➡️ No invitation needed");
        isAlreadyMember = true;
        return;
      }

      // Check existing invitation inside transaction with FOR UPDATE
      const existingInvite = await Invitation.findOne({
        where: {
          sender_id: SYSTEM_USER_ID,
          receiver_id: userId,
          group_id: matchingGroup.id,
        },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (existingInvite) {
        console.log(`   ⚠️ Invitation already exists (ID: ${existingInvite.id})`);
        invitation = existingInvite;
        isAlreadyInvited = true;
        return;
      }

      // Create invitation
      invitation = await Invitation.create({
        sender_id: SYSTEM_USER_ID,
        receiver_id: userId,
        group_id: matchingGroup.id,
        status: "pending",
      }, { transaction: t });

      console.log(`   ✅ Invitation created with ID: ${invitation.id}`);

      // Create notification
      notification = await Notification.create({
        receiverId: userId,
        type: "added_to_group",
        message: `عزيزي الخريج، لديك دعوة للانضمام لمجموعة ${matchingGroup["group-name"]}`,
        navigation: {
          type: "invitation",
          invitationId: invitation.id,
          groupId: matchingGroup.id,
        },
      }, { transaction: t });

      console.log("   ✅ Notification created");
    });

    // If already member or invited, return early
    if (isAlreadyMember || isAlreadyInvited) {
      return true;
    }

    // 📍 [5] SEND REAL-TIME NOTIFICATION VIA SOCKET (WITH SAFETY GUARDS)
    console.log("\n📍 [5] SENDING REAL-TIME NOTIFICATION VIA SOCKET:");
    
    // Get correct notification ID
    const notificationId = notification?.notification_id || notification?.id || invitation?.id;
    
    const notificationData = {
      id: notificationId,
      receiverId: userId,
      senderId: SYSTEM_USER_ID,
      type: "added_to_group",
      message: `عزيزي الخريج، لديك دعوة للانضمام لمجموعة ${matchingGroup["group-name"]}`,
      isRead: false,
      createdAt: notification?.createdAt || new Date(),
      navigation: {
        type: "invitation",
        invitationId: invitation.id,
        groupId: matchingGroup.id,
      },
      sender: {
        id: SYSTEM_USER_ID,
        fullName: "Alumni Portal System",
        email: "system@alumni.com",
      },
    };

    // SAFE SOCKET EMIT with multiple guards
    try {
      if (global.chatSocket && 
          global.chatSocket.io && 
          global.chatSocket.connectedUsers &&
          global.chatSocket.connectedUsers instanceof Map) {
        
        const userSocketId = global.chatSocket.connectedUsers.get(userId);
        if (userSocketId) {
          global.chatSocket.io.to(`user_${userId}`).emit("new_notification", notificationData);
          console.log(`   ✅ Real-time notification sent to user ${userId}`);
        } else {
          console.log(`   ⚠️ User ${userId} is offline, notification saved in DB only`);
        }
      } else {
        console.log("   ⚠️ Socket not available, notification saved in DB only");
      }
    } catch (socketError) {
      console.error("   ⚠️ Socket emit failed:", socketError.message);
    }

    logger.info("Auto group invitation sent successfully", {
      userId,
      invitationId: invitation.id,
      groupId: matchingGroup.id,
      groupName: matchingGroup["group-name"],
      facultyCode: graduate.faculty_code,
      timestamp: new Date().toISOString(),
    });

    console.log("\n✅ AUTO INVITATION COMPLETED");
    console.log("📨".repeat(30) + "\n");

    return true;
  } catch (error) {
    console.error("❌ Error in sendAutoGroupInvitation:", error);
    logger.error("Error in sendAutoGroupInvitation", {
      userId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
};

/**
 * Check if auto-sent invitation exists for current user
 * @route GET /api/invitations/auto-sent
 * @access Private
 */
const getAutoSentInvitation = async (req, res) => {
  try {
    logger.info("Get auto-sent invitation request initiated", {
      userId: req.user.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const invitation = await Invitation.findOne({
      where: {
        sender_id: SYSTEM_USER_ID,
        receiver_id: req.user.id,
      },
      include: [
        {
          model: Group,
          attributes: ["id", "group-name"],
        },
      ],
    });

    if (!invitation) {
      logger.debug("No auto-sent invitation found", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.json({ invited: false, invitation: null });
    }

    logger.info("Auto-sent invitation found", {
      userId: req.user.id,
      invitationId: invitation.id,
      groupId: invitation.group_id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      invited: true,
      invitation: invitation,
    });
  } catch (error) {
    logger.error("Error fetching auto-sent invitation", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error fetching auto-sent invitation:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Export all functions
module.exports = {
  sendInvitation,
  acceptInvitation,
  deleteInvitation,
  cancelInvitation,
  getReceivedInvitations,
  sendAutoGroupInvitation,
  getSentInvitations,
  getAutoSentInvitation,
};

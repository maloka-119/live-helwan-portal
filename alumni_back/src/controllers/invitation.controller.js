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
const aes = require("../utils/aes");
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

    // 📍 [0] نشوف لو فيه invitation قبل كده
    console.log("\n📍 [0] CHECKING EXISTING INVITATIONS:");
    const existingInvitations = await Invitation.findAll({
      where: {
        receiver_id: userId,
        sender_id: 1  // من الادمن
      }
    });

    if (existingInvitations.length > 0) {
      console.log(`   ⚠️ Found ${existingInvitations.length} existing invitations:`);
      existingInvitations.forEach((inv, idx) => {
        console.log(`      - Invitation ${idx + 1}: ID=${inv.id}, GroupID=${inv.group_id}, Status=${inv.status}`);
      });
      console.log(`   ✅ Already invited before - skipping`);
      return true;  // أو false حسب المطلوب
    }

    console.log(`   ✅ No previous invitations found`);

    // 1. Get graduate data
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

    // 📌 لو faculty_code لسه null، نستنى أو نستخدم البيانات من external API
    if (!graduate.faculty_code) {
      console.log("\n📍 [2] FACULTY CODE IS NULL - CHECKING IF WE SHOULD WAIT");
      
      // نجيب الرقم القومي
      let nationalId = null;
      if (graduate.User && graduate.User["national-id"]) {
        const decrypted = aes.decryptNationalId(graduate.User["national-id"]);
        if (decrypted) {
          nationalId = decrypted;
          console.log(`   - Decrypted national ID: ${nationalId.substring(0, 6)}****`);
        }
      }

      if (nationalId) {
        console.log(`   - Trying to fetch fresh data from external API...`);
        
        try {
          // نحاول نجيب البيانات من external API
          const apiUrl = `${process.env.GRADUATE_API_URL}?nationalId=${nationalId}`;
          console.log(`   - Calling: ${apiUrl}`);
          
          const response = await axios.get(apiUrl, { timeout: 5000 });
          
          if (response.data && response.data.faculty) {
            console.log(`   ✅ Got fresh data from API:`);
            console.log(`      - Faculty: ${response.data.faculty}`);
            console.log(`      - Department: ${response.data.department}`);
            console.log(`      - Graduation Year: ${response.data["graduation-year"]}`);
            
            // تحديث البيانات
            const facultyCode = normalizeCollegeName(response.data.faculty);
            if (facultyCode) {
              graduate.faculty_code = facultyCode;
              graduate["graduation-year"] = response.data["graduation-year"] || graduate["graduation-year"];
              graduate.skills = response.data.department || graduate.skills;
              
              await graduate.save();
              console.log(`   ✅ Updated faculty_code to: ${facultyCode}`);
            }
          }
        } catch (error) {
          console.log(`   ⚠️ Could not fetch from API: ${error.message}`);
        }
      }
      
      // بعد المحاولة، لو لسه null، نوقف
      if (!graduate.faculty_code) {
        console.log(`   ❌ Faculty code still null after API attempt`);
        console.log(`   ➡️  No invitation will be sent (waiting for faculty data)`);
        
        logger.info("Faculty code null, skipping auto invitation", {
          userId,
          timestamp: new Date().toISOString(),
        });
        
        return false;
      }
    }

    // 2. Find matching group
    console.log("\n📍 [3] FINDING MATCHING GROUP:");
    console.log(`   - Using faculty_code: "${graduate.faculty_code}"`);
    console.log(`   - graduationYear: ${graduate["graduation-year"]}`);

    const matchingGroup = await findMatchingGroup(
      graduate.faculty_code,
      graduate["graduation-year"]
    );

    if (!matchingGroup) {
      console.log("   ❌ NO MATCHING GROUP FOUND");
      console.log(`   ➡️  No invitation sent (no group for this faculty)`);
      
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
    console.log(`      - Group Faculty Code: ${matchingGroup.faculty_code || 'null'}`);
    
    // اتأكد إن الجروب مش بياخد ناس من كلية تانية
    if (matchingGroup.faculty_code && matchingGroup.faculty_code !== graduate.faculty_code) {
      console.log(`   ⚠️ WARNING: Faculty code mismatch!`);
      console.log(`      - Group belongs to: ${matchingGroup.faculty_code}`);
      console.log(`      - Graduate belongs to: ${graduate.faculty_code}`);
      console.log(`   ❌ Will not send invitation to wrong faculty`);
      return false;
    }

    // نتأكد تاني (بعد ما لقينا الجروب) إن مفيش invitation قبل كده
    console.log("\n📍 [4] DOUBLE-CHECKING INVITATIONS:");
    const finalCheck = await Invitation.findOne({
      where: {
        sender_id: 1,
        receiver_id: userId,
        group_id: matchingGroup.id
      }
    });

    if (finalCheck) {
      console.log(`   ⚠️ Invitation already exists (ID: ${finalCheck.id})`);
      console.log(`   ✅ Already invited - skipping`);
      return true;
    }

    // 3. Create invitation
    console.log("\n📍 [5] CREATING INVITATION:");
    
    const invitation = await Invitation.create({
      sender_id: 1,
      receiver_id: userId,
      group_id: matchingGroup.id,
      status: "pending",
    });

    console.log(`   ✅ Invitation created with ID: ${invitation.id}`);

    // 4. Create notification
    console.log("\n📍 [6] CREATING NOTIFICATION:");
    
    await Notification.create({
      receiverId: userId,
      type: "added_to_group",
      message: `عزيزي الخريج، لديك دعوة للانضمام لمجموعة ${matchingGroup["group-name"]}`,
      navigation: {
        type: "invitation",
        invitationId: invitation.id,
        groupId: matchingGroup.id,
      },
    });

    console.log(`   ✅ Notification created`);

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
    // Log request initiation
    logger.info("Get auto-sent invitation request initiated", {
      userId: req.user.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Get invitation from admin (id=1) to current user
    const invitation = await Invitation.findOne({
      where: {
        sender_id: 1,
        receiver_id: req.user.id,
      },
      include: [
        {
          model: Group,
          attributes: ["id", "group-name"], // Add description if needed
        },
      ],
    });

    if (!invitation) {
      // Log no invitation found
      logger.debug("No auto-sent invitation found", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.json({ invited: false, invitation: null });
    }

    // Log successful retrieval
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
    // Log error
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

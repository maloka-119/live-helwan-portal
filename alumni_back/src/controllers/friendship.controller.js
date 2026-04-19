const { Op } = require("sequelize");
const Friendship = require("../models/Friendship");
const Graduate = require("../models/Graduate");
const User = require("../models/User");
const {
  notifyUserAdded,
  notifyRequestAccepted,
} = require("../services/notificationService");

// Import logger utilities
const { logger, securityLogger } = require("../utils/logger");

/**
 * Get friend suggestions for authenticated user
 * @route GET /api/friends/suggestions
 * @access Private (Graduates only)
 */
const viewSuggestions = async (req, res) => {
  try {
    // Log suggestion view initiation
    logger.info("View friend suggestions initiated", {
      userId: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const userId = req.user.id;

    const relations = await Friendship.findAll({
      where: {
        [Op.or]: [{ sender_id: userId }, { receiver_id: userId }],
      },
    });

    const relatedIds = relations.flatMap((r) => [r.sender_id, r.receiver_id]);

    const suggestions = await Graduate.findAll({
      where: {
        graduate_id: {
          [Op.notIn]: [...relatedIds, userId],
        },
        "status-to-login": "accepted",
      },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name"],
        },
      ],
    });

    const formatted = suggestions.map((g) => ({
      graduate_id: g.graduate_id,
      fullName: `${g.User["first-name"]} ${g.User["last-name"]}`,
      faculty: g.faculty,
      "profile-picture-url": g["profile-picture-url"],
    }));

    // Log successful retrieval
    logger.info("Friend suggestions retrieved successfully", {
      userId,
      suggestionCount: formatted.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json(formatted);
  } catch (err) {
    // Log error
    logger.error("Error viewing friend suggestions", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

/**
 * Send friend request to another graduate
 * @route POST /api/friends/request/:receiverId
 * @access Private (Graduates only)
 */
const sendRequest = async (req, res) => {
  try {
    // Log request initiation
    logger.info("Send friend request initiated", {
      userId: req.user?.id,
      receiverId: req.params.receiverId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const graduate = await Graduate.findOne({
      where: { graduate_id: req.user.id },
    });
    if (!graduate) {
      // Log missing graduate profile
      logger.warn("No graduate profile found for user", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ message: "No graduate profile found" });
    }

    const senderId = graduate.graduate_id;
    const { receiverId } = req.params;

    if (senderId == receiverId) {
      // Log security event for self-friending attempt
      securityLogger.warn("User attempted to add themselves as friend", {
        userId: senderId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({ message: "You cannot add yourself" });
    }

    const existing = await Friendship.findOne({
      where: {
        [Op.or]: [
          { sender_id: senderId, receiver_id: receiverId },
          { sender_id: receiverId, receiver_id: senderId },
        ],
      },
    });

    if (existing) {
      // Log existing request
      logger.warn("Friend request already exists", {
        senderId,
        receiverId,
        existingStatus: existing.status,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({ message: "Friend request already exists" });
    }

    const request = await Friendship.create({
      sender_id: senderId,
      receiver_id: receiverId,
      status: "pending",
    });

    const receiverGraduate = await Graduate.findOne({
      where: { graduate_id: receiverId },
      include: [{ model: User, attributes: ["first-name", "last-name"] }],
    });

    // Create notification for the receiver
    await notifyUserAdded(receiverId, senderId);

    // Log successful request
    logger.info("Friend request sent successfully", {
      senderId,
      receiverId,
      requestId: request.id,
      receiverName: `${receiverGraduate.User["first-name"]} ${receiverGraduate.User["last-name"]}`,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: "Request sent successfully",
      receiverFullName: `${receiverGraduate.User["first-name"]} ${receiverGraduate.User["last-name"]}`,
    });
  } catch (err) {
    // Log error
    logger.error("Error sending friend request", {
      userId: req.user?.id,
      receiverId: req.params.receiverId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

/**
 * Cancel a pending friend request sent by user
 * @route DELETE /api/friends/request/cancel/:receiverId
 * @access Private (Graduates only)
 */
const cancelRequest = async (req, res) => {
  try {
    // Log cancellation initiation
    logger.info("Cancel friend request initiated", {
      userId: req.user?.id,
      receiverId: req.params.receiverId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const graduate = await Graduate.findOne({
      where: { graduate_id: req.user.id },
    });
    if (!graduate) {
      // Log missing graduate profile
      logger.warn("Graduate profile not found for cancellation", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ message: "Graduate profile not found" });
    }

    const senderId = graduate.graduate_id;
    const { receiverId } = req.params;

    const result = await Friendship.destroy({
      where: {
        sender_id: senderId,
        receiver_id: receiverId,
        status: "pending",
      },
    });

    // Log cancellation result
    if (result > 0) {
      logger.info("Friend request canceled successfully", {
        senderId,
        receiverId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn("No pending friend request found to cancel", {
        senderId,
        receiverId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ message: "Request canceled" });
  } catch (err) {
    // Log error
    logger.error("Error canceling friend request", {
      userId: req.user?.id,
      receiverId: req.params.receiverId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

/**
 * View all pending friend requests for authenticated user
 * @route GET /api/friends/requests
 * @access Private (Graduates only)
 */
const viewRequests = async (req, res) => {
  try {
    // Log view requests initiation
    logger.info("View friend requests initiated", {
      userId: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const graduate = await Graduate.findOne({
      where: { graduate_id: req.user.id },
    });
    if (!graduate) {
      // Log missing graduate profile
      logger.warn("Graduate profile not found for viewing requests", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ message: "Graduate profile not found" });
    }

    const userId = graduate.graduate_id;

    const requests = await Friendship.findAll({
      where: {
        receiver_id: userId,
        status: "pending",
        hidden_for_receiver: false,
      },
      include: [
        {
          model: Graduate,
          as: "sender",
          include: [{ model: User, attributes: ["first-name", "last-name"] }],
        },
      ],
    });

    const formatted = requests.map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      fullName: `${r.sender.User["first-name"]} ${r.sender.User["last-name"]}`,
      profilePicture: r.sender["profile-picture-url"] || null,
    }));

    // Log successful retrieval
    logger.info("Friend requests retrieved successfully", {
      userId,
      requestCount: formatted.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json(formatted);
  } catch (err) {
    // Log error
    logger.error("Error viewing friend requests", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

/**
 * Confirm a pending friend request
 * @route PUT /api/friends/request/confirm/:senderId
 * @access Private (Graduates only)
 */
const confirmRequest = async (req, res) => {
  try {
    // Log confirmation initiation
    logger.info("Confirm friend request initiated", {
      userId: req.user?.id,
      senderId: req.params.senderId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const graduate = await Graduate.findOne({
      where: { graduate_id: req.user.id },
    });
    if (!graduate) {
      // Log missing graduate profile
      logger.warn("Graduate profile not found for confirming request", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ message: "Graduate profile not found" });
    }

    const receiverId = graduate.graduate_id;
    const { senderId } = req.params;

    const request = await Friendship.findOne({
      where: {
        sender_id: senderId,
        receiver_id: receiverId,
        status: "pending",
      },
    });

    if (!request) {
      // Log request not found
      logger.warn("Friend request not found for confirmation", {
        senderId,
        receiverId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({ message: "Request not found" });
    }

    request.status = "accepted";
    request.updated_at = new Date();
    await request.save();

    const senderGraduate = await Graduate.findOne({
      where: { graduate_id: senderId },
      include: [{ model: User, attributes: ["first-name", "last-name"] }],
    });

    // Create notification for the sender (who sent the original request)
    await notifyRequestAccepted(senderId, receiverId);

    // Log successful confirmation
    logger.info("Friend request confirmed successfully", {
      senderId,
      receiverId,
      requestId: request.id,
      senderName: `${senderGraduate.User["first-name"]} ${senderGraduate.User["last-name"]}`,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: "Friend request accepted",
      friendFullName: `${senderGraduate.User["first-name"]} ${senderGraduate.User["last-name"]}`,
    });
  } catch (err) {
    // Log error
    logger.error("Error confirming friend request", {
      userId: req.user?.id,
      senderId: req.params.senderId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

/**
 * Hide a friend request (soft delete for receiver)
 * @route DELETE /api/friends/request/hide/:senderId
 * @access Private (Graduates only)
 */
const deleteFromMyRequests = async (req, res) => {
  try {
    // Log hide initiation
    logger.info("Delete from my requests initiated", {
      userId: req.user?.id,
      senderId: req.params.senderId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const graduate = await Graduate.findOne({
      where: { graduate_id: req.user.id },
    });
    if (!graduate) {
      // Log missing graduate profile
      logger.warn("Graduate profile not found for deleting request", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ message: "Graduate profile not found" });
    }

    const receiverId = graduate.graduate_id;
    const { senderId } = req.params;

    const result = await Friendship.update(
      { hidden_for_receiver: true },
      {
        where: {
          sender_id: senderId,
          receiver_id: receiverId,
          status: "pending",
        },
      }
    );

    // Log hide result
    if (result[0] > 0) {
      logger.info("Friend request hidden successfully", {
        senderId,
        receiverId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn("No pending friend request found to hide", {
        senderId,
        receiverId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ message: "Request hidden for receiver" });
  } catch (err) {
    // Log error
    logger.error("Error hiding friend request", {
      userId: req.user?.id,
      senderId: req.params.senderId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

/**
 * View all confirmed friends for authenticated user
 * @route GET /api/friends/list
 * @access Private (Graduates only)
 */
const viewFriends = async (req, res) => {
  try {
    // Log view friends initiation
    logger.info("View friends initiated", {
      userId: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const graduate = await Graduate.findOne({
      where: { graduate_id: req.user.id },
    });
    if (!graduate) {
      // Log missing graduate profile
      logger.warn("Graduate profile not found for viewing friends", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ message: "Graduate profile not found" });
    }

    const userId = graduate.graduate_id;

    const friends = await Friendship.findAll({
      where: {
        status: "accepted",
        [Op.or]: [{ sender_id: userId }, { receiver_id: userId }],
      },
      include: [
        { model: Graduate, as: "sender", include: [{ model: User }] },
        { model: Graduate, as: "receiver", include: [{ model: User }] },
      ],
    });

    const formatted = friends.map((f) => {
      const friend = f.sender_id === userId ? f.receiver : f.sender;
      return {
        friendId: friend.graduate_id,
        fullName: `${friend.User["first-name"]} ${friend.User["last-name"]}`,
        faculty: friend.faculty,
        profilePicture: friend["profile-picture-url"],
      };
    });

    // Log successful retrieval
    logger.info("Friends list retrieved successfully", {
      userId,
      friendCount: formatted.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json(formatted);
  } catch (err) {
    // Log error
    logger.error("Error viewing friends", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

/**
 * Remove a friend from friends list
 * @route DELETE /api/friends/:friendId
 * @access Private (Graduates only)
 */
const deleteFriend = async (req, res) => {
  try {
    // Log delete friend initiation
    logger.info("Delete friend initiated", {
      userId: req.user?.id,
      friendId: req.params.friendId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const graduate = await Graduate.findOne({
      where: { graduate_id: req.user.id },
    });
    if (!graduate) {
      // Log missing graduate profile
      logger.warn("Graduate profile not found for deleting friend", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ message: "Graduate profile not found" });
    }

    const userId = graduate.graduate_id;
    const { friendId } = req.params;

    const result = await Friendship.destroy({
      where: {
        status: "accepted",
        [Op.or]: [
          { sender_id: userId, receiver_id: friendId },
          { sender_id: friendId, receiver_id: userId },
        ],
      },
    });

    // Log delete result
    if (result > 0) {
      logger.info("Friend deleted successfully", {
        userId,
        friendId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn("No friendship found to delete", {
        userId,
        friendId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ message: "Friend deleted successfully" });
  } catch (err) {
    // Log error
    logger.error("Error deleting friend", {
      userId: req.user?.id,
      friendId: req.params.friendId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get sent friend requests (people you've sent requests to)
 * @route GET /api/friends/requests/sent
 * @access Private (Graduates only)
 */
const viewSentRequests = async (req, res) => {
  try {
    // Log view sent requests initiation
    logger.info("View sent friend requests initiated", {
      userId: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user)
      return res.status(401).json({ message: "User not authenticated" });

    const graduate = await Graduate.findOne({
      where: { graduate_id: req.user.id },
    });

    if (!graduate) {
      logger.warn("Graduate profile not found for viewing sent requests", {
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ message: "Graduate profile not found" });
    }

    const senderId = graduate.graduate_id;

    // Get all pending requests sent by this user
    const sentRequests = await Friendship.findAll({
      where: {
        sender_id: senderId,
        status: "pending",
      },
      include: [
        {
          model: Graduate,
          as: "receiver", // Because in Friendship model, receiver is the person who got the request
          include: [
            {
              model: User,
              attributes: ["first-name", "last-name"],
            },
          ],
        },
      ],
    });

    const formatted = sentRequests.map((request) => ({
      id: request.id,
      receiverId: request.receiver_id,
      fullName: `${request.receiver.User["first-name"]} ${request.receiver.User["last-name"]}`,
      profilePicture: request.receiver["profile-picture-url"] || null,
      faculty: request.receiver.faculty,
      sentAt: request.created_at,
    }));

    // Log successful retrieval
    logger.info("Sent friend requests retrieved successfully", {
      userId: senderId,
      sentRequestsCount: formatted.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json(formatted);
  } catch (err) {
    // Log error
    logger.error("Error viewing sent friend requests", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  viewSuggestions,
  sendRequest,
  cancelRequest,
  viewRequests,
  confirmRequest,
  deleteFromMyRequests,
  viewFriends,
  deleteFriend,
  viewSentRequests,
};

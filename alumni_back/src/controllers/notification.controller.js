const Notification = require("../models/Notification");
const User = require("../models/User");
const HttpStatusHelper = require("../utils/HttpStatuHelper");
const { Op } = require("sequelize");

// Import logger utilities
const { logger, securityLogger } = require("../utils/logger");

/**
 * Get all notifications for the current user
 * @route GET /alumni-portal/notifications
 * @access Private
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    // Log request initiation
    logger.info("Get notifications request initiated", {
      userId,
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === "true",
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = {
      receiverId: userId,
    };

    if (unreadOnly === "true") {
      whereClause.isRead = false;
    }

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["id", "first-name", "last-name", "email"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: offset,
    });

    const formattedNotifications = notifications.map((notification) => ({
      id: notification.notification_id,
      receiverId: notification.receiverId,
      senderId: notification.senderId,
      type: notification.type,
      message: notification.message,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      navigation: notification.navigation,
      sender: notification.sender
        ? {
            id: notification.sender.id,
            fullName: `${notification.sender["first-name"]} ${notification.sender["last-name"]}`,
            email: notification.sender.email,
          }
        : null,
    }));

    // Log successful retrieval
    logger.info("Notifications retrieved successfully", {
      userId,
      totalNotifications: count,
      returnedNotifications: formattedNotifications.length,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
      hasUnreadFilter: unreadOnly === "true",
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Notifications fetched successfully",
      data: formattedNotifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalNotifications: count,
        hasMore: offset + notifications.length < count,
      },
    });
  } catch (error) {
    // Log error
    logger.error("Error fetching notifications", {
      userId: req.user?.id,
      page: req.query.page,
      limit: req.query.limit,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Failed to fetch notifications: " + error.message,
    });
  }
};

/**
 * Get unread notifications count
 * @route GET /alumni-portal/notifications/unread-count
 * @access Private
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Log request initiation
    logger.info("Get unread notifications count request initiated", {
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const unreadCount = await Notification.count({
      where: {
        receiverId: userId,
        isRead: false,
      },
    });

    // Log successful retrieval
    logger.info("Unread notifications count retrieved", {
      userId,
      unreadCount,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Unread count fetched successfully",
      data: {
        unreadCount,
      },
    });
  } catch (error) {
    // Log error
    logger.error("Error fetching unread notifications count", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error fetching unread count:", error);
    res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Failed to fetch unread count: " + error.message,
    });
  }
};

/**
 * Mark a notification as read
 * @route PUT /alumni-portal/notifications/:notificationId/read
 * @access Private
 */
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    // Log request initiation
    logger.info("Mark notification as read request initiated", {
      userId,
      notificationId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const notification = await Notification.findOne({
      where: {
        notification_id: notificationId,
        receiverId: userId,
      },
    });

    if (!notification) {
      // Log not found
      logger.warn("Notification not found for marking as read", {
        userId,
        notificationId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Notification not found",
      });
    }

    const wasRead = notification.isRead;
    notification.isRead = true;
    await notification.save();

    // Log successful update
    logger.info("Notification marked as read successfully", {
      userId,
      notificationId,
      notificationType: notification.type,
      wasRead,
      nowRead: notification.isRead,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Notification marked as read",
      data: {
        id: notification.notification_id,
        isRead: notification.isRead,
      },
    });
  } catch (error) {
    // Log error
    logger.error("Error marking notification as read", {
      userId: req.user?.id,
      notificationId: req.params.notificationId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Failed to mark notification as read: " + error.message,
    });
  }
};

/**
 * Mark all notifications as read
 * @route PUT /alumni-portal/notifications/read-all
 * @access Private
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    // Log request initiation
    logger.info("Mark all notifications as read request initiated", {
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const [updatedCount] = await Notification.update(
      { isRead: true },
      {
        where: {
          receiverId: userId,
          isRead: false,
        },
      }
    );

    // Log successful update
    logger.info("All notifications marked as read successfully", {
      userId,
      updatedCount,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "All notifications marked as read",
      data: {
        updatedCount,
      },
    });
  } catch (error) {
    // Log error
    logger.error("Error marking all notifications as read", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Failed to mark all notifications as read: " + error.message,
    });
  }
};

/**
 * Delete a notification
 * @route DELETE /alumni-portal/notifications/:notificationId
 * @access Private
 */
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    // Log request initiation
    logger.info("Delete notification request initiated", {
      userId,
      notificationId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const notification = await Notification.findOne({
      where: {
        notification_id: notificationId,
        receiverId: userId,
      },
    });

    if (!notification) {
      // Log not found
      logger.warn("Notification not found for deletion", {
        userId,
        notificationId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Notification not found",
      });
    }

    // Save notification info before deletion
    const notificationInfo = {
      id: notification.notification_id,
      type: notification.type,
      message: notification.message.substring(0, 100) + "...", // First 100 chars only
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    };

    await notification.destroy();

    // Log successful deletion
    logger.info("Notification deleted successfully", {
      userId,
      notificationId,
      notificationInfo,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    // Log error
    logger.error("Error deleting notification", {
      userId: req.user?.id,
      notificationId: req.params.notificationId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error deleting notification:", error);
    res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Failed to delete notification: " + error.message,
    });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

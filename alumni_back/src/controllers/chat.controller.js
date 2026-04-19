const {
  Chat,
  Message,
  User,
  UserPresence,
  UserBlock,
  ChatReport,
} = require("../models");
const { Op } = require("sequelize");
const asyncHandler = require("express-async-handler");
const rateLimit = require("express-rate-limit");
const MessageStatusService = require("../services/messageStatusService");
const PresenceService = require("../services/presenceService");
const RateLimitService = require("../services/rateLimitService");
const ModerationService = require("../services/moderationService");
const { notifyMessageReceived } = require("../services/notificationService");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

/**
 * Rate limiting configuration for message sending
 * Limits: 30 messages per minute per user
 */
const messageRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: {
    status: "error",
    message: "Too many messages sent. Please slow down.",
  },
});

/**
 * Rate limiting configuration for file uploads
 * Limits: 10 uploads per 5 minutes per user
 */
const uploadRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 uploads per 5 minutes
  message: {
    status: "error",
    message: "Too many file uploads. Please wait before uploading more files.",
  },
});

/**
 * Cloudinary storage configuration for chat attachments
 * Supports images, documents, audio and video files
 */
const chatStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "chat-attachments",
    allowed_formats: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "pdf",
      "doc",
      "docx",
      "txt",
      "mp4",
      "mp3",
      "wav",
    ],
    resource_type: "auto",
    transformation: [
      { width: 1000, height: 1000, crop: "limit" }, // Resize large images
    ],
  },
});

/**
 * Multer configuration for chat file uploads
 * Handles file validation, size limits, and type filtering
 */
const chatUpload = multer({
  storage: chatStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1, // One file per upload
  },
  fileFilter: (req, file, cb) => {
    // Define allowed file types with their MIME types
    const allowedTypes = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "application/pdf": "pdf",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "docx",
      "text/plain": "txt",
      "video/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
    };

    if (allowedTypes[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error("File type not supported"), false);
    }
  },
});

/**
 * Get or create a chat conversation between two users
 * @route POST /alumni-portal/chat/conversation
 * @access Private
 */
const getOrCreateChat = asyncHandler(async (req, res) => {
  const { otherUserId } = req.body;
  const currentUserId = req.user.id;

  // Prevent self-chat creation
  if (currentUserId === otherUserId) {
    return res.status(400).json({
      status: "error",
      message: "Cannot create chat with yourself",
    });
  }

  // Verify the other user exists
  const otherUser = await User.findByPk(otherUserId);
  if (!otherUser) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  // Check if either user has blocked the other
  const isBlocked = await UserBlock.findOne({
    where: {
      [Op.or]: [
        { blocker_id: currentUserId, blocked_id: otherUserId },
        { blocker_id: otherUserId, blocked_id: currentUserId },
      ],
    },
  });

  if (isBlocked) {
    return res.status(403).json({
      status: "error",
      message: "Cannot start conversation with this user",
    });
  }

  // Find existing chat or create a new one
  let chat = await Chat.findOne({
    where: {
      [Op.or]: [
        { user1_id: currentUserId, user2_id: otherUserId },
        { user1_id: otherUserId, user2_id: currentUserId },
      ],
    },
    include: [
      {
        model: User,
        as: "user1",
        attributes: ["id", "first-name", "last-name", "email", "user-type"],
      },
      {
        model: User,
        as: "user2",
        attributes: ["id", "first-name", "last-name", "email", "user-type"],
      },
      {
        model: Message,
        as: "lastMessage",
        include: [
          {
            model: User,
            as: "sender",
            attributes: ["id", "first-name", "last-name"],
          },
        ],
      },
    ],
  });

  // Create new chat if none exists
  if (!chat) {
    chat = await Chat.create({
      user1_id: currentUserId,
      user2_id: otherUserId,
    });

    // Fetch the created chat with associations
    chat = await Chat.findByPk(chat.chat_id, {
      include: [
        {
          model: User,
          as: "user1",
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
        },
        {
          model: User,
          as: "user2",
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
        },
      ],
    });
  }

  res.status(200).json({
    status: "success",
    data: chat,
  });
});

/**
 * Get list of all chats for the authenticated user
 * @route GET /alumni-portal/chat/conversations
 * @access Private
 */
const getChatList = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const chats = await Chat.findAll({
    where: {
      [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
      is_active: true,
    },
    include: [
      {
        model: User,
        as: "user1",
        attributes: ["id", "first-name", "last-name", "email", "user-type"],
      },
      {
        model: User,
        as: "user2",
        attributes: ["id", "first-name", "last-name", "email", "user-type"],
      },
      {
        model: Message,
        as: "lastMessage",
        include: [
          {
            model: User,
            as: "sender",
            attributes: ["id", "first-name", "last-name"],
          },
        ],
      },
    ],
    order: [["last_message_at", "DESC"]],
  });

  // Format response to highlight the other user's information
  const formattedChats = chats.map((chat) => {
    const otherUser = chat.user1_id === userId ? chat.user2 : chat.user1;
    const unreadCount =
      chat.user1_id === userId
        ? chat.user1_unread_count
        : chat.user2_unread_count;

    return {
      chat_id: chat.chat_id,
      other_user: {
        id: otherUser.id,
        name: `${otherUser["first-name"]} ${otherUser["last-name"]}`,
        email: otherUser.email,
        user_type: otherUser["user-type"],
      },
      last_message: chat.lastMessage,
      last_message_at: chat.last_message_at,
      unread_count: unreadCount,
      created_at: chat["created-at"],
    };
  });

  res.status(200).json({
    status: "success",
    data: formattedChats,
  });
});

/**
 * Get paginated messages for a specific chat
 * @route GET /alumni-portal/chat/:chatId/messages
 * @access Private
 */
const getChatMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const userId = req.user.id;
  const { page = 1, limit = 50, search } = req.query;

  // Verify user has access to this chat
  const chat = await Chat.findOne({
    where: {
      chat_id: chatId,
      [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
    },
  });

  if (!chat) {
    return res.status(404).json({
      status: "error",
      message: "Chat not found or access denied",
    });
  }

  // Build where clause with optional search filter
  let whereClause = {
    chat_id: chatId,
    is_deleted: false,
  };

  if (search) {
    whereClause.content = {
      [Op.iLike]: `%${search}%`,
    };
  }

  const offset = (page - 1) * limit;

  const messages = await Message.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: User,
        as: "receiver",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: Message,
        as: "replyTo",
        required: false,
        include: [
          {
            model: User,
            as: "sender",
            attributes: ["id", "first-name", "last-name", "email"],
          },
        ],
        attributes: [
          "message_id",
          "content",
          "sender_id",
          "message_type",
          "attachment_url",
          "attachment_name",
          "is_deleted",
          "created-at",
        ],
      },
    ],
    order: [["created-at", "DESC"]],
    limit: parseInt(limit),
    offset: offset,
  });

  // Mark messages as delivered when receiver views them
  if (messages.rows.length > 0) {
    await Message.update(
      { status: "delivered" },
      {
        where: {
          chat_id: chatId,
          receiver_id: userId,
          status: "sent",
        },
      }
    );
  }

  res.status(200).json({
    status: "success",
    data: {
      messages: messages.rows.reverse(), // Reverse to show oldest first
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(messages.count / limit),
        total_messages: messages.count,
        has_next: offset + messages.rows.length < messages.count,
        has_prev: page > 1,
      },
    },
  });
});

/**
 * Send a text message in a chat
 * @route POST /alumni-portal/chat/:chatId/messages
 * @access Private
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  // Accept both reply_to_id and reply_to_message_id for compatibility
  const { content, reply_to_message_id, reply_to_id } = req.body;
  const replyToMessageId = reply_to_message_id || reply_to_id || null;
  const senderId = req.user.id;

  // Verify user has access to this chat
  const chat = await Chat.findOne({
    where: {
      chat_id: chatId,
      [Op.or]: [{ user1_id: senderId }, { user2_id: senderId }],
    },
  });

  if (!chat) {
    return res.status(404).json({
      status: "error",
      message: "Chat not found or access denied",
    });
  }

  // Determine the receiver
  const receiverId = chat.user1_id === senderId ? chat.user2_id : chat.user1_id;

  // Check if sender is blocked by receiver
  const isBlocked = await UserBlock.findOne({
    where: {
      blocker_id: receiverId,
      blocked_id: senderId,
    },
  });

  if (isBlocked) {
    return res.status(403).json({
      status: "error",
      message: "Cannot send message to this user",
    });
  }

  // Create the message
  const message = await Message.create({
    chat_id: chatId,
    sender_id: senderId,
    receiver_id: receiverId,
    content: content,
    message_type: "text",
    reply_to_message_id: replyToMessageId,
  });

  // Update chat with last message information
  await chat.update({
    last_message_id: message.message_id,
    last_message_at: new Date(),
    [`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`]:
      chat[`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`] + 1,
  });

  // Fetch message with all associations for response
  const messageWithDetails = await Message.findByPk(message.message_id, {
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: User,
        as: "receiver",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: Message,
        as: "replyTo",
        required: false,
        include: [
          {
            model: User,
            as: "sender",
            attributes: ["id", "first-name", "last-name", "email"],
          },
        ],
        attributes: [
          "message_id",
          "content",
          "sender_id",
          "message_type",
          "attachment_url",
          "attachment_name",
          "is_deleted",
          "created-at",
        ],
      },
    ],
  });

  // Create notification for the receiver
  await notifyMessageReceived(receiverId, senderId, chatId);

  // Emit socket events for real-time updates
  if (global.chatSocket) {
    // Emit to the chat room
    global.chatSocket.io
      .to(`chat_${chatId}`)
      .emit("new_message", messageWithDetails);

    // Send to receiver's personal room as fallback
    const receiverSocketId = global.chatSocket.connectedUsers.get(receiverId);
    if (receiverSocketId) {
      await Message.update(
        { status: "delivered" },
        { where: { message_id: messageWithDetails.message_id } }
      );
      global.chatSocket.io
        .to(`user_${receiverId}`)
        .emit("new_message", messageWithDetails);
    }

    // Update chat lists for both users
    global.chatSocket.io.to(`user_${senderId}`).emit("chat_updated", {
      chatId: chatId,
      lastMessage: messageWithDetails,
      unreadCount:
        chat[`user${chat.user1_id === senderId ? "1" : "2"}_unread_count`],
    });

    if (receiverSocketId) {
      global.chatSocket.io.to(`user_${receiverId}`).emit("chat_updated", {
        chatId: chatId,
        lastMessage: messageWithDetails,
        unreadCount:
          chat[`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`],
      });
    }
  }

  res.status(201).json({
    status: "success",
    data: messageWithDetails,
  });
});

/**
 * Mark all messages in a chat as read
 * @route PUT /alumni-portal/chat/:chatId/read
 * @access Private
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const userId = req.user.id;

  // Verify user has access to this chat
  const chat = await Chat.findOne({
    where: {
      chat_id: chatId,
      [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
    },
  });

  if (!chat) {
    return res.status(404).json({
      status: "error",
      message: "Chat not found or access denied",
    });
  }

  // Mark all undelivered/unsent messages as read
  await Message.update(
    { status: "read" },
    {
      where: {
        chat_id: chatId,
        receiver_id: userId,
        status: { [Op.in]: ["sent", "delivered"] },
      },
    }
  );

  // Reset unread count for this user
  const unreadField =
    chat.user1_id === userId ? "user1_unread_count" : "user2_unread_count";
  await chat.update({
    [unreadField]: 0,
  });

  res.status(200).json({
    status: "success",
    message: "Messages marked as read",
  });
});

/**
 * Edit an existing message
 * @route PUT /alumni-portal/chat/messages/:messageId
 * @access Private
 */
const editMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { content } = req.body;
  const userId = req.user.id;

  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Chat,
        where: {
          [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
        },
      },
    ],
  });

  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found or access denied",
    });
  }

  // Verify user owns this message
  if (message.sender_id !== userId) {
    return res.status(403).json({
      status: "error",
      message: "You can only edit your own messages",
    });
  }

  // Update message content
  await message.update({
    content: content,
    is_edited: true,
    edited_at: new Date(),
  });

  // Fetch updated message with all associations
  const updatedMessage = await Message.findByPk(messageId, {
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: User,
        as: "receiver",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: Message,
        as: "replyTo",
        include: [
          {
            model: User,
            as: "sender",
            attributes: ["id", "first-name", "last-name"],
          },
        ],
      },
    ],
  });

  // Get chat to determine receiver
  const chat = await Chat.findByPk(message.chat_id);
  const receiverId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;

  // Emit socket events for real-time update
  if (global.chatSocket) {
    global.chatSocket.io
      .to(`chat_${message.chat_id}`)
      .emit("message_edited", updatedMessage);
    global.chatSocket.io
      .to(`user_${userId}`)
      .emit("message_edited", updatedMessage);

    const receiverSocketId = global.chatSocket.connectedUsers.get(receiverId);
    if (receiverSocketId) {
      global.chatSocket.io
        .to(`user_${receiverId}`)
        .emit("message_edited", updatedMessage);
    }
  }

  res.status(200).json({
    status: "success",
    data: updatedMessage,
  });
});

/**
 * Soft delete a message
 * @route DELETE /alumni-portal/chat/messages/:messageId
 * @access Private
 */
const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id;

  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Chat,
        where: {
          [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
        },
      },
    ],
  });

  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found or access denied",
    });
  }

  // Verify user owns this message
  if (message.sender_id !== userId) {
    return res.status(403).json({
      status: "error",
      message: "You can only delete your own messages",
    });
  }

  // Soft delete the message
  await message.update({
    is_deleted: true,
    deleted_at: new Date(),
    content: "[Message deleted]",
  });

  res.status(200).json({
    status: "success",
    message: "Message deleted successfully",
  });
});

/**
 * Block another user
 * @route POST /alumni-portal/chat/block
 * @access Private
 */
const blockUser = asyncHandler(async (req, res) => {
  const { userId: blockedUserId, reason } = req.body;
  const blockerId = req.user.id;

  // Prevent self-blocking
  if (blockerId === blockedUserId) {
    return res.status(400).json({
      status: "error",
      message: "Cannot block yourself",
    });
  }

  // Verify user exists
  const blockedUser = await User.findByPk(blockedUserId);
  if (!blockedUser) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  // Check if already blocked
  const existingBlock = await UserBlock.findOne({
    where: {
      blocker_id: blockerId,
      blocked_id: blockedUserId,
    },
  });

  if (existingBlock) {
    return res.status(400).json({
      status: "error",
      message: "User is already blocked",
    });
  }

  // Create block record
  const block = await UserBlock.create({
    blocker_id: blockerId,
    blocked_id: blockedUserId,
    reason: reason,
  });

  // Deactivate any existing chat
  await Chat.update(
    { is_active: false },
    {
      where: {
        [Op.or]: [
          { user1_id: blockerId, user2_id: blockedUserId },
          { user1_id: blockedUserId, user2_id: blockerId },
        ],
      },
    }
  );

  res.status(201).json({
    status: "success",
    message: "User blocked successfully",
    data: block,
  });
});

/**
 * Unblock a previously blocked user
 * @route DELETE /alumni-portal/chat/block/:userId
 * @access Private
 */
const unblockUser = asyncHandler(async (req, res) => {
  const { userId: blockedUserId } = req.params;
  const blockerId = req.user.id;

  const block = await UserBlock.findOne({
    where: {
      blocker_id: blockerId,
      blocked_id: blockedUserId,
    },
  });

  if (!block) {
    return res.status(404).json({
      status: "error",
      message: "User is not blocked",
    });
  }

  await block.destroy();

  res.status(200).json({
    status: "success",
    message: "User unblocked successfully",
  });
});

/**
 * Report a user or specific message
 * @route POST /alumni-portal/chat/report
 * @access Private
 */
const reportUser = asyncHandler(async (req, res) => {
  const { reportedUserId, chatId, messageId, reason, description } = req.body;
  const reporterId = req.user.id;

  // Prevent self-reporting
  if (reporterId === reportedUserId) {
    return res.status(400).json({
      status: "error",
      message: "Cannot report yourself",
    });
  }

  // Verify reported user exists
  const reportedUser = await User.findByPk(reportedUserId);
  if (!reportedUser) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  // Create report record
  const report = await ChatReport.create({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    chat_id: chatId || null,
    message_id: messageId || null,
    reason: reason,
    description: description,
  });

  res.status(201).json({
    status: "success",
    message: "Report submitted successfully",
    data: report,
  });
});

/**
 * Get list of users blocked by the authenticated user
 * @route GET /alumni-portal/chat/blocked
 * @access Private
 */
const getBlockedUsers = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const blockedUsers = await UserBlock.findAll({
    where: { blocker_id: userId },
    include: [
      {
        model: User,
        as: "blocked",
        attributes: ["id", "first-name", "last-name", "email", "user-type"],
      },
    ],
  });

  res.status(200).json({
    status: "success",
    data: blockedUsers,
  });
});

/**
 * Get presence status of a user
 * @route GET /alumni-portal/chat/presence/:userId
 * @access Private
 */
const getUserPresence = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;

  // Verify users have a chat relationship (privacy measure)
  const chat = await Chat.findOne({
    where: {
      [Op.or]: [
        { user1_id: currentUserId, user2_id: userId },
        { user1_id: userId, user2_id: currentUserId },
      ],
    },
  });

  if (!chat) {
    return res.status(403).json({
      status: "error",
      message: "Cannot view presence of users you have not chatted with",
    });
  }

  const presence = await UserPresence.findOne({
    where: { user_id: userId },
    include: [
      {
        model: User,
        attributes: ["id", "first-name", "last-name", "email"],
      },
    ],
  });

  if (!presence) {
    return res.status(404).json({
      status: "error",
      message: "User presence not found",
    });
  }

  res.status(200).json({
    status: "success",
    data: presence,
  });
});

/**
 * Get list of currently online users
 * @route GET /alumni-portal/chat/online-users
 * @access Private
 */
const getOnlineUsers = asyncHandler(async (req, res) => {
  const onlineUsers = await UserPresence.findAll({
    where: { status: "online" },
    include: [
      {
        model: User,
        attributes: ["id", "first-name", "last-name", "email", "user-type"],
      },
    ],
    order: [["last_seen", "DESC"]],
  });

  res.status(200).json({
    status: "success",
    data: onlineUsers,
  });
});

/**
 * Get unread message counts for all user's chats
 * @route GET /alumni-portal/chat/unread-counts
 * @access Private
 */
const getUnreadCounts = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const chats = await Chat.findAll({
    where: {
      [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
      is_active: true,
    },
  });

  const unreadCounts = {};
  let totalUnread = 0;

  // Calculate unread counts per chat and total
  for (const chat of chats) {
    const unreadCount =
      chat.user1_id === userId
        ? chat.user1_unread_count
        : chat.user2_unread_count;
    unreadCounts[chat.chat_id] = unreadCount;
    totalUnread += unreadCount;
  }

  res.status(200).json({
    status: "success",
    data: {
      byChat: unreadCounts,
      total: totalUnread,
    },
  });
});

/**
 * Search messages within a specific chat
 * @route GET /alumni-portal/chat/:chatId/search
 * @access Private
 */
const searchMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { q, page = 1, limit = 20 } = req.query;
  const userId = req.user.id;

  // Validate search query
  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      status: "error",
      message: "Search query must be at least 2 characters long",
    });
  }

  // Verify user has access to this chat
  const chat = await Chat.findOne({
    where: {
      chat_id: chatId,
      [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
    },
  });

  if (!chat) {
    return res.status(404).json({
      status: "error",
      message: "Chat not found or access denied",
    });
  }

  const offset = (page - 1) * limit;

  // Search messages with pagination
  const messages = await Message.findAndCountAll({
    where: {
      chat_id: chatId,
      content: {
        [Op.iLike]: `%${q.trim()}%`,
      },
      is_deleted: false,
    },
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: User,
        as: "receiver",
        attributes: ["id", "first-name", "last-name", "email"],
      },
    ],
    order: [["created-at", "DESC"]],
    limit: parseInt(limit),
    offset: offset,
  });

  res.status(200).json({
    status: "success",
    data: {
      messages: messages.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(messages.count / limit),
        total_messages: messages.count,
        has_next: offset + messages.rows.length < messages.count,
        has_prev: page > 1,
      },
      query: q,
    },
  });
});

/**
 * Get message statistics for the authenticated user
 * @route GET /alumni-portal/chat/stats
 * @access Private
 */
const getMessageStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Aggregate message counts by status
  const stats = await Message.findAll({
    where: {
      [Op.or]: [{ sender_id: userId }, { receiver_id: userId }],
    },
    attributes: [
      "status",
      [
        Message.sequelize.fn("COUNT", Message.sequelize.col("message_id")),
        "count",
      ],
    ],
    group: ["status"],
    raw: true,
  });

  const result = {
    sent: 0,
    delivered: 0,
    read: 0,
    total: 0,
  };

  stats.forEach((stat) => {
    result[stat.status] = parseInt(stat.count);
    result.total += parseInt(stat.count);
  });

  res.status(200).json({
    status: "success",
    data: result,
  });
});

/**
 * Get moderation dashboard statistics (Admin only)
 * @route GET /alumni-portal/chat/moderation/dashboard
 * @access Admin
 */
const getModerationDashboard = asyncHandler(async (req, res) => {
  // Verify admin access
  if (req.user["user-type"] !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Admin access required",
    });
  }

  // Fetch moderation statistics
  const [
    totalReports,
    pendingReports,
    resolvedReports,
    totalBlocks,
    recentReports,
  ] = await Promise.all([
    ChatReport.count(),
    ChatReport.count({ where: { status: "pending" } }),
    ChatReport.count({ where: { status: "resolved" } }),
    UserBlock.count(),
    ChatReport.findAll({
      limit: 10,
      order: [["created-at", "DESC"]],
      include: [
        {
          model: User,
          as: "reporter",
          attributes: ["id", "first-name", "last-name"],
        },
        {
          model: User,
          as: "reportedUser",
          attributes: ["id", "first-name", "last-name"],
        },
      ],
    }),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      stats: {
        totalReports,
        pendingReports,
        resolvedReports,
        totalBlocks,
      },
      recentReports,
    },
  });
});

/**
 * Update report status (Admin only)
 * @route PUT /alumni-portal/chat/moderation/reports/:reportId
 * @access Admin
 */
const updateReportStatus = asyncHandler(async (req, res) => {
  // Verify admin access
  if (req.user["user-type"] !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Admin access required",
    });
  }

  const { reportId } = req.params;
  const { status, adminNotes } = req.body;

  const report = await ChatReport.findByPk(reportId);
  if (!report) {
    return res.status(404).json({
      status: "error",
      message: "Report not found",
    });
  }

  await report.update({
    status: status,
    admin_notes: adminNotes,
  });

  res.status(200).json({
    status: "success",
    message: "Report status updated successfully",
    data: report,
  });
});

/**
 * Send an image message with optional caption
 * @route POST /alumni-portal/chat/:chatId/messages/image
 * @access Private
 */
const sendImageMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  // Accept both reply_to_id and reply_to_message_id for compatibility
  const { reply_to_message_id, reply_to_id } = req.body;
  const replyToMessageId = reply_to_message_id || reply_to_id || null;
  const senderId = req.user.id;

  // Validate file upload
  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "No image file provided",
    });
  }

  // Verify user has access to this chat
  const chat = await Chat.findOne({
    where: {
      chat_id: chatId,
      [Op.or]: [{ user1_id: senderId }, { user2_id: senderId }],
    },
  });

  if (!chat) {
    return res.status(404).json({
      status: "error",
      message: "Chat not found or access denied",
    });
  }

  // Determine receiver
  const receiverId = chat.user1_id === senderId ? chat.user2_id : chat.user1_id;

  // Check if sender is blocked
  const isBlocked = await UserBlock.findOne({
    where: {
      blocker_id: receiverId,
      blocked_id: senderId,
    },
  });

  if (isBlocked) {
    return res.status(403).json({
      status: "error",
      message: "Cannot send message to this user",
    });
  }

  // Create image message
  const message = await Message.create({
    chat_id: chatId,
    sender_id: senderId,
    receiver_id: receiverId,
    content: req.body.caption || "", // Optional caption
    message_type: "image",
    attachment_url: req.file.path,
    attachment_name: req.file.originalname,
    attachment_size: req.file.size,
    attachment_mime_type: req.file.mimetype,
    reply_to_message_id: replyToMessageId,
  });

  // Update chat with last message info
  await chat.update({
    last_message_id: message.message_id,
    last_message_at: new Date(),
    [`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`]:
      chat[`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`] + 1,
  });

  // Fetch message with associations
  const messageWithDetails = await Message.findByPk(message.message_id, {
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: User,
        as: "receiver",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: Message,
        as: "replyTo",
        required: false,
        include: [
          {
            model: User,
            as: "sender",
            attributes: ["id", "first-name", "last-name", "email"],
          },
        ],
        attributes: [
          "message_id",
          "content",
          "sender_id",
          "message_type",
          "attachment_url",
          "attachment_name",
          "is_deleted",
          "created-at",
        ],
      },
    ],
  });

  // Create notification and emit socket events
  await notifyMessageReceived(receiverId, senderId, chatId);

  // Socket emissions for real-time updates
  if (global.chatSocket) {
    global.chatSocket.io
      .to(`chat_${chatId}`)
      .emit("new_message", messageWithDetails);

    const receiverSocketId = global.chatSocket.connectedUsers.get(receiverId);
    if (receiverSocketId) {
      await Message.update(
        { status: "delivered" },
        { where: { message_id: messageWithDetails.message_id } }
      );
      global.chatSocket.io
        .to(`user_${receiverId}`)
        .emit("new_message", messageWithDetails);
    }

    // Update chat lists
    global.chatSocket.io.to(`user_${senderId}`).emit("chat_updated", {
      chatId: chatId,
      lastMessage: messageWithDetails,
      unreadCount:
        chat[`user${chat.user1_id === senderId ? "1" : "2"}_unread_count`],
    });

    if (receiverSocketId) {
      global.chatSocket.io.to(`user_${receiverId}`).emit("chat_updated", {
        chatId: chatId,
        lastMessage: messageWithDetails,
        unreadCount:
          chat[`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`],
      });
    }
  }

  res.status(201).json({
    status: "success",
    data: messageWithDetails,
  });
});

/**
 * Send a file message with optional description
 * @route POST /alumni-portal/chat/:chatId/messages/file
 * @access Private
 */
const sendFileMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  // Accept both reply_to_id and reply_to_message_id for compatibility
  const { reply_to_message_id, reply_to_id } = req.body;
  const replyToMessageId = reply_to_message_id || reply_to_id || null;
  const senderId = req.user.id;

  // Validate file upload
  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "No file provided",
    });
  }

  // Verify user has access to this chat
  const chat = await Chat.findOne({
    where: {
      chat_id: chatId,
      [Op.or]: [{ user1_id: senderId }, { user2_id: senderId }],
    },
  });

  if (!chat) {
    return res.status(404).json({
      status: "error",
      message: "Chat not found or access denied",
    });
  }

  // Determine receiver
  const receiverId = chat.user1_id === senderId ? chat.user2_id : chat.user1_id;

  // Check if sender is blocked
  const isBlocked = await UserBlock.findOne({
    where: {
      blocker_id: receiverId,
      blocked_id: senderId,
    },
  });

  if (isBlocked) {
    return res.status(403).json({
      status: "error",
      message: "Cannot send message to this user",
    });
  }

  // Create file message
  const message = await Message.create({
    chat_id: chatId,
    sender_id: senderId,
    receiver_id: receiverId,
    content: req.body.description || "", // Optional description
    message_type: "file",
    attachment_url: req.file.path,
    attachment_name: req.file.originalname,
    attachment_size: req.file.size,
    attachment_mime_type: req.file.mimetype,
    reply_to_message_id: replyToMessageId,
  });

  // Update chat with last message info
  await chat.update({
    last_message_id: message.message_id,
    last_message_at: new Date(),
    [`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`]:
      chat[`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`] + 1,
  });

  // Fetch message with associations
  const messageWithDetails = await Message.findByPk(message.message_id, {
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: User,
        as: "receiver",
        attributes: ["id", "first-name", "last-name", "email"],
      },
      {
        model: Message,
        as: "replyTo",
        required: false,
        include: [
          {
            model: User,
            as: "sender",
            attributes: ["id", "first-name", "last-name", "email"],
          },
        ],
        attributes: [
          "message_id",
          "content",
          "sender_id",
          "message_type",
          "attachment_url",
          "attachment_name",
          "is_deleted",
          "created-at",
        ],
      },
    ],
  });

  // Create notification and emit socket events
  await notifyMessageReceived(receiverId, senderId, chatId);

  // Socket emissions for real-time updates
  if (global.chatSocket) {
    global.chatSocket.io
      .to(`chat_${chatId}`)
      .emit("new_message", messageWithDetails);

    const receiverSocketId = global.chatSocket.connectedUsers.get(receiverId);
    if (receiverSocketId) {
      await Message.update(
        { status: "delivered" },
        { where: { message_id: messageWithDetails.message_id } }
      );
      global.chatSocket.io
        .to(`user_${receiverId}`)
        .emit("new_message", messageWithDetails);
    }

    // Update chat lists
    global.chatSocket.io.to(`user_${senderId}`).emit("chat_updated", {
      chatId: chatId,
      lastMessage: messageWithDetails,
      unreadCount:
        chat[`user${chat.user1_id === senderId ? "1" : "2"}_unread_count`],
    });

    if (receiverSocketId) {
      global.chatSocket.io.to(`user_${receiverId}`).emit("chat_updated", {
        chatId: chatId,
        lastMessage: messageWithDetails,
        unreadCount:
          chat[`user${chat.user1_id === senderId ? "2" : "1"}_unread_count`],
      });
    }
  }

  res.status(201).json({
    status: "success",
    data: messageWithDetails,
  });
});

/**
 * Get all attachments (images/files) from a chat
 * @route GET /alumni-portal/chat/:chatId/attachments
 * @access Private
 */
const getChatAttachments = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const userId = req.user.id;
  const { type, page = 1, limit = 20 } = req.query;

  // Verify user has access to this chat
  const chat = await Chat.findOne({
    where: {
      chat_id: chatId,
      [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
    },
  });

  if (!chat) {
    return res.status(404).json({
      status: "error",
      message: "Chat not found or access denied",
    });
  }

  // Build where clause for attachments
  let whereClause = {
    chat_id: chatId,
    is_deleted: false,
    message_type: { [Op.in]: ["image", "file"] },
  };

  // Filter by specific type if provided
  if (type) {
    whereClause.message_type = type;
  }

  const offset = (page - 1) * limit;

  const attachments = await Message.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "first-name", "last-name", "email"],
      },
    ],
    order: [["created-at", "DESC"]],
    limit: parseInt(limit),
    offset: offset,
  });

  res.status(200).json({
    status: "success",
    data: {
      attachments: attachments.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(attachments.count / limit),
        total_attachments: attachments.count,
        has_next: offset + attachments.rows.length < attachments.count,
        has_prev: page > 1,
      },
    },
  });
});

/**
 * Download a message attachment
 * @route GET /alumni-portal/chat/messages/:messageId/download
 * @access Private
 */
const downloadAttachment = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id;

  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Chat,
        where: {
          [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
        },
      },
    ],
  });

  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found or access denied",
    });
  }

  if (!message.attachment_url) {
    return res.status(404).json({
      status: "error",
      message: "No attachment found for this message",
    });
  }

  // Redirect to Cloudinary URL
  if (message.attachment_url.includes("cloudinary.com")) {
    return res.redirect(message.attachment_url);
  }

  // Serve local file
  const filePath = path.join(__dirname, "..", "..", message.attachment_url);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      status: "error",
      message: "File not found",
    });
  }

  res.download(filePath, message.attachment_name);
});

module.exports = {
  getOrCreateChat,
  getChatList,
  getChatMessages,
  sendMessage,
  markAsRead,
  editMessage,
  deleteMessage,
  blockUser,
  unblockUser,
  reportUser,
  getBlockedUsers,
  getUserPresence,
  getOnlineUsers,
  getUnreadCounts,
  searchMessages,
  getMessageStats,
  getModerationDashboard,
  updateReportStatus,
  sendImageMessage,
  sendFileMessage,
  getChatAttachments,
  downloadAttachment,
  messageRateLimit,
  uploadRateLimit,
  chatUpload,
};

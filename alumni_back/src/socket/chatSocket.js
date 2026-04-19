const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User, UserPresence, Chat, Message, UserBlock } = require('../models');
const { Op } = require('sequelize');
const MessageStatusService = require('../services/messageStatusService');
const PresenceService = require('../services/presenceService');
const RateLimitService = require('../services/rateLimitService');
const ModerationService = require('../services/moderationService');

class ChatSocketServer {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
    this.typingUsers = new Map(); // chatId -> Set of userIds

    // Initialize services
    this.messageStatusService = new MessageStatusService(this.io);
    this.presenceService = new PresenceService(this.io);
    this.rateLimitService = new RateLimitService();
    this.moderationService = new ModerationService(this.io);

    // Start cleanup intervals
    this.rateLimitService.startCleanupInterval();

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const secret = process.env.JWT_SECRET || "your_jwt_secret_key_here";
        const decoded = jwt.verify(token, secret);
        
        // Get user from database
        const user = await User.findByPk(decoded.id);
        if (!user) {
          return next(new Error('Authentication error: User not found'));
        }

        socket.userId = user.id;
        socket.user = user;
        next();
      } catch (error) {
        console.error('Socket authentication error:', error.message);
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User ${socket.userId} connected with socket ${socket.id}`);
      
      this.handleConnection(socket);
      this.handleDisconnection(socket);
      this.handleChatRoomEvents(socket);
      this.handleMessageEvents(socket);
      this.handlePresenceEvents(socket);
      this.handleTypingEvents(socket);
    });
  }

  handleConnection(socket) {
    const userId = socket.userId;
    
    // Store user connection
    this.connectedUsers.set(userId, socket.id);
    this.userSockets.set(socket.id, userId);

    // Update user presence using service
    this.presenceService.updatePresence(userId, 'online', socket.id);

    // Join user to their personal room
    socket.join(`user_${userId}`);

    // Mark pending messages as delivered
    this.messageStatusService.markMessagesAsDelivered(userId);

    // Send unread counts
    this.sendUnreadCounts(userId);

    console.log(`User ${userId} connected with socket ${socket.id}`);
  }

  handleDisconnection(socket) {
    socket.on('disconnect', async () => {
      const userId = socket.userId;
      console.log(`User ${userId} disconnected`);

      // Remove from connected users
      this.connectedUsers.delete(userId);
      this.userSockets.delete(socket.id);

      // Clean up typing indicators
      this.cleanupTypingIndicators(userId);

      // Update user presence using service
      await this.presenceService.setOffline(userId, socket.id);
    });
  }

  handleChatRoomEvents(socket) {
    // Join chat room
    socket.on('join_chat', async (chatId) => {
      try {
        const userId = socket.userId;
        
        if (!chatId) {
          socket.emit('error', { message: 'Chat ID is required' });
          return;
        }

        // Verify user has access to this chat
        const chat = await Chat.findOne({
          where: {
            chat_id: chatId,
            [Op.or]: [
              { user1_id: userId },
              { user2_id: userId }
            ]
          }
        });

        if (!chat) {
          socket.emit('error', { message: 'Chat not found or access denied' });
          return;
        }

        // Join the chat room
        socket.join(`chat_${chatId}`);
        console.log(`User ${userId} joined chat ${chatId}`);

        // Mark messages as read when joining
        await Message.update(
          { status: 'read' },
          {
            where: {
              chat_id: chatId,
              receiver_id: userId,
              status: { [Op.in]: ['sent', 'delivered'] }
            }
          }
        );

        // Reset unread count
        const unreadField = chat.user1_id === userId ? 'user1_unread_count' : 'user2_unread_count';
        await chat.update({
          [unreadField]: 0
        });

        // Notify other user that messages were read
        const otherUserId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
        const otherSocketId = this.connectedUsers.get(otherUserId);
        if (otherSocketId) {
          this.io.to(otherSocketId).emit('messages_read', {
            chatId: chatId,
            readBy: userId,
            readAt: new Date()
          });
        }

      } catch (error) {
        console.error('Error joining chat:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Leave chat room
    socket.on('leave_chat', (chatId) => {
      const userId = socket.userId;
      socket.leave(`chat_${chatId}`);
      console.log(`User ${userId} left chat ${chatId}`);
    });
  }

  handleMessageEvents(socket) {
    // Send message
    socket.on('send_message', async (data) => {
      try {
        // Accept both replyToMessageId and reply_to_id for compatibility
        const { chatId, content, replyToMessageId, reply_to_id } = data;
        const replyToMsgId = replyToMessageId || reply_to_id || null;
        const senderId = socket.userId;

        // Verify chat access
        const chat = await Chat.findOne({
          where: {
            chat_id: chatId,
            [Op.or]: [
              { user1_id: senderId },
              { user2_id: senderId }
            ]
          }
        });

        if (!chat) {
          socket.emit('error', { message: 'Chat not found or access denied' });
          return;
        }

        // Check if user is blocked
        const receiverId = chat.user1_id === senderId ? chat.user2_id : chat.user1_id;
        const isBlocked = await UserBlock.findOne({
          where: {
            blocker_id: receiverId,
            blocked_id: senderId
          }
        });

        if (isBlocked) {
          socket.emit('error', { message: 'Cannot send message to this user' });
          return;
        }

        // Create message
        const message = await Message.create({
          chat_id: chatId,
          sender_id: senderId,
          receiver_id: receiverId,
          content: content,
          message_type: 'text',
          reply_to_message_id: replyToMsgId
        });

        // Update chat
        await chat.update({
          last_message_id: message.message_id,
          last_message_at: new Date(),
          [`user${chat.user1_id === senderId ? '2' : '1'}_unread_count`]: chat[`user${chat.user1_id === senderId ? '2' : '1'}_unread_count`] + 1
        });

        // Fetch message with details, including full replyTo data
        const messageWithDetails = await Message.findByPk(message.message_id, {
          include: [
            {
              model: User,
              as: 'sender',
              attributes: ['id', 'first-name', 'last-name', 'email']
            },
            {
              model: User,
              as: 'receiver',
              attributes: ['id', 'first-name', 'last-name', 'email']
            },
            {
              model: Message,
              as: 'replyTo',
              required: false,
              include: [
                {
                  model: User,
                  as: 'sender',
                  attributes: ['id', 'first-name', 'last-name', 'email']
                }
              ],
              attributes: ['message_id', 'content', 'sender_id', 'message_type', 'attachment_url', 'attachment_name', 'is_deleted', 'created-at']
            }
          ]
        });

        // Send to sender (confirmation)
        socket.emit('message_sent', messageWithDetails);

        // Emit to the chat room so both sender and receiver receive it
        this.io.to(`chat_${chatId}`).emit('new_message', messageWithDetails);

        // Also send to receiver's personal room as fallback if they're not in the chat room
        const receiverSocketId = this.connectedUsers.get(receiverId);
        if (receiverSocketId) {
          // Mark as delivered
          await message.update({ status: 'delivered' });
          // Also emit to receiver's personal room as fallback
          this.io.to(`user_${receiverId}`).emit('new_message', messageWithDetails);
        }

        // Update chat list for both users
        this.io.to(`user_${senderId}`).emit('chat_updated', {
          chatId: chatId,
          lastMessage: messageWithDetails,
          unreadCount: chat[`user${chat.user1_id === senderId ? '1' : '2'}_unread_count`]
        });

        if (receiverSocketId) {
          this.io.to(`user_${receiverId}`).emit('chat_updated', {
            chatId: chatId,
            lastMessage: messageWithDetails,
            unreadCount: chat[`user${chat.user1_id === senderId ? '2' : '1'}_unread_count`]
          });
        }

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Mark messages as read (support both event names for compatibility)
    socket.on('mark_as_read', async (data) => {
      try {
        const chatId = data.chatId || data.chat_id;
        const userId = socket.userId;

        // Verify chat access
        const chat = await Chat.findOne({
          where: {
            chat_id: chatId,
            [Op.or]: [
              { user1_id: userId },
              { user2_id: userId }
            ]
          }
        });

        if (!chat) {
          socket.emit('error', { message: 'Chat not found or access denied' });
          return;
        }

        // Mark messages as read
        await Message.update(
          { status: 'read' },
          {
            where: {
              chat_id: chatId,
              receiver_id: userId,
              status: { [Op.in]: ['sent', 'delivered'] }
            }
          }
        );

        // Reset unread count
        const unreadField = chat.user1_id === userId ? 'user1_unread_count' : 'user2_unread_count';
        await chat.update({
          [unreadField]: 0
        });

        // Notify sender that messages were read
        const senderId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
        const senderSocketId = this.connectedUsers.get(senderId);
        if (senderSocketId) {
          this.io.to(senderSocketId).emit('messages_read', {
            chatId: chatId,
            readBy: userId,
            readAt: new Date()
          });
        }

      } catch (error) {
        console.error('Error marking messages as read:', error);
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });

    // Also handle mark_read event (frontend uses this)
    socket.on('mark_read', async (data) => {
      try {
        const chatId = data.chatId || data.chat_id;
        const userId = socket.userId;

        // Verify chat access
        const chat = await Chat.findOne({
          where: {
            chat_id: chatId,
            [Op.or]: [
              { user1_id: userId },
              { user2_id: userId }
            ]
          }
        });

        if (!chat) {
          socket.emit('error', { message: 'Chat not found or access denied' });
          return;
        }

        // Mark messages as read
        await Message.update(
          { status: 'read' },
          {
            where: {
              chat_id: chatId,
              receiver_id: userId,
              status: { [Op.in]: ['sent', 'delivered'] }
            }
          }
        );

        // Reset unread count
        const unreadField = chat.user1_id === userId ? 'user1_unread_count' : 'user2_unread_count';
        await chat.update({
          [unreadField]: 0
        });

        // Notify sender that messages were read
        const senderId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
        const senderSocketId = this.connectedUsers.get(senderId);
        if (senderSocketId) {
          this.io.to(senderSocketId).emit('messages_read', {
            chatId: chatId,
            readBy: userId,
            readAt: new Date()
          });
        }

      } catch (error) {
        console.error('Error marking messages as read:', error);
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });

    // Edit message
    socket.on('edit_message', async (data) => {
      try {
        const { messageId, content } = data;
        const userId = socket.userId;

        const message = await Message.findByPk(messageId, {
          include: [
            {
              model: Chat,
              where: {
                [Op.or]: [
                  { user1_id: userId },
                  { user2_id: userId }
                ]
              }
            }
          ]
        });

        if (!message) {
          socket.emit('error', { message: 'Message not found or access denied' });
          return;
        }

        if (message.sender_id !== userId) {
          socket.emit('error', { message: 'You can only edit your own messages' });
          return;
        }

        // Update message
        await message.update({
          content: content,
          is_edited: true,
          edited_at: new Date()
        });

        // Fetch updated message with all associations for socket emission
        const updatedMessage = await Message.findByPk(messageId, {
          include: [
            {
              model: User,
              as: 'sender',
              attributes: ['id', 'first-name', 'last-name', 'email']
            },
            {
              model: User,
              as: 'receiver',
              attributes: ['id', 'first-name', 'last-name', 'email']
            },
            {
              model: Message,
              as: 'replyTo',
              include: [
                {
                  model: User,
                  as: 'sender',
                  attributes: ['id', 'first-name', 'last-name']
                }
              ]
            }
          ]
        });

        // Get chat to determine receiver
        const chat = await Chat.findByPk(message.chat_id);
        const receiverId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;

        // Emit to the chat room so both users receive the update
        this.io.to(`chat_${message.chat_id}`).emit('message_edited', updatedMessage);
        
        // Also emit to both users' personal rooms to ensure they receive it even if not in chat room
        this.io.to(`user_${userId}`).emit('message_edited', updatedMessage);
        
        const receiverSocketId = this.connectedUsers.get(receiverId);
        if (receiverSocketId) {
          this.io.to(`user_${receiverId}`).emit('message_edited', updatedMessage);
        }

      } catch (error) {
        console.error('Error editing message:', error);
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Delete message
    socket.on('delete_message', async (data) => {
      try {
        const { messageId } = data;
        const userId = socket.userId;

        const message = await Message.findByPk(messageId, {
          include: [
            {
              model: Chat,
              where: {
                [Op.or]: [
                  { user1_id: userId },
                  { user2_id: userId }
                ]
              }
            }
          ]
        });

        if (!message) {
          socket.emit('error', { message: 'Message not found or access denied' });
          return;
        }

        if (message.sender_id !== userId) {
          socket.emit('error', { message: 'You can only delete your own messages' });
          return;
        }

        // Soft delete message
        await message.update({
          is_deleted: true,
          deleted_at: new Date(),
          content: '[Message deleted]'
        });

        // Notify both users
        const chat = await Chat.findByPk(message.chat_id);
        const otherUserId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
        
        socket.emit('message_deleted', { messageId: messageId });
        
        const otherSocketId = this.connectedUsers.get(otherUserId);
        if (otherSocketId) {
          this.io.to(otherSocketId).emit('message_deleted', { messageId: messageId });
        }

      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });
  }

  handlePresenceEvents(socket) {
    // Update presence status
    socket.on('update_presence', async (data) => {
      try {
        const { status } = data;
        const userId = socket.userId;

        await this.updateUserPresence(userId, status, socket.id);
        this.notifyContactsPresence(userId, status);

      } catch (error) {
        console.error('Error updating presence:', error);
        socket.emit('error', { message: 'Failed to update presence' });
      }
    });
  }

  handleTypingEvents(socket) {
    // Start typing
    socket.on('typing_start', (data) => {
      const { chatId } = data;
      const userId = socket.userId;

      if (!this.typingUsers.has(chatId)) {
        this.typingUsers.set(chatId, new Set());
      }
      this.typingUsers.get(chatId).add(userId);

      // Notify other user in the chat
      socket.to(`chat_${chatId}`).emit('user_typing', {
        chatId: chatId,
        userId: userId,
        isTyping: true
      });
    });

    // Stop typing
    socket.on('typing_stop', (data) => {
      const { chatId } = data;
      const userId = socket.userId;

      if (this.typingUsers.has(chatId)) {
        this.typingUsers.get(chatId).delete(userId);
        if (this.typingUsers.get(chatId).size === 0) {
          this.typingUsers.delete(chatId);
        }
      }

      // Notify other user in the chat
      socket.to(`chat_${chatId}`).emit('user_typing', {
        chatId: chatId,
        userId: userId,
        isTyping: false
      });
    });
  }

  async updateUserPresence(userId, status, socketId = null) {
    try {
      const [presence, created] = await UserPresence.findOrCreate({
        where: { user_id: userId },
        defaults: {
          user_id: userId,
          status: status,
          socket_id: socketId,
          last_seen: new Date()
        }
      });

      if (!created) {
        await presence.update({
          status: status,
          socket_id: socketId,
          last_seen: new Date()
        });
      }
    } catch (error) {
      console.error('Error updating user presence:', error);
    }
  }

  async notifyContactsPresence(userId, status) {
    try {
      // Get all chats for this user
      const chats = await Chat.findAll({
        where: {
          [Op.or]: [
            { user1_id: userId },
            { user2_id: userId }
          ],
          is_active: true
        }
      });

      // Notify all contacts
      for (const chat of chats) {
        const contactId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
        const contactSocketId = this.connectedUsers.get(contactId);
        
        if (contactSocketId) {
          this.io.to(contactSocketId).emit('contact_presence', {
            userId: userId,
            status: status,
            lastSeen: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Error notifying contacts presence:', error);
    }
  }

  async sendPendingMessages(userId) {
    try {
      // Get undelivered messages for this user
      const pendingMessages = await Message.findAll({
        where: {
          receiver_id: userId,
          status: 'sent'
        },
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'first-name', 'last-name', 'email']
          },
          {
            model: Chat
          }
        ],
        order: [['created-at', 'ASC']]
      });

      // Send pending messages
      for (const message of pendingMessages) {
        this.io.to(`user_${userId}`).emit('new_message', message);
        
        // Mark as delivered
        await message.update({ status: 'delivered' });
      }
    } catch (error) {
      console.error('Error sending pending messages:', error);
    }
  }

  cleanupTypingIndicators(userId) {
    for (const [chatId, typingSet] of this.typingUsers.entries()) {
      if (typingSet.has(userId)) {
        typingSet.delete(userId);
        if (typingSet.size === 0) {
          this.typingUsers.delete(chatId);
        }
      }
    }
  }

  // Send unread counts to user
  async sendUnreadCounts(userId) {
    try {
      const unreadCounts = await this.messageStatusService.getUserUnreadCounts(userId);
      const userSocketId = this.connectedUsers.get(userId);
      if (userSocketId) {
        this.io.to(userSocketId).emit('unread_counts', unreadCounts);
      }
    } catch (error) {
      console.error('Error sending unread counts:', error);
    }
  }

  // Method to send file message (called from REST endpoint)
  async sendFileMessage(fileData) {
    try {
      const { chatId, senderId, receiverId, attachmentUrl, attachmentName, attachmentSize, attachmentMimeType } = fileData;

      // Create message
      const message = await Message.create({
        chat_id: chatId,
        sender_id: senderId,
        receiver_id: receiverId,
        content: `📎 ${attachmentName}`,
        message_type: attachmentMimeType.startsWith('image/') ? 'image' : 'file',
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        attachment_size: attachmentSize,
        attachment_mime_type: attachmentMimeType
      });

      // Update chat
      const chat = await Chat.findByPk(chatId);
      await chat.update({
        last_message_id: message.message_id,
        last_message_at: new Date(),
        [`user${chat.user1_id === senderId ? '2' : '1'}_unread_count`]: chat[`user${chat.user1_id === senderId ? '2' : '1'}_unread_count`] + 1
      });

      // Fetch message with details
      const messageWithDetails = await Message.findByPk(message.message_id, {
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'first-name', 'last-name', 'email']
          },
          {
            model: User,
            as: 'receiver',
            attributes: ['id', 'first-name', 'last-name', 'email']
          }
        ]
      });

      // Send to sender (confirmation)
      const senderSocketId = this.connectedUsers.get(senderId);
      if (senderSocketId) {
        this.io.to(senderSocketId).emit('file_message_sent', messageWithDetails);
      }

      // Send to receiver if online
      const receiverSocketId = this.connectedUsers.get(receiverId);
      if (receiverSocketId) {
        this.io.to(receiverSocketId).emit('new_message', messageWithDetails);
        await message.update({ status: 'delivered' });
      }

      return messageWithDetails;
    } catch (error) {
      console.error('Error sending file message:', error);
      throw error;
    }
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Get rate limit status for a user
  getRateLimitStatus(userId, eventType) {
    return this.rateLimitService.getRateLimitStatus(userId, eventType);
  }

  // Get presence statistics
  async getPresenceStats() {
    return await this.presenceService.getPresenceStats();
  }

  // Get moderation statistics
  async getModerationStats() {
    return await this.moderationService.getReportStats();
  }

  // Emit post like event to all connected users
  emitPostLike(postId, userId, userInfo, likesCount) {
    this.io.emit('post_liked', {
      postId: postId,
      userId: userId,
      user: userInfo,
      likesCount: likesCount,
      timestamp: new Date()
    });
  }

  // Emit post unlike event to all connected users
  emitPostUnlike(postId, userId, likesCount) {
    this.io.emit('post_unliked', {
      postId: postId,
      userId: userId,
      likesCount: likesCount,
      timestamp: new Date()
    });
  }

  // Emit comment like event (if comments have likes in the future)
  emitCommentLike(postId, commentId, userId, userInfo, likesCount) {
    this.io.emit('comment_liked', {
      postId: postId,
      commentId: commentId,
      userId: userId,
      user: userInfo,
      likesCount: likesCount,
      timestamp: new Date()
    });
  }

  // Emit comment unlike event
  emitCommentUnlike(postId, commentId, userId, likesCount) {
    this.io.emit('comment_unliked', {
      postId: postId,
      commentId: commentId,
      userId: userId,
      likesCount: likesCount,
      timestamp: new Date()
    });
  }
}

module.exports = ChatSocketServer;

const { UserPresence, User } = require('../models');
const { Op } = require('sequelize');

class PresenceService {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
    this.typingUsers = new Map(); // chatId -> Set of userIds
  }

  // Update user presence status
  async updatePresence(userId, status, socketId = null) {
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

      // Store connection info
      if (socketId) {
        this.connectedUsers.set(userId, socketId);
        this.userSockets.set(socketId, userId);
      }

      // Notify contacts about status change
      await this.notifyContactsPresence(userId, status);

      return presence;
    } catch (error) {
      console.error('Error updating presence:', error);
      throw error;
    }
  }

  // Set user offline
  async setOffline(userId, socketId) {
    try {
      await this.updatePresence(userId, 'offline');
      
      // Remove from connected users
      this.connectedUsers.delete(userId);
      this.userSockets.delete(socketId);

      // Clean up typing indicators
      this.cleanupTypingIndicators(userId);

      // Notify contacts
      await this.notifyContactsPresence(userId, 'offline');

      return true;
    } catch (error) {
      console.error('Error setting user offline:', error);
      throw error;
    }
  }

  // Get user presence
  async getUserPresence(userId) {
    try {
      const presence = await UserPresence.findOne({
        where: { user_id: userId },
        include: [
          {
            model: User,
            attributes: ['id', 'first-name', 'last-name', 'email']
          }
        ]
      });

      return presence;
    } catch (error) {
      console.error('Error getting user presence:', error);
      throw error;
    }
  }

  // Get online users
  async getOnlineUsers() {
    try {
      const onlineUsers = await UserPresence.findAll({
        where: { status: 'online' },
        include: [
          {
            model: User,
            attributes: ['id', 'first-name', 'last-name', 'email', 'user-type']
          }
        ],
        order: [['last_seen', 'DESC']]
      });

      return onlineUsers;
    } catch (error) {
      console.error('Error getting online users:', error);
      throw error;
    }
  }

  // Notify contacts about presence change
  async notifyContactsPresence(userId, status) {
    try {
      // Get all chats for this user
      const { Chat } = require('../models');
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
            lastSeen: new Date(),
            isOnline: status === 'online'
          });
        }
      }
    } catch (error) {
      console.error('Error notifying contacts presence:', error);
      throw error;
    }
  }

  // Handle typing indicators
  startTyping(chatId, userId) {
    try {
      if (!this.typingUsers.has(chatId)) {
        this.typingUsers.set(chatId, new Set());
      }
      this.typingUsers.get(chatId).add(userId);

      // Notify other user in the chat
      this.io.to(`chat_${chatId}`).emit('user_typing', {
        chatId: chatId,
        userId: userId,
        isTyping: true,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error starting typing:', error);
      throw error;
    }
  }

  stopTyping(chatId, userId) {
    try {
      if (this.typingUsers.has(chatId)) {
        this.typingUsers.get(chatId).delete(userId);
        if (this.typingUsers.get(chatId).size === 0) {
          this.typingUsers.delete(chatId);
        }
      }

      // Notify other user in the chat
      this.io.to(`chat_${chatId}`).emit('user_typing', {
        chatId: chatId,
        userId: userId,
        isTyping: false,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error stopping typing:', error);
      throw error;
    }
  }

  // Clean up typing indicators for a user
  cleanupTypingIndicators(userId) {
    try {
      for (const [chatId, typingSet] of this.typingUsers.entries()) {
        if (typingSet.has(userId)) {
          typingSet.delete(userId);
          if (typingSet.size === 0) {
            this.typingUsers.delete(chatId);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up typing indicators:', error);
    }
  }

  // Get typing users for a chat
  getTypingUsers(chatId) {
    try {
      const typingSet = this.typingUsers.get(chatId);
      return typingSet ? Array.from(typingSet) : [];
    } catch (error) {
      console.error('Error getting typing users:', error);
      return [];
    }
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  // Get socket ID by user ID
  getSocketIdByUserId(userId) {
    return this.connectedUsers.get(userId);
  }

  // Get user ID by socket ID
  getUserIdBySocketId(socketId) {
    return this.userSockets.get(socketId);
  }

  // Get presence statistics
  async getPresenceStats() {
    try {
      const stats = await UserPresence.findAll({
        attributes: [
          'status',
          [UserPresence.sequelize.fn('COUNT', UserPresence.sequelize.col('user_id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const result = {
        online: 0,
        offline: 0,
        away: 0,
        busy: 0,
        total: 0
      };

      stats.forEach(stat => {
        result[stat.status] = parseInt(stat.count);
        result.total += parseInt(stat.count);
      });

      return result;
    } catch (error) {
      console.error('Error getting presence stats:', error);
      throw error;
    }
  }

  // Update last seen timestamp
  async updateLastSeen(userId) {
    try {
      await UserPresence.update(
        { last_seen: new Date() },
        { where: { user_id: userId } }
      );
    } catch (error) {
      console.error('Error updating last seen:', error);
    }
  }

  // Get users who were active in the last N minutes
  async getRecentlyActiveUsers(minutes = 30) {
    try {
      const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
      
      const activeUsers = await UserPresence.findAll({
        where: {
          last_seen: {
            [Op.gte]: cutoffTime
          }
        },
        include: [
          {
            model: User,
            attributes: ['id', 'first-name', 'last-name', 'email', 'user-type']
          }
        ],
        order: [['last_seen', 'DESC']]
      });

      return activeUsers;
    } catch (error) {
      console.error('Error getting recently active users:', error);
      throw error;
    }
  }
}

module.exports = PresenceService;

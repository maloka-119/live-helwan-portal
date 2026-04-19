const { Message, Chat, UserPresence } = require('../models');
const { Op } = require('sequelize');

class MessageStatusService {
  constructor(io) {
    this.io = io;
  }

  // Update message status (sent -> delivered -> read)
  async updateMessageStatus(messageId, status, userId = null) {
    try {
      const message = await Message.findByPk(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Update status
      await message.update({ status });

      // If marking as read, update unread counts
      if (status === 'read' && userId) {
        await this.updateUnreadCounts(message.chat_id, userId);
      }

      // Notify sender about status change
      const senderSocketId = this.getSocketIdByUserId(message.sender_id);
      if (senderSocketId) {
        this.io.to(senderSocketId).emit('message_status_updated', {
          messageId: messageId,
          status: status,
          updatedAt: new Date()
        });
      }

      return message;
    } catch (error) {
      console.error('Error updating message status:', error);
      throw error;
    }
  }

  // Mark messages as delivered when user comes online
  async markMessagesAsDelivered(userId) {
    try {
      const undeliveredMessages = await Message.findAll({
        where: {
          receiver_id: userId,
          status: 'sent'
        },
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

      for (const message of undeliveredMessages) {
        await this.updateMessageStatus(message.message_id, 'delivered');
      }

      return undeliveredMessages.length;
    } catch (error) {
      console.error('Error marking messages as delivered:', error);
      throw error;
    }
  }

  // Mark messages as read
  async markMessagesAsRead(chatId, userId) {
    try {
      const unreadMessages = await Message.findAll({
        where: {
          chat_id: chatId,
          receiver_id: userId,
          status: { [Op.in]: ['sent', 'delivered'] }
        }
      });

      for (const message of unreadMessages) {
        await this.updateMessageStatus(message.message_id, 'read');
      }

      // Update unread counts
      await this.updateUnreadCounts(chatId, userId);

      return unreadMessages.length;
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  }

  // Update unread counts for a chat
  async updateUnreadCounts(chatId, userId) {
    try {
      const chat = await Chat.findByPk(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      // Count unread messages for the user
      const unreadCount = await Message.count({
        where: {
          chat_id: chatId,
          receiver_id: userId,
          status: { [Op.in]: ['sent', 'delivered'] }
        }
      });

      // Update the appropriate unread count field
      const unreadField = chat.user1_id === userId ? 'user1_unread_count' : 'user2_unread_count';
      await chat.update({
        [unreadField]: unreadCount
      });

      // Notify user about unread count update
      const userSocketId = this.getSocketIdByUserId(userId);
      if (userSocketId) {
        this.io.to(userSocketId).emit('unread_count_updated', {
          chatId: chatId,
          unreadCount: unreadCount
        });
      }

      return unreadCount;
    } catch (error) {
      console.error('Error updating unread counts:', error);
      throw error;
    }
  }

  // Get unread counts for all chats of a user
  async getUserUnreadCounts(userId) {
    try {
      const chats = await Chat.findAll({
        where: {
          [Op.or]: [
            { user1_id: userId },
            { user2_id: userId }
          ],
          is_active: true
        }
      });

      const unreadCounts = {};
      let totalUnread = 0;

      for (const chat of chats) {
        const unreadCount = chat.user1_id === userId ? chat.user1_unread_count : chat.user2_unread_count;
        unreadCounts[chat.chat_id] = unreadCount;
        totalUnread += unreadCount;
      }

      return {
        byChat: unreadCounts,
        total: totalUnread
      };
    } catch (error) {
      console.error('Error getting user unread counts:', error);
      throw error;
    }
  }

  // Increment unread count when new message is received
  async incrementUnreadCount(chatId, receiverId) {
    try {
      const chat = await Chat.findByPk(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const unreadField = chat.user1_id === receiverId ? 'user1_unread_count' : 'user2_unread_count';
      const currentCount = chat[unreadField];
      
      await chat.update({
        [unreadField]: currentCount + 1
      });

      // Notify receiver about new unread message
      const receiverSocketId = this.getSocketIdByUserId(receiverId);
      if (receiverSocketId) {
        this.io.to(receiverSocketId).emit('unread_count_updated', {
          chatId: chatId,
          unreadCount: currentCount + 1
        });
      }

      return currentCount + 1;
    } catch (error) {
      console.error('Error incrementing unread count:', error);
      throw error;
    }
  }

  // Reset unread count for a chat
  async resetUnreadCount(chatId, userId) {
    try {
      const chat = await Chat.findByPk(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const unreadField = chat.user1_id === userId ? 'user1_unread_count' : 'user2_unread_count';
      
      await chat.update({
        [unreadField]: 0
      });

      // Notify user about reset
      const userSocketId = this.getSocketIdByUserId(userId);
      if (userSocketId) {
        this.io.to(userSocketId).emit('unread_count_updated', {
          chatId: chatId,
          unreadCount: 0
        });
      }

      return 0;
    } catch (error) {
      console.error('Error resetting unread count:', error);
      throw error;
    }
  }

  // Helper method to get socket ID by user ID
  getSocketIdByUserId(userId) {
    // This would be implemented in the main socket server
    // For now, return null - this will be connected later
    return null;
  }

  // Get message statistics for a user
  async getMessageStats(userId) {
    try {
      const stats = await Message.findAll({
        where: {
          [Op.or]: [
            { sender_id: userId },
            { receiver_id: userId }
          ]
        },
        attributes: [
          'status',
          [Message.sequelize.fn('COUNT', Message.sequelize.col('message_id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const result = {
        sent: 0,
        delivered: 0,
        read: 0,
        total: 0
      };

      stats.forEach(stat => {
        result[stat.status] = parseInt(stat.count);
        result.total += parseInt(stat.count);
      });

      return result;
    } catch (error) {
      console.error('Error getting message stats:', error);
      throw error;
    }
  }
}

module.exports = MessageStatusService;

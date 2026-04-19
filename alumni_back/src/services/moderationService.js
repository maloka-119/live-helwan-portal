const { UserBlock, ChatReport, User, Chat, Message } = require('../models');
const { Op } = require('sequelize');

class ModerationService {
  constructor(io) {
    this.io = io;
  }

  // Block a user
  async blockUser(blockerId, blockedId, reason = null) {
    try {
      if (blockerId === blockedId) {
        throw new Error('Cannot block yourself');
      }

      // Check if user exists
      const blockedUser = await User.findByPk(blockedId);
      if (!blockedUser) {
        throw new Error('User not found');
      }

      // Check if already blocked
      const existingBlock = await UserBlock.findOne({
        where: {
          blocker_id: blockerId,
          blocked_id: blockedId
        }
      });

      if (existingBlock) {
        throw new Error('User is already blocked');
      }

      // Create block
      const block = await UserBlock.create({
        blocker_id: blockerId,
        blocked_id: blockedId,
        reason: reason
      });

      // Deactivate any existing chat
      await this.deactivateChat(blockerId, blockedId);

      // Notify blocked user if online
      const blockedSocketId = this.getSocketIdByUserId(blockedId);
      if (blockedSocketId) {
        this.io.to(blockedSocketId).emit('user_blocked', {
          blockedBy: blockerId,
          reason: reason,
          timestamp: new Date()
        });
      }

      return block;
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  // Unblock a user
  async unblockUser(blockerId, blockedId) {
    try {
      const block = await UserBlock.findOne({
        where: {
          blocker_id: blockerId,
          blocked_id: blockedId
        }
      });

      if (!block) {
        throw new Error('User is not blocked');
      }

      await block.destroy();

      // Reactivate chat if it exists
      await this.reactivateChat(blockerId, blockedId);

      return true;
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }

  // Get blocked users for a user
  async getBlockedUsers(userId) {
    try {
      const blockedUsers = await UserBlock.findAll({
        where: { blocker_id: userId },
        include: [
          {
            model: User,
            as: 'blocked',
            attributes: ['id', 'first-name', 'last-name', 'email', 'user-type']
          }
        ],
        order: [['created-at', 'DESC']]
      });

      return blockedUsers;
    } catch (error) {
      console.error('Error getting blocked users:', error);
      throw error;
    }
  }

  // Check if user is blocked
  async isUserBlocked(userId1, userId2) {
    try {
      const block = await UserBlock.findOne({
        where: {
          [Op.or]: [
            { blocker_id: userId1, blocked_id: userId2 },
            { blocker_id: userId2, blocked_id: userId1 }
          ]
        }
      });

      return !!block;
    } catch (error) {
      console.error('Error checking if user is blocked:', error);
      return false;
    }
  }

  // Report a user or message
  async reportUser(reporterId, reportedUserId, reason, description = null, chatId = null, messageId = null) {
    try {
      if (reporterId === reportedUserId) {
        throw new Error('Cannot report yourself');
      }

      // Check if user exists
      const reportedUser = await User.findByPk(reportedUserId);
      if (!reportedUser) {
        throw new Error('User not found');
      }

      // Check if already reported recently (prevent spam)
      const recentReport = await ChatReport.findOne({
        where: {
          reporter_id: reporterId,
          reported_user_id: reportedUserId,
          'created-at': {
            [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      if (recentReport) {
        throw new Error('You have already reported this user recently');
      }

      // Create report
      const report = await ChatReport.create({
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        chat_id: chatId,
        message_id: messageId,
        reason: reason,
        description: description
      });

      // Notify admins about new report
      await this.notifyAdminsNewReport(report);

      return report;
    } catch (error) {
      console.error('Error reporting user:', error);
      throw error;
    }
  }

  // Get reports for admin review
  async getReports(status = 'pending', limit = 50, offset = 0) {
    try {
      const reports = await ChatReport.findAndCountAll({
        where: status ? { status } : {},
        include: [
          {
            model: User,
            as: 'reporter',
            attributes: ['id', 'first-name', 'last-name', 'email']
          },
          {
            model: User,
            as: 'reportedUser',
            attributes: ['id', 'first-name', 'last-name', 'email', 'user-type']
          },
          {
            model: Chat,
            attributes: ['chat_id']
          },
          {
            model: Message,
            attributes: ['message_id', 'content', 'message_type']
          }
        ],
        order: [['created-at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return {
        reports: reports.rows,
        total: reports.count,
        hasMore: offset + reports.rows.length < reports.count
      };
    } catch (error) {
      console.error('Error getting reports:', error);
      throw error;
    }
  }

  // Update report status (admin only)
  async updateReportStatus(reportId, status, adminNotes = null, adminId = null) {
    try {
      const report = await ChatReport.findByPk(reportId);
      if (!report) {
        throw new Error('Report not found');
      }

      await report.update({
        status: status,
        admin_notes: adminNotes
      });

      // If resolved, notify the reporter
      if (status === 'resolved') {
        const reporterSocketId = this.getSocketIdByUserId(report.reporter_id);
        if (reporterSocketId) {
          this.io.to(reporterSocketId).emit('report_resolved', {
            reportId: reportId,
            status: status,
            adminNotes: adminNotes,
            timestamp: new Date()
          });
        }
      }

      return report;
    } catch (error) {
      console.error('Error updating report status:', error);
      throw error;
    }
  }

  // Get report statistics
  async getReportStats() {
    try {
      const stats = await ChatReport.findAll({
        attributes: [
          'reason',
          'status',
          [ChatReport.sequelize.fn('COUNT', ChatReport.sequelize.col('report_id')), 'count']
        ],
        group: ['reason', 'status'],
        raw: true
      });

      const result = {
        byReason: {},
        byStatus: {},
        total: 0
      };

      stats.forEach(stat => {
        const count = parseInt(stat.count);
        
        if (!result.byReason[stat.reason]) {
          result.byReason[stat.reason] = {};
        }
        result.byReason[stat.reason][stat.status] = count;

        if (!result.byStatus[stat.status]) {
          result.byStatus[stat.status] = 0;
        }
        result.byStatus[stat.status] += count;

        result.total += count;
      });

      return result;
    } catch (error) {
      console.error('Error getting report stats:', error);
      throw error;
    }
  }

  // Deactivate chat between two users
  async deactivateChat(userId1, userId2) {
    try {
      await Chat.update(
        { is_active: false },
        {
          where: {
            [Op.or]: [
              { user1_id: userId1, user2_id: userId2 },
              { user1_id: userId2, user2_id: userId1 }
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error deactivating chat:', error);
    }
  }

  // Reactivate chat between two users
  async reactivateChat(userId1, userId2) {
    try {
      await Chat.update(
        { is_active: true },
        {
          where: {
            [Op.or]: [
              { user1_id: userId1, user2_id: userId2 },
              { user1_id: userId2, user2_id: userId1 }
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error reactivating chat:', error);
    }
  }

  // Notify admins about new report
  async notifyAdminsNewReport(report) {
    try {
      const admins = await User.findAll({
        where: { 'user-type': 'admin' }
      });

      for (const admin of admins) {
        const adminSocketId = this.getSocketIdByUserId(admin.id);
        if (adminSocketId) {
          this.io.to(adminSocketId).emit('new_report', {
            reportId: report.report_id,
            reporterId: report.reporter_id,
            reportedUserId: report.reported_user_id,
            reason: report.reason,
            description: report.description,
            timestamp: report['created-at']
          });
        }
      }
    } catch (error) {
      console.error('Error notifying admins:', error);
    }
  }

  // Helper method to get socket ID by user ID
  getSocketIdByUserId(userId) {
    // This would be implemented in the main socket server
    return null;
  }

  // Get moderation dashboard data
  async getModerationDashboard() {
    try {
      const [
        totalReports,
        pendingReports,
        resolvedReports,
        totalBlocks,
        recentReports
      ] = await Promise.all([
        ChatReport.count(),
        ChatReport.count({ where: { status: 'pending' } }),
        ChatReport.count({ where: { status: 'resolved' } }),
        UserBlock.count(),
        ChatReport.findAll({
          limit: 10,
          order: [['created-at', 'DESC']],
          include: [
            {
              model: User,
              as: 'reporter',
              attributes: ['id', 'first-name', 'last-name']
            },
            {
              model: User,
              as: 'reportedUser',
              attributes: ['id', 'first-name', 'last-name']
            }
          ]
        })
      ]);

      return {
        stats: {
          totalReports,
          pendingReports,
          resolvedReports,
          totalBlocks
        },
        recentReports
      };
    } catch (error) {
      console.error('Error getting moderation dashboard:', error);
      throw error;
    }
  }
}

module.exports = ModerationService;

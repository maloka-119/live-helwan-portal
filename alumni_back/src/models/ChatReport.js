const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ChatReport = sequelize.define('ChatReport', {
  report_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reporter_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'User', key: 'id' }
  },
  reported_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'User', key: 'id' }
  },
  chat_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Chat', key: 'chat_id' }
  },
  message_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Message', key: 'message_id' }
  },
  reason: {
    type: DataTypes.ENUM('spam', 'harassment', 'inappropriate_content', 'fake_profile', 'other'),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'reviewed', 'resolved', 'dismissed'),
    defaultValue: 'pending'
  },
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  'created-at': {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  'updated-at': {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'ChatReport',
  timestamps: false
});

// Define associations
ChatReport.associate = function(models) {
  ChatReport.belongsTo(models.User, { foreignKey: 'reporter_id', as: 'reporter' });
  ChatReport.belongsTo(models.User, { foreignKey: 'reported_user_id', as: 'reportedUser' });
  ChatReport.belongsTo(models.Chat, { foreignKey: 'chat_id' });
  ChatReport.belongsTo(models.Message, { foreignKey: 'message_id' });
};

module.exports = ChatReport;

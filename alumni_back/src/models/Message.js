const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Message = sequelize.define('Message', {
  message_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  chat_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Chat', key: 'chat_id' }
  },
  sender_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'User', key: 'id' }
  },
  receiver_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'User', key: 'id' }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  message_type: {
    type: DataTypes.ENUM('text', 'image', 'file', 'system'),
    defaultValue: 'text'
  },
  attachment_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  attachment_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  attachment_size: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  attachment_mime_type: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('sent', 'delivered', 'read'),
    defaultValue: 'sent'
  },
  is_edited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  edited_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reply_to_message_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Message', key: 'message_id' }
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
  tableName: 'Message',
  timestamps: false,
  indexes: [
    {
      fields: ['chat_id']
    },
    {
      fields: ['sender_id']
    },
    {
      fields: ['receiver_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created-at']
    }
  ]
});

// Define associations
Message.associate = function(models) {
  Message.belongsTo(models.Chat, { foreignKey: 'chat_id' });
  Message.belongsTo(models.User, { foreignKey: 'sender_id', as: 'sender' });
  Message.belongsTo(models.User, { foreignKey: 'receiver_id', as: 'receiver' });
  Message.belongsTo(models.Message, { foreignKey: 'reply_to_message_id', as: 'replyTo' });
  Message.hasMany(models.Message, { foreignKey: 'reply_to_message_id', as: 'replies' });
};

module.exports = Message;

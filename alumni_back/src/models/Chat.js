const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Chat = sequelize.define('Chat', {
  chat_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user1_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'User', key: 'id' }
  },
  user2_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'User', key: 'id' }
  },
  last_message_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Message', key: 'message_id' }
  },
  last_message_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  user1_unread_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  user2_unread_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
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
  tableName: 'Chat',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['user1_id', 'user2_id']
    },
    {
      fields: ['user1_id']
    },
    {
      fields: ['user2_id']
    }
  ]
});

// Define associations
Chat.associate = function(models) {
  Chat.belongsTo(models.User, { foreignKey: 'user1_id', as: 'user1' });
  Chat.belongsTo(models.User, { foreignKey: 'user2_id', as: 'user2' });
  Chat.belongsTo(models.Message, { foreignKey: 'last_message_id', as: 'lastMessage' });
  Chat.hasMany(models.Message, { foreignKey: 'chat_id' });
};

module.exports = Chat;

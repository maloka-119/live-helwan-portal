const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserPresence = sequelize.define('UserPresence', {
  presence_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: 'User', key: 'id' }
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'away', 'busy'),
    defaultValue: 'offline'
  },
  last_seen: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  socket_id: {
    type: DataTypes.STRING,
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
  tableName: 'UserPresence',
  timestamps: false
});

// Define associations
UserPresence.associate = function(models) {
  UserPresence.belongsTo(models.User, { foreignKey: 'user_id' });
};

module.exports = UserPresence;

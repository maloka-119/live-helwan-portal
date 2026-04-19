const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserBlock = sequelize.define('UserBlock', {
  block_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  blocker_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'User', key: 'id' }
  },
  blocked_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'User', key: 'id' }
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  'created-at': {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'UserBlock',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['blocker_id', 'blocked_id']
    }
  ]
});

// Define associations
UserBlock.associate = function(models) {
  UserBlock.belongsTo(models.User, { foreignKey: 'blocker_id', as: 'blocker' });
  UserBlock.belongsTo(models.User, { foreignKey: 'blocked_id', as: 'blocked' });
};

module.exports = UserBlock;

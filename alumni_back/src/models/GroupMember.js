const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Group = require('./Group');
const User = require('./User');

const GroupMember = sequelize.define('GroupMember', {
  'group-id': { type: DataTypes.INTEGER, references: { model: Group, key: 'id' } },
  'user-id': { type: DataTypes.INTEGER, references: { model: User, key: 'id' } }
}, { tableName: 'GroupMember', timestamps: false });

Group.belongsToMany(User, { through: GroupMember, foreignKey: 'group-id' });
User.belongsToMany(Group, { through: GroupMember, foreignKey: 'user-id' });

module.exports = GroupMember;

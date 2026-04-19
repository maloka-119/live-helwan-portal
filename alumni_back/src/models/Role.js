const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Role = sequelize.define('Role', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  'role-name': { type: DataTypes.STRING }
}, { tableName: 'Role', timestamps: false });

module.exports = Role;

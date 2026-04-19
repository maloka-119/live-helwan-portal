const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

const Request = sequelize.define('Request', {
  request_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  'request-type': { type: DataTypes.STRING },
  sub_type: { type: DataTypes.STRING },
  'required-info': { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('completed','in prograss') },
  'user-id': { type: DataTypes.INTEGER, references: { model: User, key: 'id' } },
  'created-at': { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'Request', timestamps: false });

Request.belongsTo(User, { foreignKey: 'user-id' });
module.exports = Request;

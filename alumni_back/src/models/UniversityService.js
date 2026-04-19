// models/UniversityService.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UniversityService = sequelize.define('UniversityService', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'title is required' },
    },
  },
  pref: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: { msg: 'الـ pref مطلوب' },
    },
  },
  details: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'university_services',
  timestamps: false,     // زي ما انتِ عايزة
  paranoid: true,        // عشان deletedAt يشتغل
  indexes: [
    { unique: true, fields: ['pref'] }
  ]
});

module.exports = UniversityService;
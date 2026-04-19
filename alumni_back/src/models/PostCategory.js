const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const PostCategory = sequelize.define('PostCategory', {
  category_id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    unique: true,
    validate: {
      notEmpty: true,
      len: [1, 50]
    }
  },
  description: { 
    type: DataTypes.TEXT, 
    allowNull: true 
  },
  is_default: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
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
  tableName: 'PostCategory', 
  timestamps: false 
});

module.exports = PostCategory;

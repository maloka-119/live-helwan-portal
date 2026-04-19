const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Group = sequelize.define(
  "Group",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    "group-name": { type: DataTypes.STRING },
    description: { type: DataTypes.STRING },
    "created-date": { type: DataTypes.DATE },
    "group-image": { type: DataTypes.STRING },
  
    faculty_code: {
      type: DataTypes.STRING,
      allowNull: true, 
    },
    graduation_year: {
      type: DataTypes.INTEGER,
      allowNull: true, 
    },
  },
  { tableName: "Group", timestamps: false }
);

module.exports = Group;

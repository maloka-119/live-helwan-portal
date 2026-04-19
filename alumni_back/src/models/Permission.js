const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Permission = sequelize.define(
  "Permission",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },

    // ✅ الحقول الجديدة عشان ترجع كل التفاصيل
    "can-view": { type: DataTypes.BOOLEAN, defaultValue: false },
    "can-edit": { type: DataTypes.BOOLEAN, defaultValue: false },
    "can-delete": { type: DataTypes.BOOLEAN, defaultValue: false },
    "can-add": { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: "Permission",
    timestamps: false,
  }
);

module.exports = Permission;

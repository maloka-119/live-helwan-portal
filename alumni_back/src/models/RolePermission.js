const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Role = require("./Role");
const Permission = require("./Permission");
const RolePermission = sequelize.define(
  "RolePermission",
  {
    role_id: {
      type: DataTypes.INTEGER,
      references: { model: Role, key: "id" },
      primaryKey: true,
      allowNull: false,
    },
    permission_id: {
      type: DataTypes.INTEGER,
      references: { model: Permission, key: "id" },
      primaryKey: true,
      allowNull: false,
    },
    "can-view": { type: DataTypes.BOOLEAN, defaultValue: false },
    "can-edit": { type: DataTypes.BOOLEAN, defaultValue: false },
    "can-delete": { type: DataTypes.BOOLEAN, defaultValue: false },
    "can-add": { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: "RolePermission",
    timestamps: false,
    freezeTableName: true,
  }
);
module.exports = RolePermission;

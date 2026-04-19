const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Staff = require("./Staff");
const Role = require("./Role");

const StaffRole = sequelize.define(
  "StaffRole",
  {
    staff_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Staff, key: "id" }, // عادة مفتاح Staff هو id
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Role, key: "id" },
    },
  },
  { tableName: "StaffRole", timestamps: false }
);

// 🔹 M:N relationship
Staff.belongsToMany(Role, {
  through: StaffRole,
  foreignKey: "staff_id",
  otherKey: "role_id",
});
Role.belongsToMany(Staff, {
  through: StaffRole,
  foreignKey: "role_id",
  otherKey: "staff_id",
});

// 🔹 1:N relationship لتسهيل الـ include
StaffRole.belongsTo(Staff, { foreignKey: "staff_id" });
StaffRole.belongsTo(Role, { foreignKey: "role_id" });
Staff.hasMany(StaffRole, { foreignKey: "staff_id" });
Role.hasMany(StaffRole, { foreignKey: "role_id" });

module.exports = StaffRole;

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const User = require("./User");

const Feedback = sequelize.define(
  "Feedback",
  {
    feedback_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    category: {
      type: DataTypes.ENUM("Complaint", "Suggestion"),
      allowNull: false,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    details: { type: DataTypes.TEXT, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    attachment: { type: DataTypes.STRING, allowNull: true },
    graduate_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: "id" },
      onDelete: "CASCADE",
    },
  },
  {
    tableName: "Feedback",
    timestamps: true,
    underscored: true, // ← يولد created_at و updated_at بدل camelCase
  }
);

Feedback.belongsTo(User, { foreignKey: "graduate_id" });
User.hasMany(Feedback, { foreignKey: "graduate_id" });

module.exports = Feedback;

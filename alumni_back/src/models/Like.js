const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Like = sequelize.define(
  "Like",
  {
    like_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    "post-id": {
      type: DataTypes.INTEGER,
      references: { model: "Post", key: "post_id" }, // اسم الجدول كـ string
    },
    "user-id": {
      type: DataTypes.INTEGER,
      references: { model: "User", key: "id" }, // اسم الجدول كـ string
    },
  },
  { tableName: "Like", timestamps: false }
);

module.exports = Like;

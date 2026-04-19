const User = require("./User");
const RefreshToken = require("./RefreshToken");
const Graduate = require("./Graduate"); // 🔥 اضيفي دي

// Define associations
RefreshToken.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

User.hasMany(RefreshToken, {
  foreignKey: "user_id",
  as: "refreshTokens",
});

// 🔥 اضيفي الـassociations للـGraduate
User.hasMany(Graduate, {
  foreignKey: "created_by",
  as: "graduates",
});

Graduate.belongsTo(User, {
  foreignKey: "created_by",
  as: "creator",
});

module.exports = {
  User,
  RefreshToken,
  Graduate, // 🔥 واضيفي دي في الـexports
};

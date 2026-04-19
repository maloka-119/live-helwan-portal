const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Graduate = require("./Graduate");

const Friendship = sequelize.define(
  "Friendship",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    sender_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Graduate",
        key: "graduate_id",
      },
      onDelete: "CASCADE",
    },
    receiver_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Graduate",
        key: "graduate_id",
      },
      onDelete: "CASCADE",
    },
    status: {
      type: DataTypes.ENUM("pending", "accepted"),
      defaultValue: "pending",
    },
    hidden_for_receiver: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "Friendships",
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["sender_id", "receiver_id"],
      },
    ],
  }
);

// Associations
Friendship.belongsTo(Graduate, { as: "sender", foreignKey: "sender_id" });
Friendship.belongsTo(Graduate, { as: "receiver", foreignKey: "receiver_id" });

Graduate.hasMany(Friendship, { as: "sentRequests", foreignKey: "sender_id" });
Graduate.hasMany(Friendship, { as: "receivedRequests", foreignKey: "receiver_id" });

module.exports = Friendship;

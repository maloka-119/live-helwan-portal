const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    "first-name": { type: DataTypes.STRING },
    "last-name": { type: DataTypes.STRING },
    "national-id": { type: DataTypes.STRING, unique: true },
    email: { type: DataTypes.STRING, unique: true },
    "phone-number": { type: DataTypes.STRING },
    "hashed-password": { type: DataTypes.STRING, allowNull: true }, // Allow null for OAuth users
    "birth-date": { type: DataTypes.DATE },
    "user-type": { type: DataTypes.ENUM("graduate", "staff", "admin") },
    "verification-code": { type: DataTypes.STRING, allowNull: true },
    "verification-code-expires": { type: DataTypes.DATE, allowNull: true },

    // Google OAuth
    google_id: { type: DataTypes.STRING, allowNull: true, unique: true },
    google_access_token: { type: DataTypes.TEXT, allowNull: true },
    google_refresh_token: { type: DataTypes.TEXT, allowNull: true },
    google_profile_url: { type: DataTypes.STRING, allowNull: true },
    google_token_expires_at: { type: DataTypes.DATE, allowNull: true },

    // LinkedIn OAuth
    linkedin_id: { type: DataTypes.STRING, allowNull: true, unique: true },
    linkedin_access_token: { type: DataTypes.TEXT, allowNull: true },
    linkedin_refresh_token: { type: DataTypes.TEXT, allowNull: true },
    linkedin_token_expires_at: { type: DataTypes.DATE, allowNull: true },
    linkedin_profile_url: { type: DataTypes.STRING, allowNull: true },
    linkedin_headline: { type: DataTypes.TEXT, allowNull: true },
    linkedin_location: { type: DataTypes.STRING, allowNull: true },
    is_linkedin_verified: { type: DataTypes.BOOLEAN, defaultValue: false },

    profile_picture_url: { type: DataTypes.STRING, allowNull: true },
    auth_provider: { type: DataTypes.ENUM("local", "linkedin", "google"), defaultValue: "local" },
    show_phone: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: "User",
    timestamps: false,
  }
);

module.exports = User;

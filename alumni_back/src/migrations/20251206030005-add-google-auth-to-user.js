'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Google OAuth columns
    await queryInterface.addColumn('User', 'google_id', { type: Sequelize.STRING, unique: true, allowNull: true });
    await queryInterface.addColumn('User', 'google_access_token', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn('User', 'google_refresh_token', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn('User', 'google_profile_url', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('User', 'google_token_expires_at', { type: Sequelize.DATE, allowNull: true });

    // Update auth_provider ENUM to include "google"
    await queryInterface.changeColumn('User', 'auth_provider', {
      type: Sequelize.ENUM("local", "linkedin", "google"),
      defaultValue: "local",
      allowNull: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove Google OAuth columns
    await queryInterface.removeColumn('User', 'google_id');
    await queryInterface.removeColumn('User', 'google_access_token');
    await queryInterface.removeColumn('User', 'google_refresh_token');
    await queryInterface.removeColumn('User', 'google_profile_url');
    await queryInterface.removeColumn('User', 'google_token_expires_at');

    // Revert auth_provider ENUM (remove "google")
    await queryInterface.changeColumn('User', 'auth_provider', {
      type: Sequelize.ENUM("local", "linkedin"),
      defaultValue: "local",
      allowNull: false,
    });
  }
};

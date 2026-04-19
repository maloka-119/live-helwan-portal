'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('User', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      'first-name': {
        type: Sequelize.STRING,
        allowNull: false
      },
      'last-name': {
        type: Sequelize.STRING,
        allowNull: false
      },
      'national-id': {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },
      email: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },
      'phone-number': {
        type: Sequelize.STRING
      },
      'hashed-password': {
        type: Sequelize.STRING,
        allowNull: false
      },
      'birth-date': {
        type: Sequelize.DATE
      },
      'user-type': {
        type: Sequelize.ENUM('graduate', 'staff', 'admin'),
        allowNull: false
      },
      'verification-code': {
        type: Sequelize.STRING,
        allowNull: true
      },
      'verification-code-expires': {
        type: Sequelize.DATE,
        allowNull: true
      },
      linkedin_id: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      },
      linkedin_access_token: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      linkedin_refresh_token: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      linkedin_token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      profile_picture_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      linkedin_profile_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      linkedin_headline: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      linkedin_location: {
        type: Sequelize.STRING,
        allowNull: true
      },
      auth_provider: {
        type: Sequelize.ENUM('local', 'linkedin'),
        defaultValue: 'local'
      },
      show_phone: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      'created-at': {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      'updated-at': {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('User');
  }
};
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Graduate', {
      graduate_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      bio: {
        type: Sequelize.STRING,
        allowNull: true
      },
      'current-job': {
        type: Sequelize.STRING,
        allowNull: true
      },
      'cv-url': {
        type: Sequelize.STRING,
        allowNull: true
      },
      faculty_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      'profile-picture-url': {
        type: Sequelize.STRING,
        allowNull: true
      },
      'graduation-year': {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      skills: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        defaultValue: 'active'
      },
      show_cv: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      cv_public_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      'status-to-login': {
        type: Sequelize.ENUM('accepted', 'pending', 'rejected'),
        defaultValue: 'pending'
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

    await queryInterface.addIndex('Graduate', ['faculty_code']);
    await queryInterface.addIndex('Graduate', ['graduation-year']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Graduate');
  }
};
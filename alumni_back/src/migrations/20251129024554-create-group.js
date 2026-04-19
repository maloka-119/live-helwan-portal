'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Group', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      'group-name': {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true
      },
      'created-date': {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      'group-image': {
        type: Sequelize.STRING,
        allowNull: true
      },
      faculty_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      graduation_year: {
        type: Sequelize.INTEGER,
        allowNull: true
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
    await queryInterface.dropTable('Group');
  }
};
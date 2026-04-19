'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Permission', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      'can-view': {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      'can-edit': {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      'can-delete': {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      'can-add': {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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
    await queryInterface.dropTable('Permission');
  }
};
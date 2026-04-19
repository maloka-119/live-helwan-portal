'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Request', {
      request_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      'request-type': {
        type: Sequelize.STRING,
        allowNull: false
      },
      sub_type: {
        type: Sequelize.STRING,
        allowNull: true
      },
      'required-info': {
        type: Sequelize.STRING,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('completed', 'in prograss'),
        defaultValue: 'in prograss'
      },
      'user-id': {
        type: Sequelize.INTEGER,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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

    await queryInterface.addIndex('Request', ['user-id']);
    await queryInterface.addIndex('Request', ['status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Request');
  }
};
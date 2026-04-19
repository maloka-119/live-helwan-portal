'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('DocumentRequest', {
      document_request_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      graduate_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Graduate',
          key: 'graduate_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      staff_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Staff',
          key: 'staff_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
      'created-at': {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      'updated-at': {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('DocumentRequest', ['graduate_id']);
    await queryInterface.addIndex('DocumentRequest', ['staff_id']);
    await queryInterface.addIndex('DocumentRequest', ['status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('DocumentRequest');
  }
};
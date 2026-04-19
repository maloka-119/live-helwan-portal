'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('RolePermission', {
      role_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: {
          model: 'Role',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      permission_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: {
          model: 'Permission',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
    await queryInterface.dropTable('RolePermission');
  }
};
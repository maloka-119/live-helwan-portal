'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('GroupMember', {
      'group-id': {
        type: Sequelize.INTEGER,
        references: {
          model: 'Group',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
      }
    });

    await queryInterface.addConstraint('GroupMember', {
      fields: ['group-id', 'user-id'],
      type: 'primary key'
    });

    await queryInterface.addIndex('GroupMember', ['group-id']);
    await queryInterface.addIndex('GroupMember', ['user-id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('GroupMember');
  }
};
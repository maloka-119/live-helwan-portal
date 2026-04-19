'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Notification', {
      notification_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      'receiver-id': {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      'sender-id': {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      type: {
        type: Sequelize.ENUM(
          'add_user',
          'accept_request',
          'added_to_group',
          'like',
          'comment',
          'reply',
          'edit_comment',
          'delete_comment',
          'message',
          'announcement',
          'role_update'
        ),
        allowNull: false
      },
      message: {
        type: Sequelize.STRING,
        allowNull: false
      },
      'is-read': {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      navigation: {
        type: Sequelize.JSON,
        allowNull: true
      },
      'created-at': {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('Notification', ['receiver-id']);
    await queryInterface.addIndex('Notification', ['sender-id']);
    await queryInterface.addIndex('Notification', ['is-read']);
    await queryInterface.addIndex('Notification', ['created-at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Notification');
  }
};
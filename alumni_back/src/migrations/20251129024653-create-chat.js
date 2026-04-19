'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Chat', {
      chat_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user1_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user2_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      last_message_id: {
        type: Sequelize.INTEGER,
        allowNull: true
        // سيتم إضافة المرجع لاحقاً بعد إنشاء جدول Message
      },
      last_message_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      user1_unread_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      user2_unread_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      is_active: {
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

    await queryInterface.addIndex('Chat', ['user1_id', 'user2_id'], {
      unique: true
    });
    await queryInterface.addIndex('Chat', ['user1_id']);
    await queryInterface.addIndex('Chat', ['user2_id']);
    await queryInterface.addIndex('Chat', ['last_message_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Chat');
  }
};
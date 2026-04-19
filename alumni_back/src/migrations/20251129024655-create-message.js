'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Message', {
      message_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      chat_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Chat',
          key: 'chat_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sender_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      receiver_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      message_type: {
        type: Sequelize.ENUM('text', 'image', 'file', 'system'),
        defaultValue: 'text'
      },
      attachment_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      attachment_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      attachment_size: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      attachment_mime_type: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('sent', 'delivered', 'read'),
        defaultValue: 'sent'
      },
      is_edited: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      edited_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_deleted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      reply_to_message_id: {
        type: Sequelize.INTEGER,
        allowNull: true
        // سيتم إضافة المرجع لاحقاً
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

    await queryInterface.addIndex('Message', ['chat_id']);
    await queryInterface.addIndex('Message', ['sender_id']);
    await queryInterface.addIndex('Message', ['receiver_id']);
    await queryInterface.addIndex('Message', ['status']);
    await queryInterface.addIndex('Message', ['created-at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Message');
  }
};
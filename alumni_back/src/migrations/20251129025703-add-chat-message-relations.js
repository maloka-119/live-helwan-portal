'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // إضافة العلاقة بين Chat و Message لـ last_message_id
    await queryInterface.addConstraint('Chat', {
      fields: ['last_message_id'],
      type: 'foreign key',
      name: 'fk_chat_last_message',
      references: {
        table: 'Message',
        field: 'message_id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // إضافة العلاقة بين Message و Message لـ reply_to_message_id
    await queryInterface.addConstraint('Message', {
      fields: ['reply_to_message_id'],
      type: 'foreign key',
      name: 'fk_message_reply_to',
      references: {
        table: 'Message',
        field: 'message_id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('Chat', 'fk_chat_last_message');
    await queryInterface.removeConstraint('Message', 'fk_message_reply_to');
  }
};
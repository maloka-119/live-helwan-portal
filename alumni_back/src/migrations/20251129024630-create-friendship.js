'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Friendships', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      sender_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Graduate',
          key: 'graduate_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      receiver_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Graduate',
          key: 'graduate_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted'),
        defaultValue: 'pending'
      },
      hidden_for_receiver: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('Friendships', ['sender_id', 'receiver_id'], {
      unique: true
    });
    await queryInterface.addIndex('Friendships', ['sender_id']);
    await queryInterface.addIndex('Friendships', ['receiver_id']);
    await queryInterface.addIndex('Friendships', ['status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Friendships');
  }
};
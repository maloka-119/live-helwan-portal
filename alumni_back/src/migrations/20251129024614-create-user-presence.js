'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('UserPresence', {
      presence_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      status: {
        type: Sequelize.ENUM('online', 'offline', 'away', 'busy'),
        defaultValue: 'offline'
      },
      last_seen: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      socket_id: {
        type: Sequelize.STRING,
        allowNull: true
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

    await queryInterface.addIndex('UserPresence', ['user_id'], {
      unique: true
    });
    await queryInterface.addIndex('UserPresence', ['status']);
    await queryInterface.addIndex('UserPresence', ['last_seen']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('UserPresence');
  }
};
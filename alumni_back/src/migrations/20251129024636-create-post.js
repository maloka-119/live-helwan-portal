'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Post', {
      post_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      category: {
        type: Sequelize.ENUM(
          'Event',
          'Job opportunity',
          'News',
          'Internship',
          'Success story',
          'General'
        ),
        allowNull: false,
        defaultValue: 'General'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      'author-id': {
        type: Sequelize.INTEGER,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      'group-id': {
        type: Sequelize.INTEGER,
        references: {
          model: 'Group',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      'in-landing': {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      'is-hidden': {
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

    await queryInterface.addIndex('Post', ['author-id']);
    await queryInterface.addIndex('Post', ['group-id']);
    await queryInterface.addIndex('Post', ['category']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Post');
  }
};
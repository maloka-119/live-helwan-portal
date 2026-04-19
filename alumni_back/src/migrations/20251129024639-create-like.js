'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Like', {
      like_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      'post-id': {
        type: Sequelize.INTEGER,
        references: {
          model: 'Post',
          key: 'post_id'
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

    await queryInterface.addIndex('Like', ['post-id']);
    await queryInterface.addIndex('Like', ['user-id']);
    
    // لمنع الإعجاب المزدوج
    await queryInterface.addConstraint('Like', {
      fields: ['post-id', 'user-id'],
      type: 'unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Like');
  }
};
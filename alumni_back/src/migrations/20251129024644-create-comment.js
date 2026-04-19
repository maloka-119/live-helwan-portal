'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Comment', {
      comment_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      content: {
        type: Sequelize.STRING,
        allowNull: false
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
      'author-id': {
        type: Sequelize.INTEGER,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      'parent-comment-id': {
        type: Sequelize.INTEGER,
        references: {
          model: 'Comment',
          key: 'comment_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        allowNull: true
      },
      edited: {
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

    await queryInterface.addIndex('Comment', ['post-id']);
    await queryInterface.addIndex('Comment', ['author-id']);
    await queryInterface.addIndex('Comment', ['parent-comment-id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Comment');
  }
};
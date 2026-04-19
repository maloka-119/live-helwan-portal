'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PostImage', {
      post_image_id: {
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
      'image-url': {
        type: Sequelize.STRING,
        allowNull: false
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

    await queryInterface.addIndex('PostImage', ['post-id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('PostImage');
  }
};
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('FAQ', {
      faq_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      question_ar: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      question_en: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      answer_ar: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      answer_en: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      category: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'General'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'User',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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

    await queryInterface.addIndex('FAQ', ['category']);
    await queryInterface.addIndex('FAQ', ['is_active']);
    await queryInterface.addIndex('FAQ', ['order']);
    await queryInterface.addIndex('FAQ', ['created_by']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('FAQ');
  }
};
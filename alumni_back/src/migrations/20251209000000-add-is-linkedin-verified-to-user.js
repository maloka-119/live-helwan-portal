'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add is_linkedin_verified column to User table
    await queryInterface.addColumn('User', 'is_linkedin_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove is_linkedin_verified column
    await queryInterface.removeColumn('User', 'is_linkedin_verified');
  }
};


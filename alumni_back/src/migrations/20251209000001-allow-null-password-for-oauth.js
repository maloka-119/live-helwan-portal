'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Allow null password for OAuth users (LinkedIn/Google)
    await queryInterface.changeColumn('User', 'hashed-password', {
      type: Sequelize.STRING,
      allowNull: true // Allow null for OAuth users
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert to NOT NULL (but this might fail if there are OAuth users)
    await queryInterface.changeColumn('User', 'hashed-password', {
      type: Sequelize.STRING,
      allowNull: false
    });
  }
};


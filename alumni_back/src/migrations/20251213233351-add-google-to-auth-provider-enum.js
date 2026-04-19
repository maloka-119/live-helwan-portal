'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_User_auth_provider"
      ADD VALUE IF NOT EXISTS 'google';
    `);
  },

  async down(queryInterface, Sequelize) {
    // لا يمكن حذف enum value في PostgreSQL بسهولة
  }
};

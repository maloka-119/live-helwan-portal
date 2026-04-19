"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Rename existing columns
    await queryInterface.renameColumn("Feedback", "created-at", "created_at");
    await queryInterface.renameColumn("Feedback", "updated-at", "updated_at");

    // Optional: Set default values if حابب
    await queryInterface.changeColumn("Feedback", "created_at", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    });
    await queryInterface.changeColumn("Feedback", "updated_at", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    });
  },

  async down(queryInterface, Sequelize) {
    // Rollback: rename back to original
    await queryInterface.renameColumn("Feedback", "created_at", "created-at");
    await queryInterface.renameColumn("Feedback", "updated_at", "updated-at");
  },
};

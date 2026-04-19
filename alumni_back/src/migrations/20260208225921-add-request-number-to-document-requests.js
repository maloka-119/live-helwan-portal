"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // تحقق إذا كان العمود موجود أصلاً
    const tableInfo = await queryInterface.describeTable("DocumentRequest");

    if (!tableInfo.request_number) {
      await queryInterface.addColumn("DocumentRequest", "request_number", {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true,
        defaultValue: null,
      });

      // نعمل index للعمود
      await queryInterface.addIndex("DocumentRequest", ["request_number"], {
        name: "document_request_request_number_idx",
        unique: true,
      });

      console.log("✅ Added request_number column to DocumentRequest");
    } else {
      console.log("⚠️ request_number column already exists");
    }
  },

  down: async (queryInterface, Sequelize) => {
    // نمسح العمود
    await queryInterface.removeColumn("DocumentRequest", "request_number");
    console.log("✅ Removed request_number column from DocumentRequest");
  },
};

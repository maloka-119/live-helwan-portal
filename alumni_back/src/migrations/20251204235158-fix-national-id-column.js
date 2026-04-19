'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) نغيّر نوع الكولمن إلى STRING ويقبل null
    await queryInterface.changeColumn('User', 'national-id', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    // 2) نصلّح أي قيم موجودة غلط زي [null] أو JSON arrays
    await queryInterface.sequelize.query(`
      UPDATE "User"
      SET "national-id" = NULL
      WHERE "national-id" = '[null]'
         OR "national-id" = '["null"]'
         OR "national-id" = '[]'
         OR "national-id" = '[""]'
         OR "national-id" IS NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    // نرجع الوضع القديم (لو محتاجة rollback)
    await queryInterface.changeColumn('User', 'national-id', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
      unique: true
    });
  }
};

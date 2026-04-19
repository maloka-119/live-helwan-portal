'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('university_services', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      pref: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      details: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
      // ملاحظة: ما حطيناش createdAt و updatedAt لأنك عاملة timestamps: false
    });

    // إضافة index على الـ pref عشان البحث السريع + الـ unique يكون أقوى
    await queryInterface.addIndex('university_services', ['pref'], {
      unique: true,
      name: 'uniq_university_services_pref'
    });

    // إضافة check بسيط على title و pref إنهم مش فاضيين (بديل الـ validate في الموديل)
    // SQLite مش بيدعم CHECK constraints بشكل قوي، لكن MySQL و PostgreSQL بيدعموا
    // لو بتستخدمي SQLite هتتجاهل السطر ده تلقائيًا ومفيش مشكلة
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE university_services
        ADD CONSTRAINT check_title_not_empty CHECK (title <> '');
      `);
      await queryInterface.sequelize.query(`
        ALTER TABLE university_services
        ADD CONSTRAINT check_pref_not_empty CHECK (pref <> '');
      `);
    } catch (e) {
      // لو SQLite هيرمي خطأ لأنه مش بيدعم CHECK، فهنتجاهله
      console.log('CHECK constraints skipped (probably using SQLite)');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('university_services');
  }
};

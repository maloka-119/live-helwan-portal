"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. مسح الـ Default Value الحالية لتجنب تعارض الأنواع (حل المشكلة الأساسية)
    await queryInterface.sequelize.query(`
      ALTER TABLE "DocumentRequest" 
      ALTER COLUMN status DROP DEFAULT;
    `);

    // 2. مسح الـ Constraint لو موجود لتجنب أي تعارض أثناء التغيير
    await queryInterface.sequelize.query(`
      ALTER TABLE "DocumentRequest" 
      DROP CONSTRAINT IF EXISTS "DocumentRequest_status_check";
    `);

    // 3. التأكد من حذف النوع المؤقت لو كان موجوداً من محاولة فاشلة سابقة
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_DocumentRequest_status_new";
    `);

    // 4. إنشاء الـ ENUM الجديد بكل الحالات المطلوبة
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_DocumentRequest_status_new" AS ENUM (
        'pending',
        'under_review', 
        'approved',
        'ready_for_pickup',
        'completed',
        'cancelled'
      );
    `);

    // 5. تغيير نوع العمود واستخدام USING لتحويل القيم القديمة للجديدة
    await queryInterface.sequelize.query(`
      ALTER TABLE "DocumentRequest" 
      ALTER COLUMN status TYPE "enum_DocumentRequest_status_new" 
      USING (
        CASE status::text
          WHEN 'in prograss' THEN 'pending'::"enum_DocumentRequest_status_new"
          WHEN 'completed' THEN 'completed'::"enum_DocumentRequest_status_new"
          ELSE 'pending'::"enum_DocumentRequest_status_new"
        END
      );
    `);

    // 6. حذف الـ ENUM القديم تماماً
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_DocumentRequest_status";
    `);

    // 7. إعادة تسمية النوع الجديد للاسم الأصلي المستهدف
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_DocumentRequest_status_new" 
      RENAME TO "enum_DocumentRequest_status";
    `);

    // 8. تعيين الـ Default Value الجديدة (pending)
    await queryInterface.sequelize.query(`
      ALTER TABLE "DocumentRequest" 
      ALTER COLUMN status SET DEFAULT 'pending';
    `);

    // 9. إضافة الحقول الجديدة للجدول
    await queryInterface.addColumn("DocumentRequest", "request_number", {
      type: Sequelize.STRING,
      unique: true,
      allowNull: true,
    });

    await queryInterface.addColumn("DocumentRequest", "language", {
      type: Sequelize.ENUM("ar", "en"),
      defaultValue: "ar",
      allowNull: false,
    });

    await queryInterface.addColumn("DocumentRequest", "attachments", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "JSON string array of attachment URLs",
    });

    await queryInterface.addColumn("DocumentRequest", "national_id", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "",
    });

    await queryInterface.addColumn("DocumentRequest", "notes", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("DocumentRequest", "expected_completion_date", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("DocumentRequest", "actual_completion_date", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("DocumentRequest", "updated_at", {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    });

    // 10. إضافة الـ Index للحقل request_number لسرعة البحث
    await queryInterface.addIndex("DocumentRequest", ["request_number"], {
      name: "document_request_request_number_idx",
      unique: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // حذف الـ Index
    await queryInterface.removeIndex("DocumentRequest", "document_request_request_number_idx");

    // حذف الحقول المضافة
    const columns = [
      "request_number", "language", "attachments", 
      "national_id", "notes", "expected_completion_date", 
      "actual_completion_date", "updated_at"
    ];
    
    for (const column of columns) {
      await queryInterface.removeColumn("DocumentRequest", column);
    }

    // إعادة الـ Status للوضع القديم (لو احتجت تعمل Undo)
    await queryInterface.sequelize.query('ALTER TABLE "DocumentRequest" ALTER COLUMN status DROP DEFAULT;');
    
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_DocumentRequest_status_old";');
    
    await queryInterface.sequelize.query('CREATE TYPE "enum_DocumentRequest_status_old" AS ENUM (\'completed\', \'in prograss\');');

    await queryInterface.sequelize.query(`
      ALTER TABLE "DocumentRequest" 
      ALTER COLUMN status TYPE "enum_DocumentRequest_status_old" 
      USING (
        CASE status::text
          WHEN 'completed' THEN 'completed'::"enum_DocumentRequest_status_old"
          ELSE 'in prograss'::"enum_DocumentRequest_status_old"
        END
      );
    `);

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_DocumentRequest_status";');
    await queryInterface.sequelize.query('ALTER TYPE "enum_DocumentRequest_status_old" RENAME TO "enum_DocumentRequest_status";');
    await queryInterface.sequelize.query('ALTER TABLE "DocumentRequest" ALTER COLUMN status SET DEFAULT \'in prograss\';');
  },
};
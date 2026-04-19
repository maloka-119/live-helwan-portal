const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Graduate = require("./Graduate");
const Staff = require("./Staff");
const { DOCUMENT_CODES } = require("../constants/documentTypes");

const DocumentRequest = sequelize.define(
  "DocumentRequest",
  {
    document_request_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // 🔢 رقم الطلب الفريد (مثل DR-2024-001)
    request_number: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true, // هيتولد أوتوماتيك أول ما يتعمل الطلب
    },

    graduate_id: {
      type: DataTypes.INTEGER,
      references: { model: Graduate, key: "graduate_id" },
      allowNull: false,
    },

    staff_id: {
      type: DataTypes.INTEGER,
      references: { model: Staff, key: "staff_id" },
      allowNull: true, // ممكن يكون null في البداية
    },

    // 📄 نوع الوثيقة (كود من constants)
    "request-type": {
      type: DataTypes.ENUM(...DOCUMENT_CODES),
      allowNull: false,
      field: "request-type", // علشان نحافظ على اسم العمود في الداتابيز
    },

    // 🌐 لغة الوثيقة (عربي/إنجليزي)
    language: {
      type: DataTypes.ENUM("ar", "en"),
      defaultValue: "ar",
      allowNull: false,
    },

    // 🔍 الحالة الجديدة (6 حالات)
    status: {
      type: DataTypes.ENUM(
        "pending", // ⏳ طلب جديد
        "under_review", // 📋 قيد المراجعة (لشهادة التخرج)
        "approved", // ✅ مقبول ومتجهز
        "ready_for_pickup", // 📦 جاهز للاستلام
        "completed", // 🎉 تم الاستلام
        "cancelled" // ❌ ملغي
      ),
      defaultValue: "pending",
      allowNull: false,
    },

    // 📎 المرفقات (لشهادة التخرج بس) - JSON array
    attachments: {
      type: DataTypes.JSON,
      defaultValue: null,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue("attachments");
        return rawValue ? JSON.parse(rawValue) : null;
      },
      set(value) {
        this.setDataValue("attachments", value ? JSON.stringify(value) : null);
      },
    },

    // 📝 الرقم القومي (الخريج هيدخله مع الطلب)
    national_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // 📝 ملاحظات من الموظف
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // 📅 تاريخ الانتهاء المتوقع
    expected_completion_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // 📅 تاريخ الاستلام الفعلي
    actual_completion_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // ❌ حقل sub_type مش محتاجينه دلوقتي
    // 'required-info' مش محتاجينه برده (هيكون في notes أو attachments)

    "created-at": {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: "created-at",
    },

    // 📅 تاريخ التعديل الأخير
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  },
  {
    tableName: "DocumentRequest",
    timestamps: false, // علشان عندنا created-at و updated_at بنفسنا
    paranoid: false, // مش عايزين soft delete هنا
  }
);

// العلاقات
DocumentRequest.belongsTo(Graduate, { foreignKey: "graduate_id" });
DocumentRequest.belongsTo(Staff, { foreignKey: "staff_id" });
Graduate.hasMany(DocumentRequest, { foreignKey: "graduate_id" });
Staff.hasMany(DocumentRequest, { foreignKey: "staff_id" });

// 🔧 هوك قبل الإنشاء علشان نعمل request_number
DocumentRequest.beforeCreate(async (documentRequest, options) => {
  if (!documentRequest.request_number) {
    const year = new Date().getFullYear();
    const prefix = "DR";

    // نجيب آخر رقم
    const lastRequest = await DocumentRequest.findOne({
      order: [["document_request_id", "DESC"]],
      attributes: ["request_number"],
    });

    let nextNumber = 1;
    if (lastRequest && lastRequest.request_number) {
      const matches = lastRequest.request_number.match(/(\d+)$/);
      if (matches) {
        nextNumber = parseInt(matches[0]) + 1;
      }
    }

    // صيغة: DR-2024-001
    documentRequest.request_number = `${prefix}-${year}-${nextNumber
      .toString()
      .padStart(3, "0")}`;
  }

  // نحسب تاريخ الانتهاء المتوقع
  try {
    const documentType = require("../constants/documentTypes").getDocumentByCode(
      documentRequest["request-type"]
    );
    if (documentType && documentType.base_processing_days) {
      const expectedDate = new Date();
      expectedDate.setDate(
        expectedDate.getDate() + documentType.base_processing_days
      );
      documentRequest.expected_completion_date = expectedDate;
    }
  } catch (err) {
    console.error("Error in beforeCreate hook when getting document type:", err);
    // Don't throw - let the request continue, expected_completion_date will be null
  }
});

// 🔧 هوك قبل التحديث علشان نحدث updated_at
DocumentRequest.beforeUpdate((documentRequest, options) => {
  documentRequest.updated_at = new Date();
});

module.exports = DocumentRequest;

const DocumentType = require("../models/DocumentType");
const { DOCUMENT_TYPES } = require("../constants/documentTypes");

/**
 * Get all available document types with localized names and descriptions
 * @route GET /api/documents/types
 * @access Public
 */
const getAllDocuments = (req, res) => {
  // Extract language preference from Accept-Language header
  const langHeader = req.headers["accept-language"];
  const lang = langHeader && langHeader.toLowerCase() === "en" ? "en" : "ar";

  // Format document types with localized fields based on language preference
  const formattedDocuments = Object.values(DOCUMENT_TYPES).map((doc) => ({
    code: doc.code,
    name: lang === "ar" ? doc.name_ar : doc.name_en,
    description: lang === "ar" ? doc.description_ar : doc.description_en,
    requires_attachments: doc.requires_attachments,
    requires_national_id: doc.requires_national_id,
    base_processing_days: doc.base_processing_days,
  }));

  return res.status(200).json({
    success: true,
    count: formattedDocuments.length,
    language: lang,
    data: formattedDocuments,
  });
};

module.exports = { getAllDocuments };

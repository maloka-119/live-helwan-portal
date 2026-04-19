const express = require("express");
const router = express.Router();
const faqController = require("../controllers/faq.controller");
const authMiddleware = require("../middleware/authMiddleware");

// ==================== PUBLIC ROUTES ====================
// @route   GET /alumni-portal/faqs/categories
// @desc    Get FAQ categories
// @access  Public
router.get("/categories", faqController.getFAQCategories);

// @route   GET /alumni-portal/faqs
// @desc    Get all active FAQs with optional filters
// @access  Public
router.get("/", faqController.getAllFAQs);

// @route   GET /alumni-portal/faqs/:id
// @desc    Get single FAQ
// @access  Public
router.get("/:id", faqController.getFAQ);

// ==================== ADMIN & STAFF ROUTES ====================
// @route   GET /alumni-portal/admin/faqs
// @desc    Get all FAQs (includes inactive) - Admin & Staff only
// @access  Admin & Staff
router.get(
  "/admin/faqs",
  authMiddleware.protect,
  faqController.getAllFAQsAdmin
);

// @route   POST /alumni-portal/admin/faqs
// @desc    Create new FAQ - Admin & Staff only
// @access  Admin & Staff
router.post("/admin/faqs", authMiddleware.protect, faqController.createFAQ);

// @route   PUT /alumni-portal/admin/faqs/:id
// @desc    Update FAQ - Admin & Staff only
// @access  Admin & Staff
router.put("/admin/faqs/:id", authMiddleware.protect, faqController.updateFAQ);

// @route   DELETE /alumni-portal/admin/faqs/:id
// @desc    Soft delete FAQ (mark as inactive) - Admin & Staff only
// @access  Admin & Staff
router.delete(
  "/admin/faqs/:id",
  authMiddleware.protect,
  faqController.deleteFAQ
);

// @route   DELETE /alumni-portal/admin/faqs/:id/hard
// @desc    Hard delete FAQ (permanent removal) - Admin & Staff only
// @access  Admin & Staff
router.delete(
  "/admin/faqs/:id/hard",
  authMiddleware.protect,
  faqController.hardDeleteFAQ
);

// @route   PUT /alumni-portal/admin/faqs/reorder
// @desc    Reorder FAQs - Admin & Staff only
// @access  Admin & Staff
router.put(
  "/admin/faqs/reorder",
  authMiddleware.protect,
  faqController.reorderFAQs
);

module.exports = router;

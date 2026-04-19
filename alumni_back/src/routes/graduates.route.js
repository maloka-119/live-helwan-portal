const express = require("express");
const router = express.Router();
const graduateController = require("../controllers/graduates.controller");
const { protect } = require("../middleware/authMiddleware");
const { uploadFiles } = require("../middleware/uploadProfile");

// ==================== PUBLIC ROUTES ====================
// Get all graduates (public)
router.route("/").get(graduateController.getAllGraduates);

// Get graduate profile by ID (public)
router.route("/:id/profile").get(graduateController.getGraduateProfile);

// Get public graduate profile (new endpoint - public)
router.route("/:id/public-profile").get(graduateController.getPublicGraduateProfile);

// GET CV (public)
router.get("/:id/cv", graduateController.downloadCv);

// Search graduates (public)
router.get("/search", graduateController.searchGraduates);

// ==================== AUTHENTICATED USERS ROUTES ====================
// Update graduate profile (protected - graduates only)
router.put("/profile", protect, uploadFiles, graduateController.updateProfile);

// Get digital ID (protected - graduates only)
router.route("/digital-id").get(protect, graduateController.getDigitalID);

// Generate QR code for Digital ID (protected - graduates only)
router.route("/digital-id/qr").get(protect, graduateController.generateDigitalIDQR);

// Verify QR token and return Digital ID (public - no auth required)
router.route("/digital-id/verify/:token").get(graduateController.verifyDigitalIDQR);

// Get graduate profile for user (protected)
router.get(
  "/profile/:identifier",
  protect,
  graduateController.getGraduateProfileForUser
);

// ==================== ADMIN & STAFF ROUTES ====================
// Approve graduate (Admin & Staff only)
router.put("/approve/:id", protect, graduateController.approveGraduate);

// Reject graduate (Admin & Staff only)
router.put("/reject/:id", protect, graduateController.rejectGraduate);

// Get approved graduates (Admin & Staff only)
router.get("/approved", protect, graduateController.getGraduatesInPortal);

// Get requested graduates (Admin & Staff only)
router.get("/requested", protect, graduateController.getRequestedGraduates);

// Update graduate status (Admin & Staff only)
router.put("/:id/status", protect, graduateController.updateGraduateStatus);

module.exports = router;

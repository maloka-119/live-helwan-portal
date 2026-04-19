// src/routes/staff.route.js
const express = require("express");
const router = express.Router();
const staffController = require("../controllers/staff.Controller");
const authMiddleware = require("../middleware/authMiddleware");

// POST /alumni-portal/staff/create
// POST /alumni-portal/staff/create
router.post(
  "/create",
  authMiddleware.protect,
  (req, res, next) => {
    // التحقق من أن المستخدم Admin
    if (req.user && req.user["user-type"] === "admin") {
      next();
    } else {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Admin only.",
      });
    }
  },
  staffController.createStaff
);

// GET /alumni-portal/staff/profile
router.get("/profile", authMiddleware.protect, staffController.getStaffProfile);

// PUT /alumni-portal/staff/:id/status
router.put(
  "/:id/status",
  authMiddleware.protect,
  (req, res, next) => {
    if (
      req.user &&
      (req.user["user-type"] === "admin" || req.user["user-type"] === "staff")
    ) {
      next();
    } else {
      return res
        .status(403)
        .json({ message: "Access denied. Admins or staff only." });
    }
  },
  staffController.updateStaffStatus
);

// GET /alumni-portal/staff/
router.route("/").get(
  authMiddleware.protect,
  (req, res, next) => {
    if (
      req.user &&
      (req.user["user-type"] === "admin" || req.user["user-type"] === "staff")
    ) {
      next();
    } else {
      return res
        .status(403)
        .json({ message: "Access denied. Admins or staff only." });
    }
  },
  staffController.getAllStaff
);

module.exports = router;

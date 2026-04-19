// src/routes/permission.route.js
const express = require("express");
const router = express.Router();
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const cloudinary = require("../config/cloudinary"); // م
const authMiddleware = require("../middleware/authMiddleware");
const permissionController = require("../controllers/permission.controller");

// ✅ GET /alumni-portal/permissions
router.get("/", permissionController.getAllPermissions);

module.exports = router;

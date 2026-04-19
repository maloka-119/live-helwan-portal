const express = require("express");
const router = express.Router();
const {
  getAllServices,
  getAllServicesAdmin,
  createService,
  updateService,
  deleteService,
} = require("../controllers/universityService.controller");
const { protect, admin } = require("../middleware/authMiddleware");

// Public
router.get("/", getAllServices);

// Protected routes
router.get("/admin", protect, getAllServicesAdmin);
router.post("/", protect, createService);
router.put("/:id", protect, updateService);
router.delete("/:id", protect, deleteService);

module.exports = router;
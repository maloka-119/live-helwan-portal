const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  forgotPassword,
  verifyCode,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  logoutUser,
} = require("../controllers/auth.controller");

const { protect } = require("../middleware/authMiddleware");
const {
  authLimiter,
  generalLimiter,
  helmetConfig,
  hppProtection,
  sanitizeInput,
  securityMiddleware,
} = require("../middleware/security");
const {
  validateRequest,
  registerSchema,
  loginSchema,
} = require("../middleware/validation");

// ===== Global security middlewares for all routes =====
router.use(helmetConfig); // HTTP headers security
router.use(hppProtection); // HPP protection
router.use(securityMiddleware); // Detect SQLi, XSS, cookies attacks
router.use(sanitizeInput); // Sanitize inputs
router.use(generalLimiter); // Limit general requests

// ===== Public Routes =====

// تسجيل مستخدم جديد مع حماية ضد الـ brute-force
router.post(
  "/register",
  authLimiter, // limit failed attempts
  validateRequest(registerSchema),
  registerUser
);

// تسجيل الدخول
router.post(
  "/login",
  // authLimiter,
  validateRequest(loginSchema),
  loginUser
);

// طلب إعادة كلمة المرور
router.post("/forgot-password", authLimiter, forgotPassword);

// التحقق من كود إعادة كلمة المرور
router.post("/verify-code", authLimiter, verifyCode);

// إعادة تعيين كلمة المرور
router.post("/reset-password", authLimiter, resetPassword);

// ===== Private Routes =====
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.get("/logout", protect, logoutUser);

module.exports = router;

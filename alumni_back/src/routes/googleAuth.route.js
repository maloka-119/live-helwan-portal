
const express = require("express");
const router = express.Router();
const googleAuthController = require("../controllers/googleAuth.controller");

// تسجيل الدخول عبر Google
router.get("/", googleAuthController.loginWithGoogle);

// Google callback
router.get("/callback", googleAuthController.googleCallback);

// تسجيل الدخول فشل
router.get("/failed", googleAuthController.loginFailed);

// تسجيل الخروج
router.get("/logout", googleAuthController.logout);

module.exports = router;
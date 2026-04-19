const asyncHandler = require("express-async-handler");
const axios = require("axios");
const { User } = require("../models");
const { generateAccessToken } = require("../utils/jwt");
const bcrypt = require("bcrypt");

/**
 * POST /auth/login
 * Login with email and password
 */
// const axios = require("axios");

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const response = await axios.post(
      "http://localhost:5005/alumni-portal/login",
      { email, password }
    );

    const data = response.data;

    if (!data || !data.token) {
      return res.status(401).json({ message: "Login failed from alumni portal" });
    }

    const externalToken = data.token;

    console.log("\n📝 CHECKING USER IN SYSTEM2 DATABASE:");
    console.log("   - Looking for user with ID:", data.id);
    console.log("   - User email:", data.email);

    // ===== تجهيز الاسم =====
    let fullName = data.fullName;
    if (!fullName && (data.firstName || data.lastName)) {
      fullName = `${data.firstName || ""} ${data.lastName || ""}`.trim();
    }
    if (!fullName) {
      fullName = email.split("@")[0];
    }

    // ===== تجهيز phone آمن (NOT NULL) =====
    let phone =
      data.phoneNumber ||
      data.phone ||
      `SYNC-${data.id}`; // fallback unique بدل null

    // ===== تجهيز national_id آمن =====
    let nationalId =
      data.nationalId ||
      `SYNC-${data.id}`;

    // ===== باسورد مؤقت =====
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    let user = await User.findByPk(data.id);

    if (!user) {
      console.log("   - User not found, creating new user...");

      user = await User.create({
        id: data.id,
        email: data.email,
        full_name: fullName,
        user_type: data.userType || "graduate",
        national_id: nationalId,
        phone: phone,
        password_hash: hashedPassword,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      console.log("   - ✅ User created successfully with ID:", user.id);
    } else {
      console.log("   - ✅ User found, updating info if changed...");

      await user.update({
        email: data.email,
        full_name: fullName,
        user_type: data.userType || user.user_type,
        national_id: nationalId,
        phone: phone,
        updated_at: new Date(),
      });
    }

    const accessToken = generateAccessToken(user.id);

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      userType: user.user_type,
      token: accessToken,
      externalToken: externalToken,
    });
  } catch (error) {
    console.error("Alumni login error:", error.response?.data || error.message);
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }
});



/**
 * POST /auth/register
 * Register a new user
 */
const register = asyncHandler(async (req, res) => {
  const { fullName, email, nationalId, phone, password } = req.body;

  // Validate input
  if (!fullName || !email || !nationalId || !phone || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Validate password length
  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters long" });
  }

  // Check if user with email already exists
  const existingEmail = await User.findOne({
    where: { email: email.toLowerCase() },
  });
  if (existingEmail) {
    return res.status(400).json({ message: "Email already registered" });
  }

  // Check if user with national ID already exists
  const existingNationalId = await User.findOne({
    where: { national_id: nationalId },
  });
  if (existingNationalId) {
    return res.status(400).json({ message: "National ID already registered" });
  }

  // Create user (password will be automatically hashed by the model hook)
  const user = await User.create({
    full_name: fullName,
    email: email.toLowerCase(),
    national_id: nationalId,
    phone: phone,
    password_hash: password, // Will be hashed by beforeCreate hook
    is_active: true,
  });

  res.status(201).json({
    message: "Account created successfully",
    id: user.id,
    email: user.email,
  });
});

/**
 * POST /auth/create-test-user
 * Create a test user (for development/testing only)
 */
const createTestUser = asyncHandler(async (req, res) => {
  const {
    fullName = "Test User",
    email = "test@example.com",
    nationalId = "12345678901234",
    phone = "01234567890",
    password = "password123",
  } = req.body;

  // Check if user already exists - delete it first to recreate with correct password
  const existingUser = await User.findOne({
    where: { email: email.toLowerCase() },
  });
  if (existingUser) {
    // Delete existing user to recreate with proper password hash
    await existingUser.destroy();
  }

  // Create user (password will be automatically hashed by the model hook)
  const user = await User.create({
    full_name: fullName,
    email: email.toLowerCase(),
    national_id: nationalId,
    phone: phone,
    password_hash: password, // Will be hashed by beforeCreate hook
    is_active: true,
  });

  res.status(201).json({
    message: "Test user created successfully",
    email: user.email,
    id: user.id,
  });
});

/**
 * POST /auth/reset-password
 * Reset password using National ID
 */
const resetPassword = asyncHandler(async (req, res) => {
  // Check if request body exists
  if (!req.body) {
    return res.status(400).json({ message: "Request body is required" });
  }

  const { nationalId, newPassword } = req.body;

  // Validate input
  if (!nationalId || !newPassword) {
    return res
      .status(400)
      .json({ message: "National ID and new password are required" });
  }

  // Validate password length
  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters long" });
  }

  // Find user by National ID
  const user = await User.findOne({ where: { national_id: nationalId } });

  if (!user) {
    return res.status(404).json({ message: "National ID not found" });
  }

  // Check if user is active
  if (!user.is_active) {
    return res
      .status(403)
      .json({ message: "Account is inactive. Please contact support." });
  }

  // Update password (will be automatically hashed by the beforeUpdate hook)
  user.password_hash = newPassword;
  await user.save();

  res.json({
    message: "Password reset successfully",
  });
});

module.exports = {
  login,
  register,
  createTestUser,
  resetPassword,
};

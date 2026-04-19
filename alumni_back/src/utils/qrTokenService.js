const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";
const QR_TOKEN_SECRET = process.env.QR_TOKEN_SECRET || JWT_SECRET + "_qr";
const QR_TOKEN_EXPIRY = 5 * 60; // 5 minutes in seconds

/**
 * Generate a temporary QR token for a user
 * @param {number} userId - The user ID
 * @returns {string} - JWT token
 */
const generateQRToken = (userId) => {
  const payload = {
    userId,
    type: "qr_digital_id",
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, QR_TOKEN_SECRET, {
    expiresIn: QR_TOKEN_EXPIRY,
  });
};

/**
 * Verify and decode a QR token
 * @param {string} token - The QR token to verify
 * @returns {object|null} - Decoded token payload or null if invalid
 */
const verifyQRToken = (token) => {
  try {
    const decoded = jwt.verify(token, QR_TOKEN_SECRET);
    
    // Verify token type
    if (decoded.type !== "qr_digital_id") {
      return null;
    }

    return decoded;
  } catch (error) {
    // Token expired or invalid
    return null;
  }
};

module.exports = {
  generateQRToken,
  verifyQRToken,
  QR_TOKEN_EXPIRY,
};


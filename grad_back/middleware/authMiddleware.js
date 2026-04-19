// middleware/authMiddleware.js
const asyncHandler = require("express-async-handler");
const { verifyAccessToken } = require("../utils/jwt");
const { User } = require("../models");

const protect = asyncHandler(async (req, res, next) => {
  // 🚀🚀🚀 AUTH MIDDLEWARE LOGGING 🚀🚀🚀
  console.log("\n" + "🛡️".repeat(30));
  console.log("🛡️ PROTECT MIDDLEWARE CALLED at:", new Date().toISOString());
  console.log("🛡️".repeat(30));
  
  let token;

  // Check for token in header
  console.log("\n📌 [1] CHECKING HEADERS:");
  console.log("   - Authorization header present:", req.headers.authorization ? "✅ Yes" : "❌ No");
  
  if (req.headers.authorization) {
    console.log("   - Authorization header starts with Bearer:", 
      req.headers.authorization.startsWith("Bearer") ? "✅ Yes" : "❌ No");
  }

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];
      console.log("\n📌 [2] TOKEN EXTRACTED:");
      console.log("   - Token length:", token.length);
      console.log("   - Token preview:", token.substring(0, 20) + "...");
      console.log("   - Token full (first 50 chars):", token.substring(0, 50));

      // Try to decode without verification just to see payload (optional)
      try {
        const base64Payload = token.split('.')[1];
        const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
        console.log("   - Token payload (unverified):", payload);
      } catch (e) {
        console.log("   - Could not decode token payload:", e.message);
      }

      // Verify token
      console.log("\n📌 [3] VERIFYING TOKEN:");
      const decoded = verifyAccessToken(token);
      console.log("   - Decoded token:", decoded ? JSON.stringify(decoded, null, 2) : "❌ null");

      if (!decoded) {
        console.log("   ❌ Token verification failed - decoded is null");
        return res.status(401).json({ message: "Not authenticated" });
      }

      console.log("\n📌 [4] LOOKING FOR USER:");
      console.log("   - Looking for user with ID:", decoded.userId);
      
      // Get user from token (without password)
      req.user = await User.findByPk(decoded.userId, {
        attributes: { exclude: ["password_hash"] },
      });

      console.log("   - User found in database:", req.user ? "✅ Yes" : "❌ No");
      
      if (req.user) {
        console.log("   - User ID:", req.user.id);
        console.log("   - User email:", req.user.email);
        console.log("   - User full_name:", req.user.full_name);
        console.log("   - User type:", req.user.user_type);
      } else {
        console.log("   ⚠️ User ID", decoded.userId, "not found in database");
      }

      if (!req.user) {
        console.log("   ❌ No user found - authentication failed");
        return res.status(401).json({ message: "Not authenticated" });
      }

      console.log("\n✅ AUTHENTICATION SUCCESSFUL - proceeding to next middleware");
      console.log("🛡️".repeat(30) + "\n");
      
      next();
    } catch (error) {
      console.error("\n❌ TOKEN VERIFICATION ERROR:");
      console.error("   - Error name:", error.name);
      console.error("   - Error message:", error.message);
      console.error("   - Error stack:", error.stack);
      console.error("🛡️".repeat(30) + "\n");
      return res.status(401).json({ message: "Not authenticated" });
    }
  } else {
    console.log("\n📌 [1] No Bearer token found in headers");
  }

  if (!token) {
    console.log("\n❌ NO TOKEN PROVIDED - authentication failed");
    console.log("🛡️".repeat(30) + "\n");
    return res.status(401).json({ message: "Not authenticated" });
  }
});

module.exports = { protect };
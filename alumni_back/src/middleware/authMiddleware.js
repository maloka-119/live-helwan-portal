// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const Staff = require("../models/Staff");

// Protect middleware (أي يوزر: graduate, staff, admin)
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const secret = process.env.JWT_SECRET || "your_jwt_secret_key_here";
      const decoded = jwt.verify(token, secret);

      // جرب الأول تجيب اليوزر من جدول Users
      let user = await User.findByPk(decoded.id);

      // لو مش لاقي في Users ممكن يكون Staff
      if (!user) {
        const staff = await Staff.findByPk(decoded.id, { include: User });
        if (staff) {
          user = await User.findByPk(staff.staff_id);
        }
      }

      if (!user) {
        return res
          .status(401)
          .json({ message: "Not authorized, user not found" });
      }

      req.user = user; // خزّن بيانات اليوزر في request
      next();
    } catch (error) {
      console.error("Auth middleware error:", error.message);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  } else {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
});

// Role middlewares
const admin = asyncHandler(async (req, res, next) => {
  if (req.user && req.user["user-type"] === "admin") {
    next();
  } else {
    return res.status(403).json({ message: "Not authorized as an admin" });
  }
});

const staff = asyncHandler(async (req, res, next) => {
  if (req.user && req.user["user-type"] === "staff") {
    next();
  } else {
    return res.status(403).json({ message: "Not authorized as staff" });
  }
});

const staffTypeOnly = (staffType) => {
  return asyncHandler(async (req, res, next) => {
    const staffProfile = await Staff.findOne({
      where: { staff_id: req.user.id },
    });
    if (staffProfile && staffProfile.staffType === staffType) {
      next();
    } else {
      return res
        .status(403)
        .json({ message: `Not authorized as ${staffType} staff` });
    }
  });
};

const graduateOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user["user-type"] === "graduate") {
    next();
  } else {
    return res.status(403).json({ message: "Not authorized as a graduate" });
  }
});

module.exports = {
  protect,
  admin,
  staff,
  staffTypeOnly,
  graduateOnly,
};

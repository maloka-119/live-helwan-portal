const express = require("express");
const { Sequelize } = require("sequelize");
const { Op } = require("sequelize");
const Graduate = require("../models/Graduate");
const Staff = require("../models/Staff");
const Role = require("../models/Role");
const StaffRole = require("../models/StaffRole");
const Permission = require("../models/Permission");
const RolePermission = require("../models/RolePermission");
const Post = require("../models/Post");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { getCollegeNameByCode } = require("../services/facultiesService"); // ⬅️ أضف هذا الاستيراد

const router = express.Router();

// ✳️ ربط العلاقات لو مش معمول قبل كده
Post.belongsTo(User, { foreignKey: "author-id" });
User.hasMany(Post, { foreignKey: "author-id" });

const canViewPortalReports = async (staffId) => {
  const permission = await Permission.findOne({
    where: { name: "Portal Reports" },
    attributes: ["id"],
  });

  if (!permission) return false;

  const staffRoles = await StaffRole.findAll({
    where: { staff_id: staffId },
    attributes: ["role_id"],
    raw: true,
  });

  const roleIds = staffRoles.map((staffRole) => staffRole.role_id);
  if (roleIds.length === 0) return false;

  const rolePermission = await RolePermission.findOne({
    where: {
      role_id: { [Op.in]: roleIds },
      permission_id: permission.id,
      "can-view": true,
    },
    attributes: ["role_id"],
  });

  return Boolean(rolePermission);
};

// ⬅️ أضف authMiddleware.protect هنا
router.get("/reports-stats", authMiddleware.protect, async (req, res) => {
  try {
    const user = req.user;
    console.log("🔍 User in reports-stats:", user);

    const allowedUserTypes = ["admin", "staff"];

    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
      });
    }

    if (user["user-type"] === "staff") {
      const hasPermission = await canViewPortalReports(user.id);

      if (!hasPermission) {
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to view portal reports.",
        });
      }
    }

    const totalGraduates = await Graduate.count();
    const activeGraduates = await Graduate.count({
      where: { status: "active" },
    });
    const inactiveGraduates = await Graduate.count({
      where: { status: "inactive" },
    });

    const acceptedGraduates = await Graduate.count({
      where: { "status-to-login": "accepted" },
    });
    const pendingGraduates = await Graduate.count({
      where: { "status-to-login": "pending" },
    });
    const rejectedGraduates = await Graduate.count({
      where: { "status-to-login": "rejected" },
    });

    const totalStaff = await Staff.count();
    const activeStaff = await Staff.count({
      where: { "status-to-login": "active" },
    });
    const inactiveStaff = await Staff.count({
      where: { "status-to-login": "inactive" },
    });

    const postsByGraduates = await Post.count({
      include: [
        { model: User, where: { "user-type": "graduate" }, attributes: [] },
      ],
    });

    const postsByStaff = await Post.count({
      include: [
        { model: User, where: { "user-type": "staff" }, attributes: [] },
      ],
    });

    // 🏫 الكليات (مع حذف null)
    const graduatesByFacultyData = await Graduate.findAll({
      attributes: [
        "faculty_code",
        [Sequelize.fn("COUNT", Sequelize.col("faculty_code")), "count"],
      ],
      group: ["faculty_code"],
      raw: true,
    });

    const lang = req.headers["accept-language"] || user.language || "ar";

    const graduatesByFaculty = graduatesByFacultyData
      .filter(item => item.faculty_code !== null && item.faculty_code !== "")
      .map(item => ({
        faculty: getCollegeNameByCode(item.faculty_code, lang),
        count: item.count,
      }));

    const staffRoles = await StaffRole.findAll({
      include: [{ model: Role, attributes: ["role-name"] }],
      attributes: [
        "role_id",
        [Sequelize.fn("COUNT", Sequelize.col("role_id")), "count"],
      ],
      group: ["role_id", "Role.id"],
    });

    const totalUsers = totalGraduates + totalStaff;
    const activeUsers = activeGraduates + activeStaff;
    const activePercentage =
      totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : "0.0";

    res.status(200).json({
      status: "success",
      message: "Portal reports fetched successfully",
      data: {
        totalGraduates,
        activeGraduates,
        inactiveGraduates,
        acceptedGraduates,
        pendingGraduates,
        rejectedGraduates,
        totalStaff,
        activeStaff,
        inactiveStaff,
        postsByGraduates,
        postsByStaff,
        graduatesByFaculty,
        staffRoles,
        activePercentage,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error.message,
    });
  }
});

module.exports = router; 

const express = require("express");
const { Sequelize } = require("sequelize");
const Graduate = require("../models/Graduate");
const Staff = require("../models/Staff");
const Role = require("../models/Role");
const StaffRole = require("../models/StaffRole");
const Post = require("../models/Post");
const User = require("../models/User");
const checkStaffPermission = require("../utils/permissionChecker");
const authMiddleware = require("../middleware/authMiddleware");
const { getCollegeNameByCode } = require("../services/facultiesService"); // ⬅️ أضف هذا الاستيراد

const router = express.Router();

// ✳️ ربط العلاقات لو مش معمول قبل كده
Post.belongsTo(User, { foreignKey: "author-id" });
User.hasMany(Post, { foreignKey: "author-id" });

// ⬅️ أضف authMiddleware.protect هنا
router.get("/reports-stats", authMiddleware.protect, async (req, res) => {
  try {
    const user = req.user;
    console.log("🔍 User in reports-stats:", user);

    // 1. تحديد اليوزر types المسموح لهم
    const allowedUserTypes = ["admin", "staff"];

    // 2. لو مش من النوع المسموح → ارفض
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
      });
    }

    // 3. لو staff → تحقق من الصلاحية
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Portal Reports",
        "view"
      );

      if (!hasPermission) {
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to view portal reports.",
        });
      }
    }

    // 4. لو admin أو staff مع صلاحية → اتركه يكمل
    // 👩‍🎓 إجمالي وعدد حالات الخريجين
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

    // 👨‍🏫 إجمالي وعدد حالات أعضاء هيئة التدريس
    const totalStaff = await Staff.count();
    const activeStaff = await Staff.count({
      where: { "status-to-login": "active" },
    });
    const inactiveStaff = await Staff.count({
      where: { "status-to-login": "inactive" },
    });

    // 📢 عدد البوستات من كل نوع مستخدم
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

    // 🏫 عدد الخريجين في كل كلية - التعديل هنا
    const graduatesByFacultyData = await Graduate.findAll({
      attributes: [
        "faculty_code",
        [Sequelize.fn("COUNT", Sequelize.col("faculty_code")), "count"],
      ],
      group: ["faculty_code"],
      raw: true,
    });

    // تحويل faculty_code إلى اسم الكلية
    const lang = req.headers["accept-language"] || user.language || "ar";
    const graduatesByFaculty = graduatesByFacultyData.map(item => ({
      faculty: getCollegeNameByCode(item.faculty_code, lang),
      count: item.count
    }));

    // 🧑‍🏫 توزيع أعضاء هيئة التدريس حسب الـ Role
    const staffRoles = await StaffRole.findAll({
      include: [{ model: Role, attributes: ["role-name"] }],
      attributes: [
        "role_id",
        [Sequelize.fn("COUNT", Sequelize.col("role_id")), "count"],
      ],
      group: ["role_id", "Role.id"],
    });

    // 📊 نسبة التفاعل العامة
    const totalUsers = totalGraduates + totalStaff;
    const activeUsers = activeGraduates + activeStaff;
    const activePercentage =
      totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : "0.0";

    // ✅ الإحصائيات النهائية بنفس ترتيب الـ frontend المطلوب
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
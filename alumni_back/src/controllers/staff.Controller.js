// src/controllers/staff.controller.js
// src/controllers/staff.controller.js
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const Staff = require("../models/Staff");
const User = require("../models/User");
const HttpStatusHelper = require("../utils/HttpStatuHelper");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const RolePermission = require("../models/RolePermission");
const checkStaffPermission = require("../utils/permissionChecker");
const aes = require("../utils/aes");

const { logger, securityLogger } = require("../utils/logger");

const getAllStaff = async (req, res) => {
  logger.info("----- [getAllStaff] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    logger.debug("Getting all staff request", {
      userType: req.user?.["user-type"],
      userId: req.user?.id,
    });

    const allowedUserTypes = ["admin", "staff"];
    if (!allowedUserTypes.includes(req.user["user-type"])) {
      logger.warn("ACCESS DENIED in getAllStaff", {
        userType: req.user["user-type"],
        allowedUserTypes,
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
        data: [],
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Staff management",
        "view"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED in getAllStaff", {
          userId: req.user.id,
          requiredPermission: "Staff management",
        });
        return res.status(403).json({
          status: "error",
          message: "Access denied. You don't have permission to view staff.",
          data: [],
        });
      }
      logger.info("Staff permission check passed", { userId: req.user.id });
    }

    const staff = await Staff.findAll({
      include: [
        {
          model: User,
          attributes: [
            "id",
            "first-name",
            "last-name",
            "national-id",
            "email",
            "phone-number",
            "birth-date",
            "user-type",
          ],
        },
        {
          model: Role,
          attributes: ["role-name"],
          through: { attributes: [] },
        },
      ],
    });

    const staffWithDecryptedId = staff.map((s) => {
      const obj = s.toJSON();

      if (obj.User?.["national-id"]) {
        obj.User["national-id"] = aes.decryptNationalId(
          obj.User["national-id"]
        );
      }

      return obj;
    });

    logger.info("Staff list fetched successfully", {
      staffCount: staff.length,
      userType: req.user["user-type"],
    });
    logger.info("----- [getAllStaff] END SUCCESS -----", {
      staffCount: staff.length,
    });

    return res.status(200).json({
      status: "success",
      message: "All staff fetched successfully with roles",
      data: staffWithDecryptedId,
    });
  } catch (err) {
    logger.error("----- [getAllStaff] Unexpected Error", {
      error: err.message,
      stack: err.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error(err);
    return res.status(500).json({
      status: "error",
      message: "Error fetching staff with roles",
      data: [],
    });
  }
};

const updateStaffStatus = async (req, res) => {
  logger.info("----- [updateStaffStatus] START -----", {
    staffId: req.params.id,
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { id } = req.params;
    const { status } = req.body;

    logger.debug("Update staff status request", {
      staffId: id,
      newStatus: status,
      userType: req.user?.["user-type"],
    });

    const allowedUserTypes = ["admin", "staff"];

    if (!allowedUserTypes.includes(req.user["user-type"])) {
      logger.warn("ACCESS DENIED in updateStaffStatus", {
        userType: req.user["user-type"],
        allowedUserTypes,
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
        data: null,
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Staff management",
        "edit"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED in updateStaffStatus", {
          userId: req.user.id,
          staffId: id,
          requiredPermission: "Staff management",
        });
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to update staff status.",
          data: null,
        });
      }
      logger.info("Staff permission check passed", { userId: req.user.id });
    }

    if (!["active", "inactive"].includes(status)) {
      logger.warn("Invalid status value in updateStaffStatus", {
        staffId: id,
        status,
        validStatuses: ["active", "inactive"],
      });
      return res.status(400).json({
        status: HttpStatusHelper.FAIL,
        message: "Invalid status value. Must be 'active' or 'inactive'.",
        data: null,
      });
    }

    const staff = await Staff.findByPk(id, { include: [{ model: User }] });

    if (!staff) {
      logger.warn("Staff not found in updateStaffStatus", { staffId: id });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Staff not found",
        data: null,
      });
    }

    logger.info("Staff found, updating status", {
      staffId: id,
      staffName: `${staff.User["first-name"]} ${staff.User["last-name"]}`,
      oldStatus: staff["status-to-login"],
      newStatus: status,
    });

    staff["status-to-login"] = status;
    await staff.save();

    logger.info("Staff status updated successfully", {
      staffId: id,
      staffName: `${staff.User["first-name"]} ${staff.User["last-name"]}`,
      newStatus: status,
    });

    logger.info("----- [updateStaffStatus] END SUCCESS -----", {
      staffId: id,
      status,
    });

    return res.json({
      status: HttpStatusHelper.SUCCESS,
      message: `Staff status updated to ${status} successfully`,
      data: {
        staffId: staff.staff_id,
        fullName: `${staff.User["first-name"]} ${staff.User["last-name"]}`,
        status: staff["status-to-login"],
      },
    });
  } catch (err) {
    logger.error("----- [updateStaffStatus] Unexpected Error", {
      staffId: req.params.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR || "error",
      message: err.message,
      data: null,
    });
  }
};

const getStaffProfile = async (req, res) => {
  logger.info("----- [getStaffProfile] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const userId = req.user.id;

    logger.debug("Get staff profile request", {
      userId,
      userType: req.user["user-type"],
    });

    const allowedUserTypes = ["admin", "staff"];

    if (!allowedUserTypes.includes(req.user["user-type"])) {
      logger.warn("ACCESS DENIED in getStaffProfile", {
        userType: req.user["user-type"],
        allowedUserTypes,
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
      });
    }

    if (req.user["user-type"] === "staff") {
      logger.info("Staff accessing own profile (no permission needed)", {
        userId,
      });
    } else if (req.user["user-type"] === "admin") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Staff management",
        "view"
      );
      if (!hasPermission) {
        logger.warn("ADMIN PERMISSION DENIED in getStaffProfile", {
          userId: req.user.id,
          requiredPermission: "Staff management - view",
        });
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to view staff profiles.",
        });
      }
      logger.info("Admin permission check passed", { userId: req.user.id });
    }

    const staff = await Staff.findByPk(userId, {
      include: [
        {
          model: User,
          attributes: [
            "id",
            "first-name",
            "last-name",
            "national-id",
            "email",
            "phone-number",
            "birth-date",
            "user-type",
          ],
        },
        {
          model: Role,
          through: { attributes: [] },
          attributes: ["id", "role-name"],
          include: [
            {
              model: RolePermission,
              include: [
                {
                  model: Permission,
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!staff || !staff.User) {
      logger.warn("Staff profile not found", { userId });
      return res.status(404).json({
        status: "error",
        message: "Staff profile not found",
      });
    }

    logger.info("Staff profile found", {
      userId,
      staffName: `${staff.User["first-name"]} ${staff.User["last-name"]}`,
      rolesCount: staff.Roles.length,
    });

    let decryptedNationalId = null;
    if (staff.User["national-id"]) {
      try {
        decryptedNationalId = aes.decryptNationalId(staff.User["national-id"]);
      } catch (decryptError) {
        logger.error("Failed to decrypt National ID", {
          userId,
          error: decryptError.message,
        });
        decryptedNationalId = "**************";
      }
    }

    const profileData = {
      fullName: `${staff.User["first-name"]} ${staff.User["last-name"]}`,
      nationalId: decryptedNationalId,
      email: staff.User.email,
      phoneNumber: staff.User["phone-number"],
      birthDate: staff.User["birth-date"],
      userType: staff.User["user-type"],
      status: staff["status-to-login"],
      roles: staff.Roles.map((role) => ({
        role_id: role.id,
        name: role["role-name"],
        permissions: role.RolePermissions.map((rp) => ({
          name: rp.Permission.name,
          "can-view": rp["can-view"] || false,
          "can-edit": rp["can-edit"] || false,
          "can-delete": rp["can-delete"] || false,
          "can-add": rp["can-add"] || false,
        })),
      })),
    };

    logger.info("Staff profile data formatted successfully", {
      userId,
      rolesCount: profileData.roles.length,
      permissionsCount: profileData.roles.reduce(
        (sum, role) => sum + role.permissions.length,
        0
      ),
      nationalIdDecrypted: !!decryptedNationalId,
    });

    logger.info("----- [getStaffProfile] END SUCCESS -----", { userId });

    return res.status(200).json({
      status: "success",
      message: "Staff profile retrieved successfully",
      data: profileData,
    });
  } catch (error) {
    logger.error(" [getStaffProfile] Unexpected Error", {
      error: error.message,
      stack: error.stack?.substring(0, 300),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error fetching staff profile:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch staff profile",
    });
  }
};
// src/controllers/staff.controller.js
// أضف هذه الدالة مع الدوال الموجودة

// src/controllers/staff.controller.js
// أضف هذه الدالة مع الدوال الموجودة

const createStaff = async (req, res) => {
  logger.info("----- [createStaff] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  console.log("📥 Request body from frontend:", req.body); // لل debugging

  // بداية الـ Transaction
  const transaction = await sequelize.transaction();

  try {
    // ✅ استقبال البيانات من الفرونت (بنفس أسماء الحقول في الفرونت)
    const { full_name, national_id, email, password, phone } = req.body;

    logger.debug("Create staff request", {
      full_name,
      email,
      phone,
      userType: req.user?.["user-type"],
    });

    // ✅ 1. التحقق من البيانات المطلوبة
    if (!full_name || !national_id || !email || !password) {
      logger.warn("Missing required fields in createStaff");
      await transaction.rollback();
      return res.status(400).json({
        status: "error",
        message:
          "Missing required fields: full_name, national_id, email, password are required",
        data: null,
      });
    }

    // ✅ 2. التحقق من عدم تكرار البيانات
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ "national-id": national_id }, { email: email }],
      },
    });

    if (existingUser) {
      logger.warn("Duplicate entry in createStaff");
      await transaction.rollback();
      return res.status(400).json({
        status: "error",
        message: "National ID or Email already exists",
        data: null,
      });
    }

    // ✅ 3. Split full_name إلى first-name و last-name
    const nameParts = full_name.trim().split(" ");
    const first_name = nameParts[0] || "";
    const last_name = nameParts.slice(1).join(" ") || "";

    // ✅ 4. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ 5. تشفير الرقم القومي باستخدام aes
    let encryptedNationalId = null;
    try {
      encryptedNationalId = aes.encryptNationalId(national_id);
      logger.debug("National ID encrypted successfully");
    } catch (encryptError) {
      logger.error("Failed to encrypt National ID", {
        error: encryptError.message,
      });
      await transaction.rollback();
      return res.status(500).json({
        status: "error",
        message: "Failed to process national ID",
        data: null,
      });
    }

    // ✅ 6. إنشاء User جديد
    const newUser = await User.create(
      {
        "first-name": first_name,
        "last-name": last_name,
        "national-id": encryptedNationalId,
        email: email,
        "phone-number": phone || null, // ✅ phone من الفرونت بتتحول لـ phone-number
        "hashed-password": hashedPassword,
        "birth-date": null,
        "user-type": "staff",
        auth_provider: "local",
      },
      { transaction }
    );

    logger.info("User created successfully", { userId: newUser.id });

    // ✅ 7. إنشاء Staff مرتبط بالـ User
    const newStaff = await Staff.create(
      {
        staff_id: newUser.id,
        "status-to-login": "active",
      },
      { transaction }
    );

    logger.info("Staff record created successfully", {
      staffId: newStaff.staff_id,
    });

    // ✅ 8. Commit transaction
    await transaction.commit();

    // ✅ 9. جلب البيانات الكاملة
    const createdStaff = await Staff.findByPk(newStaff.staff_id, {
      include: [
        {
          model: User,
          attributes: [
            "id",
            "first-name",
            "last-name",
            "national-id",
            "email",
            "phone-number",
            "user-type",
          ],
        },
        {
          model: Role,
          attributes: ["id", "role-name"],
          through: { attributes: [] },
        },
      ],
    });

    // ✅ 10. فك تشفير الرقم القومي للـ response
    let decryptedNationalId = null;
    if (createdStaff.User["national-id"]) {
      try {
        decryptedNationalId = aes.decryptNationalId(
          createdStaff.User["national-id"]
        );
      } catch (decryptError) {
        logger.error("Failed to decrypt National ID for response");
        decryptedNationalId = "**************";
      }
    }

    // ✅ 11. تنسيق الـ response حسب ما يتوقعه الفرونت
    const responseData = {
      staff_id: createdStaff.staff_id,
      "status-to-login": createdStaff["status-to-login"],
      User: {
        "first-name": createdStaff.User["first-name"],
        "last-name": createdStaff.User["last-name"],
        "national-id": decryptedNationalId,
        email: createdStaff.User.email,
        // إضافة phone-number للـ response (اختياري)
      },
      Roles: createdStaff.Roles || [],
    };

    logger.info("Staff account created successfully", {
      staffId: createdStaff.staff_id,
      fullName: `${createdStaff.User["first-name"]} ${createdStaff.User["last-name"]}`,
    });

    // ✅ 12. الـ response بالشكل اللي الفرونت يتوقعه
    return res.status(201).json({
      success: true, // 👈 الفرونت بيعمل check على res.data.success
      status: "success",
      message: "Staff account created successfully",
      data: responseData, // 👈 الفرونت بيستخدم res.data.data
    });
  } catch (error) {
    await transaction.rollback();
    logger.error("----- [createStaff] Unexpected Error", {
      error: error.message,
      stack: error.stack?.substring(0, 300),
    });
    console.error("Error creating staff:", error);

    return res.status(500).json({
      success: false, // 👈 عشان يكون consistent
      status: "error",
      message: "Internal server error while creating staff account",
      data: null,
    });
  }
};

module.exports = {
  getAllStaff,
  updateStaffStatus,
  getStaffProfile,
  createStaff,
};

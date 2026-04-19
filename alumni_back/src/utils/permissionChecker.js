const Staff = require("../models/Staff");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
// تأكد تحميل العلاقة Staff <-> Role (through StaffRole) عشان الـ include يشتغل
require("../models/StaffRole");

const checkStaffPermission = async (
  staffId,
  requiredPermission,
  requiredAction
) => {
  try {
    if (staffId == null || staffId === undefined) {
      console.log("❌ checkStaffPermission: staffId is missing");
      return false;
    }

    console.log(
      `🔍 Checking permission: ${requiredPermission} - ${requiredAction} for staff: ${staffId}`
    );

    // 1. جيب الستاف مع الـ roles والـ permissions
    const staff = await Staff.findByPk(staffId, {
      include: [
        {
          model: Role,
          include: [
            {
              model: Permission,
              through: {
                attributes: ["can-view", "can-edit", "can-delete", "can-add"],
              },
            },
          ],
        },
      ],
    });

    if (!staff) {
      console.log("❌ Staff not found");
      return false;
    }

    // تجنب TypeError لو الـ Roles مش محملة أو مش مصفوفة (مثلاً لو الـ association مش مضبوط)
    const roles = staff.Roles != null && Array.isArray(staff.Roles) ? staff.Roles : [];
    console.log(`📋 Staff has ${roles.length} roles`);

    for (const role of roles) {
      const roleName = role != null ? role["role-name"] : "";
      console.log(`🔹 Checking role: ${roleName}`);

      const permissions = role.Permissions != null && Array.isArray(role.Permissions) ? role.Permissions : [];
      for (const perm of permissions) {
        const rp = perm.RolePermission || {};
        console.log(
          `   Permission: ${perm?.name} - view:${rp["can-view"]}, edit:${rp["can-edit"]}`
        );

        if (perm && perm.name === requiredPermission) {
          if (requiredAction === "view" && rp["can-view"]) {
            console.log(`✅ Permission granted: ${requiredPermission} - view`);
            return true;
          }
          if (requiredAction === "edit" && rp["can-edit"]) {
            console.log(`✅ Permission granted: ${requiredPermission} - edit`);
            return true;
          }
          if (requiredAction === "delete" && rp["can-delete"]) {
            console.log(`✅ Permission granted: ${requiredPermission} - delete`);
            return true;
          }
          if (requiredAction === "add" && rp["can-add"]) {
            console.log(`✅ Permission granted: ${requiredPermission} - add`);
            return true;
          }
        }
      }
    }

    console.log(
      `❌ Permission denied: ${requiredPermission} - ${requiredAction}`
    );
    return false;
  } catch (error) {
    console.error("❌ Error checking permission:", error);
    return false;
  }
};

module.exports = checkStaffPermission;

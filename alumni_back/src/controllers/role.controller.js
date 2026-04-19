// src/controllers/role.controller.js
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const RolePermission = require("../models/RolePermission");
const Staff = require("../models/Staff");
const StaffRole = require("../models/StaffRole");
const User = require("../models/User");
const { Op } = require("sequelize");
const { notifyRoleUpdate } = require("../services/notificationService");

const { logger, securityLogger } = require("../utils/logger");

const createRole = async (req, res) => {
  logger.info("----- [createRole] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { roleName, permissions } = req.body;

    logger.debug("Create role request details", {
      roleName,
      permissionsCount: permissions?.length || 0,
      user: req.user,
    });

    if (!roleName) {
      logger.warn("Missing role name in createRole");
      return res.status(400).json({
        status: "error",
        message: "Role name is required",
      });
    }

    logger.info("Creating new role", { roleName });

    const role = await Role.create({ "role-name": roleName });

    logger.info("Role created successfully", { roleId: role.id, roleName });

    const allPermissions = await Permission.findAll();

    const updatedPermissions = allPermissions.map((perm) => {
      const matched = permissions?.find((p) => p.permission_id === perm.id);

      let canView = matched ? matched["can-view"] : false;
      let canEdit = matched ? matched["can-edit"] : false;
      let canDelete = matched ? matched["can-delete"] : false;
      let canAdd = matched ? matched["can-add"] : false;

      if (perm.name === "Reports") {
        canEdit = false;
        canDelete = false;
        canAdd = false;
      }

      return {
        id: perm.id,
        name: perm.name,
        "can-view": canView,
        "can-edit": canEdit,
        "can-delete": canDelete,
        "can-add": canAdd,
      };
    });

    logger.info("Processing permissions for role", {
      roleId: role.id,
      totalPermissions: updatedPermissions.length,
    });

    await Promise.all(
      updatedPermissions.map(async (perm) => {
        await RolePermission.create({
          role_id: role.id,
          permission_id: perm.id,
          "can-view": perm["can-view"],
          "can-edit": perm["can-edit"],
          "can-delete": perm["can-delete"],
          "can-add": perm["can-add"],
        });
      })
    );

    logger.info("Role permissions created successfully", { roleId: role.id });

    logger.info("----- [createRole] END SUCCESS -----", {
      roleId: role.id,
      roleName,
    });

    return res.status(201).json({
      status: "success",
      message: "Role created successfully",
      role: {
        id: role.id,
        "role-name": role["role-name"],
        permissions: updatedPermissions,
      },
    });
  } catch (error) {
    logger.error("----- [createRole] Unexpected Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      roleName: req.body.roleName,
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error creating role:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to create role",
      error: error.message,
    });
  }
};

const getAllRolesWithPermissions = async (req, res) => {
  logger.info("----- [getAllRolesWithPermissions] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    logger.info("Fetching all roles with permissions");

    const roles = await Role.findAll({
      include: [
        {
          model: Permission,
          through: {
            attributes: ["can-view", "can-edit", "can-delete", "can-add"],
          },
        },
      ],
    });

    if (!roles || roles.length === 0) {
      logger.warn("No roles found in getAllRolesWithPermissions");
      return res.status(404).json({
        status: "error",
        message: "No roles found",
        data: [],
      });
    }

    logger.info("Roles fetched successfully", { rolesCount: roles.length });

    logger.info("----- [getAllRolesWithPermissions] END SUCCESS -----", {
      rolesCount: roles.length,
    });

    return res.status(200).json({
      status: "success",
      message: "Roles retrieved successfully",
      data: roles,
    });
  } catch (err) {
    logger.error("----- [getAllRolesWithPermissions] Error", {
      error: err.message,
      stack: err.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error fetching roles:", err);
    return res.status(500).json({
      status: "error",
      message: err.message,
      data: [],
    });
  }
};

const assignRoleToStaff = async (req, res) => {
  logger.info("----- [assignRoleToStaff] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { staffId, roles } = req.body;

    logger.debug("Assign role to staff request", {
      staffId,
      roles: roles || [],
      rolesCount: roles?.length || 0,
    });

    if (!staffId || !roles || !Array.isArray(roles)) {
      logger.warn("Invalid request in assignRoleToStaff", {
        hasStaffId: !!staffId,
        hasRoles: !!roles,
        isArray: Array.isArray(roles),
      });
      return res.status(400).json({
        status: "error",
        message: "staffId and roles array are required",
      });
    }

    const staff = await Staff.findByPk(staffId, {
      include: {
        model: User,
        attributes: ["first-name", "last-name", "email"],
      },
    });

    if (!staff) {
      logger.warn("Staff not found in assignRoleToStaff", { staffId });
      return res
        .status(404)
        .json({ status: "error", message: "Staff not found" });
    }

    const validRoles = await Role.findAll({ where: { id: roles } });

    if (validRoles.length === 0) {
      logger.warn("No valid roles found in assignRoleToStaff", {
        requestedRoles: roles,
        foundRoles: validRoles.length,
      });
      return res
        .status(404)
        .json({ status: "error", message: "No valid roles found" });
    }

    logger.info("Valid roles found", {
      staffId,
      validRolesCount: validRoles.length,
      validRoleNames: validRoles.map((r) => r["role-name"]),
    });

    const existingStaffRoles = await StaffRole.findAll({
      where: { staff_id: staffId },
    });

    const rolesToAdd = validRoles.filter(
      (r) => !existingStaffRoles.some((er) => er.role_id === r.id)
    );

    logger.info("Roles to assign", {
      staffId,
      rolesToAddCount: rolesToAdd.length,
      rolesToAddNames: rolesToAdd.map((r) => r["role-name"]),
      existingRolesCount: existingStaffRoles.length,
    });

    await Promise.all(
      rolesToAdd.map((role) =>
        StaffRole.create({ staff_id: staffId, role_id: role.id })
      )
    );

    if (rolesToAdd.length > 0 && req.user) {
      await notifyRoleUpdate(staffId, req.user.id);
    }

    const updatedStaffRoles = await StaffRole.findAll({
      where: { staff_id: staffId },
      include: [
        {
          model: Role,
          attributes: ["id", "role-name"],
          include: [
            {
              model: Permission,
              as: "Permissions",
              attributes: [
                "id",
                "name",
                "can-view",
                "can-edit",
                "can-delete",
                "can-add",
              ],
            },
          ],
        },
      ],
    });

    logger.info("Roles assigned successfully", {
      staffId,
      staffName: `${staff.User["first-name"]} ${staff.User["last-name"]}`,
      totalAssignedRoles: updatedStaffRoles.length,
    });

    logger.info("----- [assignRoleToStaff] END SUCCESS -----", {
      staffId,
      rolesAssigned: rolesToAdd.length,
    });

    return res.status(200).json({
      status: "success",
      message: "Roles assigned to staff successfully",
      staff: {
        staff_id: staff.staff_id,
        full_name: `${staff.User["first-name"]} ${staff.User["last-name"]}`,
        email: staff.User.email,
        "status-to-login": staff["status-to-login"],
        roles: updatedStaffRoles.map((r) => ({
          role_id: r.Role.id,
          role_name: r.Role["role-name"],
          permissions: r.Role.Permissions || [],
        })),
      },
    });
  } catch (error) {
    logger.error("----- [assignRoleToStaff] Unexpected Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      staffId: req.body.staffId,
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error assigning roles:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to assign roles",
      error: error.message,
    });
  }
};

const viewEmployeesByRole = async (req, res) => {
  logger.info("----- [viewEmployeesByRole] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    logger.info("Fetching employees grouped by roles");

    const roles = await Role.findAll({
      include: [
        {
          model: Staff,
          through: { attributes: [] },
          include: [
            {
              model: User,
              attributes: [
                "id",
                "first-name",
                "last-name",
                "email",
                "phoneNumber",
                "user-type",
              ],
            },
          ],
        },
      ],
    });

    if (!roles || roles.length === 0) {
      logger.warn("No roles found in viewEmployeesByRole");
      return res.status(404).json({
        status: "error",
        message: "No roles found",
      });
    }

    const result = roles.map((role) => ({
      role_id: role.id,
      role_name: role["role-name"],
      employees: role.Staffs.map((staff) => ({
        staff_id: staff.staff_id,
        first_name: staff.User?.["first-name"] || "",
        last_name: staff.User?.["last-name"] || "",
        email: staff.User?.email || "",
        phoneNumber: staff.User?.phoneNumber || "",
        user_type: staff.User?.["user-type"] || "",
      })),
    }));

    logger.info("Employees by role fetched successfully", {
      rolesCount: result.length,
      totalEmployees: result.reduce(
        (sum, role) => sum + role.employees.length,
        0
      ),
    });

    logger.info("----- [viewEmployeesByRole] END SUCCESS -----", {
      rolesCount: result.length,
    });

    res.status(200).json({
      status: "success",
      message: "Employees grouped by roles retrieved successfully",
      data: result,
    });
  } catch (error) {
    logger.error("----- [viewEmployeesByRole] Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error fetching employees by role:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve employees by role",
      error: error.message,
    });
  }
};

const updateRole = async (req, res) => {
  logger.info("----- [updateRole] START -----", {
    roleId: req.params.roleId,
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { roleId } = req.params;
    const { roleName, permissions } = req.body;

    logger.debug("Update role request details", {
      roleId,
      roleName,
      permissionsCount: permissions?.length || 0,
    });

    if (!roleId) {
      logger.warn("Missing roleId in updateRole");
      return res.status(400).json({
        status: "error",
        message: "Role ID is required",
      });
    }

    if (!roleName) {
      logger.warn("Missing roleName in updateRole", { roleId });
      return res.status(400).json({
        status: "error",
        message: "Role name is required",
      });
    }

    const role = await Role.findByPk(roleId);
    if (!role) {
      logger.warn("Role not found in updateRole", { roleId });
      return res.status(404).json({
        status: "error",
        message: "Role not found",
      });
    }

    logger.info("Updating role", {
      roleId,
      oldRoleName: role["role-name"],
      newRoleName: roleName,
    });

    role["role-name"] = roleName;
    await role.save();

    await RolePermission.destroy({ where: { role_id: roleId } });

    logger.info("Old permissions deleted for role", { roleId });

    const allPermissions = await Permission.findAll();

    const updatedPermissions = allPermissions.map((perm) => {
      const matched = permissions?.find((p) => p.permission_id === perm.id);

      let canView = matched ? matched["can-view"] : false;
      let canEdit = matched ? matched["can-edit"] : false;
      let canDelete = matched ? matched["can-delete"] : false;
      let canAdd = matched ? matched["can-add"] : false;

      if (perm.name === "Reports") {
        canEdit = false;
        canDelete = false;
        canAdd = false;
      }

      return {
        id: perm.id,
        name: perm.name,
        "can-view": canView,
        "can-edit": canEdit,
        "can-delete": canDelete,
        "can-add": canAdd,
      };
    });

    logger.info("Creating new permissions for role", {
      roleId,
      permissionsCount: updatedPermissions.length,
    });

    await Promise.all(
      updatedPermissions.map(async (perm) => {
        await RolePermission.create({
          role_id: roleId,
          permission_id: perm.id,
          "can-view": perm["can-view"],
          "can-edit": perm["can-edit"],
          "can-delete": perm["can-delete"],
          "can-add": perm["can-add"],
        });
      })
    );

    if (req.user) {
      const staffWithRole = await StaffRole.findAll({
        where: { role_id: roleId },
        include: [{ model: Staff, attributes: ["staff_id"] }],
      });

      logger.info("Sending notifications to staff with role", {
        roleId,
        staffCount: staffWithRole.length,
      });

      await Promise.all(
        staffWithRole.map(async (staffRole) => {
          await notifyRoleUpdate(staffRole.staff_id, req.user.id);
        })
      );
    }

    logger.info("Role updated successfully", { roleId, roleName });

    logger.info("----- [updateRole] END SUCCESS -----", {
      roleId,
      roleName,
    });

    return res.status(200).json({
      status: "success",
      message: "Role updated successfully",
      role: {
        id: role.id,
        "role-name": role["role-name"],
        permissions: updatedPermissions,
      },
    });
  } catch (error) {
    logger.error("----- [updateRole] Unexpected Error", {
      roleId: req.params.roleId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error updating role:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update role",
      error: error.message,
    });
  }
};

const deleteRole = async (req, res) => {
  logger.info("----- [deleteRole] START -----", {
    roleId: req.params.roleId,
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { roleId } = req.params;

    logger.debug("Delete role request", { roleId });

    if (!roleId) {
      logger.warn("Missing roleId in deleteRole");
      return res.status(400).json({
        status: "error",
        message: "Role ID is required",
      });
    }

    const role = await Role.findByPk(roleId);
    if (!role) {
      logger.warn("Role not found for deletion", { roleId });
      return res.status(404).json({
        status: "error",
        message: "Role not found",
      });
    }

    logger.info("Deleting role and related data", {
      roleId,
      roleName: role["role-name"],
    });

    await Promise.all([
      RolePermission.destroy({ where: { role_id: roleId } }),
      StaffRole.destroy({ where: { role_id: roleId } }),
    ]);

    await role.destroy();

    logger.info("Role deleted successfully", {
      roleId,
      roleName: role["role-name"],
    });

    logger.info("----- [deleteRole] END SUCCESS -----", { roleId });

    return res.status(200).json({
      status: "success",
      message: "Role deleted successfully and removed from all staff",
      deletedRole: {
        id: role.id,
        "role-name": role["role-name"],
      },
    });
  } catch (error) {
    logger.error("----- [deleteRole] Unexpected Error", {
      roleId: req.params.roleId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error deleting role:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete role",
      error: error.message,
    });
  }
};

const deleteRoleFromStaff = async (req, res) => {
  logger.info("----- [deleteRoleFromStaff] START -----", {
    staffId: req.params.staffId,
    roleId: req.params.roleId,
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { staffId, roleId } = req.params;

    logger.debug("Delete role from staff request", { staffId, roleId });

    if (!staffId || !roleId) {
      logger.warn("Missing parameters in deleteRoleFromStaff", {
        hasStaffId: !!staffId,
        hasRoleId: !!roleId,
      });
      return res.status(400).json({
        status: "error",
        message: "staffId and roleId are required",
      });
    }

    const staff = await Staff.findByPk(staffId);
    if (!staff) {
      logger.warn("Staff not found in deleteRoleFromStaff", { staffId });
      return res.status(404).json({
        status: "error",
        message: "Staff not found",
      });
    }

    const role = await Role.findByPk(roleId);
    if (!role) {
      logger.warn("Role not found in deleteRoleFromStaff", { roleId });
      return res.status(404).json({
        status: "error",
        message: "Role not found",
      });
    }

    const existing = await StaffRole.findOne({
      where: { staff_id: staffId, role_id: roleId },
    });

    if (!existing) {
      logger.warn("Role not assigned to staff in deleteRoleFromStaff", {
        staffId,
        roleId,
        roleName: role["role-name"],
      });
      return res.status(404).json({
        status: "error",
        message: "This role is not assigned to this staff",
      });
    }

    logger.info("Removing role from staff", {
      staffId,
      roleId,
      roleName: role["role-name"],
      staffName: `${
        staff.User
          ? `${staff.User["first-name"]} ${staff.User["last-name"]}`
          : "Unknown"
      }`,
    });

    await StaffRole.destroy({ where: { staff_id: staffId, role_id: roleId } });

    logger.info("Role removed from staff successfully", {
      staffId,
      roleId,
      roleName: role["role-name"],
    });

    logger.info("----- [deleteRoleFromStaff] END SUCCESS -----", {
      staffId,
      roleId,
    });

    return res.status(200).json({
      status: "success",
      message: `Role '${role["role-name"]}' removed from staff successfully`,
      removed: {
        staff_id: staff.staff_id,
        "staff-status": staff["status-to-login"],
        role: {
          id: role.id,
          "role-name": role["role-name"],
        },
      },
    });
  } catch (error) {
    logger.error("----- [deleteRoleFromStaff] Unexpected Error", {
      staffId: req.params.staffId,
      roleId: req.params.roleId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error deleting role from staff:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to remove role from staff",
      error: error.message,
    });
  }
};

const getAllRoles = async (req, res) => {
  logger.info("----- [getAllRoles] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    logger.info("Fetching all roles");

    const roles = await Role.findAll({
      include: [
        {
          model: Permission,
          as: "Permissions",
          through: {
            attributes: ["can-view", "can-edit", "can-delete", "can-add"],
          },
        },
      ],
    });

    if (!roles || roles.length === 0) {
      logger.warn("No roles found in getAllRoles");
      return res.status(404).json({
        status: "error",
        message: "No roles found in the system",
      });
    }

    const formattedRoles = roles.map((role) => ({
      id: role.id,
      "role-name": role["role-name"],
      permissions: role.Permissions.map((perm) => ({
        id: perm.id,
        name: perm.name,
        "can-view": perm.RolePermission["can-view"],
        "can-edit": perm.RolePermission["can-edit"],
        "can-delete": perm.RolePermission["can-delete"],
        "can-add": perm.RolePermission["can-add"],
      })),
    }));

    logger.info("All roles fetched successfully", {
      rolesCount: formattedRoles.length,
    });

    logger.info("----- [getAllRoles] END SUCCESS -----", {
      rolesCount: formattedRoles.length,
    });

    return res.status(200).json({
      status: "success",
      message: "All roles fetched successfully",
      roles: formattedRoles,
    });
  } catch (error) {
    logger.error("----- [getAllRoles] Unexpected Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error fetching all roles:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch roles",
      error: error.message,
    });
  }
};

const getRoleDetails = async (req, res) => {
  logger.info("----- [getRoleDetails] START -----", {
    roleId: req.params.roleId,
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { roleId } = req.params;

    logger.debug("Fetching role details", { roleId });

    const role = await Role.findByPk(roleId, {
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
        {
          model: Staff,
          through: { model: StaffRole, attributes: [] },
          include: [
            {
              model: User,
              attributes: ["first-name", "last-name", "email"],
            },
          ],
        },
      ],
    });

    if (!role) {
      logger.warn("Role not found in getRoleDetails", { roleId });
      return res.status(404).json({
        status: "error",
        message: "Role not found",
      });
    }

    const permissions = role.RolePermissions.map((rp) => ({
      id: rp.Permission.id,
      name: rp.Permission.name,
      "can-view": rp["can-view"],
      "can-edit": rp["can-edit"],
      "can-delete": rp["can-delete"],
      "can-add": rp["can-add"],
    }));

    const staff = role.Staffs.map((s) => ({
      staff_id: s.staff_id,
      full_name: `${s.User["first-name"]} ${s.User["last-name"]}`,
      email: s.User.email,
      "status-to-login": s["status-to-login"],
    }));

    logger.info("Role details fetched successfully", {
      roleId,
      roleName: role["role-name"],
      permissionsCount: permissions.length,
      staffCount: staff.length,
    });

    logger.info("----- [getRoleDetails] END SUCCESS -----", {
      roleId,
      roleName: role["role-name"],
    });

    return res.status(200).json({
      status: "success",
      message: `Role details fetched successfully for role: ${role["role-name"]}`,
      role: {
        id: role.id,
        "role-name": role["role-name"],
        permissions,
        staff,
      },
    });
  } catch (error) {
    logger.error("----- [getRoleDetails] Unexpected Error", {
      roleId: req.params.roleId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error fetching role details:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch role details",
      error: error.message,
    });
  }
};

const getStaffByRoleId = async (req, res) => {
  logger.info("----- [getStaffByRoleId] START -----", {
    roleId: req.params.roleId,
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { roleId } = req.params;

    logger.debug("Fetching staff by role", { roleId });

    if (!roleId) {
      logger.warn("Missing roleId in getStaffByRoleId");
      return res.status(400).json({
        status: "error",
        message: "roleId is required",
      });
    }

    const role = await Role.findByPk(roleId);
    if (!role) {
      logger.warn("Role not found in getStaffByRoleId", { roleId });
      return res.status(404).json({
        status: "error",
        message: "Role not found",
      });
    }

    logger.info("Role found", { roleId, roleName: role["role-name"] });

    const staffList = await Staff.findAll({
      include: [
        {
          model: Role,
          where: { id: roleId },
          attributes: ["id", "role-name"],
          through: { attributes: [] },
        },
        {
          model: User,
          attributes: ["first-name", "last-name", "email"],
        },
      ],
    });

    logger.info("Staff list fetched", {
      roleId,
      staffCount: staffList.length,
    });

    logger.info("----- [getStaffByRoleId] END SUCCESS -----", {
      roleId,
      staffCount: staffList.length,
    });

    return res.status(200).json({
      status: "success",
      message: `Staff members in role: ${role["role-name"]}`,
      role: {
        id: role.id,
        "role-name": role["role-name"],
        staff: staffList.map((staff) => ({
          staff_id: staff.staff_id,
          full_name: `${staff.User["first-name"]} ${staff.User["last-name"]}`,
          email: staff.User.email,
          "status-to-login": staff["status-to-login"],
        })),
      },
    });
  } catch (error) {
    logger.error("----- [getStaffByRoleId] Unexpected Error", {
      roleId: req.params.roleId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error fetching staff by role:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch staff by role",
      error: error.message,
    });
  }
};

const updateRoleName = async (req, res) => {
  logger.info("----- [updateRoleName] START -----", {
    roleId: req.params.roleId,
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { roleId } = req.params;
    const { roleName } = req.body;

    logger.debug("Update role name request", { roleId, newRoleName: roleName });

    if (!roleId || !roleName) {
      logger.warn("Missing parameters in updateRoleName", {
        hasRoleId: !!roleId,
        hasRoleName: !!roleName,
      });
      return res.status(400).json({
        status: "error",
        message: "roleId and new roleName are required",
      });
    }

    const role = await Role.findByPk(roleId);
    if (!role) {
      logger.warn("Role not found in updateRoleName", { roleId });
      return res.status(404).json({
        status: "error",
        message: "Role not found",
      });
    }

    logger.info("Updating role name", {
      roleId,
      oldRoleName: role["role-name"],
      newRoleName: roleName,
    });

    role["role-name"] = roleName;
    await role.save();

    logger.info("Role name updated successfully", { roleId, roleName });

    logger.info("----- [updateRoleName] END SUCCESS -----", {
      roleId,
      roleName,
    });

    return res.status(200).json({
      status: "success",
      message: `Role name updated successfully to: ${roleName}`,
      role: {
        id: role.id,
        "role-name": role["role-name"],
      },
    });
  } catch (error) {
    logger.error("----- [updateRoleName] Unexpected Error", {
      roleId: req.params.roleId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error updating role name:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update role name",
      error: error.message,
    });
  }
};

const getAvailableStaffForRole = async (req, res) => {
  logger.info("----- [getAvailableStaffForRole] START -----", {
    roleId: req.params.roleId,
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    const { roleId } = req.params;

    logger.debug("Fetching available staff for role", { roleId });

    const assignedStaff = await StaffRole.findAll({
      where: { role_id: roleId },
      attributes: ["staff_id"],
    });

    const assignedStaffIds = assignedStaff.map((sr) => sr.staff_id);

    logger.info("Assigned staff IDs found", {
      roleId,
      assignedStaffCount: assignedStaffIds.length,
    });

    const availableStaff = await Staff.findAll({
      where: {
        staff_id: {
          [Op.notIn]: assignedStaffIds.length > 0 ? assignedStaffIds : [0],
        },
      },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email"],
        },
      ],
    });

    logger.info("Available staff fetched", {
      roleId,
      availableStaffCount: availableStaff.length,
    });

    logger.info("----- [getAvailableStaffForRole] END SUCCESS -----", {
      roleId,
      availableStaffCount: availableStaff.length,
    });

    res.status(200).json({
      status: "success",
      message: "Available staff fetched successfully",
      data: availableStaff,
    });
  } catch (error) {
    logger.error("----- [getAvailableStaffForRole] Unexpected Error", {
      roleId: req.params.roleId,
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    console.error("Error fetching available staff:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch available staff",
      error: error.message,
    });
  }
};

module.exports = {
  createRole,
  getAllRolesWithPermissions,
  assignRoleToStaff,
  viewEmployeesByRole,
  updateRole,
  deleteRole,
  deleteRoleFromStaff,
  getAllRoles,
  getRoleDetails,
  getStaffByRoleId,
  updateRoleName,
  getAvailableStaffForRole,
};

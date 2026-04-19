const express = require("express");
const router = express.Router();
const groupController = require("../controllers/group.controller");
const authMiddleware = require("../middleware/authMiddleware");
const uploadGroup = require("../middleware/uploadGroup");

router.get("/groups", authMiddleware.protect, groupController.getGroups);
router.get("/:groupId/users", authMiddleware.protect, groupController.getGroupUsers);
router.post("/groups/join", authMiddleware.protect, groupController.joinGroup);
router.delete("/groups/leave/:groupId", authMiddleware.protect, groupController.leaveGroup);
router.get("/groups/my-groups", authMiddleware.protect, groupController.getMyGroups);
router.get("/groups/:groupId/available-graduates", authMiddleware.protect, groupController.getGraduatesForGroup);
router.post("/groups", authMiddleware.protect, uploadGroup.single("groupImage"), groupController.createGroup);
router.put("/groups/:groupId", authMiddleware.protect, uploadGroup.single("groupImage"), groupController.editGroup);
router.delete("/groups/:groupId", authMiddleware.protect, groupController.deleteGroup);
router.get("/groups/:groupId/members/count", authMiddleware.protect, groupController.getGroupMembersCount);

router.get('/groups/sorted-groups', authMiddleware.protect, groupController.getSortedGroups);
module.exports = router;

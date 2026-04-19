const express = require("express");
const router = express.Router();
const friendshipController = require("../controllers/friendship.controller");
const { protect } = require("../middleware/authMiddleware");

router.get("/suggestions", protect, friendshipController.viewSuggestions);
router.post("/request/:receiverId", protect, friendshipController.sendRequest);
router.delete(
  "/cancel/:receiverId",
  protect,
  friendshipController.cancelRequest
);
router.get("/requests", protect, friendshipController.viewRequests);
router.put("/confirm/:senderId", protect, friendshipController.confirmRequest);
router.put(
  "/hide/:senderId",
  protect,
  friendshipController.deleteFromMyRequests
);
router.get("/friends", protect, friendshipController.viewFriends);
router.delete("/friends/:friendId", protect, friendshipController.deleteFriend);
router.get("/requests/sent", protect, friendshipController.viewSentRequests);

module.exports = router;

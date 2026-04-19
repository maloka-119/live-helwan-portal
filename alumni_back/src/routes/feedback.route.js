const express = require("express");
const router = express.Router();
const feedbackController = require("../controllers/feedback.controller");
const { protect } = require("../middleware/authMiddleware");

router.post("/", protect, feedbackController.createFeedback);
router.get("/", protect, feedbackController.getAllFeedback);
router.get("/my-feedbacks", protect, feedbackController.getMyFeedback);
router.get("/graduate/:id", protect, feedbackController.getGraduateFeedback);
router.get("/category/:category", protect, feedbackController.getByCategory);
router.put("/:id", protect, feedbackController.updateFeedback);
router.delete("/:id", protect, feedbackController.deleteFeedback);

module.exports = router;

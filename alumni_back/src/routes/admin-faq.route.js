const express = require("express");
const router = express.Router();
const faqController = require("../controllers/faq.controller");
const authMiddleware = require("../middleware/authMiddleware");

// All routes require admin OR staff authentication
router.use(authMiddleware.protect);

// نضيف middleware مباشر للتحقق من admin أو staff
router.use((req, res, next) => {
  if (
    req.user &&
    (req.user["user-type"] === "admin" || req.user["user-type"] === "staff")
  ) {
    next();
  } else {
    res.status(403).json({ message: "Not authorized as admin or staff" });
  }
});

// كل الـ routes تفضل زي ما هي بدون تغيير
router.get("/", faqController.getAllFAQsAdmin);
router.put("/reorder", faqController.reorderFAQs);
router.get("/:id", faqController.getFAQ);
router.post("/", faqController.createFAQ);
router.put("/:id", faqController.updateFAQ);
router.delete("/:id/hard", faqController.hardDeleteFAQ);
router.delete("/:id", faqController.deleteFAQ);

module.exports = router;

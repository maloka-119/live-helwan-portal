// routes/facultiesRoute.js
const express = require("express");
const router = express.Router();
const {
  getHelwanFaculties,
  normalizeCollegeName,
  getCollegeNameByCode
} = require("../services/facultiesService");

// GET /api/faculties → كل الكليات
router.get("/", (req, res) => {
  const faculties = getHelwanFaculties();
  res.json({
    status: "success",
    count: faculties.length,
    data: faculties
  });
});

// POST /api/faculties/normalize → تحويل اسم الكلية للكود
router.post("/normalize", (req, res) => {
  const { name } = req.body;
  const code = normalizeCollegeName(name);

  if (!code) {
    return res.status(400).json({ status: "fail", message: "Invalid college name" });
  }

  res.json({ status: "success", code });
});

// GET /api/faculties/:code → جلب اسم الكلية حسب لغة المستخدم
router.get("/:code", (req, res) => {
  const code = req.params.code;
  const lang = req.query.lang || "ar"; // ar / en
  const name = getCollegeNameByCode(code, lang);

  if (!name) {
    return res.status(404).json({ status: "fail", message: "College not found" });
  }

  res.json({ status: "success", code, name });
});

module.exports = router;

const express = require("express");
const router = express.Router();
const busboy = require("busboy");
const { protect } = require("../middleware/authMiddleware"); // 👈 إضافة middleware الحماية

const {
  addGraduates,
  getGraduatesByBatch,
  deleteGraduatesByBatch,
  getAllBatches,
  getAllGraduates,
  getGraduateDetails
  
} = require("../controllers/graduateController");

// middleware لمعالجة الملفات
const handleFileUpload = (req, res, next) => {
  if (!req.headers["content-type"]?.includes("multipart/form-data"))
    return next();

  const bb = busboy({ headers: req.headers });
  const files = [],
    fields = {};

  bb.on("file", (name, file, info) => {
    const filename = info.filename || "uploaded_file.xlsx";
    const { encoding, mimeType } = info;
    const chunks = [];
    file.on("data", (chunk) => chunks.push(chunk));
    file.on("end", () =>
      files.push({
        fieldname: name || "file",
        originalname: filename,
        encoding,
        mimetype: mimeType,
        buffer: Buffer.concat(chunks),
        size: Buffer.concat(chunks).length,
      })
    );
  });

  bb.on("field", (name, value) => (fields[name] = value));
  bb.on("close", () => {
    req.files = files;
    req.body = { ...fields, ...req.body };
    next();
  });
  bb.on("error", (err) =>
    res
      .status(400)
      .json({ message: "Error processing file upload: " + err.message })
  );

  req.pipe(bb);
};

// ✅ Routes with authentication (all protected)
router.get("/batches", protect, getAllBatches);
router.get("/graduates/batch/:batchId", protect, getGraduatesByBatch);
router.delete("/graduates/batch/:batchId", protect, deleteGraduatesByBatch);
router.post("/graduates", protect, handleFileUpload, addGraduates); // 👈 protect هنا قبل handleFileUpload
router.get("/all-graduates", protect, getAllGraduates);
router.get("/details/:nationalId", getGraduateDetails);

module.exports = router;
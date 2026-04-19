const express = require("express");
const router = express.Router();
const documentRequestController = require("../controllers/documentRequest.Controller");
const { protect } = require("../middleware/authMiddleware");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// ==================== CREATE UPLOADS FOLDER ====================
const uploadsDir = path.join(__dirname, "..", "uploads", "documents");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`✅ Created uploads directory: ${uploadsDir}`);
}

// ==================== MULTER CONFIGURATION ====================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB كحد أقصى
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type: ${file.mimetype}. Only JPEG, PNG, JPG, and PDF are allowed.`
        )
      );
    }
  },
});

// ==================== DEBUG MIDDLEWARE ====================
const debugMulterMiddleware = (req, res, next) => {
  console.log("\n" + "=".repeat(50));
  console.log("🔍 DEBUG MULTER MIDDLEWARE");
  console.log("Method:", req.method);
  console.log("Path:", req.path);
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("Content-Length:", req.headers["content-length"] || "0");
  console.log("Has Authorization:", !!req.headers["authorization"]);
  next();
};

// ==================== ERROR HANDLING MIDDLEWARE ====================
const multerErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("❌ MULTER ERROR:", err.message);
    console.error("Error Code:", err.code);

    let message = "File upload error";
    if (err.code === "LIMIT_FILE_SIZE") {
      message = `File too large. Maximum size is 10MB.`;
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = `Too many files. Maximum is 5 files.`;
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = `Unexpected file field. Use 'attachments' field name.`;
    }

    return res.status(400).json({
      success: false,
      message: message,
      error: err.message,
    });
  } else if (err) {
    console.error("❌ UPLOAD ERROR:", err.message);
    return res.status(400).json({
      success: false,
      message: err.message || "File upload failed",
      error: err.message,
    });
  }
  next();
};

// ==================== GRADUATE ROUTES ====================
// Create new document request (Graduates only)
router.post(
  "/requests",
  debugMulterMiddleware,
  protect,
  upload.array("attachments", 5),
  multerErrorHandler,
  (req, res, next) => {
    // بعد ما multer يشتغل
    console.log("\n✅ MULTER PROCESSING COMPLETE");
    console.log("req.body keys:", Object.keys(req.body));
    console.log("req.files count:", req.files ? req.files.length : 0);

    if (req.body && req.body.document_type) {
      console.log("📋 Document Type Found:", req.body.document_type);
    } else {
      console.log("⚠️ Document Type NOT found in req.body");
      console.log("All fields in req.body:", req.body);
    }

    next();
  },
  documentRequestController.createDocumentRequest
);

// Get graduate's own document requests (Graduates only)
router.get(
  "/requests/my-requests",
  protect,
  documentRequestController.getMyDocumentRequests
);

// ==================== STAFF/ADMIN ROUTES ====================
// Get all document requests (Staff/Admin only)
router.get(
  "/requests",
  protect,
  documentRequestController.getAllDocumentRequests
);

// Update document request status (Staff/Admin only)
router.put(
  "/requests/:requestId/status",
  protect,
  documentRequestController.updateDocumentRequestStatus
);

// ==================== TEST ROUTE (تأكد أن multer شغال) ====================
router.post(
  "/test-upload",
  protect,
  upload.array("attachments", 2),
  (req, res) => {
    console.log("\n📁 TEST UPLOAD SUCCESS!");
    console.log("📦 Body received:", req.body);
    console.log("📁 Files received:", req.files ? req.files.length : 0);

    if (req.files) {
      req.files.forEach((file, i) => {
        console.log(
          `   File ${i + 1}: ${file.fieldname} - ${file.originalname} (${
            file.size
          } bytes)`
        );
        console.log(`   Saved as: ${file.path}`);
      });
    }

    res.json({
      success: true,
      message: "Upload test successful",
      body: req.body,
      files: req.files
        ? req.files.map((f) => ({
            fieldname: f.fieldname,
            originalname: f.originalname,
            size: f.size,
            mimetype: f.mimetype,
            path: f.path,
            filename: f.filename,
          }))
        : [],
    });
  }
);

// ==================== DIRECT TEST ROUTE (بدون authentication) ====================
router.post("/direct-test", upload.single("attachment"), (req, res) => {
  console.log("\n🎯 DIRECT TEST ROUTE HIT!");
  console.log("Body:", req.body);
  console.log("File:", req.file);

  res.json({
    success: true,
    message: "Direct test route working",
    body: req.body,
    file: req.file
      ? {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          path: req.file.path,
        }
      : null,
  });
});

module.exports = router;

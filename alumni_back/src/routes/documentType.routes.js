// routes/documentType.routes.js
const express = require("express");
const router = express.Router();
const {
  getAllDocuments,
} = require("../controllers/documentType.controller");

router.get("/", getAllDocuments);

module.exports = router;

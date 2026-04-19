// middleware/uploadGroup.js
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "group-covers", // فولدر خاص بصور الجروبات
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const uploadGroup = multer({ storage });

module.exports = uploadGroup;

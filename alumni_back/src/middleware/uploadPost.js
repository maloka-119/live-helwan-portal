const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "posts", // فولدر صور البوستات
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const uploadPost = multer({ storage: storage });

module.exports = uploadPost;

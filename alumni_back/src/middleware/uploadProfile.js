const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const uploadFiles = multer({
  storage: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      if (file.fieldname === "profilePicture") {
        return {
          folder: "profiles",
          allowed_formats: ["jpg", "png", "jpeg"],
        };
      } else if (file.fieldname === "cv") {
        return {
          folder: "cvs",
          allowed_formats: ["pdf", "doc", "docx"],
         resource_type: "raw", // بدل auto
        type: "upload",         // خليها public بدل authenticated
        };
      }
    },
  }),
}).fields([
  { name: "profilePicture", maxCount: 1 },
  { name: "cv", maxCount: 1 },
]);

module.exports = { uploadFiles };

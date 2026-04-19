const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "ddqedphia",   
  api_key: "232541479137294",       
  api_secret: "RdDTC9_TOdPcl0mI4VlXSzoPMt4",   
});
//CLOUDINARY_URL=cloudinary://232541479137294:RdDTC9_TOdPcl0mI4VlXSzoPMt4@ddqedphia
module.exports = cloudinary;

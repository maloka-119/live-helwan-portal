const Graduate = require("../models/Graduate");
const User = require("../models/User");
const Friendship = require("../models/Friendship");
const Post = require("../models/Post");
const PostImage = require("../models/PostImage");
const Comment = require("../models/Comment");
const Like = require("../models/Like");
const GroupMember = require("../models/GroupMember");
const { Op } = require("sequelize");
const HttpStatusHelper = require("../utils/HttpStatuHelper");
const checkStaffPermission = require("../utils/permissionChecker");
const cloudinary = require("../config/cloudinary");
const axios = require("axios");
const {
  normalizeCollegeName,
  getCollegeNameByCode,
} = require("../services/facultiesService");
const { generateQRToken, verifyQRToken } = require("../utils/qrTokenService");
const QRCode = require("qrcode");
const aes = require("../utils/aes");


// Import logger utilities
const { logger, securityLogger } = require("../utils/logger");

/**
 * Get all graduates (Admin only)
 * @route GET /api/graduates/all
 * @access Private (Admin only)
 */
const getAllGraduates = async (req, res) => {
  try {
    // Log request initiation
    logger.info("Get all graduates request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const graduates = await Graduate.findAll({
      include: {
        model: User,
        attributes: [
          "id",
          "first-name",
          "last-name",
          "national-id",
          "email",
          "phone-number",
          "birth-date",
          "user-type",
        ],
      },
      attributes: { exclude: ["faculty"] },
    });

    const lang = req.headers["accept-language"] || req.user?.language || "ar";

    const graduatesWithFaculty = graduates.map((g) => ({
      ...g.toJSON(),
      faculty: getCollegeNameByCode(g.faculty_code, lang),
    }));

    // Log successful retrieval
    logger.info("All graduates retrieved successfully", {
      userId: req.user?.id,
      graduateCount: graduatesWithFaculty.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "All graduates fetched successfully",
      data: graduatesWithFaculty,
    });
  } catch (err) {
    // Log error
    logger.error("Error fetching all graduates", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error(err);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Error fetching graduates",
      data: [],
    });
  }
};

/**
 * Get active graduates (GraduatesInPortal) - Admin & Staff only
 * @route GET /api/graduates/active
 * @access Private (Admin & Staff only)
 */
const getGraduatesInPortal = async (req, res) => {
  try {
    // Log request initiation
    logger.info("Get graduates in portal request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const allowedUserTypes = ["admin", "staff"];
    if (!allowedUserTypes.includes(req.user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to graduates in portal", {
        userId: req.user?.id,
        userType: req.user?.["user-type"],
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: HttpStatusHelper.ERROR,
        message: "Access denied.",
        data: [],
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Graduate management",
        "view"
      );
      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for viewing graduates", {
          userId: req.user.id,
          permission: "Graduate management",
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: HttpStatusHelper.ERROR,
          message:
            "Access denied. You don't have permission to view graduates.",
          data: [],
        });
      }
    }

    const lang = req.headers["accept-language"] || req.user.language || "ar";

    const graduates = await Graduate.findAll({
      where: { "status-to-login": "accepted" },
      include: {
        model: User,
        attributes: [
          "id",
          ["first-name", "firstName"],
          ["last-name", "lastName"],
          ["national-id", "nationalId"],
          "email",
          ["phone-number", "phoneNumber"],
          ["birth-date", "birthDate"],
          ["user-type", "userType"],
        ],
      },
      attributes: { exclude: ["faculty"] },
    });

    const graduatesWithFaculty = graduates.map((g) => {
      const obj = g.toJSON();

      // Decrypt National ID
      if (obj.User?.nationalId) {
        obj.User.nationalId = aes.decryptNationalId(obj.User.nationalId);
      }

      return {
        ...obj,
        faculty: getCollegeNameByCode(g.faculty_code, lang),
      };
    });

    // Log successful retrieval
    logger.info("Graduates in portal retrieved successfully", {
      userId: req.user.id,
      userType: req.user["user-type"],
      graduateCount: graduatesWithFaculty.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "All graduates fetched successfully",
      data: graduatesWithFaculty,
    });
  } catch (err) {
    // Log error
    logger.error("Error fetching graduates in portal", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error fetching graduates:", err);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Error fetching graduates",
      data: [],
    });
  }
};

/**
 * Get inactive graduates (requested to join) - Admin only
 * @route GET /api/graduates/requested
 * @access Private (Admin only)
 */
const getRequestedGraduates = async (req, res) => {
  try {
    // Log request initiation
    logger.info("Get requested graduates request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const allowedUserTypes = ["admin", "staff"];
    if (!allowedUserTypes.includes(req.user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to requested graduates", {
        userId: req.user?.id,
        userType: req.user?.["user-type"],
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: HttpStatusHelper.ERROR,
        message: "Access denied.",
        data: [],
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasGraduatePermission = await checkStaffPermission(
        req.user.id,
        "Graduate management",
        "view"
      );

      const hasRequestsPermission = await checkStaffPermission(
        req.user.id,
        "Others Requests management",
        "view"
      );

      if (!hasGraduatePermission && !hasRequestsPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for viewing requested graduates", {
          userId: req.user.id,
          requiredPermissions: [
            "Graduate management",
            "Others Requests management",
          ],
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: HttpStatusHelper.ERROR,
          message:
            "Access denied. You don't have permission to view requested graduates.",
          data: [],
        });
      }
    }

    const lang = req.headers["accept-language"] || req.user.language || "ar";

    const graduates = await Graduate.findAll({
      where: { "status-to-login": "pending" },
      include: {
        model: User,
        attributes: [
          "id",
          ["first-name", "firstName"],
          ["last-name", "lastName"],
          ["national-id", "nationalId"],
          "email",
          ["phone-number", "phoneNumber"],
          ["birth-date", "birthDate"],
          ["user-type", "userType"],
        ],
      },
      attributes: { exclude: ["faculty"] },
    });

    const graduatesWithFaculty = graduates.map((g) => {
      const obj = g.toJSON();

      // Decrypt National ID
      if (obj.User?.nationalId) {
        obj.User.nationalId = aes.decryptNationalId(obj.User.nationalId);
      }

      return {
        ...obj,
        faculty: getCollegeNameByCode(g.faculty_code, lang),
      };
    });

    // Log successful retrieval
    logger.info("Requested graduates retrieved successfully", {
      userId: req.user.id,
      userType: req.user["user-type"],
      graduateCount: graduatesWithFaculty.length,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "All graduates fetched successfully",
      data: graduatesWithFaculty,
    });
  } catch (err) {
    // Log error
    logger.error("Error fetching requested graduates", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error(err);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Error fetching graduates",
      data: [],
    });
  }
};

/**
 * Reject graduate by admin
 * @route PUT /api/graduates/:id/reject
 * @access Private (Admin only)
 */
const rejectGraduate = async (req, res) => {
  try {
    // Log request initiation
    logger.info("Reject graduate request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      graduateId: req.params.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const allowedUserTypes = ["admin", "staff"];
    if (!allowedUserTypes.includes(req.user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to reject graduate", {
        userId: req.user?.id,
        userType: req.user?.["user-type"],
        graduateId: req.params.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Others Requests management",
        "delete"
      );

      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for rejecting graduate", {
          userId: req.user.id,
          permission: "Others Requests management",
          graduateId: req.params.id,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to reject graduates.",
        });
      }
    }

    const graduateId = req.params.id;
    const graduate = await Graduate.findByPk(graduateId, {
      attributes: { exclude: ["faculty"] },
    });

    if (!graduate) {
      // Log not found
      logger.warn("Graduate not found for rejection", {
        graduateId,
        userId: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "error",
        message: "Graduate not found",
      });
    }

    const oldStatus = graduate["status-to-login"];
    graduate["status-to-login"] = "rejected";
    await graduate.save();

    const lang = req.headers["accept-language"] || req.user.language || "ar";
    const facultyName = getCollegeNameByCode(graduate.faculty_code, lang);

    // Log successful rejection
    logger.info("Graduate rejected successfully", {
      graduateId,
      userId: req.user.id,
      userType: req.user["user-type"],
      oldStatus,
      newStatus: "rejected",
      faculty: facultyName,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      status: "success",
      message: "Graduate request rejected successfully",
      data: {
        ...graduate.toJSON(),
        faculty: facultyName,
      },
    });
  } catch (error) {
    // Log error
    logger.error("Error rejecting graduate", {
      userId: req.user?.id,
      graduateId: req.params.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error(" Error rejecting graduate:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to reject graduate request",
      error: error.message,
    });
  }
};

/**
 * Helper function to fetch student data from external API
 * @param {string} nationalId - Egyptian National ID
 * @returns {Promise<Object>} External data or error
 */
const fetchStudentDataFromExternal = async (nationalId) => {
  try {
    // Log API call attempt (partial NID for security)
    logger.debug("Fetching student data from external API", {
      nationalId: nationalId.substring(0, 3) + "***", // Partial logging for security
      timestamp: new Date().toISOString(),
    });

    // Check if GRADUATE_API_URL is configured
    if (!process.env.GRADUATE_API_URL) {
      const error = new Error(
        "GRADUATE_API_URL is not configured in environment variables"
      );
      error.code = "CONFIG_ERROR";

      // Log configuration error
      logger.error("Configuration error for external API", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }

    // ✅ التعديل هنا: استخدام المسار الجديد /details/:nationalId
    const apiUrl = `${process.env.GRADUATE_API_URL}/details/${nationalId}`;
    
    const response = await axios.get(apiUrl, {
      timeout: 5000, // 5 seconds timeout
      validateStatus: function (status) {
        return status < 500; // Don't throw error for 4xx status codes
      },
    });

    // Check if response is successful
    if (response.status === 200 && response.data) {
      // Log successful response
      logger.debug("External API response received successfully", {
        status: response.status,
        hasData: !!response.data,
        timestamp: new Date().toISOString(),
      });
      return { data: response.data, error: null };
    } else if (response.status === 404) {
      const error = new Error(
        `Student not found in external system for nationalId: ${nationalId}`
      );
      error.code = "NOT_FOUND";
      error.status = 404;

      // Log not found
      logger.warn("Student not found in external system", {
        nationalId: nationalId.substring(0, 3) + "***",
        status: response.status,
        timestamp: new Date().toISOString(),
      });

      return { data: null, error };
    } else {
      const error = new Error(
        `External API returned status ${response.status}`
      );
      error.code = "API_ERROR";
      error.status = response.status;

      // Log API error
      logger.error("External API returned error status", {
        status: response.status,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      return { data: null, error };
    }
  } catch (error) {
    // More detailed error logging
    let errorMessage = "Failed to fetch student data from external system";
    let errorCode = "EXTERNAL_API_ERROR";

    if (error.code === "ECONNREFUSED") {
      errorMessage =
        "External API is not running. Please start the external API service on port 5155";
      errorCode = "CONNECTION_REFUSED";
      // Log connection refused
      logger.error("External API connection refused", {
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      });
    } else if (error.code === "ETIMEDOUT") {
      errorMessage =
        "External API request timed out. The service may be slow or unavailable";
      errorCode = "TIMEOUT";
      // Log timeout
      logger.error("External API request timed out", {
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      });
    } else if (error.code === "CONFIG_ERROR") {
      errorMessage = error.message;
      errorCode = "CONFIG_ERROR";
    } else if (error.response) {
      errorMessage = `External API error: ${error.response.status} - ${error.response.statusText}`;
      errorCode = "API_ERROR";
      // Log response error
      logger.error("External API response error", {
        status: error.response.status,
        error: error.response.statusText,
        timestamp: new Date().toISOString(),
      });
    } else {
      errorMessage = `Error fetching from external API: ${error.message}`;
      // Log unexpected error
      logger.error("Unexpected error fetching from external API", {
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      });
    }

    const apiError = new Error(errorMessage);
    apiError.code = errorCode;
    apiError.originalError = error;
    return { data: null, error: apiError };
  }
};

/**
 * Helper function to sanitize data - remove all IDs
 * @param {Object} data - Data object to sanitize
 * @returns {Object} Sanitized data without ID fields
 */
const sanitizeDigitalIDData = (data) => {
  const sanitized = { ...data };
  // Remove all ID fields
  delete sanitized.nationalId;
  delete sanitized.national_id;
  delete sanitized.graduate_id;
  delete sanitized.graduateId;
  delete sanitized.student_id;
  delete sanitized.studentId;
  delete sanitized.id;
  delete sanitized.digitalID;
  return sanitized;
};

/**
 * Get digital ID for authenticated graduate
 * @route GET /api/graduates/digital-id
 * @access Private (Graduates only)
 */
const getDigitalID = async (req, res) => {
  try {
    // ============================================
    // 🚀 START - GET DIGITAL ID FUNCTION CALLED
    // ============================================
    console.log("\n" + "🆔".repeat(40));
    console.log("🆔 GET DIGITAL ID FUNCTION CALLED at:", new Date().toISOString());
    console.log("🆔".repeat(40));
    
    // Log request initiation
    logger.info("Digital ID request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    console.log("\n📌 [1] USER AUTHENTICATION CHECK:");
    console.log(`   - User ID from token: ${req.user?.id || 'Not provided'}`);
    console.log(`   - User Type: ${req.user?.["user-type"] || 'Not provided'}`);
    console.log(`   - IP Address: ${req.ip}`);

    if (!req.user || !req.user.id) {
      console.log("   ❌ No user ID in request - authentication failed");
      
      logger.warn("Unauthorized digital ID request", {
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({
        status: HttpStatusHelper.FAIL,
        message: "Not authorized or user not found",
        data: null,
        error: "Missing user authentication",
      });
    }

    console.log("   ✅ User authenticated successfully");

    const userId = req.user.id;
    
    console.log("\n📌 [2] FETCHING GRADUATE RECORD:");
    console.log(`   - Looking for graduate with ID: ${userId}`);

    const graduate = await Graduate.findOne({
      where: { graduate_id: userId },
      include: [{ model: require("../models/User") }],
      attributes: { exclude: ["faculty"] },
    });

    if (!graduate) {
      console.log(`   ❌ Graduate not found for ID: ${userId}`);
      
      logger.warn("Graduate not found for digital ID", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Graduate not found",
        data: null,
        error: `No graduate record found for user ID: ${userId}`,
      });
    }

    console.log("   ✅ Graduate found:");
    console.log(`      - graduate_id: ${graduate.graduate_id}`);
    console.log(`      - faculty_code: ${graduate.faculty_code || 'null'}`);
    console.log(`      - graduation-year: ${graduate["graduation-year"] || 'null'}`);
    console.log(`      - skills: ${graduate.skills || 'null'}`);
    console.log(`      - has profile picture: ${!!graduate["profile-picture-url"]}`);

    const user = graduate.User;
    if (!user) {
      console.log(`   ❌ User not found for graduate ID: ${graduate.graduate_id}`);
      
      logger.error("User not found for graduate in digital ID", {
        graduateId: graduate.graduate_id,
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "User details not found for this graduate",
        data: null,
        error: `User record not found for graduate ID: ${graduate.graduate_id}`,
      });
    }

    console.log("   ✅ User found:");
    console.log(`      - User ID: ${user.id}`);
    console.log(`      - First name: ${user["first-name"]}`);
    console.log(`      - Last name: ${user["last-name"]}`);
    console.log(`      - Email: ${user.email}`);

    // Decrypt national ID
    console.log("\n📌 [3] DECRYPTING NATIONAL ID:");
    
    let nationalIdToUse = null;
    if (user["national-id"]) {
      console.log(`   - Encrypted national ID: ${user["national-id"].substring(0, 10)}...`);
      
      const decrypted = aes.decryptNationalId(user["national-id"]);
      if (decrypted) {
        nationalIdToUse = decrypted;
        console.log(`   - ✅ Decrypted national ID: ${nationalIdToUse.substring(0, 6)}****`);
      } else {
        console.log(`   - ⚠️ Decryption failed, trying raw value`);
        const nationalIdStr = String(user["national-id"]).trim();
        if (/^\d{14}$/.test(nationalIdStr)) {
          nationalIdToUse = nationalIdStr;
          console.log(`   - ✅ Using raw national ID: ${nationalIdToUse.substring(0, 6)}****`);
        } else {
          console.log(`   - ❌ Could not decrypt or validate national ID`);
        }
      }
    } else {
      console.log(`   - ❌ No national ID found for user`);
    }

    if (!nationalIdToUse) {
      console.log(`   ❌ No valid national ID available`);
      
      logger.error("National ID decryption failed for digital ID", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: HttpStatusHelper.ERROR,
        message: "National ID not found or could not be decrypted",
        data: null,
      });
    }

    // Fetch external data
    console.log("\n📌 [4] FETCHING EXTERNAL DATA:");
    console.log(`   - National ID: ${nationalIdToUse.substring(0, 6)}****`);
    
    let externalData = null;
    let externalError = null;
    
    try {
      if (!process.env.GRADUATE_API_URL) {
        console.log(`   - ❌ GRADUATE_API_URL not configured`);
        throw new Error("GRADUATE_API_URL is not configured");
      }

      // ✅ Use the correct API endpoint
      const apiUrl = `${process.env.GRADUATE_API_URL}/details/${nationalIdToUse}`;
      console.log(`   - Calling API: ${apiUrl}`);
      
      logger.debug("Calling external API for digital ID", {
        url: apiUrl,
        userId,
        timestamp: new Date().toISOString(),
      });

      const response = await axios.get(apiUrl, {
        timeout: 5000,
        headers: { Accept: "application/json" },
      });

      console.log(`   - Response status: ${response.status}`);
      
      if (response.status === 200 && response.data) {
        externalData = response.data;
        console.log(`   - ✅ External data received:`);
        console.log(`      - fullName: ${externalData.fullName || 'N/A'}`);
        console.log(`      - faculty: ${externalData.faculty || 'N/A'}`);
        console.log(`      - department: ${externalData.department || 'N/A'}`);
        console.log(`      - graduationYear: ${externalData.graduationYear || 'N/A'}`);
        
        logger.debug("External data received for digital ID", {
          userId,
          hasData: !!externalData,
          timestamp: new Date().toISOString(),
        });
      } else {
        externalError = new Error(`API returned status ${response.status}`);
        externalError.code = "API_ERROR";
        externalError.status = response.status;
        console.log(`   - ❌ API returned non-200 status: ${response.status}`);
      }
    } catch (error) {
      externalError = error;
      console.log(`   - ❌ Failed to fetch external data:`);
      console.log(`      - Error message: ${error.message}`);
      console.log(`      - Error code: ${error.code || 'N/A'}`);
      
      if (error.response) {
        console.log(`      - Response status: ${error.response.status}`);
        console.log(`      - Response data:`, error.response.data);
      }
      
      logger.error("Failed to fetch external data for digital ID", {
        userId,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      });
    }

    // ============================================
    // ✅ [5] GENERATE QR CODE WITH CORRECT URL
    // ============================================
    console.log("\n📌 [5] GENERATING QR CODE:");
    
    const qrToken = generateQRToken(userId);
    const frontendUrl = process.env.FRONTEND_URL || "https://lms2.capu.edu.eg";
    
    // ✅ التأكد من الرابط الصحيح
    const verificationUrl = `${frontendUrl}/alumni-portal/graduates/digital-id/verify/${qrToken}`;
    
    console.log(`   - User ID: ${userId}`);
    console.log(`   - ✅ QR Code URL: ${verificationUrl}`);

    let qrCodeDataURL;
    try {
      qrCodeDataURL = await QRCode.toDataURL(verificationUrl, {
        errorCorrectionLevel: "M",
        type: "image/png",
        quality: 0.92,
        margin: 1,
        width: 300,
      });
      
      console.log(`   - ✅ QR Code generated successfully`);
      console.log(`   - QR Code Data URL length: ${qrCodeDataURL.length} characters`);
      
      // Log the first 100 chars of the QR code for debugging
      console.log(`   - QR Code preview: ${qrCodeDataURL.substring(0, 100)}...`);
      
      logger.debug("QR code generated successfully", {
        userId,
        verificationUrl,
        timestamp: new Date().toISOString(),
      });
    } catch (qrError) {
      console.log(`   - ❌ QR Code generation failed: ${qrError.message}`);
      
      logger.error("Error generating QR code", {
        userId,
        error: qrError.message,
        timestamp: new Date().toISOString(),
      });
      qrCodeDataURL = null;
    }

    // If external API fails, use local data as fallback
    if (externalError || !externalData) {
      console.log("\n📌 [6] USING LOCAL DATA AS FALLBACK:");
      console.log(`   - Reason: ${externalError ? externalError.message : 'No external data'}`);
      
      logger.warn("Using local data as fallback for digital ID", {
        userId,
        error: externalError?.message,
        timestamp: new Date().toISOString(),
      });

      const lang = req.headers["accept-language"] || req.user.language || "ar";
      console.log(`   - Language: ${lang}`);
      
      const facultyName = getCollegeNameByCode(graduate.faculty_code, lang);
      console.log(`   - Faculty name from code: ${facultyName}`);

      // Build digital ID with local data
      const digitalID = {
        personalPicture: graduate["profile-picture-url"] || null,
        fullName: `${user["first-name"] || ""} ${user["last-name"] || ""}`.trim(),
        faculty: facultyName,
        department: graduate.skills || null,
        graduationYear: graduate["graduation-year"],
        status: "active",
        nationalId: nationalIdToUse,
        graduationId: graduate.graduate_id,
        qr: qrCodeDataURL,
      };

      console.log("\n📌 [7] DIGITAL ID DATA (LOCAL):");
      console.log(`   - personalPicture: ${digitalID.personalPicture ? '✅' : '❌'}`);
      console.log(`   - fullName: ${digitalID.fullName}`);
      console.log(`   - faculty: ${digitalID.faculty}`);
      console.log(`   - department: ${digitalID.department}`);
      console.log(`   - graduationYear: ${digitalID.graduationYear}`);
      console.log(`   - nationalId: ${digitalID.nationalId.substring(0, 6)}****`);
      console.log(`   - graduationId: ${digitalID.graduationId}`);
      console.log(`   - qr: ${digitalID.qr ? '✅' : '❌'}`);

      logger.info("Digital ID retrieved successfully (using local data)", {
        userId,
        hasQR: !!digitalID.qr,
        faculty: facultyName,
        verificationUrl,
        timestamp: new Date().toISOString(),
      });

      console.log("\n" + "🆔".repeat(40) + "\n");

      return res.json({
        status: HttpStatusHelper.SUCCESS,
        message: "Graduate Digital ID fetched successfully (using local data)",
        data: digitalID,
      });
    }

    // If we have external data, use it
    console.log("\n📌 [6] USING EXTERNAL DATA:");
    
    const lang = req.headers["accept-language"] || req.user.language || "ar";
    console.log(`   - Language: ${lang}`);

    // Get faculty name from external data
    let facultyName;
    if (externalData.faculty) {
      facultyName = externalData.faculty;
      console.log(`   - Faculty from external: ${facultyName}`);
    } else {
      facultyName = getCollegeNameByCode(graduate.faculty_code, lang);
      console.log(`   - Faculty from local code: ${facultyName}`);
    }

    // Get full name from external data
    let fullName;
    if (externalData.fullName) {
      fullName = externalData.fullName;
      console.log(`   - Full name from external: ${fullName}`);
    } else if (externalData["first-name"] && externalData["last-name"]) {
      fullName = `${externalData["first-name"] || ""} ${externalData["last-name"] || ""}`.trim();
      console.log(`   - Full name from external (first/last): ${fullName}`);
    } else {
      fullName = `${user["first-name"] || ""} ${user["last-name"] || ""}`.trim();
      console.log(`   - Full name from local: ${fullName}`);
    }

    // Build digital ID data
    const digitalID = {
      personalPicture: graduate["profile-picture-url"] || null,
      fullName: fullName,
      faculty: facultyName,
      department: externalData.department || graduate.skills || null,
      graduationYear: externalData.graduationYear || graduate["graduation-year"],
      status: externalData.status || "active",
      nationalId: nationalIdToUse,
      graduationId: graduate.graduate_id,
      qr: qrCodeDataURL,
    };

    console.log("\n📌 [7] DIGITAL ID DATA (EXTERNAL):");
    console.log(`   - personalPicture: ${digitalID.personalPicture ? '✅' : '❌'}`);
    console.log(`   - fullName: ${digitalID.fullName}`);
    console.log(`   - faculty: ${digitalID.faculty}`);
    console.log(`   - department: ${digitalID.department}`);
    console.log(`   - graduationYear: ${digitalID.graduationYear}`);
    console.log(`   - nationalId: ${digitalID.nationalId.substring(0, 6)}****`);
    console.log(`   - graduationId: ${digitalID.graduationId}`);
    console.log(`   - qr: ${digitalID.qr ? '✅' : '❌'}`);

    logger.info("Digital ID retrieved successfully", {
      userId,
      hasPersonalPicture: !!digitalID.personalPicture,
      hasQR: !!digitalID.qr,
      faculty: facultyName,
      verificationUrl,
      timestamp: new Date().toISOString(),
    });

    console.log("\n" + "🆔".repeat(40) + "\n");

    return res.json({
      status: HttpStatusHelper.SUCCESS,
      message: "Graduate Digital ID fetched successfully",
      data: digitalID,
    });

  } catch (err) {
    // ============================================
    // ❌ ERROR HANDLING
    // ============================================
    console.log("\n❌".repeat(40));
    console.log("❌ ERROR IN GET DIGITAL ID:");
    console.log("❌ Time:", new Date().toISOString());
    console.log("❌ User ID:", req.user?.id);
    console.log("❌ Error name:", err.name);
    console.log("❌ Error message:", err.message);
    console.log("❌ Error stack:", err.stack);
    console.log("❌".repeat(40) + "\n");
    
    logger.error("Unexpected error in getDigitalID", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack?.substring(0, 500),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    
    return res.status(500).json({
      status: HttpStatusHelper.ERROR || "error",
      message: err.message || "Internal server error",
      data: null,
      error: "An unexpected error occurred while fetching digital ID",
      details:
        process.env.NODE_ENV === "development"
          ? {
              stack: err.stack,
              name: err.name,
            }
          : undefined,
    });
  }
};

/**
 * Generate QR code for Digital ID
 * @route POST /api/graduates/digital-id/qr/generate
 * @access Private (Graduates only)
 */
const generateDigitalIDQR = async (req, res) => {
  try {
    // Log request initiation
    logger.info("Generate Digital ID QR request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!req.user || !req.user.id) {
      // Log unauthorized
      logger.warn("Unauthorized QR generation request", {
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({
        status: HttpStatusHelper.FAIL,
        message: "Not authorized or user not found",
        data: null,
      });
    }

    const userId = req.user.id;
    const graduate = await Graduate.findOne({
      where: { graduate_id: userId },
    });

    if (!graduate) {
      // Log not found
      logger.warn("Graduate not found for QR generation", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Graduate not found",
        data: null,
      });
    }

    const qrToken = generateQRToken(userId);
    const frontendUrl = process.env.FRONTEND_URL || "https://lms2.capu.edu.eg";

    // رابط التحقق اللي الـ QR هيفتحه
    const verificationUrl = `${frontendUrl}/alumni-portal/graduates/digital-id/verify/${qrToken}`;

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(verificationUrl, {
      errorCorrectionLevel: "M",
      type: "image/png",
      quality: 0.92,
      margin: 1,
      width: 300,
    });

    // Log successful generation
    logger.info("QR code generated successfully", {
  userId,
  verificationUrl: verificationUrl.substring(0, 50) + "...",
  ip: req.ip,
  timestamp: new Date().toISOString(),
});

    return res.json({
      status: HttpStatusHelper.SUCCESS,
      message: "QR code generated successfully",
      data: {
        qrCode: qrCodeDataURL,
        verificationUrl: verificationUrl,
        expiresIn: 300, // 5 minutes in seconds
      },
    });
  } catch (err) {
    // Log error
    logger.error("Error generating Digital ID QR", {
      userId: req.user?.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("generateDigitalIDQR error:", err.message);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: err.message,
      data: null,
    });
  }
};

/**
 * Verify QR token and return Digital ID data
 * @route GET /api/graduates/digital-id/verify/:token
 * @access Public (with valid token)
 */
const verifyDigitalIDQR = async (req, res) => {
  try {
    const { token } = req.params;

    // Log request initiation
    logger.info("Verify Digital ID QR request initiated", {
      tokenLength: token?.length || 0,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (!token) {
      // Log missing token
      logger.warn("Missing token for QR verification", {
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: HttpStatusHelper.FAIL,
        message: "Token is required",
        data: null,
      });
    }

    // Verify token
    const decoded = verifyQRToken(token);
    if (!decoded || !decoded.userId) {
      // Log invalid token
      logger.warn("Invalid or expired QR token", {
        tokenLength: token.length,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({
        status: HttpStatusHelper.FAIL,
        message: "Invalid or expired token",
        data: null,
      });
    }

    const userId = decoded.userId;

    // Check if request is from browser (HTML request) - redirect to frontend
    const acceptHeader = req.headers.accept || "";
    if (acceptHeader.includes("text/html") || acceptHeader.includes("*/*")) {
      const frontendUrl = process.env.FRONTEND_URL || "http://lms2.capu.edu.eg:3000";
      const redirectUrl = `${frontendUrl}/public-graduate/${userId}`;
      logger.info("Redirecting HTML request to frontend", {
        userId,
        redirectUrl,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.redirect(redirectUrl);
    }

    // Get graduate and user data
    const graduate = await Graduate.findOne({
      where: { graduate_id: userId },
      include: [{ model: require("../models/User") }],
      attributes: { exclude: ["faculty"] },
    });

    if (!graduate || !graduate.User) {
      // Log not found
      logger.warn("Graduate not found for QR verification", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Graduate not found",
        data: null,
      });
    }

    const user = graduate.User;

    // Decrypt national ID before using it
    let nationalIdToUse = null;
    if (user["national-id"]) {
      const decrypted = aes.decryptNationalId(user["national-id"]);
      if (decrypted) {
        nationalIdToUse = decrypted;
      } else {
        const nationalIdStr = String(user["national-id"]).trim();
        if (/^\d{14}$/.test(nationalIdStr)) {
          nationalIdToUse = nationalIdStr;
        }
      }
    }

    if (!nationalIdToUse) {
      // Log decryption failure
      logger.error("National ID decryption failed for QR verification", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: HttpStatusHelper.ERROR,
        message: "National ID not found or could not be decrypted",
        data: null,
      });
    }

    // Fetch student data from external API (with fallback to local DB if external fails)
    const { data: externalData, error: externalError } =
      await fetchStudentDataFromExternal(nationalIdToUse);

    let useExternalData = !externalError && externalData;
    let dataSource = useExternalData ? "external" : "local";

    // Log data source
    logger.info("Data source for QR verification", {
      userId,
      dataSource,
      externalError: externalError?.message,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    if (externalError && externalError.code !== "NOT_FOUND") {
      // Log non-404 external errors but continue with local data
      logger.warn("External API error, falling back to local data", {
        userId,
        error: externalError.message,
        errorCode: externalError.code,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    const lang = req.headers["accept-language"] || "ar";

    // Get faculty name from external data or use local code as fallback for faculty name only
    let facultyName;
    if (
      externalData &&
      (externalData.faculty ||
      externalData.Faculty ||
      externalData.FACULTY ||
      externalData.facultyName)
    ) {
      facultyName =
        externalData.faculty ||
        externalData.Faculty ||
        externalData.FACULTY ||
        externalData.facultyName;
    } else {
      facultyName = getCollegeNameByCode(graduate.faculty_code, lang);
    }

    // Get full name from external data if available, otherwise from User model
    let fullName;
    if (
      externalData &&
      (externalData.fullName ||
      externalData["full-name"] ||
      (externalData["first-name"] && externalData["last-name"]))
    ) {
      fullName =
        externalData.fullName ||
        externalData["full-name"] ||
        `${externalData["first-name"] || ""} ${
          externalData["last-name"] || ""
        }`.trim();
    } else {
      fullName = `${user["first-name"] || ""} ${
        user["last-name"] || ""
      }`.trim();
    }

    // Generate QR code
    const qrToken = generateQRToken(userId);
     const frontendUrl = process.env.FRONTEND_URL || "http://lms2.capu.edu.eg:3000";
    const verificationUrl = `${frontendUrl}/public-graduate/${graduate.graduate_id}`;

    let qrCodeDataURL;
    try {
      qrCodeDataURL = await QRCode.toDataURL(verificationUrl, {
        errorCorrectionLevel: "M",
        type: "image/png",
        quality: 0.92,
        margin: 1,
        width: 300,
      });
    } catch (qrError) {
      // Log QR generation error
      logger.error("Error generating QR code for verification", {
        userId,
        error: qrError.message,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      console.error("Error generating QR code:", qrError);
      qrCodeDataURL = null;
    }

    // Decrypt national ID for response
    let decryptedNationalId = nationalIdToUse;

    // Build digital ID data - profile image from local DB, rest from external API with local fallbacks
    const digitalID = {
      personalPicture: graduate["profile-picture-url"] || null,
      fullName: fullName,
      faculty: facultyName,
      department: useExternalData ? (
        externalData.department ||
        externalData.Department ||
        externalData.DEPARTMENT ||
        null
      ) : null,
      graduationYear: useExternalData ? (
        externalData["graduation-year"] ||
        externalData.graduationYear ||
        externalData.GraduationYear ||
        null
      ) : graduate.graduation_year || null,
      status: useExternalData ? (
        externalData.status || externalData.Status || "active"
      ) : "active",
      nationalId: decryptedNationalId,
      graduationId: graduate.graduate_id,
      qr: qrCodeDataURL,
      ...(useExternalData ? sanitizeDigitalIDData(externalData) : {}),
    };

    // Ensure no duplicate IDs are included
    delete digitalID.national_id;
    delete digitalID.graduateId;
    delete digitalID.student_id;
    delete digitalID.studentId;
    delete digitalID.id;
    delete digitalID.digitalID;

    // Log successful verification
    logger.info("QR verification successful", {
      userId,
      faculty: facultyName,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      status: HttpStatusHelper.SUCCESS,
      message: "Digital ID verified successfully",
      data: digitalID,
    });
  } catch (err) {
    // Log error
    logger.error("Error verifying Digital ID QR", {
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("verifyDigitalIDQR error:", err.message);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: err.message,
      data: null,
    });
  }
};

/**
 * Approve Graduate by admin
 * @route PUT /api/graduates/:id/approve
 * @access Private (Admin only)
 */
const approveGraduate = async (req, res) => {
  try {
    const { id } = req.params;
    const { faculty, graduationYear } = req.body;

    // Log request initiation
    logger.info("Approve graduate request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      graduateId: id,
      faculty,
      graduationYear,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const allowedUserTypes = ["admin", "staff"];
    if (!req.user || !allowedUserTypes.includes(req.user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to approve graduate", {
        userId: req.user?.id,
        userType: req.user?.["user-type"],
        graduateId: id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({ message: "Access denied." });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Others Requests management",
        "add"
      );
      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for approving graduate", {
          userId: req.user.id,
          permission: "Others Requests management",
          graduateId: id,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          message:
            "Access denied. You don't have permission to approve graduates.",
        });
      }
    }

    if (!faculty || !graduationYear) {
      // Log missing fields
      logger.warn("Missing required fields for approving graduate", {
        graduateId: id,
        hasFaculty: !!faculty,
        hasGraduationYear: !!graduationYear,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res
        .status(400)
        .json({ message: "Faculty and graduationYear are required." });
    }

    const facultyCode = normalizeCollegeName(faculty);
    if (!facultyCode) {
      // Log invalid faculty
      logger.warn("Invalid faculty name for approval", {
        graduateId: id,
        faculty,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({ message: "Invalid faculty name." });
    }

    const graduate = await Graduate.findOne({
      where: { graduate_id: id },
      attributes: { exclude: ["faculty"] },
    });
    if (!graduate) {
      // Log not found
      logger.warn("Graduate not found for approval", {
        graduateId: id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({ message: "Graduate not found." });
    }

    const oldStatus = graduate["status-to-login"];
    graduate.faculty_code = facultyCode;
    graduate["graduation-year"] = graduationYear;
    graduate["status-to-login"] = "accepted";

    await graduate.save();

    const lang = req.headers["accept-language"] || req.user.language || "ar";
    const facultyName = getCollegeNameByCode(facultyCode, lang);

    // Log successful approval
    logger.info("Graduate approved successfully", {
      graduateId: id,
      userId: req.user.id,
      userType: req.user["user-type"],
      oldStatus,
      newStatus: "accepted",
      facultyCode,
      facultyName,
      graduationYear,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      message: "Graduate approved successfully.",
      graduateId: id,
      facultyCode: facultyCode,
      facultyName: facultyName,
    });
  } catch (error) {
    // Log error
    logger.error("Error approving graduate", {
      userId: req.user?.id,
      graduateId: req.params.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error approving graduate:", error.message);
    return res.status(500).json({
      message: "Server error while approving graduate.",
      error: error.message,
    });
  }
};

/**
 * GET Graduate Profile for admin
 * @route GET /api/graduates/profile/:id
 * @access Private (Admin only)
 */
const getGraduateProfile = async (req, res) => {
  try {
    const graduateId = req.params.id;

    // Log request initiation
    logger.info("Get graduate profile request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      graduateId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const graduate = await Graduate.findByPk(graduateId, {
      include: [{ model: User }],
      attributes: { exclude: ["faculty"] },
    });

    if (!graduate) {
      // Log not found
      logger.warn("Graduate not found for profile", {
        graduateId,
        userId: req.user?.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Graduate not found",
        data: null,
      });
    }

    const user = graduate.User;
    const isOwner =
      req.user && parseInt(req.user.id) === parseInt(graduate.graduate_id);

    const lang = req.headers["accept-language"] || req.user.language || "ar";
    const facultyName = getCollegeNameByCode(graduate.faculty_code, lang);

    const graduateProfile = {
      profilePicture: graduate["profile-picture-url"],
      fullName: `${user["first-name"]} ${user["last-name"]}`,
      faculty: facultyName,
      graduationYear: graduate["graduation-year"],
      bio: graduate.bio,
      skills: graduate.skills,
      currentJob: graduate["current-job"],
      showCV: graduate.show_cv,
      showLinkedIn: graduate.show_linkedin,
      showPhone: user.show_phone,
      CV: graduate["cv-url"],
      linkedlnLink: graduate["linkedln-link"],
      phoneNumber: user.phoneNumber,
    };

    // Log successful retrieval
    logger.info("Graduate profile retrieved successfully", {
      graduateId,
      userId: req.user?.id,
      isOwner,
      faculty: facultyName,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      status: HttpStatusHelper.SUCCESS,
      message: "Graduate Profile fetched successfully",
      data: graduateProfile,
    });
  } catch (err) {
    // Log error
    logger.error("Error getting graduate profile", {
      userId: req.user?.id,
      graduateId: req.params.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error in getGraduateProfile:", err);
    return res.status(500).json({
      status: HttpStatusHelper.ERROR || "error",
      message: err.message,
      data: null,
    });
  }
};

/**
 * Update graduate profile
 * @route PUT /api/graduates/profile/update
 * @access Private (Graduates only)
 */
/**
 * Update graduate profile
 * @route PUT /api/graduates/profile/update
 * @access Private (Graduates only)
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // ============================================
    // 🚀 START - UPDATE PROFILE FUNCTION CALLED
    // ============================================
    console.log("\n" + "🟢".repeat(40));
    console.log(
      "🟢 UPDATE PROFILE FUNCTION CALLED at:",
      new Date().toISOString()
    );
    console.log("🟢 User ID:", userId);
    console.log("🟢".repeat(40));

    // Log full request details
    console.log("\n📦 [1] REQUEST DETAILS:");
    console.log("   - Body keys:", Object.keys(req.body));
    console.log("   - Body values:", JSON.stringify(req.body, null, 2));
    console.log("   - Has profile picture:", !!req.files?.profilePicture);
    console.log("   - Has CV:", !!req.files?.cv);
    console.log("   - Remove profile picture:", req.body.removeProfilePicture);
    console.log("   - Remove CV:", req.body.removeCV);

    // Log request initiation with logger
    logger.info("Update graduate profile request initiated", {
      userId,
      updateFields: Object.keys(req.body),
      bodyData: req.body,
      hasProfilePicture: !!req.files?.profilePicture,
      hasCV: !!req.files?.cv,
      removeProfilePicture: !!req.body.removeProfilePicture,
      removeCV: !!req.body.removeCV,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Find graduate
    console.log("\n🔍 [2] FINDING GRADUATE IN DATABASE:");
    console.log("   - Searching for graduate_id:", userId);

    const graduate = await Graduate.findByPk(userId, {
      include: [{ model: User }],
      attributes: { exclude: ["faculty"] },
    });

    if (!graduate) {
      console.log("   ❌ Graduate not found!");
      logger.warn("Graduate not found for profile update", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Graduate not found",
        data: null,
      });
    }

    console.log("   ✅ Graduate found:");
    console.log("      - graduate_id:", graduate.graduate_id);
    console.log(
      "      - Current graduation year:",
      graduate["graduation-year"]
    );
    console.log("      - Current bio:", graduate.bio);
    console.log("      - Current skills:", graduate.skills);

    const user = graduate.User;
    console.log("   ✅ User found:");
    console.log("      - User ID:", user.id);
    console.log("      - Current first name:", user["first-name"]);
    console.log("      - Current last name:", user["last-name"]);

    // ============================================
    // 🔄 [2.5] SYNC WITH EXTERNAL SYSTEM FOR FACULTY & GRADUATION YEAR
    // ============================================
    console.log("\n🔄 [2.5] CHECKING FOR EXTERNAL DATA SYNC:");

    // حاول تجيب البيانات من السيستم الأول لو مش موجودة
    if (!graduate.faculty_code || !graduate["graduation-year"]) {
      console.log("   - Missing faculty or graduation year, trying to fetch from external system...");
      
      // فك تشفير الرقم القومي
      let nationalId = null;
      if (user["national-id"]) {
        const decrypted = aes.decryptNationalId(user["national-id"]);
        if (decrypted) {
          nationalId = decrypted;
          console.log("   - Decrypted national ID:", nationalId.substring(0, 6) + "****");
        } else {
          console.log("   - ❌ Could not decrypt national ID");
          // Try using the raw value if it looks like a national ID
          const rawNid = String(user["national-id"]).trim();
          if (/^\d{14}$/.test(rawNid)) {
            nationalId = rawNid;
            console.log("   - Using raw national ID (unencrypted):", nationalId.substring(0, 6) + "****");
          }
        }
      }
      
      if (nationalId) {
        try {
          const externalApiUrl = `http://localhost:5155/api/graduates/details/${nationalId}`;
          console.log(`   - Calling external API: ${externalApiUrl}`);
          
          const externalResponse = await axios.get(externalApiUrl, { 
            timeout: 5000,
            headers: { 'Accept': 'application/json' }
          });
          
          if (externalResponse.data) {
            const externalData = externalResponse.data;
            console.log("   - ✅ External data received:");
            console.log("      - Faculty:", externalData.faculty);
            console.log("      - Department:", externalData.department);
            console.log("      - Graduation Year:", externalData.graduationYear);
            
            // تحديث faculty_code
            if (externalData.faculty && !graduate.faculty_code) {
              const facultyCode = normalizeCollegeName(externalData.faculty);
              if (facultyCode) {
                console.log(`      - ✅ Setting faculty_code to: ${facultyCode}`);
                graduate.faculty_code = facultyCode;
              } else {
                console.log(`      - ⚠️ Could not normalize faculty: ${externalData.faculty}`);
                // If normalization fails, store the original faculty name temporarily
                graduate.faculty_code = externalData.faculty;
              }
            }
            
            // تحديث سنة التخرج
            if (externalData.graduationYear && !graduate["graduation-year"]) {
              const year = parseInt(externalData.graduationYear);
              if (!isNaN(year) && year > 1900 && year < 2100) {
                console.log(`      - ✅ Setting graduation year to: ${year}`);
                graduate["graduation-year"] = year;
              } else {
                console.log(`      - ⚠️ Invalid graduation year: ${externalData.graduationYear}`);
              }
            }
            
            // حفظ department في skills لو skills فاضية
            if (externalData.department && !graduate.skills) {
              console.log(`      - ✅ Setting department to skills: ${externalData.department}`);
              graduate.skills = externalData.department;
            }
            
            console.log("   - ✅ External data synced successfully");
          }
        } catch (error) {
          console.log("   - ❌ Failed to fetch external data:");
          console.log("      - Error message:", error.message);
          console.log("      - Error code:", error.code);
          if (error.response) {
            console.log("      - Response status:", error.response.status);
            console.log("      - Response data:", error.response.data);
          } else if (error.code === 'ECONNREFUSED') {
            console.log("      - ⚠️ External system (port 5155) is not running or refused connection");
          } else if (error.code === 'ETIMEDOUT') {
            console.log("      - ⚠️ External system request timed out");
          }
          
          logger.warn("Failed to sync with external system during profile update", {
            userId,
            nationalId: nationalId?.substring(0, 6) + "****",
            error: error.message,
            code: error.code,
            ip: req.ip,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        console.log("   - ⚠️ No national ID available for external sync");
      }
    } else {
      console.log("   - ✅ Faculty and graduation year already exist:");
      console.log(`      - faculty_code: ${graduate.faculty_code}`);
      console.log(`      - graduation-year: ${graduate["graduation-year"]}`);
    }

    // ============================================
    // 📝 [3] UPDATE USER FIELDS (TEXT FIELDS)
    // ============================================
    console.log("\n📝 [3] UPDATING USER FIELDS:");

    const userFields = ["firstName", "lastName", "phoneNumber"];
    userFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        const oldValue =
          field === "firstName"
            ? user["first-name"]
            : field === "lastName"
            ? user["last-name"]
            : user.phoneNumber;

        console.log(`   - Field: ${field}`);
        console.log(`     Old value: "${oldValue}"`);
        console.log(`     New value: "${req.body[field]}"`);

        if (field === "firstName") user["first-name"] = req.body[field];
        else if (field === "lastName") user["last-name"] = req.body[field];
        else if (field === "phoneNumber") user.phoneNumber = req.body[field];
      }
    });

    // ============================================
    // 🎯 [4] UPDATE GRADUATE FIELDS WITH TYPE HANDLING
    // ============================================
    console.log("\n🎯 [4] UPDATING GRADUATE FIELDS (WITH TYPE HANDLING):");

    // Define fields with their types for proper handling
    const graduateFields = [
      { bodyKey: "bio", dbKey: "bio", type: "string", description: "Bio" },
      {
        bodyKey: "skills",
        dbKey: "skills",
        type: "string",
        description: "Skills",
      },
      {
        bodyKey: "currentJob",
        dbKey: "current-job",
        type: "string",
        description: "Current Job",
      },
      {
        bodyKey: "graduationYear",
        dbKey: "graduation-year",
        type: "number",
        description: "Graduation Year",
      },
      {
        bodyKey: "linkedlnLink",
        dbKey: "linkedln-link",
        type: "string",
        description: "LinkedIn Link",
      },
    ];

    graduateFields.forEach(({ bodyKey, dbKey, type, description }) => {
      if (req.body[bodyKey] !== undefined) {
        const oldValue = graduate[dbKey];
        let newValue = req.body[bodyKey];

        console.log(`   🔸 ${description} (${bodyKey} -> ${dbKey}):`);
        console.log(
          `      - Raw value from request: "${newValue}" (type: ${typeof newValue})`
        );

        // Handle different data types
        if (type === "number") {
          console.log(`      - Processing as NUMBER type`);

          // Case 1: Empty string or null/undefined
          if (newValue === "" || newValue === null || newValue === undefined) {
            console.log(`      - ⚠️ Empty value detected, converting to null`);
            newValue = null;
          }
          // Case 2: It's already a number
          else if (typeof newValue === "number") {
            console.log(`      - ✅ Valid number: ${newValue}`);
            newValue = newValue;
          }
          // Case 3: It's a string that might contain a number
          else if (typeof newValue === "string") {
            console.log(`      - Attempting to parse string to number`);
            const trimmed = newValue.trim();

            if (trimmed === "") {
              console.log(
                `      - ⚠️ Empty string after trim, converting to null`
              );
              newValue = null;
            } else {
              const parsed = parseInt(trimmed, 10);
              if (!isNaN(parsed)) {
                console.log(`      - ✅ Successfully parsed to: ${parsed}`);
                newValue = parsed;
              } else {
                console.log(
                  `      - ❌ Failed to parse "${trimmed}" to number, converting to null`
                );
                newValue = null;
              }
            }
          }
          // Case 4: Any other type (boolean, object, etc.)
          else {
            console.log(
              `      - ❌ Unexpected type: ${typeof newValue}, converting to null`
            );
            newValue = null;
          }
        } else if (type === "string") {
          console.log(`      - Processing as STRING type`);
          // For string fields, convert null/undefined to empty string
          if (newValue === null || newValue === undefined) {
            console.log(
              `      - ⚠️ Null/undefined value, converting to empty string`
            );
            newValue = "";
          } else {
            console.log(`      - ✅ Using string value: "${newValue}"`);
          }
        }

        console.log(`      - Old value: "${oldValue}"`);
        console.log(
          `      - Final value: "${newValue}" (type: ${typeof newValue})`
        );

        graduate[dbKey] = newValue;
      }
    });

    // ============================================
    // 🏛️ [5] UPDATE FACULTY IF PROVIDED
    // ============================================
    console.log("\n🏛️ [5] PROCESSING FACULTY UPDATE:");
    if (req.body.faculty !== undefined) {
      console.log(`   - Faculty from request: "${req.body.faculty}"`);
      const facultyCode = normalizeCollegeName(req.body.faculty);
      if (facultyCode) {
        console.log(`   - ✅ Normalized to code: ${facultyCode}`);
        console.log(`   - Old faculty_code: ${graduate.faculty_code}`);
        graduate.faculty_code = facultyCode;
      } else {
        console.log(`   - ❌ Could not normalize faculty name`);
      }
    } else {
      console.log(`   - No faculty update provided`);
    }

    // ============================================
    // 🔒 [6] UPDATE PRIVACY SETTINGS
    // ============================================
    console.log("\n🔒 [6] UPDATING PRIVACY SETTINGS:");

    if (req.body.showCV !== undefined) {
      console.log(
        `   - Show CV: ${req.body.showCV} (old: ${graduate.show_cv})`
      );
      graduate.show_cv = req.body.showCV;
    }
    if (req.body.showLinkedIn !== undefined) {
      console.log(
        `   - Show LinkedIn: ${req.body.showLinkedIn} (old: ${graduate.show_linkedin})`
      );
      graduate.show_linkedin = req.body.showLinkedIn;
    }
    if (req.body.showPhone !== undefined) {
      console.log(
        `   - Show Phone: ${req.body.showPhone} (old: ${user.show_phone})`
      );
      user.show_phone = req.body.showPhone;
    }

    // ============================================
    // 📸 [7] HANDLE PROFILE PICTURE UPLOAD
    // ============================================
    console.log("\n📸 [7] PROCESSING PROFILE PICTURE:");

    if (req.files?.profilePicture?.[0]) {
      const profilePic = req.files.profilePicture[0];
      console.log(`   - Uploading new profile picture:`);
      console.log(`     - Path: ${profilePic.path || profilePic.url}`);
      console.log(
        `     - Public ID: ${profilePic.filename || profilePic.public_id}`
      );

      graduate["profile-picture-url"] = profilePic.path || profilePic.url;
      graduate["profile-picture-public-id"] =
        profilePic.filename || profilePic.public_id;

      logger.debug("Profile picture updated", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    if (req.body.removeProfilePicture) {
      console.log(`   - Removing profile picture requested`);
      if (graduate["profile-picture-public-id"]) {
        console.log(
          `     - Deleting from Cloudinary: ${graduate["profile-picture-public-id"]}`
        );
        try {
          await cloudinary.uploader.destroy(
            graduate["profile-picture-public-id"]
          );
          console.log(`     - ✅ Deleted successfully`);
          logger.debug("Old profile picture deleted from Cloudinary", {
            userId,
            publicId: graduate["profile-picture-public-id"],
            ip: req.ip,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          console.log(`     - ❌ Failed to delete: ${err.message}`);
          logger.warn("Failed to delete profile picture from Cloudinary", {
            userId,
            error: err.message,
            ip: req.ip,
            timestamp: new Date().toISOString(),
          });
        }
      }
      graduate["profile-picture-url"] = null;
      graduate["profile-picture-public-id"] = null;
      console.log(`   - ✅ Profile picture removed from database`);
    }

    // ============================================
    // 📄 [8] HANDLE CV UPLOAD
    // ============================================
    console.log("\n📄 [8] PROCESSING CV:");

    if (req.files?.cv?.[0]) {
      const cvFile = req.files.cv[0];
      console.log(`   - Uploading new CV:`);
      console.log(`     - Path: ${cvFile.path || cvFile.url}`);
      console.log(`     - Public ID: ${cvFile.filename || cvFile.public_id}`);

      if (graduate.cv_public_id) {
        console.log(`     - Deleting old CV: ${graduate.cv_public_id}`);
        try {
          await cloudinary.uploader.destroy(graduate.cv_public_id, {
            resource_type: "raw",
          });
          console.log(`     - ✅ Old CV deleted successfully`);
          logger.debug("Old CV deleted from Cloudinary", {
            userId,
            publicId: graduate.cv_public_id,
            ip: req.ip,
            timestamp: new Date().toISOString(),
          });
        } catch (deleteErr) {
          console.log(
            `     - ❌ Failed to delete old CV: ${deleteErr.message}`
          );
          logger.warn("Failed to delete old CV from Cloudinary", {
            userId,
            error: deleteErr.message,
            ip: req.ip,
            timestamp: new Date().toISOString(),
          });
        }
      }

      graduate["cv-url"] = cvFile.path || cvFile.url;
      graduate.cv_public_id = cvFile.filename || cvFile.public_id;
      console.log(`   - ✅ CV uploaded successfully`);

      logger.debug("CV updated", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    if (req.body.removeCV) {
      console.log(`   - Removing CV requested`);
      if (graduate.cv_public_id) {
        console.log(
          `     - Deleting from Cloudinary: ${graduate.cv_public_id}`
        );
        try {
          await cloudinary.uploader.destroy(graduate.cv_public_id, {
            resource_type: "raw",
          });
          console.log(`     - ✅ Deleted successfully`);
          logger.debug("CV deleted from Cloudinary", {
            userId,
            publicId: graduate.cv_public_id,
            ip: req.ip,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          console.log(`     - ❌ Failed to delete: ${err.message}`);
          logger.warn("Failed to delete CV from Cloudinary", {
            userId,
            error: err.message,
            ip: req.ip,
            timestamp: new Date().toISOString(),
          });
        }
      }
      graduate["cv-url"] = null;
      graduate.cv_public_id = null;
      console.log(`   - ✅ CV removed from database`);
    }

    // ============================================
    // 💾 [9] SAVE ALL CHANGES TO DATABASE
    // ============================================
    console.log("\n💾 [9] SAVING CHANGES TO DATABASE:");

    console.log("   - Saving User changes...");
    await user.save();
    console.log("   - ✅ User saved successfully");

    console.log("   - Saving Graduate changes...");
    await graduate.save();
    console.log("   - ✅ Graduate saved successfully");

    // ============================================
    // 📊 [10] PREPARE RESPONSE DATA
    // ============================================
    console.log("\n📊 [10] PREPARING RESPONSE DATA:");

    const lang = req.headers["accept-language"] || req.user.language || "ar";
    const facultyName = getCollegeNameByCode(graduate.faculty_code, lang);

    console.log(`   - Faculty name: ${facultyName}`);
    console.log(`   - Graduation year: ${graduate["graduation-year"]}`);
    console.log(`   - Bio: ${graduate.bio ? "✅" : "❌"}`);
    console.log(`   - Skills: ${graduate.skills ? "✅" : "❌"}`);
    console.log(`   - Current Job: ${graduate["current-job"] ? "✅" : "❌"}`);

    const graduateProfile = {
      profilePicture: graduate["profile-picture-url"],
      fullName: `${user["first-name"]} ${user["last-name"]}`,
      faculty: facultyName,
      graduationYear: graduate["graduation-year"],
      bio: graduate.bio,
      skills: graduate.skills,
      currentJob: graduate["current-job"],
      showCV: graduate.show_cv,
      showLinkedIn: graduate.show_linkedin,
      showPhone: user.show_phone,
      CV: graduate["cv-url"],
      linkedlnLink: graduate["linkedln-link"],
      phoneNumber: user.phoneNumber,
    };

    // ============================================
    // ✅ [11] LOG SUCCESS AND RETURN RESPONSE
    // ============================================
    console.log("\n✅ [11] PROFILE UPDATED SUCCESSFULLY:");
    console.log("   - User ID:", userId);
    console.log("   - Updated fields:", Object.keys(req.body).join(", "));
    console.log("   - Faculty:", facultyName);
    console.log("\n📤 RESPONSE DATA:");
    console.log(JSON.stringify(graduateProfile, null, 2));
    console.log("\n" + "🟢".repeat(40) + "\n");

    logger.info("Graduate profile updated successfully", {
      userId,
      updatedFields: Object.keys(req.body),
      faculty: facultyName,
      graduationYear: graduate["graduation-year"],
      hasProfilePicture: !!graduate["profile-picture-url"],
      hasCV: !!graduate["cv-url"],
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      status: HttpStatusHelper.SUCCESS,
      message: "Graduate profile updated successfully",
      data: graduateProfile,
    });
  } catch (err) {
    // ============================================
    // ❌ ERROR HANDLING
    // ============================================
    console.log("\n❌".repeat(40));
    console.log("❌ ERROR IN UPDATE PROFILE:");
    console.log("❌ Time:", new Date().toISOString());
    console.log("❌ User ID:", req.user?.id);
    console.log("❌ Error name:", err.name);
    console.log("❌ Error message:", err.message);
    console.log("❌ Error stack:", err.stack);

    if (err.original) {
      console.log("❌ Original error:", err.original);
    }

    console.log("❌".repeat(40) + "\n");

    logger.error("Error updating graduate profile", {
      userId: req.user?.id,
      error: err.message,
      errorName: err.name,
      stack: err.stack?.substring(0, 500),
      sql: err.original?.sql,
      parameters: err.original?.parameters,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR || "error",
      message: err.message,
      data: null,
      error:
        process.env.NODE_ENV === "development"
          ? {
              name: err.name,
              stack: err.stack,
            }
          : undefined,
    });
  }
};

/**
 * Download CV for a graduate
 * @route GET /api/graduates/:id/cv/download
 * @access Private
 */
const downloadCv = async (req, res) => {
  try {
    const graduateId = req.params.id;

    // Log request initiation
    logger.info("Download CV request initiated", {
      userId: req.user?.id,
      graduateId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const graduate = await Graduate.findByPk(graduateId, {
      attributes: { exclude: ["faculty"] },
    });

    if (!graduate || !graduate["cv-url"]) {
      // Log not found
      logger.warn("CV not found for download", {
        graduateId,
        hasCV: !!graduate?.["cv-url"],
        userId: req.user?.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "error",
        message: "CV not found",
        data: null,
      });
    }

    const signedUrl = cloudinary.url(graduate.cv_public_id, {
      resource_type: "auto",
      type: "authenticated",
      sign_url: true,
    });

    const response = await axios.get(signedUrl, { responseType: "stream" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${graduate["cv-url"].split("/").pop()}"`
    );
    res.setHeader("Content-Type", response.headers["content-type"]);

    // Log successful download initiation
    logger.info("CV download initiated", {
      graduateId,
      fileName: graduate["cv-url"].split("/").pop(),
      userId: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    response.data.pipe(res);
  } catch (err) {
    // Log error
    logger.error("Error downloading CV", {
      userId: req.user?.id,
      graduateId: req.params.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error downloading CV:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      data: null,
    });
  }
};

/**
 * Activate / Inactivate Graduate
 * @route PUT /api/graduates/:id/status
 * @access Private (Admin only)
 */
const updateGraduateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Log request initiation
    logger.info("Update graduate status request initiated", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
      graduateId: id,
      newStatus: status,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const allowedUserTypes = ["admin", "staff"];
    if (!allowedUserTypes.includes(req.user["user-type"])) {
      // Log unauthorized access
      logger.warn("Unauthorized access to update graduate status", {
        userId: req.user?.id,
        userType: req.user?.["user-type"],
        graduateId: id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(403).json({
        status: HttpStatusHelper.ERROR,
        message: "Access denied.",
        data: null,
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Graduate management",
        "edit"
      );

      if (!hasPermission) {
        // Log permission denied
        logger.warn("Staff permission denied for updating graduate status", {
          userId: req.user.id,
          permission: "Graduate management",
          graduateId: id,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({
          status: HttpStatusHelper.ERROR,
          message:
            "Access denied. You don't have permission to update graduate status.",
          data: null,
        });
      }
    }

    if (!["active", "inactive"].includes(status)) {
      // Log invalid status
      logger.warn("Invalid status value for graduate update", {
        graduateId: id,
        status,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: HttpStatusHelper.FAIL,
        message: "Invalid status value. Use 'active' or 'inactive'.",
        data: null,
      });
    }

    const graduate = await Graduate.findByPk(id, {
      include: [User],
      attributes: { exclude: ["faculty"] },
    });

    if (!graduate) {
      // Log not found
      logger.warn("Graduate not found for status update", {
        graduateId: id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Graduate not found",
        data: null,
      });
    }

    const oldStatus = graduate.status;
    graduate.status = status;
    await graduate.save();

    const lang = req.headers["accept-language"] || req.user.language || "ar";
    const facultyName = getCollegeNameByCode(graduate.faculty_code, lang);

    // Log successful update
    logger.info("Graduate status updated successfully", {
      graduateId: graduate.graduate_id,
      userId: req.user.id,
      oldStatus,
      newStatus: status,
      faculty: facultyName,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      status: HttpStatusHelper.SUCCESS,
      message: `Graduate status updated to ${status} successfully`,
      data: {
        graduateId: graduate.graduate_id,
        fullName: `${graduate.User["first-name"]} ${graduate.User["last-name"]}`,
        faculty: facultyName,
        status: graduate.status,
      },
    });
  } catch (err) {
    // Log error
    logger.error("Error updating graduate status", {
      userId: req.user?.id,
      graduateId: req.params.id,
      error: err.message,
      stack: err.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: err.message,
      data: null,
    });
  }
};

/**
 * Search graduates by faculty and graduation year
 * @route GET /api/graduates/search
 * @access Private
 */
const searchGraduates = async (req, res) => {
  try {
    const { faculty, "graduation-year": graduationYear } = req.query;

    // Log request initiation
    logger.info("Search graduates request initiated", {
      userId: req.user?.id,
      faculty,
      graduationYear,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const whereClause = {};

    // Search using faculty_code instead of faculty
    if (faculty) {
      const facultyCode = normalizeCollegeName(faculty);
      if (facultyCode) {
        whereClause.faculty_code = facultyCode;
      }
    }

    if (graduationYear) whereClause["graduation-year"] = graduationYear;

    const graduates = await Graduate.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email"],
        },
      ],
      attributes: { exclude: ["faculty"] },
    });

    const lang = req.headers["accept-language"] || req.user?.language || "ar";

    const graduatesWithFaculty = graduates.map((g) => ({
      ...g.toJSON(),
      faculty: getCollegeNameByCode(g.faculty_code, lang),
    }));

    // Log successful search
    logger.info("Graduate search completed successfully", {
      userId: req.user?.id,
      resultCount: graduatesWithFaculty.length,
      faculty,
      graduationYear,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      status: "success",
      data: graduatesWithFaculty,
    });
  } catch (error) {
    // Log error
    logger.error("Error searching graduates", {
      userId: req.user?.id,
      faculty: req.query.faculty,
      graduationYear: req.query["graduation-year"],
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Error searching graduates:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to search graduates",
      error: error.message,
    });
  }
};

/**
 * Get public graduate profile (limited public data)
 * @route GET /api/graduates/public/:id
 * @access Public
 */
const getPublicGraduateProfile = async (req, res) => {
  try {
    const { id } = req.params;

    // ============================================
    // 🚀 START - GET PUBLIC GRADUATE PROFILE
    // ============================================
    console.log("\n" + "👤".repeat(50));
    console.log("👤 GET PUBLIC GRADUATE PROFILE CALLED at:", new Date().toISOString());
    console.log("👤".repeat(50));
    
    // 📍 LOG 1: بداية الطلب
    console.log("\n📍 [1] REQUEST DETAILS:");
    console.log(`   - Time: ${new Date().toISOString()}`);
    console.log(`   - Graduate ID from params: ${id}`);
    console.log(`   - IP: ${req.ip}`);
    console.log(`   - Headers:`, JSON.stringify({
      'accept-language': req.headers['accept-language'],
      'user-agent': req.headers['user-agent']?.substring(0, 50) + '...',
      'host': req.headers['host']
    }, null, 2));

    // Log request initiation
    logger.info("Get public graduate profile request initiated", {
      userId: req.user?.id,
      graduateId: id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 📍 LOG 2: البحث في قاعدة البيانات
    console.log("\n📍 [2] FETCHING FROM LOCAL DATABASE:");
    console.log(`   - Query: Graduate.findByPk(${id}) with include User`);

    const graduate = await Graduate.findByPk(id, {
      include: [{ model: User }],
      attributes: { exclude: ["faculty"] },
    });

    if (!graduate) {
      console.log(`   ❌ Graduate NOT FOUND with ID: ${id}`);
      
      logger.warn("Graduate not found for public profile", {
        graduateId: id,
        userId: req.user?.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "Graduate not found",
        data: null,
      });
    }

    console.log(`   ✅ Graduate FOUND in database:`);
    console.log(`      - graduate_id: ${graduate.graduate_id}`);
    console.log(`      - faculty_code: ${graduate.faculty_code || 'null'}`);
    console.log(`      - graduation_year: ${graduate["graduation-year"] || 'null'}`);
    console.log(`      - skills: ${graduate.skills || 'null'}`);
    console.log(`      - has profile picture: ${!!graduate["profile-picture-url"]}`);

    const user = graduate.User;
    if (!user) {
      console.log(`   ❌ User NOT FOUND for graduate ID: ${id}`);
      
      logger.warn("User not found for graduate in public profile", {
        graduateId: id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      
      return res.status(404).json({
        status: HttpStatusHelper.FAIL,
        message: "User not found for this graduate",
        data: null,
      });
    }

    console.log(`   ✅ User FOUND:`);
    console.log(`      - User ID: ${user.id}`);
    console.log(`      - First name: ${user["first-name"]}`);
    console.log(`      - Last name: ${user["last-name"]}`);
    console.log(`      - Email: ${user.email}`);
    console.log(`      - Has national-id: ${!!user["national-id"]}`);

    // 📍 LOG 3: تجهيز البيانات المحلية كـ fallback
    console.log("\n📍 [3] PREPARING LOCAL DATA (FALLBACK):");
    const lang = req.headers["accept-language"] || "ar";
    console.log(`   - Language from headers: ${req.headers['accept-language'] || 'not provided, using default'}`);
    console.log(`   - Final language: ${lang}`);

    const localFacultyName = getCollegeNameByCode(graduate.faculty_code, lang);
    console.log(`   - faculty_code: ${graduate.faculty_code}`);
    console.log(`   - Converted to faculty name: "${localFacultyName}"`);

    const localProfile = {
      fullName: `${user["first-name"] || ""} ${user["last-name"] || ""}`.trim(),
      faculty: localFacultyName,
      department: graduate.skills || null,
      graduationYear: graduate["graduation-year"] || null,
      image: graduate["profile-picture-url"] || null,
    };

    console.log(`   📦 Local profile data prepared:`);
    console.log(`      - fullName: "${localProfile.fullName}"`);
    console.log(`      - faculty: "${localProfile.faculty}"`);
    console.log(`      - department: ${localProfile.department || 'null'}`);
    console.log(`      - graduationYear: ${localProfile.graduationYear || 'null'}`);
    console.log(`      - image: ${localProfile.image ? '✅' : '❌'}`);

    // 📍 LOG 4: محاولة فك تشفير الرقم القومي
    console.log("\n📍 [4] DECRYPTING NATIONAL ID:");
    
    let nationalIdToUse = null;
    let decryptionSuccess = false;

    if (user["national-id"]) {
      console.log(`   - Encrypted national ID (first 20 chars): ${user["national-id"].substring(0, 20)}...`);
      console.log(`   - Encrypted length: ${user["national-id"].length}`);
      
      const decrypted = aes.decryptNationalId(user["national-id"]);
      if (decrypted) {
        nationalIdToUse = decrypted;
        decryptionSuccess = true;
        console.log(`   ✅ Decrypted successfully: ${nationalIdToUse.substring(0, 6)}**** (length: ${nationalIdToUse.length})`);
      } else {
        console.log(`   ❌ Decryption FAILED, trying raw value`);
        const nationalIdStr = String(user["national-id"]).trim();
        console.log(`   - Raw string value: ${nationalIdStr.substring(0, 6)}**** (length: ${nationalIdStr.length})`);
        console.log(`   - Is 14 digits? ${/^\d{14}$/.test(nationalIdStr) ? 'YES' : 'NO'}`);
        
        if (/^\d{14}$/.test(nationalIdStr)) {
          nationalIdToUse = nationalIdStr;
          decryptionSuccess = true;
          console.log(`   ✅ Using raw national ID: ${nationalIdToUse.substring(0, 6)}****`);
        } else {
          console.log(`   ❌ Could NOT validate national ID`);
        }
      }
    } else {
      console.log(`   ❌ No national ID found for user`);
    }

    // 📍 LOG 5: إذا مفيش رقم قومي صالح، استخدم البيانات المحلية
    if (!nationalIdToUse) {
      console.log("\n📍 [5] NO VALID NATIONAL ID - USING LOCAL DATA ONLY");
      
      logger.info("Public graduate profile retrieved (using local data - no national ID)", {
        graduateId: id,
        hasNationalId: false,
        faculty: localFacultyName,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      console.log("\n📦 FINAL RESPONSE (LOCAL ONLY):");
      console.log(JSON.stringify({
        status: HttpStatusHelper.SUCCESS,
        message: "Public graduate profile fetched successfully (using local data)",
        data: localProfile
      }, null, 2));
      
      console.log("\n" + "👤".repeat(50));
      console.log("👤 END - GET PUBLIC GRADUATE PROFILE COMPLETED (LOCAL DATA)");
      console.log("👤".repeat(50) + "\n");

      return res.json({
        status: HttpStatusHelper.SUCCESS,
        message: "Public graduate profile fetched successfully (using local data)",
        data: localProfile,
      });
    }

    // 📍 LOG 6: محاولة جلب البيانات من API الخارجي
    console.log("\n📍 [6] FETCHING FROM EXTERNAL API:");
    console.log(`   - National ID to use: ${nationalIdToUse.substring(0, 6)}****`);
    console.log(`   - GRADUATE_API_URL from env: ${process.env.GRADUATE_API_URL || 'NOT SET'}`);

    let externalData = null;
    let externalError = null;
    let useLocalData = false;

    try {
      if (!process.env.GRADUATE_API_URL) {
        console.log(`   ❌ GRADUATE_API_URL is NOT configured`);
        throw new Error("GRADUATE_API_URL is not configured");
      }

      // بناء الرابط - لاحظ أني غيرته للصيغة الصحيحة
      const apiUrl = `${process.env.GRADUATE_API_URL}?nationalId=${nationalIdToUse}`;
      console.log(`   📞 Calling external API:`);
      console.log(`      - Full URL: ${apiUrl}`);
      console.log(`      - Timeout: 5000ms`);
      console.log(`      - Headers: ${JSON.stringify({ Accept: "application/json" })}`);

      const startTime = Date.now();
      console.log(`   - Call started at: ${new Date(startTime).toISOString()}`);

      const response = await axios.get(apiUrl, {
        timeout: 5000,
        headers: { Accept: "application/json" },
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`   ✅ EXTERNAL API CALL COMPLETED:`);
      console.log(`      - Duration: ${duration}ms`);
      console.log(`      - Status: ${response.status}`);

      if (response.status === 200 && response.data) {
        externalData = response.data;
        console.log(`   ✅ EXTERNAL DATA RECEIVED:`);
        console.log(`      - Data type: ${typeof externalData}`);
        console.log(`      - Full response:`, JSON.stringify(externalData, null, 2));
        
        // استخراج الحقول المهمة
        console.log(`      - Extracted fields:`);
        console.log(`         • fullName: ${externalData.fullName || externalData['full-name'] || 'N/A'}`);
        console.log(`         • faculty: ${externalData.faculty || externalData.Faculty || 'N/A'}`);
        console.log(`         • department: ${externalData.department || externalData.Department || 'N/A'}`);
        console.log(`         • graduationYear: ${externalData.graduationYear || externalData['graduation-year'] || 'N/A'}`);
      } else {
        console.log(`   ⚠️ API returned non-200 status: ${response.status}`);
        externalError = new Error(`API returned status ${response.status}`);
        useLocalData = true;
      }
    } catch (error) {
      console.log(`   ❌ EXTERNAL API CALL FAILED:`);
      console.log(`      - Error name: ${error.name}`);
      console.log(`      - Error message: ${error.message}`);
      console.log(`      - Error code: ${error.code || 'N/A'}`);
      
      if (error.response) {
        console.log(`      - Response status: ${error.response.status}`);
        console.log(`      - Response data:`, JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.log(`      - Request was made but no response received`);
      }
      
      externalError = error;
      useLocalData = true;
      
      logger.error("External API failed for public profile", {
        graduateId: id,
        error: error.message,
        errorCode: error.code,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    // 📍 LOG 7: تجهيز البيانات النهائية
    console.log("\n📍 [7] BUILDING FINAL PROFILE DATA:");
    
    let finalProfile;
    
    if (useLocalData || !externalData) {
      console.log(`   ⚠️ USING LOCAL DATA AS FALLBACK`);
      console.log(`   - Reason: ${externalError ? externalError.message : 'No external data'}`);
      
      finalProfile = localProfile;
      
      logger.info("Public graduate profile retrieved (using local data - external failed)", {
        graduateId: id,
        hasNationalId: true,
        externalError: externalError?.message,
        faculty: localFacultyName,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(`   ✅ USING EXTERNAL DATA`);
      
      // استخراج faculty name
      let facultyName;
      if (externalData.faculty || externalData.Faculty || externalData.facultyName) {
        facultyName = externalData.faculty || externalData.Faculty || externalData.facultyName;
        console.log(`   - Faculty from external: "${facultyName}"`);
      } else {
        facultyName = localFacultyName;
        console.log(`   - Faculty from local: "${facultyName}"`);
      }

      // استخراج full name
      let fullName;
      if (externalData.fullName || externalData['full-name']) {
        fullName = externalData.fullName || externalData['full-name'];
        console.log(`   - Full name from external: "${fullName}"`);
      } else if (externalData['first-name'] && externalData['last-name']) {
        fullName = `${externalData['first-name']} ${externalData['last-name']}`.trim();
        console.log(`   - Full name from external (first/last): "${fullName}"`);
      } else {
        fullName = localProfile.fullName;
        console.log(`   - Full name from local: "${fullName}"`);
      }

      // استخراج department
      let department = externalData.department || externalData.Department || null;
      if (!department) {
        department = graduate.skills || null;
        console.log(`   - Department from local: ${department || 'null'}`);
      } else {
        console.log(`   - Department from external: "${department}"`);
      }

      // استخراج graduation year
      let graduationYear = externalData.graduationYear || externalData['graduation-year'] || null;
      if (!graduationYear) {
        graduationYear = graduate["graduation-year"] || null;
        console.log(`   - Graduation year from local: ${graduationYear || 'null'}`);
      } else {
        console.log(`   - Graduation year from external: ${graduationYear}`);
      }

      finalProfile = {
        fullName: fullName,
        faculty: facultyName,
        department: department,
        graduationYear: graduationYear,
        image: graduate["profile-picture-url"] || null,
      };

      logger.info("Public graduate profile retrieved successfully (using external data)", {
        graduateId: id,
        faculty: facultyName,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    // 📍 LOG 8: إرسال الـ response
    console.log("\n📍 [8] FINAL RESPONSE:");
    console.log(`   - Using: ${useLocalData ? 'LOCAL DATA' : 'EXTERNAL DATA'}`);
    console.log(`   - Response data:`);
    console.log(`      • fullName: "${finalProfile.fullName}"`);
    console.log(`      • faculty: "${finalProfile.faculty}"`);
    console.log(`      • department: ${finalProfile.department || 'null'}`);
    console.log(`      • graduationYear: ${finalProfile.graduationYear || 'null'}`);
    console.log(`      • image: ${finalProfile.image ? '✅' : '❌'}`);

    console.log("\n📦 FULL RESPONSE OBJECT:");
    console.log(JSON.stringify({
      status: HttpStatusHelper.SUCCESS,
      message: useLocalData 
        ? "Public graduate profile fetched successfully (using local data)" 
        : "Public graduate profile fetched successfully",
      data: finalProfile
    }, null, 2));

    console.log("\n" + "👤".repeat(50));
    console.log("👤 END - GET PUBLIC GRADUATE PROFILE COMPLETED");
    console.log("👤".repeat(50) + "\n");

    return res.json({
      status: HttpStatusHelper.SUCCESS,
      message: useLocalData 
        ? "Public graduate profile fetched successfully (using local data)" 
        : "Public graduate profile fetched successfully",
      data: finalProfile,
    });

  } catch (err) {
    // ============================================
    // ❌ ERROR HANDLING
    // ============================================
    console.log("\n" + "❌".repeat(50));
    console.log("❌ ERROR IN GET PUBLIC GRADUATE PROFILE:");
    console.log("❌".repeat(50));
    console.log(`❌ Time: ${new Date().toISOString()}`);
    console.log(`❌ Graduate ID: ${req.params.id}`);
    console.log(`❌ Error name: ${err.name}`);
    console.log(`❌ Error message: ${err.message}`);
    console.log(`❌ Error stack: ${err.stack}`);
    console.log("❌".repeat(50) + "\n");

    logger.error("Error getting public graduate profile", {
      userId: req.user?.id,
      graduateId: req.params.id,
      error: err.message,
      stack: err.stack,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    
    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: err.message,
      data: null,
    });
  }
};

/**
 * Get graduate profile for another user (with friendship status)
 * @route GET /api/graduates/profile/user/:identifier
 * @access Private
 */
const getGraduateProfileForUser = async (req, res) => {
  try {
    const { identifier } = req.params;
    const currentUserId = req.user.id;

    // ============================================
    // 🚀 START - GET GRADUATE PROFILE FOR USER
    // ============================================
    console.log("\n" + "🔥".repeat(50));
    console.log("🔥 GET GRADUATE PROFILE FOR USER at:", new Date().toISOString());
    console.log("🔥".repeat(50));
    
    // 📍 LOG 1: كل حاجة عن الطلب
    console.log("\n📍 [1] RAW REQUEST DATA:");
    console.log(`   - identifier: "${identifier}" (type: ${typeof identifier})`);
    console.log(`   - currentUserId: ${currentUserId} (type: ${typeof currentUserId})`);
    console.log(`   - req.params:`, JSON.stringify(req.params, null, 2));
    console.log(`   - req.query:`, JSON.stringify(req.query, null, 2));
    console.log(`   - req.headers.accept: "${req.headers.accept}"`);
    console.log(`   - req.headers.content-type: "${req.headers['content-type']}"`);
    console.log(`   - req.url: ${req.url}`);
    console.log(`   - req.originalUrl: ${req.originalUrl}`);
    console.log(`   - req.baseUrl: ${req.baseUrl}`);
    console.log(`   - req.path: ${req.path}`);

    // 📍 LOG 2: التأكد إن الـ response هيبقا JSON
    console.log("\n📍 [2] SETTING RESPONSE HEADERS:");
    console.log(`   - Before setting: res.get('Content-Type'): ${res.get('Content-Type')}`);
    res.setHeader('Content-Type', 'application/json');
    console.log(`   - After setting: res.get('Content-Type'): ${res.get('Content-Type')}`);

    // Log request initiation
    logger.info("Get graduate profile for user request initiated", {
      currentUserId,
      identifier,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // 📍 LOG 3: البحث عن الخريج
    console.log("\n📍 [3] SEARCHING FOR GRADUATE:");
    console.log(`   - Is identifier numeric? ${!isNaN(identifier) ? 'YES' : 'NO'}`);
    console.log(`   - identifier as number: ${parseInt(identifier)}`);
    
    let graduate;
    let searchMethod = '';

    // Search by ID
    if (!isNaN(identifier)) {
      searchMethod = 'by ID';
      console.log(`   🔍 Executing: Graduate.findByPk(${identifier}) with include User`);
      
      const startTime = Date.now();
      graduate = await Graduate.findByPk(identifier, {
        include: [{ model: User }],
        attributes: { exclude: ["faculty"] },
      });
      const duration = Date.now() - startTime;
      
      console.log(`   - Query took: ${duration}ms`);
      console.log(`   - Result: ${graduate ? '✅ FOUND' : '❌ NOT FOUND'}`);
      
      if (graduate) {
        console.log(`      - graduate_id: ${graduate.graduate_id}`);
        console.log(`      - has User: ${!!graduate.User}`);
        if (graduate.User) {
          console.log(`      - User ID: ${graduate.User.id}`);
          console.log(`      - User name: ${graduate.User["first-name"]} ${graduate.User["last-name"]}`);
        }
      }
    } else {
      // Search by email
      searchMethod = 'by email';
      console.log(`   🔍 Searching by email: ${identifier}`);
      
      const userByEmail = await User.findOne({
        where: { email: identifier },
        include: [{ model: Graduate }],
      });

      if (userByEmail) {
        graduate = userByEmail.Graduate;
        console.log(`   - Found by email: ${graduate ? '✅ YES' : '❌ NO'}`);
        if (graduate) {
          console.log(`      - Graduate ID: ${graduate.graduate_id}`);
        }
      } else {
        // Search by name
        searchMethod = 'by name';
        console.log(`   🔍 Searching by name: ${identifier}`);
        
        const usersByName = await User.findAll({
          where: {
            [Op.or]: [
              { "first-name": { [Op.like]: `%${identifier}%` } },
              { "last-name": { [Op.like]: `%${identifier}%` } },
            ],
          },
          include: [{ model: Graduate }],
        });

        console.log(`   - Found ${usersByName.length} users matching name`);
        
        for (let [index, user] of usersByName.entries()) {
          console.log(`      - User ${index + 1}: ${user["first-name"]} ${user["last-name"]} (ID: ${user.id}) - Has Graduate: ${!!user.Graduate}`);
          if (user.Graduate && !graduate) {
            graduate = user.Graduate;
            console.log(`      ✅ Selected Graduate ID: ${graduate.graduate_id}`);
          }
        }
      }
    }

    // 📍 LOG 4: التحقق من وجود الخريج
    console.log("\n📍 [4] VALIDATION RESULTS:");
    
    if (!graduate) {
      console.log(`   ❌ NO GRADUATE FOUND with ${searchMethod}: ${identifier}`);
      
      console.log(`   - Will return 404 with JSON`);
      console.log(`   - Response headers before send:`, res.getHeaders());
      
      logger.warn("Graduate not found for user profile", {
        currentUserId,
        identifier,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      
      const errorResponse = {
        status: HttpStatusHelper.FAIL,
        message: "Graduate not found",
        data: null,
      };
      console.log(`   📦 Error response:`, JSON.stringify(errorResponse, null, 2));
      
      return res.status(404).json(errorResponse);
    }

    console.log(`   ✅ Graduate found, continuing...`);

    const userData = graduate.User;
    if (!userData) {
      console.log(`   ❌ USER DATA MISSING for graduate ${graduate.graduate_id}`);
      
      const errorResponse = {
        status: HttpStatusHelper.FAIL,
        message: "User data not found for this graduate",
        data: null,
      };
      console.log(`   📦 Error response:`, JSON.stringify(errorResponse, null, 2));
      
      return res.status(404).json(errorResponse);
    }

    console.log(`   ✅ User data present`);

    // ========== الجزء الناقص هنا ==========
    console.log("\n📍 [5] PROCESSING FRIENDSHIP AND POSTS:");

    // Determine friendship status
    let friendshipStatus = "no_relation";
    const isOwner = +currentUserId === +graduate.graduate_id;
    console.log(`   - Is owner? ${isOwner ? '✅ YES' : '❌ NO'}`);

    if (!isOwner) {
      console.log(`   🔍 Checking for pending friendship requests...`);
      
      const existingFriendshipRequest = await Friendship.findOne({
        where: {
          [Op.or]: [
            { sender_id: currentUserId, receiver_id: graduate.graduate_id },
            { sender_id: graduate.graduate_id, receiver_id: currentUserId },
          ],
          status: "pending",
        },
      });

      if (existingFriendshipRequest) {
        friendshipStatus =
          existingFriendshipRequest.sender_id === currentUserId
            ? "i_sent_request"
            : "he_sent_request";
        
        console.log(`   ✅ Found pending request - status: ${friendshipStatus}`);
      } else {
        console.log(`   - No pending requests found`);
      }

      console.log(`   🔍 Checking for accepted friendship...`);
      
      const friendship = await Friendship.findOne({
        where: {
          [Op.or]: [
            { sender_id: currentUserId, receiver_id: graduate.graduate_id },
            { sender_id: graduate.graduate_id, receiver_id: currentUserId },
          ],
          status: "accepted",
        },
      });

      if (friendship) {
        friendshipStatus = "friends";
        console.log(`   ✅ Friends found!`);
      } else {
        console.log(`   - No accepted friendship found`);
      }
    }

    console.log(`   📌 Final friendship status: ${friendshipStatus}`);

    // Fetch graduate posts
    console.log(`   📍 Fetching posts for graduate ${graduate.graduate_id}...`);
    
    const posts = await Post.findAll({
      where: {
        "author-id": graduate.graduate_id,
        "is-hidden": false,
        "group-id": null,
      },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "user-type"],
          include: [{ model: Graduate, attributes: ["profile-picture-url"] }],
        },
        { model: PostImage, attributes: ["image-url"] },
        {
          model: Like,
          attributes: ["like_id", "user-id"],
          include: [
            {
              model: User,
              attributes: ["id", "first-name", "last-name", "user-type"],
              include: [
                { model: Graduate, attributes: ["profile-picture-url"] },
              ],
            },
          ],
        },
        {
          model: Comment,
          attributes: ["comment_id", "content", "created-at", "edited"],
          include: [
            {
              model: User,
              attributes: ["id", "first-name", "last-name", "user-type"],
              include: [
                { model: Graduate, attributes: ["profile-picture-url"] },
              ],
            },
          ],
          order: [["created-at", "ASC"]],
        },
      ],
      order: [["created-at", "DESC"]],
    });

    console.log(`   - Found ${posts.length} posts`);

    // Format posts data
    const postsData = posts.map((post) => {
      const authorUser = post.User;

      return {
        post_id: post.post_id,
        category: post.category,
        content: post.content,
        "created-at": post["created-at"],
        author: {
          id: authorUser?.id || "unknown",
          "full-name": `${authorUser?.["first-name"] || ""} ${
            authorUser?.["last-name"] || ""
          }`.trim(),
          "user-type": authorUser?.["user-type"] || "unknown",
          image: authorUser?.Graduate
            ? authorUser.Graduate["profile-picture-url"]
            : null,
        },
        images: post.PostImages
          ? post.PostImages.map((img) => img["image-url"])
          : [],
        likes: post.Likes
          ? post.Likes.map((like) => ({
              like_id: like.like_id,
              user: like.User
                ? {
                    id: like.User.id,
                    "full-name": `${like.User["first-name"] || ""} ${
                      like.User["last-name"] || ""
                    }`.trim(),
                    "user-type": like.User["user-type"] || "unknown",
                    image: like.User.Graduate
                      ? like.User.Graduate["profile-picture-url"]
                      : null,
                  }
                : null,
            }))
          : [],
        likes_count: post.Likes ? post.Likes.length : 0,
        comments: post.Comments
          ? post.Comments.map((comment) => ({
              comment_id: comment.comment_id,
              content: comment.content,
              "created-at": comment["created-at"],
              edited: comment.edited,
              author: {
                id: comment.User?.id || "unknown",
                "full-name":
                  `${comment.User?.["first-name"] || ""} ${
                    comment.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
                "user-type": comment.User?.["user-type"] || "unknown",
                image: comment.User?.Graduate
                  ? comment.User.Graduate["profile-picture-url"]
                  : null,
              },
            }))
          : [],
        comments_count: post.Comments ? post.Comments.length : 0,
      };
    });

    console.log(`   ✅ Formatted ${postsData.length} posts`);

    // 📍 [5.5] BUILDING PROFILE OBJECT
    console.log("\n📍 [5.5] BUILDING PROFILE OBJECT:");

    const lang = req.headers["accept-language"] || req.user.language || "ar";
    const facultyName = getCollegeNameByCode(graduate.faculty_code, lang);
    console.log(`   - Language: ${lang}`);
    console.log(`   - Faculty code: ${graduate.faculty_code}`);
    console.log(`   - Converted to: "${facultyName}"`);

    const profile = {
      profilePicture: graduate["profile-picture-url"],
      fullName: `${userData["first-name"]} ${userData["last-name"]}`,
      faculty: facultyName,
      graduationYear: graduate["graduation-year"],
      bio: graduate.bio,
      skills: graduate.skills,
      currentJob: graduate["current-job"],
      showCV: graduate.show_cv,
      showLinkedIn: graduate.show_linkedin,
      showPhone: userData.show_phone,
      friendshipStatus: isOwner ? "owner" : friendshipStatus,
      posts: postsData,
    };

    console.log(`   ✅ Profile built successfully:`);
    console.log(`      - fullName: "${profile.fullName}"`);
    console.log(`      - faculty: "${profile.faculty}"`);
    console.log(`      - graduationYear: ${profile.graduationYear || 'null'}`);
    console.log(`      - posts count: ${profile.posts.length}`);

    // إضافة الحقول الاختيارية
    if (graduate.show_cv && graduate["cv-url"]) {
      profile.CV = graduate["cv-url"];
      console.log(`      - CV: ✅`);
    }
    
    if (graduate.show_linkedin && graduate["linkedln-link"]) {
      profile.linkedlnLink = graduate["linkedln-link"];
      console.log(`      - LinkedIn: ✅`);
    }
    
    if (userData.show_phone && userData.phoneNumber) {
      profile.phoneNumber = userData.phoneNumber;
      console.log(`      - Phone: ✅`);
    }
    
    // ========== نهاية الجزء الناقص ==========

    // 📍 LOG 6: قبل إرجاع النتيجة
    console.log("\n📍 [6] FINAL RESPONSE:");
    console.log(`   - Response headers before send:`, res.getHeaders());
    console.log(`   - Content-Type should be: application/json`);
    
    const successResponse = {
      status: HttpStatusHelper.SUCCESS,
      message: "Graduate Profile fetched successfully",
      data: profile,
    };
    
    console.log(`   📦 Success response preview (first 500 chars):`);
    console.log(JSON.stringify(successResponse, null, 2).substring(0, 500) + '...');
    
    console.log("\n🔥 END - GET GRADUATE PROFILE FOR USER");
    console.log("🔥".repeat(50) + "\n");

    return res.json(successResponse);

  } catch (err) {
    // ============================================
    // ❌ ERROR HANDLING
    // ============================================
    console.log("\n" + "💥".repeat(50));
    console.log("💥 ERROR CAUGHT IN CATCH BLOCK:");
    console.log("💥".repeat(50));
    console.log(`💥 Time: ${new Date().toISOString()}`);
    console.log(`💥 Error name: ${err.name}`);
    console.log(`💥 Error message: ${err.message}`);
    console.log(`💥 Error stack: ${err.stack}`);
    console.log(`💥 Error cause: ${err.cause || 'N/A'}`);
    console.log(`💥 Error code: ${err.code || 'N/A'}`);
    console.log("💥".repeat(50) + "\n");

    logger.error("Error getting graduate profile for user", {
      userId: req.user?.id,
      identifier: req.params.identifier,
      error: err.message,
      stack: err.stack,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    
    const errorResponse = {
      status: HttpStatusHelper.ERROR,
      message: err.message,
      data: null,
    };
    
    console.log(`   📦 Error response:`, JSON.stringify(errorResponse, null, 2));
    
    return res.status(500).json(errorResponse);
  }
};

module.exports = {
  getAllGraduates,
  getGraduatesInPortal,
  getRequestedGraduates,
  getDigitalID,
  generateDigitalIDQR,
  verifyDigitalIDQR,
  getGraduateProfile,
  getPublicGraduateProfile,
  updateProfile,
  updateGraduateStatus,
  searchGraduates,
  approveGraduate,
  rejectGraduate,
  getGraduateProfileForUser,
  downloadCv,
};

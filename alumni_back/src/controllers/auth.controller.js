const asyncHandler = require("express-async-handler");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const validator = require("validator");
const User = require("../models/User");
const Graduate = require("../models/Graduate");
const Staff = require("../models/Staff");
const generateToken = require("../utils/generateToken");
const aes = require("../utils/aes");
const {
  normalizeCollegeName,
  getCollegeNameByCode,
} = require("../services/facultiesService");
const { securityLogger } = require("../utils/logger");
// أضف هذا السطر 👇
const logger = require("../utils/logger");  // هذا هو السطر المهم!
const {
  validateEmail,
  validatePassword,
  validateNationalId,
  validatePhoneNumber,
  sanitizeInput,
} = require("../middleware/security");

// Import invitation controller
const {
  sendAutoGroupInvitation,
} = require("../controllers/invitation.controller");

// ======== Helper Functions ========

/**
 * Extract date of birth from Egyptian National ID (NID)
 * @param {string} nid - Egyptian National ID (14 digits)
 * @returns {string} Formatted date string (YYYY-MM-DD)
 * @throws {Error} If NID format is invalid
 */
function extractDOBFromEgyptianNID(nid) {
  const id = nid.trim();
  if (!validateNationalId(id)) throw new Error("Invalid NID format");

  const centuryDigit = id[0];
  let century;
  if (centuryDigit === "2") century = 1900;
  else if (centuryDigit === "3") century = 2000;
  else throw new Error("Unsupported century in NID");

  const yy = parseInt(id.substr(1, 2), 10);
  const mm = parseInt(id.substr(3, 2), 10);
  const dd = parseInt(id.substr(5, 2), 10);

  const date = new Date(Date.UTC(century + yy, mm - 1, dd));
  if (
    date.getUTCFullYear() !== century + yy ||
    date.getUTCMonth() !== mm - 1 ||
    date.getUTCDate() !== dd
  )
    throw new Error("Invalid birth date in NID");

  return `${century + yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(
    2,
    "0"
  )}`;
}

function extractGraduateApiData(payload) {
  if (!payload || typeof payload !== "object") return null;

  const candidates = [
    payload,
    payload.data,
    payload.result,
    payload.student,
    payload.graduate,
    payload.payload,
  ].filter(Boolean);

  for (const item of candidates) {
    if (
      item?.faculty ||
      item?.Faculty ||
      item?.FACULTY ||
      item?.facultyName ||
      item?.graduationYear ||
      item?.["graduation-year"]
    ) {
      return item;
    }
  }

  return null;
}

function hasGraduatePresence(payload) {
  if (!payload || typeof payload !== "object") return false;

  const candidates = [
    payload,
    payload.data,
    payload.result,
    payload.student,
    payload.graduate,
    payload.payload,
  ].filter(Boolean);

  return candidates.some(
    (item) =>
      item?.exists === true ||
      item?.found === true ||
      item?.isFound === true ||
      item?.isExists === true ||
      item?.matched === true
  );
}

function buildGraduateApiUrls(nationalId) {
  const encodedNationalId = encodeURIComponent(nationalId);
  const baseUrl = (process.env.GRADUATE_API_URL || "").replace(/\/+$/, "");
  const urls = [];

  if (baseUrl) {
    urls.push(`${baseUrl}?nationalId=${encodedNationalId}`);

    if (/\/check$/i.test(baseUrl)) {
      urls.push(
        `${baseUrl.replace(/\/check$/i, `/details/${encodedNationalId}`)}`
      );
    }

    if (/\/graduates\/check$/i.test(baseUrl)) {
      urls.push(
        `${baseUrl.replace(
          /\/graduates\/check$/i,
          `/details/${encodedNationalId}`
        )}`
      );
      urls.push(
        `${baseUrl.replace(
          /\/graduates\/check$/i,
          `/graduates/details/${encodedNationalId}`
        )}`
      );
    }
  }

 urls.push(`http://localhost:5155/grad-portal/api/details/${encodedNationalId}`);
urls.push(`http://localhost:5155/grad-portal/api/graduates/details/${encodedNationalId}`);

  return [...new Set(urls)];
}

async function resolveGraduateFromExternalApi(nationalId) {
  for (const url of buildGraduateApiUrls(nationalId)) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: { Accept: "application/json" },
      });

      const data = extractGraduateApiData(response.data);
      if (data) {
        return { found: true, data };
      }

      if (hasGraduatePresence(response.data)) {
        return { found: true, data: response.data || {} };
      }
    } catch (error) {
      // Try the next candidate URL.
    }
  }

  return { found: false, data: null };
}

/**
 * Check if National ID is already registered
 * @param {string} nid - Egyptian National ID
 * @returns {Promise<boolean>} True if NID exists in database
 */
async function isNIDRegistered(nid) {
  const encryptedNid = aes.encryptNationalId(nid);
  const user = await User.findOne({ where: { "national-id": encryptedNid } });
  return !!user;
}

/**
 * Send password reset verification email via Gmail SMTP
 * @param {string} email - Recipient email address
 * @param {string} code - 6-digit verification code
 * @returns {Promise<Object>} Nodemailer send info
 * @throws {Error} If email sending fails
 */
async function sendVerificationEmail(email, code) {
  // Enhanced Gmail configuration
  const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Should be Gmail App Password
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates if needed
    },
  });

  const mailOptions = {
    from: `"Alumni Portal" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Reset Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Your verification code is:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
        </div>
        <p><strong>This code will expire in 15 minutes.</strong></p>
        <p>If you didn't request this, ignore this email.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 14px;">Helwan University Alumni Portal</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Verification code sent successfully to ${email}`);
    console.log(`📧 Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("❌ Error sending verification email:", error);
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}

// ======== Controller Functions ========

/**
 * Register a new user (graduate or staff)
 * @route POST /api/users/register
 * @access Public
 */
const registerUser = asyncHandler(async (req, res) => {
  sanitizeInput(req, res, () => {});
  const { firstName, lastName, email, password, nationalId, phoneNumber } =
    req.body;

  // --- Validation ---
  if (!firstName || !lastName || !email || !password || !nationalId) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({
      error:
        "Password is too weak. Minimum 8 characters, must include a number and a symbol",
    });
  }
  if (!validateNationalId(nationalId)) {
    return res.status(400).json({ error: "Invalid National ID" });
  }
  if (phoneNumber && !validatePhoneNumber(phoneNumber)) {
    return res.status(400).json({ error: "Invalid phone number" });
  }

  // --- Check duplicates ---
  if (await User.findOne({ where: { email } })) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const existingUsers = await User.findAll();
  for (const u of existingUsers) {
    const decryptedNID = aes.decryptNationalId(u["national-id"]);
    if (decryptedNID === nationalId) {
      return res.status(409).json({ error: "National ID already registered" });
    }
  }

  // --- Prepare ---
  const birthDate = extractDOBFromEgyptianNID(nationalId);
  const hashedPassword = await bcrypt.hash(password, 10);
  const encryptedNID = aes.encryptNationalId(nationalId);

  let userType = "graduate";
  let statusToLogin = "pending"; // default
  let externalData = null;

  // --- Staff check ---
  try {
    const staffResp = await axios.get(
      `${process.env.STAFF_API_URL}?nationalId=${encodeURIComponent(nationalId)}`,
      { timeout: 8000 }
    );

    if (staffResp.data?.department) {
      userType = "staff";
      statusToLogin = "inactive"; // staff محتاج تفعيل الأدمن
      externalData = staffResp.data;
    }
  } catch (e) {
    console.log("Staff API check failed:", e.message);
  }

  // --- Graduate check (✅ FIXED) ---
  if (userType === "graduate") {
    try {
      const externalGraduate = await resolveGraduateFromExternalApi(nationalId);

      if (externalGraduate.found) {
        // موجود في system2 → accepted
        statusToLogin = "accepted";
        externalData = externalGraduate.data || {};
      } else {
        // ❗ مش موجود → pending (بدل accepted)
        statusToLogin = "pending";
      }
    } catch (e) {
      console.log("Graduate API check failed:", e.message);
      // ❗ لو API وقع → pending (بدل accepted)
      statusToLogin = "pending";
    }
  }

  // --- Create user ---
  const user = await User.create({
    "first-name": validator.escape(firstName),
    "last-name": validator.escape(lastName),
    email: validator.normalizeEmail(email),
    "phone-number": phoneNumber ? validator.escape(phoneNumber) : null,
    "hashed-password": hashedPassword,
    "birth-date": birthDate,
    "user-type": userType,
    "national-id": encryptedNID,
  });

  // --- Create role record ---
  if (userType === "graduate") {
    const facultyName = externalData?.faculty || null;
    const facultyCode = facultyName ? normalizeCollegeName(facultyName) : null;

    await Graduate.create({
      graduate_id: user.id,
      faculty_code: facultyCode,
      "graduation-year": externalData?.["graduation-year"] || null,
      "status-to-login": statusToLogin,
    });

    // Auto invite only if accepted
    if (statusToLogin === "accepted") {
      setTimeout(async () => {
        try {
          await sendAutoGroupInvitation(user.id);
        } catch (e) {
          console.log("Auto invite error:", e.message);
        }
      }, 500);
    }
  }

  if (userType === "staff") {
    await Staff.create({
      staff_id: user.id,
      "status-to-login": statusToLogin,
    });
  }

  securityLogger.registration(req.ip, email, userType, statusToLogin);

  // --- Response consistent with login ---
  res.status(201).json({
    id: user.id,
    email: user.email,
    userType,
    status: statusToLogin,
    message:
      statusToLogin === "accepted"
        ? "Registration successful! You can login now."
        : userType === "graduate"
        ? "Registration successful! Please wait for admin approval."
        : "Staff registration submitted. Contact admin for activation.",
  });
});


/**
 * Authenticate user and generate JWT token
 * @route POST /api/users/login
 * @access Public
 */
/**
 * Authenticate user and generate JWT token
 * @route POST /api/users/login
 * @access Public
 */
const loginUser = asyncHandler(async (req, res) => {
  sanitizeInput(req, res, () => {});
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email & password required" });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const user = await User.findOne({ where: { email } });

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // OAuth-only check
  if (!user["hashed-password"]) {
    const authProvider = user["auth_provider"] || "OAuth";
    return res.status(401).json({
      error: `This account uses ${authProvider} login`,
      requiresOAuth: true,
      authProvider,
    });
  }

  // Password check
  const validPass = await bcrypt.compare(password, user["hashed-password"]);
  if (!validPass) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // ============================================
  // 🔄 SYNC GRADUATE DATA FROM EXTERNAL SYSTEM ON LOGIN
  // ============================================
  console.log("\n🔄 CHECKING GRADUATE DATA ON LOGIN:");
  console.log(`   - User ID: ${user.id}`);
  console.log(`   - User Type: ${user["user-type"]}`);
  console.log(`   - Email: ${user.email}`);

  let dataUpdated = false; // متغير لنتتبع إذا حصل تحديث للبيانات
  let graduate = null;

  if (user["user-type"] === "graduate") {
    // جلب الـ graduate record
    graduate = await Graduate.findOne({
      where: { graduate_id: user.id },
    });

    if (graduate) {
      console.log("   - ✅ Graduate record found");
      console.log(
        `      - Current faculty_code: ${graduate.faculty_code || "missing"}`
      );
      console.log(
        `      - Current graduation-year: ${
          graduate["graduation-year"] || "missing"
        }`
      );
      console.log(`      - Current skills: ${graduate.skills || "missing"}`);

      // لو الفاكولتي أو سنة التخرج ناقصة
      if (
        !graduate.faculty_code ||
        !graduate["graduation-year"] ||
        graduate["status-to-login"] !== "accepted"
      ) {
        console.log(
          "   - ⚠️ Missing faculty or graduation year, fetching from external system..."
        );

        // فك تشفير الرقم القومي
        let nationalId = null;
        if (user["national-id"]) {
          // محاولة فك التشفير
          const decrypted = aes.decryptNationalId(user["national-id"]);
          if (decrypted) {
            nationalId = decrypted;
            console.log(
              "   - ✅ Decrypted national ID:",
              nationalId.substring(0, 6) + "****"
            );
          } else {
            // لو فك التشفير فشل، جرب استخدام القيمة كـ plain text لو كانت 14 رقم
            const rawNid = String(user["national-id"]).trim();
            if (/^\d{14}$/.test(rawNid)) {
              nationalId = rawNid;
              console.log(
                "   - Using raw national ID (unencrypted):",
                nationalId.substring(0, 6) + "****"
              );
            } else {
              console.log(
                "   - ❌ Could not decrypt national ID and raw value is not valid"
              );
            }
          }
        } else {
          console.log("   - ❌ No national ID found for user");
        }

        if (nationalId) {
          try {
            // ✅ التعديل هنا: غيرنا الرابط
            const externalGraduate = await resolveGraduateFromExternalApi(
              nationalId
            );

            if (externalGraduate.found && externalGraduate.data) {
              const externalData = externalGraduate.data;
              console.log("   - ✅ External data received:");
              console.log(`      - Full Name: ${externalData.fullName}`);
              console.log(`      - Faculty: ${externalData.faculty}`);
              console.log(`      - Department: ${externalData.department}`);
              console.log(
                `      - Graduation Year: ${externalData.graduationYear}`
              );

              let updated = false;

              // تحديث faculty_code
              if (externalData.faculty && !graduate.faculty_code) {
                const facultyCode = normalizeCollegeName(externalData.faculty);
                if (facultyCode) {
                  graduate.faculty_code = facultyCode;
                  console.log(
                    `      - ✅ Updated faculty_code to: ${facultyCode}`
                  );
                  updated = true;
                } else {
                  console.log(
                    `      - ⚠️ Could not normalize faculty: ${externalData.faculty}`
                  );
                  // If normalization fails, store the original
                  graduate.faculty_code = externalData.faculty;
                  updated = true;
                }
              }

              // تحديث سنة التخرج
              if (externalData.graduationYear && !graduate["graduation-year"]) {
                const year = parseInt(externalData.graduationYear);
                if (!isNaN(year) && year > 1900 && year < 2100) {
                  graduate["graduation-year"] = year;
                  console.log(`      - ✅ Updated graduation year to: ${year}`);
                  updated = true;
                } else {
                  console.log(
                    `      - ⚠️ Invalid graduation year: ${externalData.graduationYear}`
                  );
                }
              }

              // تحديث skills من department لو skills فاضية
              if (externalData.department && !graduate.skills) {
                graduate.skills = externalData.department;
                console.log(
                  `      - ✅ Updated skills/department to: ${externalData.department}`
                );
                updated = true;
              }

              if (graduate["status-to-login"] !== "accepted") {
                graduate["status-to-login"] = "accepted";
                console.log("      - âœ… Updated status-to-login to accepted");
                updated = true;
              }

              if (updated) {
                await graduate.save();
                console.log(
                  "   - ✅ Graduate data synced and saved successfully"
                );
                dataUpdated = true; // ✅ تم تحديث البيانات
              } else {
                console.log("   - No updates needed");
              }
            }
          } catch (error) {
            console.log("   - ❌ Failed to fetch external data:");
            console.log(`      - Error message: ${error.message}`);
            console.log(`      - Error code: ${error.code || "N/A"}`);

            if (error.response) {
              console.log(`      - Response status: ${error.response.status}`);
              console.log(`      - Response data:`, error.response.data);
            } else if (error.code === "ECONNREFUSED") {
              console.log(
                "      - ⚠️ External system (port 5155) is not running or refused connection"
              );
            } else if (error.code === "ETIMEDOUT") {
              console.log("      - ⚠️ External system request timed out");
            }

            console.log("⚠️ Failed to sync graduate data on login:", {
              userId: user.id,
              email: user.email,
              error: error.message,
              code: error.code,
              ip: req.ip,
            });
          }
        } else {
          console.log(
            "   - ⚠️ No valid national ID available for external sync"
          );
        }
      } else {
        console.log("   - ✅ Graduate data already complete");
      }
    } else {
      console.log("   - ❌ Graduate record not found for user ID:", user.id);
    }
  } else {
    console.log(
      `   - User is not a graduate (type: ${user["user-type"]}), skipping sync`
    );
  }

  // ============================================
  // ✅ DETERMINE USER STATUS
  // ============================================
  let status = null;

  if (user["user-type"] === "graduate") {
    const grad = await Graduate.findOne({ where: { graduate_id: user.id } });

    if (!grad) {
      return res.status(403).json({ error: "Graduate record not found" });
    }

    status = grad["status-to-login"];

    if (status !== "accepted") {
      return res.status(403).json({
        error:
          status === "pending"
            ? "Your account is pending admin approval"
            : "Your account is not active",
        status,
      });
    }
  }

  if (user["user-type"] === "staff") {
    const staff = await Staff.findOne({ where: { staff_id: user.id } });

    if (!staff) {
      return res.status(403).json({ error: "Staff record not found" });
    }

    status = staff["status-to-login"];

    if (status !== "active") {
      return res.status(403).json({
        error: "Staff account not active",
        status,
      });
    }
  }

  // ============================================
  // 📨 AUTO INVITATION AFTER LOGIN (إذا تم تحديث البيانات)
  // ============================================
  // نقوم بإرسال الدعوة قبل إرسال الـ response
  if (user["user-type"] === "graduate" && dataUpdated && graduate) {
    console.log("\n📨 Sending auto invitation during login (data was updated)...");
    
    try {
      // استدعاء دالة الإرسال الآلي مباشرة بدون setTimeout
      const { sendAutoGroupInvitation } = require("./invitation.controller");
      const invitationSent = await sendAutoGroupInvitation(user.id);
      
      if (invitationSent) {
        console.log("   - ✅ Auto invitation sent successfully during login");
        
        // نجيب أحدث بيانات للـ graduate بعد الدعوة
        const updatedGrad = await Graduate.findOne({ 
          where: { graduate_id: user.id } 
        });
        
        // لو عايز تتأكد إن النوتيفيكشن اتبعتت
        console.log(`   - 📬 Notification should appear now for user ${user.id}`);
      } else {
        console.log("   - ⚠️ Auto invitation not sent (already exists or no group)");
      }
    } catch (error) {
      console.log("   - ❌ Auto invitation error during login:", error.message);
      // لا نريد إيقاف عملية اللوجين بسبب هذا
    }
  }

  securityLogger.successfulLogin(req.ip, email, user["user-type"]);

  console.log("✅ Login successful for user:", user.email);
  console.log(`   - User Type: ${user["user-type"]}`);
  console.log(`   - Status: ${status}`);
  if (user["user-type"] === "graduate" && dataUpdated) {
    console.log(`   - 📬 Notification sent with login response`);
  }

  // إرسال الـ response بعد انتهاء كل العمليات
  res.json({
    id: user.id,
    email: user.email,
    userType: user["user-type"],
    status,
    token: generateToken(user.id),
  });
});

/**
 * Send password reset verification code to email
 * @route POST /api/users/forgot-password
 * @access Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  sanitizeInput(req, res, () => {});
  const { email } = req.body;
  if (!email || !validateEmail(email)) throw new Error("Valid email required");

  const user = await User.findOne({ where: { email } });
  if (!user)
    return res.json({ message: "If the email exists, verification code sent" });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + 15);
  user["verification-code"] = code;
  user["verification-code-expires"] = expiration;
  await user.save();
  await sendVerificationEmail(email, code);

  securityLogger.passwordResetRequest(req.ip, email);
  res.json({ message: "If the email exists, verification code sent" });
});

/**
 * Verify password reset code
 * @route POST /api/users/verify-code
 * @access Public
 */
const verifyCode = asyncHandler(async (req, res) => {
  sanitizeInput(req, res, () => {});
  const { email, code } = req.body;
  if (!email || !code) throw new Error("Email & code required");
  if (!validateEmail(email)) throw new Error("Invalid email");

  const user = await User.findOne({ where: { email } });
  if (!user || !user["verification-code"] || !user["verification-code-expires"])
    throw new Error("Invalid or expired code");
  if (new Date() > user["verification-code-expires"])
    throw new Error("Code expired");
  if (user["verification-code"] !== code) throw new Error("Invalid code");

  res.json({ message: "Code is valid" });
});

/**
 * Reset user password with verification code
 * @route POST /api/users/reset-password
 * @access Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  sanitizeInput(req, res, () => {});
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword)
    throw new Error("Email, code & new password required");
  if (!validateEmail(email)) throw new Error("Invalid email");
  if (!validatePassword(newPassword)) throw new Error("Weak password");

  const user = await User.findOne({ where: { email } });
  if (!user || !user["verification-code"] || !user["verification-code-expires"])
    throw new Error("Invalid or expired code");
  if (new Date() > user["verification-code-expires"])
    throw new Error("Code expired");
  if (user["verification-code"] !== code) throw new Error("Invalid code");

  user["hashed-password"] = await bcrypt.hash(newPassword, 10);
  user["verification-code"] = null;
  user["verification-code-expires"] = null;
  await user.save();

  securityLogger.passwordResetSuccess(req.ip, email);
  res.json({ message: "Password reset successfully" });
});

/**
 * Get authenticated user profile with related data
 * @route GET /api/users/profile
 * @access Private
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ["hashed-password"] },
  });
  if (!user) throw new Error("User not found");

  let profile = {
    id: user.id,
    "first-name": user["first-name"],
    "last-name": user["last-name"],
    email: user.email,
    "phone-number": user["phone-number"],
    "birth-date": user["birth-date"],
    "user-type": user["user-type"],
    "national-id": user["national-id"],
  };

  if (user["user-type"] === "graduate") {
    const grad = await Graduate.findOne({ where: { graduate_id: user.id } });
    if (grad) {
      const lang = req.headers["accept-language"] || "ar";
      profile.graduate = {
        faculty: getCollegeNameByCode(grad.faculty_code, lang),
        "graduation-year": grad["graduation-year"],
        bio: grad.bio,
        skills: grad.skills,
        "current-job": grad["current-job"],
        "status-to-login": grad["status-to-login"],
        "cv-url": grad["cv-url"],
        "linkedln-link": grad["linkedln-link"],
        "profile-picture-url": grad["profile-picture-url"],
      };
    }
  }
  if (user["user-type"] === "staff") {
    const staff = await Staff.findOne({ where: { staff_id: user.id } });
    if (staff) profile.staff = { "status-to-login": staff["status-to-login"] };
  }

  res.json(profile);
});

/**
 * Update authenticated user profile
 * @route PUT /api/users/profile
 * @access Private
 */
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new Error("User not found");

  sanitizeInput(req, res, () => {});
  const fields = ["first-name", "last-name", "email", "phone-number"];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) user[f] = validator.escape(req.body[f]);
  });

  if (user["user-type"] === "graduate") {
    const grad = await Graduate.findOne({ where: { graduate_id: user.id } });
    if (grad) {
      if (req.body.faculty)
        grad.faculty_code = normalizeCollegeName(req.body.faculty);
      [
        "graduation-year",
        "bio",
        "skills",
        "current-job",
        "linkedln-link",
      ].forEach((f) => {
        if (req.body[f] !== undefined) grad[f] = req.body[f];
      });
      await grad.save();
    }
  }

  await user.save();
  res.json({ message: "Profile updated successfully" });
});

/**
 * Logout user by clearing JWT cookie
 * @route POST /api/users/logout
 * @access Private
 */
const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("jwt", "", { httpOnly: true, expires: new Date(0) });
  res.json({ message: "Logged out successfully" });
});

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  verifyCode,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  logoutUser,
};

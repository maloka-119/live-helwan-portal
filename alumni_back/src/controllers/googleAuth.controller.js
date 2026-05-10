const User = require("../models/User");
const Graduate = require("../models/Graduate");
const Staff = require("../models/Staff");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const generateToken = require("../utils/generateToken");
const aes = require("../utils/aes");
const axios = require("axios");
const validator = require("validator");
const { Op } = require("sequelize");
const { logger, securityLogger } = require("../utils/logger");
const { normalizeCollegeName } = require("../services/facultiesService");
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
const frontendUrl = (path = "/") =>
  `${FRONTEND_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

// ===================== Helper functions =====================

/**
 * Validate Egyptian National ID format
 * @param {string} nationalId - 14-digit Egyptian National ID
 * @returns {boolean} True if valid
 */
function validateNationalId(nationalId) {
  return /^\d{14}$/.test(nationalId);
}

/**
 * Extract date of birth from Egyptian National ID
 * @param {string} nationalId - 14-digit Egyptian National ID
 * @returns {string} Formatted date string (YYYY-MM-DD)
 * @throws {Error} If NID format or birth date is invalid
 */
function extractDOBFromEgyptianNID(nationalId) {
  const id = String(nationalId).trim();
  if (!validateNationalId(nationalId)) {
    throw new Error("Invalid national ID format (must be 14 digits).");
  }

  const centuryDigit = id[0];
  let century;
  if (centuryDigit === "2") century = 1900;
  else if (centuryDigit === "3") century = 2000;
  else if (centuryDigit === "4") century = 2100;
  else throw new Error("Unsupported century digit in national ID.");

  const yy = parseInt(id.substr(1, 2), 10);
  const mm = parseInt(id.substr(3, 2), 10);
  const dd = parseInt(id.substr(5, 2), 10);

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    throw new Error("Invalid birth date in national ID.");
  }

  const year = century + yy;
  return `${year.toString().padStart(4, "0")}-${String(mm).padStart(
    2,
    "0"
  )}-${String(dd).padStart(2, "0")}`;
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
      item?.["graduation-year"] ||
      item?.fullName ||
      item?.["full-name"] ||
      item?.department ||
      item?.Department
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

  urls.push(`http://localhost:5155/api/details/${encodedNationalId}`);
  urls.push(`http://localhost:5155/api/graduates/details/${encodedNationalId}`);

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

// ===================== Passport Google Strategy =====================

/**
 * Configure Passport Google OAuth strategy
 * Handles user authentication and creation/update flows
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ where: { google_id: profile.id } });

        if (!user) {
          const existingUser = await User.findOne({
            where: { email: profile.emails[0].value },
          });
          if (existingUser) {
            existingUser.google_id = profile.id;
            existingUser.auth_provider = "google";
            await existingUser.save();
            return done(null, existingUser);
          }

          // Temporary user object (not saved to database yet)
          user = {
            google_id: profile.id,
            email: profile.emails[0].value,
            "first-name": profile.name.givenName || "",
            "last-name": profile.name.familyName || "",
            profile_picture_url: profile.photos?.[0]?.value || null,
            isTemp: true,
          };
        } else {
          if (profile.photos?.[0]?.value && !user.profile_picture_url) {
            user.profile_picture_url = profile.photos[0].value;
            await user.save();
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

/**
 * Serialize user ID to session
 */
passport.serializeUser((user, done) => done(null, user.id));

/**
 * Deserialize user from session by ID
 */
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ===================== Controller Functions =====================

/**
 * Initiate Google OAuth login flow
 * @route GET /auth/google
 * @access Public
 */
exports.loginWithGoogle = (req, res, next) => {
  const { nationalId } = req.query;

  // Validate National ID if provided
  if (nationalId && !validateNationalId(nationalId)) {
    return res.redirect(
      `${frontendUrl("/login")}?error=${encodeURIComponent(
        "Invalid National ID"
      )}`
    );
  }

  // Store National ID in session for later use
  req.session.nationalId = nationalId || null;
  req.session.save(() => {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", process.env.GOOGLE_CALLBACK_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "profile email");
    authUrl.searchParams.set("state", nationalId || "");

    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${authUrl.toString()}" />
    <title>Redirecting to Google</title>
  </head>
  <body>
    <script>window.location.replace(${JSON.stringify(authUrl.toString())});</script>
    <p>Redirecting to Google...</p>
  </body>
</html>`);
  });
};

/**
 * Google OAuth callback handler
 * @route GET /auth/google/callback
 * @access Public
 */
exports.googleCallback = (req, res, next) => {
  const nationalIdFromState =
    req.query.state && validateNationalId(req.query.state)
      ? req.query.state
      : null;

  passport.authenticate(
    "google",
    { session: false },
    async (err, googleUser) => {
      const ip = req.ip || req.connection.remoteAddress;

      if (err || !googleUser) {
        return res.redirect(
          `${frontendUrl("/login")}?error=${encodeURIComponent(
            "Google authentication failed"
          )}`
        );
      }

      try {
        // ================== 1. Check for existing user ==================
        let user = await User.findOne({
          where: { google_id: googleUser.google_id },
          include: [
            { model: Graduate, required: false },
            { model: Staff, required: false },
          ],
        });

        if (user) {
          // Update profile picture if missing
          if (googleUser.profile_picture_url && !user.profile_picture_url) {
            user.profile_picture_url = googleUser.profile_picture_url;
            await user.save();
          }

          // === Staff: Check activation status ===
          if (user["user-type"] === "staff") {
            const staffRecord =
              user.Staff ||
              (await Staff.findOne({ where: { staff_id: user.id } }));
            if (staffRecord && staffRecord["status-to-login"] !== "active") {
              return res.redirect(
                `${frontendUrl("/login")}?error=` +
                  encodeURIComponent(
                    "Your account is not activated yet. Please wait for admin approval."
                  )
              );
            }
          }

          // === Graduate: Check if login is allowed (only if accepted) ===
          if (user["user-type"] === "graduate") {
            const graduateRecord =
              user.Graduate ||
              (await Graduate.findOne({ where: { graduate_id: user.id } }));
            if (
              graduateRecord &&
              graduateRecord["status-to-login"] !== "accepted"
            ) {
              let nationalIdToCheck = null;

              try {
                nationalIdToCheck = user["national-id"]
                  ? aes.decryptNationalId(user["national-id"])
                  : null;
              } catch (e) {
                nationalIdToCheck = null;
              }

              if (nationalIdToCheck && validateNationalId(nationalIdToCheck)) {
                const externalGraduate = await resolveGraduateFromExternalApi(
                  nationalIdToCheck
                );

                if (externalGraduate.found) {
                  const externalData = externalGraduate.data || {};
                  const facultyName =
                    externalData?.faculty ||
                    externalData?.Faculty ||
                    externalData?.FACULTY ||
                    externalData?.facultyName ||
                    null;
                  const graduationYear =
                    externalData?.["graduation-year"] ||
                    externalData?.graduationYear ||
                    externalData?.GraduationYear ||
                    graduateRecord["graduation-year"] ||
                    null;

                  graduateRecord["status-to-login"] = "accepted";
                  if (facultyName && !graduateRecord.faculty_code) {
                    graduateRecord.faculty_code =
                      normalizeCollegeName(facultyName) || facultyName;
                  }
                  if (graduationYear && !graduateRecord["graduation-year"]) {
                    graduateRecord["graduation-year"] = graduationYear;
                  }

                  await graduateRecord.save();
                }
              }
            }
            if (
              graduateRecord &&
              graduateRecord["status-to-login"] !== "accepted"
            ) {
              return res.redirect(
                `${frontendUrl("/login")}?error=` +
                  encodeURIComponent(
                    "Your account is under review. Please wait for admin approval to access the dashboard."
                  )
              );
            }
          }

          // User is fully authorized → generate token and redirect
          const token = generateToken(user.id);
          const redirectUrl = new URL(frontendUrl("/login"));
          redirectUrl.searchParams.set("token", token);
          redirectUrl.searchParams.set("id", user.id);
          redirectUrl.searchParams.set("email", user.email);
          redirectUrl.searchParams.set("userType", user["user-type"]);
          return res.redirect(redirectUrl.toString());
        }

        // ================== 2. New user (first time Google login) ==================
        const nationalIdFromSession =
          req.session.nationalId || nationalIdFromState;

        // If no National ID provided, store temp data and ask for it
        if (
          !nationalIdFromSession ||
          !validateNationalId(nationalIdFromSession)
        ) {
          req.session.tempGoogleData = {
            google_id: googleUser.google_id,
            email: googleUser.email,
            firstName: validator.escape(googleUser["first-name"] || ""),
            lastName: validator.escape(googleUser["last-name"] || ""),
            profile_picture_url: googleUser.profile_picture_url,
          };
          req.session.save(() => {
            return res.redirect(`${frontendUrl("/login")}?require_nid=true`);
          });
          return;
        }

        // Process registration with provided National ID
        const birthDate = extractDOBFromEgyptianNID(nationalIdFromSession);
        const encryptedNID = aes.encryptNationalId(nationalIdFromSession);

        let userType = "graduate";
        let statusToLogin = "pending"; // Default: pending (not found in any API)
        let externalData = null;
        let foundInAPI = false;

        // 1. Check Staff API first
        try {
          const staffResp = await axios.get(
            `${process.env.STAFF_API_URL}?nationalId=${encodeURIComponent(
              nationalIdFromSession
            )}`,
            { timeout: 8000 }
          );
          if (staffResp.data?.department || staffResp.data?.Department) {
            userType = "staff";
            statusToLogin = "inactive";
            externalData = staffResp.data;
            foundInAPI = true;
          }
        } catch (e) {
          // Staff API error - ignore, continue to graduate check
        }

        // 2. If not staff → check Graduate API
        if (!foundInAPI) {
          try {
            const externalGraduate = await resolveGraduateFromExternalApi(
              nationalIdFromSession
            );
            const data = externalGraduate.data;
            const facultyField =
              data?.faculty ||
              data?.Faculty ||
              data?.FACULTY ||
              data?.facultyName;

            if (externalGraduate.found || facultyField) {
              statusToLogin = "accepted"; // Found in graduate API → auto-accept
              externalData = data || {};
              foundInAPI = true;
            }
            // else → remains "pending"
          } catch (e) {
            // Graduate API error - keep pending status
          }
        }

        // Create new user record
        const newUser = await User.create({
          google_id: googleUser.google_id,
          email: validator.normalizeEmail(googleUser.email),
          "first-name": validator.escape(googleUser["first-name"] || ""),
          "last-name": validator.escape(googleUser["last-name"] || ""),
          "national-id": encryptedNID,
          "birth-date": birthDate,
          "user-type": userType,
          auth_provider: "google",
          profile_picture_url: googleUser.profile_picture_url || null,
        });

        // Create associated record based on user type
        if (userType === "graduate") {
          const facultyName =
            externalData?.faculty ||
            externalData?.Faculty ||
            externalData?.FACULTY ||
            externalData?.facultyName ||
            null;
          const facultyCode = facultyName
            ? normalizeCollegeName(facultyName)
            : null;
          const graduationYear =
            externalData?.["graduation-year"] ||
            externalData?.graduationYear ||
            externalData?.GraduationYear ||
            null;

          await Graduate.create({
            graduate_id: newUser.id,
            faculty_code: facultyCode,
            "graduation-year": graduationYear || null,
            "status-to-login": statusToLogin, // "accepted" if from API, otherwise "pending"
          });
        }

        if (userType === "staff") {
          await Staff.create({
            staff_id: newUser.id,
            "status-to-login": "inactive",
          });

          securityLogger.registration(
            ip,
            newUser.email,
            userType,
            statusToLogin
          );

          return res.redirect(
            `${frontendUrl("/login")}?success=` +
              encodeURIComponent(
                "Staff account created successfully. Your account is pending admin activation."
              )
          );
        }

        // === Final Login Decision for Graduates ===
        securityLogger.registration(ip, newUser.email, userType, statusToLogin);

        if (statusToLogin === "accepted") {
          // Auto-login graduates confirmed by API
          const token = generateToken(newUser.id);
          const redirectUrl = new URL(frontendUrl("/login"));
          redirectUrl.searchParams.set("token", token);
          redirectUrl.searchParams.set("id", newUser.id);
          redirectUrl.searchParams.set("email", newUser.email);
          redirectUrl.searchParams.set("userType", userType);

          // Clean up session
          delete req.session.nationalId;
          delete req.session.tempGoogleData;
          req.session.save();

          return res.redirect(redirectUrl.toString());
        } else {
          // Pending graduate (not found in API) → show message, no auto-login
          delete req.session.nationalId;
          delete req.session.tempGoogleData;
          req.session.save();

          return res.redirect(
            `${frontendUrl("/login")}?success=` +
              encodeURIComponent(
                "Account created successfully. Your graduation data is under review. You will be able to log in once approved."
              )
          );
        }
      } catch (error) {
        console.error("Google OAuth Error:", error);
        return res.redirect(
          `${frontendUrl("/login")}?error=${encodeURIComponent(
            "Registration failed. Please try again later."
          )}`
        );
      }
    }
  )(req, res, next);
};

/**
 * Logout user and redirect to home
 * @route GET /auth/logout
 * @access Private
 */
exports.logout = (req, res) => {
  req.logout(() => res.redirect(frontendUrl("/")));
};

/**
 * Handle failed login attempts
 * @route GET /auth/login/failed
 * @access Public
 */
exports.loginFailed = (req, res) => res.send("Login failed");

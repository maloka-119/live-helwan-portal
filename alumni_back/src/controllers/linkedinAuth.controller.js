const { User, Staff, Graduate } = require("../models");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const aes = require("../utils/aes");
const validator = require("validator");
const { normalizeCollegeName } = require("../services/facultiesService");

// Import logger utilities
const { logger, securityLogger } = require("../utils/logger");

// ===================== Helper functions (same as Google) =====================

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

// LinkedIn OAuth 2.0 configuration
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_REDIRECT_URI =
  process.env.LINKEDIN_CALLBACK_URL ||
  process.env.LINKEDIN_REDIRECT_URI ||
  "http://localhost:5005/alumni-portal/auth/linkedin/callback";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// In-memory state store for OAuth (fallback if session doesn't work)
const stateStore = new Map();
const STATE_EXPIRY = 10 * 60 * 1000; // 10 minutes

/**
 * Generate JWT token for user
 * @param {number} userId - User ID
 * @returns {string} JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });
};

/**
 * Get LinkedIn authorization URL
 * @route GET /auth/linkedin
 * @access Public
 */
const getLinkedInAuthUrl = asyncHandler(async (req, res) => {
  try {
    const { nationalId } = req.query;

    // Validate National ID if provided
    if (nationalId && !validateNationalId(nationalId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid National ID",
      });
    }

    // Store National ID in session (like Google does)
    if (req.session) {
      req.session.nationalId = nationalId || null;
    }

    // Log request initiation
    logger.info("Get LinkedIn auth URL request initiated", {
      ip: req.ip,
      hasLinkedInClientId: !!LINKEDIN_CLIENT_ID,
      hasLinkedInClientSecret: !!LINKEDIN_CLIENT_SECRET,
      redirectUri: LINKEDIN_REDIRECT_URI,
      hasNationalId: !!nationalId,
      timestamp: new Date().toISOString(),
    });

    const state = Math.random().toString(36).substring(2, 15);

    // Store state in session and in-memory store (fallback)
    if (req.session) {
      req.session.linkedinState = state;
      req.session.nationalId = nationalId || null; // Store National ID in session
      req.session.save(() => {});
    }
    // Also store in memory as fallback (including National ID)
    stateStore.set(state, {
      timestamp: Date.now(),
      ip: req.ip,
      nationalId: nationalId || null, // Store National ID in state store
    });

    // LinkedIn OAuth 2.0 scopes - Using OpenID Connect
    const scope = "openid profile email";
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      LINKEDIN_REDIRECT_URI
    )}&state=${state}&scope=${encodeURIComponent(scope)}`;

    // Log successful generation
    logger.info("LinkedIn auth URL generated successfully", {
      authUrlLength: authUrl.length,
      state,
      scope,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: "success",
      data: {
        authUrl,
        state,
      },
    });
  } catch (error) {
    // Log error
    logger.error("Error generating LinkedIn auth URL", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("LinkedIn auth URL error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to generate LinkedIn auth URL",
    });
  }
});

/**
 * Handle LinkedIn OAuth callback
 * @route GET /auth/linkedin/callback
 * @access Public
 */
const handleLinkedInCallback = asyncHandler(async (req, res) => {
  try {
    const { code, state } = req.query;
    let nationalIdFromState = null; // Declare at function scope

    // Log callback received
    logger.info("LinkedIn callback received", {
      hasCode: !!code,
      hasState: !!state,
      codeLength: code?.length || 0,
      stateLength: state?.length || 0,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Verify state parameter for security
    // Check both session and in-memory store
    const sessionState = req.session?.linkedinState;
    const memoryState = stateStore.get(state);

    // Clean up expired states
    if (memoryState && Date.now() - memoryState.timestamp > STATE_EXPIRY) {
      stateStore.delete(state);
    }

    const isValidState =
      state === sessionState ||
      (memoryState && Date.now() - memoryState.timestamp <= STATE_EXPIRY);

    if (!isValidState) {
      // Log state mismatch
      securityLogger.warn("LinkedIn state mismatch detected", {
        receivedState: state,
        expectedState: sessionState,
        hasSession: !!req.session,
        hasMemoryState: !!memoryState,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.redirect(
        "http://localhost:3000/login?error=" +
          encodeURIComponent("Invalid state parameter")
      );
    }

    // Extract National ID from state store (if session doesn't have it)
    if (memoryState && memoryState.nationalId) {
      nationalIdFromState = memoryState.nationalId;
      // Restore to session if session doesn't have it
      if (req.session && !req.session.nationalId) {
        req.session.nationalId = nationalIdFromState;
        req.session.save(() => {});
      }
    }

    // Clean up the state after validation (but keep National ID in session)
    if (memoryState) {
      stateStore.delete(state);
    }

    if (!code) {
      // Log missing code
      logger.warn("LinkedIn callback missing authorization code", {
        state,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.redirect(
        "http://localhost:3000/login?error=" +
          encodeURIComponent("Authorization code not provided")
      );
    }

    // Exchange authorization code for access token
    let tokenResponse;
    try {
      // Log token exchange attempt
      logger.debug("Exchanging LinkedIn authorization code for access token", {
        codeLength: code.length,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      tokenResponse = await axios.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        {
          grant_type: "authorization_code",
          code: code,
          client_id: LINKEDIN_CLIENT_ID,
          client_secret: LINKEDIN_CLIENT_SECRET,
          redirect_uri: LINKEDIN_REDIRECT_URI,
        },
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      // Log successful token exchange
      logger.debug("LinkedIn token exchange successful", {
        hasAccessToken: !!tokenResponse.data.access_token,
        expiresIn: tokenResponse.data.expires_in,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    } catch (tokenError) {
      // Log token exchange failure
      logger.error("LinkedIn token exchange failed", {
        error: tokenError.response?.data?.error || tokenError.message,
        errorDescription: tokenError.response?.data?.error_description,
        statusCode: tokenError.response?.status,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      console.error(
        "LinkedIn token exchange error:",
        tokenError.response?.data || tokenError.message
      );
      const errorMessage =
        tokenError.response?.data?.error_description ||
        tokenError.message ||
        "Failed to exchange authorization code for access token";
      return res.redirect(
        "http://localhost:3000/login?error=" + encodeURIComponent(errorMessage)
      );
    }

    const { access_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      // Log missing access token
      logger.error("LinkedIn returned empty access token", {
        responseData: tokenResponse.data,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: "error",
        message: "No access token received from LinkedIn",
      });
    }

    // Fetch user profile using OpenID Connect userinfo endpoint
    let userInfoResponse;
    try {
      // Log user info fetch attempt
      logger.debug("Fetching LinkedIn user info", {
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      // Try OpenID Connect userinfo endpoint first
      try {
        userInfoResponse = await axios.get(
          "https://api.linkedin.com/v2/userinfo",
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
            timeout: 10000, // 10 second timeout
          }
        );
      } catch (userInfoError) {
        // If v2/userinfo fails, try the legacy endpoint
        logger.warn(
          "LinkedIn v2/userinfo failed, trying alternative endpoint",
          {
            error: userInfoError.response?.data || userInfoError.message,
            ip: req.ip,
          }
        );

        // Try alternative: use token response data if available, or try legacy endpoint
        // For now, we'll extract what we can from the token response
        throw userInfoError; // Re-throw to be caught by outer catch
      }

      // Log successful user info fetch
      logger.debug("LinkedIn user info fetched successfully", {
        hasEmail: !!userInfoResponse.data.email,
        hasSub: !!userInfoResponse.data.sub,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    } catch (userInfoError) {
      // Log user info fetch failure
      logger.error("LinkedIn user info fetch failed", {
        error: userInfoError.response?.data?.error || userInfoError.message,
        statusCode: userInfoError.response?.status,
        errorData: userInfoError.response?.data,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      console.error(
        "LinkedIn userinfo error:",
        userInfoError.response?.data || userInfoError.message
      );

      // Redirect to frontend with error message
      const errorMessage =
        userInfoError.response?.data?.error_description ||
        userInfoError.message ||
        "Failed to fetch user profile from LinkedIn";
      return res.redirect(
        "http://localhost:3000/login?error=" + encodeURIComponent(errorMessage)
      );
    }

    const userInfo = userInfoResponse.data;

    // Extract data from OpenID Connect response
    const email = userInfo.email || null;
    const linkedinId = userInfo.sub || userInfo.id || null;

    // Log extracted user info
    logger.debug("LinkedIn user info extracted", {
      email: email ? email.substring(0, 3) + "***" : "null",
      linkedinId: linkedinId ? linkedinId.substring(0, 3) + "***" : "null",
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // For additional profile info, try the v2 API (may need legacy scopes)
    let profile = {
      id: linkedinId,
      firstName: {
        localized: {
          en_US: userInfo.given_name || userInfo.name?.split(" ")[0] || "",
        },
      },
      lastName: {
        localized: {
          en_US:
            userInfo.family_name ||
            userInfo.name?.split(" ").slice(1).join(" ") ||
            "",
        },
      },
      profilePicture: null,
      headline: null,
      location: null,
    };

    // Try to get additional profile details if available
    try {
      // Log additional profile fetch attempt
      logger.debug("Attempting to fetch additional LinkedIn profile details", {
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      const profileResponse = await axios.get(
        "https://api.linkedin.com/v2/me",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      );
      profile = profileResponse.data;

      // Log successful additional profile fetch
      logger.debug("Additional LinkedIn profile details fetched", {
        hasProfileData: !!profile,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    } catch (profileError) {
      // If v2/me fails, use the userinfo data we have
      logger.debug("Using OpenID Connect userinfo data only (v2/me failed)", {
        error: profileError.message,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      console.log("Using OpenID Connect userinfo data only");
    }

    if (!email) {
      // Log missing email
      logger.warn("LinkedIn did not return email address", {
        linkedinId: linkedinId ? linkedinId.substring(0, 3) + "***" : "null",
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.redirect(
        "http://localhost:3000/login?error=" +
          encodeURIComponent(
            "Could not retrieve email from LinkedIn. Please ensure your LinkedIn account has a verified email address."
          )
      );
    }

    // Extract profile data
    const firstName =
      profile.firstName?.localized?.en_US ||
      profile.firstName?.localized?.en ||
      userInfo.given_name ||
      userInfo.name?.split(" ")[0] ||
      "";
    const lastName =
      profile.lastName?.localized?.en_US ||
      profile.lastName?.localized?.en ||
      userInfo.family_name ||
      userInfo.name?.split(" ").slice(1).join(" ") ||
      "";
    const profilePictureUrl =
      profile.profilePicture?.["displayImage~"]?.elements?.[0]?.identifiers?.[0]
        ?.identifier ||
      userInfo.picture ||
      null;
    const headline = profile.headline || null;
    const location = profile.location?.name || null;
    const linkedinProfileUrl = profile.id
      ? `https://www.linkedin.com/in/${profile.id}`
      : null;

    // Log profile data extraction
    logger.debug("Profile data extracted", {
      firstNameLength: firstName.length,
      lastNameLength: lastName.length,
      hasProfilePicture: !!profilePictureUrl,
      hasHeadline: !!headline,
      hasLocation: !!location,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const ip = req.ip || req.connection.remoteAddress;

    // ================== 1. Existing user? ==================
    let user = await User.findOne({
      where: { linkedin_id: linkedinId },
      include: [
        { model: Graduate, required: false },
        { model: Staff, required: false },
      ],
    });

    if (user) {
      // Check if National ID was provided in this signup attempt
      const nationalIdFromSession =
        req.session?.nationalId || nationalIdFromState;

      // If National ID was provided and doesn't match existing account, prevent login
      if (nationalIdFromSession && validateNationalId(nationalIdFromSession)) {
        const storedNID = user["national-id"]
          ? aes.decryptNationalId(user["national-id"])
          : null;

        if (storedNID && storedNID !== nationalIdFromSession) {
          // LinkedIn account exists but National ID doesn't match
          // Log security event
          securityLogger.warn("LinkedIn NID mismatch detected", {
            userId: user.id,
            ip: req.ip,
            timestamp: new Date().toISOString(),
          });
          return res.redirect(
            "http://localhost:3000/login?error=" +
              encodeURIComponent(
                "This LinkedIn account is already registered with a different National ID. Please log out of LinkedIn and use a different LinkedIn account, or use the correct National ID."
              )
          );
        }
      }

      // Update profile picture if missing
      if (profilePictureUrl && !user.profile_picture_url) {
        user.profile_picture_url = profilePictureUrl;
        await user.save();
      }

      // Update LinkedIn data
      await user.update({
        linkedin_access_token: access_token,
        linkedin_token_expires_at: new Date(Date.now() + expires_in * 1000),
        linkedin_profile_url: linkedinProfileUrl,
        linkedin_headline: headline,
        linkedin_location: location,
        is_linkedin_verified: true,
      });

      // === Staff: Check activation status ===
      if (user["user-type"] === "staff") {
        const staffRecord =
          user.Staff || (await Staff.findOne({ where: { staff_id: user.id } }));
        if (staffRecord && staffRecord["status-to-login"] !== "active") {
          return res.redirect(
            "http://localhost:3000/login?error=" +
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
          return res.redirect(
            "http://localhost:3000/login?error=" +
              encodeURIComponent(
                "Your account is under review. Please wait for admin approval to access the dashboard."
              )
          );
        }
      }

      // User is fully allowed → login
      const token = generateToken(user.id);
      const redirectUrl = new URL("http://localhost:3000/login");
      redirectUrl.searchParams.set("token", token);
      redirectUrl.searchParams.set("id", user.id);
      redirectUrl.searchParams.set("email", user.email);
      redirectUrl.searchParams.set("userType", user["user-type"]);

      // Clear session
      if (req.session) {
        delete req.session.linkedinState;
        delete req.session.nationalId;
        delete req.session.tempLinkedInData;
        req.session.save();
      }

      // Log successful login
      logger.info("Existing LinkedIn user logged in", {
        userId: user.id,
        userType: user["user-type"],
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      return res.redirect(redirectUrl.toString());
    }

    // ================== 2. New user (first time) ==================
    // Get National ID from session (or from state store if session was lost)
    let nationalIdFromSession = req.session?.nationalId;

    // If session doesn't have it, try to get from state store (should have been restored above)
    if (
      (!nationalIdFromSession || !validateNationalId(nationalIdFromSession)) &&
      nationalIdFromState
    ) {
      nationalIdFromSession = nationalIdFromState;
      // Restore to session
      if (req.session) {
        req.session.nationalId = nationalIdFromSession;
        req.session.save(() => {});
      }
    }

    if (!nationalIdFromSession || !validateNationalId(nationalIdFromSession)) {
      // Store temp LinkedIn data in session and redirect to frontend for National ID
      if (req.session) {
        req.session.tempLinkedInData = {
          linkedin_id: linkedinId,
          email: email,
          firstName: validator.escape(firstName || ""),
          lastName: validator.escape(lastName || ""),
          profile_picture_url: profilePictureUrl,
          linkedin_profile_url: linkedinProfileUrl,
          linkedin_headline: headline,
          linkedin_location: location,
          access_token: access_token,
          expires_in: expires_in,
        };
        req.session.save(() => {
          // Log redirect for NID
          logger.info("LinkedIn user redirected for NID", {
            ip: req.ip,
            timestamp: new Date().toISOString(),
          });
          return res.redirect(
            "http://localhost:3000/login?require_nid=true&provider=linkedin"
          );
        });
      }
      return;
    }

    // National ID provided → proceed with registration
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
      // Log staff API error but continue
      logger.debug("Staff API check failed for LinkedIn registration", {
        error: e.message,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. If not staff → check Graduate API
    if (!foundInAPI) {
      try {
        const gradResp = await axios.get(
          `${process.env.GRADUATE_API_URL}?nationalId=${encodeURIComponent(
            nationalIdFromSession
          )}`,
          { timeout: 8000 }
        );
        const data = gradResp.data;
        const facultyField =
          data?.faculty || data?.Faculty || data?.FACULTY || data?.facultyName;

        if (facultyField) {
          statusToLogin = "accepted"; // Found in graduate API → auto-accept
          externalData = data;
          foundInAPI = true;
        }
        // else → remains "pending"
      } catch (e) {
        // Log graduate API error but continue
        logger.debug("Graduate API check failed for LinkedIn registration", {
          error: e.message,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Create user
    const newUser = await User.create({
      linkedin_id: linkedinId,
      email: validator.normalizeEmail(email),
      "first-name": validator.escape(firstName || ""),
      "last-name": validator.escape(lastName || ""),
      "national-id": encryptedNID,
      "birth-date": birthDate,
      "user-type": userType,
      auth_provider: "linkedin",
      profile_picture_url: profilePictureUrl || null,
      linkedin_profile_url: linkedinProfileUrl,
      linkedin_headline: headline,
      linkedin_location: location,
      linkedin_access_token: access_token,
      linkedin_token_expires_at: new Date(Date.now() + expires_in * 1000),
      is_linkedin_verified: true,
      "hashed-password": null,
    });

    // Create related record
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
        bio: headline || null,
        "profile-picture-url": profilePictureUrl || null,
      });
    }

    if (userType === "staff") {
      await Staff.create({
        staff_id: newUser.id,
        "status-to-login": "inactive",
      });

      securityLogger.registration(ip, newUser.email, userType, statusToLogin);

      // Clear session
      if (req.session) {
        delete req.session.nationalId;
        delete req.session.tempLinkedInData;
        delete req.session.linkedinState;
        req.session.save();
      }

      // Log staff registration
      logger.info("LinkedIn staff account created", {
        userId: newUser.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      return res.redirect(
        "http://localhost:3000/login?success=" +
          encodeURIComponent(
            "Staff account created successfully. Your account is pending admin activation."
          )
      );
    }

    // === Final Login Decision for Graduates ===
    securityLogger.registration(ip, newUser.email, userType, statusToLogin);

    if (statusToLogin === "accepted") {
      // Only auto-login if confirmed graduate from API
      const token = generateToken(newUser.id);
      const redirectUrl = new URL("http://localhost:3000/login");
      redirectUrl.searchParams.set("token", token);
      redirectUrl.searchParams.set("id", newUser.id);
      redirectUrl.searchParams.set("email", newUser.email);
      redirectUrl.searchParams.set("userType", userType);

      // Clear session
      if (req.session) {
        delete req.session.nationalId;
        delete req.session.tempLinkedInData;
        delete req.session.linkedinState;
        req.session.save();
      }

      // Log successful auto-login
      logger.info("LinkedIn graduate auto-logged in", {
        userId: newUser.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      return res.redirect(redirectUrl.toString());
    } else {
      // Pending graduate (not found in API) → show message, no login
      // Clear session
      if (req.session) {
        delete req.session.nationalId;
        delete req.session.tempLinkedInData;
        delete req.session.linkedinState;
        req.session.save();
      }

      // Log pending registration
      logger.info("LinkedIn graduate account created (pending)", {
        userId: newUser.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      return res.redirect(
        "http://localhost:3000/login?success=" +
          encodeURIComponent(
            "Account created successfully. Your graduation data is under review. You will be able to log in once approved."
          )
      );
    }
  } catch (error) {
    // Log error
    logger.error("LinkedIn callback processing failed", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("LinkedIn callback error:", error);
    console.error("Error stack:", error.stack);

    // Redirect to frontend with error message
    const errorMessage = error.message || "LinkedIn authentication failed";
    return res.redirect(
      "http://localhost:3000/login?error=" + encodeURIComponent(errorMessage)
    );
  }
});

/**
 * Refresh LinkedIn access token
 * @route POST /auth/linkedin/refresh
 * @access Private
 */
const refreshLinkedInToken = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    // Log request initiation
    logger.info("Refresh LinkedIn token request initiated", {
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const user = await User.findByPk(userId);
    if (!user || user.auth_provider !== "linkedin") {
      // Log invalid user
      logger.warn(
        "User not found or not LinkedIn authenticated for token refresh",
        {
          userId,
          userExists: !!user,
          authProvider: user?.auth_provider,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        }
      );
      return res.status(400).json({
        status: "error",
        message: "User not found or not authenticated via LinkedIn",
      });
    }

    if (!user.linkedin_refresh_token) {
      // Log missing refresh token
      logger.warn("No refresh token available for LinkedIn user", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: "error",
        message: "No refresh token available",
      });
    }

    // Exchange refresh token for new access token
    const tokenResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        grant_type: "refresh_token",
        refresh_token: user.linkedin_refresh_token,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, expires_in, refresh_token } = tokenResponse.data;

    // Update user with new tokens
    await user.update({
      linkedin_access_token: access_token,
      linkedin_refresh_token: refresh_token || user.linkedin_refresh_token,
      linkedin_token_expires_at: new Date(Date.now() + expires_in * 1000),
    });

    // Log successful refresh
    logger.info("LinkedIn token refreshed successfully", {
      userId,
      hasNewAccessToken: !!access_token,
      hasNewRefreshToken: !!refresh_token,
      expiresIn: expires_in,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: "success",
      message: "LinkedIn token refreshed successfully",
    });
  } catch (error) {
    // Log error
    logger.error("LinkedIn token refresh failed", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("LinkedIn token refresh error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to refresh LinkedIn token",
      error: error.message,
    });
  }
});

/**
 * Disconnect LinkedIn account
 * @route DELETE /auth/linkedin/disconnect
 * @access Private
 */
const disconnectLinkedIn = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    // Log request initiation
    logger.info("Disconnect LinkedIn request initiated", {
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const user = await User.findByPk(userId);
    if (!user) {
      // Log user not found
      logger.warn("User not found for LinkedIn disconnect", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Log data clearing
    logger.info("Clearing LinkedIn data for user", {
      userId,
      email: user.email.substring(0, 3) + "***",
      currentAuthProvider: user.auth_provider,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Clear LinkedIn data
    await user.update({
      linkedin_id: null,
      linkedin_access_token: null,
      linkedin_refresh_token: null,
      linkedin_token_expires_at: null,
      linkedin_profile_url: null,
      linkedin_headline: null,
      linkedin_location: null,
      auth_provider: "local",
      is_linkedin_verified: false,
    });

    // Log successful disconnect
    logger.info("LinkedIn account disconnected successfully", {
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: "success",
      message: "LinkedIn account disconnected successfully",
    });
  } catch (error) {
    // Log error
    logger.error("LinkedIn disconnect failed", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("LinkedIn disconnect error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to disconnect LinkedIn account",
      error: error.message,
    });
  }
});

/**
 * Get LinkedIn profile data
 * @route GET /auth/linkedin/profile
 * @access Private
 */
const getLinkedInProfile = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    // Log request initiation
    logger.info("Get LinkedIn profile request initiated", {
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    const user = await User.findByPk(userId, {
      attributes: [
        "id",
        "first-name",
        "last-name",
        "email",
        "user-type",
        "profile_picture_url",
        "linkedin_profile_url",
        "linkedin_headline",
        "linkedin_location",
        "auth_provider",
        "is_linkedin_verified",
        "linkedin_token_expires_at",
      ],
    });

    if (!user) {
      // Log user not found
      logger.warn("User not found for LinkedIn profile request", {
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    if (user.auth_provider !== "linkedin") {
      // Log wrong provider
      logger.warn("User not LinkedIn authenticated for profile request", {
        userId,
        authProvider: user.auth_provider,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        status: "error",
        message: "User not authenticated via LinkedIn",
      });
    }

    // Log successful retrieval
    logger.info("LinkedIn profile retrieved successfully", {
      userId,
      email: user.email.substring(0, 3) + "***",
      userType: user["user-type"],
      hasTokenExpiry: !!user.linkedin_token_expires_at,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: "success",
      data: {
        user: {
          id: user.id,
          "first-name": user["first-name"],
          "last-name": user["last-name"],
          email: user.email,
          "user-type": user["user-type"],
          profile_picture_url: user.profile_picture_url,
          linkedin_profile_url: user.linkedin_profile_url,
          linkedin_headline: user.linkedin_headline,
          linkedin_location: user.linkedin_location,
          auth_provider: user.auth_provider,
          is_linkedin_verified: user.is_linkedin_verified,
          token_expires_at: user.linkedin_token_expires_at,
        },
      },
    });
  } catch (error) {
    // Log error
    logger.error("Get LinkedIn profile failed", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    console.error("Get LinkedIn profile error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get LinkedIn profile",
      error: error.message,
    });
  }
});

module.exports = {
  getLinkedInAuthUrl,
  handleLinkedInCallback,
  refreshLinkedInToken,
  disconnectLinkedIn,
  getLinkedInProfile,
};

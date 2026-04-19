const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const hpp = require("hpp");
const validator = require("validator");
const sanitizeHtml = require("sanitize-html");
const { securityLogger, logger } = require("../utils/logger");

// Rate Limiting

// Limits login attempts to prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 4, // Allow maximum 4 failed login attempts
  message: {
    error: "Too many login attempts, please try again after 5 minutes.",
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable legacy headers
  skipSuccessfulRequests: true, // Only count failed requests
  handler: (req, res, next, options) => {
    logger.warn("Rate limit exceeded - Auth", { 
      ip: req.ip, 
      url: req.originalUrl,
      type: 'auth',
      timestamp: new Date().toISOString()
    });
    res.status(options.statusCode).json(options.message);
  }
});

// More lenient rate limiter for OAuth endpoints (callback can be called multiple times)
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Allow more requests for OAuth flow
  message: {
    error: "Too many OAuth requests, please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed requests
  handler: (req, res, next, options) => {
    logger.warn("Rate limit exceeded - OAuth", { 
      ip: req.ip, 
      url: req.originalUrl,
      type: 'oauth',
      timestamp: new Date().toISOString()
    });
    res.status(options.statusCode).json(options.message);
  }
});

// Limits general API requests from same IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Time window: 15 minutes
  max: 2000, // Lower for testing
  skipSuccessfulRequests: false, // Count all requests including reloads
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  handler: (req, res, next, options) => {
    logger.warn("Rate limit exceeded - General", { 
      ip: req.ip, 
      url: req.originalUrl,
      type: 'general',
      timestamp: new Date().toISOString()
    });
    res.status(options.statusCode).json(options.message);
  }
});

// Helmet Security Headers

// Adds security-related HTTP headers to prevent common attacks
const helmetConfig = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || "http://localhost:3000"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "same-site" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Full Sanitization Against XSS

// Cleans all input fields to remove harmful scripts (XSS)
const sanitizeInput = (req, res, next) => {
  try {
    // Cleans a single value recursively
    const clean = (value) => {
      if (value === null || value === undefined) return value;
      
      if (typeof value === "string") {
        const trimmed = validator.trim(value);
        
        // Remove any HTML tags or attributes (strong XSS protection)
        const cleaned = sanitizeHtml(trimmed, {
          allowedTags: [],
          allowedAttributes: {},
          disallowedTagsMode: 'escape'
        });
        
        // Additional XSS protection
        const xssPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /eval\(/gi,
          /alert\(/gi
        ];
        
        if (xssPatterns.some(pattern => pattern.test(cleaned))) {
          // استخدام الدالة xssAttempt من securityLogger
          securityLogger.xssAttempt(req.ip, cleaned.substring(0, 100));
        }
        
        return cleaned;
      }

      // Clean each item in arrays
      if (Array.isArray(value)) {
        return value.map((v) => clean(v));
      }

      // Clean objects recursively
      if (typeof value === "object" && value !== null) {
        const obj = {};
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            obj[key] = clean(value[key]);
          }
        }
        return obj;
      }

      return value;
    };

    // Clean request body, query params, and route params
    req.body = clean(req.body);
    req.query = clean(req.query);
    req.params = clean(req.params);

    next();
  } catch (error) {
    logger.error("Sanitization error", { 
      ip: req.ip, 
      error: error.message,
      source: 'sanitizeInput',
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: "Sanitization error", 
      message: "Input sanitization failed" 
    });
  }
};

// Basic XSS Protection Headers
const xssProtection = (req, res, next) => {
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
};

// DoS Attack Detection (Logging only)
const detectDoS = (req, res, next) => {
  const requestSize = req.headers['content-length'] || 'unknown';
  
  // تسجيل الطلب
  logger.info("HTTP Request", { 
    method: req.method, 
    url: req.originalUrl,
    ip: req.ip,
    size: requestSize,
    timestamp: new Date().toISOString()
  });
  
  // تحقق من حجم الطلب الكبير
  if (parseInt(requestSize) > 1024 * 1024) { // أكثر من 1MB
    // استخدام الدالة dosAttack من securityLogger
    securityLogger.dosAttack(req.ip);
  }
  
  next();
};

// Security Middleware for all requests
const securityMiddleware = (req, res, next) => {
  try {
    // Check for null bytes in cookies
    if (req.cookies) {
      for (const [key, value] of Object.entries(req.cookies)) {
        if (typeof value === 'string' && (value.includes('\0') || value.includes('\x00'))) {
          logger.warn("Null byte attack detected in cookies", { 
            ip: req.ip, 
            cookie: key,
            timestamp: new Date().toISOString()
          });
          res.clearCookie(key);
          return res.status(400).json({
            error: "Invalid request",
            message: "Malicious content detected"
          });
        }
      }
    }

    // Check for SQL injection in query parameters
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\b)/i,
      /(\b(OR|AND)\b.*\b(1=1|2=2|0=0)\b)/i,
      /(--|\/\*|\*\/|;)/,
    ];

    // Check query parameters
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && sqlPatterns.some(pattern => pattern.test(value))) {
        // استخدام الدالة sqlInjectionAttempt من securityLogger
        securityLogger.sqlInjectionAttempt(req.ip, value.substring(0, 100));
        return res.status(400).json({
          error: "Invalid request",
          message: "Suspicious input detected"
        });
      }
    }

    // Check for XSS in query parameters
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
    ];

    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && xssPatterns.some(pattern => pattern.test(value))) {
        // استخدام الدالة xssAttempt من securityLogger
        securityLogger.xssAttempt(req.ip, value.substring(0, 100));
        return res.status(400).json({
          error: "Invalid request",
          message: "Suspicious input detected"
        });
      }
    }

    // Validate JWT token structure if present in cookies
    if (req.cookies && req.cookies.jwt) {
      try {
        const token = req.cookies.jwt;
        const parts = token.split('.');
        if (parts.length !== 3) {
          logger.warn("Tampered cookie detected", { 
            ip: req.ip, 
            cookie: 'jwt',
            timestamp: new Date().toISOString()
          });
          res.clearCookie('jwt');
          return res.status(401).json({
            error: "Unauthorized",
            message: "Invalid authentication token"
          });
        }
      } catch (error) {
        logger.warn("Cookie validation error", { 
          ip: req.ip, 
          error: error.message,
          timestamp: new Date().toISOString()
        });
        res.clearCookie('jwt');
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid authentication token"
        });
      }
    }

    // Check for suspicious headers
    if (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',').length > 3) {
      logger.info("Multiple x-forwarded-for entries", { 
        ip: req.ip, 
        headers: req.headers['x-forwarded-for'],
        timestamp: new Date().toISOString()
      });
    }

    next();
  } catch (error) {
    logger.error("Security middleware error", { 
      ip: req.ip, 
      error: error.message,
      source: 'securityMiddleware',
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      error: "Security check failed",
      message: "Internal server error during security check"
    });
  }
};

// Data Validators

const validateEmail = (email) => {
  return validator.isEmail(email) && validator.isLength(email, { max: 255 });
};

const validatePassword = (password) => {
  return validator.isStrongPassword(password, {
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  });
};

const validateNationalId = (nationalId) => {
  return (
    validator.isNumeric(nationalId) &&
    validator.isLength(nationalId, { min: 14, max: 14 })
  );
};

const validatePhoneNumber = (phoneNumber) => {
  return validator.isMobilePhone(phoneNumber, "any");
};

// Allowed Content Types
const validateContentType = (req, res, next) => {
  const allowed = [
    "application/json",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
  ];

  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const type = req.headers["content-type"];
    if (!type || !allowed.some((t) => type.includes(t))) {
      logger.warn("Unsupported content type", { 
        ip: req.ip, 
        contentType: type,
        method: req.method,
        timestamp: new Date().toISOString()
      });
      return res.status(415).json({ 
        error: "Unsupported Media Type",
        message: `Content-Type must be one of: ${allowed.join(", ")}` 
      });
    }
  }

  next();
};

// HPP Protection
const hppProtection = hpp({
  whitelist: ['page', 'limit', 'sort', 'fields'] // Allow these parameters
});

// Export all security functions
module.exports = {
  authLimiter,
  oauthLimiter,
  generalLimiter,
  helmetConfig,
  hppProtection,
  sanitizeInput,
  validateEmail,
  validatePassword,
  validateNationalId,
  validatePhoneNumber,
  xssProtection,
  detectDoS,
  validateContentType,
  securityMiddleware
};
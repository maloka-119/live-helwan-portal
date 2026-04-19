const Joi = require("joi");
const validator = require("validator");
const { securityLogger } = require("../utils/logger");

// Custom Joi extensions for security
const customJoi = Joi.extend((joi) => ({
  type: 'string',
  base: joi.string(),
  messages: {
    'string.noSql': '{{#label}} contains potential SQL injection',
    'string.noXss': '{{#label}} contains potential XSS attack',
    'string.validEmail': '{{#label}} must be a valid email',
    'string.validPhone': '{{#label}} must be a valid phone number',
    'string.validNationalId': '{{#label}} must be a valid Egyptian national ID',
    'string.noNullBytes': '{{#label}} contains null bytes',
    'string.noSpecialChars': '{{#label}} contains invalid special characters',
    'string.weakPassword': '{{#label}} is too weak or contains sequential characters'
  },
  rules: {
    noSql: {
      validate(value, helpers) {
        if (!value) return value;
        const sqlPatterns = [
          /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\b)/i,
          /(\b(OR|AND)\b.*\b(1=1|2=2|0=0)\b)/i,
          /(--|\/\*|\*\/|;)/,
          /(\b(WAITFOR|DELAY)\b.*\b(\d)\b)/i
        ];
        
        if (sqlPatterns.some(pattern => pattern.test(value))) {
          securityLogger.sqlInjectionAttempt('validation', value.substring(0, 50));
          return helpers.error('string.noSql');
        }
        return value;
      }
    },
    noXss: {
      validate(value, helpers) {
        if (!value) return value;
        const xssPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /eval\(/gi,
          /alert\(/gi,
          /document\./gi,
          /window\./gi,
          /<iframe/gi,
          /<object/gi,
          /<embed/gi,
          /<applet/gi,
          /<meta/gi,
          /<link/gi,
          /<style/gi,
          /<form/gi,
          /<input/gi,
          /<button/gi,
          /<select/gi,
          /<textarea/gi
        ];
        
        if (xssPatterns.some(pattern => pattern.test(value))) {
          securityLogger.xssAttempt('validation', value.substring(0, 50));
          return helpers.error('string.noXss');
        }
        return value;
      }
    },
    noNullBytes: {
      validate(value, helpers) {
        if (!value) return value;
        if (value.includes('\0') || value.includes('\x00')) {
          securityLogger.xssAttempt('validation', value.substring(0, 50));
          return helpers.error('string.noNullBytes');
        }
        return value;
      }
    },
    validEmail: {
      validate(value, helpers) {
        if (!value) return helpers.error('any.required');
        if (!validator.isEmail(value)) {
          return helpers.error('string.validEmail');
        }
        const normalized = validator.normalizeEmail(value);
        if (!normalized) {
          return helpers.error('string.validEmail');
        }
        return normalized;
      }
    },
    validPhone: {
      validate(value, helpers) {
        if (!value) return value;
        if (!validator.isMobilePhone(value, 'any')) {
          return helpers.error('string.validPhone');
        }
        return validator.escape(validator.trim(value));
      }
    },
    validNationalId: {
      validate(value, helpers) {
        if (!value) return helpers.error('any.required');
        
        // Egyptian national ID validation
        if (!/^\d{14}$/.test(value)) {
          return helpers.error('string.validNationalId');
        }
        
        const centuryDigit = value[0];
        if (!['2', '3'].includes(centuryDigit)) {
          return helpers.error('string.validNationalId');
        }
        
        const month = parseInt(value.substr(3, 2), 10);
        if (month < 1 || month > 12) {
          return helpers.error('string.validNationalId');
        }
        
        const day = parseInt(value.substr(5, 2), 10);
        if (day < 1 || day > 31) {
          return helpers.error('string.validNationalId');
        }
        
        // Additional validation for future dates
        const year = centuryDigit === '2' ? 1900 + parseInt(value.substr(1, 2)) : 2000 + parseInt(value.substr(1, 2));
        const birthDate = new Date(year, month - 1, day);
        const today = new Date();
        
        if (birthDate > today) {
          return helpers.error('string.validNationalId');
        }
        
        return value;
      }
    },
    noSpecialChars: {
      validate(value, helpers) {
        if (!value) return value;
        const namePattern = /^[a-zA-Z\u0600-\u06FF\s\-\'\.]+$/;
        if (!namePattern.test(value)) {
          return helpers.error('string.noSpecialChars');
        }
        return validator.escape(validator.trim(value));
      }
    },
    safeHtml: {
      validate(value, helpers) {
        if (!value) return value;
        return validator.escape(value);
      }
    }
  }
}));

// Validation schemas
exports.registerSchema = customJoi.object({
  firstName: customJoi.string().max(50).required().noSql().noXss().noNullBytes().noSpecialChars(),
  lastName: customJoi.string().max(50).required().noSql().noXss().noNullBytes().noSpecialChars(),
  email: customJoi.string().max(255).required().validEmail().noSql().noXss().noNullBytes(),
  password: customJoi.string()
    .min(8).max(128).required().noSql().noXss().noNullBytes()
    .pattern(/[A-Z]/, "uppercase").pattern(/[a-z]/, "lowercase")
    .pattern(/[0-9]/, "number").pattern(/[\W_]/, "symbol")
    .custom((value, helpers) => {
      const weakPasswords = ['password','12345678','qwerty123','admin123','welcome123','monkey123','dragon123','football123'];
      if (weakPasswords.includes(value.toLowerCase()) || /(.)\1\1/.test(value)) {
        return helpers.error('string.weakPassword');
      }
      return value;
    }),
  nationalId: customJoi.string().required().validNationalId().noSql().noXss().noNullBytes(),
  phoneNumber: customJoi.string().max(15).allow(null,'').validPhone().noSql().noXss().noNullBytes()
});

exports.loginSchema = customJoi.object({
  email: customJoi.string().max(255).required().validEmail().noSql().noXss().noNullBytes(),
  password: customJoi.string().required().noSql().noXss().noNullBytes()
});

// Validation middleware
exports.validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const requestString = JSON.stringify(req.body);
      if (requestString.includes('\0') || requestString.includes('\x00')) {
        securityLogger.dosAttack(req.ip);
        return res.status(400).json({ error: "Validation failed", message: "Request contains null bytes" });
      }

      const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true, allowUnknown: false });

      if (error) {
        error.details.forEach(detail => {
          securityLogger.failedLogin(req.ip, detail.path.join('.'), detail.message);
        });

        const errorMessages = error.details.map((d) => `${d.path.join('.')}: ${d.message}`);
        return res.status(400).json({ error: "Validation failed", details: errorMessages });
      }

      req.body = value;
      next();
    } catch (error) {
      securityLogger.failedLogin(req.ip, "validateRequest", error.message);
      res.status(500).json({ error: "Validation error", message: "Internal server error during validation" });
    }
  };
};

// Export custom Joi for reuse
exports.customJoi = customJoi;

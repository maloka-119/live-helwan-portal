const rateLimit = require('express-rate-limit');

class RateLimitService {
  constructor() {
    this.rateLimitStore = new Map(); // In-memory store for rate limiting
    this.userLimits = new Map(); // Per-user rate limits
    this.ipLimits = new Map(); // Per-IP rate limits
  }

  // Create rate limiter for messages
  createMessageRateLimit() {
    return rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 30, // 30 messages per minute
      message: {
        status: 'error',
        message: 'Too many messages sent. Please slow down.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          status: 'error',
          message: 'Too many messages sent. Please slow down.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });
  }

  // Create rate limiter for file uploads
  createUploadRateLimit() {
    return rateLimit({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 10, // 10 uploads per 5 minutes
      message: {
        status: 'error',
        message: 'Too many file uploads. Please wait before uploading more files.',
        code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          status: 'error',
          message: 'Too many file uploads. Please wait before uploading more files.',
          code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });
  }

  // Create rate limiter for login attempts
  createLoginRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 login attempts per 15 minutes
      message: {
        status: 'error',
        message: 'Too many login attempts. Please try again later.',
        code: 'LOGIN_RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true, // Don't count successful logins
      handler: (req, res) => {
        res.status(429).json({
          status: 'error',
          message: 'Too many login attempts. Please try again later.',
          code: 'LOGIN_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });
  }

  // Create rate limiter for API requests
  createApiRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests per 15 minutes
      message: {
        status: 'error',
        message: 'Too many API requests. Please slow down.',
        code: 'API_RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          status: 'error',
          message: 'Too many API requests. Please slow down.',
          code: 'API_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });
  }

  // Custom rate limiter for WebSocket events
  checkSocketRateLimit(userId, eventType, limit = 30, windowMs = 60000) {
    const key = `${userId}_${eventType}`;
    const now = Date.now();
    
    if (!this.userLimits.has(key)) {
      this.userLimits.set(key, {
        count: 0,
        resetTime: now + windowMs
      });
    }

    const userLimit = this.userLimits.get(key);
    
    // Reset if window has passed
    if (now > userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + windowMs;
    }

    // Check if limit exceeded
    if (userLimit.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: userLimit.resetTime
      };
    }

    // Increment count
    userLimit.count++;
    
    return {
      allowed: true,
      remaining: limit - userLimit.count,
      resetTime: userLimit.resetTime
    };
  }

  // Check IP-based rate limit
  checkIPRateLimit(ip, limit = 100, windowMs = 60000) {
    const now = Date.now();
    
    if (!this.ipLimits.has(ip)) {
      this.ipLimits.set(ip, {
        count: 0,
        resetTime: now + windowMs
      });
    }

    const ipLimit = this.ipLimits.get(ip);
    
    // Reset if window has passed
    if (now > ipLimit.resetTime) {
      ipLimit.count = 0;
      ipLimit.resetTime = now + windowMs;
    }

    // Check if limit exceeded
    if (ipLimit.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: ipLimit.resetTime
      };
    }

    // Increment count
    ipLimit.count++;
    
    return {
      allowed: true,
      remaining: limit - ipLimit.count,
      resetTime: ipLimit.resetTime
    };
  }

  // Clean up expired rate limit entries
  cleanupExpiredEntries() {
    const now = Date.now();
    
    // Clean user limits
    for (const [key, limit] of this.userLimits.entries()) {
      if (now > limit.resetTime) {
        this.userLimits.delete(key);
      }
    }
    
    // Clean IP limits
    for (const [ip, limit] of this.ipLimits.entries()) {
      if (now > limit.resetTime) {
        this.ipLimits.delete(ip);
      }
    }
  }

  // Get rate limit status for a user
  getRateLimitStatus(userId, eventType) {
    const key = `${userId}_${eventType}`;
    const userLimit = this.userLimits.get(key);
    
    if (!userLimit) {
      return {
        limit: 30,
        remaining: 30,
        resetTime: Date.now() + 60000
      };
    }

    const now = Date.now();
    if (now > userLimit.resetTime) {
      return {
        limit: 30,
        remaining: 30,
        resetTime: now + 60000
      };
    }

    return {
      limit: 30,
      remaining: 30 - userLimit.count,
      resetTime: userLimit.resetTime
    };
  }

  // Start cleanup interval
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Clean up every minute
  }

  // Get rate limit statistics
  getRateLimitStats() {
    return {
      userLimits: this.userLimits.size,
      ipLimits: this.ipLimits.size,
      totalEntries: this.userLimits.size + this.ipLimits.size
    };
  }
}

module.exports = RateLimitService;

/**
 * apiRateLimiter.js
 * In-memory rate limiters cho toàn bộ API công cộng và các thao tác nhạy cảm.
 * Tối ưu hiệu năng, chống DoS và Brute-force/Enumeration, không cần package ngoài.
 */

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

// ==========================================
// 1. GENERAL API LIMITER (Chống DoS / API Flooding)
// Giới hạn: 300 requests / 1 phút / IP
// ==========================================
const API_WINDOW_MS = 60 * 1000;
const API_MAX_REQUESTS = 300;
const apiRequests = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of apiRequests.entries()) {
    if (data.resetAt <= now) {
      apiRequests.delete(ip);
    }
  }
}, 60 * 1000);

function generalApiLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = apiRequests.get(ip);

  if (record) {
    if (record.resetAt <= now) {
      apiRequests.set(ip, { count: 1, resetAt: now + API_WINDOW_MS });
      return next();
    }

    if (record.count >= API_MAX_REQUESTS) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfterSec);
      return res.status(429).json({
        success: false,
        error: "Quá nhiều yêu cầu gửi tới máy chủ. Vui lòng thử lại sau vài giây.",
        retryAfter: retryAfterSec
      });
    }

    record.count++;
  } else {
    apiRequests.set(ip, { count: 1, resetAt: now + API_WINDOW_MS });
  }

  next();
}

// ==========================================
// 2. SENSITIVE OPERATIONS LIMITER (Chống dò quét mã mời & Setup)
// Giới hạn: 15 lần / 15 phút / IP
// ==========================================
const SENSITIVE_WINDOW_MS = 15 * 60 * 1000;
const SENSITIVE_MAX_ATTEMPTS = 15;
const sensitiveAttempts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of sensitiveAttempts.entries()) {
    if (data.resetAt <= now) {
      sensitiveAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function sensitiveOpLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = sensitiveAttempts.get(ip);

  if (record) {
    if (record.resetAt <= now) {
      sensitiveAttempts.set(ip, { count: 1, resetAt: now + SENSITIVE_WINDOW_MS });
      return next();
    }

    if (record.count >= SENSITIVE_MAX_ATTEMPTS) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfterSec);
      return res.status(429).json({
        success: false,
        error: "Thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.",
        retryAfter: retryAfterSec
      });
    }

    record.count++;
  } else {
    sensitiveAttempts.set(ip, { count: 1, resetAt: now + SENSITIVE_WINDOW_MS });
  }

  next();
}

module.exports = {
  generalApiLimiter,
  sensitiveOpLimiter
};

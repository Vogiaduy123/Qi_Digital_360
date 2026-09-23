/**
 * loginRateLimiter.js
 * In-memory rate limiter cho endpoint đăng nhập.
 * Không cần package ngoài — dùng Map lưu theo IP.
 * Giới hạn: tối đa 5 lần thử / 15 phút / IP
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 phút
const MAX_ATTEMPTS = 5;            // tối đa 5 lần thử

// Map: ip -> { count, resetAt }
const loginAttempts = new Map();

// Dọn dẹp các entry hết hạn mỗi 5 phút để tránh memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (data.resetAt <= now) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

function loginRateLimiter(req, res, next) {
  // Lấy IP thực đáng tin cậy đã qua xử lý trust proxy của Express
  const ip = getClientIp(req);

  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record) {
    // Nếu cửa sổ thời gian đã hết, reset
    if (record.resetAt <= now) {
      loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    // Vẫn trong cửa sổ — kiểm tra số lần thử
    if (record.count >= MAX_ATTEMPTS) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      return res.status(429).json({
        success: false,
        error: `Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau ${Math.ceil(retryAfterSec / 60)} phút.`,
        retryAfter: retryAfterSec
      });
    }

    record.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }

  next();
}

/**
 * Gọi sau khi login thành công để reset counter của IP đó.
 */
function resetLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

module.exports = { loginRateLimiter, resetLoginAttempts };

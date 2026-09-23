/**
 * securityHeaders.js
 * Middleware thiết lập các HTTP headers bảo mật tiêu chuẩn cho ứng dụng
 * Không phụ thuộc vào thư viện ngoài, tối ưu hiệu năng và an toàn.
 */

function securityHeaders(req, res, next) {
  // Chống MIME-sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Chống Clickjacking — chỉ cho phép nhúng từ cùng nguồn gốc
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // Ngăn chặn Cross-Site Scripting (XSS) trên các trình duyệt cũ
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Giới hạn thông tin Referer khi chuyển hướng sang domain khác
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content-Security-Policy (CSP) toàn diện, bảo vệ khỏi XSS và rogue embeds
  // Tương thích Marzipano, Google Model-Viewer, Bootstrap, YouTube và WebRTC/WHEP
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://ajax.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data: https:",
    "connect-src 'self' https: http: ws: wss:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'"
  ].join("; ");
  res.setHeader("Content-Security-Policy", cspDirectives);

  next();
}

module.exports = securityHeaders;

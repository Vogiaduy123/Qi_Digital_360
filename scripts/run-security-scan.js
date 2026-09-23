/**
 * scripts/run-security-scan.js
 * Quét bảo mật tự động trực tiếp trên cổng test (port 5099) bằng Node.js thuần (không cần Python/Docker)
 * Kiểm tra:
 *  1. Admin Auth Bypass & Missing Middleware
 *  2. Arbitrary Origin CORS Test
 *  3. HTTP Security Headers
 *  4. Sensitive Information Disclosure
 *  5. Injection / Malformed Parameters (ID traversal, SQL/NoSQL payload)
 *  6. Mail sending endpoint abuse
 *  7. Brute force / Rate limiting
 */

const fs = require('fs');
const path = require('path');

const TARGET_PORT = process.env.PORT || 5099;
const BASE_URL = `http://localhost:${TARGET_PORT}`;
const REPORT_DIR = path.join(__dirname, '../docs/security');
const REPORT_FILE = path.join(REPORT_DIR, 'SECURITY_REPORT.md');

const findings = [];

function recordFinding(severity, title, detail, remediation) {
  findings.push({
    severity,
    title,
    detail,
    remediation
  });
  const icons = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢', INFO: 'ℹ️' };
  console.log(`  ${icons[severity] || '⚪'} [${severity}] ${title}`);
}

async function request(endpoint, options = {}) {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: res.status, headers: res.headers, text, data };
  } catch (err) {
    return { error: err.message, status: 0 };
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(`🛡️  BẮT ĐẦU QUÉT BẢO MẬT TỰ ĐỘNG — TARGET: ${BASE_URL}`);
  console.log('======================================================\n');

  // 1. Kiểm tra Server Liveness
  const ping = await request('/test');
  if (ping.status !== 200) {
    console.error(`❌ Không thể kết nối tới ${BASE_URL}. Hãy đảm bảo server test đang chạy (npm run test:strix)`);
    process.exit(1);
  }
  console.log('✅ Server test phản hồi bình thường (status 200).\n');

  // --- TEST 1: Admin Routes Authentication Guard ---
  console.log('🔍 [1/7] Kiểm tra bảo vệ các Endpoint Admin (Auth Bypass)...');
  const adminEndpoints = [
    { method: 'GET', path: '/api/admin/rooms' },
    { method: 'POST', path: '/api/admin/rooms', body: JSON.stringify({ name: 'Hacked Room' }) },
    { method: 'DELETE', path: '/api/admin/rooms/999999' },
    { method: 'POST', path: '/api/admin/upload' },
    { method: 'GET', path: '/api/admin/sensors' },
    { method: 'GET', path: '/api/admin/minimap' },
    { method: 'GET', path: '/api/admin/buildings' },
    { method: 'GET', path: '/api/admin/tour-scenario' },
    { method: 'GET', path: '/api/admin/api-config' }
  ];

  for (const ep of adminEndpoints) {
    const res = await request(ep.path, { method: ep.method, body: ep.body });
    if (res.status === 200 || res.status === 201) {
      recordFinding(
        'CRITICAL',
        `Admin Endpoint không yêu cầu xác thực: [${ep.method}] ${ep.path}`,
        `Gửi request không kèm token hoặc cookie vt_token tới ${ep.path} nhưng nhận được status ${res.status}. Kẻ tấn công có thể xem hoặc chỉnh sửa dữ liệu quản trị.`,
        `Thêm middleware 'authenticateToken' và 'roleGuard(["admin"])' vào route '${ep.path}'.`
      );
    }
  }

  // --- TEST 2: CORS Configuration ---
  console.log('🔍 [2/7] Kiểm tra cấu hình CORS (Cross-Origin Resource Sharing)...');
  const corsTest = await request('/api/rooms', {
    headers: { 'Origin': 'http://malicious-attacker-domain.xyz' }
  });
  const allowOrigin = corsTest.headers ? corsTest.headers.get('access-control-allow-origin') : null;
  if (allowOrigin === '*' || allowOrigin === 'http://malicious-attacker-domain.xyz') {
    recordFinding(
      'HIGH',
      'CORS chấp nhận mọi nguồn gốc hoặc phản chiếu Origin bất hợp pháp',
      `Header Access-Control-Allow-Origin trả về: ${allowOrigin}`,
      `Giới hạn ALLOWED_ORIGINS trong CORS middleware, chỉ cho phép các domain tin cậy.`
    );
  } else {
    console.log('  ✅ CORS chặn các domain không xác định đúng cách.');
  }

  // --- TEST 3: HTTP Security Headers ---
  console.log('🔍 [3/7] Kiểm tra các Security Headers cần thiết...');
  const headRes = await request('/');
  const headers = headRes.headers;
  if (headers) {
    if (!headers.get('x-content-type-options')) {
      recordFinding(
        'LOW',
        'Thiếu header X-Content-Type-Options: nosniff',
        'Trình duyệt có thể đoán MIME-type dẫn đến tấn công MIME confusion.',
        'Sử dụng middleware helmet hoặc cấu hình app.use((req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); next(); });'
      );
    }
    if (!headers.get('x-frame-options') && !headers.get('content-security-policy')) {
      recordFinding(
        'MEDIUM',
        'Thiếu header chống Clickjacking (X-Frame-Options hoặc CSP frame-ancestors)',
        'Ứng dụng có thể bị nhúng vào iframe trên trang web của kẻ tấn công để lừa bấm (Clickjacking).',
        'Thêm header X-Frame-Options: SAMEORIGIN.'
      );
    }
    if (headers.get('x-powered-by')) {
      recordFinding(
        'LOW',
        `Lộ thông tin công nghệ qua header X-Powered-By: ${headers.get('x-powered-by')}`,
        'Kẻ tấn công có thể biết framework đang dùng để tìm lỗi đặc thù.',
        'Thêm app.disable("x-powered-by") trong server.js.'
      );
    }
  }

  // --- TEST 4: Sensitive Data & Error Stack Disclosure ---
  console.log('🔍 [4/7] Kiểm tra rò rỉ dữ liệu nhạy cảm & Stack Traces...');
  const errorRes = await request('/api/rooms/invalid-id-xyz-999999');
  if (errorRes.text && (errorRes.text.includes('node_modules') || errorRes.text.includes('Error:') || errorRes.text.includes('at '))) {
    recordFinding(
      'MEDIUM',
      'Lộ chi tiết Stack Trace lỗi nội bộ trong response',
      `Endpoint /api/rooms/invalid-id-xyz-999999 trả về stack trace hệ thống khi gặp lỗi.`,
      'Ẩn stack trace trong môi trường production (chỉ log vào file/console server, trả về message thân thiện cho client).'
    );
  }

  const roomRes = await request('/api/rooms');
  if (roomRes.text && (roomRes.text.includes('jwt_secret') || roomRes.text.includes('SUPABASE_KEY') || roomRes.text.includes('password'))) {
    recordFinding(
      'CRITICAL',
      'Lộ khóa bí mật hoặc mật khẩu trong response public /api/rooms',
      'Phát hiện thông tin bí mật xuất hiện trong chuỗi JSON trả về cho người dùng.',
      'Lọc bỏ các trường nhạy cảm trước khi trả về dữ liệu.'
    );
  }

  // --- TEST 5: Parameter Injection / Path Traversal ---
  console.log('🔍 [5/7] Kiểm tra Path Traversal và SQL / Malformed Payload...');
  const traversalRes = await request('/uploads/../../package.json');
  if (traversalRes.status === 200 && traversalRes.text && traversalRes.text.includes('"dependencies"')) {
    recordFinding(
      'CRITICAL',
      'Path Traversal đọc file tùy ý hệ thống qua static /uploads',
      'Gửi request /uploads/../../package.json đọc được file package.json của server.',
      'Sử dụng path.resolve và kiểm tra đường dẫn an toàn trước khi phục vụ file static.'
    );
  }

  const sqlPayloads = ["1' OR '1'='1", "1; DROP TABLE rooms;--", "admin'--"];
  for (const p of sqlPayloads) {
    const injRes = await request(`/api/rooms/${encodeURIComponent(p)}`);
    if (injRes.status === 500 && injRes.text && (injRes.text.includes('syntax error') || injRes.text.includes('SQL'))) {
      recordFinding(
        'HIGH',
        `SQL Error được kích hoạt khi truyền payload injection: ${p}`,
        'Server trả về lỗi cú pháp SQL hoặc database error khi gặp ký tự đặc biệt.',
        'Đảm bảo chuyển đổi id sang Number(id) hoặc sử dụng parameterized query.'
      );
      break;
    }
  }

  // --- TEST 6: Mail Endpoint Rate Limit / Abuse ---
  console.log('🔍 [6/7] Kiểm tra endpoint gửi Email (/api/send-mail)...');
  const mailRes = await request('/api/send-mail', {
    method: 'POST',
    body: JSON.stringify({
      recipient: 'attacker@evil.com',
      subject: 'Spam via your tour site',
      body: 'Spam test'
    })
  });
  if (mailRes.status === 200) {
    recordFinding(
      'MEDIUM',
      'Endpoint /api/send-mail mở cho gửi thư không xác thực hoặc thiếu captcha/rate-limit',
      'Bất kỳ client nào cũng có thể gọi POST /api/send-mail để gửi email.',
      'Thêm rate-limiting (express-rate-limit) và xác thực người gửi hoặc captcha để chống spam.'
    );
  }

  // --- TEST 7: Login Brute Force / Rate Limit Check ---
  console.log('🔍 [7/7] Kiểm tra chống Brute Force trang Đăng nhập (/api/auth/login)...');
  let rateLimited = false;
  for (let i = 0; i < 7; i++) {
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: `user_test_${i}`, password: 'wrong_password' })
    });
    if (loginRes.status === 429) {
      rateLimited = true;
      break;
    }
  }
  if (!rateLimited) {
    recordFinding(
      'MEDIUM',
      'Thiếu Rate Limiting (chặn dò mật khẩu Brute-force) tại /api/auth/login',
      'Đã gửi liên tiếp 7 lần đăng nhập sai nhưng không nhận được mã phản hồi 429 Too Many Requests.',
      'Sử dụng loginRateLimiter middleware trên route POST /api/auth/login.'
    );
  } else {
    console.log('  ✅ Hệ thống chặn Brute Force (status 429) hoạt động tốt.');
  }

  // TỔNG KẾT VÀ TẠO BÁO CÁO
  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT QUÉT BẢO MẬT: Phát hiện ${findings.length} vấn đề`);
  console.log('======================================================\n');

  generateMarkdownReport();
}

function generateMarkdownReport() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const high = findings.filter(f => f.severity === 'HIGH');
  const medium = findings.filter(f => f.severity === 'MEDIUM');
  const low = findings.filter(f => f.severity === 'LOW');

  const now = new Date().toLocaleString('vi-VN');

  let md = `# Báo Cáo Tổng Hợp Đánh Giá An Toàn & Bảo Mật (Security Audit Report)
> **Mục tiêu:** Hệ thống Virtual Tour 360 (Port ${TARGET_PORT})  
> **Thời gian quét:** ${now}  
> **Trạng thái:** **CHƯA CẦN SỬA NGAY - LƯU TRỮ ĐỂ XEM XÉT VÀ LÊN KẾ HOẠCH**  
> **Môi trường:** Test Sandbox Cô Lập (Dữ liệu thật an toàn 100%)

---

## 1. Tóm Tắt Số Lượng Vấn Đề

| Mức Độ | Số Lượng | Ưu Tiên | Hành Động Đề Xuất |
|---|---|---|---|
| 🔴 **CRITICAL** | ${critical.length} | Cực cao | Cần xử lý trước khi đưa lên môi trường chính thức |
| 🟠 **HIGH** | ${high.length} | Cao | Cần xem xét khắc phục trong tuần |
| 🟡 **MEDIUM** | ${medium.length} | Trung bình | Cải thiện chất lượng và phòng chống lạm dụng |
| 🟢 **LOW** | ${low.length} | Thấp | Tối ưu hóa cấu hình HTTP headers |

---

## 2. Chi Tiết Các Lỗ Hổng Phát Hiện Được

`;

  if (findings.length === 0) {
    md += `### ✅ Không phát hiện lỗ hổng nghiêm trọng!\nHệ thống được bảo vệ tốt ở các bài kiểm tra tự động.\n\n`;
  } else {
    findings.forEach((f, idx) => {
      const badge = f.severity === 'CRITICAL' ? '🔴 CRITICAL' : (f.severity === 'HIGH' ? '🟠 HIGH' : (f.severity === 'MEDIUM' ? '🟡 MEDIUM' : '🟢 LOW'));
      md += `### ${idx + 1}. [${badge}] ${f.title}\n\n`;
      md += `- **Mô tả chi tiết:** ${f.detail}\n`;
      md += `- **Giải pháp khắc phục đề xuất:** \`${f.remediation}\`\n`;
      md += `- **Trạng thái:** [ ] *Chưa sửa (Ghi nhận lại)*\n\n`;
    });
  }

  md += `---

## 3. Checklist Theo Dõi (Tùy chọn xử lý sau)
${findings.map((f, i) => `- [ ] **${f.severity}**: ${f.title}`).join('\n')}

---
*Báo cáo được tạo tự động bởi Security Scanner của Antigravity Agent.*
`;

  fs.writeFileSync(REPORT_FILE, md, 'utf-8');
  console.log(`📄 Đã tạo thành công file tổng hợp tại:`);
  console.log(`👉 ${REPORT_FILE}\n`);
}

runTests();

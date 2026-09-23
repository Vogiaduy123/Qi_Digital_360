# Báo cáo Bảo mật — Virtual Tour 360
> **Công cụ scan:** Strix AI Penetration Testing
> **Ngày scan:** 2026-09-23 15:10
> **Môi trường:** Sandbox test (port 5099, data giả)
> **Kết quả tổng quan:** **MEDIUM RISK**

---

## Tóm tắt

| Mức độ | Số lượng | Cần sửa ngay? |
|--------|----------|--------------|
| 🔴 CRITICAL | 0 | ✅ BẮT BUỘC ngay |
| 🟠 HIGH | 0 | ✅ Ưu tiên cao |
| 🟡 MEDIUM | 1 | ⚠️ Trong sprint tới |
| 🟢 LOW | 0 | 📝 Khi có thời gian |

---

## Chi tiết các lỗ hổng
### 🟡 MEDIUM

#### 1. tao bao cao bo qua lam sach

- **Mức độ:** MEDIUM
- **Ưu tiên sửa:** Sửa trong sprint tiếp theo
- **Trạng thái:** [ ] Chưa sửa
- **Ghi chú sửa:** _(điền sau khi fix)_


---

## Checklist Sửa lỗi

> Đánh dấu [x] khi đã fix và verify xong.
- [ ] 🟡 **[MEDIUM]** tao bao cao bo qua lam sach

---

## Hướng dẫn Sửa lỗi Thường gặp

### SQL / NoSQL Injection
`js
// SAI — truyền trực tiếp user input
db.query(SELECT * FROM rooms WHERE id = );

// ĐÚNG — parameterized query
db.query('SELECT * FROM rooms WHERE id = ', [Number(req.params.id)]);
`

### Missing Auth trên Admin Route
`js
// Đảm bảo tất cả /api/admin/* route đều có middleware
router.use(authMiddleware);
router.use(roleGuard(['admin']));
`

### File Upload Vulnerability
`js
// Kiểm tra MIME type thực sự (không chỉ extension)
const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
if (!allowedMimes.includes(file.mimetype)) {
  throw new Error('File type không được phép');
}
`

### Sensitive Data Exposure
- Không trả về password, jwt_secret, Supabase key trong API response
- Kiểm tra tất cả error handler không leak stack trace

---

## Lần scan tiếp theo

`powershell
# Reset sandbox và scan lại sau khi đã fix
npm run test:strix:reset
# Khởi động server test trong terminal 1
npm run test:strix
# Chạy Strix trong terminal 2
strix --target http://localhost:5099
# Tạo báo cáo mới
.\scripts\strix-finish.ps1 -SkipCleanup
`

---
*Report tự động tạo bởi scripts/strix-finish.ps1 — 2026-09-23 15:10*

# Design — Beamo Virtual Tour 360 & Admin Portal

Locked design system for Beamo Virtual Tour 360 (Client viewer & Admin management portal).
Every page and stylesheet references this document.
**Quy tắc đặc biệt theo yêu cầu người dùng:** Tuyệt đối giữ nguyên toàn bộ Icons (Bootstrap Icons, SVG inline, Favicon, Emoji nhãn và Logo) — không thay đổi mã HTML icon hay icon set.

---

## 1. Triết lý Thiết kế & Định hướng (Genre & Mood)

- **Client 360 Viewer (`src/`)**: **Atmospheric Spatial HUD** (Digital Twin Cockpit).
  - Không gian xem 360° panorama toàn màn hình (full-bleed immersive canvas).
  - Giao diện nổi (Floating HUD overlays, glassmorphic pills, clean cyber-spatial blur, radar cone, minimap gọn gàng).
  - Màu chủ đạo: Deep slate / Void (`#070d18`), cyan accent (`#38bdf8`), subtle border glow (`rgba(56, 189, 248, 0.25)`).
  - Chỉ số cảm biến IoT & HUD: Kiểu font mono kỹ thuật số kết hợp sans-serif hiện đại.

- **Admin Management Portal (`public/admin/` & `public/css/`)**: **Modern Precision Workbench / Studio Cockpit**.
  - Bố cục nhất quán, sạch sẽ, độ tương phản tiêu chuẩn WCAG AAA.
  - Header thanh điều hướng kính mờ (frosted glass) nổi nhẹ, menu tab sắc nét.
  - Các khối Card / Bento stats có border mảnh (hairline border 1px `rgba(226, 232, 240, 0.8)` hoặc dark/light hybrid), shadow mờ sang trọng, padding chuẩn 4-pt grid.
  - Form controls, tables, modals, badges, và switch toggles được tinh chỉnh đồng bộ, loại bỏ hoàn toàn các viền thô và font Arial cũ.

---

## 2. Design Tokens (Chuẩn CSS Variables)

```css
:root {
  /* Surface & Backgrounds */
  --bg-page: #f8fafc;
  --bg-surface: #ffffff;
  --bg-surface-elevated: #ffffff;
  --bg-surface-subtle: #f1f5f9;
  --bg-dark-glass: rgba(10, 16, 30, 0.88);
  --bg-light-glass: rgba(255, 255, 255, 0.85);

  /* Borders & Rules */
  --border-subtle: rgba(226, 232, 240, 0.8);
  --border-default: #e2e8f0;
  --border-focus: #38bdf8;
  --border-dark-hud: rgba(56, 189, 248, 0.25);

  /* Primary Brand & Accents */
  --brand-primary: #0284c7;           /* Sky 600 */
  --brand-primary-hover: #0369a1;     /* Sky 700 */
  --brand-accent: #38bdf8;            /* Sky 400 (Cyber Cyan) */
  --brand-accent-glow: rgba(56, 189, 248, 0.35);

  /* Status Colors */
  --status-success: #10b981;
  --status-warning: #f59e0b;
  --status-danger: #f43f5e;
  --status-info: #0ea5e9;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Text Colors */
  --text-main: #0f172a;               /* Slate 900 */
  --text-muted: #64748b;              /* Slate 500 */
  --text-light: #f8fafc;
  --text-light-muted: #94a3b8;

  /* Spacing Scale (4-pt grid) */
  --space-2xs: 4px;
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;

  /* Border Radii */
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 12px 32px -4px rgba(0, 0, 0, 0.1), 0 4px 12px -2px rgba(0, 0, 0, 0.05);
  --shadow-hud: 0 8px 32px 0 rgba(0, 0, 0, 0.45), 0 0 16px 0 rgba(56, 189, 248, 0.15);

  /* Transitions */
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --transition-fast: 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  --transition-base: 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 3. Quy tắc Icons & Assets (Tuân thủ nghiêm ngặt yêu cầu người dùng)

- **Bảo toàn 100% Icon hiện tại**:
  - Không thay đổi các thẻ `<i class="bi bi-..."></i>` (Bootstrap Icons).
  - Không xóa hay thay đổi các SVG inline trong `index.html`, `admin-nav.js` hay `style.css`.
  - Giữ nguyên các Emoji nhãn chức năng (`🏢 Tòa nhà`, `📤 Upload`, `🏠 Phòng`, `🗺️ Minimap`, `⚡ Kịch bản`, v.v.).
  - Giữ nguyên icon pano hotspot (`hotspot.png`, `target`, `mail-icon`, `sensor icon`).
  - Giữ nguyên logo thương hiệu `logo-qi.png`.
- **Nâng cấp bằng CSS xung quanh Icon**:
  - Tinh chỉnh icon container (kích thước, căn giữa flexbox, padding, hiệu ứng hover glow, màu sắc hài hòa với token).

---

## 4. Danh sách các màn hình triển khai

1. **Client 360 Virtual Tour** (`src/style.css`, `src/index.html`):
   - Chuẩn hóa typography (Inter / Google Fonts), loại bỏ các đoạn CSS Arial thô.
   - Hoàn thiện giao diện HUD: Toolbar đáy, bảng điều khiển góc, Minimap panel, popup chi tiết Media/Hotspot, Modal IoT sensor.
2. **Shared Admin Header & Navigation** (`public/css/admin-header.css`, `public/js/admin-nav.js`):
   - Header kính mờ cao cấp, brand logo sắc nét, tab điều hướng có pill indicator sang trọng.
   - Hỗ trợ responsive mobile hoàn hảo, drawer menu thanh thoát.
3. **Admin Dashboard Overview** (`public/css/admin-dashboard.css`, `public/admin/index.html`):
   - Bento metrics cards hiển thị dữ liệu phòng, tòa nhà, sensor với hiệu ứng hover nâng card.
   - Bảng quick actions và danh sách phòng gần đây hiện đại, rõ ràng.
4. **Admin Room & Hotspot Editor** (`public/css/admin-rooms.css`, `public/admin/rooms.html`):
   - Sidebar phòng và floor tabs dạng chip bo tròn mượt mà.
   - Thanh công cụ Pannellum và modal thêm/sửa hotspot (Navigation, Media, Sensor) thiết kế theo chuẩn studio workbench.
5. **Shared Admin Theme cho các trang còn lại** (`public/css/admin-theme.css`):
   - Áp dụng token đồng bộ cho `upload.html`, `minimap.html`, `tour.html`, `buildings.html`, `users.html`, `stall-templates.html`, `api-config.html`, `login.html`.
   - Chuẩn hóa input, select, textarea, button, data-table, alert banner và modal dialog.

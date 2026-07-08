# AGENTS.md — Beamo Virtual Tour 360

> **Tài liệu định hướng Agent** cho dự án `virtual-tour-Qi`.
> Antigravity phải đọc toàn bộ file này trước khi thực hiện bất kỳ thay đổi nào.

---

## 1. Tổng quan Dự án

**Beamo Virtual Tour 360** là ứng dụng web xem không gian panorama 360°, quản lý hotspot, minimap, tour tự động, cảm biến IoT, và camera RTSP realtime qua WebRTC.

| Mục | Chi tiết |
|---|---|
| **Runtime** | Node.js 20 LTS (tối thiểu 18+) |
| **Backend** | Express 5, CommonJS (`require`) |
| **Frontend** | Vanilla JavaScript ES Module, Vite 8 |
| **Panorama Renderer** | Marzipano 0.10.2 (CDN, global `window.Marzipano`) |
| **3D Models** | `<model-viewer>` 3.4.0 (Google, CDN) |
| **Image Processing** | `sharp` (tile pyramid generation) |
| **Email** | Nodemailer + HTTP API (Resend / Brevo / SendGrid) |
| **Real-time** | Server-Sent Events (SSE) tại `/events` |
| **WebRTC** | MediaMTX gateway (WHEP protocol) |
| **Deploy** | Netlify (frontend static) + Render (backend API) |

---

## 2. Cấu trúc Thư mục

```
virtual-tour-Qi/
├── server.js              # Entry point backend (1229 dòng), Express app + tất cả route user-facing
├── generate-tiles.js      # Tile pyramid generator dùng sharp
├── vite.config.js         # Vite config: root=src, publicDir=../public, proxy /api -> :3000
├── package.json           # type: "commonjs", main: server.js
├── mediamtx.yml           # Cấu hình MediaMTX WebRTC gateway
├── start-webrtc-gateway.ps1
│
├── src/                   # Vite root — frontend source
│   ├── index.html         # Màn hình user (entry point Vite)
│   ├── main.js            # App bootstrap, switchRoom, addHotspots, SSE listener
│   ├── style.css          # 43KB — toàn bộ CSS của user view
│   ├── core/
│   │   ├── api.js         # fetchRooms(), fetchMinimap(), fetchSensors()
│   │   ├── scenes.js      # Marzipano scene registry (getScenes, getRoomsData, initRooms)
│   │   ├── utils.js       # degToRad, radToDeg, parseJsonResponse
│   │   └── viewer.js      # Marzipano Viewer singleton, FOV zoom, animation
│   └── features/
│       ├── autotour.js    # Auto-tour engine (pause/resume/stop, scenario loader)
│       ├── compass.js     # Canvas compass overlay
│       ├── mail.js        # Mail hotspot drag-drop, composer panel, SSE-driven
│       ├── media-overlay.js # Media hotspot overlay (image/pdf/video/3d/gallery/youtube/web/note)
│       ├── minimap.js     # Minimap (multi-floor, zoom/pan, radar cone)
│       └── sensors.js     # Sensor hotspot, camera modal (WebRTC/WHEP), real-time polling
│
├── backend/
│   ├── admin-api.js       # Admin Router (1223 dòng) — mount tại /api/admin/*
│   ├── hls/               # HLS streaming (nếu có)
│   └── tiles/             # Tile pyramid output (được serve static)
│
├── public/                # Static files (không qua Vite build)
│   ├── admin.html         # Admin dashboard redirect shell
│   ├── admin/             # Các trang admin (static HTML + vanilla JS)
│   │   ├── index.html     # Admin home
│   │   ├── upload.html    # Upload panorama + generate tiles
│   │   ├── rooms.html     # Quản lý phòng, hotspot, media hotspot
│   │   ├── minimap.html   # Chỉnh minimap (multi-floor)
│   │   ├── tour.html      # Kịch bản auto-tour
│   │   ├── buildings.html # Quản lý phân khu (buildings)
│   │   ├── api-config.html# Cấu hình API thời tiết / không khí
│   │   └── drag.html      # Kéo thả mail hotspot trên ảnh
│   ├── js/
│   │   ├── admin-runtime-config.js  # window.ADMIN_API_BASE_URL (override khi deploy split)
│   │   └── admin-api-base.js        # window.getAdminApiBase()
│   ├── css/               # CSS admin
│   └── images/            # Static images
│
└── data/                  # JSON persistence (KHÔNG commit nhạy cảm)
    ├── rooms.json          # Danh sách phòng + hotspots + mediaHotspots + mailHotspots
    ├── minimap.json        # Multi-floor minimap config
    ├── buildings.json      # Danh sách phân khu
    ├── sensors.json        # Cấu hình sensor IoT
    ├── tour-scenario.json  # Kịch bản auto-tour
    ├── api-config.json     # Weather / Air quality API keys
    └── room-api-configs/   # Per-room sensor API config (JSON files)
```

---

## 3. Kiến trúc & Luồng Dữ liệu

### 3.1 Frontend Module Pattern

Mỗi feature trong `src/features/` và `src/core/` dùng **Dependency Injection qua closure**:

```js
// Pattern chuẩn — PHẢI giữ nguyên khi thêm feature mới
let env = {
  getCurrentRoomId: () => null,
  getRoomsData: () => ({})
};

export function initXxx(dependencies) {
  env = { ...env, ...dependencies };
}
```

`main.js` gọi `initXxx({ ... })` trong `initApp()` và truyền các getter function — **không truyền giá trị trực tiếp** để tránh stale closure.

### 3.2 Marzipano — Quy tắc bắt buộc

- `Marzipano` là **global CDN**, không có `import`. Dùng `window.Marzipano` hoặc trực tiếp `Marzipano`.
- **Tọa độ hotspot**: yaw/pitch lưu trong data là **degrees**. Khi truyền vào Marzipano phải convert: `yaw = degToRad(hs.yaw)`, `pitch = degToRad(-hs.pitch)` (pitch đảo dấu!).
- **Scene registry**: `scenes[roomId]` — tạo 1 lần, tái dùng khi switch room.
- **Tile path pattern**: `basePath + "/{z}/{y}/{x}.jpg"` — z là level (1-based), y là row, x là col.
- **FOV constants**: `MIN_FOV = 45 deg` (PI/4), `MAX_FOV = 85 deg` (~1.48 rad). Không thay đổi.

### 3.3 SSE Real-time

```
Client                Server
  |--- GET /events ------->|
  |<-- event: rooms --------|  (initial snapshot + khi admin thay đổi)
  |<-- event: sensors ------|  (initial snapshot + khi sensor update)
```

- Server dùng `sseClients` (Set) — **không dùng `res.end()`** khi broadcast, client vẫn giữ kết nối.
- Frontend lắng nghe trong `main.js` và gọi `initRooms()`, `addSensorHotspots()` khi nhận event.

### 3.4 Tile Pyramid

`generate-tiles.js` dùng `sharp` để cắt ảnh panorama thành multi-level equirectangular tile pyramid:
- Level 1: 1024px width → tiles 512x512
- Level N: 2x width của level trước → tiếp tục đến native width
- Output: `backend/tiles/<tên phòng>/<roomId>/<level>/<row>/<col>.jpg`

---

## 4. Data Schema

### 4.1 Room Object (`data/rooms.json`)

```json
{
  "id": 1769668397635,
  "name": "Tên phòng",
  "image": "/uploads/..../panorama.jpg",
  "tilesPath": "tiles/..../roomId",
  "tilesConfig": { "levels": [{ "width": 1024 }, { "width": 2048 }] },
  "floor": 1,
  "buildingId": "building-uuid",
  "hotspots": [
    { "yaw": -122.6, "pitch": -3.89, "target": 1769668421984, "rotation": 0, "color": "#ff0000", "iconUrl": "" }
  ],
  "mediaHotspots": [
    {
      "yaw": 162.65, "pitch": -1.26,
      "title": "Tiêu đề", "description": "Mô tả",
      "mediaUrl": "/uploads/media/...",
      "mediaType": "note|image|pdf|video|3d|gallery|youtube|web",
      "highlightPolygon": [[-69.69, 10.56], [-61.03, 11.2], [-61.1, -5.47], [-69.7, -5.38]]
    }
  ],
  "mailHotspots": [
    {
      "yaw": 45.0, "pitch": 0.0,
      "screenX": 0.5, "screenY": 0.5,
      "title": "Hỗ trợ",
      "recipient": "support@example.com",
      "subject": "...", "body": "...",
      "updatedAt": "ISO8601"
    }
  ]
}
```

**Lưu ý quan trọng**:
- `id` là **timestamp milliseconds** (`Date.now()`), kiểu Number, **không phải UUID**.
- `tilesPath` không có dấu `/` đầu — khi serve phải prefix `/backend/`.
- `highlightPolygon` là mảng `[yaw_deg, pitch_deg]` — **không đảo dấu pitch ở đây**, chỉ đảo khi truyền vào Marzipano.

### 4.2 Sensor Object (`data/sensors.json`)

```json
[{
  "id": "sensor-uuid",
  "name": "Tên sensor",
  "roomId": 1769668397635,
  "type": "environment|camera",
  "position": { "yaw": 45.0, "pitch": 0.0 },
  "temperature": { "value": 25.5, "min": 18, "max": 30, "unit": "°C" },
  "humidity": { "value": 60, "min": 40, "max": 80, "unit": "%" },
  "smoke": { "value": 0 },
  "co2": { "value": 800, "unit": "ppm" },
  "pm25": { "value": 12, "unit": "µg/m³" },
  "camera": { "type": "webrtc", "whepUrl": "http://127.0.0.1:8889/cam101/whep" }
}]
```

### 4.3 Minimap (`data/minimap.json`)

```json
{
  "floors": [
    {
      "id": 1, "name": "Tầng 1",
      "image": "/uploads/minimap_floor1.jpg",
      "markers": [
        { "roomId": 1769668397635, "x": 0.45, "y": 0.30 }
      ]
    }
  ]
}
```

`x`, `y` là tọa độ **tương đối** (0.0 – 1.0) trên ảnh minimap.

---

## 5. API Endpoints

### Public (user-facing) — `server.js`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/rooms` | Lấy danh sách phòng (rooms.json) |
| GET | `/api/sensors` | Lấy danh sách sensor |
| GET | `/events` | SSE stream (rooms + sensors events) |
| GET | `/api/sensors/data` | Lấy dữ liệu sensor realtime từ API ngoài |
| PUT | `/api/rooms/:id/hotspots` | Thêm navigation hotspot |
| PATCH | `/api/rooms/:id/hotspots/:index` | Sửa hotspot |
| DELETE | `/api/rooms/:id/hotspots/:index` | Xóa hotspot |
| POST | `/api/rooms/:id/mail-hotspots` | Thêm mail hotspot |
| PATCH | `/api/rooms/:id/mail-hotspots/:index` | Sửa mail hotspot |
| DELETE | `/api/rooms/:id/mail-hotspots/:index` | Xóa mail hotspot |
| POST | `/api/send-mail` | Gửi email (Resend/Brevo/SendGrid/SMTP) |

### Admin — `backend/admin-api.js` (mount tại `/api/admin/`)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/admin/rooms` | Lấy rooms (admin view) |
| POST | `/api/admin/rooms` | Tạo phòng mới |
| DELETE | `/api/admin/rooms/:id` | Xóa phòng + tiles |
| PATCH | `/api/admin/rooms/:id` | Cập nhật thông tin phòng |
| POST | `/api/admin/upload` | Upload panorama + generate tiles |
| GET/POST | `/api/admin/minimap` | Lấy/lưu minimap config |
| GET/POST | `/api/admin/buildings` | Quản lý buildings |
| GET/POST | `/api/admin/sensors` | Quản lý sensors |
| GET/POST | `/api/admin/tour-scenario` | Kịch bản auto-tour |
| GET/POST | `/api/admin/api-config` | Weather/Air quality API config |
| POST | `/api/admin/rooms/:id/media-hotspots` | Thêm media hotspot |
| DELETE | `/api/admin/rooms/:id/media-hotspots/:index` | Xóa media hotspot |

**Tất cả response thành công trả về**: `{ success: true, ... }`
**Lỗi trả về**: `{ success: false, error: "message" }` với HTTP status code phù hợp.

---

## 6. Quy tắc Code — BẮT BUỘC

### 6.1 JavaScript

```js
// ĐÚNG — Backend dùng CommonJS
const express = require('express');
const { generateCubeTiles } = require('../generate-tiles');

// ĐÚNG — Frontend dùng ES Module
import { degToRad } from './core/utils.js';
import { fetchRooms } from './core/api.js';

// SAI — Không trộn lẫn
import express from 'express'; // Sai trong backend (package.json type:commonjs)
```

### 6.2 Viết thêm feature mới trong `src/features/`

1. **Tạo file** `src/features/<feature>.js`
2. **Export** `init<Feature>(dependencies)` + các public function cần thiết
3. **Đăng ký dependencies** trong `main.js` `initApp()` — theo thứ tự: init trước, fetch rooms sau
4. **Không import** trực tiếp `currentRoomId` từ module khác — luôn dùng `env.getCurrentRoomId()`
5. **DOM element**: Khai báo trong `init<Feature>()`, không ở module scope (tránh null khi load sớm)

### 6.3 Viết thêm API route

- **User-facing route** (không cần auth): Thêm vào `server.js`
- **Admin route**: Thêm vào `backend/admin-api.js` router, prefix tự động thêm `/api/admin`
- Luôn gọi `broadcastRooms()` hoặc `broadcastSensors()` sau khi thay đổi dữ liệu
- Đọc file JSON bằng `fs.readFileSync` (sync là bình thường ở đây, không dùng async FS)
- Ghi file JSON: `fs.writeFileSync(FILE, JSON.stringify(data, null, 2))`

### 6.4 CSS

- User view: sửa `src/style.css` (43KB, được Vite bundle)
- Admin view: sửa `public/css/*.css` (static, không qua Vite)
- **Không dùng Tailwind**. Vanilla CSS với class naming dạng BEM-like (ví dụ `camera-modal-content`)
- Media queries breakpoint: `max-width: 500px` và `max-height: 500px` cho mobile

### 6.5 HTML Admin Pages

- Admin pages là **static HTML** trong `public/admin/` — dùng `<script>` vanilla
- Gọi API qua `window.getAdminApiBase()` (từ `public/js/admin-api-base.js`)
- Không dùng framework, không dùng `import` trong admin pages

---

## 7. Các Gotcha & Lỗi Thường Gặp

### 7.1 Pitch đảo dấu

```js
// LUÔN đảo dấu pitch khi truyền vào Marzipano
container.createHotspot(el, {
  yaw: degToRad(hs.yaw),
  pitch: degToRad(-hs.pitch)  // DAU TRU, không bỏ
});
```

### 7.2 Room ID là Number, không phải String

```js
// ĐÚNG
const room = rooms.find(r => r.id === Number(req.params.id));

// SAI — sẽ luôn undefined
const room = rooms.find(r => r.id === req.params.id);
```

### 7.3 tilesPath prefix

```js
// tilesPath trong rooms.json không có dấu / đầu
// scenes.js tự prefix khi cần
if (!basePath.startsWith('/') && !basePath.startsWith('http')) {
  basePath = '/backend/' + basePath;
}
```

### 7.4 sharp trên Windows

- Yêu cầu **Microsoft Visual C++ Build Tools** (MSVC)
- Nếu `npm install` lỗi với sharp: `npm cache clean --force` rồi cài lại
- Không thêm `sharp` vào devDependencies — nó là runtime dependency

### 7.5 Không có Test Framework

- `npm test` hiện tại là placeholder (`exit 1`)
- Khi thêm test: dùng **Vitest** (tương thích Vite đang dùng)
- Chưa có test → **verify thủ công** trước khi báo xong bằng cách khởi động server và kiểm tra UI

### 7.6 SSE & Express 5

- Express 5 đã `async/await` tự động catch error, nhưng SSE handler không dùng async
- `res.flushHeaders?.()` — optional call vì Express 5 có thể đã flush
- Khi client disconnect, xóa khỏi `sseClients`: `req.on('close', () => sseClients.delete(res))`

### 7.7 Upload Directory Resolution

Server tự resolve thư mục upload theo thứ tự ưu tiên:
1. `UPLOAD_DIR` env var (nếu writable)
2. `uploads/` local
3. `os.tmpdir()/virtual-tour-uploads` (fallback)

Khi thêm file upload mới, dùng `UPLOADS_DIR` constant, **không hardcode path**.

---

## 8. Scripts & Commands

```bash
# Development (Vite + Node đồng thời)
npm run dev

# Production (chỉ Node, phục vụ dist/)
npm start

# Build frontend
npm run build:ui  # hoặc npm run build

# Test server
curl http://localhost:3000/test  # → "SERVER OK"

# Khởi động WebRTC Gateway (PowerShell)
./start-webrtc-gateway.ps1
```

### Quy trình chuẩn khi phát triển local:

```
1. npm run dev
   → Vite chạy tại :5173 (hot reload)
   → Express chạy tại :3000
   → Vite proxy /api, /events, /uploads → :3000

2. Truy cập:
   - User view: http://localhost:5173/
   - Admin:     http://localhost:3000/admin.html
```

---

## 9. Deploy Architecture

```
[Netlify (static)] --→ [Render (backend)]
public/ dir              server.js :PORT
ADMIN_API_BASE_URL        data/ + tiles/
                          UPLOAD_DIR env
                         (Render Persistent Disk)
                          /var/data/uploads
```

- Khi deploy split, `public/js/admin-runtime-config.js` cần set `window.ADMIN_API_BASE_URL`
- Frontend (dist/) cũng được serve bởi Express khi deploy monolith (Render)
- File `netlify.toml`: publish directory là `public`
- File `render.yaml`: chạy `npm start` (không build UI — admin dùng public/)

---

## 10. Tool Translation (Antigravity)

| Skill Reference | Antigravity Tool |
|---|---|
| `Task` (browser) | `browser_subagent` |
| `Task` (coding) | Sequential tool calls |
| `TodoWrite` | Update `docs/plans/task.md` |
| File read | `view_file` |
| File write | `write_to_file`, `replace_file_content`, `multi_replace_file_content` |
| List dir | `list_dir` |
| Search code | `grep_search` |
| Shell | `run_command` |
| Web search | `search_web` |
| Web fetch | `read_url_content` |

---

## 11. Skill Loading Order

Khi bắt đầu task, load skill theo thứ tự ưu tiên:

1. **`brainstorming`** → trước khi làm bất kỳ feature mới nào
2. **`writing-plans`** → khi task có nhiều bước hoặc chạm nhiều file
3. **`executing-plans`** → khi đã có plan, execute từng bước
4. **`systematic-debugging`** → khi gặp bug bất kỳ, trước khi đề xuất fix
5. **`verification-before-completion`** → trước khi báo xong
6. **`requesting-code-review`** → trước khi deploy hoặc commit major change

---

## 12. Quy tắc Verification Bắt Buộc

Trước khi báo bất kỳ task nào là **DONE**:

```powershell
# 1. Kiểm tra server khởi động không lỗi
node server.js  # Phải thấy "Server running on port X"

# 2. Kiểm tra API endpoint liên quan
curl http://localhost:3000/test
curl http://localhost:3000/api/rooms

# 3. Nếu thay đổi frontend — build và kiểm tra
npm run build:ui
# Kiểm tra dist/ có index.html không

# 4. Kiểm tra không có syntax error
node --check server.js
node --check backend/admin-api.js
```

Không báo "xong" nếu chưa chạy ít nhất bước 1 và bước liên quan.

---

## 13. Quy tắc Không được vi phạm

1. **KHÔNG** thay đổi room `id` generation — luôn dùng `Date.now()`
2. **KHÔNG** dùng `async` cho FS operations trong server.js — đã thiết kế sync
3. **KHÔNG** thêm dependency mới vào `devDependencies` nếu cần ở runtime
4. **KHÔNG** commit file `.env` vào git (đã có `.gitignore`)
5. **KHÔNG** hardcode `localhost:3000` trong frontend — dùng `/api/...` path (proxy handle)
6. **KHÔNG** thay đổi cấu trúc tile output (`{z}/{y}/{x}.jpg`) — Marzipano đã config cứng
7. **KHÔNG** thêm framework (React, Vue, Angular) vào frontend — dự án dùng Vanilla JS chủ đích
8. **KHÔNG** dùng `import` trong admin HTML pages — chỉ dùng `<script>` vanilla

---

## 14. Checklist Khi Thêm Feature Mới

```
[ ] Đọc AGENTS.md phần liên quan (schema, API, gotcha)
[ ] Chạy skill brainstorming nếu feature phức tạp
[ ] Viết plan vào docs/plans/task.md
[ ] Tạo/sửa file trong đúng layer (core/ vs features/ vs backend/)
[ ] Áp dụng DI pattern cho module mới
[ ] Đăng ký init trong main.js theo đúng thứ tự
[ ] Thêm route vào đúng file (server.js hoặc admin-api.js)
[ ] Gọi broadcastRooms()/broadcastSensors() nếu thay đổi data
[ ] Kiểm tra pitch sign convention (degToRad(-hs.pitch))
[ ] Verify: node --check + curl /test + browser smoke test
[ ] Cập nhật docs/plans/task.md với kết quả
```

---

*Cập nhật lần cuối: 2026-06-29. Phiên bản dự án: virtual-tour-Qi v1.0*

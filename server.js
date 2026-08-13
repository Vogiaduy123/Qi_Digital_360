require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const mailHelper = require("./backend/mail-helper");
const cookieParser = require("cookie-parser");
const db = require("./backend/db");
const { authMiddleware, requireRole, hashPassword, comparePassword, signToken, verifyToken } = require("./backend/auth");
const { getNotifications, createNotification } = require("./backend/notifications");

// Import admin routes
const adminRoutes = require("./backend/admin-api");

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_UPLOADS_DIR = path.join(__dirname, "uploads");
const RAW_UPLOAD_DIR = String(process.env.UPLOAD_DIR || "").trim();
const ENV_UPLOADS_DIR = RAW_UPLOAD_DIR
  ? (path.isAbsolute(RAW_UPLOAD_DIR) ? RAW_UPLOAD_DIR : path.resolve(__dirname, RAW_UPLOAD_DIR))
  : "";
const LEGACY_UPLOADS_DIR = path.join(__dirname, "uploads");

function canUseDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveUploadsDir() {
  const candidates = [
    ENV_UPLOADS_DIR,
    DEFAULT_UPLOADS_DIR,
    path.join(os.tmpdir(), "virtual-tour-uploads")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canUseDirectory(candidate)) {
      if (candidate !== ENV_UPLOADS_DIR && ENV_UPLOADS_DIR) {
        console.warn(`[UPLOAD_DIR] Cannot write to ${ENV_UPLOADS_DIR}. Fallback to ${candidate}`);
      }
      return candidate;
    }
  }

  throw new Error("No writable uploads directory found. Please set UPLOAD_DIR to a writable path.");
}

const UPLOADS_DIR = resolveUploadsDir();

/* ===== DATA FILES ===== */
const ROOM_API_CONFIGS_DIR = path.join(__dirname, "data", "room-api-configs");

// Create room-api-configs directory if not exists
if (!fs.existsSync(ROOM_API_CONFIGS_DIR)) {
  fs.mkdirSync(ROOM_API_CONFIGS_DIR, { recursive: true });
}

/* ===== SSE CLIENTS ===== */
const sseClients = new Set();

/* ===== SENSOR LAST STATE CACHE ===== */
const sensorLastStateCache = new Map();

// Phát dữ liệu thông báo mới cho các client SSE đang kết nối.
async function broadcastNotifications() {
  try {
    const payload = JSON.stringify(await getNotifications());
    const message = `event: notifications\ndata: ${payload}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(message);
      } catch {
        sseClients.delete(res);
      }
    }
  } catch (err) {
    console.error('Error broadcasting notifications:', err);
  }
}
global.broadcastNotifications = broadcastNotifications;

// Che giấu email người nhận để tránh lộ thông tin cá nhân
function obfuscateEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***.***';
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local.substring(0, 2)}***${local.slice(-1)}@${domain}`;
}

// Đọc danh sách phòng từ Supabase DB (async wrapper).
async function getRooms() {
  try {
    return await db.getRooms();
  } catch {
    return [];
  }
}

// Đọc cấu hình minimap hiện tại từ Supabase.
async function getMinimap() {
  try {
    return await db.getMinimap();
  } catch {
    return { image: "", markers: [] };
  }
}

// Đọc danh sách sensor từ Supabase.
async function getSensors() {
  try {
    return await db.getSensors();
  } catch {
    return [];
  }
}

// Trả về cấu hình API mặc định dùng khi chưa có file cấu hình.
function getDefaultApiConfig() {
  return {
    weatherApi: {
      provider: "openweathermap",
      url: "https://api.openweathermap.org/data/2.5/weather",
      apiKey: "",
      params: { lat: 10.7769, lon: 106.7009, units: "metric" }
    },
    airQualityApi: {
      provider: "waqi",
      url: "https://api.waqi.info/feed/@13659/",
      token: ""
    },
    refreshInterval: 10000,
    autoRefresh: true
  };
}

// Lấy cấu hình API từ Supabase, fallback về mặc định nếu lỗi.
async function getApiConfig() {
  try {
    const config = await db.getAppConfig('api_config');
    return config || getDefaultApiConfig();
  } catch {
    return getDefaultApiConfig();
  }
}

// Lưu cấu hình API tổng vào Supabase.
async function saveApiConfig(config) {
  await db.saveAppConfig('api_config', config);
}

// Phát dữ liệu sensor mới cho các client SSE đang kết nối.
async function broadcastSensors() {
  const payload = JSON.stringify(await getSensors());
  const message = `event: sensors\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(message);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Phát dữ liệu phòng mới cho các client SSE đang kết nối.
async function broadcastRooms() {
  const payload = JSON.stringify(await getRooms());
  const message = `event: rooms\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(message);
    } catch {
      // Remove broken clients
      sseClients.delete(res);
    }
  }
}
global.broadcastRooms = broadcastRooms;

// Phát cấu hình custom icons mới cho các client SSE đang kết nối.
async function broadcastCustomIcons(config) {
  const payload = JSON.stringify(config || await getCustomIcons());
  const message = `event: custom_icons\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(message);
    } catch {
      sseClients.delete(res);
    }
  }
}


// Escape HTML Ä‘á»ƒ trĂ¡nh lá»—i hiá»ƒn thá»‹ vĂ  chĂ¨n mĂ£ Ä‘á»™c trong email.
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Dựng nội dung email (HTML + plain text) cho ghi chú virtual tour.
function buildVirtualTourMailContent({ pageUrl, summary, notes }) {
  const safeSummary = summary && String(summary).trim() ? String(summary).trim() : "(Không có)";
  const safePageUrl = pageUrl && String(pageUrl).trim() ? String(pageUrl).trim() : "";
  const safeNotes = Array.isArray(notes) ? notes : [];

  const formatCoord = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(6) : "N/A";
  };

  const notesHtml = safeNotes.length
    ? safeNotes
      .map((note) => {
          const roomName = escapeHtml(note?.roomName || "Không xác định");
          const content = escapeHtml(note?.content || "");
          const yaw = escapeHtml(formatCoord(note?.yaw));
          const pitch = escapeHtml(formatCoord(note?.pitch));
          const time = escapeHtml(note?.time || new Date().toISOString());

          return `
            <li style="margin-bottom: 10px;">
              <div><strong>Phòng:</strong> ${roomName}</div>
              <div><strong>Nội dung:</strong> ${content || "(Trống)"}</div>
              <div><strong>Tọa độ:</strong> yaw=${yaw}, pitch=${pitch}</div>
              <div><strong>Thời gian:</strong> ${time}</div>
            </li>
          `;
        })
        .join("")
    : '<li>Không có ghi chú.</li>';

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.5;">
      <h2 style="margin-bottom: 18px;">GHI CHÚ TỪ VIRTUAL TOUR</h2>
      ${safePageUrl ? `<p><strong>Trang:</strong> <a href="${escapeHtml(safePageUrl)}">${escapeHtml(safePageUrl)}</a></p>` : ""}
      <p><strong>Nội dung tổng quát:</strong><br>${escapeHtml(safeSummary)}</p>
      <div style="margin-top: 12px;"><strong>Danh sách ghi chú:</strong></div>
      <ol style="padding-left: 18px; margin-top: 8px;">${notesHtml}</ol>
    </div>
  `;

  const notesText = safeNotes.length
    ? safeNotes
        .map((note, index) => {
          const roomName = note?.roomName || "Không xác định";
          const content = note?.content || "(Trống)";
          const yaw = formatCoord(note?.yaw);
          const pitch = formatCoord(note?.pitch);
          const time = note?.time || new Date().toISOString();
          return `${index + 1}. Phòng: ${roomName}\n   Nội dung: ${content}\n   -Tọa độ: yaw=${yaw}, pitch=${pitch}\n   -Thời gian: ${time}`;
        })
        .join("\n\n")
    : "1. Không có ghi chú.";

  const text = `GHI CHÚ TỪ VIRTUAL TOUR\n\n${safePageUrl ? `Trang: ${safePageUrl}\n\n` : ""}Nội dung tổng quát:\n${safeSummary}\n\nDanh sách ghi chú:\n${notesText}`;

  return { html, text };
}

// Gửi email qua SMTP hoặc HTTP API (Ủy quyền cho mail-helper)
async function sendMailMessage({ to, subject, body, html, pageUrl, summary, notes }) {
  let finalHtml = html;
  let finalText = body;

  if (!finalHtml && Array.isArray(notes) && notes.length > 0) {
    const built = buildVirtualTourMailContent({ pageUrl, summary: summary || body, notes });
    finalHtml = built.html;
    finalText = built.text;
  } else if (!finalHtml) {
    const safeSubject = escapeHtml(subject || "Thông báo từ Virtual Tour");
    const safeBody = escapeHtml(body || "").replace(/\n/g, "<br>");
    finalHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; color: #333333; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #4f46e5; margin-top: 0; margin-bottom: 16px;">${safeSubject}</h2>
        <div style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">${safeBody}</div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">Qi Technologies · Virtual Tour Manager</p>
      </div>
    `;
  }

  return await mailHelper.sendMailRaw({
    to,
    subject: subject || "Thông báo từ Virtual Tour",
    text: finalText || body,
    html: finalHtml
  });
}

/* ===== MIDDLEWARE ===== */
app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.static("dist"));
app.use("/uploads", express.static(UPLOADS_DIR));
if (path.resolve(LEGACY_UPLOADS_DIR) !== path.resolve(UPLOADS_DIR)) {
  // Backward-compatibility: keep serving old files previously saved in local uploads.
  app.use("/uploads", express.static(LEGACY_UPLOADS_DIR));
}
app.use("/backend/tiles", express.static("backend/tiles"));

/* ===== EMAIL ENDPOINTS ===== */
app.post(["/api/mail/send", "/api/send-mail"], async (req, res) => {
  try {
    const { to, subject, body, html, pageUrl, summary, notes } = req.body;
    const recipient = to || process.env.SMTP_USER;

    if (!recipient) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập địa chỉ email người nhận." });
    }

    const result = await sendMailMessage({
      to: recipient,
      subject,
      body,
      html,
      pageUrl,
      summary,
      notes
    });

    res.json({ success: true, message: "Gửi thư thành công!", details: result });
  } catch (err) {
    console.error("[Mail Route Error]:", err.message);
    res.status(500).json({ success: false, error: err.message || "Không thể gửi email" });
  }
});

// Serve built frontend (dist/index.html) or show error if not built
app.get("/", (req, res) => {
  const indexFile = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }
  // dist/index.html not found â€” likely not built yet
  res.status(503).send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <title>Virtual Tour - ChÆ°a build</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f0f4f8; margin: 0; color: #333; }
        .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
        h1 { margin-top: 0; color: #e74c3c; }
        code { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>âš ï¸  Frontend chÆ°a Ä‘Æ°á»£c build</h1>
        <p>KhĂ´ng tĂ¬m tháº¥y <code>dist/index.html</code>.</p>
        <p>HĂ£y cháº¡y <code>npm run build:ui</code> trÆ°á»›c khi khá»Ÿi Ä‘á»™ng server.</p>
      </div>
    </body>
    </html>
  `);
});

/* ===== INIT FOLDERS ===== */
if (!canUseDirectory(UPLOADS_DIR)) {
  throw new Error(`Cannot create/write uploads directory: ${UPLOADS_DIR}`);
}
// Ensure data dir exists (vẫn cần cho room-api-configs)
if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('backend')) fs.mkdirSync('backend');
if (!fs.existsSync('backend/raw')) fs.mkdirSync('backend/raw', { recursive: true });
if (!fs.existsSync('backend/tiles')) fs.mkdirSync('backend/tiles', { recursive: true });

/* ===== SSE ENDPOINT ===== */
app.get("/events", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Add to clients set
  sseClients.add(res);

  // Send initial rooms snapshot
  const initial = JSON.stringify(await getRooms());
  res.write(`event: rooms\ndata: ${initial}\n\n`);

  // Send initial sensors snapshot
  const initialSensors = JSON.stringify(await getSensors());
  res.write(`event: sensors\ndata: ${initialSensors}\n\n`);

  // Send initial custom icons snapshot
  const initialCustomIcons = JSON.stringify(await getCustomIcons());
  res.write(`event: custom_icons\ndata: ${initialCustomIcons}\n\n`);

  // Send initial notifications snapshot
  try {
    const initialNotifications = JSON.stringify(await getNotifications());
    res.write(`event: notifications\ndata: ${initialNotifications}\n\n`);
  } catch (err) {
    console.error("Error sending initial notifications to SSE client:", err);
  }

  req.on("close", () => {
    sseClients.delete(res);
  });
});

/* ===== MULTER ===== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

/* ===== ROUTES ===== */

// TEST
app.get("/test", (req, res) => {
  res.send("SERVER OK");
});

// GET ROOMS
app.get("/api/rooms", async (req, res) => {
  const rooms = await getRooms();
  
  // Kiểm tra token để xác định vai trò người dùng (không bắt buộc)
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies && req.cookies.vt_token) {
    token = req.cookies.vt_token;
  }
  
  let isManager = false;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded && (decoded.role === 'admin' || decoded.role === 'collaborator')) {
      isManager = true;
    }
  }
  
  // Nếu không phải là quản trị/cộng tác viên, ẩn/che giấu email người nhận trong mailHotspots
  const safeRooms = rooms.map(room => {
    if (!room.mailHotspots || room.mailHotspots.length === 0) return room;
    return {
      ...room,
      mailHotspots: room.mailHotspots.map(h => ({
        ...h,
        recipient: isManager ? h.recipient : obfuscateEmail(h.recipient)
      }))
    };
  });
  
  res.json(safeRooms);
});

// GET SENSORS
app.get("/api/sensors", async (req, res) => {
  try {
    const roomId = req.query.roomId;
    let sensors = await getSensors();
    if (roomId !== undefined && roomId !== null && roomId !== "") {
      const rooms = await getRooms();
      const validRoomIds = rooms.map(r => String(r.id));
      sensors = sensors.filter(s => {
        if (String(s.roomId) === String(roomId)) return true;
        if (s.roomId && !validRoomIds.includes(String(s.roomId))) {
          return String(roomId) === validRoomIds[0];
        }
        return false;
      });
    }
    res.json({ success: true, sensors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET NOTIFICATIONS (Protected)
app.get("/api/notifications", authMiddleware, async (req, res) => {
  try {
    const list = await getNotifications();
    res.json({ success: true, notifications: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE HOTSPOT
app.put("/api/rooms/:id/hotspots", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const roomId = Number(req.params.id);
  const { yaw, pitch, target, rotation, color, initialYaw, initialPitch } = req.body;

  if ([yaw, pitch, target].some(v => v === undefined || v === null || v === "")) {
    return res.status(400).json({ success: false, error: "Missing yaw/pitch/target" });
  }

  try {
    const room = await db.getRoomById(roomId);
    if (!room) return res.status(404).json({ success: false, error: "Room not found" });

    // Build insert payload — only include initial_yaw/initial_pitch when a real value is provided
    // (prevents Supabase errors if migration hasn't been run yet)
    const insertPayload = {
      room_id: roomId,
      yaw: Number(yaw), pitch: Number(pitch),
      target_room_id: Number(target),
      rotation: rotation !== undefined ? Number(rotation) : 0,
      color: color || null
    };
    const hasInitialYaw = initialYaw !== undefined && initialYaw !== null && initialYaw !== '';
    const hasInitialPitch = initialPitch !== undefined && initialPitch !== null && initialPitch !== '';
    if (hasInitialYaw) insertPayload.initial_yaw = Number(initialYaw);
    if (hasInitialPitch) insertPayload.initial_pitch = Number(initialPitch);

    const { error } = await db.supabase.from('hotspots').insert(insertPayload);
    if (error) throw error;

    const user = req.user?.username || 'Collaborator';
    const targetRoom = await db.getRoomById(target);
    const targetRoomName = targetRoom ? targetRoom.name : target;
    await createNotification(
      'hotspot_add',
      'Thêm liên kết phòng',
      `${user} đã thêm điểm di chuyển từ '${room.name}' đến '${targetRoomName}'`,
      user
    );

    await broadcastRooms();
    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, room: updatedRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE HOTSPOT
app.delete("/api/rooms/:id/hotspots/:index", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const roomId = Number(req.params.id);
  const index = Number(req.params.index);

  try {
    const { data: dbHotspots, error: selErr } = await db.supabase
      .from('hotspots').select('id').eq('room_id', roomId).order('id', { ascending: true });
    if (selErr) throw selErr;
    if (!dbHotspots || index < 0 || index >= dbHotspots.length)
      return res.status(400).json({ success: false, error: "Invalid hotspot index" });

    const { error: delErr } = await db.supabase.from('hotspots').delete().eq('id', dbHotspots[index].id);
    if (delErr) throw delErr;

    await broadcastRooms();
    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, room: updatedRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE HOTSPOT (edit existing)
app.patch("/api/rooms/:id/hotspots/:index", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const roomId = Number(req.params.id);
  const index = Number(req.params.index);
  const { yaw, pitch, target, rotation, color, initialYaw, initialPitch } = req.body;

  try {
    const { data: dbHotspots, error: selErr } = await db.supabase
      .from('hotspots').select('id').eq('room_id', roomId).order('id', { ascending: true });
    if (selErr) throw selErr;
    if (!dbHotspots || index < 0 || index >= dbHotspots.length)
      return res.status(400).json({ success: false, error: "Invalid hotspot index" });

    const updates = {};
    if (yaw !== undefined) updates.yaw = Number(yaw);
    if (pitch !== undefined) updates.pitch = Number(pitch);
    if (target !== undefined) updates.target_room_id = Number(target);
    if (rotation !== undefined) updates.rotation = Number(rotation);
    if (color !== undefined) updates.color = color;
    // Only include initial_yaw/initial_pitch when they have a real numeric value
    // (skipped when null/empty — prevents Supabase error if migration not yet run)
    if (initialYaw !== undefined && initialYaw !== null && initialYaw !== '') {
      updates.initial_yaw = Number(initialYaw);
    }
    if (initialPitch !== undefined && initialPitch !== null && initialPitch !== '') {
      updates.initial_pitch = Number(initialPitch);
    }

    const { error: upErr } = await db.supabase.from('hotspots').update(updates).eq('id', dbHotspots[index].id);
    if (upErr) throw upErr;

    await broadcastRooms();
    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, room: updatedRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET MAIL HOTSPOTS
app.get("/api/rooms/:id/mail-hotspots", authMiddleware, async (req, res) => {
  const roomId = Number(req.params.id);
  try {
    const room = await db.getRoomById(roomId);
    if (!room) return res.status(404).json({ success: false, error: "Room not found" });

    // Kiểm tra vai trò
    const isManager = req.user.role === "admin" || req.user.role === "collaborator";
    const mailHotspots = (room.mailHotspots || []).map(h => ({
      ...h,
      recipient: isManager ? h.recipient : obfuscateEmail(h.recipient)
    }));

    res.json({ success: true, mailHotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ADD MAIL HOTSPOT
app.post("/api/rooms/:id/mail-hotspots", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const roomId = Number(req.params.id);
  const { yaw, pitch, screenX, screenY, title, recipient, subject, body } = req.body;

  const hasSphericalCoords = ![yaw, pitch].some(v => v === undefined || v === null || v === "");
  const hasScreenCoords = ![screenX, screenY].some(v => v === undefined || v === null || v === "");

  if (!hasSphericalCoords && !hasScreenCoords)
    return res.status(400).json({ success: false, error: "Missing coordinates (yaw/pitch or screenX/screenY)" });

  try {
    const room = await db.getRoomById(roomId);
    if (!room) return res.status(404).json({ success: false, error: "Room not found" });

    const { error } = await db.supabase.from('mail_hotspots').insert({
      room_id: roomId,
      title: title || "Gửi mail",
      recipient: recipient || "",
      subject: subject || "",
      body: body || "",
      yaw: hasSphericalCoords ? Number(yaw) : null,
      pitch: hasSphericalCoords ? Number(pitch) : null,
      screen_x: hasScreenCoords ? Math.max(0, Math.min(1, Number(screenX))) : null,
      screen_y: hasScreenCoords ? Math.max(0, Math.min(1, Number(screenY))) : null,
    });
    if (error) throw error;

    const user = req.user?.username || 'Collaborator';
    await createNotification(
      'mail_add',
      'Thêm điểm phản hồi email',
      `${user} đã thêm điểm gửi email '${title || 'Gửi mail'}' tại phòng '${room.name}'`,
      user
    );

    await broadcastRooms();
    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, room: updatedRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE MAIL HOTSPOT
app.patch("/api/rooms/:id/mail-hotspots/:index", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const roomId = Number(req.params.id);
  const index = Number(req.params.index);
  const { yaw, pitch, screenX, screenY, title, recipient, subject, body } = req.body;

  try {
    const { data: rows, error: selErr } = await db.supabase
      .from('mail_hotspots').select('id').eq('room_id', roomId).order('id', { ascending: true });
    if (selErr) throw selErr;
    if (!rows || index < 0 || index >= rows.length)
      return res.status(400).json({ success: false, error: "Invalid mail hotspot index" });

    const updates = {};
    if (yaw !== undefined) updates.yaw = Number(yaw);
    if (pitch !== undefined) updates.pitch = Number(pitch);
    if (screenX !== undefined) updates.screen_x = Math.max(0, Math.min(1, Number(screenX)));
    if (screenY !== undefined) updates.screen_y = Math.max(0, Math.min(1, Number(screenY)));
    if (title !== undefined) updates.title = title;
    if (recipient !== undefined) updates.recipient = recipient;
    if (subject !== undefined) updates.subject = subject;
    if (body !== undefined) updates.body = body;
    updates.updated_at = new Date().toISOString();

    const { error: upErr } = await db.supabase.from('mail_hotspots').update(updates).eq('id', rows[index].id);
    if (upErr) throw upErr;

    await broadcastRooms();
    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, room: updatedRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE MAIL HOTSPOT
app.delete("/api/rooms/:id/mail-hotspots/:index", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const roomId = Number(req.params.id);
  const index = Number(req.params.index);

  try {
    const { data: rows, error: selErr } = await db.supabase
      .from('mail_hotspots').select('id').eq('room_id', roomId).order('id', { ascending: true });
    if (selErr) throw selErr;
    if (!rows || index < 0 || index >= rows.length)
      return res.status(400).json({ success: false, error: "Invalid mail hotspot index" });

    const { error: delErr } = await db.supabase.from('mail_hotspots').delete().eq('id', rows[index].id);
    if (delErr) throw delErr;

    await broadcastRooms();
    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, room: updatedRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SEND MAIL
app.post("/api/mail/send", authMiddleware, async (req, res) => {
  try {
    let { to, subject, body, pageUrl, summary, notes, format, roomId, hotspotIndex } = req.body;

    // Nếu người dùng có role là "user" (không phải admin hay collaborator)
    // thì bắt buộc phải kiểm soát địa chỉ nhận email để tránh Spam
    if (req.user.role === 'user') {
      if (roomId === undefined || roomId === null || hotspotIndex === undefined || hotspotIndex === null) {
        return res.status(400).json({ success: false, error: "Thiếu thông tin phòng và vị trí điểm mail để xác minh địa chỉ nhận." });
      }

      const room = await db.getRoomById(roomId);
      if (!room || !room.mailHotspots) {
        return res.status(400).json({ success: false, error: "Không tìm thấy phòng hoặc danh sách điểm mail." });
      }

      const hotspot = room.mailHotspots[Number(hotspotIndex)];
      if (!hotspot || !hotspot.recipient) {
        return res.status(400).json({ success: false, error: "Điểm mail không tồn tại hoặc chưa cấu hình email nhận." });
      }

      // Chỉ gửi về email gốc đã được lưu an toàn trên cơ sở dữ liệu
      to = hotspot.recipient;
    }

    if (!to) {
      return res.status(400).json({ success: false, error: "Missing recipient (to)" });
    }

    const normalizedTo = Array.isArray(to)
      ? to.filter(Boolean).join(",")
      : String(to)
          .split(",")
          .map(email => email.trim())
          .filter(Boolean)
          .join(",");

    const toList = normalizedTo
      .split(",")
      .map(email => email.trim())
      .filter(Boolean);

    if (!toList.length) {
      return res.status(400).json({ success: false, error: "Invalid recipient list" });
    }

    const useTemplate = format === "virtual-tour-note" || Array.isArray(notes);
    const content = useTemplate
      ? buildVirtualTourMailContent({
          pageUrl,
          summary: summary ?? body,
          notes
        })
      : {
          text: String(body || ""),
          html: `<pre style=\"font-family: Arial, sans-serif; white-space: pre-wrap;\">${escapeHtml(body || "")}</pre>`
        };

    const mailSubject = String(subject || "Ghi chú từ Virtual Tour");
    const result = await mailHelper.sendMailRaw({
      to: normalizedTo,
      subject: mailSubject,
      text: content.text,
      html: content.html
    });

    res.json({ success: true, messageId: result.messageId, provider: result.provider });
  } catch (err) {
    console.error("MAIL SEND ERROR:", err);
    res.status(500).json({ success: false, error: err.message || "Send mail failed" });
  }
});


// ADD ROOM
app.post("/api/rooms", authMiddleware, requireRole("admin", "collaborator"), upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image uploaded" });
  }

  if (!req.body.name || req.body.name.trim() === "") {
    return res.status(400).json({ success: false, error: "Room name is required" });
  }

  try {
    const newRoom = await db.insertRoom({
      name: req.body.name,
      image: "/uploads/" + req.file.filename
    });
    broadcastRooms();
    res.json({ success: true, room: newRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== MINIMAP PUBLIC API ===== */
app.get("/api/minimap", async (req, res) => {
  const minimap = await getMinimap();
  res.json({ success: true, minimap });
});

/* ===== TOUR SCENARIO PUBLIC API ===== */
app.get("/api/tour-scenario", async (req, res) => {
  try {
    const scenario = await db.getAppConfig('tour_scenario');
    if (scenario) {
      res.json({ success: true, scenario });
    } else {
      res.json({ success: false, message: "No scenario found" });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== SENSORS API ===== */
app.get("/api/sensors", async (req, res) => {
  const sensors = await getSensors();
  const roomId = req.query.roomId ? Number(req.query.roomId) : null;
  if (roomId) {
    return res.json({ success: true, sensors: sensors.filter(s => Number(s.roomId) === roomId) });
  }
  res.json({ success: true, sensors });
});

app.get("/api/sensors/:id", async (req, res) => {
  const sensorId = Number(req.params.id);
  const sensors = await getSensors();
  const sensor = sensors.find(s => Number(s.id) === sensorId);
  if (!sensor) return res.status(404).json({ success: false, error: "Sensor not found" });
  res.json({ success: true, sensor });
});

app.put("/api/sensors/:id", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const sensorId = req.params.id;
  const { name, roomId, position, sensors: envSensors, type, camera } = req.body;

  try {
    const allSensors = await getSensors();
    const sensor = allSensors.find(s => String(s.id) === String(sensorId) || Number(s.id) === Number(sensorId));

    const nextType = type || sensor?.type || "environment";
    const isCamera = nextType === "camera";
    const updates = { type: nextType };
    if (name) updates.name = name;
    if (roomId !== undefined) updates.roomId = roomId;
    if (position) { updates.position = position; }
    if (isCamera && camera) updates.camera = camera;
    else if (!isCamera && envSensors) updates.sensors = envSensors;
    updates.lastUpdate = new Date().toISOString();

    await db.updateSensor(sensorId, updates);
    await broadcastSensors();
    const updated = (await getSensors()).find(s => Number(s.id) === sensorId);
    res.json({ success: true, sensor: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/sensors", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const { name, roomId, position, sensors, type, camera } = req.body;
  if (!name || !roomId) return res.status(400).json({ success: false, error: "Missing required fields" });

  try {
    const newSensor = {
      id: Date.now(),
      name, roomId,
      type: type || "environment",
      position: position || { yaw: 0, pitch: 0 },
      lastUpdate: new Date().toISOString(),
      color: type === "camera" ? "#2196F3" : "#4CAF50",
      ...(type === "camera" ? { camera: camera || {} } : { sensors: sensors || {} })
    };
    await db.insertSensor(newSensor);
    await broadcastSensors();
    res.json({ success: true, sensor: newSensor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/sensors/:id", authMiddleware, requireRole("admin", "collaborator"), async (req, res) => {
  const sensorId = Number(req.params.id);
  try {
    await db.deleteSensor(sensorId);
    await broadcastSensors();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== API CONFIG MANAGEMENT ===== */
app.get("/api/config/api", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const config = await getApiConfig();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/config/api", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await saveApiConfig(req.body);
    res.json({ success: true, message: "Config saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== ROOM-SPECIFIC API CONFIG ===== */
// Get room API config
app.get("/api/rooms/:roomId/api-config", authMiddleware, requireRole("admin", "collaborator"), (req, res) => {
  const roomId = req.params.roomId;
  const configFile = path.join(ROOM_API_CONFIGS_DIR, `${roomId}.json`);
  try {
    if (fs.existsSync(configFile)) {
      res.json({ success: true, config: JSON.parse(fs.readFileSync(configFile, 'utf-8')) });
    } else {
      res.json({ success: true, config: getDefaultApiConfig(), isDefault: true });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save room API config
app.post("/api/rooms/:roomId/api-config", authMiddleware, requireRole("admin", "collaborator"), (req, res) => {
  const roomId = req.params.roomId;
  const configFile = path.join(ROOM_API_CONFIGS_DIR, `${roomId}.json`);
  try {
    fs.writeFileSync(configFile, JSON.stringify(req.body, null, 2));
    res.json({ success: true, message: "Room API config saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
/* ===== REAL-TIME DATA API ===== */
// Gá»™p dá»¯ liá»‡u thá»i tiáº¿t vĂ  cháº¥t lÆ°á»£ng khĂ´ng khĂ­ thĂ nh 1 payload.
async function getCombinedData(config) {
  const weatherApi = config.weatherApi;
  const airApi = config.airQualityApi;
  
  let temp = 26 + Math.random() * 5; // Default fallback
  let humidity = 70 + Math.random() * 10;
  let weather = "partly cloudy";
  
  // Try to fetch real weather data from configured API
  try {
    const lat = Number(weatherApi?.params?.lat);
    const lon = Number(weatherApi?.params?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(`Invalid coordinates (lat=${weatherApi?.params?.lat}, lon=${weatherApi?.params?.lon})`);
    }
    const weatherUrl = `${weatherApi.url}?lat=${lat}&lon=${lon}&appid=${weatherApi.apiKey}&units=${weatherApi.params.units}`;
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();
    
    if (weatherData.main && weatherData.main.temp !== undefined) {
      temp = Math.round(weatherData.main.temp * 10) / 10;
      humidity = Math.round(weatherData.main.humidity);
      weather = weatherData.weather?.[0]?.description || weather;
      console.log(`✅ Weather API OK: ${temp}°C | Độ ẩm: ${humidity}%`);
    } else {
      console.log("⚠️ Weather API không trả về dữ liệu đúng");
    }
  } catch (e) {
    console.log("❌ Weather API lỗi:", e.message);
  }
  
  let pm25Value = 25 + Math.random() * 20;
  let pmSource = "Simulated";
  
  // Try to fetch real PM2.5 from configured API
  try {
    const pm25Url = `${airApi.url}?token=${airApi.token}`;
    const pm25Response = await fetch(pm25Url);
    const pm25Data = await pm25Response.json();
    
    console.log("📡 WAQI Full Response:", pm25Data.status, "PM2.5:", pm25Data.data?.iaqi?.pm25?.v, "AQI:", pm25Data.data?.aqi);
    
    if (pm25Data.status === "ok" && pm25Data.data?.iaqi?.pm25?.v && typeof pm25Data.data.iaqi.pm25.v === "number") {
      pm25Value = pm25Data.data.iaqi.pm25.v;
      pmSource = "Real (WAQI PM2.5)";
      console.log("✅ PM2.5 API OK:", pm25Value + " µg/m³");
    } else if (pm25Data.status === "ok" && pm25Data.data?.aqi && typeof pm25Data.data.aqi === "number" && pm25Data.data.aqi > 0) {
      pm25Value = pm25Data.data.aqi;
      pmSource = "Real (WAQI AQI)";
      console.log("✅ AQI API OK:", pm25Value);
    } else {
      console.log("⚠️ WAQI không có dữ liệu hợp lệ, dùng simulated");
    }
  } catch (e) {
    console.log("⚠️ PM2.5 API lỗi:", e.message);
  }
  
  // Try to fetch custom third-party APIs (extensible for future custom APIs)
  const customApi = config.customApi;
  if (customApi && customApi.url) {
    try {
      const response = await fetch(customApi.url, {
        headers: customApi.headers || {}
      });
      const customData = await response.json();
      console.log(`📡 [Custom API] Fetched response from ${customApi.url}`);
      
      const mappings = customApi.mappings || {};
      if (mappings.temperature) {
        const val = getValueByPath(customData, mappings.temperature);
        if (val !== null && !isNaN(Number(val))) {
          temp = Number(val);
          console.log(`✅ [Custom API] Temperature mapped: ${temp}°C`);
        }
      }
      if (mappings.humidity) {
        const val = getValueByPath(customData, mappings.humidity);
        if (val !== null && !isNaN(Number(val))) {
          humidity = Number(val);
          console.log(`✅ [Custom API] Humidity mapped: ${humidity}%`);
        }
      }
      if (mappings.pm25) {
        const val = getValueByPath(customData, mappings.pm25);
        if (val !== null && !isNaN(Number(val))) {
          pm25Value = Number(val);
          pmSource = `Real (Custom API: ${customApi.url})`;
          console.log(`✅ [Custom API] PM2.5 mapped: ${pm25Value}`);
        }
      }
      if (customData.weather) {
        weather = String(customData.weather);
      }
    } catch (customErr) {
      console.error("⚠️ Error fetching or mapping Custom API:", customErr.message);
    }
  }

  const locationName = weatherApi && weatherApi.params ? `Lat: ${weatherApi.params.lat}, Lon: ${weatherApi.params.lon}` : "Custom Source";
  console.log(`📊 ${locationName} - Nhiệt độ: ${temp}°C | Độ ẩm: ${humidity}% | PM2.5: ${Math.round(pm25Value * 10)/10} (${pmSource})`);
  
  return {
    temperature: temp,
    humidity: humidity,
    pm25: Math.round(pm25Value * 10) / 10,
    location: locationName,
    timestamp: new Date().toISOString(),
    aqi: calculateAQI(pm25Value),
    weather: weather
  };
}

// Get combined environmental data (PM2.5 + Temperature + Humidity)
app.get("/api/real-data/combined", async (req, res) => {
  try {
    const roomId = req.query.roomId;
    let config;
    
    // Check if room has specific API config
    if (roomId) {
      const roomConfigFile = path.join(ROOM_API_CONFIGS_DIR, `${roomId}.json`);
      if (fs.existsSync(roomConfigFile)) {
        config = JSON.parse(fs.readFileSync(roomConfigFile, 'utf-8'));
      } else {
        config = getDefaultApiConfig();
      }
    } else {
      config = await getApiConfig();
    }
    
    const data = await getCombinedData(config);
    
    // Return fetched real weather/air quality data without overwriting IoT sensors in DB
    res.json({ success: true, data });
  } catch (err) {
    console.error("â Œ Error fetching combined data:", err.message);
    res.json({
      success: true,
      data: {
        temperature: 26.5,
        humidity: 70,
        pm25: 35,
        location: "Mock Data",
        timestamp: new Date().toISOString(),
        aqi: calculateAQI(35),
        weather: "clear sky"
      }
    });
  }
});

// Get combined data using custom config (from admin-rooms form)
app.post("/api/real-data/combined/custom", async (req, res) => {
  try {
    const config = req.body;
    const data = await getCombinedData(config);
    res.json({ success: true, data });
  } catch (err) {
    console.error("âŒ Error fetching combined data (custom):", err.message);
    res.json({
      success: true,
      data: {
        temperature: 26.5,
        humidity: 70,
        pm25: 35,
        location: "Mock Data",
        timestamp: new Date().toISOString(),
        aqi: calculateAQI(35),
        weather: "clear sky"
      }
    });
  }
});

// Helper to get thresholds config
// Helper to get thresholds config
function getSensorThresholds() {
  const file = path.join(__dirname, "data", "sensor-thresholds.json");
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (err) {
    console.error("Error reading sensor thresholds configuration:", err.message);
  }
  return {
    temperature: 0.5,
    humidity: 2.0,
    pm25: 5.0,
    co2: 50.0,
    smoke: 1.0
  };
}

// Reusable helper to update sensor in DB and write logs based on threshold checks
async function updateSensorDataAndLog(sId, { temperature, humidity, pm25, co2, smoke }) {
  const thresholds = getSensorThresholds();

  let lastState = sensorLastStateCache.get(sId);
  if (!lastState) {
    const allSensors = await db.getSensors();
    const dbSensor = allSensors.find(s => Number(s.id) === sId);
    if (!dbSensor) {
      throw new Error(`Sensor with ID ${sId} not found`);
    }
    
    const data = dbSensor.sensors || {};
    lastState = {
      temperature: data.temperature?.value !== undefined && data.temperature?.value !== null ? Number(data.temperature.value) : null,
      humidity: data.humidity?.value !== undefined && data.humidity?.value !== null ? Number(data.humidity.value) : null,
      pm25: data.pm25?.value !== undefined && data.pm25?.value !== null ? Number(data.pm25.value) : null,
      co2: data.co2?.value !== undefined && data.co2?.value !== null ? Number(data.co2.value) : null,
      smoke: data.smoke?.value !== undefined && data.smoke?.value !== null ? Number(data.smoke.value) : null
    };
    sensorLastStateCache.set(sId, lastState);
  }

  let shouldLog = false;
  const updates = {};
  const logData = { sensorId: sId };

  const checkMetric = (key, newValue) => {
    if (newValue === undefined || newValue === null) return;
    const numVal = Number(newValue);
    const prevVal = lastState[key];
    
    updates[key] = numVal;
    logData[key] = numVal;

    if (prevVal === null || prevVal === undefined) {
      shouldLog = true;
    } else if (Math.abs(numVal - prevVal) >= (thresholds[key] || 0.1)) {
      shouldLog = true;
    }
  };

  checkMetric("temperature", temperature);
  checkMetric("humidity", humidity);
  checkMetric("pm25", pm25);
  checkMetric("co2", co2);
  checkMetric("smoke", smoke);

  if (Object.keys(updates).length > 0) {
    const allSensors = await db.getSensors();
    const sensorObj = allSensors.find(s => Number(s.id) === sId);
    
    if (sensorObj) {
      if (!sensorObj.sensors) sensorObj.sensors = {};
      
      if (updates.temperature !== undefined) {
        sensorObj.sensors.temperature = {
          value: updates.temperature,
          min: sensorObj.sensors.temperature?.min ?? 18,
          max: sensorObj.sensors.temperature?.max ?? 30,
          unit: sensorObj.sensors.temperature?.unit ?? "°C"
        };
      }
      if (updates.humidity !== undefined) {
        sensorObj.sensors.humidity = {
          value: updates.humidity,
          min: sensorObj.sensors.humidity?.min ?? 40,
          max: sensorObj.sensors.humidity?.max ?? 80,
          unit: sensorObj.sensors.humidity?.unit ?? "%"
        };
      }
      if (updates.pm25 !== undefined) {
        sensorObj.sensors.pm25 = {
          value: updates.pm25,
          unit: sensorObj.sensors.pm25?.unit ?? "µg/m³"
        };
      }
      if (updates.co2 !== undefined) {
        sensorObj.sensors.co2 = {
          value: updates.co2,
          unit: sensorObj.sensors.co2?.unit ?? "ppm"
        };
      }
      if (updates.smoke !== undefined) {
        sensorObj.sensors.smoke = {
          value: updates.smoke
        };
      }

      sensorObj.lastUpdate = new Date().toISOString();
      await db.updateSensor(sId, sensorObj);
    }

    for (const k in updates) {
      lastState[k] = updates[k];
    }
    sensorLastStateCache.set(sId, lastState);

    if (shouldLog) {
      await db.insertSensorLog(logData);
      console.log(`[Sensor Ingestion] Logged history for sensor ${sId} to Supabase`);
    }

    await broadcastSensors();
  }

  return { logged: shouldLog, data: lastState };
}

// POST endpoint for external real-time sensor updates
app.post("/api/sensors/realtime-update", async (req, res) => {
  try {
    const { sensor_id, sensorId, temperature, humidity, pm25, co2, smoke } = req.body;
    const sId = Number(sensor_id || sensorId);

    if (!sId || isNaN(sId)) {
      return res.status(400).json({ success: false, error: "sensor_id is required and must be a valid number" });
    }

    const result = await updateSensorDataAndLog(sId, { temperature, humidity, pm25, co2, smoke });
    res.json({ success: true, logged: result.logged, data: result.data });
  } catch (err) {
    console.error("Error processing real-time sensor update:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy PM2.5 endpoint (kept for compatibility)
app.get("/api/real-data/pm25", async (req, res) => {
  try {
    const response = await fetch("https://api.waqi.info/feed/hanoi/?token=d61e181df66964a513acd018c7cdb9c9993226d1");
    const data = await response.json();
    
    if (data.status === "ok" && data.data.iaqi.pm25) {
      const pm25Value = data.data.iaqi.pm25.v;
      res.json({
        success: true,
        data: {
          pm25: pm25Value,
          unit: "Âµg/mÂ³",
          location: data.data.city.name,
          timestamp: new Date().toISOString(),
          aqi: calculateAQI(pm25Value)
        }
      });
    } else {
      throw new Error("No PM2.5 data");
    }
  } catch (err) {
    const mockPM25 = 20 + Math.random() * 30;
    res.json({
      success: true,
      data: {
        pm25: Math.round(mockPM25 * 10) / 10,
        unit: "Âµg/mÂ³",
        location: "Mock Data",
        timestamp: new Date().toISOString(),
        aqi: calculateAQI(mockPM25)
      }
    });
  }
});

// Helper: Calculate AQI status
// Quy Ä‘á»•i PM2.5 sang má»©c AQI Ä‘á»ƒ hiá»ƒn thá»‹ tráº¡ng thĂ¡i.
function calculateAQI(pm25) {
  if (pm25 <= 12) return { level: "Tốt", color: "#4CAF50" };
  if (pm25 <= 35.4) return { level: "Chấp nhận được", color: "#FFC107" };
  if (pm25 <= 55.4) return { level: "Nhạy cảm", color: "#FF9800" };
  if (pm25 <= 150.4) return { level: "Không tốt", color: "#F44336" };
  if (pm25 <= 250.4) return { level: "Xấu", color: "#C62828" };
  return { level: "Nguy hiểm", color: "#6D1B1B" };
}

/* ===== CUSTOM HOTSPOT ICONS ===== */
const LOCAL_CUSTOM_ICONS_FILE = path.join(__dirname, "data", "custom-icons.json");
const CUSTOM_ICONS_DIR = path.join(UPLOADS_DIR, "custom_icons");

if (!fs.existsSync(CUSTOM_ICONS_DIR)) {
  fs.mkdirSync(CUSTOM_ICONS_DIR, { recursive: true });
}

const customIconsStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CUSTOM_ICONS_DIR),
  filename: (req, file, cb) => {
    const iconKey = req.body.iconKey || "icon";
    const ext = path.extname(file.originalname);
    cb(null, `${iconKey}_${Date.now()}${ext}`);
  }
});

const uploadCustomIcon = multer({
  storage: customIconsStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

function getDefaultCustomIcons() {
  return {
    nav_arrow: "",
    media_note: "",
    media_image: "",
    media_pdf: "",
    media_video: "",
    media_3d: "",
    media_gallery: "",
    media_youtube: "",
    media_web: "",
    mail: "",
    sensor: "",
    camera: ""
  };
}

async function getCustomIcons() {
  try {
    const config = await db.getAppConfig('custom_icons');
    if (config) return config;
  } catch (err) {
    console.warn("⚠️ Cannot fetch custom_icons from DB, falling back to local file:", err.message);
  }
  
  try {
    if (fs.existsSync(LOCAL_CUSTOM_ICONS_FILE)) {
      const raw = fs.readFileSync(LOCAL_CUSTOM_ICONS_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("⚠️ Cannot read local custom_icons file:", err.message);
  }
  
  return getDefaultCustomIcons();
}

async function saveCustomIcons(config) {
  try {
    await db.saveAppConfig('custom_icons', config);
  } catch (err) {
    console.warn("⚠️ Cannot save custom_icons to DB, saving to local file:", err.message);
  }
  
  try {
    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_CUSTOM_ICONS_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.warn("⚠️ Cannot write local custom_icons file:", err.message);
  }
}

// GET custom icons config
app.get("/api/custom-icons", async (req, res) => {
  try {
    const config = await getCustomIcons();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST upload custom icon (Protected: Admin only)
app.post("/api/custom-icons/upload", authMiddleware, requireRole("admin"), uploadCustomIcon.single("icon"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    const iconKey = req.body.iconKey;
    if (!iconKey) {
      return res.status(400).json({ success: false, error: "Missing iconKey" });
    }
    
    let imageUrl = "/uploads/custom_icons/" + req.file.filename;
    
    // Check if Supabase storage is configured and accessible
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY && !process.env.SUPABASE_URL.includes("your-project-id")) {
      try {
        const storage = require("./backend/storage");
        const localPath = req.file.path;
        const destPath = `custom_icons/${req.file.filename}`;
        const cloudUrl = await storage.uploadFile(localPath, destPath);
        imageUrl = cloudUrl;
        
        // Clean up local temp file after cloud upload
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } catch (err) {
        console.warn("⚠️ Failed to upload icon to Supabase storage, using local path:", err.message);
      }
    }
    
    res.json({ success: true, url: imageUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST save custom icons config (Protected: Admin only)
app.post("/api/custom-icons/save", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const config = req.body;
    await saveCustomIcons(config);
    broadcastCustomIcons(config);
    res.json({ success: true, message: "Custom icons config saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== AUTHENTICATION ROUTES ===== */
app.get("/api/auth/setup-status", async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json({ success: true, isSetup: users.length > 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/setup", async (req, res) => {
  try {
    const users = await db.getUsers();
    if (users.length > 0) {
      return res.status(400).json({ success: false, error: "Setup already completed" });
    }

    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const passwordHash = hashPassword(password);
    const adminUser = await db.createUser({
      username,
      passwordHash,
      role: "admin",
      displayName: displayName || username
    });

    res.json({ success: true, message: "Admin user created successfully", user: { username: adminUser.username, role: adminUser.role } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/register", (req, res) => {
  return res.status(403).json({ success: false, error: "Chức năng đăng ký tài khoản đã bị tắt. Vui lòng liên hệ Admin để được cấp tài khoản." });
});

/* ===== INVITATION ACCEPTANCE ROUTES (PUBLIC) ===== */
app.get("/api/auth/invitations/verify", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      return res.status(400).json({ success: false, error: "Thiếu mã lời mời (token)" });
    }

    const invitations = await db.getInvitations();
    const inv = invitations.find(i => i.token === token);

    if (!inv) {
      return res.status(404).json({ success: false, error: "Đường link lời mời không tồn tại hoặc không hợp lệ." });
    }
    if (inv.used) {
      return res.status(400).json({ success: false, error: "Đường link lời mời này đã được sử dụng trước đó." });
    }
    if (new Date(inv.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: "Đường link lời mời đã hết hạn." });
    }

    res.json({
      success: true,
      invitation: {
        email: inv.email,
        role: inv.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/invitations/accept", async (req, res) => {
  try {
    const { token, password, displayName } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập Mật khẩu để hoàn tất đăng ký." });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "Mật khẩu phải chứa ít nhất 6 ký tự." });
    }

    const invitations = await db.getInvitations();
    const inv = invitations.find(i => i.token === token);

    if (!inv) {
      return res.status(404).json({ success: false, error: "Đường link lời mời không hợp lệ." });
    }
    if (inv.used) {
      return res.status(400).json({ success: false, error: "Đường link lời mời này đã được sử dụng." });
    }
    if (new Date(inv.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: "Đường link lời mời đã hết hạn." });
    }

    // Tên đăng nhập được cố định theo Email được mời
    const cleanUsername = String(inv.email).trim().toLowerCase();
    const existing = await db.getUserByUsername(cleanUsername);
    if (existing) {
      return res.status(400).json({ success: false, error: `Tài khoản với Email "${cleanUsername}" đã tồn tại trên hệ thống.` });
    }

    const passwordHash = hashPassword(password);
    const newUser = await db.createUser({
      username: cleanUsername,
      passwordHash,
      role: inv.role,
      displayName: displayName ? String(displayName).trim() : cleanUsername
    });

    inv.used = true;
    inv.usedAt = new Date().toISOString();
    inv.registeredUsername = cleanUsername;
    await db.saveInvitations(invitations);

    res.json({
      success: true,
      message: "Đăng ký tài khoản thành công!",
      user: {
        username: newUser.username,
        role: newUser.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const user = await db.getUserByUsername(username);
    if (!user || !comparePassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, error: "Invalid username or password" });
    }

    // Update last login
    await db.updateLastLogin(user.id);

    // Create token
    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name
    });

    // Set cookie options
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      sameSite: isProduction ? "lax" : "strict",
      secure: isProduction,   // true trên HTTPS (Render), false khi dev local
      path: "/"
    };


    if (rememberMe) {
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    } else {
      cookieOptions.maxAge = 24 * 60 * 60 * 1000; // 24 hours
    }

    res.cookie("vt_token", token, cookieOptions);

    res.json({
      success: true,
      token: token,
      user: {
        username: user.username,
        role: user.role,
        displayName: user.display_name
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("vt_token", { path: "/" });
  res.json({ success: true, message: "Logged out successfully" });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.json({ success: true, user: req.user });
});

app.post("/api/auth/me/profile", authMiddleware, async (req, res) => {
  try {
    const { displayName, password } = req.body;
    const userId = req.user.id;

    const updates = {};
    if (displayName) {
      updates.displayName = displayName.trim();
    }
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: "Mật khẩu phải chứa ít nhất 6 ký tự" });
      }
      updates.passwordHash = hashPassword(password);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "Không có thông tin thay đổi nào" });
    }

    const updatedUser = await db.updateUser(userId, updates);
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: "Không tìm thấy người dùng" });
    }

    res.json({
      success: true,
      message: "Cập nhật tài khoản thành công",
      user: {
        username: updatedUser.username,
        role: updatedUser.role,
        displayName: updatedUser.display_name
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== ADMIN ROUTES ===== */
app.use("/api/admin", authMiddleware, adminRoutes);

/* ===== START ===== */
app.listen(PORT, () => {
  console.log("Server running");
});

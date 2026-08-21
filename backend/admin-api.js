/**
 * Admin API Routes
 * Handles panorama upload and hotspot management
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const sharp = require("sharp");
const mailHelper = require("./mail-helper");
const { generateCubeTiles } = require("../generate-tiles");
const db = require("./db");
const storage = require("./storage");
const { requireRole, hashPassword } = require("./auth");
const { createNotification } = require("./notifications");

const BUCKET_NAME = 'virtual-tour';
const router = express.Router();

// Tất cả các tuyến quản trị trong router này đều yêu cầu vai trò admin hoặc collaborator
router.use(requireRole("admin", "collaborator"));

const DEFAULT_UPLOADS_DIR = path.join(__dirname, "../uploads");
const RAW_UPLOAD_DIR = String(process.env.UPLOAD_DIR || "").trim();
const ENV_UPLOADS_DIR = RAW_UPLOAD_DIR
  ? (path.isAbsolute(RAW_UPLOAD_DIR) ? RAW_UPLOAD_DIR : path.resolve(__dirname, "..", RAW_UPLOAD_DIR))
  : "";

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
const MEDIA_UPLOADS_DIR = path.join(UPLOADS_DIR, "media");

if (!canUseDirectory(MEDIA_UPLOADS_DIR)) {
  throw new Error(`Cannot create/write media uploads directory: ${MEDIA_UPLOADS_DIR}`);
}

/* ===== DATA HELPER (SUPABASE) ===== */
async function getRooms() {
  return await db.getRooms();
}

async function getBuildings() {
  return await db.getBuildings();
}

async function getMinimap() {
  return await db.getMinimap();
}

async function syncRoomToLocalJson(roomId) {
  // Disposed local JSON synchronization
}

async function ensureRoomHotspotsSynced(roomId) {
  // Disposed local JSON synchronization
}

/* ===== MULTER CONFIG ===== */
const panoramaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `panorama_${timestamp}${ext}`);
  }
});

const minimapStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `minimap_${timestamp}${ext}`);
  }
});

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `media_${timestamp}_${sanitized}`);
  }
});

const uploadPanorama = multer({ 
  storage: panoramaStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/webp') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG and WEBP files are allowed'));
    }
  }
});

const uploadMinimap = multer({
  storage: minimapStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/webp') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG and WEBP files are allowed'));
    }
  }
});

const uploadMedia = multer({
  storage: mediaStorage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'video/mp4', 'video/webm',
      'model/gltf-binary', 'model/gltf+json'
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(glb|gltf)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Allowed: images, PDF, videos, 3D models (GLB/GLTF)'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

function uploadMediaWithJsonError(req, res, next) {
  uploadMedia.single("media")(req, res, err => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, error: "File quá lớn (tối đa 50MB)" });
      }
      return res.status(400).json({ success: false, error: err.message });
    }

    return res.status(400).json({ success: false, error: err.message || "Upload failed" });
  });
}

/* ===== GET ROOMS ===== */
router.get("/rooms", async (req, res) => {
  try {
    const rooms = await getRooms();
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== REORDER ROOMS ===== */
router.post("/rooms/reorder", async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ success: false, error: "orderedIds must be an array" });
  }

  try {
    await Promise.all(
      orderedIds.map((roomId, index) => db.updateRoomOrder(Number(roomId), index))
    );

    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms:", err));
    }

    res.json({ success: true, message: "Room order updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== UPLOAD PANORAMA ===== */
router.post("/upload-panorama", uploadPanorama.single("panorama"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No panorama file uploaded" });
    }

    let rawPath = req.file.path;
    const timestamp = Date.now();
    let outputDir = path.join("backend", "tiles", timestamp.toString());
    const roomNameInput = req.body.name || `Room ${new Date().toLocaleDateString('vi-VN')}`;
    let imageRelPath = "/uploads/" + req.file.filename;
    let tilesRelPath = `tiles/${timestamp}`;
    const buildingId = req.body.buildingId;

    if (buildingId) {
      const buildings = await getBuildings();
      const building = buildings.find(b => b.id === buildingId);
      if (building) {
        const bName = building.name;
        const bUploadsDir = path.join(UPLOADS_DIR, bName);
        if (!fs.existsSync(bUploadsDir)) fs.mkdirSync(bUploadsDir, { recursive: true });
        
        const bTilesDir = path.join(__dirname, "..", "backend", "tiles", bName);
        if (!fs.existsSync(bTilesDir)) fs.mkdirSync(bTilesDir, { recursive: true });

        const newRawPath = path.join(bUploadsDir, req.file.filename);
        if (fs.existsSync(rawPath)) {
          fs.renameSync(rawPath, newRawPath);
          rawPath = newRawPath;
        }

        outputDir = path.join("backend", "tiles", bName, timestamp.toString());
        
        // Chuẩn hóa tên building để tạo folder không dấu
        const safeBName = storage.sanitizePath(bName);
        imageRelPath = `/uploads/${safeBName}/${req.file.filename}`;
        tilesRelPath = `tiles/${safeBName}/${timestamp}`;
      }
    }

    console.log("📥 Panorama uploaded temporarily:", rawPath);
    console.log("🎨 Generating tiles...");

    try {
      const config = await generateCubeTiles(rawPath, outputDir);
      
      console.log("✅ Tiles generated successfully!");
      console.log("📁 Output tiles temp directory:", outputDir);

      // 1. Tối ưu nén ảnh Panorama (chuẩn JPEG chất lượng cao, giảm dung lượng từ 15-30MB xuống 2-3MB mà không giảm chất lượng)
      const optimizedRawPath = path.join(path.dirname(rawPath), 'opt_' + path.basename(rawPath));
      await sharp(rawPath)
        .resize({ width: 6000, withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toFile(optimizedRawPath);

      const destPanoramaPath = imageRelPath.replace(/^\//, ''); 
      console.log(`📤 Uploading optimized panorama to Storage: ${destPanoramaPath}`);
      const cloudImageUrl = await storage.uploadFile(optimizedRawPath, destPanoramaPath);

      // Xóa file tối ưu tạm
      if (fs.existsSync(optimizedRawPath)) {
        fs.unlinkSync(optimizedRawPath);
      }

      // 2. Upload thư mục Tiles lên Storage (tự động xóa đĩa local)
      console.log(`📤 Uploading tiles folder to Storage: ${tilesRelPath}`);
      await storage.uploadFolder(outputDir, tilesRelPath);

      // 3. Xóa tệp ảnh gốc cục bộ tạm thời
      if (fs.existsSync(rawPath)) {
        fs.unlinkSync(rawPath);
      }

      // 3b. Lấy full Supabase Storage URL cho tilesPath
      const cleanTilesPath = storage.sanitizePath(tilesRelPath);
      const { data: tileUrlData } = require('./db').supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(cleanTilesPath);
      const cloudTilesUrl = tileUrlData.publicUrl;

      // 4. Lưu thông tin phòng vào Database
      let orderIndex = req.body.orderIndex !== undefined && req.body.orderIndex !== '' ? Number(req.body.orderIndex) : undefined;
      if (orderIndex === undefined || isNaN(orderIndex)) {
        const existingRooms = await db.getRooms();
        const maxOrder = existingRooms.reduce((max, r) => Math.max(max, r.orderIndex || 0), 0);
        orderIndex = maxOrder + 1;
      }

      const room = {
        id: timestamp,
        name: roomNameInput,
        image: cloudImageUrl,
        tilesPath: cloudTilesUrl,   // Full Supabase Storage URL
        tilesConfig: config,
        floor: req.body.floor ? Number(req.body.floor) : 1,
        orderIndex: orderIndex,
        hotspots: []
      };
      
      if (buildingId) {
        room.buildingId = buildingId;
      }

      await db.insertRoom(room);
      console.log("💾 Room saved to Supabase Database");
      await syncRoomToLocalJson(room.id);

      const user = req.user?.username || 'Admin';
      await createNotification(
        'room_add',
        'Thêm phòng mới',
        `${user} đã tải lên ảnh panorama và tạo phòng mới '${roomNameInput}'`,
        user
      ).catch(err => console.error("Error creating upload room notification:", err));

      if (global.broadcastRooms) {
        await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms:", err));
      }

      res.json({
        success: true,
        rawPath: rawPath,
        tilesPath: tilesRelPath,
        room: room,
        response: { tilesPath: tilesRelPath }
      });

    } catch (tileError) {
      console.error("❌ Tile generation/upload error:", tileError.message);
      if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
      res.status(500).json({
        success: false,
        error: "Failed to generate or upload tiles",
        details: tileError.message
      });
    }

  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* ===== HOTSPOT MANAGEMENT ===== */

// GET hotspots for a room
router.get("/rooms/:roomId/hotspots", async (req, res) => {
  const roomId = Number(req.params.roomId);
  try {
    await ensureRoomHotspotsSynced(roomId);
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }
    res.json({ success: true, hotspots: room.hotspots || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ADD hotspot (Support POST and PUT)
const addHotspotHandler = async (req, res) => {
  const roomId = Number(req.params.roomId);
  const { yaw, pitch, target, rotation, color, iconUrl, initialYaw, initialPitch } = req.body;

  if ([yaw, pitch, target].some(v => v === undefined || v === null || v === "")) {
    return res.status(400).json({ success: false, error: "Missing yaw/pitch/target" });
  }

  try {
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    // Build insert payload — only add initial_yaw/initial_pitch when they have real values
    const insertPayload = {
      room_id: roomId,
      yaw: Number(yaw),
      pitch: Number(pitch),
      target_room_id: Number(target),
      rotation: rotation !== undefined ? Number(rotation) : 0,
      color: color || null,
      icon_url: iconUrl || null
    };
    if (initialYaw !== undefined && initialYaw !== null && initialYaw !== '') {
      insertPayload.initial_yaw = Number(initialYaw);
    }
    if (initialPitch !== undefined && initialPitch !== null && initialPitch !== '') {
      insertPayload.initial_pitch = Number(initialPitch);
    }

    const { error } = await db.supabase.from('hotspots').insert(insertPayload);

    if (error) throw error;

    await syncRoomToLocalJson(roomId);

    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms:", err));
    }

    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, hotspots: updatedRoom.hotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

router.post("/rooms/:roomId/hotspots", addHotspotHandler);
router.put("/rooms/:roomId/hotspots", addHotspotHandler);

// UPDATE hotspot
router.patch("/rooms/:roomId/hotspots/:index", async (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);
  const { yaw, pitch, target, rotation, color, iconUrl, initialYaw, initialPitch } = req.body;

  try {
    await ensureRoomHotspotsSynced(roomId);
    const { data: dbHotspots, error: selectErr } = await db.supabase
      .from('hotspots')
      .select('id')
      .eq('room_id', roomId)
      .order('id', { ascending: true });

    if (selectErr) throw selectErr;

    if (!dbHotspots || index < 0 || index >= dbHotspots.length) {
      return res.status(400).json({ success: false, error: "Invalid hotspot index" });
    }

    const hotspotId = dbHotspots[index].id;
    const updates = {};
    if (yaw !== undefined) updates.yaw = Number(yaw);
    if (pitch !== undefined) updates.pitch = Number(pitch);
    if (target !== undefined) updates.target_room_id = Number(target);
    if (rotation !== undefined) updates.rotation = Number(rotation);
    if (color !== undefined) updates.color = color;
    if (iconUrl !== undefined) updates.icon_url = iconUrl || null;
    // Only include initial_yaw/initial_pitch when they have a real numeric value
    if (initialYaw !== undefined && initialYaw !== null && initialYaw !== '') {
      updates.initial_yaw = Number(initialYaw);
    }
    if (initialPitch !== undefined && initialPitch !== null && initialPitch !== '') {
      updates.initial_pitch = Number(initialPitch);
    }

    const { error: updateErr } = await db.supabase
      .from('hotspots')
      .update(updates)
      .eq('id', hotspotId);

    if (updateErr) throw updateErr;

    await syncRoomToLocalJson(roomId);

    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms:", err));
    }

    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, hotspots: updatedRoom.hotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE hotspot
router.delete("/rooms/:roomId/hotspots/:index", async (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);

  try {
    await ensureRoomHotspotsSynced(roomId);
    const { data: dbHotspots, error: selectErr } = await db.supabase
      .from('hotspots')
      .select('id')
      .eq('room_id', roomId)
      .order('id', { ascending: true });

    if (selectErr) throw selectErr;

    if (!dbHotspots || index < 0 || index >= dbHotspots.length) {
      return res.status(400).json({ success: false, error: "Invalid hotspot index" });
    }

    const hotspotId = dbHotspots[index].id;
    const { error: delErr } = await db.supabase
      .from('hotspots')
      .delete()
      .eq('id', hotspotId);

    if (delErr) throw delErr;

    await syncRoomToLocalJson(roomId);

    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms:", err));
    }

    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, hotspots: updatedRoom.hotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE room basic properties
router.patch("/rooms/:roomId", async (req, res) => {
  const roomId = Number(req.params.roomId);
  const { name, buildingId, floor } = req.body;

  try {
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    const updates = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (buildingId !== undefined) updates.buildingId = buildingId || null;
    if (floor !== undefined) updates.floor = Number(floor);

    await db.updateRoom(roomId, updates);
    await syncRoomToLocalJson(roomId);
    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, room: updatedRoom });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE room
router.delete("/rooms/:roomId", async (req, res) => {
  const roomId = Number(req.params.roomId);

  try {
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    // 1. Xóa phòng khỏi Database (Nhờ CASCADE, hotspots/sensors tự động xóa sạch)
    await db.deleteRoom(roomId);

    // 2. Dọn dẹp files trên Supabase Storage
    if (room.tilesPath) {
      // Để xóa thư mục trên Supabase, chúng ta list các files và xóa chúng
      const { data: files } = await db.supabase.storage
        .from(BUCKET_NAME)
        .list(room.tilesPath);
        
      if (files && files.length > 0) {
        const filesToRemove = files.map(f => `${room.tilesPath}/${f.name}`);
        await db.supabase.storage.from(BUCKET_NAME).remove(filesToRemove);
      }
    }

    if (room.image) {
      // Lấy path tương đối trong bucket từ URL (ví dụ: uploads/panorama.jpg)
      const relativeCloudPath = room.image.split(`/storage/v1/object/public/${BUCKET_NAME}/`)[1];
      if (relativeCloudPath) {
        await db.supabase.storage.from(BUCKET_NAME).remove([relativeCloudPath]);
      }
    }

    // Dọn dẹp các media files của room
    if (room.mediaHotspots && room.mediaHotspots.length > 0) {
      const mediaPathsToRemove = room.mediaHotspots
        .map(m => m.mediaUrl ? m.mediaUrl.split(`/storage/v1/object/public/${BUCKET_NAME}/`)[1] : null)
        .filter(Boolean);
        
      if (mediaPathsToRemove.length > 0) {
        await db.supabase.storage.from(BUCKET_NAME).remove(mediaPathsToRemove);
      }
    }

     console.log(`🗑️ Room ${roomId} and all cloud files deleted.`);
    await syncRoomToLocalJson(roomId);

    const user = req.user?.username || 'Admin';
    await createNotification(
      'room_delete',
      'Xóa phòng',
      `${user} đã xóa phòng '${room.name}'`,
      user
    ).catch(err => console.error("Error creating delete room notification:", err));

    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms:", err));
    }

    res.json({ success: true, message: "Room deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== MEDIA HOTSPOT MANAGEMENT ===== */

// Upload media file
router.post("/media/upload", uploadMediaWithJsonError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No media file uploaded" });
    }

    const localPath = req.file.path;
    const destPath = `uploads/media/${req.file.filename}`;
    
    // Upload lên Cloud Storage
    console.log(`📤 Uploading media file: ${destPath}`);
    const cloudUrl = await storage.uploadFile(localPath, destPath);
    
    // Xóa file local tạm
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }

    const mediaInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: cloudUrl,
      type: req.file.mimetype,
      size: req.file.size
    };

    console.log("📁 Media uploaded to Cloud:", mediaInfo.url);
    res.json({ success: true, media: mediaInfo });
  } catch (err) {
    console.error("❌ Media upload error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add media hotspot to room
router.post("/rooms/:roomId/media-hotspots", async (req, res) => {
  const roomId = Number(req.params.roomId);
  const { yaw, pitch, title, description, mediaUrl, mediaType, highlightPolygon, iconUrl, mediaItems } = req.body;

  if (yaw === undefined || yaw === null || yaw === "" ||
      pitch === undefined || pitch === null || pitch === "") {
    return res.status(400).json({ success: false, error: "Tọa độ yaw và pitch là bắt buộc" });
  }

  const cleanTitle = (title || "Tư liệu").trim();
  const effectiveMediaType = mediaType || "all";

  // Build composite payload if mediaItems or iconUrl are present
  let finalMediaUrl = mediaUrl || null;
  if (mediaItems || iconUrl) {
    const payload = {
      ...(mediaItems || {}),
      iconUrl: iconUrl || undefined,
      mediaUrl: mediaUrl || undefined,
      mediaType: effectiveMediaType
    };
    finalMediaUrl = JSON.stringify(payload);
  }

  try {
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    const { error } = await db.supabase.from('media_hotspots').insert({
      room_id: roomId,
      yaw: Number(yaw),
      pitch: Number(pitch),
      title: cleanTitle,
      description: description || "",
      media_url: finalMediaUrl,
      media_type: effectiveMediaType,
      highlight_polygon: highlightPolygon || null
    });

    if (error) throw error;

    await syncRoomToLocalJson(roomId);

    const user = req.user?.username || 'Admin';
    await createNotification(
      'media_add',
      'Thêm điểm tư liệu',
      `${user} đã thêm điểm tư liệu với tiêu đề '${cleanTitle}' tại phòng '${room.name}'`,
      user
    ).catch(err => console.error("Error creating media hotspot notification:", err));

    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms:", err));
    }

    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, mediaHotspots: updatedRoom.mediaHotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get media hotspots for a room
router.get("/rooms/:roomId/media-hotspots", async (req, res) => {
  const roomId = Number(req.params.roomId);
  try {
    await ensureRoomHotspotsSynced(roomId);
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }
    res.json({ success: true, mediaHotspots: room.mediaHotspots || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update media hotspot
router.patch("/rooms/:roomId/media-hotspots/:index", async (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);
  const { yaw, pitch, title, description, mediaUrl, mediaType, highlightPolygon, iconUrl, mediaItems } = req.body;

  try {
    await ensureRoomHotspotsSynced(roomId);
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    const { data: dbMedias, error: selectErr } = await db.supabase
      .from('media_hotspots')
      .select('id, media_url')
      .eq('room_id', roomId)
      .order('id', { ascending: true });

    if (selectErr) throw selectErr;

    if (!dbMedias || index < 0 || index >= dbMedias.length) {
      return res.status(400).json({ success: false, error: "Invalid media hotspot index" });
    }

    const mediaId = dbMedias[index].id;
    const oldMediaUrl = dbMedias[index].media_url;

    // Build composite payload if mediaItems or iconUrl are present
    let finalMediaUrl = mediaUrl;
    if (mediaItems !== undefined || iconUrl !== undefined) {
      let basePayload = {};
      if (oldMediaUrl && typeof oldMediaUrl === 'string' && (oldMediaUrl.startsWith('{') || oldMediaUrl.startsWith('{"'))) {
        try { basePayload = JSON.parse(oldMediaUrl); } catch {}
      }
      const payload = {
        ...basePayload,
        ...(mediaItems || {}),
        ...(iconUrl !== undefined ? { iconUrl: iconUrl || undefined } : {}),
        ...(mediaUrl !== undefined ? { mediaUrl: mediaUrl || undefined } : {}),
        mediaType: mediaType || basePayload.mediaType || "all"
      };
      finalMediaUrl = JSON.stringify(payload);
    }

    // Delete old file from Cloud Storage if updated with a new one
    if (finalMediaUrl !== undefined && finalMediaUrl !== oldMediaUrl && oldMediaUrl && !oldMediaUrl.startsWith('{')) {
      const relativeCloudPath = oldMediaUrl.split(`/storage/v1/object/public/${BUCKET_NAME}/`)[1];
      if (relativeCloudPath) {
        await db.supabase.storage.from(BUCKET_NAME).remove([relativeCloudPath]).catch(() => {});
      }
    }

    const updates = {};
    if (yaw !== undefined) updates.yaw = Number(yaw);
    if (pitch !== undefined) updates.pitch = Number(pitch);
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (finalMediaUrl !== undefined) updates.media_url = finalMediaUrl;
    if (mediaType !== undefined) updates.media_type = mediaType;
    if (highlightPolygon !== undefined) updates.highlight_polygon = highlightPolygon;

    const { error: updateErr } = await db.supabase
      .from('media_hotspots')
      .update(updates)
      .eq('id', mediaId);

    if (updateErr) throw updateErr;

    await syncRoomToLocalJson(roomId);

    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, mediaHotspots: updatedRoom.mediaHotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete media hotspot
router.delete("/rooms/:roomId/media-hotspots/:index", async (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);

  try {
    await ensureRoomHotspotsSynced(roomId);
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    const { data: dbMedias, error: selectErr } = await db.supabase
      .from('media_hotspots')
      .select('id, media_url')
      .eq('room_id', roomId)
      .order('id', { ascending: true });

    if (selectErr) throw selectErr;

    if (!dbMedias || index < 0 || index >= dbMedias.length) {
      return res.status(400).json({ success: false, error: "Invalid media hotspot index" });
    }

    const mediaId = dbMedias[index].id;
    const oldMediaUrl = dbMedias[index].media_url;

    // Delete file from Cloud Storage
    if (oldMediaUrl) {
      const relativeCloudPath = oldMediaUrl.split(`/storage/v1/object/public/${BUCKET_NAME}/`)[1];
      if (relativeCloudPath) {
        await db.supabase.storage.from(BUCKET_NAME).remove([relativeCloudPath]).catch(() => {});
      }
    }

    const { error: delErr } = await db.supabase
      .from('media_hotspots')
      .delete()
      .eq('id', mediaId);

    if (delErr) throw delErr;

    await syncRoomToLocalJson(roomId);

    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, mediaHotspots: updatedRoom.mediaHotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== MINIMAP MANAGEMENT ===== */

// Get minimap data
router.get("/minimap", async (req, res) => {
  try {
    const minimap = await getMinimap();
    const floorId = req.query.floor ? Number(req.query.floor) : null;
    
    if (floorId) {
      const floor = minimap.floors.find(f => f.id === floorId);
      if (!floor) {
        return res.status(404).json({ success: false, error: "Floor not found" });
      }
      res.json({ success: true, floor });
    } else {
      res.json({ success: true, minimap });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function to safely sync minimap data to Supabase minimaps/markers tables
async function syncMinimapToSupabase(floorIdNum, buildingName, imageUrl, buildingId, markers) {
  try {
    const upsertData = {
      floor_id: floorIdNum,
      floor_name: buildingName,
      image_url: imageUrl || ""
    };
    if (buildingId && buildingId !== '__unassigned__') {
      upsertData.building_id = buildingId;
    }
    
    const { error: floorErr } = await db.supabase.from('minimaps').upsert(upsertData);
    if (floorErr) {
      // Fallback without building_id if column doesn't exist in Supabase schema
      const fallbackData = {
        floor_id: floorIdNum,
        floor_name: buildingName,
        image_url: imageUrl || ""
      };
      await db.supabase.from('minimaps').upsert(fallbackData);
    }

    if (Array.isArray(markers)) {
      await db.supabase.from('minimap_markers').delete().eq('floor_id', floorIdNum);
      if (markers.length > 0) {
        const insertMarkers = markers.map(m => ({
          floor_id: floorIdNum,
          room_id: Number(m.roomId),
          x: Number(m.x),
          y: Number(m.y),
          rotation: Number(m.rotation) || 0
        }));
        await db.supabase.from('minimap_markers').insert(insertMarkers);
      }
    }
  } catch (e) {
    console.warn('Sync to minimaps table error:', e.message);
  }
}

// Upload minimap image for specific building/floor
router.post("/minimap/upload-image", uploadMinimap.single("minimap"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No minimap file uploaded" });
  }

  const localPath = req.file.path;
  const buildingId = req.body.buildingId || req.body.id || null;
  const buildingName = req.body.buildingName || req.body.floorName || (buildingId ? `Phân khu ${buildingId}` : "Sơ đồ");
  const destPath = `uploads/minimaps/minimap_${Date.now()}${path.extname(req.file.originalname)}`;

  try {
    // 1. Upload lên Cloud Storage
    const cloudUrl = await storage.uploadFile(localPath, destPath);
    
    // 2. Xóa file local tạm
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }

    // 3. Cập nhật vào config building_minimaps
    const LOCAL_BLDG_MAP_FILE = path.join(__dirname, '..', 'data', 'building-minimaps.json');
    let buildingMinimapsConfig = {};
    if (fs.existsSync(LOCAL_BLDG_MAP_FILE)) {
      try {
        buildingMinimapsConfig = JSON.parse(fs.readFileSync(LOCAL_BLDG_MAP_FILE, 'utf8')) || {};
      } catch {}
    }
    const key = buildingId || '__unassigned__';
    buildingMinimapsConfig[key] = {
      ...(buildingMinimapsConfig[key] || {}),
      image: cloudUrl
    };

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(LOCAL_BLDG_MAP_FILE, JSON.stringify(buildingMinimapsConfig, null, 2), 'utf8');
    await db.saveAppConfig('building_minimaps', buildingMinimapsConfig);

    // 4. Đồng bộ vào bảng minimaps
    const buildings = await db.getBuildings();
    const bldgIndex = Array.isArray(buildings) ? buildings.findIndex(b => b.id === buildingId) : -1;
    const floorIdNum = bldgIndex >= 0 ? bldgIndex + 1 : 1;
    await syncMinimapToSupabase(floorIdNum, buildingName, cloudUrl, buildingId);

    // 5. Broadcast SSE
    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms on minimap upload:", err));
    }

    const minimap = await getMinimap();
    const floor = minimap.floors.find(f => f.id === buildingId || f.buildingId === buildingId);
    
    res.json({ success: true, minimap, floor, imageUrl: cloudUrl });
  } catch (err) {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update building minimap image and markers
router.put("/minimap/building/:id", async (req, res) => {
  const buildingId = req.params.id;
  const { image, markers, buildingName } = req.body;

  try {
    // 1. Cập nhật vào config building_minimaps
    const LOCAL_BLDG_MAP_FILE = path.join(__dirname, '..', 'data', 'building-minimaps.json');
    const LOCAL_ROT_FILE = path.join(__dirname, '..', 'data', 'minimap-rotations.json');
    let buildingMinimapsConfig = {};
    let currentRotations = {};

    if (fs.existsSync(LOCAL_BLDG_MAP_FILE)) {
      try { buildingMinimapsConfig = JSON.parse(fs.readFileSync(LOCAL_BLDG_MAP_FILE, 'utf8')) || {}; } catch {}
    }
    if (fs.existsSync(LOCAL_ROT_FILE)) {
      try { currentRotations = JSON.parse(fs.readFileSync(LOCAL_ROT_FILE, 'utf8')) || {}; } catch {}
    }

    const key = buildingId || '__unassigned__';
    buildingMinimapsConfig[key] = {
      image: image || "",
      markers: markers || []
    };

    if (markers && markers.length > 0) {
      markers.forEach(m => {
        const rot = Number(m.rotation) || 0;
        currentRotations[m.roomId] = rot;
      });
    }

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(LOCAL_BLDG_MAP_FILE, JSON.stringify(buildingMinimapsConfig, null, 2), 'utf8');
    fs.writeFileSync(LOCAL_ROT_FILE, JSON.stringify(currentRotations, null, 2), 'utf8');
    await db.saveAppConfig('building_minimaps', buildingMinimapsConfig);
    await db.saveAppConfig('minimap_rotations', currentRotations);

    // 2. Đồng bộ DB
    const buildings = await db.getBuildings();
    const bldgIndex = Array.isArray(buildings) ? buildings.findIndex(b => b.id === buildingId) : -1;
    const floorIdNum = bldgIndex >= 0 ? bldgIndex + 1 : 1;
    const resolvedName = buildingName || (bldgIndex >= 0 ? buildings[bldgIndex].name : "Phân khu");
    await syncMinimapToSupabase(floorIdNum, resolvedName, image, buildingId, markers);

    // 3. Broadcast SSE
    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms on minimap save:", err));
    }

    const minimap = await getMinimap();
    res.json({ success: true, minimap });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update floor image and markers (Legacy fallback PUT /minimap/floor/:id)
router.put("/minimap/floor/:id", async (req, res) => {
  const floorId = req.params.id;
  const { image, markers, floorName, buildingId } = req.body;

  try {
    const targetBuildingId = buildingId || floorId;
    // Chuyển tiếp lưu theo building
    const LOCAL_BLDG_MAP_FILE = path.join(__dirname, '..', 'data', 'building-minimaps.json');
    let buildingMinimapsConfig = {};
    if (fs.existsSync(LOCAL_BLDG_MAP_FILE)) {
      try { buildingMinimapsConfig = JSON.parse(fs.readFileSync(LOCAL_BLDG_MAP_FILE, 'utf8')) || {}; } catch {}
    }
    const key = targetBuildingId || '__unassigned__';
    buildingMinimapsConfig[key] = {
      image: image || "",
      markers: markers || []
    };
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(LOCAL_BLDG_MAP_FILE, JSON.stringify(buildingMinimapsConfig, null, 2), 'utf8');
    await db.saveAppConfig('building_minimaps', buildingMinimapsConfig);

    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms on minimap floor save:", err));
    }

    const minimap = await getMinimap();
    res.json({ success: true, minimap });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save markers / positions on minimap
router.post("/minimap/save", async (req, res) => {
  const minimapData = req.body;
  if (!minimapData || !minimapData.floors) {
    return res.status(400).json({ success: false, error: "Invalid data format" });
  }

  try {
    await db.saveMinimap(minimapData);
    if (global.broadcastRooms) {
      await global.broadcastRooms().catch(err => console.error("Error broadcasting rooms on minimap save:", err));
    }
    res.json({ success: true, message: "Minimap markers saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== BUILDINGS MANAGEMENT ===== */

// GET buildings list
router.get("/buildings", async (req, res) => {
  try {
    const buildings = await getBuildings();
    res.json({ success: true, buildings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ADD building
router.post("/buildings", async (req, res) => {
  const { name } = req.body;
  if (!name || String(name).trim() === "") {
    return res.status(400).json({ success: false, error: "Building name is required" });
  }

  const newB = {
    id: `bldg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: String(name).trim(),
    createdAt: new Date().toISOString()
  };

  try {
    await db.insertBuilding(newB);

    const user = req.user?.username || 'Admin';
    await createNotification(
      'building_add',
      'Thêm phân khu',
      `${user} đã thêm phân khu mới '${newB.name}'`,
      user
    ).catch(err => console.error("Error creating building notification:", err));

    res.json({ success: true, building: newB });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE building (name)
const updateBuildingHandler = async (req, res) => {
  const bldgId = req.params.id;
  const { name } = req.body;
  if (!name || String(name).trim() === "") {
    return res.status(400).json({ success: false, error: "Building name is required" });
  }

  try {
    const buildings = await db.getBuildings();
    const bldg = buildings.find(b => b.id === bldgId);
    if (!bldg) {
      return res.status(404).json({ success: false, error: "Building not found" });
    }

    const updatedName = String(name).trim();
    await db.updateBuilding(bldgId, { name: updatedName });

    const user = req.user?.username || 'Admin';
    await createNotification(
      'building_update',
      'Đổi tên phân khu',
      `${user} đã đổi tên phân khu '${bldg.name}' thành '${updatedName}'`,
      user
    ).catch(err => console.error("Error creating building update notification:", err));

    res.json({ success: true, building: { ...bldg, name: updatedName } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

router.put("/buildings/:id", updateBuildingHandler);
router.patch("/buildings/:id", updateBuildingHandler);

// ASSIGN rooms to building
router.post("/buildings/:id/assign-rooms", async (req, res) => {
  const bldgId = req.params.id;
  const rawRoomIds = req.body.roomIds;

  if (!Array.isArray(rawRoomIds)) {
    return res.status(400).json({ success: false, error: "roomIds must be an array" });
  }

  const targetRoomIds = new Set(rawRoomIds.map(id => Number(id)));

  try {
    const buildings = await db.getBuildings();
    const bldg = buildings.find(b => b.id === bldgId);
    if (!bldg) {
      return res.status(404).json({ success: false, error: "Building not found" });
    }

    const allRooms = await db.getRooms();
    const errors = [];

    for (const room of allRooms) {
      const roomId = Number(room.id);
      const isSelected = targetRoomIds.has(roomId);
      const currentlyInBldg = room.buildingId === bldgId;

      if (isSelected && !currentlyInBldg) {
        try {
          await db.updateRoom(roomId, { buildingId: bldgId });
        } catch (err) {
          errors.push(`Phòng "${room.name}": ${err.message}`);
        }
      } else if (!isSelected && currentlyInBldg) {
        try {
          await db.updateRoom(roomId, { buildingId: null });
        } catch (err) {
          errors.push(`Phòng "${room.name}": ${err.message}`);
        }
      }
    }

    const user = req.user?.username || 'Admin';
    await createNotification(
      'building_assign',
      'Gán phòng vào phân khu',
      `${user} đã cập nhật danh sách phòng cho phân khu '${bldg.name}'`,
      user
    ).catch(err => console.error("Error creating building assign notification:", err));

    res.json({ success: true, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE building
router.delete("/buildings/:id", async (req, res) => {
  const bldgId = req.params.id;

  try {
    const buildings = await db.getBuildings();
    const bldg = buildings.find(b => b.id === bldgId);
    const bldgName = bldg ? bldg.name : bldgId;

    // Unassign rooms from this building
    const allRooms = await db.getRooms();
    for (const room of allRooms) {
      if (room.buildingId === bldgId) {
        await db.updateRoom(room.id, { buildingId: null }).catch(() => {});
      }
    }

    await db.deleteBuilding(bldgId);

    const user = req.user?.username || 'Admin';
    await createNotification(
      'building_delete',
      'Xóa phân khu',
      `${user} đã xóa phân khu '${bldgName}'`,
      user
    ).catch(err => console.error("Error creating delete building notification:", err));

    res.json({ success: true, message: "Building deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== TOUR SCENARIOS ===== */

// GET tour scenario
router.get("/tour-scenario", async (req, res) => {
  try {
    const scenario = await db.getAppConfig('tour_scenario');
    res.json({ success: true, scenario: scenario || {} });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SAVE tour scenario
router.post("/tour-scenario", async (req, res) => {
  const scenario = req.body;
  try {
    await db.saveAppConfig('tour_scenario', scenario);
    res.json({ success: true, message: "Tour scenario saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== STALL TEMPLATES (DATABASE SUPABASE / POSTGRESQL) ===== */

// GET all stall templates from database
router.get("/stall-templates", async (req, res) => {
  try {
    const templates = await db.getStallTemplates();
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CREATE a new stall template in database
router.post("/stall-templates", async (req, res) => {
  try {
    const { name, icon, badge, themeColor, avatar, sidebarTitle, sidebarContent, sections } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập tên mẫu sạp" });
    }

    const templates = await db.getStallTemplates();
    const newId = req.body.id || `stall_tpl_${Date.now()}`;
    
    // Check if ID already exists
    const existingIndex = templates.findIndex(t => t.id === newId);
    const newTemplate = {
      id: newId,
      name: name.trim(),
      icon: icon || "🏪",
      badge: badge || "",
      themeColor: themeColor || "#0d3834",
      avatar: avatar || "",
      sidebarTitle: sidebarTitle || "CAM KẾT CHẤT LƯỢNG",
      sidebarContent: sidebarContent || "",
      sections: Array.isArray(sections) ? sections : []
    };

    if (existingIndex >= 0) {
      templates[existingIndex] = newTemplate;
    } else {
      templates.push(newTemplate);
    }

    await db.saveStallTemplates(templates);
    res.json({ success: true, template: newTemplate, message: "Đã lưu mẫu sạp vào cơ sở dữ liệu thành công!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE existing stall template in database
router.put("/stall-templates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { name, icon, badge, themeColor, avatar, sidebarTitle, sidebarContent, sections } = req.body;

    const templates = await db.getStallTemplates();
    const index = templates.findIndex(t => t.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, error: "Không tìm thấy mẫu sạp cần sửa" });
    }

    templates[index] = {
      ...templates[index],
      name: name ? name.trim() : templates[index].name,
      icon: icon !== undefined ? icon : templates[index].icon,
      badge: badge !== undefined ? badge : templates[index].badge,
      themeColor: themeColor !== undefined ? themeColor : templates[index].themeColor,
      avatar: avatar !== undefined ? avatar : templates[index].avatar,
      sidebarTitle: sidebarTitle !== undefined ? sidebarTitle : templates[index].sidebarTitle,
      sidebarContent: sidebarContent !== undefined ? sidebarContent : templates[index].sidebarContent,
      sections: Array.isArray(sections) ? sections : templates[index].sections
    };

    await db.saveStallTemplates(templates);
    res.json({ success: true, template: templates[index], message: "Cập nhật mẫu sạp trong cơ sở dữ liệu thành công!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a stall template from database
router.delete("/stall-templates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let templates = await db.getStallTemplates();
    const beforeCount = templates.length;
    templates = templates.filter(t => t.id !== id);

    if (templates.length === beforeCount) {
      return res.status(404).json({ success: false, error: "Không tìm thấy mẫu sạp cần xóa" });
    }

    await db.deleteStallTemplate(id);
    await db.saveStallTemplates(templates);
    res.json({ success: true, message: "Đã xóa mẫu sạp khỏi cơ sở dữ liệu thành công!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RESET stall templates to default in database
router.post("/stall-templates/reset", async (req, res) => {
  try {
    const defaultPath = path.join(__dirname, '../data/stall-templates.json');
    let defaultTemplates = [];
    if (fs.existsSync(defaultPath)) {
      defaultTemplates = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
    }
    await db.saveStallTemplates(defaultTemplates);
    res.json({ success: true, templates: defaultTemplates, message: "Đã khôi phục các mẫu sạp mặc định trong cơ sở dữ liệu!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== API CONFIG (ADMIN) ===== */

// GET API config (Protected: Admin only)
router.get("/api-config", requireRole("admin"), async (req, res) => {
  try {
    const config = await db.getAppConfig('api_config');
    res.json({ success: true, config: config || {} });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SAVE API config (Protected: Admin only)
router.post("/api-config", requireRole("admin"), async (req, res) => {
  const config = req.body;
  try {
    await db.saveAppConfig('api_config', config);
    res.json({ success: true, message: "API Configuration saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== USER MANAGEMENT (Protected: Admin only) ===== */
router.get("/users", requireRole("admin"), async (req, res) => {
  try {
    const users = await db.getUsers();
    // Exclude password hash from response
    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      displayName: u.display_name,
      created_at: u.created_at,
      last_login: u.last_login
    }));
    res.json({ success: true, users: safeUsers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/users", requireRole("admin"), async (req, res) => {
  try {
    const { username, password, role, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ success: false, error: "Username already exists" });
    }

    const passwordHash = hashPassword(password);
    const newUser = await db.createUser({
      username,
      passwordHash,
      role: role || "user",
      displayName: displayName || username
    });

    res.json({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch("/users/:id", requireRole("admin"), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { password, role, displayName } = req.body;

    // Prevent changing role of the logged in admin themselves
    if (req.user.id === userId && role && role !== req.user.role) {
      return res.status(400).json({ success: false, error: "Cannot change your own role" });
    }

    const updates = {};
    if (password) {
      updates.passwordHash = hashPassword(password);
    }
    if (role) {
      updates.role = role;
    }
    if (displayName) {
      updates.displayName = displayName;
    }

    await db.updateUser(userId, updates);
    res.json({ success: true, message: "User updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/users/:id", requireRole("admin"), async (req, res) => {
  try {
    const userId = Number(req.params.id);

    // Prevent deleting self
    if (req.user.id === userId) {
      return res.status(400).json({ success: false, error: "Cannot delete your own account" });
    }

    await db.deleteUser(userId);
    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===== INVITATION ROUTES (ADMIN ONLY) ===== */
function getInviteBaseUrl(req) {
  const customUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (customUrl) {
    return customUrl.replace(/\/+$/, "");
  }
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:3000";
  return `${protocol}://${host}`;
}

router.get("/invitations", requireRole("admin"), async (req, res) => {
  try {
    const list = await db.getInvitations();
    res.json({ success: true, invitations: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/invitations", requireRole("admin"), async (req, res) => {
  try {
    const { email, role } = req.body;
    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await db.getUserByUsername(cleanEmail);
    if (existingUser) {
      return res.status(400).json({ success: false, error: `Email "${cleanEmail}" đã được đăng ký tài khoản trên hệ thống.` });
    }

    const validRole = ["admin", "collaborator", "user"].includes(role) ? role : "collaborator";
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h

    const newInvite = {
      id: Date.now(),
      email: email.trim(),
      role: validRole,
      token,
      expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
      createdBy: req.user?.username || "admin"
    };

    const invitations = await db.getInvitations();
    invitations.push(newInvite);
    await db.saveInvitations(invitations);

    const baseUrl = getInviteBaseUrl(req);
    const inviteLink = `${baseUrl}/admin/invite-register.html?token=${token}`;

    let emailSent = false;
    let emailError = null;

    // Send email using SMTP or HTTP API via mail-helper
    try {
      await mailHelper.sendMailRaw({
        to: email,
        subject: "Lời mời đăng ký tài khoản Virtual Tour 360",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1e1e2d; color: #ffffff; border-radius: 12px;">
            <h2 style="color: #6366f1; text-align: center;">Lời mời đăng ký tài khoản</h2>
            <p>Xin chào,</p>
            <p>Bạn đã được mời khởi tạo tài khoản trên hệ thống <strong>Virtual Tour 360</strong> với vai trò: <strong style="color: #a5b4fc;">${validRole.toUpperCase()}</strong>.</p>
            <p>Vui lòng nhấn vào nút bên dưới để hoàn tất thiết lập tài khoản của bạn (Link có hiệu lực trong 48 giờ):</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Đăng ký tài khoản ngay</a>
            </div>
            <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">Hoặc copy đường dẫn sau: <br>${inviteLink}</p>
            <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
            <p style="font-size: 12px; color: #64748b; text-align: center;">Qi Technologies · Virtual Tour Manager</p>
          </div>
        `
      });
      emailSent = true;
    } catch (mailErr) {
      console.error("[Mail Error] Failed to send invitation email:", mailErr.message);
      emailError = mailErr.message;
    }

    res.json({
      success: true,
      message: emailSent ? "Đã gửi mail mời đăng ký thành công!" : "Đã tạo link mời đăng ký thành công (chưa gửi email).",
      inviteLink,
      emailSent,
      emailError
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/invitations/:id", requireRole("admin"), async (req, res) => {
  try {
    const inviteId = Number(req.params.id);
    let invitations = await db.getInvitations();
    invitations = invitations.filter(inv => Number(inv.id) !== inviteId);
    await db.saveInvitations(invitations);
    res.json({ success: true, message: "Đã thu hồi lời mời thành công!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/invitations/:id/resend", requireRole("admin"), async (req, res) => {
  try {
    const inviteId = Number(req.params.id);
    const invitations = await db.getInvitations();
    const inv = invitations.find(i => Number(i.id) === inviteId);

    if (!inv) {
      return res.status(404).json({ success: false, error: "Không tìm thấy thông tin lời mời." });
    }

    // Gia hạn thêm 48 tiếng
    inv.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    inv.used = false;
    await db.saveInvitations(invitations);

    const baseUrl = getInviteBaseUrl(req);
    const inviteLink = `${baseUrl}/admin/invite-register.html?token=${inv.token}`;

    let emailSent = false;
    let emailError = null;

    try {
      await mailHelper.sendMailRaw({
        to: inv.email,
        subject: "Gia hạn lời mời đăng ký tài khoản Virtual Tour 360",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1e1e2d; color: #ffffff; border-radius: 12px;">
            <h2 style="color: #6366f1; text-align: center;">Gia hạn Lời mời đăng ký tài khoản</h2>
            <p>Xin chào,</p>
            <p>Lời mời khởi tạo tài khoản trên hệ thống <strong>Virtual Tour 360</strong> của bạn đã được gia hạn thêm 48 giờ.</p>
            <p>Vui lòng nhấn vào nút bên dưới để đăng ký ngay:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Đăng ký tài khoản ngay</a>
            </div>
            <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">Link đăng ký: <br>${inviteLink}</p>
            <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
            <p style="font-size: 12px; color: #64748b; text-align: center;">Qi Technologies · Virtual Tour Manager</p>
          </div>
        `
      });
      emailSent = true;
    } catch (mailErr) {
      console.error("[Mail Error] Failed to resend invitation email:", mailErr.message);
      emailError = mailErr.message;
    }

    res.json({
      success: true,
      message: emailSent ? "Đã gửi lại Email lời mời thành công!" : "Đã gia hạn lời mời thành công (chưa gửi được email tự động).",
      inviteLink,
      emailSent,
      emailError
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

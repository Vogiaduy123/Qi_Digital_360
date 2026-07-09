/**
 * Admin API Routes
 * Handles panorama upload and hotspot management
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { generateCubeTiles } = require("../generate-tiles");
const db = require("./db");
const storage = require("./storage");
const { requireRole, hashPassword } = require("./auth");

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

      // 1. Upload ảnh gốc panorama lên Supabase Storage và lấy Public Cloud URL
      const destPanoramaPath = imageRelPath.replace(/^\//, ''); 
      console.log(`📤 Uploading panorama to Storage: ${destPanoramaPath}`);
      const cloudImageUrl = await storage.uploadFile(rawPath, destPanoramaPath);

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
      const room = {
        id: timestamp,
        name: roomNameInput,
        image: cloudImageUrl,
        tilesPath: cloudTilesUrl,   // Full Supabase Storage URL
        tilesConfig: config,
        floor: req.body.floor ? Number(req.body.floor) : 1,
        hotspots: []
      };
      
      if (buildingId) {
        room.buildingId = buildingId;
      }

      await db.insertRoom(room);
      console.log("💾 Room saved to Supabase Database");
      await syncRoomToLocalJson(room.id);

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

// ADD hotspot
router.post("/rooms/:roomId/hotspots", async (req, res) => {
  const roomId = Number(req.params.roomId);
  const { yaw, pitch, target, rotation, color, iconUrl } = req.body;

  if ([yaw, pitch, target].some(v => v === undefined || v === null || v === "")) {
    return res.status(400).json({ success: false, error: "Missing yaw/pitch/target" });
  }

  try {
    const room = await db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    const { error } = await db.supabase.from('hotspots').insert({
      room_id: roomId,
      yaw: Number(yaw),
      pitch: Number(pitch),
      target_room_id: Number(target),
      rotation: rotation !== undefined ? Number(rotation) : 0,
      color: color || null,
      icon_url: iconUrl || null
    });

    if (error) throw error;

    await syncRoomToLocalJson(roomId);

    const updatedRoom = await db.getRoomById(roomId);
    res.json({ success: true, hotspots: updatedRoom.hotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE hotspot
router.patch("/rooms/:roomId/hotspots/:index", async (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);
  const { yaw, pitch, target, rotation, color, iconUrl } = req.body;

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

    const { error: updateErr } = await db.supabase
      .from('hotspots')
      .update(updates)
      .eq('id', hotspotId);

    if (updateErr) throw updateErr;

    await syncRoomToLocalJson(roomId);

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
  const { yaw, pitch, title, description, mediaUrl, mediaType, highlightPolygon } = req.body;

  if (yaw === undefined || yaw === null || yaw === "" ||
      pitch === undefined || pitch === null || pitch === "" ||
      title === undefined || title === null || title === "" ||
      mediaType === undefined || mediaType === null || mediaType === "") {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  if (mediaType !== 'note' && (mediaUrl === undefined || mediaUrl === null || mediaUrl === "")) {
    return res.status(400).json({ success: false, error: "mediaUrl is required for this media type" });
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
      title: title,
      description: description || "",
      media_url: mediaUrl || null,
      media_type: mediaType,
      highlight_polygon: highlightPolygon || null
    });

    if (error) throw error;

    await syncRoomToLocalJson(roomId);

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
  const { yaw, pitch, title, description, mediaUrl, mediaType, highlightPolygon } = req.body;

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

    // Delete old file from Cloud Storage if updated with a new one
    if (mediaUrl !== undefined && mediaUrl !== oldMediaUrl && oldMediaUrl) {
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
    if (mediaUrl !== undefined) updates.media_url = mediaUrl;
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

// Upload minimap image for specific floor
router.post("/minimap/upload-image", uploadMinimap.single("minimap"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No minimap file uploaded" });
  }

  const localPath = req.file.path;
  const floorId = req.body.floorId ? Number(req.body.floorId) : 1;
  const floorName = req.body.floorName || `Tầng ${floorId}`;
  const destPath = `uploads/minimaps/minimap_${Date.now()}${path.extname(req.file.originalname)}`;

  try {
    // 1. Upload lên Cloud Storage
    const cloudUrl = await storage.uploadFile(localPath, destPath);
    
    // 2. Xóa file local tạm
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }

    // 3. Cập nhật hoặc thêm tầng vào bảng minimaps
    const { error } = await db.supabase
      .from('minimaps')
      .upsert({
        floor_id: floorId,
        floor_name: floorName,
        image_url: cloudUrl
      });

    if (error) throw error;

    const minimap = await getMinimap();
    const floor = minimap.floors.find(f => f.id === floorId);
    
    res.json({ success: true, floor });
  } catch (err) {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
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
    res.json({ success: true, building: newB });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE building
router.delete("/buildings/:id", async (req, res) => {
  const bldgId = req.params.id;

  try {
    await db.deleteBuilding(bldgId);
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

module.exports = router;

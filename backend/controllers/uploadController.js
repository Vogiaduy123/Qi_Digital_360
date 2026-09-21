const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { generateCubeTiles } = require("../services/tileService");
const storage = require("../services/storageService");
const db = require("../db");
const { UPLOADS_DIR } = require("../config/env");
const { broadcastRooms, broadcastCustomIcons, getCustomIcons } = require("./sseController");
const BuildingModel = require("../models/buildingModel");

const BUCKET_NAME = "virtual-tour-assets";

class UploadController {
  // POST /api/admin/upload-panorama
  static async uploadPanorama(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No panorama file uploaded" });
      }

      let rawPath = req.file.path;
      const timestamp = Date.now();
      let outputDir = path.join("backend", "tiles", timestamp.toString());
      const roomNameInput = req.body.name || `Room ${new Date().toLocaleDateString("vi-VN")}`;
      let imageRelPath = "/uploads/" + req.file.filename;
      let tilesRelPath = `tiles/${timestamp}`;
      const buildingId = req.body.buildingId;

      if (buildingId) {
        const buildings = await BuildingModel.getAll();
        const building = buildings.find(b => b.id === buildingId);
        if (building) {
          const bName = building.name;
          const bUploadsDir = path.join(UPLOADS_DIR, bName);
          if (!fs.existsSync(bUploadsDir)) fs.mkdirSync(bUploadsDir, { recursive: true });

          const bTilesDir = path.join(__dirname, "..", "tiles", bName);
          if (!fs.existsSync(bTilesDir)) fs.mkdirSync(bTilesDir, { recursive: true });

          const newRawPath = path.join(bUploadsDir, req.file.filename);
          if (fs.existsSync(rawPath)) {
            fs.renameSync(rawPath, newRawPath);
            rawPath = newRawPath;
          }

          outputDir = path.join("backend", "tiles", bName, timestamp.toString());
          const safeBName = storage.sanitizePath(bName);
          imageRelPath = `/uploads/${safeBName}/${req.file.filename}`;
          tilesRelPath = `tiles/${safeBName}/${timestamp}`;
        }
      }

      const config = await generateCubeTiles(rawPath, outputDir);

      // Tối ưu ảnh panorama
      const optimizedRawPath = path.join(path.dirname(rawPath), "opt_" + path.basename(rawPath));
      await sharp(rawPath)
        .resize({ width: 6000, withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toFile(optimizedRawPath);

      const destPanoramaPath = imageRelPath.replace(/^\//, "");
      const cloudImageUrl = await storage.uploadFile(optimizedRawPath, destPanoramaPath);

      if (fs.existsSync(optimizedRawPath)) {
        fs.unlinkSync(optimizedRawPath);
      }

      await storage.uploadFolder(outputDir, tilesRelPath);

      if (fs.existsSync(rawPath)) {
        fs.unlinkSync(rawPath);
      }

      const cleanTilesPath = storage.sanitizePath(tilesRelPath);
      const { data: tileUrlData } = db.supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(cleanTilesPath);
      const cloudTilesUrl = tileUrlData.publicUrl;

      let orderIndex = req.body.orderIndex !== undefined && req.body.orderIndex !== "" ? Number(req.body.orderIndex) : undefined;
      if (orderIndex === undefined || isNaN(orderIndex)) {
        const existingRooms = await db.getRooms();
        const maxOrder = existingRooms.reduce((max, r) => Math.max(max, r.orderIndex || 0), 0);
        orderIndex = maxOrder + 1;
      }

      const newRoom = {
        id: timestamp,
        name: roomNameInput,
        image: cloudImageUrl || imageRelPath,
        tilesPath: cloudTilesUrl || tilesRelPath,
        tilesConfig: config,
        floor: req.body.floor ? Number(req.body.floor) : 1,
        buildingId: buildingId || null,
        orderIndex: orderIndex,
        hotspots: [],
        mediaHotspots: [],
        mailHotspots: []
      };

      await db.saveRoom(newRoom);
      await broadcastRooms();

      res.json({
        success: true,
        room: newRoom,
        message: "Panorama uploaded and tiles generated successfully"
      });
    } catch (err) {
      console.error("Panorama upload error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/media/upload
  static async uploadMedia(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "Chưa chọn file để tải lên" });
      }

      let cloudUrl = null;
      try {
        const destPath = `media/${Date.now()}_${storage.sanitizePath(req.file.originalname)}`;
        cloudUrl = await storage.uploadFile(req.file.path, destPath);
      } catch (uploadErr) {
        console.warn("⚠️ Upload to Supabase Storage failed, using local URL:", uploadErr.message);
      }

      const fileUrl = cloudUrl || `/uploads/media/${req.file.filename}`;

      res.json({
        success: true,
        fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/custom-icons/upload
  static async uploadCustomIcon(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "Chưa chọn file icon" });
      }

      const iconKey = req.body.iconKey;
      if (!iconKey) {
        return res.status(400).json({ success: false, error: "Thiếu iconKey" });
      }

      let cloudUrl = null;
      try {
        const destPath = `custom_icons/${Date.now()}_${storage.sanitizePath(req.file.originalname)}`;
        cloudUrl = await storage.uploadFile(req.file.path, destPath);
      } catch (err) {
        console.warn("⚠️ Upload custom icon to Supabase Storage failed, fallback local:", err.message);
      }

      const iconUrl = cloudUrl || `/uploads/custom_icons/${req.file.filename}`;
      const currentIcons = await getCustomIcons();
      currentIcons[iconKey] = iconUrl;
      await db.saveAppConfig("custom_icons", currentIcons);
      await broadcastCustomIcons(currentIcons);

      res.json({ success: true, iconKey, iconUrl, icons: currentIcons });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = UploadController;

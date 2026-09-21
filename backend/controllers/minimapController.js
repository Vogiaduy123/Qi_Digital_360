const MinimapModel = require("../models/minimapModel");
const db = require("../db");
const storage = require("../services/storageService");
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("../config/env");

async function syncMinimapToSupabase(floorIdNum, buildingName, imageUrl, buildingId, markers) {
  try {
    const upsertData = {
      floor_id: floorIdNum,
      floor_name: buildingName,
      image_url: imageUrl || ""
    };
    if (buildingId && buildingId !== "__unassigned__") {
      upsertData.building_id = buildingId;
    }

    const { error: floorErr } = await db.supabase.from("minimaps").upsert(upsertData);
    if (floorErr) {
      const fallbackData = {
        floor_id: floorIdNum,
        floor_name: buildingName,
        image_url: imageUrl || ""
      };
      await db.supabase.from("minimaps").upsert(fallbackData);
    }

    if (Array.isArray(markers)) {
      await db.supabase.from("minimap_markers").delete().eq("floor_id", floorIdNum);
      if (markers.length > 0) {
        const insertMarkers = markers.map(m => ({
          floor_id: floorIdNum,
          room_id: Number(m.roomId),
          x: Number(m.x),
          y: Number(m.y),
          rotation: Number(m.rotation) || 0
        }));
        await db.supabase.from("minimap_markers").insert(insertMarkers);
      }
    }
  } catch (e) {
    console.warn("Sync to minimaps table error:", e.message);
  }
}

class MinimapController {
  // GET /api/minimap
  static async getMinimap(req, res) {
    try {
      const minimap = await MinimapModel.getMinimap();
      res.json(minimap);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/admin/minimap
  static async getAdminMinimap(req, res) {
    try {
      const minimap = await MinimapModel.getMinimap();
      const floorId = req.query.floor ? Number(req.query.floor) : null;

      if (floorId) {
        const floor = minimap.floors ? minimap.floors.find(f => f.id === floorId) : null;
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
  }

  // POST /api/admin/minimap/save
  static async saveMinimap(req, res) {
    const { floors } = req.body;
    if (!Array.isArray(floors)) {
      return res.status(400).json({ success: false, error: "floors must be an array" });
    }

    try {
      await MinimapModel.saveMinimap({ floors });
      res.json({ success: true, message: "Minimap saved successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/minimap/upload-image
  static async uploadImage(req, res) {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No minimap file uploaded" });
    }

    const localPath = req.file.path;
    const buildingId = req.body.buildingId || req.body.id || null;
    const buildingName = req.body.buildingName || req.body.floorName || (buildingId ? `Phân khu ${buildingId}` : "Sơ đồ");
    const destPath = `uploads/minimaps/minimap_${Date.now()}${path.extname(req.file.originalname)}`;

    try {
      const cloudUrl = await storage.uploadFile(localPath, destPath);

      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }

      const LOCAL_BLDG_MAP_FILE = path.join(DATA_DIR, "building-minimaps.json");
      let buildingMinimapsConfig = {};
      if (fs.existsSync(LOCAL_BLDG_MAP_FILE)) {
        try {
          buildingMinimapsConfig = JSON.parse(fs.readFileSync(LOCAL_BLDG_MAP_FILE, "utf8")) || {};
        } catch {}
      }

      const key = buildingId || "__default__";
      buildingMinimapsConfig[key] = {
        ...(buildingMinimapsConfig[key] || {}),
        image: cloudUrl,
        name: buildingName
      };

      fs.writeFileSync(LOCAL_BLDG_MAP_FILE, JSON.stringify(buildingMinimapsConfig, null, 2), "utf8");
      await db.saveAppConfig("building_minimaps", buildingMinimapsConfig);

      const floorIdNum = Number(req.body.floorId) || 1;
      await syncMinimapToSupabase(floorIdNum, buildingName, cloudUrl, buildingId, null);

      res.json({
        success: true,
        imageUrl: cloudUrl,
        buildingId,
        message: "Minimap image uploaded successfully"
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PUT /api/admin/minimap/building/:id
  static async updateBuildingMinimap(req, res) {
    try {
      await MinimapModel.updateBuildingMinimap(req.params.id, req.body);
      res.json({ success: true, message: "Building minimap updated successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PUT /api/admin/minimap/floor/:id
  static async updateFloorMinimap(req, res) {
    try {
      await MinimapModel.updateFloorMinimap(req.params.id, req.body);
      res.json({ success: true, message: "Floor minimap updated successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = MinimapController;

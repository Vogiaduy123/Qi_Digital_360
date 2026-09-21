const RoomModel = require("../models/roomModel");
const db = require("../db");
const { broadcastRooms } = require("./sseController");
const path = require("path");
const fs = require("fs");
const { DATA_DIR } = require("../config/env");

const BUCKET_NAME = "virtual-tour-assets";

async function syncRoomToLocalJson(targetRoomId = null) {
  try {
    const allRooms = await db.getRooms();
    const localRoomsFile = path.join(DATA_DIR, "rooms.json");
    fs.writeFileSync(localRoomsFile, JSON.stringify(allRooms, null, 2), "utf8");
    await broadcastRooms();
  } catch (err) {
    console.warn("⚠️ Failed to sync room to local JSON:", err.message);
  }
}

class AdminRoomController {
  // GET /api/admin/rooms
  static async getRooms(req, res) {
    try {
      const rooms = await RoomModel.getAll();
      res.json({ success: true, rooms });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PATCH /api/admin/rooms/:roomId
  static async updateRoom(req, res) {
    const roomId = Number(req.params.roomId);
    const { name, buildingId, floor } = req.body;

    try {
      const room = await RoomModel.getById(roomId);
      if (!room) {
        return res.status(404).json({ success: false, error: "Room not found" });
      }

      const updates = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (buildingId !== undefined) updates.buildingId = buildingId || null;
      if (floor !== undefined) updates.floor = Number(floor);

      await RoomModel.update(roomId, updates);
      await syncRoomToLocalJson(roomId);
      const updatedRoom = await RoomModel.getById(roomId);
      res.json({ success: true, room: updatedRoom });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/admin/rooms/:roomId
  static async deleteRoom(req, res) {
    const roomId = Number(req.params.roomId);

    try {
      const room = await RoomModel.getById(roomId);
      if (!room) {
        return res.status(404).json({ success: false, error: "Room not found" });
      }

      // 1. Xóa khỏi Database
      await RoomModel.delete(roomId);

      // 2. Dọn dẹp storage nếu có
      if (room.tilesPath) {
        try {
          const { data: files } = await db.supabase.storage
            .from(BUCKET_NAME)
            .list(room.tilesPath);

          if (files && files.length > 0) {
            const filesToRemove = files.map(f => `${room.tilesPath}/${f.name}`);
            await db.supabase.storage.from(BUCKET_NAME).remove(filesToRemove);
          }
        } catch {}
      }

      if (room.image) {
        try {
          const relativeCloudPath = room.image.split(`/storage/v1/object/public/${BUCKET_NAME}/`)[1];
          if (relativeCloudPath) {
            await db.supabase.storage.from(BUCKET_NAME).remove([relativeCloudPath]);
          }
        } catch {}
      }

      await syncRoomToLocalJson(roomId);
      res.json({ success: true, message: `Room ${roomId} deleted successfully` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/rooms (User-facing create room handler from server.js)
  static async createRoom(req, res) {
    const { name, floor } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: "Missing room name" });
    }

    const roomId = Date.now();
    const imagePath = req.file ? `/uploads/${req.file.filename}` : "";

    const newRoom = {
      id: roomId,
      name: String(name).trim(),
      floor: floor ? Number(floor) : 1,
      image: imagePath,
      hotspots: [],
      mediaHotspots: [],
      mailHotspots: []
    };

    try {
      await RoomModel.create(newRoom);
      await syncRoomToLocalJson(roomId);
      res.json({ success: true, room: newRoom });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = AdminRoomController;

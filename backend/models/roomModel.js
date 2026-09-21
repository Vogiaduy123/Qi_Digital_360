const db = require("../db");
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("../config/env");

const LOCAL_ROOMS_FILE = path.join(DATA_DIR, "rooms.json");

function readLocalRooms() {
  try {
    if (!fs.existsSync(LOCAL_ROOMS_FILE)) return [];
    const data = fs.readFileSync(LOCAL_ROOMS_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.warn("⚠️ Failed to read local rooms.json:", err.message);
    return [];
  }
}

function writeLocalRooms(rooms) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_ROOMS_FILE, JSON.stringify(rooms, null, 2), "utf8");
  } catch (err) {
    console.warn("⚠️ Failed to write local rooms.json:", err.message);
  }
}

class RoomModel {
  static async getAll() {
    return await db.getRooms();
  }

  static async getById(id) {
    return await db.getRoomById(Number(id));
  }

  static async create(roomData) {
    return await db.saveRoom(roomData);
  }

  static async update(id, updates) {
    return await db.updateRoom(Number(id), updates);
  }

  static async delete(id) {
    return await db.deleteRoom(Number(id));
  }

  static async reorder(orders) {
    return await db.reorderRooms(orders);
  }

  // --- Hotspots Navigation ---
  static async addHotspot(roomId, hotspot) {
    return await db.addHotspot(Number(roomId), hotspot);
  }

  static async updateHotspot(roomId, index, hotspot) {
    return await db.updateHotspot(Number(roomId), Number(index), hotspot);
  }

  static async deleteHotspot(roomId, index) {
    return await db.deleteHotspot(Number(roomId), Number(index));
  }

  // --- Media Hotspots ---
  static async addMediaHotspot(roomId, mediaHotspot) {
    return await db.addMediaHotspot(Number(roomId), mediaHotspot);
  }

  static async updateMediaHotspot(roomId, index, mediaHotspot) {
    return await db.updateMediaHotspot(Number(roomId), Number(index), mediaHotspot);
  }

  static async deleteMediaHotspot(roomId, index) {
    return await db.deleteMediaHotspot(Number(roomId), Number(index));
  }

  // --- Mail Hotspots ---
  static async getMailHotspots(roomId) {
    const room = await db.getRoomById(Number(roomId));
    return room ? (room.mailHotspots || []) : [];
  }

  static async addMailHotspot(roomId, mailHotspot) {
    return await db.addMailHotspot(Number(roomId), mailHotspot);
  }

  static async updateMailHotspot(roomId, index, mailHotspot) {
    return await db.updateMailHotspot(Number(roomId), Number(index), mailHotspot);
  }

  static async deleteMailHotspot(roomId, index) {
    return await db.deleteMailHotspot(Number(roomId), Number(index));
  }

  // Direct access to local fallback if needed
  static readLocalRooms() {
    return readLocalRooms();
  }

  static writeLocalRooms(rooms) {
    return writeLocalRooms(rooms);
  }
}

module.exports = RoomModel;

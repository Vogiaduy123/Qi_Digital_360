const BuildingModel = require("../models/buildingModel");
const { broadcastRooms } = require("./sseController");

class BuildingController {
  // GET /api/buildings (public)
  static async getPublicBuildings(req, res) {
    try {
      const buildings = await BuildingModel.getAll();
      res.json({ success: true, buildings });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/admin/buildings
  static async getAdminBuildings(req, res) {
    try {
      const buildings = await BuildingModel.getAll();
      res.json({ success: true, buildings });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/buildings
  static async createBuilding(req, res) {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, error: "Tên phân khu không được để trống" });
    }

    try {
      const newBuilding = await BuildingModel.create({ name: name.trim() });
      await broadcastRooms();
      res.json({ success: true, building: newBuilding });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PUT & PATCH /api/admin/buildings/:id
  static async updateBuilding(req, res) {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, error: "Tên phân khu không được để trống" });
    }

    try {
      const updated = await BuildingModel.update(id, { name: name.trim() });
      await broadcastRooms();
      res.json({ success: true, building: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/buildings/:id/assign-rooms
  static async assignRooms(req, res) {
    const { id } = req.params;
    const { roomIds } = req.body;

    if (!Array.isArray(roomIds)) {
      return res.status(400).json({ success: false, error: "roomIds must be an array" });
    }

    try {
      await BuildingModel.assignRooms(id, roomIds);
      await broadcastRooms();
      res.json({ success: true, message: "Rooms assigned successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/admin/buildings/:id
  static async deleteBuilding(req, res) {
    const { id } = req.params;

    try {
      await BuildingModel.delete(id);
      await broadcastRooms();
      res.json({ success: true, message: "Building deleted successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = BuildingController;

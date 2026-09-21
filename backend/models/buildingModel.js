const db = require("../db");

class BuildingModel {
  static async getAll() {
    return await db.getBuildings();
  }

  static async getById(id) {
    return await db.getBuildingById(id);
  }

  static async create(data) {
    return await db.createBuilding(data);
  }

  static async update(id, updates) {
    return await db.updateBuilding(id, updates);
  }

  static async delete(id) {
    return await db.deleteBuilding(id);
  }

  static async assignRooms(buildingId, roomIds) {
    return await db.assignRoomsToBuilding(buildingId, roomIds);
  }
}

module.exports = BuildingModel;

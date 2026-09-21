const db = require("../db");

class MinimapModel {
  static async getMinimap() {
    return await db.getMinimap();
  }

  static async saveMinimap(minimapData) {
    return await db.saveMinimap(minimapData);
  }

  static async updateBuildingMinimap(id, data) {
    return await db.updateBuildingMinimap(id, data);
  }

  static async updateFloorMinimap(id, data) {
    return await db.updateFloorMinimap(id, data);
  }
}

module.exports = MinimapModel;

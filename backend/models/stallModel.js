const db = require("../db");

class StallModel {
  static async getAll() {
    return await db.getStallTemplates();
  }

  static async saveAll(templates) {
    return await db.saveStallTemplates(templates);
  }

  static async delete(id) {
    return await db.deleteStallTemplate(id);
  }
}

module.exports = StallModel;

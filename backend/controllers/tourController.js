const db = require("../db");

async function getStoredTourScenarios() {
  try {
    const list = await db.getAppConfig("tour_scenarios");
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {}

  try {
    const legacy = await db.getAppConfig("tour_scenario");
    if (legacy && typeof legacy === "object") {
      return [{
        id: legacy.id || Date.now(),
        name: legacy.name || "Kịch bản mặc định",
        description: legacy.description || "",
        isDefault: true,
        cameraPanDuration: legacy.cameraPanDuration || 8000,
        stops: Array.isArray(legacy.stops) ? legacy.stops : []
      }];
    }
  } catch {}

  return [];
}

class TourController {
  // GET /api/admin/tour-scenarios
  static async getScenarios(req, res) {
    try {
      const scenarios = await getStoredTourScenarios();
      res.json({ success: true, scenarios });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/tour-scenarios
  static async saveScenarios(req, res) {
    try {
      let scenarios = await getStoredTourScenarios();
      const body = req.body;

      if (Array.isArray(body)) {
        scenarios = body;
      } else if (body && Array.isArray(body.scenarios)) {
        scenarios = body.scenarios;
      } else if (body && body.id) {
        const idx = scenarios.findIndex(s => String(s.id) === String(body.id));
        if (idx >= 0) {
          scenarios[idx] = { ...scenarios[idx], ...body };
        } else {
          scenarios.push(body);
        }
      } else if (body && body.name) {
        const newScenario = {
          id: Date.now(),
          name: body.name || "Kịch bản mới",
          description: body.description || "",
          isDefault: scenarios.length === 0,
          cameraPanDuration: Number(body.cameraPanDuration) || 8000,
          stops: Array.isArray(body.stops) ? body.stops : []
        };
        scenarios.push(newScenario);
      }

      if (!scenarios.some(s => s.isDefault) && scenarios.length > 0) {
        scenarios[0].isDefault = true;
      }

      await db.saveAppConfig("tour_scenarios", scenarios);
      const defaultScenario = scenarios.find(s => s.isDefault) || scenarios[0] || {};
      await db.saveAppConfig("tour_scenario", defaultScenario);

      res.json({ success: true, message: "Đã lưu kịch bản thành công", scenarios });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/tour-scenarios/:id/set-default
  static async setDefaultScenario(req, res) {
    try {
      const scenarioId = req.params.id;
      let scenarios = await getStoredTourScenarios();
      let found = false;

      scenarios = scenarios.map(s => {
        if (String(s.id) === String(scenarioId)) {
          found = true;
          return { ...s, isDefault: true };
        }
        return { ...s, isDefault: false };
      });

      if (!found) {
        return res.status(404).json({ success: false, error: "Không tìm thấy kịch bản" });
      }

      await db.saveAppConfig("tour_scenarios", scenarios);
      const active = scenarios.find(s => s.isDefault);
      if (active) {
        await db.saveAppConfig("tour_scenario", active);
      }

      res.json({ success: true, message: "Đã đặt kịch bản mặc định", scenarios });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/admin/tour-scenarios/:id
  static async deleteScenario(req, res) {
    try {
      const scenarioId = req.params.id;
      let scenarios = await getStoredTourScenarios();
      if (scenarios.length <= 1) {
        return res.status(400).json({ success: false, error: "Không thể xóa kịch bản duy nhất còn lại" });
      }

      const wasDefault = scenarios.find(s => String(s.id) === String(scenarioId))?.isDefault;
      scenarios = scenarios.filter(s => String(s.id) !== String(scenarioId));

      if (wasDefault && scenarios.length > 0) {
        scenarios[0].isDefault = true;
      }

      await db.saveAppConfig("tour_scenarios", scenarios);
      const active = scenarios.find(s => s.isDefault) || scenarios[0] || {};
      await db.saveAppConfig("tour_scenario", active);

      res.json({ success: true, message: "Đã xóa kịch bản", scenarios });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/admin/tour-scenario (legacy compatibility)
  static async getLegacyScenario(req, res) {
    try {
      const scenarios = await getStoredTourScenarios();
      const active = scenarios.find(s => s.isDefault) || scenarios[0] || {};
      res.json({ success: true, scenario: active });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/tour-scenario (legacy compatibility)
  static async saveLegacyScenario(req, res) {
    try {
      const scenario = req.body;
      await db.saveAppConfig("tour_scenario", scenario);

      let scenarios = await getStoredTourScenarios();
      const idx = scenarios.findIndex(s => s.id === scenario.id || s.isDefault);
      if (idx >= 0) {
        scenarios[idx] = { ...scenarios[idx], ...scenario, isDefault: true };
      } else {
        scenarios.push({ ...scenario, isDefault: true });
      }
      await db.saveAppConfig("tour_scenarios", scenarios);

      res.json({ success: true, message: "Đã lưu kịch bản", scenario });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = TourController;

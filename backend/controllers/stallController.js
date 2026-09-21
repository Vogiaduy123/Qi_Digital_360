const StallModel = require("../models/stallModel");
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("../config/env");

class StallController {
  // GET /api/stall-templates (public)
  static async getPublicTemplates(req, res) {
    try {
      const templates = await StallModel.getAll();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/admin/stall-templates
  static async getAdminTemplates(req, res) {
    try {
      const templates = await StallModel.getAll();
      res.json({ success: true, templates });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/stall-templates (save/upsert/replace)
  static async saveTemplates(req, res) {
    try {
      const body = req.body;
      let templates = await StallModel.getAll();

      if (Array.isArray(body)) {
        templates = body;
      } else if (body && Array.isArray(body.templates)) {
        templates = body.templates;
      } else if (body && body.id) {
        const idx = templates.findIndex(t => t.id === body.id);
        if (idx >= 0) {
          templates[idx] = { ...templates[idx], ...body };
        } else {
          templates.push(body);
        }
      }

      await StallModel.saveAll(templates);
      res.json({ success: true, message: "Đã lưu mẫu sạp thành công", templates });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PUT /api/admin/stall-templates/:id
  static async updateTemplate(req, res) {
    const { id } = req.params;
    const { name, icon, badge, themeColor, avatar, sidebarTitle, sidebarContent, sections } = req.body;

    try {
      let templates = await StallModel.getAll();
      const index = templates.findIndex(t => t.id === id);

      if (index === -1) {
        return res.status(404).json({ success: false, error: "Không tìm thấy mẫu sạp cần sửa" });
      }

      templates[index] = {
        ...templates[index],
        name: name ? name.trim() : templates[index].name,
        icon: icon !== undefined ? icon : templates[index].icon,
        badge: badge !== undefined ? badge : templates[index].badge,
        themeColor: themeColor !== undefined ? themeColor : templates[index].themeColor,
        avatar: avatar !== undefined ? avatar : templates[index].avatar,
        sidebarTitle: sidebarTitle !== undefined ? sidebarTitle : templates[index].sidebarTitle,
        sidebarContent: sidebarContent !== undefined ? sidebarContent : templates[index].sidebarContent,
        sections: Array.isArray(sections) ? sections : templates[index].sections
      };

      await StallModel.saveAll(templates);
      res.json({ success: true, template: templates[index], message: "Cập nhật mẫu sạp thành công!" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/admin/stall-templates/:id
  static async deleteTemplate(req, res) {
    const { id } = req.params;
    try {
      let templates = await StallModel.getAll();
      const beforeCount = templates.length;
      templates = templates.filter(t => t.id !== id);

      if (templates.length === beforeCount) {
        return res.status(404).json({ success: false, error: "Không tìm thấy mẫu sạp cần xóa" });
      }

      await StallModel.delete(id);
      await StallModel.saveAll(templates);
      res.json({ success: true, message: "Đã xóa mẫu sạp thành công!" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/stall-templates/reset
  static async resetTemplates(req, res) {
    try {
      const defaultPath = path.join(DATA_DIR, "stall-templates.json");
      let defaultTemplates = [];
      if (fs.existsSync(defaultPath)) {
        defaultTemplates = JSON.parse(fs.readFileSync(defaultPath, "utf8"));
      }
      await StallModel.saveAll(defaultTemplates);
      res.json({
        success: true,
        templates: defaultTemplates,
        message: "Đã khôi phục các mẫu sạp mặc định thành công!"
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = StallController;

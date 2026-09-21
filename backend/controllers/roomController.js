const RoomModel = require("../models/roomModel");
const { verifyToken } = require("../services/authService");
const { broadcastRooms, broadcastCustomIcons, getCustomIcons } = require("./sseController");
const db = require("../db");

function obfuscateEmail(email) {
  if (!email || typeof email !== "string") return "";
  const parts = email.split("@");
  if (parts.length !== 2) return "***@***.***";
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0] || "*"}***@${domain}`;
  }
  return `${local.substring(0, 2)}***${local.slice(-1)}@${domain}`;
}

class RoomController {
  // GET /api/rooms
  static async getRooms(req, res) {
    try {
      const rooms = await RoomModel.getAll();

      let token = null;
      if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
      } else if (req.cookies && req.cookies.vt_token) {
        token = req.cookies.vt_token;
      }

      let isManager = false;
      if (token) {
        const decoded = verifyToken(token);
        if (decoded && (decoded.role === "admin" || decoded.role === "collaborator")) {
          isManager = true;
        }
      }

      const safeRooms = rooms.map(room => {
        if (!room.mailHotspots || room.mailHotspots.length === 0) return room;
        return {
          ...room,
          mailHotspots: room.mailHotspots.map(h => ({
            ...h,
            recipient: isManager ? h.recipient : obfuscateEmail(h.recipient)
          }))
        };
      });

      res.json(safeRooms);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/rooms/reorder
  static async reorderRooms(req, res) {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: "orderedIds must be an array" });
    }

    try {
      await Promise.all(
        orderedIds.map((roomId, index) => db.updateRoomOrder(Number(roomId), index))
      );

      await broadcastRooms();

      res.json({ success: true, message: "Room order updated successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/custom-icons
  static async getCustomIcons(req, res) {
    try {
      const icons = await getCustomIcons();
      res.json({ success: true, icons });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/custom-icons/save
  static async saveCustomIcons(req, res) {
    try {
      const { icons } = req.body;
      if (!icons || typeof icons !== "object") {
        return res.status(400).json({ success: false, error: "Dữ liệu icons không hợp lệ" });
      }

      await db.saveAppConfig("custom_icons", icons);
      await broadcastCustomIcons(icons);

      res.json({ success: true, message: "Đã lưu cấu hình custom icons", icons });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = RoomController;

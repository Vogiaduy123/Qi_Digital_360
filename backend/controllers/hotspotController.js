const db = require("../db");
const { broadcastRooms } = require("./sseController");
const { createNotification } = require("../services/notificationService");

class HotspotController {
  // --- NAVIGATION HOTSPOTS ---

  // POST & PUT /api/rooms/:id/hotspots OR /api/admin/rooms/:roomId/hotspots
  static async addNavigationHotspot(req, res) {
    const roomId = Number(req.params.id || req.params.roomId);
    const { yaw, pitch, target, rotation, color, initialYaw, initialPitch } = req.body;

    if ([yaw, pitch, target].some(v => v === undefined || v === null || v === "")) {
      return res.status(400).json({ success: false, error: "Missing yaw/pitch/target" });
    }

    try {
      const room = await db.getRoomById(roomId);
      if (!room) return res.status(404).json({ success: false, error: "Room not found" });

      const insertPayload = {
        room_id: roomId,
        yaw: Number(yaw),
        pitch: Number(pitch),
        target_room_id: Number(target),
        rotation: rotation !== undefined ? Number(rotation) : 0,
        color: color || null
      };
      if (initialYaw !== undefined && initialYaw !== null && initialYaw !== "") {
        insertPayload.initial_yaw = Number(initialYaw);
      }
      if (initialPitch !== undefined && initialPitch !== null && initialPitch !== "") {
        insertPayload.initial_pitch = Number(initialPitch);
      }

      const { error } = await db.supabase.from("hotspots").insert(insertPayload);
      if (error) throw error;

      const user = req.user?.username || "Collaborator";
      const targetRoom = await db.getRoomById(target);
      const targetRoomName = targetRoom ? targetRoom.name : target;

      await createNotification(
        "hotspot_add",
        "Thêm liên kết phòng",
        `${user} đã thêm điểm di chuyển từ '${room.name}' đến '${targetRoomName}'`,
        user
      );

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PATCH /api/rooms/:id/hotspots/:index OR /api/admin/rooms/:roomId/hotspots/:index
  static async updateNavigationHotspot(req, res) {
    const roomId = Number(req.params.id || req.params.roomId);
    const index = Number(req.params.index);
    const { yaw, pitch, target, rotation, color, initialYaw, initialPitch } = req.body;

    try {
      const { data: dbHotspots, error: selErr } = await db.supabase
        .from("hotspots")
        .select("id")
        .eq("room_id", roomId)
        .order("id", { ascending: true });

      if (selErr) throw selErr;
      if (!dbHotspots || index < 0 || index >= dbHotspots.length) {
        return res.status(400).json({ success: false, error: "Invalid hotspot index" });
      }

      const updateData = {};
      if (yaw !== undefined) updateData.yaw = Number(yaw);
      if (pitch !== undefined) updateData.pitch = Number(pitch);
      if (target !== undefined) updateData.target_room_id = Number(target);
      if (rotation !== undefined) updateData.rotation = Number(rotation);
      if (color !== undefined) updateData.color = color || null;
      if (initialYaw !== undefined) updateData.initial_yaw = (initialYaw !== null && initialYaw !== "") ? Number(initialYaw) : null;
      if (initialPitch !== undefined) updateData.initial_pitch = (initialPitch !== null && initialPitch !== "") ? Number(initialPitch) : null;

      const { error: updErr } = await db.supabase
        .from("hotspots")
        .update(updateData)
        .eq("id", dbHotspots[index].id);

      if (updErr) throw updErr;

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/rooms/:id/hotspots/:index OR /api/admin/rooms/:roomId/hotspots/:index
  static async deleteNavigationHotspot(req, res) {
    const roomId = Number(req.params.id || req.params.roomId);
    const index = Number(req.params.index);

    try {
      const { data: dbHotspots, error: selErr } = await db.supabase
        .from("hotspots")
        .select("id")
        .eq("room_id", roomId)
        .order("id", { ascending: true });

      if (selErr) throw selErr;
      if (!dbHotspots || index < 0 || index >= dbHotspots.length) {
        return res.status(400).json({ success: false, error: "Invalid hotspot index" });
      }

      const { error: delErr } = await db.supabase
        .from("hotspots")
        .delete()
        .eq("id", dbHotspots[index].id);

      if (delErr) throw delErr;

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- MEDIA HOTSPOTS ---

  // GET /api/admin/rooms/:roomId/media-hotspots
  static async getMediaHotspots(req, res) {
    const roomId = Number(req.params.roomId);
    try {
      const room = await db.getRoomById(roomId);
      if (!room) return res.status(404).json({ success: false, error: "Room not found" });
      res.json({ success: true, mediaHotspots: room.mediaHotspots || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/rooms/:roomId/media-hotspots
  static async addMediaHotspot(req, res) {
    const roomId = Number(req.params.roomId);
    const {
      yaw, pitch, title, description, mediaUrl, mediaType,
      customIconUrl, galleryImages, stallConfig, highlightPolygon
    } = req.body;

    if (yaw === undefined || pitch === undefined || !mediaType) {
      return res.status(400).json({ success: false, error: "Missing required fields: yaw, pitch, mediaType" });
    }

    try {
      const { error } = await db.supabase.from("media_hotspots").insert({
        room_id: roomId,
        yaw: Number(yaw),
        pitch: Number(pitch),
        title: title || "",
        description: description || "",
        media_url: mediaUrl || "",
        media_type: mediaType,
        custom_icon_url: customIconUrl || null,
        gallery_images: galleryImages || null,
        stall_config: stallConfig || null,
        highlight_polygon: highlightPolygon || null
      });

      if (error) throw error;

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom, mediaHotspots: updatedRoom.mediaHotspots || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PATCH /api/admin/rooms/:roomId/media-hotspots/:index
  static async updateMediaHotspot(req, res) {
    const roomId = Number(req.params.roomId);
    const index = Number(req.params.index);

    try {
      const { data: dbMedias, error: selErr } = await db.supabase
        .from("media_hotspots")
        .select("id")
        .eq("room_id", roomId)
        .order("id", { ascending: true });

      if (selErr) throw selErr;
      if (!dbMedias || index < 0 || index >= dbMedias.length) {
        return res.status(400).json({ success: false, error: "Invalid media hotspot index" });
      }

      const fields = req.body;
      const updateData = {};
      if (fields.yaw !== undefined) updateData.yaw = Number(fields.yaw);
      if (fields.pitch !== undefined) updateData.pitch = Number(fields.pitch);
      if (fields.title !== undefined) updateData.title = fields.title;
      if (fields.description !== undefined) updateData.description = fields.description;
      if (fields.mediaUrl !== undefined) updateData.media_url = fields.mediaUrl;
      if (fields.mediaType !== undefined) updateData.media_type = fields.mediaType;
      if (fields.customIconUrl !== undefined) updateData.custom_icon_url = fields.customIconUrl || null;
      if (fields.galleryImages !== undefined) updateData.gallery_images = fields.galleryImages || null;
      if (fields.stallConfig !== undefined) updateData.stall_config = fields.stallConfig || null;
      if (fields.highlightPolygon !== undefined) updateData.highlight_polygon = fields.highlightPolygon || null;

      const { error: updErr } = await db.supabase
        .from("media_hotspots")
        .update(updateData)
        .eq("id", dbMedias[index].id);

      if (updErr) throw updErr;

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom, mediaHotspots: updatedRoom.mediaHotspots || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/admin/rooms/:roomId/media-hotspots/:index
  static async deleteMediaHotspot(req, res) {
    const roomId = Number(req.params.roomId);
    const index = Number(req.params.index);

    try {
      const { data: dbMedias, error: selErr } = await db.supabase
        .from("media_hotspots")
        .select("id")
        .eq("room_id", roomId)
        .order("id", { ascending: true });

      if (selErr) throw selErr;
      if (!dbMedias || index < 0 || index >= dbMedias.length) {
        return res.status(400).json({ success: false, error: "Invalid media hotspot index" });
      }

      const { error: delErr } = await db.supabase
        .from("media_hotspots")
        .delete()
        .eq("id", dbMedias[index].id);

      if (delErr) throw delErr;

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom, mediaHotspots: updatedRoom.mediaHotspots || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- MAIL HOTSPOTS ---

  // GET /api/rooms/:id/mail-hotspots
  static async getMailHotspots(req, res) {
    const roomId = Number(req.params.id);
    try {
      const room = await db.getRoomById(roomId);
      if (!room) return res.status(404).json({ success: false, error: "Room not found" });
      res.json({ success: true, mailHotspots: room.mailHotspots || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/rooms/:id/mail-hotspots
  static async addMailHotspot(req, res) {
    const roomId = Number(req.params.id);
    const { yaw, pitch, recipient, title, description } = req.body;

    if (yaw === undefined || pitch === undefined || !recipient) {
      return res.status(400).json({ success: false, error: "Missing yaw/pitch/recipient" });
    }

    try {
      const { error } = await db.supabase.from("mail_hotspots").insert({
        room_id: roomId,
        yaw: Number(yaw),
        pitch: Number(pitch),
        recipient: String(recipient).trim(),
        title: title || "Gửi Email",
        description: description || ""
      });

      if (error) throw error;

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PATCH /api/rooms/:id/mail-hotspots/:index
  static async updateMailHotspot(req, res) {
    const roomId = Number(req.params.id);
    const index = Number(req.params.index);

    try {
      const { data: dbMails, error: selErr } = await db.supabase
        .from("mail_hotspots")
        .select("id")
        .eq("room_id", roomId)
        .order("id", { ascending: true });

      if (selErr) throw selErr;
      if (!dbMails || index < 0 || index >= dbMails.length) {
        return res.status(400).json({ success: false, error: "Invalid mail hotspot index" });
      }

      const fields = req.body;
      const updateData = {};
      if (fields.yaw !== undefined) updateData.yaw = Number(fields.yaw);
      if (fields.pitch !== undefined) updateData.pitch = Number(fields.pitch);
      if (fields.recipient !== undefined) updateData.recipient = String(fields.recipient).trim();
      if (fields.title !== undefined) updateData.title = fields.title;
      if (fields.description !== undefined) updateData.description = fields.description;

      const { error: updErr } = await db.supabase
        .from("mail_hotspots")
        .update(updateData)
        .eq("id", dbMails[index].id);

      if (updErr) throw updErr;

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/rooms/:id/mail-hotspots/:index
  static async deleteMailHotspot(req, res) {
    const roomId = Number(req.params.id);
    const index = Number(req.params.index);

    try {
      const { data: dbMails, error: selErr } = await db.supabase
        .from("mail_hotspots")
        .select("id")
        .eq("room_id", roomId)
        .order("id", { ascending: true });

      if (selErr) throw selErr;
      if (!dbMails || index < 0 || index >= dbMails.length) {
        return res.status(400).json({ success: false, error: "Invalid mail hotspot index" });
      }

      const { error: delErr } = await db.supabase
        .from("mail_hotspots")
        .delete()
        .eq("id", dbMails[index].id);

      if (delErr) throw delErr;

      await broadcastRooms();
      const updatedRoom = await db.getRoomById(roomId);
      res.json({ success: true, room: updatedRoom });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = HotspotController;

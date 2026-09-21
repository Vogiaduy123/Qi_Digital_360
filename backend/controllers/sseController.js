const RoomModel = require("../models/roomModel");
const SensorModel = require("../models/sensorModel");
const NotificationModel = require("../models/notificationModel");
const db = require("../db");

const sseClients = new Set();

async function getCustomIcons() {
  try {
    const config = await db.getAppConfig("custom_icons");
    if (config && typeof config === "object") return config;
  } catch {}
  return {
    nav_arrow: "",
    media_note: "",
    media_image: "",
    media_pdf: "",
    media_video: "",
    media_3d: "",
    media_gallery: "",
    media_youtube: "",
    media_web: "",
    mail: "",
    sensor: "",
    camera: ""
  };
}

async function broadcastRooms() {
  try {
    const payload = JSON.stringify(await RoomModel.getAll());
    const message = `event: rooms\ndata: ${payload}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(message);
      } catch {
        sseClients.delete(res);
      }
    }
  } catch (err) {
    console.error("Error in broadcastRooms:", err.message);
  }
}

async function broadcastSensors() {
  try {
    const payload = JSON.stringify(await SensorModel.getAll());
    const message = `event: sensors\ndata: ${payload}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(message);
      } catch {
        sseClients.delete(res);
      }
    }
  } catch (err) {
    console.error("Error in broadcastSensors:", err.message);
  }
}

async function broadcastCustomIcons(config) {
  try {
    const payload = JSON.stringify(config || await getCustomIcons());
    const message = `event: custom_icons\ndata: ${payload}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(message);
      } catch {
        sseClients.delete(res);
      }
    }
  } catch (err) {
    console.error("Error in broadcastCustomIcons:", err.message);
  }
}

async function broadcastNotifications(notifications) {
  try {
    const payload = JSON.stringify(notifications || await NotificationModel.getAll());
    const message = `event: notifications\ndata: ${payload}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(message);
      } catch {
        sseClients.delete(res);
      }
    }
  } catch (err) {
    console.error("Error in broadcastNotifications:", err.message);
  }
}

// Global hook compatibility
global.broadcastRooms = broadcastRooms;
global.broadcastSensors = broadcastSensors;

async function handleSseConnection(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  sseClients.add(res);

  try {
    // 1. Send initial rooms snapshot
    const initialRooms = JSON.stringify(await RoomModel.getAll());
    res.write(`event: rooms\ndata: ${initialRooms}\n\n`);

    // 2. Send initial sensors snapshot
    const initialSensors = JSON.stringify(await SensorModel.getAll());
    res.write(`event: sensors\ndata: ${initialSensors}\n\n`);

    // 3. Send initial custom icons snapshot
    const initialIcons = JSON.stringify(await getCustomIcons());
    res.write(`event: custom_icons\ndata: ${initialIcons}\n\n`);

    // 4. Send initial notifications snapshot
    const initialNotifs = JSON.stringify(await NotificationModel.getAll());
    res.write(`event: notifications\ndata: ${initialNotifs}\n\n`);
  } catch (err) {
    console.error("Error sending initial SSE payloads:", err.message);
  }

  req.on("close", () => {
    sseClients.delete(res);
  });
}

module.exports = {
  handleSseConnection,
  broadcastRooms,
  broadcastSensors,
  broadcastCustomIcons,
  broadcastNotifications,
  getCustomIcons,
  sseClients
};

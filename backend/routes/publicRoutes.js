const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const { loginRateLimiter } = require("../middlewares/loginRateLimiter");
const { sensitiveOpLimiter } = require("../middlewares/apiRateLimiter");
const requireRole = require("../middlewares/roleGuard");
const { upload, uploadCustomIcon } = require("../middlewares/uploadMiddleware");

const RoomController = require("../controllers/roomController");
const AdminRoomController = require("../controllers/adminRoomController");
const HotspotController = require("../controllers/hotspotController");
const SensorController = require("../controllers/sensorController");
const MinimapController = require("../controllers/minimapController");
const BuildingController = require("../controllers/buildingController");
const StallController = require("../controllers/stallController");
const MailController = require("../controllers/mailController");
const AuthController = require("../controllers/authController");
const NotificationController = require("../controllers/notificationController");

// --- ROOMS & HOTSPOTS ---
router.get("/rooms", RoomController.getRooms);
router.post("/rooms", authMiddleware, requireRole("admin", "collaborator"), upload.single("image"), AdminRoomController.createRoom);
router.post("/rooms/reorder", authMiddleware, requireRole("admin", "collaborator"), RoomController.reorderRooms);

router.put("/rooms/:id/hotspots", authMiddleware, requireRole("admin", "collaborator"), HotspotController.addNavigationHotspot);
router.post("/rooms/:id/hotspots", authMiddleware, requireRole("admin", "collaborator"), HotspotController.addNavigationHotspot);
router.patch("/rooms/:id/hotspots/:index", authMiddleware, requireRole("admin", "collaborator"), HotspotController.updateNavigationHotspot);
router.delete("/rooms/:id/hotspots/:index", authMiddleware, requireRole("admin", "collaborator"), HotspotController.deleteNavigationHotspot);

router.get("/rooms/:id/mail-hotspots", authMiddleware, HotspotController.getMailHotspots);
router.post("/rooms/:id/mail-hotspots", authMiddleware, requireRole("admin", "collaborator"), HotspotController.addMailHotspot);
router.patch("/rooms/:id/mail-hotspots/:index", authMiddleware, requireRole("admin", "collaborator"), HotspotController.updateMailHotspot);
router.delete("/rooms/:id/mail-hotspots/:index", authMiddleware, requireRole("admin", "collaborator"), HotspotController.deleteMailHotspot);

router.get("/rooms/:roomId/api-config", authMiddleware, requireRole("admin", "collaborator"), SensorController.getRoomApiConfig);
router.post("/rooms/:roomId/api-config", authMiddleware, requireRole("admin", "collaborator"), SensorController.saveRoomApiConfig);

// --- SENSORS & REAL-TIME DATA ---
router.get("/sensors", SensorController.getSensors);
router.get("/sensors/:id", SensorController.getSensorById);
router.post("/sensors", authMiddleware, requireRole("admin", "collaborator"), SensorController.createSensor);
router.put("/sensors/:id", authMiddleware, requireRole("admin", "collaborator"), SensorController.updateSensor);
router.delete("/sensors/:id", authMiddleware, requireRole("admin", "collaborator"), SensorController.deleteSensor);

// Camera RTSP to WebRTC conversion — requires auth to prevent SSRF
router.post("/camera/convert-rtsp", authMiddleware, SensorController.convertRtsp);

// Protected realtime sensor update
router.post("/sensors/realtime-update", authMiddleware, SensorController.updateRealtime);

router.get("/real-data/combined", SensorController.getCombinedData);
// Protected custom combined real-data config
router.post("/real-data/combined/custom", authMiddleware, requireRole("admin", "collaborator"), SensorController.getCustomCombinedData);
router.get("/real-data/pm25", SensorController.getPm25Data);

router.get("/config/api", authMiddleware, requireRole("admin"), SensorController.getGlobalApiConfig);
router.post("/config/api", authMiddleware, requireRole("admin"), SensorController.saveGlobalApiConfig);

// --- BUILDINGS, MINIMAP, STALLS & NOTIFICATIONS ---
router.get("/buildings", BuildingController.getPublicBuildings);
router.get("/minimap", MinimapController.getMinimap);
router.get("/stall-templates", StallController.getPublicTemplates);
router.get("/notifications", authMiddleware, NotificationController.getNotifications);

// --- CUSTOM HOTSPOT ICONS ---
router.get("/custom-icons", RoomController.getCustomIcons);
router.post("/custom-icons/upload", authMiddleware, requireRole("admin"), uploadCustomIcon.single("icon"), require("../controllers/uploadController").uploadCustomIcon);
router.post("/custom-icons/save", authMiddleware, requireRole("admin"), RoomController.saveCustomIcons);

// --- EMAIL ---
// Protected: Only authenticated users can send mail
router.post("/send-mail", authMiddleware, MailController.sendMail);
router.post("/mail/send", authMiddleware, MailController.sendMail);

// --- AUTH & ACCOUNT ---
router.get("/auth/setup-status", AuthController.getSetupStatus);
router.post("/auth/setup", sensitiveOpLimiter, AuthController.setupAdmin);
router.post("/auth/login", loginRateLimiter, AuthController.login);
router.post("/auth/logout", AuthController.logout);
router.get("/auth/me", authMiddleware, AuthController.getMe);
router.post("/auth/me/profile", authMiddleware, AuthController.updateProfile);
router.get("/auth/invitations/verify", sensitiveOpLimiter, AuthController.verifyInvitation);
router.post("/auth/invitations/accept", sensitiveOpLimiter, AuthController.acceptInvitation);

module.exports = router;

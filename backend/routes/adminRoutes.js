const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/roleGuard");
const {
  uploadPanorama,
  uploadMinimap,
  uploadMediaWithJsonError
} = require("../middlewares/uploadMiddleware");

const AdminRoomController = require("../controllers/adminRoomController");
const RoomController = require("../controllers/roomController");
const HotspotController = require("../controllers/hotspotController");
const UploadController = require("../controllers/uploadController");
const MinimapController = require("../controllers/minimapController");
const BuildingController = require("../controllers/buildingController");
const TourController = require("../controllers/tourController");
const SensorController = require("../controllers/sensorController");
const StallController = require("../controllers/stallController");
const AuthController = require("../controllers/authController");
const db = require("../db");

// Apply Auth & Role Guard to ALL admin routes
router.use(authMiddleware, requireRole("admin", "collaborator"));

// --- ROOMS MANAGEMENT ---
router.get("/rooms", AdminRoomController.getRooms);
router.post("/rooms/reorder", RoomController.reorderRooms);
router.patch("/rooms/:roomId", AdminRoomController.updateRoom);
router.delete("/rooms/:roomId", AdminRoomController.deleteRoom);
router.post("/upload-panorama", uploadPanorama.single("panorama"), UploadController.uploadPanorama);

// --- NAVIGATION HOTSPOTS ---
router.get("/rooms/:roomId/hotspots", async (req, res) => {
  try {
    const room = await db.getRoomById(Number(req.params.roomId));
    if (!room) return res.status(404).json({ success: false, error: "Room not found" });
    res.json({ success: true, hotspots: room.hotspots || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
router.post("/rooms/:roomId/hotspots", HotspotController.addNavigationHotspot);
router.put("/rooms/:roomId/hotspots", HotspotController.addNavigationHotspot);
router.patch("/rooms/:roomId/hotspots/:index", HotspotController.updateNavigationHotspot);
router.delete("/rooms/:roomId/hotspots/:index", HotspotController.deleteNavigationHotspot);

// --- MEDIA HOTSPOTS ---
router.post("/media/upload", uploadMediaWithJsonError, UploadController.uploadMedia);
router.get("/rooms/:roomId/media-hotspots", HotspotController.getMediaHotspots);
router.post("/rooms/:roomId/media-hotspots", HotspotController.addMediaHotspot);
router.patch("/rooms/:roomId/media-hotspots/:index", HotspotController.updateMediaHotspot);
router.delete("/rooms/:roomId/media-hotspots/:index", HotspotController.deleteMediaHotspot);

// --- MINIMAP MANAGEMENT ---
router.get("/minimap", MinimapController.getAdminMinimap);
router.post("/minimap/save", MinimapController.saveMinimap);
router.post("/minimap/upload-image", uploadMinimap.single("minimap"), MinimapController.uploadImage);
router.put("/minimap/building/:id", MinimapController.updateBuildingMinimap);
router.put("/minimap/floor/:id", MinimapController.updateFloorMinimap);

// --- BUILDINGS MANAGEMENT ---
router.get("/buildings", BuildingController.getAdminBuildings);
router.post("/buildings", BuildingController.createBuilding);
router.put("/buildings/:id", BuildingController.updateBuilding);
router.patch("/buildings/:id", BuildingController.updateBuilding);
router.post("/buildings/:id/assign-rooms", BuildingController.assignRooms);
router.delete("/buildings/:id", BuildingController.deleteBuilding);

// --- TOUR SCENARIOS ---
router.get("/tour-scenarios", TourController.getScenarios);
router.post("/tour-scenarios", TourController.saveScenarios);
router.post("/tour-scenarios/:id/set-default", TourController.setDefaultScenario);
router.delete("/tour-scenarios/:id", TourController.deleteScenario);
// Legacy tour scenario endpoints
router.get("/tour-scenario", TourController.getLegacyScenario);
router.post("/tour-scenario", TourController.saveLegacyScenario);

// --- SENSORS (ADMIN) ---
router.get("/sensors", SensorController.getAdminSensors);
router.post("/sensors", SensorController.saveAdminSensors);
router.put("/sensors/:id", SensorController.updateSensor);
router.delete("/sensors/:id", SensorController.deleteSensor);
router.post("/camera/convert-rtsp", SensorController.convertRtsp);

// --- STALL TEMPLATES (ADMIN) ---
router.get("/stall-templates", StallController.getAdminTemplates);
router.post("/stall-templates", StallController.saveTemplates);
router.put("/stall-templates/:id", StallController.updateTemplate);
router.delete("/stall-templates/:id", StallController.deleteTemplate);
router.post("/stall-templates/reset", StallController.resetTemplates);

// --- GLOBAL API CONFIG (ADMIN ONLY) ---
router.get("/api-config", requireRole("admin"), SensorController.getGlobalApiConfig);
router.post("/api-config", requireRole("admin"), SensorController.saveGlobalApiConfig);

// --- USERS & INVITATIONS (ADMIN ONLY) ---
router.get("/users", requireRole("admin"), AuthController.getAdminUsers);
router.post("/users", requireRole("admin"), AuthController.createDirectUser);
router.post("/users/invite", requireRole("admin"), AuthController.inviteUser);
router.patch("/users/:id", requireRole("admin"), AuthController.updateUserDirect);
router.patch("/users/:id/role", requireRole("admin"), AuthController.updateUserRole);
router.post("/users/:id/reset-password", requireRole("admin"), AuthController.resetUserPassword);
router.delete("/users/:id", requireRole("admin"), AuthController.deleteUser);
router.get("/invitations", requireRole("admin"), AuthController.getAdminInvitations);
router.post("/invitations", requireRole("admin"), AuthController.inviteUser);
router.delete("/invitations/:id", requireRole("admin"), AuthController.deleteInvitation);
router.delete("/invitations/:token", requireRole("admin"), AuthController.deleteInvitation);
router.post("/invitations/:id/resend", requireRole("admin"), AuthController.resendInvitation);

module.exports = router;

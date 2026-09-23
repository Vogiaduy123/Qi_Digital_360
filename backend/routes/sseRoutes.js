const express = require("express");
const router = express.Router();
const sseController = require("../controllers/sseController");
const authMiddleware = require("../middlewares/authMiddleware");

// SSE stream — requires auth to prevent public data leak
router.get("/", authMiddleware, sseController.handleSseConnection);

module.exports = router;

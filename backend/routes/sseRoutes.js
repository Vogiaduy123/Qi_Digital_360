const express = require("express");
const router = express.Router();
const sseController = require("../controllers/sseController");

router.get("/", sseController.handleSseConnection);

module.exports = router;

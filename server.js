require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

const { PORT, UPLOADS_DIR, LEGACY_UPLOADS_DIR } = require("./backend/config/env");
const errorHandler = require("./backend/middlewares/errorHandler");
const { verifyToken } = require("./backend/services/authService");
const UserModel = require("./backend/models/userModel");

// Routers
const publicRoutes = require("./backend/routes/publicRoutes");
const adminRoutes = require("./backend/routes/adminRoutes");
const sseRoutes = require("./backend/routes/sseRoutes");

// Initialize WebRTC MediaMTX Manager
require("./backend/services/webrtcService");

const app = express();
app.set("trust proxy", 1);

/* ===== MIDDLEWARE ===== */
app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const staticMediaOptions = {
  maxAge: "7d",
  immutable: true
};

// Static files
app.use(express.static("public", { maxAge: "1h", index: false }));
app.use(express.static("dist", { maxAge: "1d", index: false }));
app.use("/uploads", express.static(UPLOADS_DIR, staticMediaOptions));
if (path.resolve(LEGACY_UPLOADS_DIR) !== path.resolve(UPLOADS_DIR)) {
  app.use("/uploads", express.static(LEGACY_UPLOADS_DIR, staticMediaOptions));
}
app.use("/backend/tiles", express.static(path.join(__dirname, "backend", "tiles"), staticMediaOptions));

/* ===== ROOT ROUTE: CHECK DB SETUP & AUTHENTICATION ===== */
app.get("/", async (req, res) => {
  try {
    const hasAdmin = await UserModel.hasAdmin();

    // 1. Nếu chưa có admin nào -> chuyển hướng trang setup ban đầu
    if (!hasAdmin) {
      return res.redirect("/admin/setup.html");
    }

    // 2. Kiểm tra phiên đăng nhập hiện tại
    const token = req.cookies?.vt_token || (req.headers.authorization ? req.headers.authorization.split(" ")[1] : null);
    if (!token) {
      return res.redirect("/admin/login.html");
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.redirect("/admin/login.html");
    }

    // 3. Phục vụ giao diện Virtual Tour (dist/index.html)
    const indexFile = path.join(__dirname, "dist", "index.html");
    if (fs.existsSync(indexFile)) {
      return res.sendFile(indexFile);
    }

    return res.redirect("/admin/login.html");
  } catch (err) {
    console.error("Root route error:", err);
    return res.redirect("/admin/login.html");
  }
});

/* ===== TEST ROUTE ===== */
app.get("/test", (req, res) => {
  res.send("SERVER OK");
});

/* ===== MOUNT ROUTERS ===== */
app.use("/events", sseRoutes);
app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);

/* ===== CENTRAL ERROR HANDLER ===== */
app.use(errorHandler);

/* ===== START SERVER ===== */
app.listen(PORT, () => {
  console.log(`🚀 Virtual Tour 360 Server (MVC Architecture) running on port ${PORT}`);
  console.log(`📁 Uploads Directory: ${UPLOADS_DIR}`);
});

module.exports = app;

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { UPLOADS_DIR } = require("../config/env");

// 1. Ensure upload subdirectories exist
const PANORAMA_UPLOADS_DIR = path.join(UPLOADS_DIR, "panoramas");
const MINIMAP_UPLOADS_DIR = path.join(UPLOADS_DIR, "minimaps");
const MEDIA_UPLOADS_DIR = path.join(UPLOADS_DIR, "media");
const CUSTOM_ICONS_DIR = path.join(UPLOADS_DIR, "custom_icons");

[PANORAMA_UPLOADS_DIR, MINIMAP_UPLOADS_DIR, MEDIA_UPLOADS_DIR, CUSTOM_ICONS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 2. Storages
const generalStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const panoramaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PANORAMA_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const roomName = (req.body.name || "room").replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `${roomName}_${timestamp}${ext}`);
  }
});

const minimapStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MINIMAP_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `minimap_${timestamp}${ext}`);
  }
});

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `media_${timestamp}_${sanitized}`);
  }
});

const customIconsStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CUSTOM_ICONS_DIR),
  filename: (req, file, cb) => {
    const iconKey = req.body.iconKey || "icon";
    const ext = path.extname(file.originalname);
    cb(null, `${iconKey}_${Date.now()}${ext}`);
  }
});

// 3. Upload instances
const upload = multer({ storage: generalStorage });

const uploadPanorama = multer({
  storage: panoramaStorage,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB max cho panorama
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png" || file.mimetype === "image/webp") {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG and WEBP files are allowed"));
    }
  }
});

const uploadMinimap = multer({
  storage: minimapStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png" || file.mimetype === "image/webp") {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG and WEBP files are allowed"));
    }
  }
});

const uploadMedia = multer({
  storage: mediaStorage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "application/pdf",
      "video/mp4", "video/webm",
      "model/gltf-binary", "model/gltf+json"
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(glb|gltf)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed. Allowed: images, PDF, videos, 3D models (GLB/GLTF)"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

function uploadMediaWithJsonError(req, res, next) {
  uploadMedia.single("media")(req, res, err => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, error: "File quá lớn (tối đa 50MB)" });
      }
      return res.status(400).json({ success: false, error: err.message });
    }

    return res.status(400).json({ success: false, error: err.message || "Upload failed" });
  });
}

const uploadCustomIcon = multer({
  storage: customIconsStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = {
  upload,
  uploadPanorama,
  uploadMinimap,
  uploadMedia,
  uploadMediaWithJsonError,
  uploadCustomIcon,
  PANORAMA_UPLOADS_DIR,
  MINIMAP_UPLOADS_DIR,
  MEDIA_UPLOADS_DIR,
  CUSTOM_ICONS_DIR
};

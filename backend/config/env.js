const path = require("path");
const fs = require("fs");
const os = require("os");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const DEFAULT_UPLOADS_DIR = path.join(__dirname, "../../uploads");
const RAW_UPLOAD_DIR = String(process.env.UPLOAD_DIR || "").trim();
const ENV_UPLOADS_DIR = RAW_UPLOAD_DIR
  ? (path.isAbsolute(RAW_UPLOAD_DIR) ? RAW_UPLOAD_DIR : path.resolve(__dirname, "../../", RAW_UPLOAD_DIR))
  : "";
const LEGACY_UPLOADS_DIR = path.join(__dirname, "../../uploads");

function canUseDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveUploadsDir() {
  const candidates = [
    ENV_UPLOADS_DIR,
    DEFAULT_UPLOADS_DIR,
    path.join(os.tmpdir(), "virtual-tour-uploads")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canUseDirectory(candidate)) {
      if (candidate !== ENV_UPLOADS_DIR && ENV_UPLOADS_DIR) {
        console.warn(`[UPLOAD_DIR] Cannot write to ${ENV_UPLOADS_DIR}. Fallback to ${candidate}`);
      }
      return candidate;
    }
  }

  throw new Error("No writable uploads directory found. Please set UPLOAD_DIR to a writable path.");
}

const UPLOADS_DIR = resolveUploadsDir();
const JWT_SECRET = process.env.JWT_SECRET || "vt_secret_key_qi_360_security_key_random";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

module.exports = {
  PORT,
  UPLOADS_DIR,
  LEGACY_UPLOADS_DIR,
  JWT_SECRET,
  SUPABASE_URL,
  SUPABASE_KEY,
  canUseDirectory,
  DATA_DIR: path.join(__dirname, "../../data"),
  TILES_DIR: path.join(__dirname, "../tiles"),
  ROOM_API_CONFIGS_DIR: path.join(__dirname, "../../data/room-api-configs")
};

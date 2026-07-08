const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
// Local: dùng same-origin + Vite proxy tới backend (PORT trong .env, mặc định 3000)
const savedBase = (window.localStorage.getItem("ADMIN_API_BASE_URL") || "").trim();
window.ADMIN_API_BASE_URL = (savedBase || (isLocalHost ? "" : "https://virtual-tour-qi.onrender.com")).replace(/\/$/, "");
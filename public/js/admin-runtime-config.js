const savedBase = (window.localStorage.getItem("ADMIN_API_BASE_URL") || "").trim();
// Luôn dùng same-origin (URL tương đối) trừ khi admin tự cấu hình override
window.ADMIN_API_BASE_URL = savedBase.replace(/\/$/, "");
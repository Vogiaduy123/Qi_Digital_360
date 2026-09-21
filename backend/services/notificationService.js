const db = require("../db");

async function getNotifications() {
  try {
    const { data, error } = await db.supabase
      .from("notifications")
      .select("*")
      .order("id", { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map(item => ({
      id: Number(item.id),
      type: item.type,
      title: item.title,
      message: item.message,
      createdAt: item.created_at,
      createdBy: item.created_by
    }));
  } catch (err) {
    console.warn("⚠️ [NotificationService] Error fetching notifications from Supabase:", err.message);
    return [];
  }
}

async function createNotification(type, title, message, createdBy) {
  const timestamp = Date.now();
  const newNotif = {
    id: timestamp,
    type,
    title,
    message,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || "Hệ thống"
  };

  try {
    await db.supabase.from("notifications").insert({
      id: newNotif.id,
      type: newNotif.type,
      title: newNotif.title,
      message: newNotif.message,
      created_at: newNotif.createdAt,
      created_by: newNotif.createdBy
    });
  } catch (err) {
    console.warn("⚠️ [NotificationService] Failed to insert notification to Supabase:", err.message);
  }

  // Trigger SSE broadcast
  if (global.broadcastNotifications) {
    global.broadcastNotifications();
  }

  return newNotif;
}

module.exports = {
  getNotifications,
  createNotification
};

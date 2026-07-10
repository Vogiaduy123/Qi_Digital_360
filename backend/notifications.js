const fs = require('fs');
const path = require('path');
const db = require('./db');

const LOCAL_NOTIFICATIONS_FILE = path.join(__dirname, '..', 'data', 'notifications.json');

// Ensure data dir exists
if (!fs.existsSync(path.join(__dirname, '..', 'data'))) {
  fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
}

function getLocalNotifications() {
  try {
    if (!fs.existsSync(LOCAL_NOTIFICATIONS_FILE)) return [];
    const raw = fs.readFileSync(LOCAL_NOTIFICATIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading local notifications:', err);
    return [];
  }
}

function saveLocalNotifications(notifications) {
  try {
    fs.writeFileSync(LOCAL_NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving local notifications:', err);
  }
}

async function getNotifications() {
  try {
    // 1. Try querying Supabase
    const { data, error } = await db.supabase
      .from('notifications')
      .select('*')
      .order('id', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }
    
    // Map database properties (created_at, created_by) to camelCase if needed
    return (data || []).map(item => ({
      id: Number(item.id),
      type: item.type,
      title: item.title,
      message: item.message,
      createdAt: item.created_at,
      createdBy: item.created_by
    }));
  } catch (err) {
    console.warn('⚠️ [Supabase DB] Failed to fetch notifications, using local fallback:', err.message);
    // 2. Fallback to local file
    const local = getLocalNotifications();
    return local
      .sort((a, b) => b.id - a.id)
      .slice(0, 20)
      .map(item => ({
        id: Number(item.id),
        type: item.type,
        title: item.title,
        message: item.message,
        createdAt: item.createdAt || item.created_at,
        createdBy: item.createdBy || item.created_by
      }));
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
    createdBy: createdBy || 'Hệ thống'
  };

  try {
    // 1. Try to insert into Supabase
    await db.supabase.from('notifications').insert({
      id: newNotif.id,
      type: newNotif.type,
      title: newNotif.title,
      message: newNotif.message,
      created_at: newNotif.createdAt,
      created_by: newNotif.createdBy
    });
  } catch (err) {
    console.warn('⚠️ [Supabase DB] failed to insert notification, writing locally only:', err.message);
  }

  // 2. Always sync locally as fallback and record keeping
  let local = getLocalNotifications();
  local.unshift(newNotif);
  local = local.slice(0, 50); // Keep last 50 locally
  saveLocalNotifications(local);

  // 3. Trigger SSE broadcast
  if (global.broadcastNotifications) {
    global.broadcastNotifications();
  }

  return newNotif;
}

module.exports = {
  getNotifications,
  createNotification
};

const db = require('../backend/db');

(async () => {
  try {
    const users = await db.getUsers();
    console.log('Users in database:', users.map(u => ({ id: u.id, username: u.username, role: u.role, displayName: u.display_name })));
  } catch (err) {
    console.error('Failed to fetch users:', err);
  }
})();

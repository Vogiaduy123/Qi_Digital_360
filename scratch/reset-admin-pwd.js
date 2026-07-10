const db = require('../backend/db');
const { hashPassword } = require('../backend/auth');

(async () => {
  try {
    const passwordHash = hashPassword('123456');
    await db.updateUser(1, { passwordHash });
    console.log('Successfully updated Admin@123 password to 123456');
  } catch (err) {
    console.error('Failed to update password:', err);
  }
})();

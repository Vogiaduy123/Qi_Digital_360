const { createNotification, getNotifications } = require('../backend/notifications');

(async () => {
  console.log('Testing createNotification...');
  try {
    const notif = await createNotification('building_add', 'Test Title', 'Test Message', 'TestUser');
    console.log('Successfully created notification:', notif);
    
    console.log('Testing getNotifications...');
    const list = await getNotifications();
    console.log('Successfully fetched notifications, count:', list.length);
    console.log('List:', list);
  } catch (err) {
    console.error('Test failed with error:', err);
  }
})();

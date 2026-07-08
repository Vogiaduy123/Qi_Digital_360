const db = require('../../../../backend/db');

async function check() {
  try {
    const result = await db.supabase
      .from('rooms')
      .select('*, hotspots(*), media_hotspots(*), mail_hotspots(*)')
      .order('order_index', { ascending: true })
      .order('id', { foreignTable: 'hotspots', ascending: true })
      .order('id', { foreignTable: 'media_hotspots', ascending: true })
      .order('id', { foreignTable: 'mail_hotspots', ascending: true });

    if (result.error) throw result.error;
    console.log('Query successful, media_hotspots count in room 0:', result.data[0].media_hotspots.length);
  } catch (err) {
    console.error('Query failed:', err.message);
  }
}

check();

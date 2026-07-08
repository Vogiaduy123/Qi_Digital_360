const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project-id')) {
  console.error('❌ Lỗi: Bạn chưa cấu hình đúng SUPABASE_URL và SUPABASE_KEY trong file .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET_NAME = 'virtual-tour';

// Helper import modules tương tự của backend
const db = require('../backend/db');
const storage = require('../backend/storage');

// Thư mục dữ liệu nguồn
const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const TILES_DIR = path.join(__dirname, '..', 'backend', 'tiles');

async function checkStorageBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error('❌ Lỗi kết nối Supabase Storage:', error.message);
    throw error;
  }
  const exists = buckets.find(b => b.name === BUCKET_NAME);
  if (!exists) {
    console.error(`❌ Lỗi: Chưa tạo bucket "${BUCKET_NAME}" trên Supabase. Vui lòng tạo bucket này với quyền Public trước.`);
    process.exit(1);
  }
  console.log(`✅ Supabase Storage Bucket "${BUCKET_NAME}" sẵn sàng.`);
}

async function uploadLocalFileToCloud(localRelPath) {
  if (!localRelPath) return '';
  
  // Loại bỏ query string nếu có
  const cleanPath = localRelPath.split('?')[0];
  
  // Kiểm tra xem đã là URL cloud chưa
  if (cleanPath.startsWith('http')) return cleanPath;

  // Tìm đường dẫn thực tế ở local
  let absoluteLocalPath = path.join(__dirname, '..', cleanPath);
  if (cleanPath.startsWith('/uploads')) {
    absoluteLocalPath = path.join(__dirname, '..', cleanPath);
  } else if (!path.isAbsolute(cleanPath)) {
    absoluteLocalPath = path.resolve(__dirname, '..', cleanPath);
  }

  if (!fs.existsSync(absoluteLocalPath)) {
    console.warn(`⚠️ File local không tồn tại, bỏ qua upload: ${absoluteLocalPath}`);
    return localRelPath; // Giữ nguyên để tránh mất cấu trúc
  }

  // Định nghĩa đường dẫn đích trên Storage (ví dụ: uploads/abc.jpg)
  const destPath = cleanPath.replace(/^\//, ''); // Loại bỏ gạch chéo đầu
  console.log(`📤 Đang upload file: ${cleanPath} -> ${destPath}`);
  
  try {
    const cloudUrl = await storage.uploadFile(absoluteLocalPath, destPath);
    return cloudUrl;
  } catch (err) {
    console.error(`❌ Upload file thất bại ${cleanPath}:`, err.message);
    return localRelPath;
  }
}

async function migrateBuildings() {
  console.log('\n--- 🏢 MIGRATING BUILDINGS ---');
  const file = path.join(DATA_DIR, 'buildings.json');
  if (!fs.existsSync(file)) {
    console.log('No buildings.json found, skipping.');
    return;
  }
  const buildings = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const b of buildings) {
    console.log(`Inserting building: ${b.name}`);
    await db.insertBuilding(b).catch(err => {
      if (err.code === '23505') console.log(` Building ${b.id} already exists, skipping.`);
      else throw err;
    });
  }
  console.log(`✅ Đã migrate xong ${buildings.length} phân khu.`);
}

async function migrateRooms() {
  console.log('\n--- 📍 MIGRATING ROOMS & HOTSPOTS ---');
  const file = path.join(DATA_DIR, 'rooms.json');
  if (!fs.existsSync(file)) {
    console.log('No rooms.json found, skipping.');
    return;
  }
  const rooms = JSON.parse(fs.readFileSync(file, 'utf8'));
  
  for (const room of rooms) {
    console.log(`\nProcessing Room: ${room.name} (ID: ${room.id})`);
    
    // 1. Upload ảnh panorama gốc
    let imageUrl = room.image;
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = await uploadLocalFileToCloud(room.image);
    }
    
    // 2. Upload folder tiles
    let tilesPath = room.tilesPath;
    if (tilesPath) {
      // Chuẩn hóa tilesPath để lưu vào database & storage
      tilesPath = tilesPath
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9\/\.\-_]/g, '');

      // Tìm thư mục tiles local thực tế
      let localTilesDir = path.join(TILES_DIR, room.tilesPath.replace('tiles/', ''));
      if (!fs.existsSync(localTilesDir)) {
        // Fallback kiểm tra xem tilesPath có chứa tên building
        localTilesDir = path.join(__dirname, '..', 'backend', room.tilesPath);
      }
      
      if (fs.existsSync(localTilesDir)) {
        const destCloudFolder = tilesPath; // Thư mục đã chuẩn hóa
        console.log(`📤 Đang upload folder Tiles: ${localTilesDir} -> ${destCloudFolder}`);
        await storage.uploadFolder(localTilesDir, destCloudFolder).catch(err => {
          console.error(`⚠️ Folder tiles upload error for room ${room.id}:`, err.message);
        });
      } else {
        console.warn(`⚠️ Thư mục Tiles local không tìm thấy: ${localTilesDir}`);
      }
    }

    // 3. Ghi thông tin phòng vào database
    const roomRecord = {
      id: room.id,
      name: room.name,
      image: imageUrl,
      tilesPath: tilesPath,
      tilesConfig: room.tilesConfig,
      floor: room.floor || 1,
      buildingId: room.buildingId || null
    };
    
    await db.insertRoom(roomRecord).catch(async (err) => {
      if (err.code === '23505') {
        console.log(` Room ${room.id} already exists, updating...`);
        await db.updateRoom(room.id, roomRecord);
      } else {
        throw err;
      }
    });

    // 4. Migrate hotspots di chuyển
    if (room.hotspots && room.hotspots.length > 0) {
      // Xóa hotspots cũ trước để tránh duplicate
      await supabase.from('hotspots').delete().eq('room_id', Number(room.id));
      
      const insertHotspots = room.hotspots.map(h => ({
        room_id: Number(room.id),
        yaw: Number(h.yaw),
        pitch: Number(h.pitch),
        target_room_id: Number(h.target),
        rotation: Number(h.rotation || 0),
        color: h.color || null,
        icon_url: h.iconUrl || null
      }));
      
      const { error } = await supabase.from('hotspots').insert(insertHotspots);
      if (error) console.error(`❌ Lỗi insert hotspots cho room ${room.id}:`, error.message);
      else console.log(` Đã chèn ${insertHotspots.length} hotspots chuyển cảnh.`);
    }

    // 5. Migrate media hotspots
    if (room.mediaHotspots && room.mediaHotspots.length > 0) {
      await supabase.from('media_hotspots').delete().eq('room_id', Number(room.id));
      
      for (const m of room.mediaHotspots) {
        // Upload tệp media đính kèm (nếu là file local)
        let mediaUrl = m.mediaUrl;
        if (mediaUrl && !mediaUrl.startsWith('http') && mediaUrl.startsWith('/uploads')) {
          mediaUrl = await uploadLocalFileToCloud(m.mediaUrl);
        }

        const { error } = await supabase.from('media_hotspots').insert({
          room_id: Number(room.id),
          yaw: Number(m.yaw),
          pitch: Number(m.pitch),
          title: m.title || null,
          description: m.description || null,
          media_url: mediaUrl || null,
          media_type: m.mediaType,
          highlight_polygon: m.highlightPolygon || null
        });
        if (error) console.error(`❌ Lỗi chèn media hotspot cho room ${room.id}:`, error.message);
      }
      console.log(` Đã chèn ${room.mediaHotspots.length} media hotspots.`);
    }

    // 6. Migrate mail hotspots
    if (room.mailHotspots && room.mailHotspots.length > 0) {
      await supabase.from('mail_hotspots').delete().eq('room_id', Number(room.id));
      
      const insertMails = room.mailHotspots.map(ma => ({
        room_id: Number(room.id),
        yaw: ma.yaw !== undefined ? Number(ma.yaw) : null,
        pitch: ma.pitch !== undefined ? Number(ma.pitch) : null,
        screen_x: ma.screenX !== undefined ? Number(ma.screenX) : null,
        screen_y: ma.screenY !== undefined ? Number(ma.screenY) : null,
        title: ma.title || null,
        recipient: ma.recipient || null,
        subject: ma.subject || null,
        body: ma.body || null,
        updated_at: ma.updatedAt || new Date().toISOString()
      }));
      
      const { error } = await supabase.from('mail_hotspots').insert(insertMails);
      if (error) console.error(`❌ Lỗi chèn mail hotspot cho room ${room.id}:`, error.message);
      else console.log(` Đã chèn ${insertMails.length} mail hotspots.`);
    }
  }
}

async function migrateSensors() {
  console.log('\n--- 🌡️ MIGRATING SENSORS ---');
  const file = path.join(DATA_DIR, 'sensors.json');
  if (!fs.existsSync(file)) {
    console.log('No sensors.json found, skipping.');
    return;
  }
  const sensors = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const sensor of sensors) {
    console.log(`Migrating sensor: ${sensor.name} (ID: ${sensor.id})`);
    await db.insertSensor(sensor).catch(async (err) => {
      if (err.code === '23505') {
        console.log(` Sensor ${sensor.id} already exists, updating...`);
        await db.updateSensor(sensor.id, sensor);
      } else if (err.code === '23503') {
        console.warn(`⚠️ Bỏ qua cảm biến ${sensor.name} (ID: ${sensor.id}) vì roomId ${sensor.roomId} không tồn tại trong database.`);
      } else {
        throw err;
      }
    });
  }
  console.log(`✅ Đã migrate xong ${sensors.length} cảm biến.`);
}

async function migrateMinimaps() {
  console.log('\n--- 🗺️ MIGRATING MINIMAP ---');
  const file = path.join(DATA_DIR, 'minimap.json');
  if (!fs.existsSync(file)) {
    console.log('No minimap.json found, skipping.');
    return;
  }
  const minimapData = JSON.parse(fs.readFileSync(file, 'utf8'));
  const floors = minimapData.floors || [];
  
  const cloudFloors = [];
  for (const floor of floors) {
    console.log(`Processing Minimap Floor: ${floor.name}`);
    let imageUrl = floor.image;
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = await uploadLocalFileToCloud(floor.image);
    }
    
    cloudFloors.push({
      ...floor,
      image: imageUrl
    });
  }

  await db.saveMinimap({ floors: cloudFloors });
  console.log(`✅ Đã migrate xong ${floors.length} bản đồ tầng & markers định vị.`);
}

async function migrateConfigs() {
  console.log('\n--- ⚙️ MIGRATING APP CONFIGS ---');
  
  // 1. Cấu hình api-config
  const apiFile = path.join(DATA_DIR, 'api-config.json');
  if (fs.existsSync(apiFile)) {
    console.log('Migrating api-config.json...');
    const configData = JSON.parse(fs.readFileSync(apiFile, 'utf8'));
    await db.saveAppConfig('api_config', configData);
  }

  // 2. Cấu hình kịch bản tour
  const tourFile = path.join(DATA_DIR, 'tour-scenario.json');
  if (fs.existsSync(tourFile)) {
    console.log('Migrating tour-scenario.json...');
    const tourData = JSON.parse(fs.readFileSync(tourFile, 'utf8'));
    await db.saveAppConfig('tour_scenario', tourData);
  }
  console.log('✅ Đã lưu cấu hình api_config và tour_scenario lên database.');
}

async function main() {
  console.log('=== BẮT ĐẦU MIGRATION DỮ LIỆU SANG SUPABASE ===');
  try {
    await checkStorageBucket();
    await migrateBuildings();
    await migrateRooms();
    await migrateSensors();
    await migrateMinimaps();
    await migrateConfigs();
    console.log('\n🎉 QUÁ TRÌNH MIGRATION HOÀN TẤT THÀNH CÔNG!');
  } catch (err) {
    console.error('\n❌ Quá trình migration gặp lỗi nghiêm trọng:', err.message);
    process.exit(1);
  }
}

main();

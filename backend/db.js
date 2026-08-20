const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project-id')) {
  console.warn('⚠️ [Supabase DB] Cảnh báo: SUPABASE_URL hoặc SUPABASE_KEY chưa được cấu hình đúng trong file .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const LOCAL_BUILDINGS_FILE = path.join(__dirname, '..', 'data', 'buildings.json');

function readLocalBuildings() {
  try {
    if (!fs.existsSync(LOCAL_BUILDINGS_FILE)) return [];
    const raw = fs.readFileSync(LOCAL_BUILDINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && item.id && item.name)
      .map(item => ({
        id: item.id,
        name: item.name,
        created_at: item.createdAt || item.created_at || new Date().toISOString()
      }));
  } catch (err) {
    console.warn('⚠️ [Supabase DB] Failed to load local buildings fallback:', err.message);
    return [];
  }
}

module.exports = {
  supabase,

  // --- ROOMS & HOTSPOTS ---
  async getRooms() {
    let result = await supabase
      .from('rooms')
      .select('*, hotspots(*), media_hotspots(*), mail_hotspots(*)')
      .order('order_index', { ascending: true })
      .order('id', { ascending: true })
      .order('id', { foreignTable: 'hotspots', ascending: true })
      .order('id', { foreignTable: 'media_hotspots', ascending: true })
      .order('id', { foreignTable: 'mail_hotspots', ascending: true });

    if (result.error) {
      console.warn('⚠️ [Supabase DB] Query with order_index failed, falling back to unordered rooms:', result.error.message);
      result = await supabase
        .from('rooms')
        .select('*, hotspots(*), media_hotspots(*), mail_hotspots(*)')
        .order('id', { ascending: true })
        .order('id', { foreignTable: 'hotspots', ascending: true })
        .order('id', { foreignTable: 'media_hotspots', ascending: true })
        .order('id', { foreignTable: 'mail_hotspots', ascending: true });
    }

    const rooms = result.data || [];
    
    // Đảm bảo kiểu dữ liệu và định dạng tương thích với client cũ
    return rooms.map(r => ({
      id: Number(r.id),
      name: r.name,
      image: r.image_url,
      tilesPath: r.tiles_path,
      tilesConfig: r.tiles_config,
      floor: Number(r.floor || 1),
      buildingId: r.building_id || undefined,
      orderIndex: Number(r.order_index || 0),
      hotspots: (r.hotspots || []).map(h => ({
        yaw: Number(h.yaw),
        pitch: Number(h.pitch),
        target: Number(h.target_room_id),
        rotation: Number(h.rotation || 0),
        color: h.color || undefined,
        iconUrl: h.icon_url || undefined,
        initialYaw: h.initial_yaw !== null && h.initial_yaw !== undefined ? Number(h.initial_yaw) : undefined,
        initialPitch: h.initial_pitch !== null && h.initial_pitch !== undefined ? Number(h.initial_pitch) : undefined
      })),
      mediaHotspots: (r.media_hotspots || []).map(m => {
        let mediaItems = null;
        let iconUrl = m.icon_url || null;
        let mediaUrl = m.media_url || '';
        let mediaType = m.media_type || 'all';

        if (mediaUrl && typeof mediaUrl === 'string' && (mediaUrl.startsWith('{') || mediaUrl.startsWith('{"'))) {
          try {
            const parsed = JSON.parse(mediaUrl);
            mediaItems = parsed.mediaItems || parsed;
            if (parsed.iconUrl) iconUrl = parsed.iconUrl;
            if (parsed.mediaType) mediaType = parsed.mediaType;
            if (parsed.mediaUrl) mediaUrl = parsed.mediaUrl;
          } catch {}
        }

        return {
          id: m.id,
          yaw: Number(m.yaw),
          pitch: Number(m.pitch),
          title: m.title,
          description: m.description,
          mediaUrl: mediaUrl,
          mediaType: mediaType,
          iconUrl: iconUrl,
          mediaItems: mediaItems,
          highlightPolygon: m.highlight_polygon
        };
      }),
      mailHotspots: (r.mail_hotspots || []).map(ma => ({
        title: ma.title,
        recipient: ma.recipient,
        subject: ma.subject,
        body: ma.body,
        updatedAt: ma.updated_at,
        yaw: ma.yaw !== null ? Number(ma.yaw) : undefined,
        pitch: ma.pitch !== null ? Number(ma.pitch) : undefined,
        screenX: ma.screen_x !== null ? Number(ma.screen_x) : undefined,
        screenY: ma.screen_y !== null ? Number(ma.screen_y) : undefined
      }))
    }));
  },

  async getRoomById(id) {
    const rooms = await this.getRooms();
    return rooms.find(r => r.id === Number(id));
  },

  async insertRoom(room) {
    const { error } = await supabase.from('rooms').insert({
      id: Number(room.id),
      name: room.name,
      image_url: room.image,
      tiles_path: room.tilesPath,
      tiles_config: room.tilesConfig,
      floor: Number(room.floor || 1),
      building_id: room.buildingId || null,
      order_index: Number(room.orderIndex || 0)
    });
    if (error) throw error;
  },

  async updateRoom(id, updates) {
    const mapped = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.image !== undefined) mapped.image_url = updates.image;
    if (updates.tilesPath !== undefined) mapped.tiles_path = updates.tilesPath;
    if (updates.tilesConfig !== undefined) mapped.tiles_config = updates.tilesConfig;
    if (updates.floor !== undefined) mapped.floor = Number(updates.floor);
    if (updates.buildingId !== undefined) mapped.building_id = updates.buildingId || null;
    if (updates.orderIndex !== undefined) mapped.order_index = Number(updates.orderIndex);

    const { error } = await supabase
      .from('rooms')
      .update(mapped)
      .eq('id', Number(id));
    if (error) throw error;
  },

  async updateRoomOrder(id, orderIndex) {
    const { error } = await supabase
      .from('rooms')
      .update({ order_index: Number(orderIndex) })
      .eq('id', Number(id));
    if (error) throw error;
  },

  async deleteRoom(id) {
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', Number(id));
    if (error) throw error;
  },

  // --- BUILDINGS ---
  async getBuildings() {
    const { data, error } = await supabase
      .from('buildings')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching buildings:', error);
    }

    if (Array.isArray(data) && data.length > 0) {
      return data;
    }

    const localBuildings = readLocalBuildings();
    if (localBuildings.length > 0) {
      console.warn('⚠️ [Supabase DB] Using local buildings fallback data');
      return localBuildings;
    }

    return Array.isArray(data) ? data : [];
  },

  async insertBuilding(bldg) {
    const { error } = await supabase.from('buildings').insert({
      id: bldg.id,
      name: bldg.name,
      created_at: bldg.createdAt || new Date().toISOString()
    });
    if (error) throw error;
  },

  async updateBuilding(id, updates) {
    const mapped = {};
    if (updates.name !== undefined) mapped.name = String(updates.name).trim();

    const { error } = await supabase
      .from('buildings')
      .update(mapped)
      .eq('id', id);
    if (error) throw error;
  },

  async deleteBuilding(id) {
    const { error } = await supabase
      .from('buildings')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- SENSORS ---
  async getSensors() {
    const { data: sensors, error } = await supabase
      .from('sensors')
      .select('*');
    if (error) {
      console.error('Error fetching sensors:', error);
      return [];
    }

    return sensors.map(s => {
      const result = {
        id: Number(s.id),
        name: s.name,
        roomId: (s.room_id !== null && s.room_id !== undefined && s.room_id !== '') ? Number(s.room_id) : null,
        type: s.type,
        position: {
          yaw: Number(s.yaw),
          pitch: Number(s.pitch)
        },
        lastUpdate: s.last_update,
        color: s.color || undefined,
        iconUrl: s.icon_url || s.data?.iconUrl || null
      };
      
      // Parse sensors value or camera data
      if (s.type === 'camera') {
        result.camera = s.data || {};
      } else {
        result.sensors = s.data || {};
        if (s.data?.iconUrl) {
          result.iconUrl = s.data.iconUrl;
        }
      }
      return result;
    });
  },

  async insertSensor(sensor) {
    const rawData = sensor.type === 'camera' ? sensor.camera : sensor.sensors;
    const data = {
      ...(rawData || {}),
      ...(sensor.iconUrl ? { iconUrl: sensor.iconUrl } : {})
    };
    const { error } = await supabase.from('sensors').insert({
      id: Number(sensor.id),
      name: sensor.name,
      room_id: (sensor.roomId !== null && sensor.roomId !== undefined && sensor.roomId !== '') ? Number(sensor.roomId) : null,
      type: sensor.type,
      yaw: Number(sensor.position?.yaw || 0),
      pitch: Number(sensor.position?.pitch || 0),
      data: data || {},
      last_update: sensor.lastUpdate || new Date().toISOString(),
      color: sensor.color || null
    });
    if (error) throw error;
  },

  async updateSensor(id, sensor) {
    const mapped = {};
    if (sensor.name !== undefined) mapped.name = sensor.name;
    if (sensor.roomId !== undefined) mapped.room_id = (sensor.roomId !== null && sensor.roomId !== '') ? Number(sensor.roomId) : null;
    if (sensor.position !== undefined) {
      mapped.yaw = Number(sensor.position.yaw || 0);
      mapped.pitch = Number(sensor.position.pitch || 0);
    }
    if (sensor.type !== undefined) mapped.type = sensor.type;
    if (sensor.lastUpdate !== undefined) mapped.last_update = sensor.lastUpdate;
    if (sensor.color !== undefined) mapped.color = sensor.color;
    
    const rawData = sensor.type === 'camera' ? sensor.camera : sensor.sensors;
    if (rawData !== undefined || sensor.iconUrl !== undefined) {
      const dataObj = (typeof rawData === 'object' && rawData !== null) ? { ...rawData } : {};
      if (sensor.iconUrl !== undefined) {
        if (sensor.iconUrl) {
          dataObj.iconUrl = sensor.iconUrl;
        } else {
          delete dataObj.iconUrl;
        }
      }
      mapped.data = dataObj;
    }

    console.log(`🔄 [db.updateSensor] Updating sensor ID=${id} with mapped data:`, mapped);

    // Primary update attempt using numeric id
    let { data: updatedRows, error } = await supabase
      .from('sensors')
      .update(mapped)
      .eq('id', Number(id))
      .select();

    if (error) {
      console.error('❌ [db.updateSensor] Primary update error:', error.message);
    }

    // Secondary fallback using string id if primary updated 0 rows
    if (!updatedRows || updatedRows.length === 0) {
      const stringId = String(id);
      console.warn(`⚠️ [db.updateSensor] 0 rows updated with numeric id=${Number(id)}, trying string id='${stringId}'`);
      const resAlt = await supabase
        .from('sensors')
        .update(mapped)
        .eq('id', stringId)
        .select();

      if (resAlt.error) {
        console.error('❌ [db.updateSensor] Fallback string id update error:', resAlt.error.message);
        throw resAlt.error;
      }
      updatedRows = resAlt.data;
    }

    if (!updatedRows || updatedRows.length === 0) {
      const msg = `Không tìm thấy thiết bị nào trong CSDL có ID = ${id} để cập nhật.`;
      console.error('❌ [db.updateSensor] ' + msg);
      throw new Error(msg);
    }

    console.log('✅ [db.updateSensor] Sensor updated successfully in DB:', updatedRows[0]);
    return updatedRows[0];
  },

  async deleteSensor(id) {
    const { error } = await supabase
      .from('sensors')
      .delete()
      .eq('id', Number(id));
    if (error) throw error;
  },

  async insertSensorLog(log) {
    const { error } = await supabase
      .from('sensor_logs')
      .insert({
        sensor_id: Number(log.sensor_id || log.sensorId),
        temperature: log.temperature !== undefined && log.temperature !== null ? Number(log.temperature) : null,
        humidity: log.humidity !== undefined && log.humidity !== null ? Number(log.humidity) : null,
        pm25: log.pm25 !== undefined && log.pm25 !== null ? Number(log.pm25) : null,
        co2: log.co2 !== undefined && log.co2 !== null ? Number(log.co2) : null,
        smoke: log.smoke !== undefined && log.smoke !== null ? Number(log.smoke) : null,
        created_at: log.created_at || log.createdAt || new Date().toISOString()
      });
    if (error) throw error;
  },

  // --- MINIMAPS & MARKERS (1 Phân khu = 1 Minimap) ---
  async getMinimap() {
    const buildings = await this.getBuildings();
    const rooms = await this.getRooms();

    const { data: floors, error: floorErr } = await supabase
      .from('minimaps')
      .select('*')
      .order('floor_id', { ascending: true });
      
    if (floorErr) {
      console.error('Error fetching minimaps:', floorErr);
    }

    const { data: markers, error: markerErr } = await supabase
      .from('minimap_markers')
      .select('*');
      
    if (markerErr) {
      console.error('Error fetching minimap markers:', markerErr);
    }

    // Đọc rotations & building mappings dự phòng từ app_configs & local file
    const LOCAL_ROT_FILE = path.join(__dirname, '..', 'data', 'minimap-rotations.json');
    const LOCAL_BLDG_MAP_FILE = path.join(__dirname, '..', 'data', 'building-minimaps.json');
    let savedRotations = {};
    let buildingMinimapsConfig = {};

    try {
      if (fs.existsSync(LOCAL_ROT_FILE)) {
        savedRotations = JSON.parse(fs.readFileSync(LOCAL_ROT_FILE, 'utf8')) || {};
      }
    } catch {}

    try {
      if (fs.existsSync(LOCAL_BLDG_MAP_FILE)) {
        buildingMinimapsConfig = JSON.parse(fs.readFileSync(LOCAL_BLDG_MAP_FILE, 'utf8')) || {};
      }
    } catch {}

    try {
      const configRot = await this.getAppConfig('minimap_rotations');
      if (configRot && typeof configRot === 'object') {
        savedRotations = { ...savedRotations, ...configRot };
      }
    } catch {}

    try {
      const configBldg = await this.getAppConfig('building_minimaps');
      if (configBldg && typeof configBldg === 'object') {
        buildingMinimapsConfig = { ...buildingMinimapsConfig, ...configBldg };
      }
    } catch {}

    const allFloors = Array.isArray(floors) ? floors : [];
    const allMarkers = Array.isArray(markers) ? markers : [];

    // Tạo danh sách minimap theo từng phân khu
    const resultFloors = [];

    // 1. Duyệt qua từng phân khu (building)
    if (Array.isArray(buildings) && buildings.length > 0) {
      buildings.forEach((bldg, idx) => {
        const floorIdNum = idx + 1; // 1-based floor ID
        // Tìm minimap record theo building_id hoặc floor_name hoặc floor_id
        const mapRow = allFloors.find(f => f.building_id === bldg.id || f.floor_name === bldg.name || Number(f.floor_id) === floorIdNum);
        const configData = buildingMinimapsConfig[bldg.id] || {};
        const mapImage = configData.image || mapRow?.image_url || "";

        // Markers của phân khu này
        const bldgRoomIds = new Set(rooms.filter(r => r.buildingId === bldg.id).map(r => r.id));
        const rawMarkers = (configData.markers && configData.markers.length > 0)
          ? configData.markers
          : (mapRow ? allMarkers.filter(m => Number(m.floor_id) === Number(mapRow.floor_id)) : []);

        const bldgMarkers = rawMarkers.map(m => {
          const rotKey = `${floorIdNum}_${m.room_id || m.roomId}`;
          let rot = 0;
          if (m.rotation !== undefined && m.rotation !== null && !isNaN(Number(m.rotation)) && Number(m.rotation) !== 0) {
            rot = Number(m.rotation);
          } else if (savedRotations[rotKey] !== undefined) {
            rot = Number(savedRotations[rotKey]);
          } else if (savedRotations[m.room_id || m.roomId] !== undefined) {
            rot = Number(savedRotations[m.room_id || m.roomId]);
          }
          return {
            x: Number(m.x),
            y: Number(m.y),
            roomId: Number(m.room_id || m.roomId),
            rotation: rot
          };
        });

        resultFloors.push({
          id: bldg.id, // Dùng buildingId làm ID
          floorId: floorIdNum,
          buildingId: bldg.id,
          name: bldg.name,
          image: mapImage,
          markers: bldgMarkers
        });
      });
    }

    // 2. Nếu có phòng chưa phân khu, thêm mục "Chưa phân khu"
    const hasUnassignedRooms = rooms.some(r => !r.buildingId);
    if (hasUnassignedRooms || resultFloors.length === 0) {
      const unassignedRow = allFloors.find(f => !f.building_id || f.floor_id === 0 || f.floor_name === 'Chưa phân khu');
      const unassignedConfig = buildingMinimapsConfig['__unassigned__'] || {};
      const rawUnassignedMarkers = (unassignedConfig.markers && unassignedConfig.markers.length > 0)
        ? unassignedConfig.markers
        : (unassignedRow ? allMarkers.filter(m => Number(m.floor_id) === Number(unassignedRow.floor_id)) : []);

      const unassignedMarkers = rawUnassignedMarkers.map(m => ({
        x: Number(m.x),
        y: Number(m.y),
        roomId: Number(m.room_id || m.roomId),
        rotation: Number(m.rotation) || 0
      }));

      resultFloors.push({
        id: '__unassigned__',
        floorId: 9999,
        buildingId: null,
        name: 'Chưa phân khu',
        image: unassignedConfig.image || unassignedRow?.image_url || "",
        markers: unassignedMarkers
      });
    }

    return { floors: resultFloors };
  },

  async saveMinimap(minimapData) {
    const floors = minimapData.floors || [];
    
    // Cập nhật rotations & buildings map
    const LOCAL_ROT_FILE = path.join(__dirname, '..', 'data', 'minimap-rotations.json');
    const LOCAL_BLDG_MAP_FILE = path.join(__dirname, '..', 'data', 'building-minimaps.json');
    let currentRotations = {};
    let buildingMinimapsConfig = {};

    try {
      if (fs.existsSync(LOCAL_ROT_FILE)) {
        currentRotations = JSON.parse(fs.readFileSync(LOCAL_ROT_FILE, 'utf8')) || {};
      }
    } catch {}

    try {
      if (fs.existsSync(LOCAL_BLDG_MAP_FILE)) {
        buildingMinimapsConfig = JSON.parse(fs.readFileSync(LOCAL_BLDG_MAP_FILE, 'utf8')) || {};
      }
    } catch {}

    // Lưu các phân khu
    for (let i = 0; i < floors.length; i++) {
      const floor = floors[i];
      const floorIdNum = Number(floor.floorId) || (i + 1);
      const bldgId = floor.buildingId || floor.id || null;

      buildingMinimapsConfig[bldgId || '__unassigned__'] = {
        image: floor.image || "",
        markers: floor.markers || []
      };

      const floorPayload = {
        floor_id: floorIdNum,
        floor_name: floor.name,
        image_url: floor.image || ""
      };
      if (bldgId && bldgId !== '__unassigned__') {
        floorPayload.building_id = bldgId;
      }

      let { error: floorErr } = await supabase
        .from('minimaps')
        .upsert(floorPayload);
      
      if (floorErr && floorErr.message && (floorErr.message.includes('building_id') || floorErr.code === '42703' || floorErr.code === 'PGRST204')) {
        const fallbackPayload = {
          floor_id: floorIdNum,
          floor_name: floor.name,
          image_url: floor.image || ""
        };
        const fallbackRes = await supabase.from('minimaps').upsert(fallbackPayload);
        if (fallbackRes.error) console.warn('Minimaps upsert fallback error:', fallbackRes.error);
      } else if (floorErr) {
        console.warn('Minimaps upsert error:', floorErr);
      }

      // Xóa markers cũ của tầng này
      await supabase
        .from('minimap_markers')
        .delete()
        .eq('floor_id', floorIdNum);

      // Chèn markers mới
      if (floor.markers && floor.markers.length > 0) {
        floor.markers.forEach(m => {
          const rot = Number(m.rotation) || 0;
          currentRotations[`${floorIdNum}_${m.roomId}`] = rot;
          currentRotations[m.roomId] = rot;
        });

        const insertMarkers = floor.markers.map(m => ({
          floor_id: floorIdNum,
          room_id: Number(m.roomId),
          x: Number(m.x),
          y: Number(m.y),
          rotation: Number(m.rotation) || 0
        }));

        let { error: insErr } = await supabase
          .from('minimap_markers')
          .insert(insertMarkers);
        
        if (insErr && insErr.message && (insErr.message.includes('rotation') || insErr.code === '42703' || insErr.code === 'PGRST204')) {
          const fallbackMarkers = insertMarkers.map(({ rotation, ...rest }) => rest);
          await supabase.from('minimap_markers').insert(fallbackMarkers);
        }
      }
    }

    // Ghi file local và lưu app_configs
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(LOCAL_ROT_FILE, JSON.stringify(currentRotations, null, 2), 'utf8');
      fs.writeFileSync(LOCAL_BLDG_MAP_FILE, JSON.stringify(buildingMinimapsConfig, null, 2), 'utf8');
      await this.saveAppConfig('minimap_rotations', currentRotations);
      await this.saveAppConfig('building_minimaps', buildingMinimapsConfig);
    } catch (e) {
      console.warn('⚠️ [Supabase DB] Error saving minimap configs:', e.message);
    }
  },

  // --- APP CONFIGS (api_config, tour_scenario) ---
  async getAppConfig(key) {
    const { data, error } = await supabase
      .from('app_configs')
      .select('data')
      .eq('key', key)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') return null; // Row not found
      console.error(`Error fetching config ${key}:`, error);
      return null;
    }
    return data.data;
  },

  async saveAppConfig(key, data) {
    const { error } = await supabase
      .from('app_configs')
      .upsert({ key, data });
    if (error) throw error;
  },

  // --- USERS & AUTH ---
  async getUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching users:', error);
      return [];
    }
    return data;
  },

  async getUserByUsername(username) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async createUser(user) {
    const { data, error } = await supabase
      .from('users')
      .insert({
        username: user.username,
        password_hash: user.passwordHash,
        role: user.role || 'user',
        display_name: user.displayName || user.username
      })
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async updateUser(id, updates) {
    const mapped = {};
    if (updates.username !== undefined) mapped.username = updates.username;
    if (updates.passwordHash !== undefined) mapped.password_hash = updates.passwordHash;
    if (updates.role !== undefined) mapped.role = updates.role;
    if (updates.displayName !== undefined) mapped.display_name = updates.displayName;

    const { data, error } = await supabase
      .from('users')
      .update(mapped)
      .eq('id', Number(id))
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async deleteUser(id) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', Number(id));
    if (error) throw error;
  },

  async updateLastLogin(id) {
    const { error } = await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', Number(id));
    if (error) {
      console.error('Failed to update last login for user:', id, error);
    }
  },

  // --- INVITATIONS ---
  async getInvitations() {
    const data = await this.getAppConfig('invitations');
    return Array.isArray(data) ? data : [];
  },

  async saveInvitations(invitations) {
    await this.saveAppConfig('invitations', invitations);
  }
};

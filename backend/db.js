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
      .order('id', { foreignTable: 'hotspots', ascending: true })
      .order('id', { foreignTable: 'media_hotspots', ascending: true })
      .order('id', { foreignTable: 'mail_hotspots', ascending: true });

    if (result.error) {
      console.warn('⚠️ [Supabase DB] Query with order_index failed, falling back to unordered rooms:', result.error.message);
      result = await supabase
        .from('rooms')
        .select('*, hotspots(*), media_hotspots(*), mail_hotspots(*)')
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
        iconUrl: h.icon_url || undefined
      })),
      mediaHotspots: (r.media_hotspots || []).map(m => ({
        yaw: Number(m.yaw),
        pitch: Number(m.pitch),
        title: m.title,
        description: m.description,
        mediaUrl: m.media_url,
        mediaType: m.media_type,
        highlightPolygon: m.highlight_polygon
      })),
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
        roomId: Number(s.room_id),
        type: s.type,
        position: {
          yaw: Number(s.yaw),
          pitch: Number(s.pitch)
        },
        lastUpdate: s.last_update,
        color: s.color || undefined
      };
      
      // Parse sensors value or camera data
      if (s.type === 'camera') {
        result.camera = s.data || {};
      } else {
        result.sensors = s.data || {};
      }
      return result;
    });
  },

  async insertSensor(sensor) {
    const data = sensor.type === 'camera' ? sensor.camera : sensor.sensors;
    const { error } = await supabase.from('sensors').insert({
      id: Number(sensor.id),
      name: sensor.name,
      room_id: Number(sensor.roomId),
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
    if (sensor.roomId !== undefined) mapped.room_id = Number(sensor.roomId);
    if (sensor.position !== undefined) {
      mapped.yaw = Number(sensor.position.yaw || 0);
      mapped.pitch = Number(sensor.position.pitch || 0);
    }
    if (sensor.type !== undefined) mapped.type = sensor.type;
    if (sensor.lastUpdate !== undefined) mapped.last_update = sensor.lastUpdate;
    if (sensor.color !== undefined) mapped.color = sensor.color;
    
    const data = sensor.type === 'camera' ? sensor.camera : sensor.sensors;
    if (data !== undefined) mapped.data = data;

    const { error } = await supabase
      .from('sensors')
      .update(mapped)
      .eq('id', Number(id));
    if (error) throw error;
  },

  async deleteSensor(id) {
    const { error } = await supabase
      .from('sensors')
      .delete()
      .eq('id', Number(id));
    if (error) throw error;
  },

  // --- MINIMAPS & MARKERS ---
  async getMinimap() {
    const { data: floors, error: floorErr } = await supabase
      .from('minimaps')
      .select('*')
      .order('floor_id', { ascending: true });
      
    if (floorErr) {
      console.error('Error fetching minimaps:', floorErr);
      return { floors: [] };
    }

    const { data: markers, error: markerErr } = await supabase
      .from('minimap_markers')
      .select('*');
      
    if (markerErr) {
      console.error('Error fetching minimap markers:', markerErr);
      return { floors: floors.map(f => ({ id: f.floor_id, name: f.floor_name, image: f.image_url, markers: [] })) };
    }

    return {
      floors: floors.map(f => ({
        id: Number(f.floor_id),
        name: f.floor_name,
        image: f.image_url,
        markers: markers
          .filter(m => Number(m.floor_id) === Number(f.floor_id))
          .map(m => ({
            x: Number(m.x),
            y: Number(m.y),
            roomId: Number(m.room_id)
          }))
      }))
    };
  },

  async saveMinimap(minimapData) {
    // Để an toàn, chúng ta truncate và ghi lại cấu hình minimap
    // Đây là schema đơn giản cho cấu hình
    const floors = minimapData.floors || [];
    
    // Lưu các tầng
    for (const floor of floors) {
      const { error: floorErr } = await supabase
        .from('minimaps')
        .upsert({
          floor_id: Number(floor.id),
          floor_name: floor.name,
          image_url: floor.image || ""
        });
      if (floorErr) throw floorErr;

      // Xóa markers cũ của tầng này
      const { error: delErr } = await supabase
        .from('minimap_markers')
        .delete()
        .eq('floor_id', Number(floor.id));
      if (delErr) throw delErr;

      // Chèn markers mới
      if (floor.markers && floor.markers.length > 0) {
        const insertMarkers = floor.markers.map(m => ({
          floor_id: Number(floor.id),
          room_id: Number(m.roomId),
          x: Number(m.x),
          y: Number(m.y)
        }));
        const { error: insErr } = await supabase
          .from('minimap_markers')
          .insert(insertMarkers);
        if (insErr) throw insErr;
      }
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
  }
};

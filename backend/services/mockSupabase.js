/**
 * backend/services/mockSupabase.js
 * Giả lập Supabase Client khi chạy ở chế độ TEST SANDBOX hoặc khi Supabase bị tắt.
 * Đảm bảo 100% KHÔNG có request nào gửi ra cloud, bảo vệ dữ liệu thực.
 */

const fs = require('fs');
const path = require('path');

function createMockSupabase(dataDir) {
  function readJson(filename, defVal) {
    try {
      const p = path.join(dataDir, filename);
      if (!fs.existsSync(p)) return defVal;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return defVal;
    }
  }

  function writeJson(filename, data) {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn(`[mockSupabase] Failed to write ${filename}:`, err.message);
    }
  }

  return {
    from(tableName) {
      let filterEq = [];
      let sortCol = null;
      let sortAsc = true;
      let limitCount = null;
      let isSingle = false;

      const builder = {
        select(fields) {
          return builder;
        },
        eq(col, val) {
          filterEq.push({ col, val });
          return builder;
        },
        order(col, opts = {}) {
          sortCol = col;
          sortAsc = opts.ascending !== false;
          return builder;
        },
        limit(n) {
          limitCount = n;
          return builder;
        },
        single() {
          isSingle = true;
          return builder.then ? builder.then(res => res) : builder;
        },
        async insert(payload) {
          const items = Array.isArray(payload) ? payload : [payload];

          if (tableName === 'hotspots') {
            const rooms = readJson('rooms.json', []);
            for (const item of items) {
              const r = rooms.find(rm => rm.id === Number(item.room_id));
              if (r) {
                if (!r.hotspots) r.hotspots = [];
                const hsId = item.id || Date.now() + Math.floor(Math.random() * 1000);
                r.hotspots.push({
                  id: hsId,
                  yaw: Number(item.yaw),
                  pitch: Number(item.pitch),
                  target: Number(item.target_room_id),
                  rotation: Number(item.rotation || 0),
                  color: item.color || undefined,
                  initialYaw: item.initial_yaw !== undefined ? Number(item.initial_yaw) : undefined,
                  initialPitch: item.initial_pitch !== undefined ? Number(item.initial_pitch) : undefined
                });
              }
            }
            writeJson('rooms.json', rooms);
          } else if (tableName === 'media_hotspots') {
            const rooms = readJson('rooms.json', []);
            for (const item of items) {
              const r = rooms.find(rm => rm.id === Number(item.room_id));
              if (r) {
                if (!r.mediaHotspots) r.mediaHotspots = [];
                r.mediaHotspots.push({
                  id: item.id || Date.now() + Math.floor(Math.random() * 1000),
                  yaw: Number(item.yaw),
                  pitch: Number(item.pitch),
                  title: item.title,
                  description: item.description,
                  mediaUrl: item.media_url,
                  mediaType: item.media_type,
                  iconUrl: item.icon_url,
                  highlightPolygon: item.highlight_polygon
                });
              }
            }
            writeJson('rooms.json', rooms);
          } else if (tableName === 'mail_hotspots') {
            const rooms = readJson('rooms.json', []);
            for (const item of items) {
              const r = rooms.find(rm => rm.id === Number(item.room_id));
              if (r) {
                if (!r.mailHotspots) r.mailHotspots = [];
                r.mailHotspots.push({
                  id: item.id || Date.now() + Math.floor(Math.random() * 1000),
                  title: item.title,
                  recipient: item.recipient,
                  subject: item.subject,
                  body: item.body,
                  updatedAt: new Date().toISOString(),
                  yaw: item.yaw !== undefined ? Number(item.yaw) : undefined,
                  pitch: item.pitch !== undefined ? Number(item.pitch) : undefined,
                  screenX: item.screen_x !== undefined ? Number(item.screen_x) : undefined,
                  screenY: item.screen_y !== undefined ? Number(item.screen_y) : undefined
                });
              }
            }
            writeJson('rooms.json', rooms);
          } else if (tableName === 'rooms') {
            const rooms = readJson('rooms.json', []);
            for (const item of items) {
              rooms.push({
                id: Number(item.id || Date.now()),
                name: item.name,
                image: item.image_url || '',
                tilesPath: item.tiles_path || '',
                tilesConfig: item.tiles_config || { levels: [] },
                floor: Number(item.floor || 1),
                buildingId: item.building_id || undefined,
                orderIndex: Number(item.order_index || 0),
                hotspots: [],
                mediaHotspots: [],
                mailHotspots: []
              });
            }
            writeJson('rooms.json', rooms);
          } else if (tableName === 'buildings') {
            const bldgs = readJson('buildings.json', []);
            bldgs.push(...items);
            writeJson('buildings.json', bldgs);
          } else if (tableName === 'sensors') {
            const sensors = readJson('sensors.json', []);
            sensors.push(...items);
            writeJson('sensors.json', sensors);
          } else if (tableName === 'users') {
            const users = readJson('users.json', []);
            users.push(...items);
            writeJson('users.json', users);
          }

          return { data: items, error: null };
        },
        async update(payload) {
          if (tableName === 'hotspots' || tableName === 'media_hotspots' || tableName === 'mail_hotspots') {
            const rooms = readJson('rooms.json', []);
            const idFilter = filterEq.find(f => f.col === 'id');
            if (idFilter) {
              const targetId = Number(idFilter.val);
              for (const r of rooms) {
                const list = tableName === 'hotspots' ? r.hotspots : (tableName === 'media_hotspots' ? r.mediaHotspots : r.mailHotspots);
                if (Array.isArray(list)) {
                  const idx = list.findIndex(h => Number(h.id) === targetId);
                  if (idx !== -1) {
                    list[idx] = { ...list[idx], ...payload };
                  }
                }
              }
              writeJson('rooms.json', rooms);
            }
          } else if (tableName === 'rooms') {
            const rooms = readJson('rooms.json', []);
            const idFilter = filterEq.find(f => f.col === 'id');
            if (idFilter) {
              const targetId = Number(idFilter.val);
              const idx = rooms.findIndex(r => r.id === targetId);
              if (idx !== -1) {
                rooms[idx] = { ...rooms[idx], ...payload };
                writeJson('rooms.json', rooms);
              }
            }
          }
          return { data: [payload], error: null };
        },
        async upsert(payload) {
          const items = Array.isArray(payload) ? payload : [payload];
          if (tableName === 'app_configs') {
            const configs = readJson('app-configs.json', {});
            for (const it of items) {
              if (it.key) configs[it.key] = it.data;
            }
            writeJson('app-configs.json', configs);
          }
          return { data: items, error: null };
        },
        async delete() {
          const idFilter = filterEq.find(f => f.col === 'id');
          const floorFilter = filterEq.find(f => f.col === 'floor_id');

          if (tableName === 'hotspots' || tableName === 'media_hotspots' || tableName === 'mail_hotspots') {
            if (idFilter) {
              const targetId = Number(idFilter.val);
              const rooms = readJson('rooms.json', []);
              for (const r of rooms) {
                const prop = tableName === 'hotspots' ? 'hotspots' : (tableName === 'media_hotspots' ? 'mediaHotspots' : 'mailHotspots');
                if (Array.isArray(r[prop])) {
                  r[prop] = r[prop].filter(h => Number(h.id) !== targetId);
                }
              }
              writeJson('rooms.json', rooms);
            }
          } else if (tableName === 'rooms' && idFilter) {
            let rooms = readJson('rooms.json', []);
            rooms = rooms.filter(r => r.id !== Number(idFilter.val));
            writeJson('rooms.json', rooms);
          }
          return { data: [], error: null };
        },
        // Thêm hỗ trợ Promise-like cho query chaining await builder
        then(resolve, reject) {
          let rows = [];

          if (tableName === 'hotspots') {
            const rooms = readJson('rooms.json', []);
            const rFilter = filterEq.find(f => f.col === 'room_id');
            if (rFilter) {
              const r = rooms.find(rm => rm.id === Number(rFilter.val));
              rows = (r?.hotspots || []).map((h, i) => ({ id: h.id || i + 1, ...h }));
            }
          } else if (tableName === 'media_hotspots') {
            const rooms = readJson('rooms.json', []);
            const rFilter = filterEq.find(f => f.col === 'room_id');
            if (rFilter) {
              const r = rooms.find(rm => rm.id === Number(rFilter.val));
              rows = (r?.mediaHotspots || []).map((h, i) => ({ id: h.id || i + 1, ...h }));
            }
          } else if (tableName === 'mail_hotspots') {
            const rooms = readJson('rooms.json', []);
            const rFilter = filterEq.find(f => f.col === 'room_id');
            if (rFilter) {
              const r = rooms.find(rm => rm.id === Number(rFilter.val));
              rows = (r?.mailHotspots || []).map((h, i) => ({ id: h.id || i + 1, ...h }));
            }
          } else if (tableName === 'rooms') {
            rows = readJson('rooms.json', []);
          } else if (tableName === 'buildings') {
            rows = readJson('buildings.json', []);
          } else if (tableName === 'sensors') {
            rows = readJson('sensors.json', []);
          } else if (tableName === 'users') {
            rows = readJson('users.json', []);
          } else if (tableName === 'app_configs') {
            const configs = readJson('app-configs.json', {});
            const kFilter = filterEq.find(f => f.col === 'key');
            if (kFilter) {
              const val = configs[kFilter.val];
              rows = val !== undefined ? [{ key: kFilter.val, data: val }] : [];
            }
          } else if (tableName === 'notifications') {
            rows = readJson('notifications.json', []);
          }

          // Áp dụng filters
          for (const f of filterEq) {
            rows = rows.filter(r => String(r[f.col]) === String(f.val));
          }

          if (limitCount !== null) {
            rows = rows.slice(0, limitCount);
          }

          const result = isSingle
            ? { data: rows[0] || null, error: rows.length ? null : { code: 'PGRST116', message: 'Not found' } }
            : { data: rows, error: null };

          return Promise.resolve(result).then(resolve, reject);
        }
      };

      return builder;
    }
  };
}

module.exports = { createMockSupabase };

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env");
  process.exit(1);
}

const db = require('./backend/db');
const LOCAL_DATA_FILE = path.join(__dirname, "data/rooms.json");
const roomId = 1769668397635;

async function testSync() {
  console.log("=== STARTING SYNC TEST ===");
  console.log(`Target Room ID: ${roomId}`);
  
  try {
    if (!fs.existsSync(LOCAL_DATA_FILE)) {
      throw new Error(`Local file not found at ${LOCAL_DATA_FILE}`);
    }
    
    // Read local room
    const localRooms = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, "utf8"));
    const localRoom = localRooms.find(r => Number(r.id) === Number(roomId));
    if (!localRoom) {
      throw new Error(`Room ${roomId} not found in rooms.json`);
    }
    console.log("Local room found:", localRoom.name);

    // 0. Ensure Room and Building exist in Supabase
    console.log("Checking if room exists in Supabase...");
    const { data: dbRoom, error: selectRoomErr } = await db.supabase
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .maybeSingle();

    if (selectRoomErr) throw selectRoomErr;

    if (!dbRoom) {
      console.log(`Room ${roomId} not found in Supabase. Auto-inserting room first.`);
      
      if (localRoom.buildingId) {
        console.log(`Checking building ${localRoom.buildingId}...`);
        const { data: dbBldg } = await db.supabase
          .from('buildings')
          .select('id')
          .eq('id', localRoom.buildingId)
          .maybeSingle();
          
        if (!dbBldg) {
          console.log(`Building ${localRoom.buildingId} not found. Inserting...`);
          let bldgName = "Khu vực " + localRoom.buildingId;
          try {
            const bldgFile = path.join(__dirname, 'data/buildings.json');
            if (fs.existsSync(bldgFile)) {
              const bldgs = JSON.parse(fs.readFileSync(bldgFile, "utf8"));
              const localB = bldgs.find(b => b.id === localRoom.buildingId);
              if (localB) bldgName = localB.name;
            }
          } catch (e) {
            console.log("Error reading buildings.json:", e.message);
          }
          
          const { error: bldgInsErr } = await db.supabase.from('buildings').insert({
            id: localRoom.buildingId,
            name: bldgName
          });
          if (bldgInsErr) throw bldgInsErr;
          console.log("Building inserted successfully.");
        }
      }

      console.log("Inserting room...");
      const { error: roomInsErr } = await db.supabase.from('rooms').insert({
        id: roomId,
        name: localRoom.name,
        image_url: localRoom.image || "",
        tiles_path: localRoom.tilesPath || null,
        tiles_config: localRoom.tilesConfig || null,
        floor: localRoom.floor || 1,
        building_id: localRoom.buildingId || null
      });
      if (roomInsErr) throw roomInsErr;
      console.log("Room inserted successfully.");
    } else {
      console.log("Room already exists in Supabase.");
    }

    // 1. Sync media hotspots if counts differ
    const localMedias = localRoom.mediaHotspots || [];
    console.log(`Checking media hotspots in Supabase (local count: ${localMedias.length})...`);
    const { data: dbMedias, error: selectMediaErr } = await db.supabase
      .from('media_hotspots')
      .select('id')
      .eq('room_id', roomId);
      
    if (selectMediaErr) throw selectMediaErr;
    console.log(`Supabase media hotspots count: ${dbMedias?.length || 0}`);

    if (!dbMedias || dbMedias.length !== localMedias.length) {
      console.log("Mismatch detected. Deleting old media hotspots in Supabase...");
      const { error: delErr } = await db.supabase.from('media_hotspots').delete().eq('room_id', roomId);
      if (delErr) throw delErr;

      console.log("Inserting fresh media hotspots...");
      for (const m of localMedias) {
        console.log(`Inserting media hotspot: ${m.title}`);
        const { error: insErr } = await db.supabase.from('media_hotspots').insert({
          room_id: roomId,
          yaw: Number(m.yaw),
          pitch: Number(m.pitch),
          title: m.title || null,
          description: m.description || null,
          media_url: m.mediaUrl || null,
          media_type: m.mediaType,
          highlight_polygon: m.highlightPolygon || null
        });
        if (insErr) throw insErr;
      }
      console.log("Media hotspots synced successfully.");
    } else {
      console.log("Media hotspots already in sync.");
    }

    // 2. Sync navigation hotspots if counts differ
    const localHotspots = localRoom.hotspots || [];
    console.log(`Checking navigation hotspots in Supabase (local count: ${localHotspots.length})...`);
    const { data: dbHotspots, error: selectHotspotErr } = await db.supabase
      .from('hotspots')
      .select('id')
      .eq('room_id', roomId);
      
    if (selectHotspotErr) throw selectHotspotErr;
    console.log(`Supabase hotspots count: ${dbHotspots?.length || 0}`);

    if (!dbHotspots || dbHotspots.length !== localHotspots.length) {
      console.log("Mismatch detected. Deleting old hotspots in Supabase...");
      const { error: delErr } = await db.supabase.from('hotspots').delete().eq('room_id', roomId);
      if (delErr) throw delErr;

      console.log("Inserting fresh hotspots...");
      for (const h of localHotspots) {
        console.log(`Inserting hotspot pointing to room: ${h.target}`);
        const { error: insErr } = await db.supabase.from('hotspots').insert({
          room_id: roomId,
          yaw: Number(h.yaw),
          pitch: Number(h.pitch),
          target_room_id: Number(h.target),
          rotation: Number(h.rotation || 0),
          color: h.color || null,
          icon_url: h.iconUrl || null
        });
        if (insErr) throw insErr;
      }
      console.log("Navigation hotspots synced successfully.");
    } else {
      console.log("Navigation hotspots already in sync.");
    }

    console.log("\n--- VERIFYING ROOM BY ID ---");
    const fetchedRoom = await db.getRoomById(roomId);
    if (!fetchedRoom) {
      throw new Error(`getRoomById(${roomId}) returned undefined after sync!`);
    }
    console.log(`Fetched room details from getRoomById:`);
    console.log(`- Name: ${fetchedRoom.name}`);
    console.log(`- Hotspots count: ${fetchedRoom.hotspots?.length}`);
    console.log(`- Media hotspots count: ${fetchedRoom.mediaHotspots?.length}`);
    
    console.log("\n=== TEST PASSED SUCCESSFULLY ===");

  } catch (err) {
    console.error("\n❌ TEST FAILED!");
    console.error("Error Message:", err.message);
    console.error("Full Error object:", err);
  }
}

testSync();

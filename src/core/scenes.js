const scenes = {};
const roomsData = {};
const preloadedImages = new Set();

let env = {
  getViewer: () => null,
  switchRoom: (id) => {}
};

export function initScenesFeature(dependencies) {
  env = { ...env, ...dependencies };
}

export function getScenes() { 
  return scenes; 
}

export function getRoomsData() { 
  return roomsData; 
}

export function preloadPanoramaImage(imageUrl) {
  if (!imageUrl || preloadedImages.has(imageUrl)) return;
  preloadedImages.add(imageUrl);
  const cleanUrl = (imageUrl && imageUrl.startsWith('http')) 
    ? imageUrl 
    : (imageUrl ? window.location.origin + (imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl) : '');
  if (!cleanUrl) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = cleanUrl;
}

export function preloadConnectedRooms(roomId) {
  const room = roomsData[roomId];
  if (!room) return;
  if (Array.isArray(room.hotspots)) {
    room.hotspots.forEach(hs => {
      const targetRoom = roomsData[hs.target];
      if (targetRoom && targetRoom.image) {
        preloadPanoramaImage(targetRoom.image);
      }
    });
  }
}

export function initRooms(rooms, roomSelectEl) {
  // Reset roomsData
  Object.keys(roomsData).forEach(k => delete roomsData[k]);

  // Rebuild room dropdown
  if (roomSelectEl) roomSelectEl.innerHTML = "";

  const viewer = env.getViewer();

  rooms.forEach(room => {
    roomsData[room.id] = room;

    // Create scene if new
    if (!scenes[room.id]) {
      let source, geometry;

      // Equirectangular single panorama image rendering
      const imageUrl = (room.image && room.image.startsWith('http')) 
        ? room.image 
        : (room.image ? window.location.origin + room.image : '');

      source = Marzipano.ImageUrlSource.fromString(imageUrl);
      geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);

      const view = new Marzipano.RectilinearView({ fov: Math.PI / 2 });

      const scene = viewer.createScene({ source, geometry, view });
      scenes[room.id] = scene;
    }

    // Room option
    if (roomSelectEl) {
      const option = document.createElement("option");
      option.value = room.id;
      option.textContent = room.name;
      roomSelectEl.appendChild(option);
    }
  });

  // Preload all tour panorama images in the background using requestIdleCallback
  if (typeof window !== 'undefined') {
    const doPreload = () => {
      rooms.forEach(r => {
        if (r.image) preloadPanoramaImage(r.image);
      });
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(doPreload, { timeout: 2500 });
    } else {
      setTimeout(doPreload, 800);
    }
  }

  // Add change event listener via onchange to prevent duplicate listeners
  if (roomSelectEl) {
    roomSelectEl.onchange = (e) => {
      env.switchRoom(parseInt(e.target.value));
    };
  }
}

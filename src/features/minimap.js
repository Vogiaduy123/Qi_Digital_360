import { fetchMinimap } from '../core/api.js';

let env = {
  getRoomsData: () => ({}),
  getCurrentRoomId: () => null,
  getActiveBuildingId: () => null,
  switchRoom: (id) => {},
  getViewer: () => null
};

// Minimap elements
const minimapWrapper = document.getElementById('minimapWrapper');
const minimapToggle = document.getElementById('minimapToggle');
const minimapContent = document.getElementById('minimapContent');
const userMinimapContainer = document.getElementById('userMinimapContainer');
const userMinimapImage = document.getElementById('userMinimapImage');
const userMinimapCanvas = document.getElementById('userMinimapCanvas');

// Pan/zoom elements
const minimapViewport = document.getElementById('minimapViewport');
const minimapLayer = document.getElementById('minimapLayer');
const minimapZoomIn = document.getElementById('minimapZoomIn');
const minimapZoomOut = document.getElementById('minimapZoomOut');
const minimapZoomReset = document.getElementById('minimapZoomReset');
const minimapZoomLabel = document.getElementById('minimapZoomLabel');

// State
let minimapData = null;
let minimapCtx = null;
let isMinimapCollapsed = false;
let currentFloorId = 1;

// Pan/zoom state
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const VIEWPORT_W = 240;
const VIEWPORT_H = 180;

let zoom = 1;
let panX = 0;
let panY = 0;
let isDragging = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyTransform() {
  if (!minimapLayer) return;
  minimapLayer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  if (minimapZoomLabel) {
    minimapZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
}

function clampPan() {
  const layerW = VIEWPORT_W * zoom;
  const layerH = VIEWPORT_H * zoom;
  panX = Math.min(0, Math.max(panX, VIEWPORT_W - layerW));
  panY = Math.min(0, Math.max(panY, VIEWPORT_H - layerH));
}

function setZoom(newZoom) {
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
  if (zoom === ZOOM_MIN) { panX = 0; panY = 0; }
  clampPan();
  applyTransform();
}

// ─── Pan/zoom init ────────────────────────────────────────────────────────────

function initMinimapPanZoom() {
  if (!minimapViewport) return;

  // Zoom buttons
  minimapZoomIn?.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  minimapZoomOut?.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  minimapZoomReset?.addEventListener('click', () => {
    zoom = ZOOM_MIN;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  // Pan — mouse drag
  minimapViewport.addEventListener('mousedown', (e) => {
    // Only primary button
    if (e.button !== 0) return;
    e.preventDefault();

    isDragging = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const panStartX = panX;
    const panStartY = panY;

    function onMove(me) {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        isDragging = true;
      }
      if (!isDragging) return;
      panX = panStartX + dx;
      panY = panStartY + dy;
      clampPan();
      applyTransform();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Reset isDragging after a tick so click handler can check it
      setTimeout(() => { isDragging = false; }, 0);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── Core init ────────────────────────────────────────────────────────────────

export function initMinimap(dependencies) {
  env = { ...env, ...dependencies };

  if (minimapToggle) {
    minimapToggle.addEventListener('click', () => {
      isMinimapCollapsed = !isMinimapCollapsed;
      if (isMinimapCollapsed) {
        minimapContent.style.display = 'none';
        minimapToggle.textContent = '+';
      } else {
        minimapContent.style.display = 'block';
        minimapToggle.textContent = '−';
      }
    });
  }

  initMinimapPanZoom();
}

// ─── Building & Floor helpers ─────────────────────────────────────────────────

function getActiveBuildingId() {
  const room = env.getRoomsData()[env.getCurrentRoomId()];
  if (room && room.buildingId) {
    return room.buildingId;
  }
  if (env.getActiveBuildingId) {
    const activeBldg = env.getActiveBuildingId();
    if (activeBldg) return activeBldg;
  }
  return null;
}

function getAvailableFloorsForCurrentContext() {
  if (!minimapData || !minimapData.floors || minimapData.floors.length === 0) return [];
  
  const activeBldgId = getActiveBuildingId();
  if (activeBldgId) {
    const bldgFloor = minimapData.floors.find(f => f.buildingId === activeBldgId || f.id === activeBldgId);
    if (bldgFloor) return [bldgFloor];
    return [];
  }

  // Nếu chưa chọn phân khu, tìm sơ đồ của phòng hiện tại hoặc sơ đồ đầu tiên
  const curRoomId = env.getCurrentRoomId();
  if (curRoomId) {
    const matchingFloor = minimapData.floors.find(f => f.markers && f.markers.some(m => m.roomId === curRoomId));
    if (matchingFloor) return [matchingFloor];
  }

  return minimapData.floors;
}

function getCurrentFloor() {
  const availableFloors = getAvailableFloorsForCurrentContext();
  if (availableFloors.length === 0) return null;

  const found = availableFloors.find(f => f.id === currentFloorId || f.buildingId === currentFloorId);
  if (found) return found;

  return availableFloors[0];
}

// ─── Floor header & tabs ───────────────────────────────────────────────────────

function renderFloorTabs() {
  const floorTabsContainer = document.getElementById('floorTabs');
  const minimapHeaderTitle = document.querySelector('#minimapHeader span');
  
  const currentFloor = getCurrentFloor();
  if (!currentFloor) return;

  if (minimapHeaderTitle) {
    minimapHeaderTitle.textContent = `🗺️ Sơ đồ: ${currentFloor.name}`;
  }

  if (floorTabsContainer) {
    floorTabsContainer.style.display = 'none'; // 1 Phân khu = 1 Minimap, không cần tabs đổi tầng
  }
}

function switchFloor(floorId) {
  currentFloorId = floorId;
  renderFloorTabs();
  const floor = getCurrentFloor();
  if (floor && floor.image) {
    minimapWrapper.style.display = 'block';
    userMinimapImage.src = floor.image;
    userMinimapImage.onload = () => {
      initUserMinimapCanvas();
      drawUserMinimap();
    };
  } else {
    minimapWrapper.style.display = 'none';
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadMinimap() {
  try {
    const data = await fetchMinimap();

    if (data.success && data.minimap && data.minimap.floors && data.minimap.floors.length > 0) {
      minimapData = data.minimap;
      updateMinimapHighlight();
    }
  } catch (err) {
    console.error('Lỗi load minimap:', err);
  }
}

// ─── Canvas init ──────────────────────────────────────────────────────────────

function initUserMinimapCanvas() {
  const width = userMinimapImage.offsetWidth;
  const height = userMinimapImage.offsetHeight;

  userMinimapCanvas.width = width;
  userMinimapCanvas.height = height;
  minimapCtx = userMinimapCanvas.getContext('2d');

  // Register click/hover on viewport (not canvas, since canvas has pointer-events:none)
  // Remove old listeners first to avoid duplicates on floor switch
  minimapViewport?.removeEventListener('click', handleMinimapClick);
  minimapViewport?.removeEventListener('mousemove', handleMinimapHover);
  minimapViewport?.addEventListener('click', handleMinimapClick);
  minimapViewport?.addEventListener('mousemove', handleMinimapHover);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function handleMinimapClick(e) {
  // Ignore if the user was dragging (not a real click)
  if (isDragging) return;

  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = minimapViewport.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;
  // Map raw viewport coords back through the current pan/zoom transform
  const x = (rawX - panX) / (rect.width * zoom);
  const y = (rawY - panY) / (rect.height * zoom);

  const clickedMarkerIndex = getMarkerAtPosition(x, y);
  if (clickedMarkerIndex !== -1) {
    const marker = floor.markers[clickedMarkerIndex];
    if (marker.roomId && env.getRoomsData()[marker.roomId]) {
      env.switchRoom(marker.roomId);
    }
  }
}

function handleMinimapHover(e) {
  if (isDragging) return;

  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return;

  const rect = minimapViewport.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;
  const x = (rawX - panX) / (rect.width * zoom);
  const y = (rawY - panY) / (rect.height * zoom);

  const hoverIndex = getMarkerAtPosition(x, y);
  minimapViewport.style.cursor = hoverIndex !== -1 ? 'pointer' : 'grab';
  if (hoverIndex !== -1) {
    const marker = floor.markers[hoverIndex];
    const room = marker.roomId ? env.getRoomsData()[marker.roomId] : null;
    minimapViewport.title = room ? room.name : '';
  } else {
    minimapViewport.title = '';
  }
}

function getMarkerAtPosition(x, y) {
  const floor = getCurrentFloor();
  if (!floor || !floor.markers) return -1;

  const tolerance = 15 / (userMinimapCanvas.width || 240);

  for (let i = floor.markers.length - 1; i >= 0; i--) {
    const marker = floor.markers[i];
    const dx = marker.x - x;
    const dy = marker.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < tolerance) {
      return i;
    }
  }
  return -1;
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

export function drawUserMinimap() {
  if (!minimapCtx) return;
  const floor = getCurrentFloor();
  if (!floor) return;

  minimapCtx.clearRect(0, 0, userMinimapCanvas.width, userMinimapCanvas.height);

  if (!floor.markers || floor.markers.length === 0) return;

  floor.markers.forEach((marker) => {
    const x = marker.x * userMinimapCanvas.width;
    const y = marker.y * userMinimapCanvas.height;

    const isCurrentRoom = marker.roomId === env.getCurrentRoomId();

    if (isCurrentRoom) {
      // Get yaw and fov from the panorama viewer
      const viewer = env.getViewer && env.getViewer();
      if (viewer && viewer.view()) {
        const view = viewer.view();
        let currentYaw = view.yaw(); // Radians (0 is front)
        let currentFov = view.fov(); // Radians
        
        // Define radar offset (typically north is top => -90 degrees / -PI/2) + marker rotation offset
        const markerRotRad = ((marker.rotation || 0) * Math.PI) / 180;
        const radarOffset = -Math.PI / 2 + markerRotRad;
        
        // Ensure angle boundaries
        const startRad = currentYaw - (currentFov / 2) + radarOffset;
        const endRad = currentYaw + (currentFov / 2) + radarOffset;
        const radius = 50; // Size of the cone
        
        // Draw the radar cone
        minimapCtx.beginPath();
        minimapCtx.moveTo(x, y);
        minimapCtx.arc(x, y, radius, startRad, endRad);
        minimapCtx.lineTo(x, y);
        
        const gradient = minimapCtx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(43, 50, 120, 0.45)');
        gradient.addColorStop(1, 'rgba(43, 50, 120, 0.0)');
        
        minimapCtx.fillStyle = gradient;
        minimapCtx.fill();
        minimapCtx.closePath();
      }

      // Draw the pulsing active dot halo underneath the radar
      minimapCtx.beginPath();
      minimapCtx.arc(x, y, 11, 0, 2 * Math.PI);
      minimapCtx.fillStyle = 'rgba(43, 50, 120, 0.3)';
      minimapCtx.fill();
    }

    // Draw marker dot
    minimapCtx.beginPath();
    minimapCtx.arc(x, y, 6, 0, 2 * Math.PI);

    if (isCurrentRoom) {
      minimapCtx.fillStyle = '#2B3278';
    } else {
      minimapCtx.fillStyle = marker.roomId ? '#4CAF50' : '#999';
    }

    minimapCtx.fill();
    minimapCtx.strokeStyle = '#fff';
    minimapCtx.lineWidth = 2;
    minimapCtx.stroke();
  });
}

// ─── Update highlight ─────────────────────────────────────────────────────────

export function updateMinimapHighlight() {
  const availableFloors = getAvailableFloorsForCurrentContext();
  if (availableFloors.length === 0) {
    if (minimapWrapper) minimapWrapper.style.display = 'none';
    return;
  }

  const curRoomId = env.getCurrentRoomId();
  const room = env.getRoomsData()[curRoomId];

  // Try to find if this room is placed on a marker in any of the available floors
  let targetFloor = null;
  if (curRoomId) {
    targetFloor = availableFloors.find(f => f.markers && f.markers.some(m => m.roomId === curRoomId));
  }

  // If not found by marker, try matching by floor number / name
  if (!targetFloor && room) {
    const roomFloorNum = room.floor || 1;
    targetFloor = availableFloors.find(f => f.id === roomFloorNum || f.name.includes(String(roomFloorNum)));
  }

  // Fallback to first available floor if current floor is not among available floors
  if (!targetFloor) {
    targetFloor = availableFloors.find(f => f.id === currentFloorId) || availableFloors[0];
  }

  if (targetFloor) {
    if (targetFloor.id !== currentFloorId || !userMinimapImage.src || userMinimapImage.src !== targetFloor.image) {
      switchFloor(targetFloor.id);
    } else {
      if (targetFloor.image) {
        minimapWrapper.style.display = 'block';
      }
      renderFloorTabs();
      drawUserMinimap();
    }
  } else {
    if (minimapWrapper) minimapWrapper.style.display = 'none';
  }
}

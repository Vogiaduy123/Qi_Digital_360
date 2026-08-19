// Intercept all fetch requests to add Authorization header from sessionStorage
(() => {
  const originalFetch = window.fetch;
  window.fetch = function (url, options = {}) {
    const token = sessionStorage.getItem('vt_token');
    console.log(`[Tour View Fetch] Requesting: ${url}, Token in sessionStorage: ${token ? token.slice(0, 15) + '...' : 'none'}`);
    if (token) {
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        if (!options.headers.has('Authorization')) {
          options.headers.set('Authorization', `Bearer ${token}`);
        }
      } else if (Array.isArray(options.headers)) {
        const hasAuth = options.headers.some(([k]) => k.toLowerCase() === 'authorization');
        if (!hasAuth) {
          options.headers.push(['Authorization', `Bearer ${token}`]);
        }
      } else {
        const keys = Object.keys(options.headers).map(k => k.toLowerCase());
        if (!keys.includes('authorization')) {
          options.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }
    return originalFetch(url, options);
  };
})();

const pano = document.getElementById("pano");
const roomSelect = document.getElementById("roomSelect");
const buildingSelect = document.getElementById("buildingSelect");
const buildingSelectWrapper = document.getElementById("buildingSelectWrapper");

let currentRoomId = null;
let allRooms = [];
let allBuildings = [];

window.customIcons = {};


import { degToRad, radToDeg, parseJsonResponse } from './core/utils.js';
import { fetchRooms, fetchBuildings } from './core/api.js';
import { initViewer, initZoomControl, getViewer } from './core/viewer.js';
import { initScenesFeature, initRooms, getScenes, getRoomsData, preloadConnectedRooms } from './core/scenes.js';
import { initMinimap, loadMinimap, updateMinimapHighlight, drawUserMinimap } from './features/minimap.js';
import { initSensors, loadSensors, updateSensorWidget, renderCameraPanel, addSensorHotspots, startSensorRealTimeUpdates, closeCameraModal } from './features/sensors.js';
import { initMailFeature, resolveMailPointToPanorama, createPanoramaMailHotspot, clearFixedMailHotspots, closeMailComposer } from './features/mail.js';
import { initAutoTour } from './features/autotour.js';
import { initCompass } from './features/compass.js';
import { initMediaOverlay, createMediaHotspotOverlay, hideMediaOverlay, showMediaOverlay, MEDIA_ICONS, createMediaHotspotElement, resetActiveNoteHotspot, create3DHighlightElement } from './features/media-overlay.js';

/* ===== HELPERS ===== */
/**
 * Creates a navigation arrow element for hotspots.
 * If the hotspot has a custom iconUrl, uses that image.
 * Otherwise falls back to the built-in SVG double-chevron.
 */
function createNavArrow(hs) {
  const wrap = document.createElement("div");
  wrap.className = "hotspot-arrow";

  const customIcon = window.customIcons && window.customIcons.nav_arrow;
  if (customIcon) {
    const img = document.createElement("img");
    img.src = customIcon;
    img.className = "hotspot-arrow-img";
    img.alt = "";
    img.draggable = false;
    img.onerror = () => {
      wrap.innerHTML = defaultChevronSVG();
    };
    wrap.appendChild(img);
  } else if (hs && hs.iconUrl) {
    // Custom uploaded arrow image
    const img = document.createElement("img");
    img.src = hs.iconUrl;
    img.className = "hotspot-arrow-img";
    img.alt = "";
    img.draggable = false;
    img.onerror = () => {
      wrap.innerHTML = defaultChevronSVG();
    };
    wrap.appendChild(img);
  } else {
    wrap.innerHTML = defaultChevronSVG();
  }
  return wrap;
}

function defaultChevronSVG() {
  return `<svg viewBox="0 0 44 36" width="44" height="36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polyline points="8,20 22,6 36,20" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="8,32 22,18 36,32" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}



/* ===== BUILDING SELECTOR ===== */
function initBuildingSelector(rooms, buildings) {
  if (!buildingSelect || !buildingSelectWrapper) return;

  // Only show if there are buildings with rooms assigned
  const buildingsWithRooms = buildings.filter(b => rooms.some(r => r.buildingId === b.id));
  const hasUnassigned = rooms.some(r => !r.buildingId);

  if (buildingsWithRooms.length === 0) {
    // No buildings configured — hide selector, show all rooms normally
    buildingSelectWrapper.style.display = 'none';
    return;
  }

  buildingSelectWrapper.style.display = 'block';
  buildingSelect.innerHTML = '';

  // Option: All rooms
  if (hasUnassigned || buildingsWithRooms.length > 1) {
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = '🌐 Tất cả phân khu';
    buildingSelect.appendChild(allOpt);
  }

  buildingsWithRooms.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = '🏢 ' + b.name;
    buildingSelect.appendChild(opt);
  });

  // Determine initial building selection: if rooms[0] has buildingId, select it; otherwise first building
  const initialBldgId = (rooms[0] && rooms[0].buildingId) ? rooms[0].buildingId : (buildingsWithRooms[0] ? buildingsWithRooms[0].id : '');
  buildingSelect.value = initialBldgId;
  filterRoomsByBuilding(initialBldgId, true);

  buildingSelect.onchange = () => {
    filterRoomsByBuilding(buildingSelect.value, false);
  };
}

function filterRoomsByBuilding(buildingId, isInitial = false) {
  if (!roomSelect) return;

  const filtered = buildingId
    ? allRooms.filter(r => r.buildingId === buildingId)
    : allRooms;

  // Rebuild room dropdown
  roomSelect.innerHTML = '';
  filtered.forEach(room => {
    const opt = document.createElement('option');
    opt.value = room.id;
    opt.textContent = room.name;
    roomSelect.appendChild(opt);
  });

  roomSelect.onchange = (e) => {
    switchRoom(parseInt(e.target.value));
  };

  if (!isInitial && filtered.length > 0) {
    const isCurrentInFiltered = filtered.some(r => r.id === currentRoomId);
    if (!isCurrentInFiltered) {
      switchRoom(filtered[0].id);
    } else {
      roomSelect.value = currentRoomId;
    }
  } else if (currentRoomId && filtered.some(r => r.id === currentRoomId)) {
    roomSelect.value = currentRoomId;
  }
}

async function initApp() {
  try {
    // 1. Kiểm tra trạng thái Setup của hệ thống (đã đăng ký admin nào chưa)
    try {
      const statusRes = await fetch('/api/auth/setup-status').then(r => r.json());
      const isSetup = statusRes && statusRes.success && statusRes.isSetup;
      if (!isSetup) {
        window.location.href = '/admin/setup.html';
        return;
      }
    } catch (e) {
      console.warn('Cannot check setup status:', e);
    }

    // 2. Kiểm tra quyền hạn và phiên đăng nhập hiện tại
    try {
      const meRes = await fetch('/api/auth/me').then(r => r.json());
      if (meRes && meRes.success) {
        window.currentUser = meRes.user;
        const isManager = meRes.user.role === 'admin' || meRes.user.role === 'collaborator';
        
        // Hiện nút Dashboard nếu là quản trị/collab, ẩn đi nếu là user thường
        const dashBtn = document.querySelector('.dashboard-btn');
        if (dashBtn) dashBtn.style.display = isManager ? 'flex' : 'none';

        // Hiện/ẩn công cụ kéo thả điểm mail dựa vào quyền
        const mailDragBtn = document.getElementById('mailDragIcon');
        if (mailDragBtn) {
          mailDragBtn.style.display = isManager ? 'block' : 'none';
        }

        const profileBtn = document.getElementById('userProfileTourBtn');
        const logoutBtn = document.getElementById('tourLogoutBtn');
        if (profileBtn) profileBtn.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'flex';
      } else {
        // Chưa đăng nhập thì chuyển về trang login
        window.location.href = '/admin/login.html';
        return;
      }
    } catch (err) {
      // Lỗi kết nối hoặc lỗi bất kỳ đưa về login
      window.location.href = '/admin/login.html';
      return;
    }

    // Đăng ký sự kiện Đăng xuất trên giao diện xem Tour
    const tourLogoutBtn = document.getElementById('tourLogoutBtn');
    if (tourLogoutBtn) {
      tourLogoutBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/auth/logout', { method: 'POST' }).then(r => r.json());
          if (res.success) {
            sessionStorage.removeItem('vt_token');
            alert('Đăng xuất thành công!');
            window.location.href = '/admin/login.html';
          }
        } catch {
          alert('Lỗi kết nối khi đăng xuất');
        }
      });
    }

    // Tạo Modal chỉnh sửa thông tin cá nhân trên trang xem Tour nếu chưa có
    if (!document.getElementById('userProfileModal')) {
      const modalDiv = document.createElement('div');
      modalDiv.innerHTML = `
        <div class="modal fade" id="userProfileModal" tabindex="-1" aria-hidden="true" style="z-index: 2070;">
          <style>
            #userProfileModal .modal-content {
              background: #ffffff !important;
              border: 1px solid rgba(0, 0, 0, 0.08) !important;
              border-radius: 16px !important;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
              color: #0f172a !important;
              overflow: hidden;
            }
            #userProfileModal .modal-header {
              border-bottom: 1px solid rgba(0, 0, 0, 0.06) !important;
              padding: 20px 24px !important;
            }
            #userProfileModal .modal-title {
              font-size: 1.15rem;
              font-weight: 600;
              letter-spacing: -0.025em;
              color: #0f172a !important;
            }
            #userProfileModal .modal-body {
              padding: 24px !important;
            }
            #userProfileModal .modal-footer {
              border-top: 1px solid rgba(0, 0, 0, 0.06) !important;
              padding: 16px 24px !important;
            }
            #userProfileModal .form-label {
              font-size: 0.875rem;
              font-weight: 500;
              color: #334155 !important;
              margin-bottom: 6px;
            }
            #userProfileModal .form-label-muted {
              color: #64748b !important;
            }
            #userProfileModal .form-control {
              background: #ffffff !important;
              border: 1px solid #cbd5e1 !important;
              color: #0f172a !important;
              border-radius: 8px !important;
              padding: 10px 14px !important;
              transition: all 0.2s ease;
            }
            #userProfileModal .form-control:focus {
              background: #ffffff !important;
              border-color: #3b82f6 !important;
              box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15) !important;
            }
            #userProfileModal .form-control:disabled {
              background: #f1f5f9 !important;
              border-color: #e2e8f0 !important;
              color: #64748b !important;
              cursor: not-allowed;
              opacity: 1;
            }
            #userProfileModal .btn-close {
              filter: none !important;
            }
            #userProfileModal .btn-secondary {
              background: #f1f5f9 !important;
              border: 1px solid #cbd5e1 !important;
              color: #334155 !important;
              border-radius: 8px !important;
              padding: 10px 20px !important;
              font-weight: 500;
              transition: all 0.2s;
            }
            #userProfileModal .btn-secondary:hover {
              background: #e2e8f0 !important;
              color: #0f172a !important;
            }
            #userProfileModal .btn-primary {
              background: #3b82f6 !important;
              border: none !important;
              color: #fff !important;
              border-radius: 8px !important;
              padding: 10px 24px !important;
              font-weight: 500;
              box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.1), 0 2px 4px -1px rgba(59, 130, 246, 0.05) !important;
              transition: all 0.2s;
            }
            #userProfileModal .btn-primary:hover {
              background: #2563eb !important;
              box-shadow: 0 4px 12px -1px rgba(37, 99, 235, 0.2), 0 2px 6px -1px rgba(37, 99, 235, 0.1) !important;
            }
          </style>
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">👤 Chỉnh sửa thông tin cá nhân</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <form id="userProfileForm">
                <div class="modal-body">
                  <div class="mb-3">
                    <label for="profileUsername" class="form-label form-label-muted">Tên đăng nhập</label>
                    <input type="text" class="form-control" id="profileUsername" disabled>
                  </div>
                  <div class="mb-3">
                    <label for="profileDisplayName" class="form-label">Tên hiển thị</label>
                    <input type="text" class="form-control" id="profileDisplayName" required>
                  </div>
                  <div class="mb-3">
                    <label for="profilePassword" class="form-label">Mật khẩu mới (để trống nếu không đổi)</label>
                    <input type="password" class="form-control" id="profilePassword" minlength="6" placeholder="Tối thiểu 6 ký tự">
                  </div>
                  <div class="mb-3">
                    <label for="profileConfirmPassword" class="form-label">Xác nhận mật khẩu mới</label>
                    <input type="password" class="form-control" id="profileConfirmPassword" minlength="6" placeholder="Tối thiểu 6 ký tự">
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Hủy</button>
                  <button type="submit" class="btn btn-primary">Lưu thay đổi</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalDiv.firstElementChild);

      // Xử lý submit lưu thông tin
      const profileForm = document.getElementById('userProfileForm');
      if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const displayName = document.getElementById('profileDisplayName').value.trim();
          const password = document.getElementById('profilePassword').value;
          const confirmPassword = document.getElementById('profileConfirmPassword').value;

          if (password && password !== confirmPassword) {
            alert('Mật khẩu xác nhận không trùng khớp!');
            return;
          }

          try {
            const res = await fetch('/api/auth/me/profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ displayName, password })
            });
            const data = await res.json();
            if (data.success) {
              alert('Cập nhật thông tin thành công!');
              window.currentUser.displayName = data.user.displayName;
              
              let modalEl = document.getElementById('userProfileModal');
              let profileModal = bootstrap.Modal.getInstance(modalEl);
              if (profileModal) {
                profileModal.hide();
              }
            } else {
              alert('Lỗi: ' + data.error);
            }
          } catch (err) {
            console.error(err);
            alert('Có lỗi xảy ra khi cập nhật thông tin.');
          }
        });
      }
    }

    // Đăng ký sự kiện mở modal khi click vào nút 👤
    const userProfileTourBtn = document.getElementById('userProfileTourBtn');
    if (userProfileTourBtn) {
      userProfileTourBtn.addEventListener('click', () => {
        document.getElementById('profileUsername').value = window.currentUser.username;
        document.getElementById('profileDisplayName').value = window.currentUser.displayName || window.currentUser.username;
        document.getElementById('profilePassword').value = '';
        document.getElementById('profileConfirmPassword').value = '';

        let modalEl = document.getElementById('userProfileModal');
        let profileModal = bootstrap.Modal.getInstance(modalEl);
        if (!profileModal) {
          profileModal = new bootstrap.Modal(modalEl);
        }
        profileModal.show();
      });
    }

    initViewer(pano, {
      getCurrentRoomId: () => currentRoomId,
      getScene: (id) => getScenes()[id]
    });

    initScenesFeature({
      getViewer: getViewer,
      switchRoom: switchRoom
    });

    initMinimap({
      getRoomsData: () => getRoomsData(),
      getCurrentRoomId: () => currentRoomId,
      switchRoom: switchRoom,
      getViewer: getViewer
    });

    initSensors({
      getCurrentRoomId: () => currentRoomId,
      getRoomsData: () => getRoomsData(),
      getScene: (id) => getScenes()[id],
      switchRoom: switchRoom
    });

    // Fetch custom icons config first so hotspots have access to icons immediately
    try {
      const res = await fetch("/api/custom-icons").then(r => r.json());
      if (res && res.success) {
        window.customIcons = res.config || {};
      }
    } catch (err) {
      console.warn("⚠️ Cannot load custom icons config:", err);
    }

    const rooms = await fetchRooms();
    if (!rooms || rooms.length === 0) {
      alert("Chưa có phòng nào");
      return;
    }
    allRooms = rooms;

    // Load buildings from public API
    await loadBuildingsData();

    initBuildingSelector(allRooms, allBuildings);
    initRooms(rooms, roomSelect);
    if (allRooms.length > 0) {
      switchRoom(allRooms[0].id);
    }

    await loadMinimap();
    initSensors({
      getCurrentRoomId: () => currentRoomId,
      getRoomsData: () => getRoomsData(),
      getScene: (id) => getScenes()[id],
      switchRoom: (id) => switchRoom(id)
    });
    await loadSensors();

    initZoomControl();
    initCompass({
      getCurrentRoomId: () => currentRoomId,
      getScenes: getScenes,
      getPano: () => pano
    });
    initAutoTour({
      getCurrentRoomId: () => currentRoomId,
      getRoomsData: getRoomsData,
      getScenes: getScenes,
      switchRoom: switchRoom
    });
    initMediaOverlay();
    initMailFeature({
      getCurrentRoomId: () => currentRoomId,
      getRoomsData: () => getRoomsData(),
      getScene: (id) => getScenes()[id],
      getPano: () => pano,
      addHotspots: addHotspots
    });
  } catch (err) {
    console.error("LOAD ERROR:", err);
  }
}

async function loadBuildingsData() {
  try {
    const bRes = await fetchBuildings();
    allBuildings = (bRes && bRes.success) ? bRes.buildings : [];
  } catch {
    try {
      const bRes = await fetch('/api/buildings').then(r => r.json());
      allBuildings = (bRes && bRes.success) ? bRes.buildings : [];
    } catch {
      allBuildings = [];
    }
  }
}

initApp();

/* ===== SUBSCRIBE TO SSE ===== */
try {
  const es = new EventSource("/events");
  es.addEventListener("notifications", (e) => {
    try {
      const data = JSON.parse(e.data || "[]");
      window.lastReceivedNotifications = data;
      if (typeof window.handleTourNotificationEvent === "function") {
        window.handleTourNotificationEvent(e);
      }
    } catch (err) {
      console.warn("⚠️ Error parsing notifications SSE event:", err);
    }
  });

  es.addEventListener("rooms", async (e) => {
    const rooms = JSON.parse(e.data || "[]");
    if (!rooms || rooms.length === 0) return;
    allRooms = rooms;

    await loadBuildingsData();
    initBuildingSelector(allRooms, allBuildings);
    initRooms(rooms, roomSelect);
    // Keep current room if still exists; otherwise switch to first
    const exists = rooms.find(r => r.id === currentRoomId);
    if (exists) {
      addHotspots(currentRoomId);
    } else {
      switchRoom(rooms[0].id);
    }
  });

  es.addEventListener("sensors", (e) => {
    const sensors = JSON.parse(e.data || "[]");
    if (!sensors || sensors.length === 0) return;

    // Update sensor hotspots in current room
    if (currentRoomId) {
      addSensorHotspots(currentRoomId);
    }
    // Update widget and camera panel
    updateSensorWidget();
    renderCameraPanel();
  });

  es.addEventListener("custom_icons", (e) => {
    try {
      const config = JSON.parse(e.data || "{}");
      window.customIcons = config || {};
      if (typeof updateSettingsPreviews === "function") {
        updateSettingsPreviews();
      }
      if (currentRoomId) {
        addHotspots(currentRoomId);
      }
    } catch (err) {
      console.warn("⚠️ Error parsing custom_icons SSE event:", err);
    }
  });

  // Handle clicks on polygon overlay
  const polygonOverlay = document.getElementById('polygonOverlay');
  if (polygonOverlay) {
    polygonOverlay.addEventListener('click', (e) => {
      const poly = e.target.closest('polygon[data-media-index]');
      if (!poly) return;
      const index = parseInt(poly.dataset.mediaIndex);
      if (isNaN(index)) return;
      const media = (window.currentRoomMediaHotspots || [])[index];
      if (media) {
        showMediaOverlay(media);
      }
    });
  }
} catch (e) {
  console.warn("SSE not supported:", e);
}

/* ===== SWITCH ROOM ===== */
function switchRoom(roomId, initialYaw, initialPitch) {
  currentRoomId = roomId;
  const scene = getScenes()[roomId];

  if (!scene) return;

  // Sync building selector if room belongs to another building
  const curRoom = allRooms.find(r => r.id === roomId);
  if (curRoom && buildingSelect && buildingSelectWrapper && buildingSelectWrapper.style.display !== 'none') {
    const activeBldg = buildingSelect.value;
    if (activeBldg && curRoom.buildingId && activeBldg !== curRoom.buildingId) {
      buildingSelect.value = curRoom.buildingId;
      filterRoomsByBuilding(curRoom.buildingId, true);
    }
  }

  if (roomSelect) {
    roomSelect.value = roomId;
  }

  // Bind polygon update when view changes for this scene
  const view = scene.view();
  if (view) {
    view.removeEventListener('change', update3DPolygons);
    view.addEventListener('change', update3DPolygons);
    // Bind minimap radar cone updates
    view.removeEventListener('change', drawUserMinimap);
    view.addEventListener('change', drawUserMinimap);
  }

  scene.switchTo();

  // Apply initial view direction if provided (from hotspot setting)
  if (view && initialYaw !== undefined && initialYaw !== null) {
    const yawRad = degToRad(Number(initialYaw));
    const pitchRad = degToRad(-(Number(initialPitch || 0)));
    view.setYaw(yawRad);
    view.setPitch(pitchRad);
  }

  addHotspots(roomId);
  addSensorHotspots(roomId);
  preloadConnectedRooms(roomId);
  updateMinimapHighlight();
  hideMediaOverlay();
  closeCameraModal();
  closeMailComposer();

  updateSensorWidget();
  renderCameraPanel();
}

/* ===== HOTSPOTS ===== */
function addHotspots(roomId) {
  const room = getRoomsData()[roomId];
  const scene = getScenes()[roomId];

  if (!room || !scene) return;

  const container = scene.hotspotContainer();
  resetActiveNoteHotspot();
  clearFixedMailHotspots();
  // Remove existing hotspots (preserve IoT sensor hotspots)
  try {
    const existing = container.listHotspots();
    existing.forEach(h => {
      const el = typeof h.domElement === 'function' ? h.domElement() : h.element;
      if (!el || !el.classList || !el.classList.contains("sensor-hotspot")) {
        container.destroyHotspot(h);
      }
    });
  } catch { }

  const hotspots = room.hotspots || [];
  const mediaHotspots = room.mediaHotspots || [];
  const mailHotspots = room.mailHotspots || [];

  hotspots.forEach(hs => {
    const el = document.createElement("div");
    el.className = "hotspot";

    const yawRad = degToRad(hs.yaw);
    const pitchRad = degToRad(-hs.pitch);

    // Use custom arrow if iconUrl is set, otherwise use built-in SVG chevron
    el.appendChild(createNavArrow(hs));

    el.onclick = (e) => {
      e.stopPropagation();
      switchRoom(hs.target, hs.initialYaw, hs.initialPitch);
    };

    container.createHotspot(el, {
      yaw: yawRad,
      pitch: pitchRad
    }, {
      perspective: {
        radius: 1000,
        extraTransforms: `rotateX(60deg) rotateZ(${hs.rotation || 0}deg) scale(2.5)`
      }
    });
  });

  mediaHotspots.forEach((media, index) => {
    // If it has a highlight polygon, we ONLY render the SVG polygon later, no icon.
    // However, we inject the index so the SVG click handler can find the media object.
    const hasPolygon = media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3;
    if (hasPolygon) {
      media._originalIndex = index; // Save index for update3DPolygons
      return; 
    }

    const el = createMediaHotspotElement(media, () => {
      createMediaHotspotOverlay(media, container, degToRad(media.yaw), degToRad(-media.pitch));
    });

    container.createHotspot(el, {
      yaw: degToRad(media.yaw),
      pitch: degToRad(-media.pitch)
    });
  });

  mailHotspots.forEach((mailPoint, index) => {
    const panoramaPoint = resolveMailPointToPanorama(mailPoint, scene);

    if (panoramaPoint) {
      createPanoramaMailHotspot(container, index, {
        ...mailPoint,
        yaw: panoramaPoint.yaw,
        pitch: panoramaPoint.pitch
      });
    }
  });

  // Render 3D highlight polygons dynamically
  window.currentRoomMediaHotspots = mediaHotspots;
  window.currentHotspotContainer = container;
  update3DPolygons();

  addSensorHotspots(roomId);
}

/* ===== 3D HIGHLIGHT POLYGONS ===== */
function update3DPolygons() {
  const viewer = getViewer();
  if (!viewer) return;
  const scene = viewer.scene();
  if (!scene) return;
  const view = scene.view();
  const svg = document.getElementById('polygonOverlay');
  if (!svg) return;
  
  if (!window.currentRoomMediaHotspots) {
    svg.innerHTML = '';
    return;
  }

  let pathsHTML = `
    <defs>
      <filter id="glow-3d-filter-real" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
  `;

  let hasPolygon = false;
  window.currentRoomMediaHotspots.forEach(media => {
    if (media.mediaType !== '3d' || !media.highlightPolygon || media.highlightPolygon.length < 3) return;
    
    // Project points
    const points = media.highlightPolygon.map(([y, p]) => {
      const coords = view.coordinatesToScreen({yaw: degToRad(y), pitch: degToRad(-p)});
      if (!coords || typeof coords.x !== 'number') return null;
      return `${coords.x},${coords.y}`;
    });
    
    if (points.includes(null)) return;
    
    const d = points.join(' ');
    
    pathsHTML += `
      <!-- Outer glow/click target -->
      <polygon points="${d}" fill="rgba(80, 80, 200, 0.4)" stroke="rgba(255, 255, 255, 0.9)" stroke-width="2" stroke-linejoin="round"
        style="pointer-events: visiblePainted; cursor: pointer;"
        data-media-index="${media._originalIndex}" />
      <polygon points="${d}" fill="none" class="highlight-3d-polygon" stroke="rgba(100, 150, 255, 0.6)" stroke-width="8" stroke-linejoin="round" filter="url(#glow-3d-filter-real)" style="mix-blend-mode: screen; pointer-events: none;" />
    `;
    hasPolygon = true;
  });
  
  svg.innerHTML = hasPolygon ? pathsHTML : '';
}




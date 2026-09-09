import { degToRad } from '../core/utils.js';

let env = {
  getCurrentRoomId: () => null,
  getRoomsData: () => ({}),
  getScenes: () => ({}),
  switchRoom: (roomId, yaw, pitch) => {},
  getSensorsData: () => [],
  showCameraPreview: (sensor) => {},
  showSensorGrafana: (sensor) => {}
};

let activeFilter = 'all'; // 'all' | 'sensor' | 'camera'
let activeSensorId = null;
let cameraAnimFrameId = null;

/**
 * Initialize IoT Quick List Feature (Dependency Injection pattern)
 */
export function initIotQuickList(dependencies) {
  env = { ...env, ...dependencies };

  const panel = document.getElementById('iotQuickListPanel');
  const toggleBtn = document.getElementById('iotListToggleBtn');
  const closeBtn = document.getElementById('iotQuickListClose');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleIotQuickList();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeIotQuickList();
    });
  }

  // Filter tabs
  const filterTabs = document.querySelectorAll('.iot-filter-chip');
  filterTabs.forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      filterTabs.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.getAttribute('data-filter') || 'all';
      renderIotQuickList();
    });
  });

  // Panel is pinned: only closes when clicking the close 'x' button or the toggle button
  // (click-outside listener removed as requested)

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && panel.classList.contains('is-open')) {
      closeIotQuickList();
    }
  });

  // Listen to sensors update
  window.addEventListener('sensors:updated', () => {
    if (panel && panel.classList.contains('is-open')) {
      renderIotQuickList();
    }
    updateBadgeCount();
  });

  updateBadgeCount();
}

/**
 * Toggle open/close state of IoT quick list panel
 */
export function toggleIotQuickList() {
  const panel = document.getElementById('iotQuickListPanel');
  const toggleBtn = document.getElementById('iotListToggleBtn');
  if (!panel) return;

  const isOpen = panel.classList.toggle('is-open');
  if (toggleBtn) {
    toggleBtn.classList.toggle('is-active', isOpen);
  }

  if (isOpen) {
    renderIotQuickList();
  }
}

export function openIotQuickList() {
  const panel = document.getElementById('iotQuickListPanel');
  const toggleBtn = document.getElementById('iotListToggleBtn');
  if (panel && !panel.classList.contains('is-open')) {
    panel.classList.add('is-open');
    if (toggleBtn) toggleBtn.classList.add('is-active');
    renderIotQuickList();
  }
}

export function closeIotQuickList() {
  const panel = document.getElementById('iotQuickListPanel');
  const toggleBtn = document.getElementById('iotListToggleBtn');
  if (panel && panel.classList.contains('is-open')) {
    panel.classList.remove('is-open');
    if (toggleBtn) toggleBtn.classList.remove('is-active');
  }
}

/**
 * Update total IoT device count badge in header
 */
function updateBadgeCount() {
  const badge = document.getElementById('iotQuickListCount');
  if (!badge) return;

  const sensors = env.getSensorsData() || [];
  badge.textContent = `${sensors.length} thiết bị`;
}

/**
 * Render the streamlined list of IoT devices
 */
export function renderIotQuickList() {
  const listContainer = document.getElementById('iotQuickListItems');
  if (!listContainer) return;

  const allSensors = env.getSensorsData() || [];
  const roomsData = env.getRoomsData ? env.getRoomsData() : {};
  const currentRoomId = env.getCurrentRoomId();

  // Filter sensors according to selected filter
  let filtered = allSensors;
  if (activeFilter === 'camera') {
    filtered = allSensors.filter(s => s.type === 'camera');
  } else if (activeFilter === 'sensor') {
    filtered = allSensors.filter(s => s.type !== 'camera');
  }

  updateBadgeCount();

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="iot-list-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>Chưa có thiết bị IoT nào</span>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = '';

  filtered.forEach(sensor => {
    const isCamera = sensor.type === 'camera';
    const isWebcam = sensor.camera?.streamUrl === 'webcam://0';
    const isCurrentRoom = String(sensor.roomId) === String(currentRoomId);
    const roomName = (sensor.roomId && roomsData[sensor.roomId]?.name) || 'Chưa gán phòng';

    // Status evaluation
    let statusClass = 'online';
    let statusLabel = 'Hoạt động';
    if (isCamera) {
      const camStatus = sensor.camera?.status || 'online';
      if (camStatus === 'offline') {
        statusClass = 'offline';
        statusLabel = 'Ngoại tuyến';
      } else if (camStatus === 'maintenance') {
        statusClass = 'maintenance';
        statusLabel = 'Bảo trì';
      }
    } else {
      const pm25Val = Number(sensor.sensors?.pm25?.value ?? 0);
      if (pm25Val > 150.4) {
        statusClass = 'offline';
        statusLabel = 'Cảnh báo';
      } else if (pm25Val > 55.4) {
        statusClass = 'maintenance';
        statusLabel = 'Chú ý';
      }
    }

    // Telemetry display snippet
    let metricSnippet = '';
    if (isCamera) {
      metricSnippet = sensor.camera?.resolution || (isWebcam ? 'Webcam' : '1080p');
    } else {
      const sData = sensor.sensors || sensor.data || {};
      const temp = sData.temperature?.value ?? sData.temp?.value ?? sData.temperature ?? sData.temp;
      const hum = sData.humidity?.value ?? sData.hum?.value ?? sData.humidity ?? sData.hum;
      const parts = [];
      if (temp !== undefined && temp !== null && temp !== '') parts.push(`${temp}°C`);
      if (hum !== undefined && hum !== null && hum !== '') parts.push(`${hum}%`);
      metricSnippet = parts.length > 0 ? parts.join(' · ') : 'Telemetry';
    }

    // Item card
    const item = document.createElement('div');
    item.className = `iot-item-card ${isCurrentRoom ? 'is-current-room' : ''} ${activeSensorId === sensor.id ? 'is-selected' : ''}`;
    item.setAttribute('data-id', sensor.id);
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Đi tới thiết bị ${sensor.name || (isCamera ? 'Camera' : 'Cảm biến')}`);

    // Icon representation
    const iconType = isCamera ? (isWebcam ? '💻' : '📹') : '🌡️';

    item.innerHTML = `
      <div class="iot-item-icon-wrap">
        <span class="iot-item-type-icon">${iconType}</span>
        <span class="iot-item-status-dot ${statusClass}" title="${statusLabel}"></span>
      </div>
      <div class="iot-item-info">
        <div class="iot-item-header">
          <span class="iot-item-name" title="${sensor.name || ''}">${sensor.name || (isCamera ? 'Camera' : 'Cảm biến')}</span>
          <span class="iot-item-metric">${metricSnippet}</span>
        </div>
        <div class="iot-item-footer">
          <span class="iot-item-room-badge ${isCurrentRoom ? 'active' : ''}">
            📍 ${roomName}
          </span>
          <span class="iot-item-action-hint">Nhìn vào ↗</span>
        </div>
      </div>
    `;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      focusSensor(sensor);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        focusSensor(sensor);
      }
    });

    listContainer.appendChild(item);
  });
}

/**
 * Focus and look at the specified sensor device:
 * 1. Switches room if not currently in sensor's room.
 * 2. Smoothly interpolates camera orientation (yaw & pitch) via shortest angular distance.
 * 3. Highlights the sensor hotspot in 360° space with a glowing beacon effect.
 */
export function focusSensor(sensor) {
  if (!sensor) return;

  activeSensorId = sensor.id;
  updateActiveCardHighlight();

  const currentRoomId = env.getCurrentRoomId();
  const targetRoomId = sensor.roomId ? Number(sensor.roomId) : null;
  const targetYaw = Number(sensor.position?.yaw || 0);
  const targetPitch = Number(sensor.position?.pitch || 0);

  if (targetRoomId && String(targetRoomId) !== String(currentRoomId)) {
    // Switch to target room, orienting view towards sensor immediately
    env.switchRoom(targetRoomId, targetYaw, targetPitch);
    // Allow Marzipano to render the new scene, then trigger beacon pulse
    setTimeout(() => {
      highlightSensorHotspot(sensor);
      renderIotQuickList(); // Re-render to update current room badges
    }, 400);
  } else {
    // In same room: smoothly pan camera to look at the sensor
    panCameraToSensor(targetYaw, targetPitch, () => {
      highlightSensorHotspot(sensor);
    });
  }
}

/**
 * Update UI highlight on the selected sensor card
 */
function updateActiveCardHighlight() {
  document.querySelectorAll('.iot-item-card').forEach(card => {
    if (card.getAttribute('data-id') === String(activeSensorId)) {
      card.classList.add('is-selected');
    } else {
      card.classList.remove('is-selected');
    }
  });
}

/**
 * Smoothly pan Marzipano camera view to target coordinates (yaw & pitch)
 * using shortest spherical angular distance.
 */
function panCameraToSensor(targetYawDeg, targetPitchDeg, onComplete) {
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes ? env.getScenes() : {};
  const scene = scenes[currentRoomId];
  if (!scene || !scene.view()) {
    if (onComplete) onComplete();
    return;
  }

  if (cameraAnimFrameId) {
    cancelAnimationFrame(cameraAnimFrameId);
    cameraAnimFrameId = null;
  }

  const view = scene.view();
  const startYaw = view.yaw();
  const startPitch = view.pitch();

  const targetYawRad = degToRad(Number(targetYawDeg || 0));
  // Invert pitch sign per AGENTS.md § 7.1 rule
  const targetPitchRad = degToRad(-Number(targetPitchDeg || 0));

  // Calculate shortest path around circle (-PI to +PI)
  const diffYaw = Math.atan2(Math.sin(targetYawRad - startYaw), Math.cos(targetYawRad - startYaw));
  const diffPitch = targetPitchRad - startPitch;

  const angularDist = Math.hypot(diffYaw, diffPitch);
  if (angularDist < 0.01) {
    if (onComplete) onComplete();
    return;
  }

  // Adaptive duration: quick for small adjustments, smooth for larger pans
  const duration = Math.min(750, Math.max(280, angularDist * 320));
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Smooth cubic ease-out
    const eased = 1 - Math.pow(1 - progress, 3);

    view.setYaw(startYaw + diffYaw * eased);
    view.setPitch(startPitch + diffPitch * eased);

    if (progress < 1) {
      cameraAnimFrameId = requestAnimationFrame(animate);
    } else {
      cameraAnimFrameId = null;
      if (onComplete) onComplete();
    }
  }

  cameraAnimFrameId = requestAnimationFrame(animate);
}

/**
 * Highlight the sensor hotspot in 360° space with a pulsing cyan radar beacon
 */
function highlightSensorHotspot(sensor) {
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes ? env.getScenes() : {};
  const scene = scenes[currentRoomId];
  if (!scene) return;

  const container = scene.hotspotContainer();
  if (!container) return;

  try {
    const hotspots = container.listHotspots();
    const sensorName = sensor.name || (sensor.type === 'camera' ? 'Camera' : 'Cảm biến');

    hotspots.forEach(h => {
      const el = typeof h.domElement === 'function' ? h.domElement() : h.element;
      if (el && el.classList && el.classList.contains('sensor-hotspot')) {
        const label = el.getAttribute('aria-label');
        if (label === sensorName) {
          el.classList.remove('iot-target-beacon');
          void el.offsetWidth; // Force reflow
          el.classList.add('iot-target-beacon');

          // Elevate tooltip momentarily
          const tooltip = el.querySelector('.sensor-hotspot-tooltip');
          if (tooltip) {
            tooltip.classList.add('force-visible');
            setTimeout(() => {
              tooltip.classList.remove('force-visible');
              el.classList.remove('iot-target-beacon');
            }, 4500);
          }
        }
      }
    });
  } catch (err) {
    console.warn('Cannot highlight sensor hotspot:', err);
  }
}

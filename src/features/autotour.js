import { degToRad } from '../core/utils.js';
import { showMediaOverlay, hideMediaOverlay, closeStallModal, close3DModal } from './media-overlay.js';
import { showCameraPreview, closeCameraModal, showSensorGrafana } from './sensors.js';

let env = {
  getCurrentRoomId: () => null,
  getRoomsData: () => ({}),
  getScenes: () => ({}), // Needs scenes object mapping id -> scene
  switchRoom: (id) => {}
};

// Auto Tour State
let autoTourState = {
  isPlaying: false,
  isPaused: false,
  currentStopIndex: 0,
  tourStops: [],
  animationFrameId: null,
  timeoutId: null,
  progressIntervalId: null,
  pausedAt: 0,
  remainingTime: 0,
  currentScenario: null
};

const AUTO_TOUR_CONFIG = {
  panDuration: 8000,        // Camera pan duration (ms)
  stopDuration: 5000,       // Time to stay at each stop (ms)
  rotationSpeed: 0.3,       // Camera rotation speed
  highlightDuration: 1000,  // Hotspot highlight duration (ms)
  transitionDelay: 500      // Delay before transition (ms)
};

function getTourPanDuration() {
  const configuredDuration = Number(autoTourState.currentScenario?.cameraPanDuration);
  if (Number.isFinite(configuredDuration) && configuredDuration >= 1000) {
    return configuredDuration;
  }
  return AUTO_TOUR_CONFIG.panDuration;
}

export function initAutoTour(dependencies) {
  env = { ...env, ...dependencies };

  const startBtn = document.getElementById('autoTourStartBtn');
  const playPauseBtn = document.getElementById('tourPlayPauseBtn');
  const prevBtn = document.getElementById('tourPrevBtn');
  const nextBtn = document.getElementById('tourNextBtn');
  const restartBtn = document.getElementById('tourRestartBtn');
  const stopBtn = document.getElementById('tourStopBtn');

  if (startBtn) startBtn.addEventListener('click', startAutoTour);
  if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
  if (prevBtn) prevBtn.addEventListener('click', goToPreviousStop);
  if (nextBtn) nextBtn.addEventListener('click', goToNextStop);
  if (restartBtn) restartBtn.addEventListener('click', restartAutoTour);
  if (stopBtn) stopBtn.addEventListener('click', stopAutoTour);
  
  // Load tour scenario from server if available
  loadTourScenario();
}

function closeAllTourModals() {
  try { hideMediaOverlay(); } catch (e) {}
  try { closeStallModal(); } catch (e) {}
  try { close3DModal(); } catch (e) {}
  try { closeCameraModal(); } catch (e) {}
}

function togglePlayPause() {
  if (autoTourState.isPaused) {
    resumeAutoTour();
  } else {
    pauseAutoTour();
  }
}

function pauseAutoTour() {
  if (!autoTourState.isPlaying || autoTourState.isPaused) return;
  
  autoTourState.isPaused = true;
  autoTourState.pausedAt = Date.now();
  
  // Clear all timers but keep state
  if (autoTourState.timeoutId) {
    clearTimeout(autoTourState.timeoutId);
    autoTourState.timeoutId = null;
  }
  if (autoTourState.animationFrameId) {
    cancelAnimationFrame(autoTourState.animationFrameId);
    autoTourState.animationFrameId = null;
  }
  if (autoTourState.progressIntervalId) {
    clearInterval(autoTourState.progressIntervalId);
    autoTourState.progressIntervalId = null;
  }
  
  updateTourUI();
}

function resumeAutoTour() {
  if (!autoTourState.isPlaying || !autoTourState.isPaused) return;
  
  autoTourState.isPaused = false;
  updateTourUI();
  
  // Continue from current stop
  executeCurrentStop();
}

function goToPreviousStop() {
  if (!autoTourState.isPlaying) return;
  
  // Clear current timers
  clearAllTourTimers();
  removeAllTourHighlights();
  removeTourInfo();
  
  // Go to previous stop
  autoTourState.currentStopIndex = Math.max(0, autoTourState.currentStopIndex - 1);
  autoTourState.isPaused = false;
  
  updateTourUI();
  executeCurrentStop();
}

function goToNextStop() {
  if (!autoTourState.isPlaying) return;
  
  // Clear current timers
  clearAllTourTimers();
  removeAllTourHighlights();
  removeTourInfo();
  
  // Go to next stop
  autoTourState.currentStopIndex++;
  autoTourState.isPaused = false;
  
  if (autoTourState.currentStopIndex >= autoTourState.tourStops.length) {
    completeTour();
  } else {
    updateTourUI();
    executeCurrentStop();
  }
}

function restartAutoTour() {
  if (!autoTourState.isPlaying) return;
  
  // Clear everything
  clearAllTourTimers();
  removeAllTourHighlights();
  removeTourInfo();
  
  // Reset to beginning
  autoTourState.currentStopIndex = 0;
  autoTourState.isPaused = false;
  
  updateTourUI();
  executeCurrentStop();
}

function clearAllTourTimers() {
  if (autoTourState.animationFrameId) {
    cancelAnimationFrame(autoTourState.animationFrameId);
    autoTourState.animationFrameId = null;
  }
  if (autoTourState.timeoutId) {
    clearTimeout(autoTourState.timeoutId);
    autoTourState.timeoutId = null;
  }
  if (autoTourState.progressIntervalId) {
    clearInterval(autoTourState.progressIntervalId);
    autoTourState.progressIntervalId = null;
  }
}

async function loadTourScenario() {
  try {
    const res = await fetch('/api/tour-scenario');
    const data = await res.json();
    if (data.success && data.scenario) {
      autoTourState.currentScenario = data.scenario;
    }
  } catch (err) {
    console.log('No custom tour scenario found, will use default route');
  }
}

function startAutoTour() {
  // Build tour route from scenario or auto-generate
  let tourRoute;
  
  if (autoTourState.currentScenario && autoTourState.currentScenario.stops) {
    tourRoute = autoTourState.currentScenario.stops;
  } else {
    tourRoute = buildTourRoute();
  }
  
  if (!tourRoute || tourRoute.length === 0) {
    alert('Không có điểm tham quan nào. Vui lòng thêm phòng và hotspot!');
    return;
  }

  autoTourState.isPlaying = true;
  autoTourState.isPaused = false;
  autoTourState.currentStopIndex = 0;
  autoTourState.tourStops = tourRoute;

  // Update UI
  updateTourUI();
  
  // Start tour from first stop
  executeCurrentStop();
}

function stopAutoTour() {
  autoTourState.isPlaying = false;
  autoTourState.isPaused = false;
  
  // Clear all timers and animations
  clearAllTourTimers();

  // Close any opened tag/media/camera modals
  closeAllTourModals();

  // Remove all highlights
  removeAllTourHighlights();
  
  // Remove info overlay if exists
  const overlay = document.querySelector('.tour-info-overlay');
  if (overlay) overlay.remove();

  // Update UI
  updateTourUI();
}

function buildTourRoute() {
  const roomsData = env.getRoomsData();
  const rooms = Object.values(roomsData).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || a.id - b.id);
  
  return rooms.map(room => ({
    type: 'room',
    roomId: room.id,
    roomName: room.name,
    duration: 8,
    cameraEffect: 'pan360',
    title: room.name,
    description: `Khám phá ${room.name}`
  }));
}

function executeCurrentStop() {
  if (!autoTourState.isPlaying || autoTourState.isPaused) return;
  
  const stop = autoTourState.tourStops[autoTourState.currentStopIndex];
  
  if (!stop) {
    // Tour completed
    completeTour();
    return;
  }

  if (stop.type === 'room' || !stop.type) {
    executeRoomStop(stop);
  } else if (stop.type === 'tag' || stop.type === 'media' || stop.type === 'sensor' || stop.type === 'note' || stop.type === 'stall') {
    executeTagStop(stop);
  } else if (stop.type === 'hotspot') {
    executeHotspotStop(stop);
  }
}

function executeNextStop() {
  autoTourState.currentStopIndex++;
  executeCurrentStop();
}

function executeTagStop(stop) {
  const currentRoomId = env.getCurrentRoomId();
  const roomsData = env.getRoomsData();
  const room = roomsData[stop.roomId];

  const targetYawDeg = (stop.yaw !== undefined && stop.yaw !== null) ? Number(stop.yaw) : 0;
  const targetPitchDeg = (stop.pitch !== undefined && stop.pitch !== null) ? Number(stop.pitch) : 0;

  const isNewRoom = currentRoomId !== stop.roomId;
  if (isNewRoom) {
    env.switchRoom(stop.roomId, targetYawDeg, targetPitchDeg);
  }

  const title = stop.title || 'Điểm thông tin';
  const description = stop.description || `Đang xem: ${title} (${autoTourState.currentStopIndex + 1}/${autoTourState.tourStops.length})`;
  showTourInfo(`📌 ${title}`, description);

  const targetYawRad = degToRad(targetYawDeg);
  const targetPitchRad = degToRad(-targetPitchDeg);
  const durationMs = getStopDurationMs(stop.duration || 6);

  const startDelay = isNewRoom ? 350 : 50;

  autoTourState.timeoutId = setTimeout(() => {
    panCameraTo(targetYawRad, targetPitchRad, () => {
      // Auto open modal or trigger action if enabled
      if (stop.autoOpen !== false) {
        if (stop.tagType === 'sensor' || stop.tagType === 'camera' || stop.type === 'sensor') {
          if (stop.sensorData) {
            if (stop.sensorData.type === 'camera' || stop.tagType === 'camera') {
              showCameraPreview(stop.sensorData);
            } else {
              showSensorGrafana(stop.sensorData);
            }
          }
        } else {
          // Media Hotspot (image, video, 3d, note, stall, etc.)
          let mediaObj = stop.mediaData;
          if (!mediaObj && room && room.mediaHotspots) {
            mediaObj = room.mediaHotspots.find(m => m.id === stop.tagId || (Math.abs(Number(m.yaw) - targetYawDeg) < 1 && Math.abs(Number(m.pitch) - targetPitchDeg) < 1));
          }
          if (mediaObj) {
            showMediaOverlay(mediaObj);
          }
        }
      }

      startProgressBar(durationMs);

      autoTourState.timeoutId = setTimeout(() => {
        closeAllTourModals();
        removeTourInfo();
        executeNextStop();
      }, durationMs);
    });
  }, startDelay);
}

function getStopDurationMs(duration) {
  if (duration === null || duration === undefined || duration === '') {
    return AUTO_TOUR_CONFIG.stopDuration;
  }
  const num = Number(duration);
  if (!Number.isFinite(num) || num <= 0) return AUTO_TOUR_CONFIG.stopDuration;
  // If duration is in seconds (e.g. 5, 8, 10, <= 60), convert to milliseconds
  return num <= 60 ? num * 1000 : num;
}

function executeRoomStop(stop) {
  const currentRoomId = env.getCurrentRoomId();
  const roomsData = env.getRoomsData();
  const roomData = roomsData[stop.roomId];

  // Determine target starting yaw/pitch if defined (or fallback to room default initial view)
  const targetYawDeg = (stop.yaw !== undefined && stop.yaw !== null) ? Number(stop.yaw) : (roomData?.initialYaw !== undefined ? Number(roomData.initialYaw) : null);
  const targetPitchDeg = (stop.pitch !== undefined && stop.pitch !== null) ? Number(stop.pitch) : (roomData?.initialPitch !== undefined ? Number(roomData.initialPitch) : null);

  const isNewRoom = currentRoomId !== stop.roomId;
  if (isNewRoom) {
    env.switchRoom(stop.roomId, targetYawDeg, targetPitchDeg);
  }

  // Show room info with custom title/description if available
  const title = stop.title || roomData?.name || 'Phòng';
  const description = stop.description || `Đang tham quan: ${title} (${autoTourState.currentStopIndex + 1}/${autoTourState.tourStops.length})`;
  
  showTourInfo(title, description);

  const customYaw = targetYawDeg !== null ? degToRad(targetYawDeg) : null;
  const customPitch = targetPitchDeg !== null ? degToRad(-targetPitchDeg) : null;
  const effect = stop.cameraEffect || 'pan360';
  const durationMs = getStopDurationMs(stop.duration);

  // Wait 300ms if switching rooms so Marzipano scene stabilizes, then perform full 360 spin
  const startDelay = isNewRoom ? 300 : 50;

  autoTourState.timeoutId = setTimeout(() => {
    startProgressBar(durationMs);

    animateRoomCameraEffect(effect, customYaw, customPitch, durationMs, () => {
      autoTourState.timeoutId = setTimeout(() => {
        removeTourInfo();
        executeNextStop();
      }, 350);
    });
  }, startDelay);
}

function executeHotspotStop(stop) {
  const currentRoomId = env.getCurrentRoomId();
  const roomsData = env.getRoomsData();

  if (currentRoomId !== stop.roomId) {
    env.switchRoom(stop.roomId);
  }

  const room = roomsData[stop.roomId];
  if (!room || !room.hotspots || !room.hotspots[stop.hotspotIndex]) {
    console.warn('Hotspot not found, skipping');
    executeNextStop();
    return;
  }

  const hotspot = room.hotspots[stop.hotspotIndex];
  const targetRoom = roomsData[hotspot.target];

  const targetYaw = degToRad(hotspot.yaw);
  const targetPitch = degToRad(-hotspot.pitch);

  panCameraTo(targetYaw, targetPitch, () => {
    highlightHotspot(stop.hotspotIndex);
    
    const title = stop.title || `Điểm chuyển: ${targetRoom?.name || 'Phòng khác'}`;
    const description = stop.description || `Hotspot ${autoTourState.currentStopIndex + 1}/${autoTourState.tourStops.length}`;
    
    showTourInfo(title, description);

    const durationMs = getStopDurationMs(stop.duration);
    autoTourState.timeoutId = setTimeout(() => {
      removeHotspotHighlight(stop.hotspotIndex);
      removeTourInfo();
      executeNextStop();
    }, durationMs);
    
    startProgressBar(durationMs);
  });
}

function animateRoomCameraEffect(effect, initialYaw, initialPitch, duration, onComplete) {
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes();
  const scene = scenes[currentRoomId];
  if (!scene || !scene.view()) {
    onComplete();
    return;
  }

  const view = scene.view();
  if (initialYaw !== null) view.setYaw(initialYaw);
  if (initialPitch !== null) view.setPitch(initialPitch);

  const startYaw = view.yaw();
  const startPitch = view.pitch();
  const animationDuration = getStopDurationMs(duration);
  const startTime = Date.now();

  function animate() {
    if (!autoTourState.isPlaying || autoTourState.isPaused) return;
    
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / animationDuration, 1);
    
    let currentYaw = startYaw;
    if (effect === 'pan360' || !effect) {
      // Rotate a FULL 360 degrees (2 * PI radians)
      currentYaw = startYaw + (Math.PI * 2) * progress;
    } else if (effect === 'slowPan') {
      const eased = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      currentYaw = startYaw + (Math.PI / 3) * eased;
    } else {
      currentYaw = startYaw;
    }
    
    view.setYaw(currentYaw);
    view.setPitch(startPitch);
    
    if (progress < 1) {
      autoTourState.animationFrameId = requestAnimationFrame(animate);
    } else {
      onComplete();
    }
  }
  
  autoTourState.animationFrameId = requestAnimationFrame(animate);
}

function panCameraTo(targetYaw, targetPitch, onComplete) {
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes();
  const scene = scenes[currentRoomId];
  if (!scene || !scene.view()) {
    onComplete();
    return;
  }

  const view = scene.view();
  const startYaw = view.yaw();
  const startPitch = view.pitch();
  const duration = getTourPanDuration();
  const startTime = Date.now();

  function animate() {
    if (!autoTourState.isPlaying) return;
    
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-in-out function
    const eased = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    const currentYaw = startYaw + (targetYaw - startYaw) * eased;
    const currentPitch = startPitch + (targetPitch - startPitch) * eased;
    
    view.setYaw(currentYaw);
    view.setPitch(currentPitch);
    
    if (progress < 1) {
      autoTourState.animationFrameId = requestAnimationFrame(animate);
    } else {
      onComplete();
    }
  }
  
  autoTourState.animationFrameId = requestAnimationFrame(animate);
}

function highlightHotspot(index) {
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes();
  const scene = scenes[currentRoomId];
  if (!scene) return;
  
  const container = scene.hotspotContainer();
  const hotspots = container.listHotspots();
  
  if (hotspots[index]) {
    const element = hotspots[index]._domElement;
    if (element) {
      element.classList.add('tour-highlight');
    }
  }
}

function removeHotspotHighlight(index) {
  const currentRoomId = env.getCurrentRoomId();
  const scenes = env.getScenes();
  const scene = scenes[currentRoomId];
  if (!scene) return;
  
  const container = scene.hotspotContainer();
  const hotspots = container.listHotspots();
  
  if (hotspots[index]) {
    const element = hotspots[index]._domElement;
    if (element) {
      element.classList.remove('tour-highlight');
    }
  }
}

function removeAllTourHighlights() {
  const scenes = env.getScenes();
  Object.values(scenes).forEach(scene => {
    const container = scene.hotspotContainer();
    const hotspots = container.listHotspots();
    hotspots.forEach(h => {
      if (h._domElement) {
        h._domElement.classList.remove('tour-highlight');
      }
    });
  });
}

function showTourInfo(title, description) {
  removeTourInfo();
  
  const overlay = document.createElement('div');
  overlay.className = 'tour-info-overlay';
  overlay.innerHTML = `
    <h2>${title}</h2>
    <p>${description}</p>
  `;
  
  document.body.appendChild(overlay);
}

function removeTourInfo() {
  const overlay = document.querySelector('.tour-info-overlay');
  if (overlay) overlay.remove();
}

function startProgressBar(duration) {
  const progressFill = document.getElementById('progressFill');
  if (!progressFill) return;
  
  progressFill.style.width = '0%';
  
  const startTime = Date.now();
  
  if (autoTourState.progressIntervalId) {
    clearInterval(autoTourState.progressIntervalId);
  }
  
  autoTourState.progressIntervalId = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min((elapsed / duration) * 100, 100);
    progressFill.style.width = progress + '%';
    
    if (progress >= 100) {
      clearInterval(autoTourState.progressIntervalId);
      autoTourState.progressIntervalId = null;
    }
  }, 50);
}

function completeTour() {
  showTourInfo('Hoàn thành!', 'Đã tham quan xong tất cả các điểm. Cảm ơn bạn đã tham quan!');
  
  setTimeout(() => {
    stopAutoTour();
  }, 5000);
}

function updateTourUI() {
  const startBtn = document.getElementById('autoTourStartBtn');
  const controlPanel = document.getElementById('tourControlPanel');
  const playPauseBtn = document.getElementById('tourPlayPauseBtn');
  const playPauseIcon = playPauseBtn?.querySelector('.control-icon');
  const tourStatus = document.getElementById('tourStatus');
  
  if (!startBtn || !controlPanel) return;
  
  if (autoTourState.isPlaying) {
    // Show control panel, hide start button
    startBtn.style.display = 'none';
    controlPanel.style.display = 'flex';
    
    // Update play/pause button
    if (playPauseBtn && playPauseIcon) {
      if (autoTourState.isPaused) {
        playPauseIcon.textContent = '▶';
        playPauseBtn.classList.add('paused');
        playPauseBtn.classList.remove('active');
        playPauseBtn.title = 'Tiếp tục';
      } else {
        playPauseIcon.textContent = '⏸';
        playPauseBtn.classList.add('active');
        playPauseBtn.classList.remove('paused');
        playPauseBtn.title = 'Tạm dừng';
      }
    }
    
    // Update status text
    if (tourStatus) {
      const current = autoTourState.currentStopIndex + 1;
      const total = autoTourState.tourStops.length;
      const status = autoTourState.isPaused ? 'Đã tạm dừng' : 'Đang tham quan';
      tourStatus.textContent = `${status} - Điểm ${current}/${total}`;
    }
  } else {
    // Show start button, hide control panel
    startBtn.style.display = 'flex';
    controlPanel.style.display = 'none';
  }
}

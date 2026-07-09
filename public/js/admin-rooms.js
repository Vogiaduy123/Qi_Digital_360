// Pannellum library
    if (typeof pannellum === 'undefined') {
      console.error('Pannellum not loaded');
    }

    /* ===== STATE ===== */
    let rooms = [];
    let selectedRoomId = null;
    let editingHotspotIndex = null;
    let editingMediaHotspotIndex = null;
    let panoramaViewer = null;
    let selectedMediaFile = null;
    let selectedHotspotIconFile = null;
    let addHotspotMode = false;
    let addMediaMode = false;
    let addSensorPositionMode = false;
    let adminSensorHotspotIds = [];
    let editingSensorIndex = null;
    let roomSensors = [];
    let autoRefreshInterval = null;
    let isAutoRefreshEnabled = false;
    let currentPreviewPeerConnection = null;
    let polygonPoints = []; // [[yaw, pitch], ...] for 3D hotspot highlight
    let isPolygonDrawMode = false;
    let polygonDrawSubMode = 'edit'; // 'add', 'edit', 'pan'
    let roomsPanelCollapsed = localStorage.getItem('adminRoomsPanelCollapsed') === '1';
    let isMovingHotspot = false;
    let movingHotspotIdx = null;
    let isMovingMediaHotspot = false;
    let movingMediaHotspotIdx = null;
    let isDraggingHotspot = false;      // true ONLY while mouse button is held down on a hotspot element
    let isDraggingMediaHotspot = false; // true ONLY while mouse button is held down on a media hotspot element
    let activeDragMouseMoveHandler = null;
    let activeDragMouseUpHandler = null;

    let customIcons = {};

    async function loadCustomIcons() {
      try {
        const res = await fetch("/api/custom-icons").then(r => r.json());
        if (res && res.success) {
          customIcons = res.config || {};
        }
      } catch (e) {
        console.warn("Cannot load custom icons:", e);
      }
    }

    function applyCustomIconToHotspotElement(element, type) {
      if (!element) return;
      const key = type === 'nav' ? 'nav_arrow' : 'media_' + type;
      const iconKey = (type === 'sensor' || type === 'camera') ? type : key;
      const customIcon = customIcons && customIcons[iconKey];
      if (customIcon) {
        element.style.setProperty('background', 'none', 'important');
        element.style.backgroundImage = `url(${customIcon})`;
        element.style.setProperty('background-size', 'contain', 'important');
        element.style.setProperty('background-position', 'center', 'important');
        element.style.setProperty('background-repeat', 'no-repeat', 'important');
        element.style.setProperty('border', 'none', 'important');
        element.style.setProperty('box-shadow', 'none', 'important');
      }
    }

    window.reloadAdminHotspots = async function() {
      await loadCustomIcons();
      if (selectedRoomId) {
        loadPanoramaPreview();
        const room = rooms.find(r => r.id === selectedRoomId);
        if (room) {
          renderMediaHotspots(room.mediaHotspots || []);
          renderMailHotspots(room.mailHotspots || []);
        }
        renderSensors();
      }
    };

    function closeHotspotModal() {
      const modal = document.getElementById('hotspotModal');
      const form = document.getElementById('hotspotForm');
      const title = document.getElementById('modalTitle');

      if (modal) modal.classList.remove('active');
      if (form) form.reset();
      if (title) title.textContent = 'Thêm Hotspot';

      editingHotspotIndex = null;
      selectedHotspotIconFile = null;

      if (hotspotIconUrlInput) hotspotIconUrlInput.value = '';
      if (hotspotIconFileInput) hotspotIconFileInput.value = '';
      if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = '';
    }

    function closeAllFeatureModals(keepModalId = null) {
      if (keepModalId !== 'hotspotModal') closeHotspotModal();
      if (keepModalId !== 'mediaHotspotModal') closeMediaHotspotModal();
      if (keepModalId !== 'mailHotspotModal' && typeof window.closeMailModal === 'function') {
        window.closeMailModal();
      }
      if (keepModalId !== 'sensorModal') closeSensorModal();
      if (keepModalId !== 'addRoomModal') {
        const addRoomModal = document.getElementById('addRoomModal');
        if (addRoomModal) addRoomModal.classList.remove('active');
      }

      setAddHotspotMode(false);
      setAddMediaMode(false);
      setAddSensorPositionMode(false);
      addMailMode = false;
    }

    function applyRoomsPanelState() {
      const roomsPanel = document.querySelector('.rooms-panel');
      const toggleBtn = document.getElementById('roomsPanelToggleBtn');

      if (!roomsPanel) return;

      roomsPanel.classList.toggle('collapsed', roomsPanelCollapsed);
      if (toggleBtn) {
        toggleBtn.textContent = roomsPanelCollapsed ? 'Mở phòng' : 'Thu gọn phòng';
        toggleBtn.setAttribute('aria-pressed', roomsPanelCollapsed ? 'true' : 'false');
      }
      localStorage.setItem('adminRoomsPanelCollapsed', roomsPanelCollapsed ? '1' : '0');
    }

    function toggleRoomsPanel() {
      roomsPanelCollapsed = !roomsPanelCollapsed;
      applyRoomsPanelState();
    }
    window.toggleRoomsPanel = toggleRoomsPanel;

    /* ===== WEBCAM MANAGEMENT ===== */
    let webcamStream = null;

    function toggleWebcam() {
      const useWebcam = document.getElementById('useWebcam').checked;
      const webcamPreview = document.getElementById('webcamPreview');
      const manualUrlGroup = document.getElementById('manualCameraUrlGroup');
      const streamUrlInput = document.getElementById('cameraStreamUrl');
      const snapshotUrlInput = document.getElementById('cameraSnapshotUrl');
      const statusEl = document.getElementById('cameraConnectionStatus');

      if (useWebcam) {
        webcamPreview.style.display = 'block';
        manualUrlGroup.style.display = 'none';
        streamUrlInput.value = 'webcam://0';
        snapshotUrlInput.value = 'webcam://0/snapshot';
        snapshotUrlInput.disabled = true;
        resetCameraDiagnostics();
        if (statusEl) {
          statusEl.style.color = '#3498db';
          statusEl.textContent = 'ℹ️ Chế độ webcam nội bộ: bỏ qua kiểm tra URL WebRTC';
        }
      } else {
        webcamPreview.style.display = 'none';
        manualUrlGroup.style.display = 'block';
        if (streamUrlInput.value === 'webcam://0') {
          streamUrlInput.value = '';
          snapshotUrlInput.value = '';
        }
        snapshotUrlInput.disabled = false;
        resetCameraDiagnostics();
        stopWebcam();
      }
    }
    window.toggleWebcam = toggleWebcam;

    async function startWebcam() {
      try {
        const video = document.getElementById('webcamVideo');
        const cameraStatusSelect = document.getElementById('cameraStatus');

        // Stop existing stream if any
        if (webcamStream) {
          webcamStream.getTracks().forEach(track => track.stop());
        }

        // Request webcam access
        webcamStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        video.srcObject = webcamStream;

        // Ensure video plays
        video.onloadedmetadata = () => {
          video.play().then(() => {
            console.log('✅ Webcam started successfully');
            if (cameraStatusSelect) cameraStatusSelect.value = 'online';
            alert('✅ Webcam đã được bật thành công!');
          }).catch(e => {
            console.error('Play error:', e);
            alert('⚠️ Webcam đã bật nhưng không thể phát video. Hãy kiểm tra quyền truy cập.');
          });
        };
      } catch (err) {
        console.error('❌ Webcam error:', err);
        let errorMsg = '❌ Không thể truy cập webcam: ' + err.message;

        if (err.name === 'NotAllowedError') {
          errorMsg += '\n\n🔒 Bạn đã từ chối quyền truy cập camera. Vui lòng:\n1. Click vào biểu tượng 🔒 trên thanh địa chỉ\n2. Cho phép truy cập Camera\n3. Tải lại trang';
        } else if (err.name === 'NotFoundError') {
          errorMsg += '\n\n📷 Không tìm thấy webcam. Vui lòng kiểm tra:\n- Webcam đã được kết nối\n- Driver webcam đã cài đặt';
        } else if (err.name === 'NotReadableError') {
          errorMsg += '\n\n⚠️ Webcam đang được sử dụng bởi ứng dụng khác';
        }

        alert(errorMsg);
      }
    }
    window.startWebcam = startWebcam;

    function stopWebcam() {
      const video = document.getElementById('webcamVideo');
      const cameraStatusSelect = document.getElementById('cameraStatus');

      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
        video.srcObject = null;
        if (cameraStatusSelect) cameraStatusSelect.value = 'offline';
        console.log('⏹️ Webcam stopped');
      }
    }
    window.stopWebcam = stopWebcam;

    function setCameraConnectionStatus(message, color = '#7f8c8d') {
      const statusEl = document.getElementById('cameraConnectionStatus');
      if (!statusEl) return;
      statusEl.style.color = color;
      statusEl.textContent = message;
    }

    function resetCameraDiagnostics() {
      const wrapper = document.getElementById('snapshotPreviewWrapper');
      const video = document.getElementById('cameraStreamPreviewVideo');
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) { }
      }
      if (currentPreviewPeerConnection) {
        try { currentPreviewPeerConnection.close(); } catch (_) { }
        currentPreviewPeerConnection = null;
      }
      if (wrapper) wrapper.style.display = 'none';
      if (wrapper) wrapper.innerHTML = '';
    }

    function withCacheBuster(url) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}t=${Date.now()}`;
    }

    function normalizeWebRtcUrl(streamUrl) {
      const raw = String(streamUrl || '').trim();
      if (!raw || raw.startsWith('webcam://')) return null;

      const preferredHttpScheme = window.location.protocol === 'https:' ? 'https://' : 'http://';

      if (raw.startsWith('webrtc://')) {
        const withoutScheme = raw.slice('webrtc://'.length).replace(/^\/+/, '');
        return `${preferredHttpScheme}${withoutScheme.replace(/\/+$/, '')}/whep`;
      }

      if (raw.startsWith('whep://')) {
        const withoutScheme = raw.slice('whep://'.length).replace(/^\/+/, '');
        return `${preferredHttpScheme}${withoutScheme}`;
      }

      if (/^https?:\/\//i.test(raw) && /\/whep(\?|$)/i.test(raw)) {
        return raw;
      }

      return null;
    }

    function waitForIceGatheringComplete(peerConnection, timeoutMs = 5000) {
      return new Promise((resolve) => {
        if (peerConnection.iceGatheringState === 'complete') {
          resolve(true);
          return;
        }

        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          peerConnection.removeEventListener('icegatheringstatechange', onStateChange);
          clearTimeout(timer);
          resolve(true);
        };

        const onStateChange = () => {
          if (peerConnection.iceGatheringState === 'complete') {
            done();
          }
        };

        const timer = setTimeout(done, timeoutMs);
        peerConnection.addEventListener('icegatheringstatechange', onStateChange);
      });
    }

    async function attachWebRtcPreview(whepUrl, videoEl) {
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      currentPreviewPeerConnection = peerConnection;

      peerConnection.addTransceiver('video', { direction: 'recvonly' });
      peerConnection.addTransceiver('audio', { direction: 'recvonly' });

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams || [];
        if (stream) {
          videoEl.srcObject = stream;
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);

      const res = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: peerConnection.localDescription?.sdp || offer.sdp
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `WHEP server lỗi HTTP ${res.status}`);
      }

      const answerSdp = await res.text();
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    }

    function previewCameraStream() {
      const streamUrl = (document.getElementById('cameraStreamUrl')?.value || '').trim();
      const wrapper = document.getElementById('snapshotPreviewWrapper');

      if (!streamUrl) {
        resetCameraDiagnostics();
        setCameraConnectionStatus('⚠️ Vui lòng nhập URL stream trước khi xem', '#e67e22');
        return;
      }

      if (streamUrl.startsWith('webcam://')) {
        resetCameraDiagnostics();
        setCameraConnectionStatus('ℹ️ Webcam dùng preview riêng ở phía trên', '#3498db');
        return;
      }

      const whepUrl = normalizeWebRtcUrl(streamUrl);
      if (!whepUrl) {
        resetCameraDiagnostics();
        setCameraConnectionStatus('❌ URL không hợp lệ. Dùng URL /whep hoặc webrtc://host/path', '#e74c3c');
        return;
      }

      if (!wrapper) return;

      wrapper.innerHTML = `
        <video id="cameraStreamPreviewVideo" autoplay muted controls playsinline style="width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; background: white;"></video>
        <img id="cameraStreamPreviewImageFallback" alt="Stream preview" style="display: none; width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; background: white;">
      `;
      wrapper.style.display = 'block';
      setCameraConnectionStatus('⏳ Đang kết nối WebRTC...', '#3498db');

      const video = document.getElementById('cameraStreamPreviewVideo');
      const imageFallback = document.getElementById('cameraStreamPreviewImageFallback');
      if (!video || !imageFallback) return;

      video.oncanplay = () => {
        setCameraConnectionStatus('✅ Stream đang phát', '#27ae60');
      };

      video.onerror = () => {
        video.style.display = 'none';
        imageFallback.style.display = 'block';
        imageFallback.src = withCacheBuster(streamUrl);
        setCameraConnectionStatus('ℹ️ Không phát được WebRTC, đang thử hiển thị ảnh snapshot/MJPEG...', '#f39c12');
      };

      imageFallback.onload = () => {
        setCameraConnectionStatus('✅ Stream hiển thị theo chế độ ảnh MJPEG', '#27ae60');
      };

      imageFallback.onerror = () => {
        wrapper.style.display = 'none';
        setCameraConnectionStatus('❌ Không xem trực tiếp được luồng này trên trình duyệt admin', '#e74c3c');
      };

      attachWebRtcPreview(whepUrl, video)
        .then(() => {
          video.play().catch(() => { });
        })
        .catch((err) => {
          wrapper.style.display = 'none';
          setCameraConnectionStatus(`❌ Không xem được stream WebRTC: ${err.message}`, '#e74c3c');
        });
    }
    window.previewCameraStream = previewCameraStream;

    async function checkCameraStreamUrl() {
      const streamUrl = (document.getElementById('cameraStreamUrl')?.value || '').trim();
      const cameraStatusSelect = document.getElementById('cameraStatus');

      if (!streamUrl) {
        setCameraConnectionStatus('⚠️ Vui lòng nhập URL stream trước khi kiểm tra', '#e67e22');
        return;
      }

      if (streamUrl.startsWith('webcam://')) {
        setCameraConnectionStatus('ℹ️ Webcam nội bộ đang hoạt động trên trình duyệt, không cần kiểm tra URL WebRTC', '#3498db');
        return;
      }

      const whepUrl = normalizeWebRtcUrl(streamUrl);
      if (!whepUrl) {
        if (cameraStatusSelect) cameraStatusSelect.value = 'offline';
        setCameraConnectionStatus('❌ URL không hợp lệ. Dùng URL /whep hoặc webrtc://host/path', '#e74c3c');
        return;
      }

      if (cameraStatusSelect) cameraStatusSelect.value = 'online';
      setCameraConnectionStatus(`✅ URL WebRTC hợp lệ: ${whepUrl}`, '#27ae60');
    }
    window.checkCameraStreamUrl = checkCameraStreamUrl;

    /* ===== TOGGLE SENSOR/CAMERA FIELDS ===== */
    function toggleSensorFields() {
      const sensorType = document.getElementById('sensorType').value;
      const environmentFields = document.getElementById('environmentFields');
      const cameraFields = document.getElementById('cameraFields');
      const apiConfigContainer = environmentFields.previousElementSibling;

      if (sensorType === 'camera') {
        environmentFields.style.display = 'none';
        cameraFields.style.display = 'block';
        // Hide API config for camera
        if (apiConfigContainer && apiConfigContainer.style) {
          apiConfigContainer.style.display = 'none';
        }
      } else {
        environmentFields.style.display = 'block';
        cameraFields.style.display = 'none';
        // Show API config for environment sensor
        if (apiConfigContainer && apiConfigContainer.style) {
          apiConfigContainer.style.display = 'block';
        }
      }
    }
    window.toggleSensorFields = toggleSensorFields;

    /* ===== DOM ELEMENTS ===== */
    const selectedRoomInfo = document.getElementById('selectedRoomInfo');
    const hotspotSection = document.getElementById('hotspotSection');
    const hotspotsList = document.getElementById('hotspotsList');
    const hotspotForm = document.getElementById('hotspotForm');
    const hotspotModal = document.getElementById('hotspotModal');
    const modalTitle = document.getElementById('modalTitle');
    const colorPicker = document.getElementById('colorPicker');
    const hotspotIconUrlInput = document.getElementById('hotspotIconUrl');
    const hotspotIconFileInput = document.getElementById('hotspotIconFile');
    const hotspotIconFileInfo = document.getElementById('hotspotIconFileInfo');
    const addHotspotBtn = document.getElementById('addHotspotBtn');
    const addMediaBtn = document.getElementById('addMediaBtn');

    // ===== AUTO-REFRESH FUNCTIONS (declared early for inline onclick) =====
    function toggleAutoRefresh() {
      if (isAutoRefreshEnabled) {
        stopAutoRefresh();
      } else {
        startAutoRefresh();
      }
    }

    function startAutoRefresh() {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
      }

      isAutoRefreshEnabled = true;
      updateAutoRefreshStatus();

      // Will load config later
      const interval = 10000; // default 10 seconds
      autoRefreshInterval = setInterval(() => {
        if (selectedRoomId && roomSensors.length > 0) {
          refreshAllSensors();
        }
      }, interval);

      console.log(`🔄 Auto-refresh enabled (interval: ${interval / 1000}s)`);
    }

    function stopAutoRefresh() {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }
      isAutoRefreshEnabled = false;
      updateAutoRefreshStatus();
      console.log('🛑 Auto-refresh disabled');
    }

    function updateAutoRefreshStatus() {
      const statusEl = document.getElementById('autoRefreshStatus');
      if (statusEl) {
        statusEl.textContent = isAutoRefreshEnabled ? '🔄 Auto-refresh: ON' : '⏸️ Auto-refresh: OFF';
        statusEl.style.color = isAutoRefreshEnabled ? '#27ae60' : '#7f8c8d';
      }
    }

    async function refreshAllSensors() {
      if (!selectedRoomId) {
        console.warn('⚠️ Chưa chọn phòng, bỏ qua refresh.');
        return;
      }

      console.log(`🔄 Refreshing sensors (room ${selectedRoomId})...`);

      try {
        const res = await fetch(`/api/real-data/combined?roomId=${selectedRoomId}`);
        const result = await res.json();

        if (result.success && result.data && roomSensors.length > 0) {
          // Update only environment sensors in current room with new data
          // Skip cameras as they don't have temperature/humidity/pm25
          let updatedCount = 0;
          for (const sensor of roomSensors) {
            // Only update environment sensors, not cameras
            if (sensor.type === 'camera' || !sensor.sensors) {
              console.log(`⏭️ Skipping ${sensor.name} (type: ${sensor.type})`);
              continue;
            }

            sensor.sensors.temperature.value = result.data.temperature;
            sensor.sensors.humidity.value = result.data.humidity;
            sensor.sensors.pm25.value = result.data.pm25;
            sensor.lastUpdate = new Date().toISOString();

            // Save to backend
            await fetch(`/api/sensors/${sensor.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sensor)
            });

            updatedCount++;
          }

          // Reload sensors to display updated data
          await loadSensors();
          console.log(`✅ Refreshed ${updatedCount} environment sensor(s) successfully`);
        }
      } catch (err) {
        console.error('❌ Auto-refresh error:', err);
      }
    }

    // ===== LOAD & RENDER ROOMS =====
    let adminBuildings = [];

    async function loadBuildings() {
      try {
        const rawRes = await fetch('/api/admin/buildings');
        const res = await rawRes.json();
        if (res && res.buildings) {
          adminBuildings = res.buildings;
          const filterSel = document.getElementById('filterBuilding');
          const editSel = document.getElementById('editRoomBuilding');
          
          if (filterSel) {
             const defaultOption1 = '<option value="">-- Tất cả tòa nhà --</option>';
             const defaultOption2 = '<option value="none">-- Phòng rời (không có) --</option>';
             let options = defaultOption1 + defaultOption2;
             adminBuildings.forEach(b => options += `<option value="${b.id}">${b.name}</option>`);
             filterSel.innerHTML = options;
          }
          
          if (editSel) {
             const defaultOption = '<option value="">-- Phòng rời (không có) --</option>';
             let options = defaultOption;
             adminBuildings.forEach(b => options += `<option value="${b.id}">${b.name}</option>`);
             editSel.innerHTML = options;
          }
        }
      } catch (error) {
        console.error('Error loading buildings:', error);
      }
    }

    async function loadRooms() {
      try {
        if (adminBuildings.length === 0) await loadBuildings();
        const res = await fetch('/api/rooms');
        rooms = await res.json();
        renderRooms();
        updateTargetRoomSelect();

        const selectedRoomStillExists = selectedRoomId && rooms.some(room => room.id === selectedRoomId);
        if (rooms.length > 0 && !selectedRoomStillExists) {
          selectRoom(rooms[0].id);
        }
      } catch (error) {
        console.error('Error loading rooms:', error);
      }
    }

    function renderRooms() {
      const filterVal = document.getElementById('filterBuilding')?.value;
      const searchQuery = (document.getElementById('roomSearchInput')?.value || '').trim().toLowerCase();

      let filteredRooms = rooms.filter(room => {
        let matchBuilding = true;
        if (filterVal) {
          if (filterVal === 'none') matchBuilding = !room.buildingId;
          else matchBuilding = room.buildingId === filterVal;
        }
        
        let matchSearch = true;
        if (searchQuery) {
          matchSearch = room.name.toLowerCase().includes(searchQuery);
        }
        
        return matchBuilding && matchSearch;
      });

      // Cập nhật số lượng phòng
      const countLabel = document.getElementById('roomsCountLabel');
      if (countLabel) {
        countLabel.textContent = `${filteredRooms.length} phòng`;
      }

      if (filteredRooms.length === 0) {
        roomsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>Không có phòng nào</p></div>';
        return;
      }

      // Nhóm phòng theo Building
      const groups = {};
      filteredRooms.forEach(room => {
        const key = room.buildingId || '__none__';
        if (!groups[key]) groups[key] = [];
        groups[key].push(room);
      });

      let html = '';
      Object.entries(groups).forEach(([bKey, bRooms]) => {
        const b = adminBuildings.find(x => x.id === bKey);
        const bLabel = b ? `🏢 ${b.name}` : '🏠 Phòng rời';
        const groupId = `group_${bKey}`;

        html += `
          <div class="room-group" data-building="${bKey}">
            <div class="room-group-header" onclick="toggleRoomGroup('${groupId}')">
              <span class="room-group-label">${bLabel}</span>
              <span class="room-group-count">${bRooms.length} phòng</span>
              <span class="room-group-chevron" id="chevron_${groupId}">▼</span>
            </div>
            <div class="room-group-body" id="${groupId}">
              <div class="room-drag-list" data-building="${bKey}">
                ${bRooms.map(room => `
                  <div class="room-item ${room.id === selectedRoomId ? 'active' : ''}" data-room-id="${room.id}" data-building="${bKey}">
                    <span class="room-drag-handle" title="Kéo để sắp xếp">
                      <svg width="12" height="18" viewBox="0 0 12 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="3" cy="3" r="1.5" fill="#9AA3B8"/>
                        <circle cx="9" cy="3" r="1.5" fill="#9AA3B8"/>
                        <circle cx="3" cy="9" r="1.5" fill="#9AA3B8"/>
                        <circle cx="9" cy="9" r="1.5" fill="#9AA3B8"/>
                        <circle cx="3" cy="15" r="1.5" fill="#9AA3B8"/>
                        <circle cx="9" cy="15" r="1.5" fill="#9AA3B8"/>
                      </svg>
                    </span>
                    <div class="room-icon-wrap" onclick="selectRoom(${room.id})">
                      🏠
                    </div>
                    <div class="room-item-text" onclick="selectRoom(${room.id})">
                      <div class="room-item-name">${room.name}</div>
                      <div class="room-item-info">Hotspots: ${room.hotspots ? room.hotspots.length : 0} | Tầng ${room.floor || 1}</div>
                    </div>
                    <div class="room-item-actions">
                      <button class="room-action-btn danger" title="Xóa phòng" onclick="deleteRoom(${room.id}, event)">🗑️</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      });

      roomsList.innerHTML = html;
      initDragAndDrop();
    }

    function toggleRoomGroup(groupId) {
      const body = document.getElementById(groupId);
      const chevron = document.getElementById(`chevron_${groupId}`);
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if (chevron) chevron.textContent = isOpen ? '▶' : '▼';
    }
    window.toggleRoomGroup = toggleRoomGroup;

    window.filterRoomsBySearch = function(query) {
      renderRooms();
    };

    window.openAddRoomModal = function() {
      window.location.href = '/admin/upload.html';
    };


    // Biến lưu trữ phần tử đang được kéo thả trên toàn cục bộ
    let globalDragSrc = null;

    function initDragAndDrop() {
      const dragLists = document.querySelectorAll('.room-drag-list');
      
      dragLists.forEach(list => {
        const items = list.querySelectorAll('.room-item');
        
        items.forEach(item => {
          const handle = item.querySelector('.room-drag-handle');
          
          if (handle) {
            // Kích hoạt draggable khi click và giữ chuột ở phần handle
            handle.addEventListener('mousedown', () => {
              item.setAttribute('draggable', 'true');
            });
            
            // Hủy draggable khi nhả chuột ra khỏi handle
            handle.addEventListener('mouseup', () => {
              item.removeAttribute('draggable');
            });
            
            // Hỗ trợ mobile touch events (nếu cần thiết)
            handle.addEventListener('touchstart', () => {
              item.setAttribute('draggable', 'true');
            });
            handle.addEventListener('touchend', () => {
              item.removeAttribute('draggable');
            });
          }

          item.addEventListener('dragstart', function(e) {
            globalDragSrc = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.dataset.roomId);
          });

          item.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            this.removeAttribute('draggable');
            document.querySelectorAll('.room-item').forEach(i => i.classList.remove('drag-over'));
            globalDragSrc = null;
          });

          item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (globalDragSrc && this !== globalDragSrc && globalDragSrc.dataset.building === this.dataset.building) {
              document.querySelectorAll('.room-item').forEach(i => i.classList.remove('drag-over'));
              this.classList.add('drag-over');
            }
          });

          item.addEventListener('drop', async function(e) {
            e.preventDefault();
            if (!globalDragSrc || this === globalDragSrc) return;
            
            // Không cho kéo thả giữa các khu vực/tòa nhà khác nhau
            if (globalDragSrc.dataset.building !== this.dataset.building) {
              console.warn('⚠️ Không thể kéo phòng sang tòa nhà khác!');
              return;
            }

            const allItems = [...list.querySelectorAll('.room-item')];
            const srcIdx = allItems.indexOf(globalDragSrc);
            const dstIdx = allItems.indexOf(this);

            if (srcIdx === -1 || dstIdx === -1) return;

            // Lấy building key và danh sách phòng trong building đó (theo thứ tự hiện tại trong DOM)
            const buildingKey = list.dataset.building;
            const bRooms = [...rooms.filter(r => (buildingKey === '__none__' ? !r.buildingId : r.buildingId === buildingKey))];
            
            // Áp dụng thay đổi thứ tự trong building
            const [moved] = bRooms.splice(srcIdx, 1);
            bRooms.splice(dstIdx, 0, moved);

            // Xây dựng mảng rooms mới: thay thế phần tử trong building này bằng thứ tự đã sắp xếp
            const newRooms = [];
            let bRoomsIdx = 0;
            for (const r of rooms) {
              const isThisBuilding = buildingKey === '__none__' ? !r.buildingId : r.buildingId === buildingKey;
              if (isThisBuilding) {
                newRooms.push(bRooms[bRoomsIdx++]);
              } else {
                newRooms.push(r);
              }
            }
            rooms = newRooms;

            // Render ngay từ bộ nhớ (UI nhanh)
            renderRooms();

            // Lưu thứ tự toàn bộ phòng lên database (index = vị trí trong mảng rooms)
            await saveRoomOrder(rooms.map(r => r.id));
          });   // end drop
        });     // end items.forEach
      });       // end dragLists.forEach
    }           // end initDragAndDrop

    async function saveRoomOrder(orderedIds) {
      try {
        const res = await fetch('/api/rooms/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds })
        });
        const data = await res.json();
        if (!data.success) {
          console.error('❌ saveRoomOrder server error:', data.error);
        } else {
          console.log('✅ Thứ tự phòng đã được lưu:', orderedIds.length, 'phòng');
        }
      } catch (err) {
        console.error('❌ saveRoomOrder fetch error:', err.message);
      }
    }


    function updateTargetRoomSelect() {
      const select = document.getElementById('targetRoom');
      select.innerHTML = '<option value="">-- Chọn phòng đích --</option>';
      rooms.forEach(room => {
        if (room.id !== selectedRoomId) {
          select.innerHTML += `<option value="${room.id}">${room.name}</option>`;
        }
      });
    }

    // Will be redefined below after media functions are loaded
    window.selectRoom = function (roomId) {
      // Placeholder - see below for actual implementation
    };

    function renderHotspots() {
      const room = rooms.find(r => r.id === selectedRoomId);
      const countLabel = document.getElementById('transitionsCountLabel');

      if (!selectedRoomId || !room) {
        if (countLabel) countLabel.textContent = '0 hotspot';
        hotspotsList.innerHTML = '<div class="empty-state compact">Chọn phòng ở danh sách phía trên để quản lý hotspot</div>';
        return;
      }

      const count = room.hotspots ? room.hotspots.length : 0;
      if (countLabel) countLabel.textContent = `${count} hotspot`;

      if (!room.hotspots || room.hotspots.length === 0) {
        hotspotsList.innerHTML = '<div class="empty-state compact"><p>Chưa có hotspot</p></div>';
        return;
      }

      hotspotsList.innerHTML = room.hotspots.map((hotspot, idx) => {
        const targetRoom = rooms.find(r => r.id === hotspot.target);
        return `
          <div class="hotspot-item">
            <h5>🎯 Hotspot ${idx + 1}</h5>
            <div class="hotspot-info">
              <span><strong>Phòng:</strong> ${targetRoom ? targetRoom.name : '?'}</span>
              <span><strong>Yaw:</strong> ${hotspot.yaw.toFixed(2)}° | <strong>Pitch:</strong> ${hotspot.pitch.toFixed(2)}°</span>
              <span><strong>Icon:</strong> ${hotspot.iconUrl ? 'Có icon tùy chỉnh' : 'Mặc định'}</span>
            </div>
            <div class="hotspot-actions">
              <button class="btn btn-edit btn-small" onclick="editHotspot(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
              <button class="btn btn-primary btn-small" onclick="startMoveHotspot(${idx})" style="margin-bottom: 0; background-color: #2563eb;">📍 Di chuyển</button>
              <button class="btn btn-danger btn-small" onclick="deleteHotspot(${idx})" style="margin-bottom: 0;">🗑️ Xóa</button>
            </div>
          </div>
        `;
      }).join('');
    }

    // ===== HOTSPOT OPERATIONS =====
    async function uploadHotspotIconFile(file) {
      const formData = new FormData();
      formData.append('media', file);

      const uploadRes = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: formData
      });

      const contentType = uploadRes.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const errorText = await uploadRes.text();
        throw new Error(`Upload icon thất bại (${uploadRes.status}): ${errorText.slice(0, 150)}`);
      }

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success || !uploadData.media?.url) {
        throw new Error(uploadData.error || `Upload icon thất bại (${uploadRes.status})`);
      }

      return uploadData.media.url;
    }

    hotspotForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const targetId = Number(document.getElementById('targetRoom').value);
      if (!targetId) {
        alert('Vui lòng chọn phòng đích');
        return;
      }

      let iconUrl = hotspotIconUrlInput ? hotspotIconUrlInput.value.trim() : '';
      try {
        if (selectedHotspotIconFile) {
          if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = 'Đang upload icon...';
          iconUrl = await uploadHotspotIconFile(selectedHotspotIconFile);
          if (hotspotIconUrlInput) hotspotIconUrlInput.value = iconUrl;
          if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = `Đã upload: ${selectedHotspotIconFile.name}`;
        }
      } catch (uploadError) {
        alert(uploadError.message);
        if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = '';
        return;
      }

      const data = {
        target: targetId,
        yaw: Number(document.getElementById('yaw').value),
        pitch: Number(document.getElementById('pitch').value),
        rotation: Number(document.getElementById('rotation').value),
        color: document.getElementById('color').value,
        iconUrl
      };

      try {
        let url = `/api/admin/rooms/${selectedRoomId}/hotspots`;
        let method = 'PUT';

        if (editingHotspotIndex !== null) {
          url += `/${editingHotspotIndex}`;
          method = 'PATCH';
        }

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (res.ok) {
          await loadRooms();
          renderHotspots();
          loadPanoramaPreview();
          hotspotModal.classList.remove('active');
          selectedHotspotIconFile = null;
          if (hotspotIconFileInput) hotspotIconFileInput.value = '';
          if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = '';
          alert(editingHotspotIndex !== null ? 'Cập nhật thành công!' : 'Thêm thành công!');
        } else {
          alert('Lỗi lưu hotspot');
        }
      } catch (error) {
        console.error('Error saving hotspot:', error);
        alert('Lỗi: ' + error.message);
      }
    });

    window.editHotspot = function (idx) {
      const room = rooms.find(r => r.id === selectedRoomId);
      const hotspot = room.hotspots[idx];

      closeAllFeatureModals('hotspotModal');
      editingHotspotIndex = idx;
      modalTitle.textContent = 'Chỉnh sửa Hotspot';
      document.getElementById('targetRoom').value = hotspot.target;
      document.getElementById('yaw').value = hotspot.yaw;
      document.getElementById('pitch').value = hotspot.pitch;
      document.getElementById('rotation').value = hotspot.rotation || 0;
      document.getElementById('color').value = hotspot.color || '#ff0000';
      colorPicker.value = hotspot.color || '#ff0000';
      if (hotspotIconUrlInput) hotspotIconUrlInput.value = hotspot.iconUrl || '';
      selectedHotspotIconFile = null;
      if (hotspotIconFileInput) hotspotIconFileInput.value = '';
      if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = hotspot.iconUrl ? 'Đang dùng icon đã lưu' : '';

      hotspotModal.classList.add('active');
    };

    window.deleteHotspot = async function (idx) {
      if (!confirm('Xóa hotspot này?')) return;

      try {
        const res = await fetch(`/api/admin/rooms/${selectedRoomId}/hotspots/${idx}`, {
          method: 'DELETE'
        });

        if (res.ok) {
          await loadRooms();
          renderHotspots();
          loadPanoramaPreview();
          alert('Đã xóa!');
        } else {
          alert('Lỗi xóa hotspot');
        }
      } catch (error) {
        console.error('Error deleting hotspot:', error);
      }
    };

    window.startMoveHotspot = function (idx) {
      const viewerContainer = document.getElementById('panoramaViewer');
      if (viewerContainer && window._activeHotspotMousedownHandler) {
        viewerContainer.removeEventListener('mousedown', window._activeHotspotMousedownHandler, true);
      }
      window._activeHotspotMousedownHandler = null;

      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.hotspots || !room.hotspots[idx]) return;
      const hotspot = room.hotspots[idx];

      if (panoramaViewer) {
        panoramaViewer.setPitch(hotspot.pitch);
        panoramaViewer.setYaw(hotspot.yaw);
      }

      isMovingHotspot = true;
      movingHotspotIdx = idx;

      const banner = document.getElementById('hotspotMoveBanner');
      if (banner) {
        banner.style.display = 'flex';
      }

      roomsPanelCollapsed = true;
      applyRoomsPanelState();

      // Wait for Pannellum to finish re-rendering hotspot DOM after camera rotation
      setTimeout(() => {
        const el = document.querySelector(`.pnlm-custom-nav-hotspot-${idx}`);
        if (el) {
          el.classList.add('moving-active');
          el.style.cursor = 'grab';
        }
      }, 300);

      const onMouseDown = (e) => {
        const targetHotspot = e.target.closest(`.pnlm-custom-nav-hotspot-${idx}`);
        if (!targetHotspot) return;

        e.stopPropagation();
        e.preventDefault();
        
        if (activeDragMouseMoveHandler) {
          window.removeEventListener('mousemove', activeDragMouseMoveHandler, true);
        }
        if (activeDragMouseUpHandler) {
          window.removeEventListener('mouseup', activeDragMouseUpHandler, true);
        }

        let dragActive = true;
        isDraggingHotspot = true;
        targetHotspot.style.cursor = 'grabbing';

        const onMouseMove = (moveEvent) => {
          if (!dragActive || !isDraggingHotspot) return;
          moveEvent.stopPropagation();
          moveEvent.preventDefault();

          const rect = viewerContainer.getBoundingClientRect();
          const x = moveEvent.clientX - rect.left;
          const y = moveEvent.clientY - rect.top;

          const currentEl = document.querySelector(`.pnlm-custom-nav-hotspot-${idx}`);
          if (currentEl) {
            currentEl.style.setProperty('transform', `translate(${x}px, ${y}px) translate(-50%, -50%)`, 'important');
          }
        };

        const onMouseUp = (upEvent) => {
          dragActive = false;
          isDraggingHotspot = false;
          
          window.removeEventListener('mousemove', onMouseMove, true);
          window.removeEventListener('mouseup', onMouseUp, true);
          
          if (activeDragMouseMoveHandler === onMouseMove) activeDragMouseMoveHandler = null;
          if (activeDragMouseUpHandler === onMouseUp) activeDragMouseUpHandler = null;

          const coords = panoramaViewer.mouseEventToCoords(upEvent);
          if (coords && coords[0] !== undefined && coords[1] !== undefined) {
            const pitch = coords[0];
            const yaw = coords[1];
            
            const cleanPitch = Math.max(-90, Math.min(90, pitch));
            const cleanYaw = Math.max(-180, Math.min(180, yaw));

            const room = rooms.find(r => r.id === selectedRoomId);
            if (room && room.hotspots && room.hotspots[idx]) {
              room.hotspots[idx].pitch = cleanPitch;
              room.hotspots[idx].yaw = cleanYaw;
            }

            restoreNormalHotspotInViewer(idx);

            setTimeout(() => {
              const el = document.querySelector(`.pnlm-custom-nav-hotspot-${idx}`);
              if (el) {
                el.classList.add('moving-active');
                el.style.cursor = 'grab';
              }
            }, 100);
          }
        };

        activeDragMouseMoveHandler = onMouseMove;
        activeDragMouseUpHandler = onMouseUp;

        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('mouseup', onMouseUp, true);
      };

      window._activeHotspotMousedownHandler = onMouseDown;
      if (viewerContainer) {
        viewerContainer.addEventListener('mousedown', onMouseDown, true);
      }
    };

    window.finishMoveHotspot = async function () {
      if (movingHotspotIdx === null) return;
      
      const idx = movingHotspotIdx;
      
      const viewerContainer = document.getElementById('panoramaViewer');
      if (viewerContainer && window._activeHotspotMousedownHandler) {
        viewerContainer.removeEventListener('mousedown', window._activeHotspotMousedownHandler, true);
      }
      window._activeHotspotMousedownHandler = null;

      // Clean up window drag listeners if any
      if (activeDragMouseMoveHandler) {
        window.removeEventListener('mousemove', activeDragMouseMoveHandler, true);
        activeDragMouseMoveHandler = null;
      }
      if (activeDragMouseUpHandler) {
        window.removeEventListener('mouseup', activeDragMouseUpHandler, true);
        activeDragMouseUpHandler = null;
      }

      const banner = document.getElementById('hotspotMoveBanner');
      if (banner) {
        banner.style.display = 'none';
      }

      const el = document.querySelector(`.pnlm-custom-nav-hotspot-${idx}`);
      if (el) {
        el.classList.remove('moving-active');
        el.style.cursor = '';
      }

      isMovingHotspot = false;
      movingHotspotIdx = null;
      isDraggingHotspot = false;

      roomsPanelCollapsed = false;
      applyRoomsPanelState();

      await saveMovedHotspot(idx);
    };

    async function saveMovedHotspot(idx) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.hotspots || !room.hotspots[idx]) return;
      const hotspot = room.hotspots[idx];
      
      const data = {
        target: hotspot.target,
        yaw: Number(hotspot.yaw),
        pitch: Number(hotspot.pitch),
        rotation: Number(hotspot.rotation || 0),
        color: hotspot.color || '#ff0000',
        iconUrl: hotspot.iconUrl || ''
      };

      try {
        const url = `/api/admin/rooms/${selectedRoomId}/hotspots/${idx}`;
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (res.ok) {
          await loadRooms();
          renderHotspots();
          restoreNormalHotspotInViewer(idx);
        } else {
          alert('Lỗi cập nhật vị trí hotspot');
        }
      } catch (error) {
        console.error('Error saving moved hotspot:', error);
        alert('Lỗi: ' + error.message);
      }
    }
    function updateHotspotPositionInViewer(idx, pitch, yaw) {
      if (!panoramaViewer) return;
      if (!isDraggingHotspot) return; // Safety guard: only move during confirmed drag
      
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.hotspots || !room.hotspots[idx]) return;
      const hotspot = room.hotspots[idx];
      hotspot.pitch = pitch;
      hotspot.yaw = yaw;

      try {
        panoramaViewer.removeHotSpot(`hotspot-${idx}`);
      } catch (e) {}

      const targetRoom = rooms.find(r => r.id === hotspot.target);
      const tooltipText = targetRoom ? targetRoom.name : `Hotspot ${idx + 1}`;
      
      panoramaViewer.addHotSpot({
        id: `hotspot-${idx}`,
        pitch: pitch,
        yaw: yaw,
        type: 'info',
        text: tooltipText,
        cssClass: `custom-hotspot pnlm-custom-nav-hotspot pnlm-custom-nav-hotspot-${idx}`,
        createTooltipFunc: function (div) {
          let iconHtml = '📍 ';
          if (hotspot.iconUrl) {
            iconHtml = `<img src="${hotspot.iconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">`;
          } else if (customIcons && customIcons.nav_arrow) {
            iconHtml = `<img src="${customIcons.nav_arrow}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">`;
          }
          div.innerHTML = `<span style="background: #ffffff; color: #1f2937; border: 1px solid rgba(0,0,0,0.08); border-left: 4px solid ${hotspot.color || '#ff0000'}; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${iconHtml}${tooltipText}</span>`;
          
          const parent = div.parentElement;
          if (parent) {
            parent.setAttribute('data-hotspot-idx', idx);
            parent.classList.add('pnlm-custom-nav-hotspot');
            parent.classList.add('moving-active');
            parent.style.cursor = 'grab';
            applyCustomIconToHotspotElement(parent, 'nav');
          }
        },
        clickHandlerFunc: function () {
          if (isMovingHotspot) return;
          editHotspot(idx);
        }
      });
    }

    function restoreNormalHotspotInViewer(idx) {
      if (!panoramaViewer) return;
      
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.hotspots || !room.hotspots[idx]) return;
      const hotspot = room.hotspots[idx];

      try {
        panoramaViewer.removeHotSpot(`hotspot-${idx}`);
      } catch (e) {}

      const targetRoom = rooms.find(r => r.id === hotspot.target);
      const tooltipText = targetRoom ? targetRoom.name : `Hotspot ${idx + 1}`;
      
      panoramaViewer.addHotSpot({
        id: `hotspot-${idx}`,
        pitch: hotspot.pitch,
        yaw: hotspot.yaw,
        type: 'info',
        text: tooltipText,
        cssClass: `custom-hotspot pnlm-custom-nav-hotspot pnlm-custom-nav-hotspot-${idx}`,
        createTooltipFunc: function (div) {
          let iconHtml = '📍 ';
          if (hotspot.iconUrl) {
            iconHtml = `<img src="${hotspot.iconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">`;
          } else if (customIcons && customIcons.nav_arrow) {
            iconHtml = `<img src="${customIcons.nav_arrow}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">`;
          }
          div.innerHTML = `<span style="background: #ffffff; color: #1f2937; border: 1px solid rgba(0,0,0,0.08); border-left: 4px solid ${hotspot.color || '#ff0000'}; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${iconHtml}${tooltipText}</span>`;
          
          const parent = div.parentElement;
          if (parent) {
            parent.setAttribute('data-hotspot-idx', idx);
            parent.classList.add('pnlm-custom-nav-hotspot');
            applyCustomIconToHotspotElement(parent, 'nav');
          }
        },
        clickHandlerFunc: function () {
          if (isMovingHotspot) return;
          editHotspot(idx);
        }
      });
    }

    window.startMoveMediaHotspot = function (idx) {
      const viewerContainer = document.getElementById('panoramaViewer');
      if (viewerContainer && window._activeMediaHotspotMousedownHandler) {
        viewerContainer.removeEventListener('mousedown', window._activeMediaHotspotMousedownHandler, true);
      }
      window._activeMediaHotspotMousedownHandler = null;

      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.mediaHotspots || !room.mediaHotspots[idx]) return;
      const media = room.mediaHotspots[idx];

      if (panoramaViewer) {
        panoramaViewer.setPitch(media.pitch);
        panoramaViewer.setYaw(media.yaw);
      }

      isMovingMediaHotspot = true;
      movingMediaHotspotIdx = idx;

      const banner = document.getElementById('mediaHotspotMoveBanner');
      if (banner) {
        banner.style.display = 'flex';
      }

      roomsPanelCollapsed = true;
      applyRoomsPanelState();

      // Wait for Pannellum to finish re-rendering hotspot DOM after camera rotation
      setTimeout(() => {
        const el = document.querySelector(`.pnlm-custom-media-hotspot-${idx}`);
        if (el) {
          el.classList.add('moving-active');
          el.style.cursor = 'grab';
        }
      }, 300);

      const onMouseDown = (e) => {
        const targetHotspot = e.target.closest(`.pnlm-custom-media-hotspot-${idx}`);
        if (!targetHotspot) return;

        e.stopPropagation();
        e.preventDefault();

        if (activeDragMouseMoveHandler) {
          window.removeEventListener('mousemove', activeDragMouseMoveHandler, true);
        }
        if (activeDragMouseUpHandler) {
          window.removeEventListener('mouseup', activeDragMouseUpHandler, true);
        }
        
        let dragActive = true;
        isDraggingMediaHotspot = true;
        targetHotspot.style.cursor = 'grabbing';

        const onMouseMove = (moveEvent) => {
          if (!dragActive || !isDraggingMediaHotspot) return;
          moveEvent.stopPropagation();
          moveEvent.preventDefault();

          const rect = viewerContainer.getBoundingClientRect();
          const x = moveEvent.clientX - rect.left;
          const y = moveEvent.clientY - rect.top;

          const currentEl = document.querySelector(`.pnlm-custom-media-hotspot-${idx}`);
          if (currentEl) {
            currentEl.style.setProperty('transform', `translate(${x}px, ${y}px) translate(-50%, -50%)`, 'important');
          }
        };

        const onMouseUp = (upEvent) => {
          dragActive = false;
          isDraggingMediaHotspot = false;
          
          window.removeEventListener('mousemove', onMouseMove, true);
          window.removeEventListener('mouseup', onMouseUp, true);
          
          if (activeDragMouseMoveHandler === onMouseMove) activeDragMouseMoveHandler = null;
          if (activeDragMouseUpHandler === onMouseUp) activeDragMouseUpHandler = null;

          const coords = panoramaViewer.mouseEventToCoords(upEvent);
          if (coords && coords[0] !== undefined && coords[1] !== undefined) {
            const pitch = coords[0];
            const yaw = coords[1];
            
            const cleanPitch = Math.max(-90, Math.min(90, pitch));
            const cleanYaw = Math.max(-180, Math.min(180, yaw));

            const room = rooms.find(r => r.id === selectedRoomId);
            if (room && room.mediaHotspots && room.mediaHotspots[idx]) {
              room.mediaHotspots[idx].pitch = cleanPitch;
              room.mediaHotspots[idx].yaw = cleanYaw;
            }

            restoreNormalMediaHotspotInViewer(idx);

            setTimeout(() => {
              const el = document.querySelector(`.pnlm-custom-media-hotspot-${idx}`);
              if (el) {
                el.classList.add('moving-active');
                el.style.cursor = 'grab';
              }
            }, 100);
          }
        };

        activeDragMouseMoveHandler = onMouseMove;
        activeDragMouseUpHandler = onMouseUp;

        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('mouseup', onMouseUp, true);
      };

      window._activeMediaHotspotMousedownHandler = onMouseDown;
      if (viewerContainer) {
        viewerContainer.addEventListener('mousedown', onMouseDown, true);
      }
    };

    window.finishMoveMediaHotspot = async function () {
      if (movingMediaHotspotIdx === null) return;
      
      const idx = movingMediaHotspotIdx;
      
      const viewerContainer = document.getElementById('panoramaViewer');
      if (viewerContainer && window._activeMediaHotspotMousedownHandler) {
        viewerContainer.removeEventListener('mousedown', window._activeMediaHotspotMousedownHandler, true);
      }
      window._activeMediaHotspotMousedownHandler = null;

      // Clean up window drag listeners if any
      if (activeDragMouseMoveHandler) {
        window.removeEventListener('mousemove', activeDragMouseMoveHandler, true);
        activeDragMouseMoveHandler = null;
      }
      if (activeDragMouseUpHandler) {
        window.removeEventListener('mouseup', activeDragMouseUpHandler, true);
        activeDragMouseUpHandler = null;
      }

      const banner = document.getElementById('mediaHotspotMoveBanner');
      if (banner) {
        banner.style.display = 'none';
      }

      const el = document.querySelector(`.pnlm-custom-media-hotspot-${idx}`);
      if (el) {
        el.classList.remove('moving-active');
        el.style.cursor = '';
      }

      isMovingMediaHotspot = false;
      movingMediaHotspotIdx = null;
      isDraggingMediaHotspot = false;

      roomsPanelCollapsed = false;
      applyRoomsPanelState();

      await saveMovedMediaHotspot(idx);
    };

    async function saveMovedMediaHotspot(idx) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.mediaHotspots || !room.mediaHotspots[idx]) return;
      const media = room.mediaHotspots[idx];
      
      const data = {
        yaw: Number(media.yaw),
        pitch: Number(media.pitch),
        title: media.title,
        description: media.description || '',
        mediaUrl: media.mediaUrl,
        mediaType: media.mediaType,
        highlightPolygon: media.highlightPolygon
      };

      try {
        const url = `/api/admin/rooms/${selectedRoomId}/media-hotspots/${idx}`;
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const resData = await res.json();
        if (resData.success) {
          await loadRooms();
          loadMediaHotspots();
          restoreNormalMediaHotspotInViewer(idx);
        } else {
          alert('Lỗi cập nhật vị trí tư liệu');
        }
      } catch (error) {
        console.error('Error saving moved media hotspot:', error);
        alert('Lỗi: ' + error.message);
      }
    }

    function updateMediaHotspotPositionInViewer(idx, pitch, yaw) {
      if (!panoramaViewer) return;
      if (!isDraggingMediaHotspot) return; // Safety guard: only move during confirmed drag
      
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.mediaHotspots || !room.mediaHotspots[idx]) return;
      const media = room.mediaHotspots[idx];
      media.pitch = pitch;
      media.yaw = yaw;

      try {
        panoramaViewer.removeHotSpot(`media-${idx}`);
      } catch (e) {}

      const icons = { image: '🖼️', pdf: '📄', video: '🎥', '3d': '🧊', youtube: '▶️', web: '🌐', note: '📝', gallery: '📸' };
      const defaultIcon = icons[media.mediaType] || '📁';
      const customIconKey = 'media_' + media.mediaType;
      const customIconUrl = customIcons && customIcons[customIconKey];
      const iconHtml = customIconUrl 
        ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">` 
        : defaultIcon + ' ';
      const polyText = (media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3) ? ' [Vùng sáng]' : '';
      const labelText = `${media.title}${polyText}`;
      
      panoramaViewer.addHotSpot({
        id: `media-${idx}`,
        pitch: pitch,
        yaw: yaw,
        type: 'info',
        text: labelText,
        cssClass: `custom-hotspot pnlm-custom-media-hotspot pnlm-custom-media-hotspot-${idx}`,
        createTooltipFunc: function (div) {
          div.innerHTML = `<span style="background: #ffffff; color: #1f2937; border: 1px solid rgba(0,0,0,0.08); border-left: 4px solid #2196f3; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${iconHtml}${labelText}</span>`;
          
          const parent = div.parentElement;
          if (parent) {
            parent.setAttribute('data-media-idx', idx);
            parent.classList.add('pnlm-custom-media-hotspot');
            parent.classList.add('moving-active');
            parent.style.cursor = 'grab';
            applyCustomIconToHotspotElement(parent, media.mediaType);
          }
        },
        clickHandlerFunc: function () {
          if (isMovingMediaHotspot) return;
          previewMediaHotspot(idx);
        }
      });
    }

    function restoreNormalMediaHotspotInViewer(idx) {
      if (!panoramaViewer) return;
      
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.mediaHotspots || !room.mediaHotspots[idx]) return;
      const media = room.mediaHotspots[idx];

      try {
        panoramaViewer.removeHotSpot(`media-${idx}`);
      } catch (e) {}

      const icons = { image: '🖼️', pdf: '📄', video: '🎥', '3d': '🧊', youtube: '▶️', web: '🌐', note: '📝', gallery: '📸' };
      const defaultIcon = icons[media.mediaType] || '📁';
      const customIconKey = 'media_' + media.mediaType;
      const customIconUrl = customIcons && customIcons[customIconKey];
      const iconHtml = customIconUrl 
        ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">` 
        : defaultIcon + ' ';
      const polyText = (media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3) ? ' [Vùng sáng]' : '';
      const labelText = `${media.title}${polyText}`;
      
      panoramaViewer.addHotSpot({
        id: `media-${idx}`,
        pitch: media.pitch,
        yaw: media.yaw,
        type: 'info',
        text: labelText,
        cssClass: `custom-hotspot pnlm-custom-media-hotspot pnlm-custom-media-hotspot-${idx}`,
        createTooltipFunc: function (div) {
          div.innerHTML = `<span style="background: #ffffff; color: #1f2937; border: 1px solid rgba(0,0,0,0.08); border-left: 4px solid #2196f3; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${iconHtml}${labelText}</span>`;
          
          const parent = div.parentElement;
          if (parent) {
            parent.setAttribute('data-media-idx', idx);
            parent.classList.add('pnlm-custom-media-hotspot');
            applyCustomIconToHotspotElement(parent, media.mediaType);
          }
        },
        clickHandlerFunc: function () {
          if (isMovingMediaHotspot) return;
          previewMediaHotspot(idx);
        }
      });
    }

    // ===== DELETE ROOM =====
    window.deleteRoom = async function (roomId, event) {
      event.stopPropagation();

      const room = rooms.find(r => r.id === roomId);
      if (!room) return;

      const confirmed = confirm(`Xóa phòng "${room.name}"?\n\nThao tác này sẽ xóa phòng, hotspot, tiles và ảnh.`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/admin/rooms/${roomId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
          await loadRooms();

          if (selectedRoomId === roomId) {
            selectedRoomId = null;
            hotspotSection.style.display = 'none';
            selectedRoomInfo.style.display = 'block';

            if (panoramaViewer) {
              panoramaViewer.destroy();
              panoramaViewer = null;
            }
          }

          alert('Đã xóa phòng!');
        } else {
          alert('Lỗi: ' + data.error);
        }
      } catch (err) {
        console.error('Delete error:', err);
        alert('Lỗi: ' + err.message);
      }
    };

    // ===== PANORAMA VIEWER =====
    function renderAdminSensorHotspots() {
      if (!panoramaViewer) return;

      // Remove old sensor hotspots
      adminSensorHotspotIds.forEach(id => {
        try { panoramaViewer.removeHotSpot(id); } catch { }
      });
      adminSensorHotspotIds = [];

      if (!roomSensors || roomSensors.length === 0) return;

      roomSensors.forEach((sensor, idx) => {
        const yaw = Number(sensor.position?.yaw || 0);
        const pitch = Number(sensor.position?.pitch || 0);
        const isCamera = sensor.type === 'camera';
        const isWebcam = sensor.camera?.streamUrl === 'webcam://0';

        const hotspotId = `sensor-${sensor.id || idx}`;
        adminSensorHotspotIds.push(hotspotId);

        const statusText = isCamera ? (sensor.camera?.status || 'unknown') : 'online';
        const statusIcon = statusText === 'online' ? '🟢' : statusText === 'maintenance' ? '🟡' : '🔴';
        const bg = isCamera ? '#2196f3' : '#FF6B6B';

        const customIconKey = isCamera ? 'camera' : 'sensor';
        const customIconUrl = customIcons && customIcons[customIconKey];
        const defaultIcon = isCamera ? (isWebcam ? '💻' : '📹') : '🌡️';
        const iconHtml = customIconUrl
          ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;">`
          : defaultIcon + ' ';
        const labelText = `${sensor.name || (isCamera ? 'Camera' : 'Cảm biến')} ${statusIcon}`;

        panoramaViewer.addHotSpot({
          id: hotspotId,
          pitch,
          yaw,
          type: 'info',
          text: labelText,
          cssClass: 'custom-hotspot',
          createTooltipFunc: function (div) {
            div.innerHTML = `<span style="background: #ffffff; color: #1f2937; border: 1px solid rgba(0,0,0,0.08); border-left: 4px solid ${bg}; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${iconHtml}${labelText}</span>`;
            const parent = div.parentElement;
            if (parent) {
              applyCustomIconToHotspotElement(parent, isCamera ? 'camera' : 'sensor');
            }
          },
          clickHandlerFunc: function () {
            const index = roomSensors.findIndex(s => s.id === sensor.id);
            if (index !== -1) {
              editSensor(index);
            }
          }
        });
      });
    }

    function loadPanoramaPreview() {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room) return;

      const viewerContainer = document.getElementById('panoramaViewer');

      if (panoramaViewer) {
        panoramaViewer.destroy();
        panoramaViewer = null;
      }

      const imageUrl = room.image.startsWith('http') ? room.image : window.location.origin + room.image;

      panoramaViewer = pannellum.viewer('panoramaViewer', {
        type: 'equirectangular',
        panorama: imageUrl,
        autoLoad: true,
        showControls: true,
        mouseZoom: true,
        compass: false,
        hfov: 100,
        minHfov: 50,
        maxHfov: 120,
        pitch: 0,
        yaw: 0
      });

      panoramaViewer.on('load', function () {
        console.log('✅ Panorama loaded');

        // Add navigation hotspots
        if (room.hotspots && room.hotspots.length > 0) {
          room.hotspots.forEach((hotspot, idx) => {
            const targetRoom = rooms.find(r => r.id === hotspot.target);
            const tooltipText = targetRoom ? targetRoom.name : `Hotspot ${idx + 1}`;

            panoramaViewer.addHotSpot({
              id: `hotspot-${idx}`,
              pitch: hotspot.pitch,
              yaw: hotspot.yaw,
              type: 'info',
              text: tooltipText,
              cssClass: `custom-hotspot pnlm-custom-nav-hotspot pnlm-custom-nav-hotspot-${idx}`,
              createTooltipFunc: function (div) {
                let iconHtml = '📍 ';
                if (hotspot.iconUrl) {
                  iconHtml = `<img src="${hotspot.iconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">`;
                } else if (customIcons && customIcons.nav_arrow) {
                  iconHtml = `<img src="${customIcons.nav_arrow}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">`;
                }
                div.innerHTML = `<span style="background: #ffffff; color: #1f2937; border: 1px solid rgba(0,0,0,0.08); border-left: 4px solid ${hotspot.color || '#ff0000'}; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${iconHtml}${tooltipText}</span>`;
                
                const parent = div.parentElement;
                if (parent) {
                  parent.setAttribute('data-hotspot-idx', idx);
                  parent.classList.add('pnlm-custom-nav-hotspot');
                  if (isMovingHotspot && movingHotspotIdx === idx) {
                    parent.classList.add('moving-active');
                    parent.style.cursor = 'grab';
                  }
                  applyCustomIconToHotspotElement(parent, 'nav');
                }
              },
              clickHandlerFunc: function () {
                if (isMovingHotspot) return;
                console.log('Clicked hotspot', idx);
                editHotspot(idx);
              }
            });

            console.log(`Added hotspot ${idx}: Yaw=${hotspot.yaw}°, Pitch=${hotspot.pitch}°`);
          });
          console.log(`✅ Added ${room.hotspots.length} hotspots`);
        }

        // Add media hotspots
        window.savedPolygonAnchors = [];
        if (window.syncSavedPolygonRaf) cancelAnimationFrame(window.syncSavedPolygonRaf);

        if (room.mediaHotspots && room.mediaHotspots.length > 0) {
          room.mediaHotspots.forEach((media, idx) => {
            const icons = { image: '🖼️', pdf: '📄', video: '🎥', '3d': '🧊', youtube: '▶️', web: '🌐', note: '📝', gallery: '📸' };
            const defaultIcon = icons[media.mediaType] || '📁';
            const customIconKey = 'media_' + media.mediaType;
            const customIconUrl = customIcons && customIcons[customIconKey];
            const iconHtml = customIconUrl 
              ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">` 
              : defaultIcon + ' ';
            const polyText = (media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3) ? ' [Vùng sáng]' : '';
            const labelText = `${media.title}${polyText}`;

            panoramaViewer.addHotSpot({
              id: `media-${idx}`,
              pitch: media.pitch,
              yaw: media.yaw,
              type: 'info',
              text: labelText,
              cssClass: `custom-hotspot pnlm-custom-media-hotspot pnlm-custom-media-hotspot-${idx}`,
              createTooltipFunc: function (div) {
                div.innerHTML = `<span style="background: #ffffff; color: #1f2937; border: 1px solid rgba(0,0,0,0.08); border-left: 4px solid #2196f3; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${iconHtml}${labelText}</span>`;
                
                const parent = div.parentElement;
                if (parent) {
                  parent.setAttribute('data-media-idx', idx);
                  parent.classList.add('pnlm-custom-media-hotspot');
                  if (isMovingMediaHotspot && movingMediaHotspotIdx === idx) {
                    parent.classList.add('moving-active');
                    parent.style.cursor = 'grab';
                  }
                  applyCustomIconToHotspotElement(parent, media.mediaType);
                }
              },
              clickHandlerFunc: function () {
                if (isMovingMediaHotspot) return;
                previewMediaHotspot(idx);
              }
            });

            console.log(`Added media hotspot ${idx}: ${labelText}`);

            if (media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3) {
               const anchors = [];
               media.highlightPolygon.forEach((pt, ptIdx) => {
                  panoramaViewer.addHotSpot({
                     id: `poly-anchor-${idx}-${ptIdx}`,
                     pitch: pt[1],
                     yaw: pt[0],
                     type: 'info',
                     cssClass: 'hidden-poly-anchor',
                     createTooltipFunc: function(div) {
                        div.style.opacity = '0'; // Invisible but takes space for rect
                        div.style.pointerEvents = 'none';
                        div.style.width = '1px';
                        div.style.height = '1px';
                        anchors.push(div);
                     }
                  });
               });
               window.savedPolygonAnchors.push({ anchors: anchors });
            }
          });
          console.log(`✅ Added ${room.mediaHotspots.length} media hotspots`);
          
          let svgSaved = document.getElementById('adminSavedPolygonsOverlay');
          if (!svgSaved) {
             const viewerNode = document.getElementById('panoramaViewer');
             svgSaved = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
             svgSaved.id = 'adminSavedPolygonsOverlay';
             svgSaved.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5;';
             viewerNode.appendChild(svgSaved);
          }
          
          function syncSavedPolygons() {
             const viewerNode = document.getElementById('panoramaViewer');
             const svgLayer = document.getElementById('adminSavedPolygonsOverlay');
             if (!viewerNode || !svgLayer) return;
             const viewerRect = viewerNode.getBoundingClientRect();
             
             let html = '';
             window.savedPolygonAnchors.forEach(item => {
                let pts = [];
                let valid = true;
                for (let i = 0; i < item.anchors.length; i++) {
                   const div = item.anchors[i];
                   if (!div || div.style.display === 'none') { valid = false; break; }
                   const rect = div.getBoundingClientRect();
                   const x = rect.left - viewerRect.left + rect.width / 2;
                   const y = rect.top - viewerRect.top + rect.height / 2;
                   pts.push(`${x},${y}`);
                }
                if (valid && pts.length >= 3) {
                   html += `<polygon points="${pts.join(' ')}" fill="rgba(80, 80, 200, 0.4)" stroke="rgba(100, 150, 255, 0.8)" stroke-width="2" stroke-linejoin="round" style="pointer-events: none;" />`;
                }
             });
             svgLayer.innerHTML = html;
             window.syncSavedPolygonRaf = requestAnimationFrame(syncSavedPolygons);
          }
          window.syncSavedPolygonRaf = requestAnimationFrame(syncSavedPolygons);
        }

        // Add mail hotspots
        if (room.mailHotspots && room.mailHotspots.length > 0) {
          room.mailHotspots.forEach((mail, idx) => {
            if (mail.yaw !== undefined && mail.pitch !== undefined) {
              const label = `✉️ ${mail.title} -> ${mail.recipient}`;
              panoramaViewer.addHotSpot({
                id: `mail-${idx}`,
                pitch: mail.pitch,
                yaw: mail.yaw,
                type: 'info',
                text: label,
                cssClass: 'custom-hotspot',
                createTooltipFunc: function (div) {
                  div.innerHTML = `<span style="background: #e67e22; color: white; padding: 8px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap;">${label}</span>`;
                },
                clickHandlerFunc: function () {
                  editMailHotspot(idx);
                }
              });
            }
          });
          console.log(`✅ Added ${room.mailHotspots.length} mail hotspots`);
        }

        // Add sensor/camera hotspots on admin panorama
        renderAdminSensorHotspots();
      });

      // Add mousemove tracking for Polygon Draft Line
      panoramaViewer.getContainer().addEventListener('mousemove', function(e) {
        if (!isPolygonDrawMode || polygonDrawSubMode !== 'add') return;
        const draftLine = document.getElementById('adminPolygonDraftLine');
        if (!draftLine) return;
        const viewerRect = panoramaViewer.getContainer().getBoundingClientRect();
        const mouseX = e.clientX - viewerRect.left;
        const mouseY = e.clientY - viewerRect.top;

        if (polygonPoints.length > 0) {
          const lastPt = polygonPoints[polygonPoints.length - 1];
          const screen = yawPitchToScreen(lastPt[0], lastPt[1]);
          if (screen) {
            draftLine.setAttribute('x1', screen.x);
            draftLine.setAttribute('y1', screen.y);
            draftLine.setAttribute('x2', mouseX);
            draftLine.setAttribute('y2', mouseY);
            draftLine.style.display = 'block';
            return;
          }
        }
        draftLine.style.display = 'none';
      });

      panoramaViewer.on('mousedown', function (event) {
        if (event.target && (
          event.target.closest('.custom-hotspot') || 
          event.target.closest('.pnlm-hotspot') ||
          event.target.closest('.pnlm-custom-nav-hotspot') || 
          event.target.closest('.pnlm-custom-media-hotspot')
        )) {
          return;
        }
        if (event.button === 0) {
          const coords = panoramaViewer.mouseEventToCoords(event);
          setTimeout(() => {
            if (coords && coords[0] !== undefined && coords[1] !== undefined) {
              const pitch = coords[0];
              const yaw = coords[1];

              // Polygon drawing mode — intercept click before other modes
              if (isPolygonDrawMode) {
                if (polygonDrawSubMode === 'add') {
                  // Don't add point if clicking on an existing SVG anchor circle
                  const target = event.target;
                  const isOnAnchor = target && (
                    target.closest && target.closest('#adminPolygonAnchors') ||
                    target.closest && target.closest('#adminPolygonMidpoints')
                  );
                  if (!isOnAnchor) {
                    handlePolygonClick(pitch, yaw);
                  }
                }
                return;
              }

              // Add media hotspot via click
              if (addMediaMode) {
                closeAllFeatureModals('mediaHotspotModal');
                
                // Reset state for new creation to prevent overwriting previous media hotspot
                editingMediaHotspotIndex = null;
                document.getElementById('mediaHotspotForm').reset();
                selectedMediaFile = null;
                document.getElementById('mediaFileInfo').textContent = '';
                document.getElementById('mediaUrl').value = '';
                delete document.getElementById('mediaHotspotForm').dataset.existingMediaUrl;

                // Reset modal header
                const modal = document.getElementById('mediaHotspotModal');
                const modalHeader = modal.querySelector('.modal-header h3');
                if (modalHeader) modalHeader.textContent = '📁 Thêm Tư liệu';

                document.getElementById('mediaYaw').value = yaw.toFixed(2);
                document.getElementById('mediaPitch').value = pitch.toFixed(2);
                document.getElementById('mediaHotspotModal').classList.add('active');
                setAddMediaMode(false);
                return;
              }

              // Pick sensor/camera position via click
              if (addSensorPositionMode) {
                setAddSensorPositionMode(false);
                openSensorModalAtPosition(yaw, pitch);
                return;
              }

              // Add mail hotspot position via click
              if (typeof addMailMode !== 'undefined' && addMailMode) {
                closeAllFeatureModals('mailHotspotModal');
                document.getElementById('mailYaw').value = yaw.toFixed(2);
                document.getElementById('mailPitch').value = pitch.toFixed(2);
                document.getElementById('mailHotspotModal').classList.add('active');
                addMailMode = false;
                return;
              }

              // Add navigation hotspot via click
              if (addHotspotMode) {
                closeAllFeatureModals('hotspotModal');
                editingHotspotIndex = null;
                modalTitle.textContent = 'Thêm Hotspot (từ ảnh)';
                document.getElementById('targetRoom').value = '';
                document.getElementById('yaw').value = yaw.toFixed(2);
                document.getElementById('pitch').value = pitch.toFixed(2);
                document.getElementById('rotation').value = 0;
                document.getElementById('color').value = '#ff0000';
                colorPicker.value = '#ff0000';
                if (hotspotIconUrlInput) hotspotIconUrlInput.value = '';
                selectedHotspotIconFile = null;
                if (hotspotIconFileInput) hotspotIconFileInput.value = '';
                if (hotspotIconFileInfo) hotspotIconFileInfo.textContent = '';
                hotspotModal.classList.add('active');
                setAddHotspotMode(false);
              }
            }
          }, 50);
        }
      });
    }


    // ===== ADD MODE FUNCTIONS =====
    function setAddHotspotMode(on) {
      addHotspotMode = on;
      if (addHotspotMode) addMediaMode = false;
      updateAddHotspotButton();
      updateAddMediaButton();
    }

    function updateAddHotspotButton() {
      if (addHotspotMode) {
        addHotspotBtn.textContent = '🎯 Click ảnh';
        addHotspotBtn.style.background = '#27ae60';
      } else {
        addHotspotBtn.textContent = '➕ Di chuyển';
        addHotspotBtn.style.background = '';
      }

    }

    if (addHotspotBtn) {
      addHotspotBtn.addEventListener('click', () => {
        setAddHotspotMode(!addHotspotMode);
      });
    }

    if (hotspotIconFileInput) {
      hotspotIconFileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0] || null;
        selectedHotspotIconFile = file;
        if (hotspotIconFileInfo) {
          hotspotIconFileInfo.textContent = file
            ? `${file.name} (${(file.size / 1024).toFixed(1)} KB) - sẽ upload khi lưu`
            : '';
        }
      });
    }

    // Color picker
    if (colorPicker) {
      colorPicker.addEventListener('change', (e) => {
        document.getElementById('color').value = e.target.value;
      });
    }

    const colorSwatches = document.querySelectorAll('.color-swatch');
    colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.getAttribute('data-color');
        if (color) {
          document.getElementById('color').value = color;
          colorPicker.value = color;
        }
      });
    });

    /* ===== MEDIA HOTSPOT FUNCTIONS ===== */
    function closeMediaHotspotModal() {
      document.getElementById('mediaHotspotModal').classList.remove('active');
      document.getElementById('mediaHotspotForm').reset();
      selectedMediaFile = null;
      editingMediaHotspotIndex = null;
      document.getElementById('mediaFileInfo').textContent = '';
      delete document.getElementById('mediaHotspotForm').dataset.existingMediaUrl;

      // Reset modal header to default
      const modal = document.getElementById('mediaHotspotModal');
      const modalHeader = modal.querySelector('.modal-header h3');
      modalHeader.textContent = '📁 Thêm Tư liệu';

      // Reset polygon drawing
      if (typeof clearPolygon === 'function') clearPolygon();
      isPolygonDrawMode = false;
      const polyBtn = document.getElementById('polygonDrawBtn');
      if (polyBtn) { polyBtn.textContent = '✏️ Bắt đầu vẽ'; polyBtn.style.background = '#3498db'; }
      const polyStatus = document.getElementById('polygonStatus');
      if (polyStatus) polyStatus.textContent = '';
      const polySection = document.getElementById('polygonHighlightSection');
      if (polySection) polySection.style.display = 'none';
      
      // Hide floating finish button
      const finishBtn = document.getElementById('floatingFinishDrawBtn');
      if (finishBtn) finishBtn.style.display = 'none';
      
      const svgOverlay = document.getElementById('adminPolygonOverlay');
      if (svgOverlay) svgOverlay.style.display = 'none';
      if (window.syncPolygonRaf) cancelAnimationFrame(window.syncPolygonRaf);
    }

    /* ===== POLYGON DRAWING ===== */
    window.syncPolygonRaf = null;
    let draggingPolyIdx = -1;

    /**
     * Convert spherical (yaw, pitch) degrees → screen (x, y) pixels
     * using Pannellum rectilinear projection.
     */
    function yawPitchToScreen(yaw, pitch) {
      if (!panoramaViewer) return null;
      const viewerNode = document.getElementById('panoramaViewer');
      if (!viewerNode) return null;
      const rect = viewerNode.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      const cYaw   = panoramaViewer.getYaw();
      const cPitch = panoramaViewer.getPitch();
      const hfov   = panoramaViewer.getHfov();
      const f = (W / 2) / Math.tan((hfov / 2) * Math.PI / 180);
      const dyRad = (yaw   - cYaw)   * Math.PI / 180;
      const dpRad = (pitch - cPitch) * Math.PI / 180;
      const cosDy = Math.cos(dyRad);
      const sx = W / 2 + f * Math.tan(dyRad);
      const sy = H / 2 - f * Math.tan(dpRad) / cosDy;
      const visible = Math.abs(dyRad) < Math.PI / 2;
      return { x: sx, y: sy, visible };
    }

    function syncPolygonLoop() {
      if (!isPolygonDrawMode) { window.syncPolygonRaf = null; return; }
      const viewerNode = document.getElementById('panoramaViewer');
      if (!viewerNode) { window.syncPolygonRaf = requestAnimationFrame(syncPolygonLoop); return; }

      // Project all polygon points to screen
      const pts = polygonPoints.map(([yaw, pitch]) => yawPitchToScreen(yaw, pitch)).filter(Boolean);

      // Draw filled polygon shape
      const polygon = document.getElementById('adminPolygonShape');
      if (polygon) {
        polygon.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
      }

      // Draw anchor circles
      const anchorsGroup = document.getElementById('adminPolygonAnchors');
      if (anchorsGroup) {
        while (anchorsGroup.firstChild) anchorsGroup.removeChild(anchorsGroup.firstChild);
        pts.forEach((p, i) => {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', p.x);
          circle.setAttribute('cy', p.y);
          circle.setAttribute('r', '9');
          circle.setAttribute('fill', i === draggingPolyIdx ? '#e74c3c' : '#2563eb');
          circle.setAttribute('stroke', '#ffffff');
          circle.setAttribute('stroke-width', '2.5');
          circle.style.cursor = polygonDrawSubMode === 'edit' ? 'grab' : 'default';
          circle.style.pointerEvents = polygonDrawSubMode === 'pan' ? 'none' : 'auto';
          circle.style.opacity = polygonDrawSubMode === 'pan' ? '0.4' : '1';

          const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          label.setAttribute('x', p.x);
          label.setAttribute('y', p.y + 4);
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('fill', 'white');
          label.setAttribute('font-size', '10');
          label.setAttribute('font-weight', 'bold');
          label.style.pointerEvents = 'none';
          label.textContent = i + 1;

          circle.addEventListener('mousedown', function(e) {
            if (polygonDrawSubMode !== 'edit') return;
            e.stopPropagation(); e.preventDefault();
            draggingPolyIdx = i;
            const onMove = (me) => {
              if (draggingPolyIdx < 0) return;
              me.stopPropagation(); me.preventDefault();
              const coords = panoramaViewer.mouseEventToCoords(me);
              if (coords && coords[0] !== undefined) {
                polygonPoints[draggingPolyIdx] = [coords[1], coords[0]];
              }
            };
            const onUp = () => {
              draggingPolyIdx = -1;
              window.removeEventListener('mousemove', onMove, true);
              window.removeEventListener('mouseup', onUp, true);
            };
            window.addEventListener('mousemove', onMove, true);
            window.addEventListener('mouseup', onUp, true);
          });

          circle.addEventListener('contextmenu', function(e) {
            if (polygonDrawSubMode !== 'edit') return;
            e.preventDefault(); e.stopPropagation();
            polygonPoints.splice(i, 1);
            const status = document.getElementById('polygonStatus');
            if (status) status.textContent = polygonPoints.length > 0
              ? `✏️ Đã xoá. Còn ${polygonPoints.length} điểm.`
              : 'Chưa có điểm nào.';
          });

          anchorsGroup.appendChild(circle);
          anchorsGroup.appendChild(label);
        });
      }

      // Draw midpoint anchors in edit mode (≥2 points)
      const midpointsGroup = document.getElementById('adminPolygonMidpoints');
      if (midpointsGroup) {
        while (midpointsGroup.firstChild) midpointsGroup.removeChild(midpointsGroup.firstChild);
        if (polygonDrawSubMode === 'edit' && pts.length >= 2) {
          const len = pts.length;
          const segCount = len >= 3 ? len : len - 1;
          for (let i = 0; i < segCount; i++) {
            const p1 = pts[i], p2 = pts[(i + 1) % len];
            const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
            const mc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            mc.setAttribute('cx', midX); mc.setAttribute('cy', midY);
            mc.setAttribute('r', '5');
            mc.setAttribute('fill', 'rgba(37,99,235,0.5)');
            mc.setAttribute('stroke', '#ffffff'); mc.setAttribute('stroke-width', '1.5');
            mc.style.cursor = 'crosshair'; mc.style.pointerEvents = 'auto';
            mc.title = 'Kéo để chèn điểm mới';
            mc.addEventListener('mousedown', (e) => {
              e.stopPropagation(); e.preventDefault();
              const viewerRect = viewerNode.getBoundingClientRect();
              const coords = panoramaViewer.mouseEventToCoords({ clientX: viewerRect.left + midX, clientY: viewerRect.top + midY });
              if (coords && coords[0] !== undefined) {
                polygonPoints.splice(i + 1, 0, [coords[1], coords[0]]);
                draggingPolyIdx = i + 1;
                const onMove = (me) => {
                  if (draggingPolyIdx < 0) return;
                  me.stopPropagation(); me.preventDefault();
                  const c = panoramaViewer.mouseEventToCoords(me);
                  if (c && c[0] !== undefined) polygonPoints[draggingPolyIdx] = [c[1], c[0]];
                };
                const onUp = () => {
                  draggingPolyIdx = -1;
                  window.removeEventListener('mousemove', onMove, true);
                  window.removeEventListener('mouseup', onUp, true);
                };
                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('mouseup', onUp, true);
              }
            });
            midpointsGroup.appendChild(mc);
          }
        }
      }

      window.syncPolygonRaf = requestAnimationFrame(syncPolygonLoop);
    }

    function handlePolygonKeyDown(e) {
      if (!isPolygonDrawMode) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        clearPolygon();
        togglePolygonDrawMode();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        togglePolygonDrawMode();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoPolygonPoint();
      }
    }

    function setPolygonDrawSubMode(mode) {
      polygonDrawSubMode = mode;
      
      // Update button active states on toolbar
      ['add', 'edit', 'pan'].forEach(m => {
        const btn = document.getElementById(`poly-mode-${m}`);
        if (btn) {
          if (m === mode) {
            btn.style.background = '#2563eb';
            btn.style.boxShadow = '0 0 8px rgba(37,99,235,0.5)';
            btn.style.borderColor = '#ffffff';
          } else {
            btn.style.background = 'transparent';
            btn.style.boxShadow = 'none';
            btn.style.borderColor = 'rgba(255,255,255,0.2)';
          }
        }
      });
      
      // Update status text
      const status = document.getElementById('polygonStatus');
      if (status) {
        if (mode === 'add') {
          status.textContent = `✏️ Chế độ: THÊM ĐIỂM. Click trên ảnh 360 để vẽ. Đã có ${polygonPoints.length} điểm. (Enter: Xong, Esc: Huỷ, Ctrl+Z: Undo)`;
        } else if (mode === 'edit') {
          status.textContent = `✏️ Chế độ: CHỈNH SỬA. Kéo thả các điểm hoặc kéo trung điểm mờ để thêm. (Enter: Xong, Esc: Huỷ, Ctrl+Z: Undo)`;
        } else if (mode === 'pan') {
          status.textContent = `✏️ Chế độ: XOAY (XEM). Kéo thả ảnh 360 để xem toàn cảnh. (Enter: Xong, Esc: Huỷ)`;
        }
      }
      
      // Hide draft line when not adding points
      if (mode !== 'add') {
        const draftLine = document.getElementById('adminPolygonDraftLine');
        if (draftLine) draftLine.style.display = 'none';
      }

      // SVG RAF loop handles rendering — no explicit redraw needed
    }
    window.setPolygonDrawSubMode = setPolygonDrawSubMode;

    function togglePolygonDrawMode() {
      isPolygonDrawMode = !isPolygonDrawMode;
      const btn = document.getElementById('polygonDrawBtn');
      const status = document.getElementById('polygonStatus');
      const modal = document.getElementById('mediaHotspotModal');
      
      if (isPolygonDrawMode) {
        // Change button state
        btn.textContent = '✏️ Đang vẽ (Click Xong phía trên)';
        btn.style.background = '#e74c3c';
        
        // Hide modal so user can click panorama
        modal.classList.remove('active');
        
        // Show floating finish button on panorama
        let finishBtn = document.getElementById('floatingFinishDrawBtn');
        if (!finishBtn) {
          finishBtn = document.createElement('button');
          finishBtn.id = 'floatingFinishDrawBtn';
          finishBtn.innerHTML = '✅ Lưu vùng vẽ & Trở lại form';
          finishBtn.className = 'btn';
          finishBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; z-index: 10000; background: #e74c3c; color: white; margin: 0; box-shadow: 0 4px 15px rgba(0,0,0,0.4); padding: 10px 16px; border-radius: 8px; font-weight: bold; font-size: 14px;';
          finishBtn.onclick = togglePolygonDrawMode;
          finishBtn.addEventListener('mousedown', (e) => e.stopPropagation());
          document.getElementById('panoramaViewer').appendChild(finishBtn);
        }
        finishBtn.style.display = 'block';

        // Show floating mode selector toolbar
        let toolbar = document.getElementById('polygonDrawToolbar');
        if (!toolbar) {
          toolbar = document.createElement('div');
          toolbar.id = 'polygonDrawToolbar';
          toolbar.style.cssText = 'position: absolute; top: 75px; right: 15px; z-index: 10000; display: flex; gap: 8px; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
          toolbar.addEventListener('mousedown', (e) => e.stopPropagation());
          
          const modes = [
            { id: 'add', icon: '➕', text: 'Thêm điểm' },
            { id: 'edit', icon: '✏️', text: 'Sửa điểm' },
            { id: 'pan', icon: '🖐️', text: 'Xoay (Xem)' }
          ];
          
          modes.forEach(m => {
            const modeBtn = document.createElement('button');
            modeBtn.type = 'button';
            modeBtn.id = `poly-mode-${m.id}`;
            modeBtn.innerHTML = `${m.icon} ${m.text}`;
            modeBtn.style.cssText = 'margin:0; padding:6px 12px; font-size:12px; border-radius:5px; border:1px solid rgba(255,255,255,0.2); color:white; cursor:pointer; font-weight:600; transition:all 0.15s ease; background:transparent; outline:none;';
            modeBtn.onclick = () => setPolygonDrawSubMode(m.id);
            modeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            toolbar.appendChild(modeBtn);
          });
          
          document.getElementById('panoramaViewer').appendChild(toolbar);
        }
        toolbar.style.display = 'flex';
        
        let svgOverlay = document.getElementById('adminPolygonOverlay');
        if (!svgOverlay) {
          const viewerNode = document.getElementById('panoramaViewer');
          viewerNode.style.position = 'relative';
          
          svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgOverlay.id = 'adminPolygonOverlay';
          svgOverlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;';
          
          const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          polygon.id = 'adminPolygonShape';
          polygon.setAttribute('fill', 'rgba(37, 99, 235, 0.2)');
          polygon.setAttribute('stroke', '#2563eb');
          polygon.setAttribute('stroke-width', '2');
          polygon.setAttribute('stroke-linejoin', 'round');
          
          const draftLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          draftLine.id = 'adminPolygonDraftLine';
          draftLine.setAttribute('stroke', 'rgba(37, 99, 235, 0.85)');
          draftLine.setAttribute('stroke-width', '2');
          draftLine.setAttribute('stroke-dasharray', '4');
          draftLine.style.display = 'none';

          const anchorsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          anchorsGroup.id = 'adminPolygonAnchors';

          const midpointsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          midpointsGroup.id = 'adminPolygonMidpoints';
 
          svgOverlay.appendChild(polygon);
          svgOverlay.appendChild(draftLine);
          svgOverlay.appendChild(anchorsGroup);
          svgOverlay.appendChild(midpointsGroup);
          viewerNode.appendChild(svgOverlay);
        }
        svgOverlay.style.display = 'block';
        
        // Set default drawing sub-mode based on current points
        setPolygonDrawSubMode(polygonPoints.length === 0 ? 'add' : 'edit');
        
        window.addEventListener('keydown', handlePolygonKeyDown);
        window.syncPolygonRaf = requestAnimationFrame(syncPolygonLoop);
        
      } else {
        // Change button state
        btn.textContent = '✏️ Sửa vùng vẽ';
        btn.style.background = '#3498db';
        status.textContent = polygonPoints.length > 0 ? `✅ ${polygonPoints.length} điểm đã lưu.` : '';
        
        // Restore modal
        modal.classList.add('active');
        
        // Hide floating finish button & toolbar
        const finishBtn = document.getElementById('floatingFinishDrawBtn');
        if (finishBtn) finishBtn.style.display = 'none';
        
        const toolbar = document.getElementById('polygonDrawToolbar');
        if (toolbar) toolbar.remove();
        
        const svgOverlay = document.getElementById('adminPolygonOverlay');
        if (svgOverlay) svgOverlay.style.display = 'none';
        const draftLine = document.getElementById('adminPolygonDraftLine');
        if (draftLine) draftLine.style.display = 'none';
        window.removeEventListener('keydown', handlePolygonKeyDown);
        if (window.syncPolygonRaf) cancelAnimationFrame(window.syncPolygonRaf);
      }
    }
    window.togglePolygonDrawMode = togglePolygonDrawMode;

    function handlePolygonClick(pitch, yaw) {
      polygonPoints.push([yaw, pitch]);
      const status = document.getElementById('polygonStatus');
      if (status) status.textContent = `✏️ ${polygonPoints.length} điểm. Tiếp tục click để thêm.`;
    }

    function updatePolygonPreviewHotspots() {
      // SVG RAF loop (syncPolygonLoop) handles all rendering — this is intentionally a no-op.
    }

    function undoPolygonPoint() {
      polygonPoints.pop();
      const status = document.getElementById('polygonStatus');
      if (status) status.textContent = polygonPoints.length > 0 ? `${polygonPoints.length} điểm còn lại.` : 'Chưa có điểm nào.';
    }
    window.undoPolygonPoint = undoPolygonPoint;

    function clearPolygon() {
      polygonPoints = [];
      const status = document.getElementById('polygonStatus');
      if (status) status.textContent = '';
    }
    window.clearPolygon = clearPolygon;

    function updateMediaUploadHint() {
      const type = document.getElementById('mediaType').value;
      const hint = document.getElementById('mediaUploadHint');
      const fileInput = document.getElementById('mediaFileInput');
      const fileSection = document.getElementById('fileUploadSection');
      const linkSection = document.getElementById('linkInputSection');
      const mediaUrlInput = document.getElementById('mediaUrl');

      // Hide both sections first
      fileSection.style.display = 'none';
      linkSection.style.display = 'none';

      // Show/hide polygon section for 3d type
      const polySection = document.getElementById('polygonHighlightSection');
      if (polySection) polySection.style.display = (type === '3d') ? 'block' : 'none';
      if (type !== '3d') { polygonPoints = []; isPolygonDrawMode = false; }

      const hints = {
        'image': { text: '🖼️ Chọn ảnh', accept: 'image/*' },
        'pdf': { text: '📄 Chọn PDF', accept: '.pdf' },
        'video': { text: '🎥 Chọn video', accept: 'video/*' },
        '3d': { text: '🎮 Chọn 3D', accept: '.glb,.gltf' }
      };

      if (type === 'youtube' || type === 'facebook' || type === 'web') {
        // Show link input section
        linkSection.style.display = 'block';
        if (type === 'youtube') {
          mediaUrlInput.placeholder = 'https://www.youtube.com/watch?v=... hoặc https://youtu.be/...';
        } else if (type === 'facebook') {
          mediaUrlInput.placeholder = 'https://www.facebook.com/watch/?v=... hoặc link bài đăng Facebook';
        } else if (type === 'web') {
          mediaUrlInput.placeholder = 'https://example.com - Nhập URL trang web';
        }
      } else if (type === 'note') {
        // For notes, don't show file or link section - description is enough
        // Note: nothing to show, just let user fill in description
      } else {
        // Show file upload section
        fileSection.style.display = 'block';
        if (hints[type]) {
          hint.textContent = hints[type].text;
          fileInput.accept = hints[type].accept;
        }
      }
    }

    function handleMediaFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;

      selectedMediaFile = file;
      document.getElementById('mediaFileInfo').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    }

    const mediaForm = document.getElementById('mediaHotspotForm');
    if (mediaForm) {
      mediaForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const mediaType = document.getElementById('mediaType').value;

        if (!selectedRoomId) {
          alert('Vui lòng chọn phòng');
          return;
        }

        let mediaUrl = null;

        try {
          // Handle YouTube/Facebook/Web links
          if (mediaType === 'youtube' || mediaType === 'facebook' || mediaType === 'web') {
            mediaUrl = document.getElementById('mediaUrl').value.trim();
            if (!mediaUrl) {
              alert('Vui lòng nhập URL');
              return;
            }
          } else if (mediaType === 'note') {
            // For notes, use the description as mediaUrl (we'll use it as note content)
            // Description is optional - can be empty
            const description = document.getElementById('mediaDescription').value.trim();
            mediaUrl = description || ''; // Allow empty notes
          } else {
            // Handle file upload
            if (editingMediaHotspotIndex !== null && !selectedMediaFile) {
              mediaUrl = mediaForm.dataset.existingMediaUrl;
            } else if (!selectedMediaFile) {
              alert('Vui lòng chọn file');
              return;
            }

            // Upload new media file if provided
            if (selectedMediaFile) {
              const formData = new FormData();
              formData.append('media', selectedMediaFile);

              const uploadRes = await fetch('/api/admin/media/upload', {
                method: 'POST',
                body: formData
              });

              const contentType = uploadRes.headers.get('content-type') || '';
              if (!contentType.includes('application/json')) {
                const errorText = await uploadRes.text();
                throw new Error(`Upload thất bại (${uploadRes.status}): ${errorText.slice(0, 150)}`);
              }

              const uploadData = await uploadRes.json();
              if (!uploadRes.ok || !uploadData.success) {
                throw new Error(uploadData.error || `Upload thất bại (${uploadRes.status})`);
              }

              mediaUrl = uploadData.media.url;
            }
          }

          // Prepare media hotspot data
          const mediaHotspot = {
            yaw: parseFloat(document.getElementById('mediaYaw').value),
            pitch: parseFloat(document.getElementById('mediaPitch').value),
            title: document.getElementById('mediaTitle').value,
            description: document.getElementById('mediaDescription').value,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            highlightPolygon: (mediaType === '3d' && polygonPoints.length >= 3) ? polygonPoints.map(p => [...p]) : null
          };

          // Add or update
          let url = `/api/admin/rooms/${selectedRoomId}/media-hotspots`;
          let method = 'POST';

          if (editingMediaHotspotIndex !== null) {
            url += `/${editingMediaHotspotIndex}`;
            method = 'PATCH';
          }

          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mediaHotspot)
          });

          const data = await res.json();

          if (data.success) {
            document.getElementById('mediaHotspotModal').classList.remove('active');
            mediaForm.reset();
            selectedMediaFile = null;
            editingMediaHotspotIndex = null;
            document.getElementById('mediaFileInfo').textContent = '';
            document.getElementById('mediaUrl').value = '';
            delete mediaForm.dataset.existingMediaUrl;

            // --- Reset Polygon State ---
            if (typeof clearPolygon === 'function') clearPolygon();
            isPolygonDrawMode = false;
            const polyBtn = document.getElementById('polygonDrawBtn');
            if (polyBtn) { polyBtn.textContent = '✏️ Bắt đầu vẽ'; polyBtn.style.background = '#3498db'; }
            const polyStatus = document.getElementById('polygonStatus');
            if (polyStatus) polyStatus.textContent = '';
            const finishBtn = document.getElementById('floatingFinishDrawBtn');
            if (finishBtn) finishBtn.style.display = 'none';
            const svgOverlay = document.getElementById('adminPolygonOverlay');
            if (svgOverlay) svgOverlay.style.display = 'none';
            if (window.syncPolygonRaf) cancelAnimationFrame(window.syncPolygonRaf);
            // ---------------------------

            // Reset modal header to default
            const modal = document.getElementById('mediaHotspotModal');
            const modalHeader = modal.querySelector('.modal-header h3');
            modalHeader.textContent = '📁 Thêm Tư liệu';

            // Refresh room data so panorama has latest media hotspots
            await loadRooms();
            loadMediaHotspots();
            loadPanoramaPreview();
            alert('✅ ' + (method === 'PATCH' ? 'Cập nhật thành công!' : 'Đã thêm tư liệu!'));
          } else {
            alert('Lỗi: ' + data.error);
          }
        } catch (err) {
          console.error(err);
          alert('Lỗi: ' + err.message);
        }
      });
    }

    async function loadMediaHotspots() {
      if (!selectedRoomId) return;

      try {
        const res = await fetch(`/api/admin/rooms/${selectedRoomId}/media-hotspots`);
        const data = await res.json();

        if (data.success && data.mediaHotspots && data.mediaHotspots.length > 0) {
          renderMediaHotspots(data.mediaHotspots);
        } else {
          // Fallback to local room data if Supabase returns nothing or is empty
          const room = rooms.find(r => r.id === selectedRoomId);
          renderMediaHotspots(room?.mediaHotspots || []);
        }
      } catch (err) {
        console.error('Load media error:', err);
        // Fallback to local room data on error
        const room = rooms.find(r => r.id === selectedRoomId);
        renderMediaHotspots(room?.mediaHotspots || []);
      }
    }

    function renderMediaHotspots(mediaHotspots) {
      const list = document.getElementById('mediaHotspotsList');
      const countLabel = document.getElementById('mediaCountLabel');
      if (countLabel) countLabel.textContent = `${(mediaHotspots || []).length} tư liệu`;

      if (!mediaHotspots || mediaHotspots.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Chưa có tư liệu</p></div>';
        return;
      }

      const icons = { image: '🖼️', pdf: '📄', video: '🎥', '3d': '🧊', youtube: '▶️', facebook: '👍', web: '🌐', note: '📝', gallery: '📸' };

      list.innerHTML = mediaHotspots.map((media, idx) => {
        const polyText = (media.mediaType === '3d' && media.highlightPolygon && media.highlightPolygon.length >= 3) ? '<span style="font-size:11px;color:#111827;background:rgba(251,191,36,0.9);padding:2px 6px;border-radius:4px;margin-left:5px;display:inline-block;vertical-align:middle;">🔲 Có vùng sáng</span>' : '';
        const defaultIcon = icons[media.mediaType] || '📁';
        const customIconKey = 'media_' + media.mediaType;
        const customIconUrl = customIcons && customIcons[customIconKey];
        const iconHtml = customIconUrl 
          ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;">` 
          : defaultIcon + ' ';

        return `
        <div class="hotspot-item" style="background: rgba(22,26,36,0.94); border-left-color: #27ae60; border-color: rgba(39,174,96,0.25); box-shadow: 0 10px 30px rgba(0,0,0,0.18);">
          <h5 style="display: flex; align-items: center; gap: 4px;">${iconHtml}${media.title}${polyText}</h5>
          <div class="hotspot-info">
            <span>${media.description || ''}</span>
            <span><strong>Yaw:</strong> ${media.yaw?.toFixed(2) || '?'}° | <strong>Pitch:</strong> ${media.pitch?.toFixed(2) || '?'}°</span>
          </div>
          <div class="hotspot-actions">
            <button class="btn btn-small" onclick="previewMediaHotspot(${idx})" style="margin-bottom: 0; background: #2196f3; color: white;">👁️ Xem</button>
            <button class="btn btn-edit btn-small" onclick="editMediaHotspot(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
            <button class="btn btn-primary btn-small" onclick="startMoveMediaHotspot(${idx})" style="margin-bottom: 0; background-color: #2563eb;">📍 Di chuyển</button>
            <button class="btn btn-small" onclick="deleteMediaHotspot(${idx})" style="margin-bottom: 0; background: #f44336; color: white;">🗑️ Xóa</button>
          </div>
        </div>
        `;
      }).join('');
    }

    window.deleteMediaHotspot = async function (index) {
      if (!confirm('Xóa tư liệu này?')) return;

      try {
        const res = await fetch(`/api/admin/rooms/${selectedRoomId}/media-hotspots/${index}`, {
          method: 'DELETE'
        });

        const data = await res.json();

        if (data.success) {
          await loadRooms();
          loadMediaHotspots();
          loadPanoramaPreview();
          alert('✅ Đã xóa!');
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    };

    window.editMediaHotspot = function (idx) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.mediaHotspots || !room.mediaHotspots[idx]) return;

      const media = room.mediaHotspots[idx];

      closeAllFeatureModals('mediaHotspotModal');
      editingMediaHotspotIndex = idx;
      document.getElementById('mediaTitle').value = media.title;
      document.getElementById('mediaDescription').value = media.description || '';
      document.getElementById('mediaType').value = media.mediaType;
      document.getElementById('mediaYaw').value = media.yaw;
      document.getElementById('mediaPitch').value = media.pitch;

      // Store the current media URL for reference if not uploading new file
      document.getElementById('mediaHotspotForm').dataset.existingMediaUrl = media.mediaUrl;

      // Update UI based on media type
      if (media.mediaType === 'youtube' || media.mediaType === 'facebook' || media.mediaType === 'web') {
        document.getElementById('mediaUrl').value = media.mediaUrl;
        document.getElementById('mediaFileInfo').textContent = '';
      } else if (media.mediaType === 'note') {
        // For notes, media.mediaUrl contains the note content
        document.getElementById('mediaUrl').value = '';
        document.getElementById('mediaFileInfo').textContent = '';
      } else {
        document.getElementById('mediaFileInfo').textContent = `📎 Tệp hiện tại: ${media.mediaUrl.split('/').pop()}`;
        document.getElementById('mediaUrl').value = '';
      }

      updateMediaUploadHint();

      // Restore polygon for 3d hotspots
      polygonPoints = (media.mediaType === '3d' && Array.isArray(media.highlightPolygon)) ? media.highlightPolygon.map(p => [...p]) : [];
      const polyStatus = document.getElementById('polygonStatus');
      if (polyStatus && polygonPoints.length > 0) polyStatus.textContent = `✅ ${polygonPoints.length} điểm đã lưu.`;
      setTimeout(() => updatePolygonPreviewHotspots(), 500);

      const modal = document.getElementById('mediaHotspotModal');
      const modalHeader = modal.querySelector('.modal-header h3');
      modalHeader.textContent = '📝 Chỉnh sửa Tư liệu';

      modal.classList.add('active');
    };

    function setAddMediaMode(on) {
      addMediaMode = on;
      if (addMediaMode) addHotspotMode = false;
      updateAddMediaButton();
      updateAddHotspotButton();
    }

    function setAddSensorPositionMode(on) {
      addSensorPositionMode = on;
      if (addSensorPositionMode) {
        addHotspotMode = false;
        addMediaMode = false;
      }

      updateAddMediaButton();
      updateAddHotspotButton();
      updateAddSensorButton();
    }

    function updateAddSensorButton() {
      if (!addSensorBtn) return;
      if (addSensorPositionMode) {
        addSensorBtn.textContent = '🎯 Click ảnh';
        addSensorBtn.style.background = '#e67e22';
      } else {
        addSensorBtn.textContent = '🌡️ Thêm thiết bị IoT';
        addSensorBtn.style.background = '';
      }
    }

    async function openSensorModalAtPosition(yaw, pitch) {
      editingSensorIndex = null;
      sensorModalTitle.textContent = '🌡️ Thêm Thiết bị IoT';

      sensorForm.reset();
      document.getElementById('weatherDataInfo').textContent = '';
      document.getElementById('sensorType').value = 'environment';
      document.getElementById('useWebcam').checked = false;
      document.getElementById('sensorYaw').value = Number(yaw || 0).toFixed(2);
      document.getElementById('sensorPitch').value = Number(pitch || 0).toFixed(2);
      resetCameraDiagnostics();
      setCameraConnectionStatus('', '#7f8c8d');
      toggleSensorFields();

      if (selectedRoomId) {
        await loadRoomApiConfig(selectedRoomId);
      }

      document.getElementById('apiConfigSection').style.display = 'none';
      document.getElementById('apiConfigSummary').style.display = 'block';
      document.getElementById('toggleApiConfig').textContent = '📝 Chỉnh sửa';
      setApiInputsDisabled(true);

      closeAllFeatureModals('sensorModal');
      sensorModal.classList.add('active');
    }

    window.startSensorPositionPick = function () {
      if (!panoramaViewer || !selectedRoomId) {
        alert('⚠️ Vui lòng chọn phòng và chờ ảnh 360 tải xong trước khi chọn vị trí.');
        return;
      }

      if (!sensorModal.classList.contains('active')) {
        alert('⚠️ Vui lòng mở form thêm/sửa thiết bị trước.');
        return;
      }

      sensorModal.classList.remove('active');
      setAddSensorPositionMode(true);
      alert('🎯 Hãy click 1 điểm trên ảnh 360 để lấy vị trí cảm biến.');
    };

    function updateAddMediaButton() {
      if (!addMediaBtn) return;
      if (addMediaMode) {
        addMediaBtn.textContent = '🎯 Click ảnh';
        addMediaBtn.style.background = '#2196f3';
      } else {
        addMediaBtn.textContent = '📁 Tư liệu';
        addMediaBtn.style.background = '';
      }
    }

    if (addMediaBtn) {
      addMediaBtn.addEventListener('click', () => {
        setAddMediaMode(!addMediaMode);
      });
    }

    // Update selectRoom to load media hotspots, sensors, mail hotspots, and toggle overlay layout
    window.selectRoom = function (roomId) {
      selectedRoomId = roomId;
      const room = rooms.find(r => r.id === roomId);
      if (room) {
        const editSel = document.getElementById('editRoomBuilding');
        if (editSel) {
           editSel.value = room.buildingId || '';
        }
        
        // Cập nhật tiêu đề phòng trên Top Bar
        const currentRoomTitle = document.getElementById('currentRoomTitle');
        if (currentRoomTitle) {
          currentRoomTitle.textContent = `🏠 ${room.name}`;
        }
        
        // Cập nhật text phụ chỉ rõ đang sửa phòng nào
        const labelText = `Của phòng: ${room.name}`;
        ['transitionsActiveRoomInfo', 'mediaActiveRoomInfo', 'mailActiveRoomInfo', 'sensorsActiveRoomInfo'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = labelText;
        });
      }
      
      renderRooms();
      updateTargetRoomSelect();
      renderHotspots();
      loadPanoramaPreview();
      loadMediaHotspots();
      loadSensors();
      loadMailHotspots();
      
      const hotspotSection = document.getElementById('hotspotSection');
      if (hotspotSection) hotspotSection.style.display = 'block';

      const roomEditTopBar = document.getElementById('roomEditTopBar');
      if (roomEditTopBar) roomEditTopBar.style.display = 'flex';

      const panoramaViewerWrapper = document.getElementById('panoramaViewerWrapper');
      if (panoramaViewerWrapper) panoramaViewerWrapper.style.display = 'block';
      
      const selectedRoomInfo = document.getElementById('selectedRoomInfo');
      if (selectedRoomInfo) selectedRoomInfo.style.display = 'none';
    };

    // Tab switcher function
    function switchTab(tabId) {
      closeAllFeatureModals();
      const roomsPanel = document.querySelector('.rooms-panel');
      const targetBtn = Array.from(document.querySelectorAll('.icon-sidebar .icon-btn')).find(btn => {
        const attr = btn.getAttribute('onclick');
        return attr && attr.includes(`'${tabId}'`);
      });
      const isRoomsTabButtonActive = tabId === 'rooms' && targetBtn?.classList.contains('active');

      if (tabId === 'rooms' && isRoomsTabButtonActive) {
        roomsPanelCollapsed = !roomsPanelCollapsed;
        applyRoomsPanelState();
        return;
      }

      if (roomsPanelCollapsed) {
        roomsPanelCollapsed = false;
        applyRoomsPanelState();
      }

      // Deactivate all tab buttons
      document.querySelectorAll('.icon-sidebar .icon-btn').forEach(btn => {
        btn.classList.remove('active');
      });

      // Activate target tab button
      if (targetBtn) {
        targetBtn.classList.add('active');
      }

      const isRoomsTab = tabId === 'rooms';
      if (roomsPanel) {
        roomsPanel.classList.toggle('has-tab', !isRoomsTab);
      }

      // Hide all tab sub-panels
      document.querySelectorAll('.rooms-tab-content .sub-panel').forEach(panel => {
        panel.classList.remove('active');
      });

      // Show the selected tab sub-panel (rooms tab uses shared list only)
      if (!isRoomsTab) {
        const targetPanel = document.getElementById(`panel-${tabId}`);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      }
    }
    window.switchTab = switchTab;

    // === MAIL HOTSPOTS MANAGEMENT ===
    let editingMailIndex = null;
    let addMailMode = false;

    window.openAddMailModal = function () {
      if (!selectedRoomId) {
        alert('Vui lòng chọn phòng trước.');
        return;
      }
      closeAllFeatureModals('mailHotspotModal');
      editingMailIndex = null;
      document.getElementById('mailModalTitle').textContent = '✉️ Thêm Điểm Gửi Mail';
      document.getElementById('mailHotspotForm').reset();
      document.getElementById('mailYaw').value = '';
      document.getElementById('mailPitch').value = '';
      document.getElementById('mailHotspotModal').classList.add('active');
    };

    window.closeMailModal = function () {
      document.getElementById('mailHotspotModal').classList.remove('active');
      editingMailIndex = null;
    };

    window.startMailPositionPick = function () {
      if (!panoramaViewer || !selectedRoomId) {
        alert('⚠️ Vui lòng chọn phòng và chờ ảnh 360 tải xong.');
        return;
      }
      document.getElementById('mailHotspotModal').classList.remove('active');
      addMailMode = true;
      alert('🎯 Hãy click 1 điểm trên ảnh 360 để lấy vị trí điểm mail.');
    };

    async function loadMailHotspots() {
      if (!selectedRoomId) return;
      try {
        const res = await fetch(`/api/rooms/${selectedRoomId}/mail-hotspots`);
        const data = await res.json();
        if (data.success) {
          renderMailHotspots(data.mailHotspots || []);
        }
      } catch (err) {
        console.error('Load mail hotspots error:', err);
      }
    }

    function renderMailHotspots(mailHotspots) {
      const list = document.getElementById('mailHotspotsList');
      const countLabel = document.getElementById('mailCountLabel');
      
      if (countLabel) {
        countLabel.textContent = `${mailHotspots.length} h.spot`;
      }

      if (!mailHotspots || mailHotspots.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Chưa có điểm gửi mail</p></div>';
        return;
      }

      list.innerHTML = mailHotspots.map((mail, idx) => {
        const defaultIcon = '✉️';
        const customIconUrl = customIcons && customIcons.mail;
        const iconHtml = customIconUrl 
          ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;">` 
          : defaultIcon + ' ';

        return `
        <div class="hotspot-item" style="background: rgba(251, 191, 36, 0.1); border-left-color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.2);">
          <h5 style="display: flex; align-items: center; gap: 4px;">${iconHtml}${mail.title}</h5>
          <div class="hotspot-info">
            <span><strong>Người nhận:</strong> ${mail.recipient}</span>
            <span><strong>Tiêu đề:</strong> ${mail.subject || '(Trống)'}</span>
            <span><strong>Yaw:</strong> ${mail.yaw?.toFixed(2) || '?'}° | <strong>Pitch:</strong> ${mail.pitch?.toFixed(2) || '?'}°</span>
          </div>
          <div class="hotspot-actions">
            <button class="btn btn-edit btn-small" onclick="editMailHotspot(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
            <button class="btn btn-small" onclick="deleteMailHotspot(${idx})" style="margin-bottom: 0; background: #f44336; color: white;">🗑️ Xóa</button>
          </div>
        </div>
        `;
      }).join('');
    }
    window.loadMailHotspots = loadMailHotspots;

    window.editMailHotspot = function (idx) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.mailHotspots || !room.mailHotspots[idx]) return;

      const mail = room.mailHotspots[idx];
      editingMailIndex = idx;
      
      document.getElementById('mailModalTitle').textContent = '📝 Chỉnh sửa Điểm Gửi Mail';
      document.getElementById('mailTitle').value = mail.title;
      document.getElementById('mailRecipient').value = mail.recipient;
      document.getElementById('mailSubject').value = mail.subject || '';
      document.getElementById('mailBody').value = mail.body || '';
      document.getElementById('mailYaw').value = mail.yaw || 0;
      document.getElementById('mailPitch').value = mail.pitch || 0;

      document.getElementById('mailHotspotModal').classList.add('active');
    };

    window.deleteMailHotspot = async function (idx) {
      if (!confirm('Xóa điểm gửi mail này?')) return;

      try {
        const res = await fetch(`/api/rooms/${selectedRoomId}/mail-hotspots/${idx}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
          await loadRooms();
          loadMailHotspots();
          loadPanoramaPreview();
          alert('✅ Đã xóa!');
        } else {
          alert('Lỗi xóa: ' + data.error);
        }
      } catch (err) {
        console.error(err);
      }
    };

    window.submitMailHotspot = async function (event) {
      event.preventDefault();
      const payload = {
        title: document.getElementById('mailTitle').value,
        recipient: document.getElementById('mailRecipient').value,
        subject: document.getElementById('mailSubject').value,
        body: document.getElementById('mailBody').value,
        yaw: parseFloat(document.getElementById('mailYaw').value),
        pitch: parseFloat(document.getElementById('mailPitch').value)
      };

      try {
        let url = `/api/rooms/${selectedRoomId}/mail-hotspots`;
        let method = 'POST';

        if (editingMailIndex !== null) {
          url += `/${editingMailIndex}`;
          method = 'PATCH';
        }

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
          closeMailModal();
          await loadRooms();
          loadMailHotspots();
          loadPanoramaPreview();
          alert('✅ ' + (method === 'PATCH' ? 'Cập nhật thành công!' : 'Thêm thành công!'));
        } else {
          alert('Lỗi: ' + data.error);
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    };


    window.saveRoomBuilding = async function() {
      if (!selectedRoomId) return;
      const editSel = document.getElementById('editRoomBuilding');
      if (!editSel) return;
      const newBuildingId = editSel.value;
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room) return;
      if (room.buildingId === newBuildingId) {
         alert("Phòng đã ở tòa nhà này.");
         return;
      }
      if (!confirm("Bạn có muốn chuyển phòng này sang tòa nhà khác? Các file ảnh cũng sẽ được di chuyển theo.")) return;

      try {
        const rawRes = await fetch(`/api/admin/rooms/${selectedRoomId}`, {
           method: "PATCH",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ buildingId: newBuildingId || null })
        });
        const res = await rawRes.json();
        if (res && res.success) {
           alert("Chuyển phòng thành công!");
           await loadRooms();
           selectRoom(selectedRoomId);
        } else {
           alert("Lỗi: " + (res?.error || "Không rõ nguyên nhân."));
        }
      } catch(e) {
        console.error(e);
        alert("Lỗi khi chuyển phòng.");
      }
    };

    // (Handled inside panorama mousedown)

    // ===== SENSOR MANAGEMENT =====
    const addSensorBtn = document.getElementById('addSensorBtn');
    const sensorModal = document.getElementById('sensorModal');
    const sensorForm = document.getElementById('sensorForm');
    const sensorModalTitle = document.getElementById('sensorModalTitle');
    let currentRoomApiConfig = null;

    const cameraStreamUrlInput = document.getElementById('cameraStreamUrl');
    if (cameraStreamUrlInput) {
      cameraStreamUrlInput.addEventListener('change', () => {
        const value = (cameraStreamUrlInput.value || '').trim();
        if (!value) {
          resetCameraDiagnostics();
          setCameraConnectionStatus('', '#7f8c8d');
          return;
        }
        previewCameraStream();
      });
    }

    // Toggle API Config Section
    function setApiInputsDisabled(disabled) {
      const ids = [
        'roomWeatherUrl',
        'roomWeatherApiKey',
        'roomWeatherLat',
        'roomWeatherLon',
        'roomAirUrl',
        'roomAirToken'
      ];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
      });
    }

    async function toggleApiConfigSection() {
      const section = document.getElementById('apiConfigSection');
      const summary = document.getElementById('apiConfigSummary');
      const btn = document.getElementById('toggleApiConfig');

      if (section.style.display === 'none') {
        section.style.display = 'block';
        summary.style.display = 'none';
        btn.textContent = '✅ Xong';
        setApiInputsDisabled(false);
      } else {
        // Save config when closing edit
        if (selectedRoomId) {
          await saveRoomApiConfig(selectedRoomId);
        }
        section.style.display = 'none';
        summary.style.display = 'block';
        btn.textContent = '📝 Chỉnh sửa';
        setApiInputsDisabled(true);
        updateApiConfigSummary();
      }
    }

    // Update API Config Summary
    function updateApiConfigSummary() {
      const weatherKey = document.getElementById('roomWeatherApiKey').value;
      const airToken = document.getElementById('roomAirToken').value;

      document.getElementById('summaryWeatherStatus').textContent = weatherKey ? '✅ Đã cấu hình' : '❌ Chưa cấu hình';
      document.getElementById('summaryAirStatus').textContent = airToken ? '✅ Đã cấu hình' : '❌ Chưa cấu hình';
    }

    // Load Room API Config
    async function loadRoomApiConfig(roomId) {
      try {
        const res = await fetch(`/api/rooms/${roomId}/api-config`);
        const data = await res.json();

        if (data.success && data.config) {
          currentRoomApiConfig = data.config;

          // Fill form with existing config
          document.getElementById('roomWeatherUrl').value = data.config.weatherApi?.url || 'https://api.openweathermap.org/data/2.5/weather';
          document.getElementById('roomWeatherApiKey').value = data.config.weatherApi?.apiKey || '';
          document.getElementById('roomWeatherLat').value = data.config.weatherApi?.params?.lat || 10.7769;
          document.getElementById('roomWeatherLon').value = data.config.weatherApi?.params?.lon || 106.7009;

          document.getElementById('roomAirUrl').value = data.config.airQualityApi?.url || 'https://api.waqi.info/feed/@13659/';
          document.getElementById('roomAirToken').value = data.config.airQualityApi?.token || '';

          updateApiConfigSummary();
        } else {
          // No config yet, use defaults
          document.getElementById('roomWeatherUrl').value = 'https://api.openweathermap.org/data/2.5/weather';
          document.getElementById('roomWeatherApiKey').value = '';
          document.getElementById('roomWeatherLat').value = 10.7769;
          document.getElementById('roomWeatherLon').value = 106.7009;
          document.getElementById('roomAirUrl').value = 'https://api.waqi.info/feed/@13659/';
          document.getElementById('roomAirToken').value = '';
          updateApiConfigSummary();
        }
      } catch (err) {
        console.error('Load room API config error:', err);
      }
    }

    // Save Room API Config
    async function saveRoomApiConfig(roomId) {
      const config = {
        weatherApi: {
          provider: 'openweathermap',
          url: document.getElementById('roomWeatherUrl').value,
          apiKey: document.getElementById('roomWeatherApiKey').value,
          params: {
            lat: parseFloat(document.getElementById('roomWeatherLat').value),
            lon: parseFloat(document.getElementById('roomWeatherLon').value),
            units: 'metric'
          }
        },
        airQualityApi: {
          provider: 'waqi',
          url: document.getElementById('roomAirUrl').value,
          token: document.getElementById('roomAirToken').value
        }
      };

      try {
        const res = await fetch(`/api/rooms/${roomId}/api-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });

        const data = await res.json();
        if (data.success) {
          currentRoomApiConfig = config;
          return true;
        }
        return false;
      } catch (err) {
        console.error('Save room API config error:', err);
        return false;
      }
    }

    async function loadSensors() {
      if (!selectedRoomId) return;

      try {
        const res = await fetch(`/api/sensors?roomId=${selectedRoomId}`);
        const data = await res.json();

        if (data.success) {
          roomSensors = data.sensors;
          renderSensors();
          renderAdminSensorHotspots();
        }
      } catch (err) {
        console.error('Load sensors error:', err);
      }
    }

    function renderSensors() {
      const list = document.getElementById('sensorsList');
      const countLabel = document.getElementById('sensorsCountLabel');
      if (countLabel) countLabel.textContent = `${(roomSensors || []).length} thiết bị`;

      if (!roomSensors || roomSensors.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Chưa có cảm biến</p></div>';
        return;
      }

      list.innerHTML = roomSensors.map((sensor, idx) => {
        if (sensor.type === 'camera') {
          // Render camera
          const statusIcons = {
            online: '🟢',
            offline: '🔴',
            maintenance: '🟡'
          };
          const statusLabels = {
            online: 'Online',
            offline: 'Offline',
            maintenance: 'Bảo trì'
          };
          const statusIcon = statusIcons[sensor.camera?.status] || '⚪';
          const statusLabel = statusLabels[sensor.camera?.status] || 'N/A';

          const isWebcam = sensor.camera?.streamUrl === 'webcam://0';
          const defaultIcon = isWebcam ? '💻' : '📹';
          const customIconUrl = customIcons && customIcons.camera;
          const iconHtml = customIconUrl 
            ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;">` 
            : defaultIcon + ' ';
          const cameraType = isWebcam ? 'Webcam Laptop' : 'Camera IP';
          const streamUrl = (sensor.camera?.streamUrl || '').trim();
          const streamFallback = `<div style="margin-top: 10px; color: #7f8c8d; font-size: 12px;">${isWebcam ? 'ℹ️ Webcam xem trực tiếp trong modal cấu hình' : streamUrl ? 'ℹ️ Camera này dùng WebRTC (WHEP), bấm "Xem trực tiếp" để kiểm tra' : 'ℹ️ Chưa cấu hình stream WebRTC cho camera này'}</div>`;

          return `
            <div class="hotspot-item" style="background: rgba(33, 150, 243, 0.12); border: 1px solid rgba(33, 150, 243, 0.25); border-left: 4px solid #2196F3;">
              <h5 style="display: flex; align-items: center; gap: 4px; color: #ffffff;">${iconHtml}${sensor.name}</h5>
              <div class="hotspot-info" style="color: rgba(255, 255, 255, 0.72);">
                <span><strong>Loại:</strong> ${cameraType}</span>
                <span><strong>Trạng thái:</strong> ${statusIcon} ${statusLabel}</span>
                <span><strong>Độ phân giải:</strong> ${sensor.camera?.resolution || 'N/A'}</span>
                ${isWebcam ? '' : `<span><strong>Stream:</strong> ${sensor.camera?.streamUrl ? '✅ Có' : '❌ Không'}</span>`}
              </div>
              ${streamFallback}
              <div class="hotspot-actions">
                <button class="btn btn-small" onclick="openCameraLiveStream(${idx})" style="margin-bottom: 0; background: #3498db; color: white;">🎥 Xem trực tiếp</button>
                <button class="btn btn-edit btn-small" onclick="editSensor(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
                <button class="btn btn-danger btn-small" onclick="deleteSensor(${idx})" style="margin-bottom: 0;">🗑️ Xóa</button>
              </div>
            </div>
          `;
        } else {
          // Render environment sensor
          const defaultIcon = '🌡️';
          const customIconUrl = customIcons && customIcons.sensor;
          const iconHtml = customIconUrl 
            ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;">` 
            : defaultIcon + ' ';

          return `
            <div class="hotspot-item" style="background: rgba(255, 107, 107, 0.12); border: 1px solid rgba(255, 107, 107, 0.25); border-left: 4px solid #FF6B6B;">
              <h5 style="display: flex; align-items: center; gap: 4px; color: #ffffff;">${iconHtml}${sensor.name}</h5>
              <div class="hotspot-info" style="color: rgba(255, 255, 255, 0.72);">
                <span><strong>Nhiệt độ:</strong> ${sensor.sensors?.temperature?.value || 0}°C</span>
                <span><strong>Độ ẩm:</strong> ${sensor.sensors?.humidity?.value || 0}%</span>
                <span><strong>PM2.5:</strong> ${sensor.sensors?.pm25?.value || 0} µg/m³</span>
                <span><strong>Yaw:</strong> ${sensor.position?.yaw?.toFixed(2) || 0}° | <strong>Pitch:</strong> ${sensor.position?.pitch?.toFixed(2) || 0}°</span>
              </div>
              <div class="hotspot-actions">
                <button class="btn btn-edit btn-small" onclick="editSensor(${idx})" style="margin-bottom: 0;">✏️ Sửa</button>
                <button class="btn btn-danger btn-small" onclick="deleteSensor(${idx})" style="margin-bottom: 0;">🗑️ Xóa</button>
              </div>
            </div>
          `;
        }
      }).join('');

    }

    window.openCameraLiveStream = function (idx) {
      editSensor(idx);
      setTimeout(() => {
        if (document.getElementById('sensorType')?.value === 'camera') {
          previewCameraStream();
        }
      }, 200);
    };

    if (addSensorBtn) {
      addSensorBtn.addEventListener('click', () => {
        setAddSensorPositionMode(!addSensorPositionMode);
      });
    }

    function closeSensorModal() {
      sensorModal.classList.remove('active');
      editingSensorIndex = null;
      setAddSensorPositionMode(false);
      sensorForm.reset();
      document.getElementById('weatherDataInfo').textContent = '';
      document.getElementById('sensorType').value = 'environment';
      document.getElementById('useWebcam').checked = false;
      document.getElementById('sensorYaw').value = 0;
      document.getElementById('sensorPitch').value = 0;
      stopWebcam(); // Stop webcam if running
      resetCameraDiagnostics();
      setCameraConnectionStatus('', '#7f8c8d');
      toggleSensorFields(); // Reset to show environment fields
    }

    window.fetchRealWeatherData = async function () {
      const infoEl = document.getElementById('weatherDataInfo');
      const tempInput = document.getElementById('sensorTemp');
      const humidityInput = document.getElementById('sensorHumidity');
      const pm25Input = document.getElementById('sensorPM25');

      infoEl.innerHTML = '<span style="color: #3498db;">⏳ Đang lấy dữ liệu từ API thời tiết...</span>';

      try {
        if (selectedRoomId) {
          await saveRoomApiConfig(selectedRoomId);
        }
        const configPayload = {
          weatherApi: {
            provider: 'openweathermap',
            url: document.getElementById('roomWeatherUrl').value,
            apiKey: document.getElementById('roomWeatherApiKey').value,
            params: {
              lat: parseFloat(document.getElementById('roomWeatherLat').value),
              lon: parseFloat(document.getElementById('roomWeatherLon').value),
              units: 'metric'
            }
          },
          airQualityApi: {
            provider: 'waqi',
            url: document.getElementById('roomAirUrl').value,
            token: document.getElementById('roomAirToken').value
          }
        };
        // Use config from admin-rooms form directly
        const res = await fetch('/api/real-data/combined/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configPayload)
        });
        const result = await res.json();

        if (result.success && result.data) {
          tempInput.value = result.data.temperature.toFixed(1);
          humidityInput.value = Math.round(result.data.humidity);
          pm25Input.value = result.data.pm25.toFixed(1);

          const timestamp = new Date().toLocaleTimeString('vi-VN');
          const aqiInfo = result.data.aqi ? `<span style="padding: 3px 8px; border-radius: 4px; background: ${result.data.aqi.color}; color: white; font-size: 11px; font-weight: 600;">${result.data.aqi.level}</span>` : '';

          infoEl.innerHTML = `
            <div style="color: #27ae60; font-weight: 600; margin-bottom: 5px;">✅ Đã cập nhật dữ liệu thực tế (API riêng của phòng)</div>
            <div style="font-size: 11px; color: #555;">
              📍 ${result.data.location} | ⏰ ${timestamp}<br>
              🌤️ ${result.data.weather || 'N/A'} | AQI: ${aqiInfo}
            </div>
          `;
        } else {
          throw new Error('Không thể lấy dữ liệu');
        }
      } catch (err) {
        console.error('Fetch weather error:', err);
        infoEl.innerHTML = '<span style="color: #e74c3c;">❌ Lỗi: ' + err.message + '</span>';
      }
    };

    sensorForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const sensorType = document.getElementById('sensorType').value;
      console.log('📝 Sensor Type:', sensorType);

      let sensorData = {
        name: document.getElementById('sensorName').value,
        roomId: selectedRoomId,
        type: sensorType,
        position: {
          yaw: Number(document.getElementById('sensorYaw').value || 0),
          pitch: Number(document.getElementById('sensorPitch').value || 0)
        }
      };

      // Build data based on sensor type
      if (sensorType === 'environment') {
        // Save room API config first
        await saveRoomApiConfig(selectedRoomId);

        sensorData.sensors = {
          temperature: {
            value: Number(document.getElementById('sensorTemp').value),
            unit: '°C',
            min: 0,
            max: 50
          },
          humidity: {
            value: Number(document.getElementById('sensorHumidity').value),
            unit: '%',
            min: 0,
            max: 100
          },
          pm25: {
            value: Number(document.getElementById('sensorPM25').value),
            unit: 'µg/m³',
            min: 0,
            max: 500
          }
        };
      } else if (sensorType === 'camera') {
        sensorData.camera = {
          streamUrl: document.getElementById('cameraStreamUrl').value,
          snapshotUrl: document.getElementById('cameraSnapshotUrl').value,
          resolution: document.getElementById('cameraResolution').value,
          status: document.getElementById('cameraStatus').value,
          notes: document.getElementById('cameraNotes').value
        };
      }

      console.log('📤 Sending sensor data:', JSON.stringify(sensorData, null, 2));

      try {
        let url = '/api/sensors';
        let method = 'POST';

        if (editingSensorIndex !== null) {
          const sensor = roomSensors[editingSensorIndex];
          url = `/api/sensors/${sensor.id}`;
          method = 'PUT';
        }

        console.log(`🌐 ${method} ${url}`);

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sensorData)
        });

        const data = await res.json();
        console.log('📥 Server response:', data);

        if (data.success) {
          closeSensorModal();
          await loadSensors();
          const deviceType = sensorType === 'camera' ? 'camera' : 'cảm biến';
          alert('✅ ' + (method === 'PUT' ? `Cập nhật ${deviceType} thành công!` : `Đã thêm ${deviceType}!`));
        } else {
          alert('Lỗi: ' + data.error);
        }
      } catch (err) {
        console.error(err);
        alert('Lỗi: ' + err.message);
      }
    });

    window.editSensor = async function (idx) {
      const sensor = roomSensors[idx];
      if (!sensor) return;

      editingSensorIndex = idx;
      sensorModalTitle.textContent = '✏️ Chỉnh sửa ' + (sensor.type === 'camera' ? 'Camera' : 'Cảm biến');

      document.getElementById('sensorName').value = sensor.name;
      document.getElementById('sensorType').value = sensor.type || 'environment';
      document.getElementById('sensorYaw').value = sensor.position?.yaw || 0;
      document.getElementById('sensorPitch').value = sensor.position?.pitch || 0;
      setAddSensorPositionMode(false);

      // Toggle fields based on sensor type
      toggleSensorFields();

      if (sensor.type === 'camera') {
        // Fill camera fields
        const isWebcam = sensor.camera?.streamUrl === 'webcam://0';
        document.getElementById('useWebcam').checked = isWebcam;
        document.getElementById('cameraStreamUrl').value = sensor.camera?.streamUrl || '';
        document.getElementById('cameraSnapshotUrl').value = sensor.camera?.snapshotUrl || '';
        document.getElementById('cameraResolution').value = sensor.camera?.resolution || '1920x1080';
        document.getElementById('cameraStatus').value = sensor.camera?.status || 'online';
        document.getElementById('cameraNotes').value = sensor.camera?.notes || '';

        // Toggle webcam UI if it's a webcam
        if (isWebcam) {
          toggleWebcam();
        } else {
          previewCameraStream();
        }
      } else {
        // Fill environment sensor fields
        document.getElementById('sensorTemp').value = sensor.sensors?.temperature?.value || 0;
        document.getElementById('sensorHumidity').value = sensor.sensors?.humidity?.value || 0;
        document.getElementById('sensorPM25').value = sensor.sensors?.pm25?.value || 0;
        document.getElementById('weatherDataInfo').textContent = '';

        // Load room API config
        if (selectedRoomId) {
          await loadRoomApiConfig(selectedRoomId);
        }

        // Reset API config section state
        document.getElementById('apiConfigSection').style.display = 'none';
        document.getElementById('apiConfigSummary').style.display = 'block';
        document.getElementById('toggleApiConfig').textContent = '📝 Chỉnh sửa';
        setApiInputsDisabled(true);
      }

        closeAllFeatureModals('sensorModal');
      sensorModal.classList.add('active');
    };

    window.deleteSensor = async function (idx) {
      const sensor = roomSensors[idx];
      if (!sensor) return;

      if (!confirm(`Xóa cảm biến "${sensor.name}"?`)) return;

      try {
        const res = await fetch(`/api/sensors/${sensor.id}`, {
          method: 'DELETE'
        });

        const data = await res.json();

        if (data.success) {
          await loadSensors();
          alert('✅ Đã xóa cảm biến!');
        } else {
          alert('Lỗi: ' + data.error);
        }
      } catch (err) {
        console.error('Delete sensor error:', err);
        alert('Lỗi: ' + err.message);
      }
    };
    window.previewMediaHotspot = function (idx) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.mediaHotspots || !room.mediaHotspots[idx]) return;
      const media = room.mediaHotspots[idx];

      const modal = document.getElementById('mediaPreviewModal');
      const title = document.getElementById('mediaPreviewTitle');
      const body = document.getElementById('mediaPreviewBody');

      if (!modal || !title || !body) return;

      const icons = { image: '🖼️', pdf: '📄', video: '🎥', '3d': '🧊', youtube: '▶️', facebook: '👍', web: '🌐', note: '📝' };
      title.textContent = `${icons[media.mediaType] || '📁'} ${media.title}`;

      let contentHtml = '';
      const mediaUrlClean = media.mediaUrl.startsWith('http') ? media.mediaUrl : window.location.origin + media.mediaUrl;

      if (media.mediaType === 'image') {
        contentHtml = `<img src="${mediaUrlClean}" style="max-width:100%; max-height:55vh; object-fit:contain; border-radius:6px; box-shadow:0 4px 15px rgba(0,0,0,0.5);">`;
      } else if (media.mediaType === 'video') {
        contentHtml = `<video src="${mediaUrlClean}" controls autoplay style="max-width:100%; max-height:55vh; border-radius:6px; box-shadow:0 4px 15px rgba(0,0,0,0.5);"></video>`;
      } else if (media.mediaType === 'pdf') {
        contentHtml = `<iframe src="${mediaUrlClean}" style="width:100%; height:55vh; border:none; border-radius:6px; background:white;"></iframe>`;
      } else if (media.mediaType === 'youtube') {
        let videoId = '';
        if (media.mediaUrl.includes('youtube.com/watch?v=')) {
          videoId = media.mediaUrl.split('watch?v=')[1]?.split('&')[0];
        } else if (media.mediaUrl.includes('youtu.be/')) {
          videoId = media.mediaUrl.split('youtu.be/')[1]?.split('?')[0];
        }
        if (videoId) {
          contentHtml = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" style="width:100%; height:450px; border:none; border-radius:6px;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
          contentHtml = `<iframe src="${mediaUrlClean}" style="width:100%; height:55vh; border:none; border-radius:6px;"></iframe>`;
        }
      } else if (media.mediaType === 'facebook') {
        contentHtml = `<iframe src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(media.mediaUrl)}&show_text=true" style="width:100%; height:500px; border:none; border-radius:6px; background:white; overflow:hidden;" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>`;
      } else if (media.mediaType === 'web') {
        contentHtml = `<iframe src="${mediaUrlClean}" style="width:100%; height:55vh; border:none; border-radius:6px; background:white;"></iframe>`;
      } else if (media.mediaType === 'note') {
        contentHtml = `<div style="color:#f3f4f6; font-size:14px; line-height:1.6; padding:20px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; width:100%; max-height:50vh; overflow-y:auto; white-space:pre-wrap;">${media.description || 'Không có mô tả'}</div>`;
      } else if (media.mediaType === '3d') {
        contentHtml = `
          <model-viewer src="${mediaUrlClean}" alt="${media.title || '3D Model'}" auto-rotate camera-controls style="width:100%; height:55vh; border-radius:6px; background:rgba(0,0,0,0.25);">
          </model-viewer>
        `;
      } else {
        contentHtml = `<div style="color:var(--text-muted); font-size:13px; text-align:center; width:100%;">Không hỗ trợ xem trước cho loại tư liệu này. <a href="${mediaUrlClean}" target="_blank" style="color:#2196f3; text-decoration:underline;">Tải xuống hoặc mở liên kết</a></div>`;
      }

      body.innerHTML = contentHtml;
      modal.classList.add('active');
    };

    window.closeMediaPreviewModal = function () {
      const modal = document.getElementById('mediaPreviewModal');
      const body = document.getElementById('mediaPreviewBody');
      if (modal) modal.classList.remove('active');
      if (body) body.innerHTML = '';
    };

    // Initialize
    applyRoomsPanelState();
    loadCustomIcons().then(() => {
      loadRooms();
    });
    loadApiConfig();

    // Load API config and start auto-refresh if enabled
    let apiConfig = null;

    async function loadApiConfig() {
      try {
        const res = await fetch('/api/config/api');
        const data = await res.json();
        if (data.success) {
          apiConfig = data.config;

          // Update interval if different from default
          if (apiConfig.refreshInterval && apiConfig.refreshInterval !== 10000) {
            if (autoRefreshInterval) {
              clearInterval(autoRefreshInterval);
              autoRefreshInterval = setInterval(() => {
                if (selectedRoomId && roomSensors.length > 0) {
                  refreshAllSensors();
                }
              }, apiConfig.refreshInterval);
            }
          }

          // Auto-start if configured
          if (apiConfig.autoRefresh && !isAutoRefreshEnabled) {
            startAutoRefresh();
          }
        }
      } catch (err) {
        console.error('Load API config error:', err);
      }
    }
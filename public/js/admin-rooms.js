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
    let allDbSensors = [];
    let selectedDbSensorId = null;
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

    // Initial view direction state for nav hotspot
    let _initialViewYaw = null;   // Saved yaw (degrees) for initial view
    let _initialViewPitch = null; // Saved pitch (degrees) for initial view
    let _initialViewPannellum = null; // Pannellum instance in initialViewModal
    let _initialViewUpdateTimer = null; // Timer for polling Pannellum position

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

    function applyCustomIconToHotspotElement(element, type, directIconUrl) {
      if (!element) return;
      let customIcon = directIconUrl;
      if (!customIcon) {
        const key = type === 'nav' ? 'nav_arrow' : 'media_' + type;
        const iconKey = (type === 'sensor' || type === 'camera') ? type : key;
        customIcon = customIcons && customIcons[iconKey];
      }
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

      // Reset initial view state
      _resetInitialViewState();

      // Hide initialViewGroup
      const ivGroup = document.getElementById('initialViewGroup');
      if (ivGroup) ivGroup.style.display = 'none';
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
      if (keepModalId !== 'initialViewModal') closeInitialViewModal();

      setAddHotspotMode(false);
      setAddMediaMode(false);
      setAddSensorPositionMode(false);
      addMailMode = false;
    }

    /* ===== INITIAL VIEW DIRECTION FUNCTIONS ===== */

    function _resetInitialViewState() {
      _initialViewYaw = null;
      _initialViewPitch = null;
      const yawInput = document.getElementById('initialViewYaw');
      const pitchInput = document.getElementById('initialViewPitch');
      if (yawInput) yawInput.value = '';
      if (pitchInput) pitchInput.value = '';
      _updateInitialViewStatus();
    }

    function _updateInitialViewStatus() {
      const statusEl = document.getElementById('initialViewStatus');
      if (!statusEl) return;
      if (_initialViewYaw !== null && _initialViewPitch !== null) {
        statusEl.innerHTML = `✅ Yaw: <strong>${_initialViewYaw.toFixed(1)}°</strong> — Pitch: <strong>${_initialViewPitch.toFixed(1)}°</strong>`;
        statusEl.style.color = '#4ade80';
      } else {
        statusEl.innerHTML = '<em>Chưa đặt — sẽ dùng hướng mặc định</em>';
        statusEl.style.color = '';
      }
    }

    // Called when targetRoom select changes
    window.onTargetRoomChange = function() {
      const targetId = Number(document.getElementById('targetRoom').value);
      const ivGroup = document.getElementById('initialViewGroup');
      if (targetId) {
        if (ivGroup) ivGroup.style.display = 'block';
      } else {
        if (ivGroup) ivGroup.style.display = 'none';
        _resetInitialViewState();
      }
    };

    window.openInitialViewModal = function() {
      const targetId = Number(document.getElementById('targetRoom').value);
      if (!targetId) {
        alert('Vui lòng chọn phòng đích trước');
        return;
      }

      const targetRoom = rooms.find(r => r.id === targetId);
      if (!targetRoom) {
        alert('Không tìm thấy thông tin phòng đích');
        return;
      }

      // Get panorama image URL for the destination room
      let imageUrl = targetRoom.image || '';
      if (!imageUrl) {
        alert('Phòng đích chưa có ảnh panorama');
        return;
      }
      // Make sure URL is absolute
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        imageUrl = '/' + imageUrl;
      }

      // Update modal title
      const modalTitle = document.getElementById('initialViewModalTitle');
      if (modalTitle) modalTitle.textContent = `🧭 Chọn hướng nhìn — ${targetRoom.name}`;

      // Show modal
      const modal = document.getElementById('initialViewModal');
      if (modal) modal.classList.add('active');

      // Destroy existing Pannellum instance
      if (_initialViewPannellum) {
        try { _initialViewPannellum.destroy(); } catch(e) {}
        _initialViewPannellum = null;
      }
      if (_initialViewUpdateTimer) {
        clearInterval(_initialViewUpdateTimer);
        _initialViewUpdateTimer = null;
      }

      // Init Pannellum after a short delay to ensure container is visible
      setTimeout(() => {
        const container = document.getElementById('initialViewPannellumContainer');
        if (!container) return;
        container.innerHTML = ''; // Clear

        // Determine initial yaw/pitch (use saved value or 0)
        const startYaw = _initialViewYaw !== null ? _initialViewYaw : 0;
        const startPitch = _initialViewPitch !== null ? _initialViewPitch : 0;

        _initialViewPannellum = pannellum.viewer('initialViewPannellumContainer', {
          type: 'equirectangular',
          panorama: imageUrl,
          autoLoad: true,
          showControls: false,
          mouseZoom: true,
          hfov: 90,
          yaw: startYaw,
          pitch: startPitch,
          compass: false
        });

        // Poll Pannellum yaw/pitch and update badges
        _initialViewUpdateTimer = setInterval(() => {
          if (!_initialViewPannellum) return;
          try {
            const yaw = _initialViewPannellum.getYaw();
            const pitch = _initialViewPannellum.getPitch();
            const yawBadge = document.getElementById('ivPreviewYawBadge');
            const pitchBadge = document.getElementById('ivPreviewPitchBadge');
            if (yawBadge) yawBadge.textContent = `Yaw: ${yaw.toFixed(1)}°`;
            if (pitchBadge) pitchBadge.textContent = `Pitch: ${pitch.toFixed(1)}°`;
          } catch(e) {}
        }, 100);
      }, 100);
    };

    window.closeInitialViewModal = function() {
      const modal = document.getElementById('initialViewModal');
      if (modal) modal.classList.remove('active');

      // Destroy Pannellum viewer
      if (_initialViewUpdateTimer) {
        clearInterval(_initialViewUpdateTimer);
        _initialViewUpdateTimer = null;
      }
      if (_initialViewPannellum) {
        try { _initialViewPannellum.destroy(); } catch(e) {}
        _initialViewPannellum = null;
      }

      // Clear container
      const container = document.getElementById('initialViewPannellumContainer');
      if (container) container.innerHTML = '';
    };

    window.saveInitialView = function() {
      if (!_initialViewPannellum) return;
      try {
        const yaw = _initialViewPannellum.getYaw();
        const pitch = _initialViewPannellum.getPitch();

        _initialViewYaw = yaw;
        _initialViewPitch = pitch;

        // Write to hidden inputs
        const yawInput = document.getElementById('initialViewYaw');
        const pitchInput = document.getElementById('initialViewPitch');
        if (yawInput) yawInput.value = yaw;
        if (pitchInput) pitchInput.value = pitch;

        _updateInitialViewStatus();
        closeInitialViewModal();
      } catch(e) {
        alert('Lỗi khi lưu hướng nhìn: ' + e.message);
      }
    };

    window.resetInitialView = function() {
      _initialViewYaw = null;
      _initialViewPitch = null;
      const yawInput = document.getElementById('initialViewYaw');
      const pitchInput = document.getElementById('initialViewPitch');
      if (yawInput) yawInput.value = '';
      if (pitchInput) pitchInput.value = '';
      _updateInitialViewStatus();
    };

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
      const sensorType = document.getElementById('sensorType')?.value || 'environment';
      const environmentFields = document.getElementById('environmentFields');
      const cameraFields = document.getElementById('cameraFields');

      if (sensorType === 'camera') {
        if (environmentFields) environmentFields.style.display = 'none';
        if (cameraFields) cameraFields.style.display = 'block';
      } else {
        if (environmentFields) environmentFields.style.display = 'block';
        if (cameraFields) cameraFields.style.display = 'none';
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
        await loadSensors();
        console.log(`✅ Refreshed sensors for room ${selectedRoomId} successfully`);
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

    const preloadedImages = new Set();
    function preloadRoomImage(imageUrl) {
      if (!imageUrl || preloadedImages.has(imageUrl)) return;
      preloadedImages.add(imageUrl);
      const cleanUrl = imageUrl.startsWith('http') ? imageUrl : window.location.origin + (imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl);
      const img = new Image();
      img.decoding = 'async';
      img.src = cleanUrl;
    }

    function preloadAllRoomImages() {
      if (!Array.isArray(rooms)) return;
      const doPreload = () => {
        rooms.forEach(r => {
          if (r.image) preloadRoomImage(r.image);
        });
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(doPreload, { timeout: 2500 });
      } else {
        setTimeout(doPreload, 500);
      }
    }

    async function loadRooms() {
      try {
        if (adminBuildings.length === 0) await loadBuildings();
        const res = await fetch('/api/rooms');
        rooms = await res.json();
        renderRooms();
        updateTargetRoomSelect();
        preloadAllRoomImages();

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
                      <button class="room-action-btn rename" title="Đổi tên phòng" onclick="inlineRenameRoom(event, ${room.id})">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
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

    window.sortRoomsAlphabetically = async function() {
      if (!rooms || rooms.length === 0) return;
      if (!confirm('Bạn có muốn tự động sắp xếp lại danh sách tất cả các phòng theo thứ tự tên A-Z (1, 2, 3...) không?')) return;
      
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      rooms.sort((a, b) => collator.compare(a.name, b.name));
      renderRooms();
      await saveRoomOrder(rooms.map(r => r.id));
      alert('✅ Đã cập nhật và lưu thứ tự phòng theo tên A-Z thành công!');
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

            const buildingKey = list.dataset.building;
            const bRooms = [...rooms.filter(r => (buildingKey === '__none__' ? !r.buildingId : r.buildingId === buildingKey))];
            
            const srcId = Number(globalDragSrc.dataset.roomId);
            const dstId = Number(this.dataset.roomId);
            const srcIdx = bRooms.findIndex(r => r.id === srcId);
            const dstIdx = bRooms.findIndex(r => r.id === dstId);

            if (srcIdx === -1 || dstIdx === -1) return;

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
        const token = sessionStorage.getItem('vt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/rooms/reorder', {
          method: 'POST',
          headers,
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

      const ivYaw = document.getElementById('initialViewYaw').value;
      const ivPitch = document.getElementById('initialViewPitch').value;

      const data = {
        target: targetId,
        yaw: Number(document.getElementById('yaw').value),
        pitch: Number(document.getElementById('pitch').value),
        rotation: Number(document.getElementById('rotation').value),
        color: document.getElementById('color').value,
        iconUrl,
        initialYaw: ivYaw !== '' ? Number(ivYaw) : null,
        initialPitch: ivPitch !== '' ? Number(ivPitch) : null
      };

      try {
        let url = `/api/admin/rooms/${selectedRoomId}/hotspots`;
        let method = 'POST';

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

      // Populate initial view direction
      if (hotspot.target) {
        const ivGroup = document.getElementById('initialViewGroup');
        if (ivGroup) ivGroup.style.display = 'block';
      }
      if (hotspot.initialYaw !== undefined && hotspot.initialYaw !== null) {
        _initialViewYaw = hotspot.initialYaw;
        _initialViewPitch = hotspot.initialPitch !== undefined ? hotspot.initialPitch : 0;
        const yawInput = document.getElementById('initialViewYaw');
        const pitchInput = document.getElementById('initialViewPitch');
        if (yawInput) yawInput.value = _initialViewYaw;
        if (pitchInput) pitchInput.value = _initialViewPitch;
      } else {
        _initialViewYaw = null;
        _initialViewPitch = null;
        const yawInput = document.getElementById('initialViewYaw');
        const pitchInput = document.getElementById('initialViewPitch');
        if (yawInput) yawInput.value = '';
        if (pitchInput) pitchInput.value = '';
      }
      _updateInitialViewStatus();

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
        iconUrl: hotspot.iconUrl || '',
        initialYaw: hotspot.initialYaw !== undefined && hotspot.initialYaw !== null ? Number(hotspot.initialYaw) : null,
        initialPitch: hotspot.initialPitch !== undefined && hotspot.initialPitch !== null ? Number(hotspot.initialPitch) : null
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

      const icons = { image: '🖼️', pdf: '📄', video: '🎥', '3d': '🧊', youtube: '▶️', web: '🌐', note: 'ℹ️', gallery: '📸' };
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
            applyCustomIconToHotspotElement(parent, media.mediaType, media.iconUrl);
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

      const customIconUrl = media.iconUrl || (customIcons && customIcons['media_' + media.mediaType]) || (customIcons && customIcons['media_doc']);
      const iconHtml = customIconUrl 
        ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">` 
        : '📁 ';
      const polyText = (media.highlightPolygon && media.highlightPolygon.length >= 3) ? ' [Vùng sáng]' : '';
      const labelText = `${media.title || 'Tư liệu'}${polyText}`;
      
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
            applyCustomIconToHotspotElement(parent, media.mediaType, media.iconUrl);
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
        const sensorSpecificIcon = !isCamera ? (sensor.iconUrl || sensor.sensors?.iconUrl) : null;
        const customIconUrl = sensorSpecificIcon || (customIcons && customIcons[customIconKey]);
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
              applyCustomIconToHotspotElement(parent, isCamera ? 'camera' : 'sensor', sensorSpecificIcon);
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
            const customIconUrl = media.iconUrl || (customIcons && customIcons['media_' + media.mediaType]) || (customIcons && customIcons['media_doc']);
            const iconHtml = customIconUrl 
              ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;">` 
              : '📁 ';
            const polyText = (media.highlightPolygon && media.highlightPolygon.length >= 3) ? ' [Vùng sáng]' : '';
            const labelText = `${media.title || 'Tư liệu'}${polyText}`;

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
                  applyCustomIconToHotspotElement(parent, media.mediaType, media.iconUrl);
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
                
                // Reset state for new creation
                closeMediaHotspotModal();

                // Reset modal header
                const modal = document.getElementById('mediaHotspotModal');
                const modalHeader = document.getElementById('mediaModalTitle') || (modal && modal.querySelector('.modal-header h3'));
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

    let selectedMediaIconFile = null;
    let selectedMediaImagesFiles = [];
    let selectedMediaPdfFile = null;
    let selectedMediaVideoFile = null;
    let selectedMedia3dFile = null;

    function handleMediaIconFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      selectedMediaIconFile = file;
      updateMediaIconPreview(URL.createObjectURL(file), file.name);
    }
    window.handleMediaIconFileSelect = handleMediaIconFileSelect;

    function updateMediaIconPreview(url, fileName) {
      const container = document.getElementById('mediaIconPreviewContainer');
      const img = document.getElementById('mediaIconPreview');
      const info = document.getElementById('mediaIconFileInfo');
      const clearBtn = document.getElementById('mediaClearIconBtn');
      if (url) {
        if (img) img.src = url;
        if (container) container.style.display = 'flex';
        if (info) info.textContent = fileName ? `File: ${fileName}` : 'Đang dùng icon tùy chỉnh';
        if (clearBtn) clearBtn.style.display = 'inline-block';
      } else {
        if (img) img.src = '';
        if (container) container.style.display = 'none';
        if (info) info.textContent = '';
        if (clearBtn) clearBtn.style.display = 'none';
      }
    }

    function clearMediaHotspotIcon() {
      selectedMediaIconFile = null;
      const fileInput = document.getElementById('mediaHotspotIconFile');
      if (fileInput) fileInput.value = '';
      const urlInput = document.getElementById('mediaHotspotIconUrl');
      if (urlInput) urlInput.value = '';
      updateMediaIconPreview('', '');
    }
    window.clearMediaHotspotIcon = clearMediaHotspotIcon;

    function handleMediaImagesSelect(event) {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      selectedMediaImagesFiles = files;
      const info = document.getElementById('mediaImagesListInfo');
      if (info) info.textContent = `📎 Đã chọn ${files.length} ảnh: ${files.map(f => f.name).join(', ')}`;
    }
    window.handleMediaImagesSelect = handleMediaImagesSelect;

    function handleMediaPdfSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      selectedMediaPdfFile = file;
      const info = document.getElementById('mediaPdfFileInfo');
      if (info) info.textContent = `📎 Đã chọn: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    }
    window.handleMediaPdfSelect = handleMediaPdfSelect;

    function handleMediaVideoSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      selectedMediaVideoFile = file;
      const info = document.getElementById('mediaVideoFileInfo');
      if (info) info.textContent = `📎 Đã chọn: ${file.name} (${(file.size / (1024*1024)).toFixed(1)} MB)`;
    }
    window.handleMediaVideoSelect = handleMediaVideoSelect;

    function handleMedia3dSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      selectedMedia3dFile = file;
      const info = document.getElementById('media3dFileInfo');
      if (info) info.textContent = `📎 Đã chọn: ${file.name} (${(file.size / (1024*1024)).toFixed(1)} MB)`;
    }
    window.handleMedia3dSelect = handleMedia3dSelect;

    async function uploadSingleFile(file) {
      if (!file) return null;
      const formData = new FormData();
      formData.append('media', file);

      const uploadRes = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: formData
      });

      const contentType = uploadRes.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const errorText = await uploadRes.text();
        throw new Error(`Upload file "${file.name}" thất bại (${uploadRes.status}): ${errorText.slice(0, 150)}`);
      }

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success || !uploadData.media?.url) {
        throw new Error(uploadData.error || `Upload file "${file.name}" thất bại`);
      }
      return uploadData.media.url;
    }

    let selectedStallAvatarFile = null;
    let stallSections = [];

    function renderStallSections() {
      const container = document.getElementById('stallSectionsContainer');
      if (!container) return;

      if (!stallSections || stallSections.length === 0) {
        container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:10px;background:rgba(255,255,255,0.02);border-radius:6px;">Chưa có mục nào. Nhấn "+ Thêm mục" hoặc các nút mẫu phía trên để tạo.</div>';
        return;
      }

      container.innerHTML = stallSections.map((sec, idx) => `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;position:relative;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <input type="text" placeholder="Tiêu đề mục (VD: THÔNG TIN LIÊN HỆ)" value="${(sec.title || '').replace(/"/g, '&quot;')}" oninput="stallSections[${idx}].title = this.value" style="flex:1;font-weight:700;font-size:12px;padding:4px 8px;border-radius:4px;margin-right:6px;">
            <button type="button" onclick="removeStallSection(${idx})" style="background:rgba(239,68,68,0.2);color:#f87171;border:none;border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer;" title="Xóa mục này">🗑️</button>
          </div>
          <textarea rows="2" placeholder="Nội dung mục (Mỗi dòng một ý)..." oninput="stallSections[${idx}].content = this.value" style="width:100%;font-size:12px;padding:6px;border-radius:4px;">${sec.content || ''}</textarea>
        </div>
      `).join('');
    }
    window.renderStallSections = renderStallSections;

    window.addStallSection = function(title = '', content = '') {
      stallSections.push({ title, content });
      renderStallSections();
    };

    window.removeStallSection = function(idx) {
      stallSections.splice(idx, 1);
      renderStallSections();
    };

    window.addStallSectionTemplate = function(type) {
      if (type === 'contact') {
        stallSections.push({
          title: 'THÔNG TIN LIÊN HỆ & VỊ TRÍ',
          content: '👤 Chủ sạp: Bà Nguyễn Thu Trang\n📞 Hotline / Zalo: 0988.123.456\n📍 Vị trí: Sạp A-15, Tầng 1 (Cổng Số 2)\n⏰ Thời gian mở cửa: 06:00 - 18:30'
        });
      } else if (type === 'products') {
        stallSections.push({
          title: 'MẶT HÀNG KINH DOANH CHÍNH',
          content: '🍇 Nho Ninh Thuận\n🥭 Xoài Cát Hòa Lộc\n🍊 Cam Sành Tiền Giang\n🥑 Bơ Sáp Đắk Lắk\n📦 Đóng thùng sỉ gửi tỉnh'
        });
      } else if (type === 'policy') {
        stallSections.push({
          title: 'CHÍNH SÁCH & PHƯƠNG THỨC THANH TOÁN',
          content: '🚚 Giao hàng: Miễn phí ship đơn từ 300k bán kính 5km\n💳 Thanh toán: Chuyển khoản QR, MoMo, Tiền mặt\n🏷️ Ưu đãi: Chiết khấu 5-10% cho đơn hàng số lượng lớn'
        });
      }
      renderStallSections();
    };

    window.toggleStallCardSection = function() {
      const body = document.getElementById('stallCardFormBody');
      if (body) {
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
      }
    };

    window.handleStallAvatarSelect = function(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      selectedStallAvatarFile = file;
      const previewWrap = document.getElementById('stallAvatarPreview');
      const previewImg = document.getElementById('stallAvatarPreviewImg');
      if (previewWrap && previewImg) {
        previewImg.src = URL.createObjectURL(file);
        previewWrap.style.display = 'block';
      }
      const urlInput = document.getElementById('stallAvatarUrl');
      if (urlInput) urlInput.value = file.name;
    };

    const STALL_PRESET_TEMPLATES = {
      clothing: {
        badge: "SẠP SỐ: B-12 • KHU THỜI TRANG & MAY MẶC",
        themeColor: "#4f46e5",
        avatar: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80",
        sidebarTitle: "CAM KẾT CHẤT LƯỢNG",
        sidebarContent: "- Vải nhập cao cấp, thoáng mát không bai xù\n- Đường may chuẩn đẹp, sắc nét\n- Đổi size miễn phí trong 3 ngày\n- Hàng mới về liên tục hàng tuần",
        sections: [
          {
            title: "THÔNG TIN LIÊN HỆ & VỊ TRÍ",
            content: "👤 Chủ sạp: Chị Mai Phương (Shop Mai Phương)\n📞 Hotline / Zalo: 0912.345.678\n📍 Vị trí: Sạp B-12, Tầng 2 (Khu Thời Trang Nữ)\n⏰ Giờ mở cửa: 08:00 - 20:30 (Cả tuần)"
          },
          {
            title: "MẶT HÀNG KINH DOANH CHÍNH",
            content: "Váy Đầm Dự Tiệc\nÁo Sơ Mi Công Sở\nQuần Jean Co Giãn\nÁo Thun Unisex\nChân Váy Xòe\nÁo Khoác Blazer"
          },
          {
            title: "CHÍNH SÁCH BÁN HÀNG & THANH TOÁN",
            content: "🚚 Giao hàng: Ship COD toàn quốc, hỗ trợ kiểm tra hàng trước khi nhận\n💳 Thanh toán: Quét mã VietQR, Chuyển khoản, MoMo, Tiền mặt\n🏷️ Ưu đãi: Giảm ngay 10% cho khách mua từ 3 sản phẩm trở lên"
          }
        ]
      },
      fish: {
        badge: "SẠP SỐ: A-05 • KHU HẢI SẢN TƯƠI SỐNG",
        themeColor: "#0284c7",
        avatar: "https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=600&q=80",
        sidebarTitle: "TIÊU CHUẨN ĐÁNH BẮT",
        sidebarContent: "- Hải sản đánh bắt trong ngày, bơi tại hồ\n- Không ướp hóa chất, bao tươi sống\n- Hỗ trợ làm sạch, phi lê miễn phí\n- Đổi trả 1-1 nếu cá ngộp/không tươi",
        sections: [
          {
            title: "THÔNG TIN LIÊN HỆ & VỊ TRÍ",
            content: "👤 Chủ sạp: Anh Hải Biển Đông\n📞 Hotline / Zalo: 0938.889.999\n📍 Vị trí: Sạp A-05, Cổng Số 1 (Khu Hải Sản Tươi)\n⏰ Giờ mở cửa: 04:30 - 18:00 (Mở sớm mỗi ngày)"
          },
          {
            title: "CÁC LOẠI HẢI SẢN TƯƠI SỐNG",
            content: "Cá Hồi Na Uy\nCá Thu Cắt Khúc\nCá Điêu Hồng Sống\nTôm Sú Biển\nMực Trứng Tươi\nCua Cà Mau\nNghêu - Sò - Ốc Hương"
          },
          {
            title: "DỊCH VỤ & PHƯƠNG THỨC GIAO NHẬN",
            content: "🚚 Giao hàng: Giao hỏa tốc bằng thùng xốp ướp đá trong 30-45 phút\n🔪 Sơ chế: Cắt khúc, phi lê, đánh vảy, làm sạch theo yêu cầu\n💳 Thanh toán: Chuyển khoản QR, Tiền mặt"
          }
        ]
      },
      meat: {
        badge: "SẠP SỐ: C-08 • KHU THỊT TƯƠI SẠCH MỖI NGÀY",
        themeColor: "#b91c1c",
        avatar: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=600&q=80",
        sidebarTitle: "CAM KẾT NGUỒN GỐC",
        sidebarContent: "- Thịt nóng mới mổ trong ngày từ 4h sáng\n- Có tem kiểm định thú y an toàn vệ sinh\n- Không chất tạo nạc, không bơm nước\n- Cân đúng, cân đủ tuyệt đối",
        sections: [
          {
            title: "THÔNG TIN LIÊN HỆ & VỊ TRÍ",
            content: "👤 Chủ sạp: Chú Bảy Thịt Sạch\n📞 Hotline / Zalo: 0903.654.321\n📍 Vị trí: Sạp C-08, Khu Nhà Lồng Chợ Chính\n⏰ Giờ mở cửa: 05:00 - 17:30"
          },
          {
            title: "DANH MỤC THỊT TƯƠI TRONG NGÀY",
            content: "Thịt Ba Chỉ Rút Sườn\nSườn Non Heo\nThịt Bò Tơ Củ Chi\nBắp Bò Hoa\nGà Ta Thả Vườn\nVịt Cỏ Tươi Sống\nGiò Heo Rút Xương"
          },
          {
            title: "CHÍNH SÁCH BÁN HÀNG & ĐẶT TRƯỚC",
            content: "🔪 Cắt thái: Hỗ trợ xay thịt, thái mỏng xào, chặt khúc theo yêu cầu\n📦 Đặt hàng: Nhận đặt số lượng lớn cho quán ăn, tiệc gia đình với giá sỉ\n💳 Thanh toán: VietQR, MoMo, Tiền mặt"
          }
        ]
      },
      vegetables: {
        badge: "SẠP SỐ: A-15 • KHU RAU CỦ NÔNG SẢN ĐÀ LẠT",
        themeColor: "#15803d",
        avatar: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
        sidebarTitle: "TIÊU CHUẨN VIETGAP",
        sidebarContent: "- Nông sản Đà Lạt chuẩn VietGAP\n- Hàng tươi mới về xe lúc 3h sáng\n- Không chất bảo quản, tồn dư thuốc BVTV\n- Nhặt sạch gốc rễ, tươi ngon từng bó",
        sections: [
          {
            title: "THÔNG TIN LIÊN HỆ & VỊ TRÍ",
            content: "👤 Chủ sạp: Cô Út Đà Lạt\n📞 Hotline / Zalo: 0988.234.567\n📍 Vị trí: Sạp A-15, Dãy Nông Sản Tươi (Gần Cổng 2)\n⏰ Giờ mở cửa: 05:30 - 19:00"
          },
          {
            title: "MẶT HÀNG RAU CỦ TƯƠI SẠCH",
            content: "Xà Lách Búp Mỡ\nBắp Cải Trắng Đà Lạt\nCà Chua Beef\nỚt Chuông Đà Lạt\nBông Cải Xanh (Broccoli)\nCà Rốt Baby\nKhoai Tây Sáp"
          },
          {
            title: "CHÍNH SÁCH GIAO HÀNG & THANH TOÁN",
            content: "🚚 Giao hàng: Đóng gói sạch sẽ, freeship bán kính 3km đơn từ 150k\n🛒 Combo: Cung cấp gói rau lẩu, gói canh sẵn sàng nấu\n💳 Thanh toán: Quét mã QR, Chuyển khoản, Tiền mặt"
          }
        ]
      },
      fruits: {
        badge: "SẠP SỐ: D-02 • HOA QUẢ NHẬP KHẨU & ĐẶC SẢN",
        themeColor: "#c2410c",
        avatar: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80",
        sidebarTitle: "CAM KẾT CHÍNH HÃNG",
        sidebarContent: "- 100% Trái cây chuẩn loại 1, rõ ràng xuất xứ\n- Bao ăn từng quả, lỗi 1 đổi 1\n- Nhận gói giỏ quà biếu sang trọng\n- Bảo quản kho lạnh tiêu chuẩn",
        sections: [
          {
            title: "THÔNG TIN LIÊN HỆ & VỊ TRÍ",
            content: "👤 Chủ sạp: Shop Trái Cây Bốn Mùa\n📞 Hotline / Zalo: 0977.112.233\n📍 Vị trí: Sạp D-02, Mặt Tiền Chợ (Khu Trái Cây)\n⏰ Giờ mở cửa: 07:00 - 21:00"
          },
          {
            title: "CÁC LOẠI TRÁI CÂY NỔI BẬT",
            content: "Nho Mẫu Đơn Nhật Bản\nCherry Đỏ Mỹ Size 9.5\nTáo Envy New Zealand\nSầu Riêng Musang King\nXoài Cát Hòa Lộc\nCam Canh Mọng Nước\nBơ Booth Đắk Lắk"
          },
          {
            title: "DỊCH VỤ GIỎ QUÀ & SHIP HỎA TỐC",
            content: "🎁 Giỏ quà: Thiết kế giỏ hoa quả dạm ngõ, biếu tặng theo ngân sách\n🚚 Giao hàng: Ship hỏa tốc 1h nội thành\n💳 Thanh toán: Chuyển khoản QR, Thẻ tín dụng, Tiền mặt"
          }
        ]
      },
      grocery: {
        badge: "SẠP SỐ: E-18 • BÁCH HÓA GIA VỊ & HÀNG KHÔ",
        themeColor: "#854d0e",
        avatar: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=600&q=80",
        sidebarTitle: "UY TÍN LÂU NĂM",
        sidebarContent: "- Đầy đủ gia vị truyền thống & nhập khẩu\n- Date mới nhất, hạn sử dụng dài\n- Giá sỉ tận gốc cho hộ gia đình & quán ăn\n- Đóng gói hút chân không miễn phí",
        sections: [
          {
            title: "THÔNG TIN LIÊN HỆ & VỊ TRÍ",
            content: "👤 Chủ sạp: Tiệm Tạp Hóa Kim Phát\n📞 Hotline / Zalo: 0908.776.655\n📍 Vị trí: Sạp E-18 & E-19, Khu Hàng Khô\n⏰ Giờ mở cửa: 06:00 - 19:30"
          },
          {
            title: "MẶT HÀNG BÁCH HÓA KINH DOANH",
            content: "Nước Mắm Phú Quốc Cốt\nGạo ST25 Ông Cua\nMiến Dong Làng So\nNấm Hương Rừng\nTôm Khô Cà Mau\nHạt Tiêu Phú Quốc\nNgũ Vị Hương & Thảo Mộc"
          },
          {
            title: "CHÍNH SÁCH BÁN BUÔN & VẬN CHUYỂN",
            content: "📦 Gửi hàng: Nhận đóng thùng gửi chành xe các tỉnh\n💳 Thanh toán: Linh hoạt xuất hóa đơn đỏ, Quét mã QR, Tiền mặt\n🏷️ Chiết khấu: Giảm 5-10% cho đơn hàng định kỳ"
          }
        ]
      },
      food: {
        badge: "SẠP SỐ: F-06 • KHU ẨM THỰC DÂN GIAN & ĂN VẶT",
        themeColor: "#b45309",
        avatar: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80",
        sidebarTitle: "VỆ SINH AN TOÀN",
        sidebarContent: "- Chế biến nóng hổi tại chỗ mỗi ngày\n- Nguyên liệu tươi sạch, dầu ăn mới 100%\n- Hương vị gia truyền đậm đà\n- Đóng hộp giấy bảo vệ môi trường",
        sections: [
          {
            title: "THÔNG TIN LIÊN HỆ & VỊ TRÍ",
            content: "👤 Chủ sạp: Quán Ăn Cô Ba\n📞 Hotline / Đặt món: 0945.334.455\n📍 Vị trí: Sạp F-06, Khu Ẩm Thực Chợ\n⏰ Giờ mở cửa: 06:30 - 19:00"
          },
          {
            title: "THỰC ĐƠN MÓN NGON MỖI NGÀY",
            content: "Bún Bò Huế Đặc Biệt\nBánh Xèo Giòn Rụm\nBánh Mì Kẹp Thịt Nướng\nGỏi Cuốn Tôm Thịt\nChè Bưởi An Giang\nNước Mía Sầu Riêng\nTrà Tắc Mật Ong"
          },
          {
            title: "ĐẶT MÓN ONLINE & GIAO HÀNG TẬN NƠI",
            content: "🛵 Giao hàng: Nhận ship qua Grab/ShopeeFood hoặc shipper riêng của quán\n📦 Đóng gói: Kèm đầy đủ rau sống, nước chấm và đồ ăn kèm\n💳 Thanh toán: Chuyển khoản VietQR, Tiền mặt"
          }
        ]
      }
    };

    let dynamicStallTemplates = [];

    async function loadStallTemplatesForDropdown() {
      const selectEl = document.getElementById('stallTemplateSelect');
      if (!selectEl) return;

      try {
        const res = await fetch('/api/stall-templates');
        const data = await res.json();
        if (data.success && Array.isArray(data.templates) && data.templates.length > 0) {
          dynamicStallTemplates = data.templates;
          let optionsHtml = '<option value="">-- Chọn mẫu để tự động điền nhanh thông tin --</option>';
          dynamicStallTemplates.forEach(t => {
            optionsHtml += `<option value="${t.id}">${t.icon || '🏪'} ${t.name || 'Mẫu sạp'}</option>`;
          });
          selectEl.innerHTML = optionsHtml;
        }
      } catch (err) {
        console.warn('Error loading dynamic stall templates:', err);
      }
    }
    window.loadStallTemplatesForDropdown = loadStallTemplatesForDropdown;

    window.applyStallTemplate = function(templateKey) {
      if (!templateKey) return;
      const tpl = dynamicStallTemplates.find(t => t.id === templateKey) || STALL_PRESET_TEMPLATES[templateKey];
      if (!tpl) return;

      const badgeInput = document.getElementById('stallBadge');
      if (badgeInput) badgeInput.value = tpl.badge || '';

      const themeColorInput = document.getElementById('stallThemeColor');
      const themeColorText = document.getElementById('stallThemeColorText');
      if (themeColorInput) themeColorInput.value = tpl.themeColor || '#0d3834';
      if (themeColorText) themeColorText.value = tpl.themeColor || '#0d3834';

      const avatarInput = document.getElementById('stallAvatarUrl');
      if (avatarInput) {
        avatarInput.value = tpl.avatar || '';
        selectedStallAvatarFile = null;
        updateStallAvatarPreview();
      }

      const sidebarTitleInput = document.getElementById('stallSidebarTitle');
      if (sidebarTitleInput) sidebarTitleInput.value = tpl.sidebarTitle || 'CAM KẾT CHẤT LƯỢNG';

      const sidebarContentInput = document.getElementById('stallSidebarContent');
      if (sidebarContentInput) sidebarContentInput.value = tpl.sidebarContent || '';

      stallSections = Array.isArray(tpl.sections) ? tpl.sections.map(s => ({ title: s.title, content: s.content })) : [];
      renderStallSections();

      // Ensure form body is open
      const formBody = document.getElementById('stallCardFormBody');
      if (formBody) formBody.style.display = 'block';

      // Visual feedback
      const selectEl = document.getElementById('stallTemplateSelect');
      if (selectEl) {
        selectEl.style.borderColor = '#10b981';
        setTimeout(() => { selectEl.style.borderColor = '#334155'; }, 1500);
      }
    };

    window.updateStallAvatarPreview = function() {
      const url = (document.getElementById('stallAvatarUrl')?.value || '').trim();
      const previewWrap = document.getElementById('stallAvatarPreview');
      const previewImg = document.getElementById('stallAvatarPreviewImg');
      if (previewWrap && previewImg) {
        if (url && (url.startsWith('http') || url.startsWith('/'))) {
          previewImg.src = url;
          previewWrap.style.display = 'block';
        } else if (!selectedStallAvatarFile) {
          previewWrap.style.display = 'none';
        }
      }
    };

    function closeMediaHotspotModal() {
      const modal = document.getElementById('mediaHotspotModal');
      if (modal) modal.classList.remove('active');
      const mediaForm = document.getElementById('mediaHotspotForm');
      if (mediaForm) mediaForm.reset();
      clearMediaHotspotIcon();
      selectedMediaImagesFiles = [];
      selectedMediaPdfFile = null;
      selectedMediaVideoFile = null;
      selectedMedia3dFile = null;
      selectedStallAvatarFile = null;
      stallSections = [];
      renderStallSections();
      const tplSelect = document.getElementById('stallTemplateSelect');
      if (tplSelect) tplSelect.value = '';
      const avatarPreview = document.getElementById('stallAvatarPreview');
      if (avatarPreview) avatarPreview.style.display = 'none';
      const imagesInfo = document.getElementById('mediaImagesListInfo');
      if (imagesInfo) imagesInfo.textContent = '';
      const pdfInfo = document.getElementById('mediaPdfFileInfo');
      if (pdfInfo) pdfInfo.textContent = '';
      const videoInfo = document.getElementById('mediaVideoFileInfo');
      if (videoInfo) videoInfo.textContent = '';
      const model3dInfo = document.getElementById('media3dFileInfo');
      if (model3dInfo) model3dInfo.textContent = '';
      editingMediaHotspotIndex = null;
      if (typeof clearPolygon === 'function') clearPolygon();
    }
    window.closeMediaHotspotModal = closeMediaHotspotModal;

    const mediaForm = document.getElementById('mediaHotspotForm');
    if (mediaForm) {
      mediaForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!selectedRoomId) {
          alert('Vui lòng chọn phòng');
          return;
        }

        const title = document.getElementById('mediaTitle').value.trim();
        const description = document.getElementById('mediaDescription').value.trim();

        let iconUrl = (document.getElementById('mediaHotspotIconUrl')?.value || '').trim();
        let imagesUrlText = (document.getElementById('mediaImagesUrl')?.value || '').trim();
        let pdfUrl = (document.getElementById('mediaPdfUrl')?.value || '').trim();
        let videoUrl = (document.getElementById('mediaVideoUrl')?.value || '').trim();
        let youtubeUrl = (document.getElementById('mediaYoutubeUrl')?.value || '').trim();
        let model3dUrl = (document.getElementById('media3dUrl')?.value || '').trim();
        let facebookUrl = (document.getElementById('mediaFacebookUrl')?.value || '').trim();
        let webUrl = (document.getElementById('mediaWebUrl')?.value || '').trim();

        try {
          // 1. Upload custom icon if selected
          if (selectedMediaIconFile) {
            iconUrl = await uploadSingleFile(selectedMediaIconFile);
          }

          // 2. Upload images if selected
          let finalImages = [];
          if (imagesUrlText) {
            finalImages = imagesUrlText.split(',').map(s => s.trim()).filter(Boolean);
          }
          if (selectedMediaImagesFiles && selectedMediaImagesFiles.length > 0) {
            for (const imgFile of selectedMediaImagesFiles) {
              const uploadedImgUrl = await uploadSingleFile(imgFile);
              if (uploadedImgUrl) finalImages.push(uploadedImgUrl);
            }
          }

          // 3. Upload PDF if selected
          if (selectedMediaPdfFile) {
            pdfUrl = await uploadSingleFile(selectedMediaPdfFile);
          }

          // 4. Upload Video if selected
          if (selectedMediaVideoFile) {
            videoUrl = await uploadSingleFile(selectedMediaVideoFile);
          }

          // 5. Upload 3D model if selected
          if (selectedMedia3dFile) {
            model3dUrl = await uploadSingleFile(selectedMedia3dFile);
          }

          // 6. Upload Stall Avatar if selected
          let stallAvatarUrl = (document.getElementById('stallAvatarUrl')?.value || '').trim();
          if (selectedStallAvatarFile) {
            stallAvatarUrl = await uploadSingleFile(selectedStallAvatarFile);
          }
          const stallBadge = (document.getElementById('stallBadge')?.value || '').trim();
          const stallThemeColor = (document.getElementById('stallThemeColor')?.value || '').trim();
          const stallSidebarTitle = (document.getElementById('stallSidebarTitle')?.value || '').trim();
          const stallSidebarContent = (document.getElementById('stallSidebarContent')?.value || '').trim();
          
          let validStallSections = stallSections.map(s => ({
            title: (s.title || '').trim(),
            content: (s.content || '').trim()
          })).filter(s => s.title || s.content);

          let stallCard = null;
          if (stallAvatarUrl || stallBadge || stallSidebarTitle || stallSidebarContent || validStallSections.length > 0) {
            stallCard = {
              avatar: stallAvatarUrl || undefined,
              badge: stallBadge || undefined,
              themeColor: stallThemeColor || '#0d3834',
              sidebarTitle: stallSidebarTitle || undefined,
              sidebarContent: stallSidebarContent || undefined,
              sections: validStallSections
            };
          }

          const mediaItems = {
            images: finalImages.length > 0 ? finalImages : undefined,
            pdfUrl: pdfUrl || undefined,
            videoUrl: videoUrl || undefined,
            youtubeUrl: youtubeUrl || undefined,
            model3dUrl: model3dUrl || undefined,
            facebookUrl: facebookUrl || undefined,
            webUrl: webUrl || undefined,
            stallCard: stallCard || undefined
          };

          // Clean undefined keys
          Object.keys(mediaItems).forEach(k => mediaItems[k] === undefined && delete mediaItems[k]);

          // Pick primary mediaUrl for backward compatibility
          const primaryMediaUrl = (stallCard && stallCard.avatar) || finalImages[0] || pdfUrl || videoUrl || youtubeUrl || model3dUrl || facebookUrl || webUrl || '';

          const mediaHotspot = {
            yaw: parseFloat(document.getElementById('mediaYaw').value) || 0,
            pitch: parseFloat(document.getElementById('mediaPitch').value) || 0,
            title: title || (stallCard && stallCard.badge) || 'Tư liệu',
            description: description,
            iconUrl: iconUrl || null,
            mediaType: stallCard ? 'stall' : 'all',
            mediaUrl: primaryMediaUrl,
            mediaItems: Object.keys(mediaItems).length > 0 ? mediaItems : null,
            highlightPolygon: polygonPoints.length >= 3 ? polygonPoints.map(p => [...p]) : null
          };

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
            closeMediaHotspotModal();
            await loadRooms();
            loadMediaHotspots();
            loadPanoramaPreview();
            alert('✅ ' + (method === 'PATCH' ? 'Cập nhật tư liệu thành công!' : 'Đã thêm tư liệu thành công!'));
          } else {
            alert('Lỗi: ' + data.error);
          }
        } catch (err) {
          console.error(err);
          alert('Lỗi khi lưu tư liệu: ' + err.message);
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
          const room = rooms.find(r => r.id === selectedRoomId);
          renderMediaHotspots(room?.mediaHotspots || []);
        }
      } catch (err) {
        console.error('Load media error:', err);
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

      list.innerHTML = mediaHotspots.map((media, idx) => {
        const polyText = (media.highlightPolygon && media.highlightPolygon.length >= 3) ? '<span style="font-size:11px;color:#111827;background:rgba(251,191,36,0.9);padding:2px 6px;border-radius:4px;margin-left:5px;display:inline-block;vertical-align:middle;">🔲 Có vùng sáng</span>' : '';
        
        // Badges for included media types
        const items = media.mediaItems || {};
        let badges = [];
        if (items.stallCard || media.stallCard || items.profileCard || media.mediaType === 'stall') badges.push('🏪 Sạp hàng');
        if (items.images?.length || media.mediaType === 'image' || media.mediaType === 'gallery') badges.push('🖼️ Ảnh');
        if (items.pdfUrl || media.mediaType === 'pdf') badges.push('📄 PDF');
        if (items.videoUrl || media.mediaType === 'video') badges.push('🎥 Video');
        if (items.youtubeUrl || media.mediaType === 'youtube') badges.push('▶️ YouTube');
        if (items.model3dUrl || media.mediaType === '3d') badges.push('🧊 3D');
        if (items.facebookUrl || media.mediaType === 'facebook') badges.push('👍 FB');
        if (items.webUrl || media.mediaType === 'web') badges.push('🌐 Web');
        if (media.description) badges.push('ℹ️ Ghi chú');
        const badgeHtml = badges.length > 0 ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${badges.map(b => `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(37,99,235,0.2);color:#93c5fd;border:1px solid rgba(37,99,235,0.3);">${b}</span>`).join('')}</div>` : '';

        const defaultIcon = (items.stallCard || media.mediaType === 'stall') ? '🏪' : '📁';
        const customIconUrl = media.iconUrl || (customIcons && customIcons['media_' + media.mediaType]) || (customIcons && customIcons['media_doc']);
        const iconHtml = customIconUrl 
          ? `<img src="${customIconUrl}" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;">` 
          : defaultIcon + ' ';

        return `
        <div class="hotspot-item" style="background: rgba(22,26,36,0.94); border-left-color: #27ae60; border-color: rgba(39,174,96,0.25); box-shadow: 0 10px 30px rgba(0,0,0,0.18);">
          <h5 style="display: flex; align-items: center; gap: 4px;">${iconHtml}${media.title || 'Tư liệu'}${polyText}</h5>
          <div class="hotspot-info">
            ${media.description ? `<span>${media.description.length > 60 ? media.description.slice(0,60)+'...' : media.description}</span>` : ''}
            ${badgeHtml}
            <span style="margin-top:4px;"><strong>Yaw:</strong> ${media.yaw?.toFixed(2) || '?'}° | <strong>Pitch:</strong> ${media.pitch?.toFixed(2) || '?'}°</span>
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

      document.getElementById('mediaTitle').value = media.title || '';
      document.getElementById('mediaDescription').value = media.description || '';
      document.getElementById('mediaYaw').value = media.yaw || 0;
      document.getElementById('mediaPitch').value = media.pitch || 0;

      // Icon
      const iconUrl = media.iconUrl || '';
      if (document.getElementById('mediaHotspotIconUrl')) {
        document.getElementById('mediaHotspotIconUrl').value = iconUrl;
      }
      updateMediaIconPreview(iconUrl, '');

      // Media items (support new format & legacy format)
      const items = media.mediaItems || {};
      
      // Images / gallery
      let images = items.images || [];
      if (!images.length && (media.mediaType === 'image' || media.mediaType === 'gallery') && media.mediaUrl && !media.mediaUrl.startsWith('{')) {
        images = media.mediaUrl.split(',').map(s => s.trim()).filter(Boolean);
      }
      document.getElementById('mediaImagesUrl').value = images.join(', ');
      document.getElementById('mediaImagesListInfo').textContent = images.length ? `🖼️ Có ${images.length} ảnh đã lưu` : '';

      // PDF
      const pdfUrl = items.pdfUrl || (media.mediaType === 'pdf' ? media.mediaUrl : '') || '';
      document.getElementById('mediaPdfUrl').value = (pdfUrl && !pdfUrl.startsWith('{')) ? pdfUrl : '';
      document.getElementById('mediaPdfFileInfo').textContent = (pdfUrl && !pdfUrl.startsWith('{')) ? `📄 File đã lưu: ${pdfUrl.split('/').pop()}` : '';

      // Video
      const videoUrl = items.videoUrl || (media.mediaType === 'video' ? media.mediaUrl : '') || '';
      document.getElementById('mediaVideoUrl').value = (videoUrl && !videoUrl.startsWith('{')) ? videoUrl : '';
      document.getElementById('mediaVideoFileInfo').textContent = (videoUrl && !videoUrl.startsWith('{')) ? `🎥 File đã lưu: ${videoUrl.split('/').pop()}` : '';

      // YouTube
      const ytUrl = items.youtubeUrl || (media.mediaType === 'youtube' ? media.mediaUrl : '') || '';
      document.getElementById('mediaYoutubeUrl').value = (ytUrl && !ytUrl.startsWith('{')) ? ytUrl : '';

      // 3D Model
      const model3dUrl = items.model3dUrl || (media.mediaType === '3d' ? media.mediaUrl : '') || '';
      document.getElementById('media3dUrl').value = (model3dUrl && !model3dUrl.startsWith('{')) ? model3dUrl : '';
      document.getElementById('media3dFileInfo').textContent = (model3dUrl && !model3dUrl.startsWith('{')) ? `🧊 Model đã lưu: ${model3dUrl.split('/').pop()}` : '';

      // Facebook
      const fbUrl = items.facebookUrl || (media.mediaType === 'facebook' ? media.mediaUrl : '') || '';
      document.getElementById('mediaFacebookUrl').value = (fbUrl && !fbUrl.startsWith('{')) ? fbUrl : '';

      // Web
      const webUrl = items.webUrl || (media.mediaType === 'web' ? media.mediaUrl : '') || '';
      document.getElementById('mediaWebUrl').value = (webUrl && !webUrl.startsWith('{')) ? webUrl : '';

      // Stall Card
      const stallCard = items.stallCard || media.stallCard || items.profileCard;
      selectedStallAvatarFile = null;
      if (stallCard) {
        document.getElementById('stallBadge').value = stallCard.badge || '';
        document.getElementById('stallThemeColor').value = stallCard.themeColor || '#0d3834';
        document.getElementById('stallThemeColorText').value = stallCard.themeColor || '#0d3834';
        document.getElementById('stallAvatarUrl').value = stallCard.avatar || stallCard.image || '';
        updateStallAvatarPreview();
        document.getElementById('stallSidebarTitle').value = stallCard.sidebarTitle || 'CAM KẾT CHẤT LƯỢNG';
        document.getElementById('stallSidebarContent').value = stallCard.sidebarContent || '';
        stallSections = Array.isArray(stallCard.sections) ? stallCard.sections.map(s => ({ ...s })) : [];
        renderStallSections();
      } else {
        document.getElementById('stallBadge').value = '';
        document.getElementById('stallThemeColor').value = '#0d3834';
        document.getElementById('stallThemeColorText').value = '#0d3834';
        document.getElementById('stallAvatarUrl').value = '';
        updateStallAvatarPreview();
        document.getElementById('stallSidebarTitle').value = 'CAM KẾT CHẤT LƯỢNG';
        document.getElementById('stallSidebarContent').value = '';
        stallSections = [];
        renderStallSections();
      }

      // Restore polygon for 3d / highlight
      polygonPoints = (Array.isArray(media.highlightPolygon)) ? media.highlightPolygon.map(p => [...p]) : [];
      const polyStatus = document.getElementById('polygonStatus');
      if (polyStatus && polygonPoints.length > 0) polyStatus.textContent = `✅ ${polygonPoints.length} điểm đã lưu.`;
      setTimeout(() => updatePolygonPreviewHotspots(), 500);

      const modal = document.getElementById('mediaHotspotModal');
      const modalHeader = document.getElementById('mediaModalTitle');
      if (modalHeader) modalHeader.textContent = '📝 Chỉnh sửa Tư liệu';

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
      selectedDbSensorId = null;
      sensorModalTitle.textContent = '🌡️ Thêm Thiết bị IoT';

      sensorForm.reset();
      clearSensorIcon();
      await loadAllDbSensors();
      const telemetryInfo = document.getElementById('dbTelemetryInfo');
      if (telemetryInfo) {
        telemetryInfo.innerHTML = '<em>Chọn thiết bị IoT từ danh sách ở trên để xem dữ liệu đo đạc realtime trong Database.</em>';
      }
      document.getElementById('sensorType').value = 'environment';
      const useWebcamEl = document.getElementById('useWebcam');
      if (useWebcamEl) useWebcamEl.checked = false;
      document.getElementById('sensorYaw').value = Number(yaw || 0).toFixed(2);
      document.getElementById('sensorPitch').value = Number(pitch || 0).toFixed(2);
      resetCameraDiagnostics();
      setCameraConnectionStatus('', '#7f8c8d');
      toggleSensorFields();

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

    // Inline rename: nhấn nút ✏️ để đổi tên phòng ngay tại chỗ
    window.inlineRenameRoom = function(event, roomId) {
      event.stopPropagation();
      const btn = event.currentTarget;
      const roomItem = btn.closest('.room-item');
      if (!roomItem) return;
      const nameEl = roomItem.querySelector('.room-item-name');
      if (!nameEl) return;

      const room = rooms.find(r => r.id === roomId);
      if (!room) return;

      // Nếu đang có input rồi thì focus vào đó
      if (nameEl.querySelector('input')) {
        nameEl.querySelector('input').focus();
        return;
      }

      const oldName = room.name;

      // Ẩn nút rename, hiện input
      btn.style.display = 'none';
      nameEl.textContent = '';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = oldName;
      input.style.cssText = 'width:100%;background:rgba(30,40,60,0.7);border:1px solid rgba(99,179,237,0.9);border-radius:4px;padding:3px 7px;font-size:13px;font-weight:600;color:#fff;outline:none;font-family:inherit;min-width:0;';
      nameEl.appendChild(input);
      input.focus();
      input.select();

      // Hàm lưu — chỉ gọi từ blur để đảm bảo không bị double-call
      async function onBlur() {
        btn.style.display = '';
        const newName = input.value.trim();
        if (!newName || newName === oldName) {
          nameEl.textContent = oldName;
          return;
        }
        nameEl.textContent = '⏳ ' + newName;
        try {
          const rawRes = await fetch(`/api/admin/rooms/${roomId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
          });
          const res = await rawRes.json();
          if (res && res.success) {
            // Cập nhật tên trong local array để giữ nguyên thứ tự phòng
            const localRoom = rooms.find(r => r.id === roomId);
            if (localRoom) localRoom.name = newName;
            renderRooms();
            updateTargetRoomSelect();
            if (selectedRoomId === roomId) {
              // Cập nhật tiêu đề top bar
              const titleEl = document.getElementById('currentRoomTitle');
              if (titleEl) titleEl.textContent = `🏠 ${newName}`;
            }
          } else {
            alert('Lỗi: ' + (res?.error || 'Không rõ nguyên nhân.'));
            nameEl.textContent = oldName;
          }
        } catch(e) {
          console.error('[Rename error]', e);
          nameEl.textContent = oldName;
        }
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          input.blur(); // blur → onBlur xử lý lưu
        }
        if (e.key === 'Escape') {
          input.removeEventListener('blur', onBlur); // bỏ listener để không lưu
          btn.style.display = '';
          nameEl.textContent = oldName;
        }
      });

      input.addEventListener('blur', onBlur);
    };

    // (Handled inside panorama mousedown)

    // ===== SENSOR MANAGEMENT =====
    const addSensorBtn = document.getElementById('addSensorBtn');
    const sensorModal = document.getElementById('sensorModal');
    const sensorForm = document.getElementById('sensorForm');
    const sensorModalTitle = document.getElementById('sensorModalTitle');
    let currentRoomApiConfig = null;

    const sensorIconUrlInput = document.getElementById('sensorIconUrl');
    const sensorIconFileInput = document.getElementById('sensorIconFile');
    const sensorIconPreviewContainer = document.getElementById('sensorIconPreviewContainer');
    const sensorIconPreview = document.getElementById('sensorIconPreview');
    const sensorIconFileInfo = document.getElementById('sensorIconFileInfo');
    const sensorClearIconBtn = document.getElementById('sensorClearIconBtn');
    let selectedSensorIconFile = null;

    function updateSensorIconPreview(url, fileName) {
      if (url) {
        if (sensorIconPreview) sensorIconPreview.src = url;
        if (sensorIconPreviewContainer) sensorIconPreviewContainer.style.display = 'flex';
        if (sensorIconFileInfo) sensorIconFileInfo.textContent = fileName ? `File: ${fileName}` : 'Đang dùng icon tùy chỉnh';
        if (sensorClearIconBtn) sensorClearIconBtn.style.display = 'inline-block';
      } else {
        if (sensorIconPreview) sensorIconPreview.src = '';
        if (sensorIconPreviewContainer) sensorIconPreviewContainer.style.display = 'none';
        if (sensorIconFileInfo) sensorIconFileInfo.textContent = '';
        if (sensorClearIconBtn) sensorClearIconBtn.style.display = 'none';
      }
    }

    function clearSensorIcon() {
      selectedSensorIconFile = null;
      if (sensorIconFileInput) sensorIconFileInput.value = '';
      if (sensorIconUrlInput) sensorIconUrlInput.value = '';
      updateSensorIconPreview('', '');
    }
    window.clearSensorIcon = clearSensorIcon;

    if (sensorIconFileInput) {
      sensorIconFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          selectedSensorIconFile = file;
          const objectUrl = URL.createObjectURL(file);
          updateSensorIconPreview(objectUrl, file.name);
        }
      });
    }

    if (sensorIconUrlInput) {
      sensorIconUrlInput.addEventListener('input', () => {
        const url = (sensorIconUrlInput.value || '').trim();
        if (url) {
          selectedSensorIconFile = null;
          if (sensorIconFileInput) sensorIconFileInput.value = '';
          updateSensorIconPreview(url, '');
        } else if (!selectedSensorIconFile) {
          updateSensorIconPreview('', '');
        }
      });
    }

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
          const sensorSpecificIcon = sensor.iconUrl || sensor.sensors?.iconUrl;
          const customIconUrl = sensorSpecificIcon || (customIcons && customIcons.sensor);
          const iconHtml = customIconUrl 
            ? `<img src="${customIconUrl}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;">` 
            : defaultIcon + ' ';

          const sData = sensor.sensors || sensor.data || {};
          const getVal = (v) => {
            if (v === null || v === undefined) return null;
            if (typeof v === 'object' && v.value !== undefined && v.value !== null) return v.value;
            if (typeof v === 'number') return v;
            if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
            return null;
          };

          const tempVal = getVal(sData.temperature ?? sData.temp);
          const humVal = getVal(sData.humidity ?? sData.hum);
          const pm25Val = getVal(sData.pm25 ?? sData.pm2_5);

          return `
            <div class="hotspot-item" style="background: rgba(255, 107, 107, 0.12); border: 1px solid rgba(255, 107, 107, 0.25); border-left: 4px solid #FF6B6B;">
              <h5 style="display: flex; align-items: center; gap: 4px; color: #ffffff;">${iconHtml}${sensor.name}</h5>
              <div class="hotspot-info" style="color: rgba(255, 255, 255, 0.72);">
                <span><strong>Nhiệt độ:</strong> ${tempVal !== null ? tempVal + '°C' : '--'}</span>
                <span><strong>Độ ẩm:</strong> ${humVal !== null ? humVal + '%' : '--'}</span>
                ${pm25Val !== null ? `<span><strong>PM2.5:</strong> ${pm25Val} µg/m³</span>` : ''}
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

    async function loadAllDbSensors() {
      const selectEl = document.getElementById('dbSensorSelect');
      if (!selectEl) return;

      try {
        const res = await fetch('/api/sensors');
        const data = await res.json();
        if (data.success && Array.isArray(data.sensors)) {
          allDbSensors = data.sensors;
          let html = '<option value="">-- ➕ Tạo mới thiết bị (Không có trong DB) --</option>';
          
          allDbSensors.forEach(s => {
            let statusText = '';
            if (s.roomId === null || s.roomId === undefined) {
              statusText = 'Chưa gán phòng';
            } else if (Number(s.roomId) === Number(selectedRoomId)) {
              statusText = 'Thuộc phòng hiện tại';
            } else {
              const r = rooms.find(room => Number(room.id) === Number(s.roomId));
              statusText = `Thuộc: ${r ? r.name : 'Phòng ' + s.roomId}`;
            }
            const icon = s.type === 'camera' ? '📹' : '🌡️';
            html += `<option value="${s.id}">${icon} ${s.name} (ID: ${s.id}) - [${statusText}]</option>`;
          });

          selectEl.innerHTML = html;
          if (selectedDbSensorId) {
            selectEl.value = String(selectedDbSensorId);
          } else {
            selectEl.value = '';
          }
        }
      } catch (err) {
        console.warn('Lỗi khi tải danh sách thiết bị từ DB:', err);
      }
    }

    window.onSelectDbSensor = function() {
      const selectEl = document.getElementById('dbSensorSelect');
      const selectedId = selectEl ? selectEl.value : '';
      if (!selectedId) {
        selectedDbSensorId = null;
        const telemetryInfo = document.getElementById('dbTelemetryInfo');
        if (telemetryInfo) {
          telemetryInfo.innerHTML = '<em>Chọn thiết bị IoT từ danh sách ở trên để xem dữ liệu đo đạc realtime trong Database.</em>';
        }
        return;
      }

      selectedDbSensorId = Number(selectedId);
      const sensor = allDbSensors.find(s => String(s.id) === String(selectedDbSensorId) || Number(s.id) === selectedDbSensorId);
      if (!sensor) return;

      // Tự động điền dữ liệu thiết bị từ DB vào form
      if (sensor.name) document.getElementById('sensorName').value = sensor.name;
      if (sensor.type) {
        document.getElementById('sensorType').value = sensor.type;
        toggleSensorFields();
      }

      if (sensor.type === 'camera') {
        if (sensor.camera) {
          const isWebcam = sensor.camera.streamUrl === 'webcam://0';
          document.getElementById('useWebcam').checked = isWebcam;
          document.getElementById('cameraStreamUrl').value = sensor.camera.streamUrl || '';
          document.getElementById('cameraSnapshotUrl').value = sensor.camera.snapshotUrl || '';
          document.getElementById('cameraResolution').value = sensor.camera.resolution || '1920x1080';
          document.getElementById('cameraStatus').value = sensor.camera.status || 'online';
          document.getElementById('cameraNotes').value = sensor.camera.notes || '';
          if (isWebcam) toggleWebcam();
        }
      } else {
        const telemetryInfo = document.getElementById('dbTelemetryInfo');
        if (telemetryInfo) {
          const temp = sensor.sensors?.temperature?.value ?? sensor.sensors?.temperature;
          const hum = sensor.sensors?.humidity?.value ?? sensor.sensors?.humidity;
          const pm = sensor.sensors?.pm25?.value ?? sensor.sensors?.pm25;

          let parts = [];
          if (temp !== undefined && temp !== null) parts.push(`🌡️ Nhiệt độ: <strong>${temp}°C</strong>`);
          if (hum !== undefined && hum !== null) parts.push(`💧 Độ ẩm: <strong>${hum}%</strong>`);
          if (pm !== undefined && pm !== null) parts.push(`🌫️ PM2.5: <strong>${pm} µg/m³</strong>`);

          if (sensor.sensors?.grafanaUrl) {
            document.getElementById('sensorGrafanaUrl').value = sensor.sensors.grafanaUrl;
          }

          const iconUrl = sensor.iconUrl || sensor.sensors?.iconUrl || '';
          if (sensorIconUrlInput) sensorIconUrlInput.value = iconUrl;
          updateSensorIconPreview(iconUrl, '');

          telemetryInfo.innerHTML = parts.length > 0
            ? parts.join('<br>') + `<div style="font-size:11px;color:#64748b;margin-top:6px;">⏰ Lần cập nhật cuối: ${sensor.lastUpdate ? new Date(sensor.lastUpdate).toLocaleString('vi-VN') : 'Mới khởi tạo'}</div>`
            : '<span style="color:#64748b;">Thiết bị này chưa gửi dữ liệu telemetry. Khi thiết bị đo đạc từ bên ngoài, dữ liệu sẽ tự động hiển thị.</span>';
        }
      }
    };

    function closeSensorModal() {
      sensorModal.classList.remove('active');
      editingSensorIndex = null;
      selectedDbSensorId = null;
      setAddSensorPositionMode(false);
      sensorForm.reset();
      clearSensorIcon();
      const dbSelect = document.getElementById('dbSensorSelect');
      if (dbSelect) dbSelect.value = '';
      const telemetryInfo = document.getElementById('dbTelemetryInfo');
      if (telemetryInfo) {
        telemetryInfo.innerHTML = '<em>Chọn thiết bị IoT từ danh sách ở trên để xem dữ liệu đo đạc realtime trong Database.</em>';
      }
      document.getElementById('sensorType').value = 'environment';
      document.getElementById('useWebcam').checked = false;
      document.getElementById('sensorYaw').value = 0;
      document.getElementById('sensorPitch').value = 0;
      stopWebcam(); // Stop webcam if running
      resetCameraDiagnostics();
      setCameraConnectionStatus('', '#7f8c8d');
      toggleSensorFields(); // Reset to show environment fields
    }

    sensorForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const sensorType = document.getElementById('sensorType').value;
      console.log('📝 Sensor Type:', sensorType);

      let sensorIconUrl = sensorIconUrlInput ? sensorIconUrlInput.value.trim() : '';
      if (sensorType === 'environment' && selectedSensorIconFile) {
        if (sensorIconFileInfo) sensorIconFileInfo.textContent = 'Đang tải icon lên...';
        try {
          sensorIconUrl = await uploadHotspotIconFile(selectedSensorIconFile);
          if (sensorIconUrlInput) sensorIconUrlInput.value = sensorIconUrl;
          if (sensorIconFileInfo) sensorIconFileInfo.textContent = `Đã upload: ${selectedSensorIconFile.name}`;
        } catch (uploadErr) {
          alert('Tải ảnh icon cảm biến thất bại: ' + uploadErr.message);
          if (sensorIconFileInfo) sensorIconFileInfo.textContent = '';
          return;
        }
      }

      let sensorData = {
        name: document.getElementById('sensorName').value,
        roomId: selectedRoomId,
        type: sensorType,
        position: {
          yaw: Number(document.getElementById('sensorYaw').value || 0),
          pitch: Number(document.getElementById('sensorPitch').value || 0)
        },
        iconUrl: sensorType === 'environment' ? (sensorIconUrl || null) : null
      };

      const selectedDbVal = document.getElementById('dbSensorSelect')?.value;
      const currentDbSensorId = selectedDbVal ? Number(selectedDbVal) : null;

      // Build data based on sensor type
      if (sensorType === 'environment') {
        const grafanaUrl = (() => {
          let val = (document.getElementById('sensorGrafanaUrl')?.value || '').trim();
          if (val.includes('<iframe') && val.includes('src=')) {
            const match = val.match(/src=["']?([^"'\s>]+)["']?/i);
            if (match && match[1]) {
              val = match[1];
            }
          }
          return val.replace(/&amp;/g, '&');
        })();

        const dbSensor = currentDbSensorId ? allDbSensors.find(s => String(s.id) === String(currentDbSensorId) || Number(s.id) === currentDbSensorId) : null;
        const existingSensors = dbSensor?.sensors || (editingSensorIndex !== null ? roomSensors[editingSensorIndex]?.sensors : {}) || {};

        sensorData.sensors = {
          ...existingSensors,
          ...(grafanaUrl ? { grafanaUrl } : {})
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

        if (currentDbSensorId) {
          const dbSensor = allDbSensors.find(s => String(s.id) === String(currentDbSensorId) || Number(s.id) === currentDbSensorId);
          // If sensor is not assigned to any room OR already assigned to this room: update existing device
          if (dbSensor && (!dbSensor.roomId || String(dbSensor.roomId) === String(selectedRoomId))) {
            url = `/api/sensors/${currentDbSensorId}`;
            method = 'PUT';
          } else {
            // Sensor belongs to ANOTHER room -> create a new cloned sensor for this room
            url = '/api/sensors';
            method = 'POST';
          }
        } else if (editingSensorIndex !== null) {
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
          alert('✅ ' + (method === 'PUT' ? `Cập nhật ${deviceType} thành công!` : `Đã gán / thêm ${deviceType} thành công!`));
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
      selectedDbSensorId = sensor.id;
      sensorModalTitle.textContent = '✏️ Chỉnh sửa ' + (sensor.type === 'camera' ? 'Camera' : 'Cảm biến');

      await loadAllDbSensors();
      document.getElementById('sensorName').value = sensor.name;
      document.getElementById('sensorType').value = sensor.type || 'environment';
      document.getElementById('sensorYaw').value = sensor.position?.yaw || 0;
      document.getElementById('sensorPitch').value = sensor.position?.pitch || 0;
      setAddSensorPositionMode(false);

      // Toggle fields based on sensor type
      toggleSensorFields();

      if (sensor.type === 'camera') {
        clearSensorIcon();
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
        // Fill environment sensor telemetry preview
        const iconUrl = sensor.iconUrl || sensor.sensors?.iconUrl || '';
        if (sensorIconUrlInput) sensorIconUrlInput.value = iconUrl;
        updateSensorIconPreview(iconUrl, '');

        const telemetryInfo = document.getElementById('dbTelemetryInfo');
        if (telemetryInfo) {
          const temp = sensor.sensors?.temperature?.value ?? sensor.sensors?.temperature;
          const hum = sensor.sensors?.humidity?.value ?? sensor.sensors?.humidity;
          const pm = sensor.sensors?.pm25?.value ?? sensor.sensors?.pm25;

          let parts = [];
          if (temp !== undefined && temp !== null) parts.push(`🌡️ Nhiệt độ: <strong>${temp}°C</strong>`);
          if (hum !== undefined && hum !== null) parts.push(`💧 Độ ẩm: <strong>${hum}%</strong>`);
          if (pm !== undefined && pm !== null) parts.push(`🌫️ PM2.5: <strong>${pm} µg/m³</strong>`);

          document.getElementById('sensorGrafanaUrl').value = sensor.sensors?.grafanaUrl || '';

          telemetryInfo.innerHTML = parts.length > 0
            ? parts.join('<br>') + `<div style="font-size:11px;color:#64748b;margin-top:6px;">⏰ Lần cập nhật cuối: ${sensor.lastUpdate ? new Date(sensor.lastUpdate).toLocaleString('vi-VN') : 'Mới khởi tạo'}</div>`
            : '<span style="color:#64748b;">Thiết bị này chưa gửi dữ liệu telemetry trong Database.</span>';
        }
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

      const customIconUrl = media.iconUrl || (customIcons && customIcons['media_' + media.mediaType]) || (customIcons && customIcons['media_doc']);
      const iconHtml = customIconUrl ? `<img src="${customIconUrl}" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;margin-right:8px;border-radius:4px;">` : '📁 ';
      title.innerHTML = `${iconHtml}${media.title || 'Tư liệu'}`;

      const items = media.mediaItems || {};
      let sectionsHtml = [];

      // 1. Description / Note
      if (media.description) {
        sectionsHtml.push(`
          <div style="color:#f3f4f6; font-size:14px; line-height:1.6; padding:14px 16px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:8px; white-space:pre-wrap;">
            ${media.description}
          </div>
        `);
      }

      // 2. Images / Gallery
      let images = items.images || [];
      if (!images.length && (media.mediaType === 'image' || media.mediaType === 'gallery') && media.mediaUrl && !media.mediaUrl.startsWith('{')) {
        images = media.mediaUrl.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (images.length > 0) {
        const imagesHtml = images.map(imgUrl => {
          const cleanUrl = imgUrl.startsWith('http') ? imgUrl : window.location.origin + imgUrl;
          return `<img src="${cleanUrl}" style="max-width:100%; max-height:45vh; object-fit:contain; border-radius:6px; box-shadow:0 4px 15px rgba(0,0,0,0.5);">`;
        }).join('');
        sectionsHtml.push(`
          <div style="display:flex; flex-direction:column; gap:10px; align-items:center;">
            ${imagesHtml}
          </div>
        `);
      }

      // 3. Video
      const videoUrl = items.videoUrl || (media.mediaType === 'video' ? media.mediaUrl : '') || '';
      if (videoUrl && !videoUrl.startsWith('{')) {
        const cleanUrl = videoUrl.startsWith('http') ? videoUrl : window.location.origin + videoUrl;
        sectionsHtml.push(`
          <video src="${cleanUrl}" controls style="width:100%; max-height:45vh; border-radius:6px; box-shadow:0 4px 15px rgba(0,0,0,0.5);"></video>
        `);
      }

      // 4. YouTube
      const youtubeUrl = items.youtubeUrl || (media.mediaType === 'youtube' ? media.mediaUrl : '') || '';
      if (youtubeUrl && !youtubeUrl.startsWith('{')) {
        let videoId = '';
        if (youtubeUrl.includes('youtube.com/watch?v=')) {
          videoId = youtubeUrl.split('watch?v=')[1]?.split('&')[0];
        } else if (youtubeUrl.includes('youtu.be/')) {
          videoId = youtubeUrl.split('youtu.be/')[1]?.split('?')[0];
        }
        if (videoId) {
          sectionsHtml.push(`
            <div style="width:100%; position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:6px;">
              <iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:none; border-radius:6px;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
          `);
        }
      }

      // 5. 3D Model
      const model3dUrl = items.model3dUrl || (media.mediaType === '3d' ? media.mediaUrl : '') || '';
      if (model3dUrl && !model3dUrl.startsWith('{')) {
        const cleanUrl = model3dUrl.startsWith('http') ? model3dUrl : window.location.origin + model3dUrl;
        sectionsHtml.push(`
          <div style="width:100%; height:320px; border-radius:6px; overflow:hidden; background:rgba(0,0,0,0.25);">
            <model-viewer src="${cleanUrl}" alt="${media.title || '3D Model'}" auto-rotate camera-controls style="width:100%; height:100%;"></model-viewer>
          </div>
        `);
      }

      // 6. PDF
      const pdfUrl = items.pdfUrl || (media.mediaType === 'pdf' ? media.mediaUrl : '') || '';
      if (pdfUrl && !pdfUrl.startsWith('{')) {
        const cleanUrl = pdfUrl.startsWith('http') ? pdfUrl : window.location.origin + pdfUrl;
        sectionsHtml.push(`
          <div style="width:100%;">
            <iframe src="${cleanUrl}" style="width:100%; height:45vh; border:none; border-radius:6px; background:white;"></iframe>
            <div style="margin-top:6px; text-align:right;">
              <a href="${cleanUrl}" target="_blank" style="color:#60a5fa; font-size:12px; text-decoration:underline;">🔗 Mở PDF toàn màn hình</a>
            </div>
          </div>
        `);
      }

      // 7. Facebook
      const fbUrl = items.facebookUrl || (media.mediaType === 'facebook' ? media.mediaUrl : '') || '';
      if (fbUrl && !fbUrl.startsWith('{')) {
        sectionsHtml.push(`
          <div style="text-align:center; padding:12px; background:rgba(24,119,242,0.15); border:1px solid rgba(24,119,242,0.3); border-radius:8px;">
            <p style="margin-bottom:8px; font-size:13px; color:#93c5fd;">👍 Bài viết / Video Facebook</p>
            <a href="${fbUrl}" target="_blank" class="btn btn-small" style="background:#1877f2; color:white; text-decoration:none; display:inline-block;">Mở liên kết Facebook ↗</a>
          </div>
        `);
      }

      // 8. Web link
      const webUrl = items.webUrl || (media.mediaType === 'web' ? media.mediaUrl : '') || '';
      if (webUrl && !webUrl.startsWith('{')) {
        sectionsHtml.push(`
          <div style="text-align:center; padding:12px; background:rgba(37,99,235,0.15); border:1px solid rgba(37,99,235,0.3); border-radius:8px;">
            <p style="margin-bottom:8px; font-size:13px; color:#93c5fd;">🌐 Trang web liên kết: <strong style="color:white;">${webUrl}</strong></p>
            <a href="${webUrl}" target="_blank" class="btn btn-small btn-primary" style="text-decoration:none; display:inline-block;">Mở trang web ↗</a>
          </div>
        `);
      }

      // 0. Stall Card
      const stallCard = items.stallCard || media.stallCard || items.profileCard;
      if (stallCard) {
        let avatarUrl = stallCard.avatar || stallCard.image || (stallCard.images && stallCard.images[0]) || media.mediaUrl || '';
        const cleanAvatarUrl = avatarUrl ? (avatarUrl.startsWith('http') ? avatarUrl : window.location.origin + avatarUrl) : 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80';
        
        const sidebarLines = String(stallCard.sidebarContent || '').split('\n').filter(l => l.trim());
        const sidebarListHtml = sidebarLines.map(l => `<li style="position:relative;padding-left:4px;margin-bottom:5px;">• ${l.replace(/^[•\-\*]\s*/, '')}</li>`).join('');

        const sectionsList = Array.isArray(stallCard.sections) ? stallCard.sections : [];
        const timelineHtml = sectionsList.map(sec => {
          const lines = String(sec.content || '').split('\n').filter(l => l.trim());
          const isTagList = sec.type === 'tags' || (lines.length > 1 && lines.every(l => l.length < 35 && !l.includes(':')));
          
          let contentHtml = '';
          if (isTagList) {
            contentHtml = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${lines.map((t, i) => `<span style="background:${i < 3 ? '#dcfce7' : '#e2e8f0'};color:${i < 3 ? '#166534' : '#1e293b'};padding:3px 8px;border-radius:4px;font-size:11.5px;font-weight:600;">${t.replace(/^[•\-\*]\s*/, '')}</span>`).join('')}</div>`;
          } else {
            contentHtml = `<div style="display:flex;flex-direction:column;gap:5px;margin-top:4px;">${lines.map(line => {
              let text = line.replace(/^[•\-\*]\s*/, '');
              if (text.includes(':')) {
                const parts = text.split(':');
                text = `<strong>${parts[0].trim()}:</strong> ${parts.slice(1).join(':').trim()}`;
              }
              return `<div style="font-size:12.5px;color:#334155;">• ${text}</div>`;
            }).join('')}</div>`;
          }

          return `
            <div style="position:relative;padding-left:20px;margin-bottom:16px;">
              <div style="position:absolute;left:0;top:4px;width:10px;height:10px;border-radius:50%;background:#0d3834;border:2px solid #fff;box-shadow:0 0 0 1.5px #0d3834;"></div>
              <div style="font-weight:800;font-size:13.5px;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1.5px solid #0f172a;padding-bottom:3px;display:inline-block;margin-bottom:4px;">${sec.title || 'THÔNG TIN'}</div>
              ${contentHtml}
            </div>
          `;
        }).join('');

        sectionsHtml.unshift(`
          <div style="display:grid;grid-template-columns:260px 1fr;background:#fdfbfb;border-radius:10px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.3);color:#1e293b;border:1px solid rgba(255,255,255,0.1);">
            <div style="background:linear-gradient(175deg, #092c28 0%, ${stallCard.themeColor || '#0d3834'} 60%, #082622 100%);color:#fff;padding:20px;text-align:center;">
              <div style="position:relative;width:120px;height:120px;margin:0 auto 12px;">
                <div style="position:absolute;top:-5px;left:-5px;right:-5px;bottom:-5px;border:1.5px solid rgba(255,255,255,0.45);border-radius:4px;pointer-events:none;"></div>
                <img src="${cleanAvatarUrl}" style="width:100%;height:100%;object-fit:cover;border:2.5px solid #fff;border-radius:2px;display:block;">
              </div>
              ${stallCard.badge ? `<div style="background:rgba(255,255,255,0.15);color:#6ee7b7;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:12px;margin-bottom:12px;display:inline-block;">${stallCard.badge}</div>` : ''}
              ${stallCard.sidebarTitle ? `<div style="font-size:12.5px;font-weight:800;text-transform:uppercase;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.25);padding-bottom:4px;">${stallCard.sidebarTitle}</div>` : ''}
              <ul style="list-style:none;padding:0;text-align:left;font-size:11.5px;line-height:1.5;color:#e2e8f0;">
                ${sidebarListHtml}
              </ul>
            </div>
            <div style="padding:20px 24px;background:#fafafa;position:relative;">
              <div style="position:relative;height:100%;">
                <div style="position:absolute;left:4px;top:8px;bottom:10px;width:2px;background:#cbd5e1;"></div>
                ${timelineHtml || '<div style="color:#64748b;font-size:12px;">Chưa có mục timeline.</div>'}
              </div>
            </div>
          </div>
        `);
      }

      if (sectionsHtml.length === 0) {
        sectionsHtml.push('<div style="color:var(--text-muted); text-align:center; padding:20px;">Tư liệu này chưa có nội dung.</div>');
      }

      body.innerHTML = `<div style="display:flex; flex-direction:column; gap:16px;">${sectionsHtml.join('')}</div>`;
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
      loadStallTemplatesForDropdown();
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
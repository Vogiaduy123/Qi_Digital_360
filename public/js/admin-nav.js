window.initializeAdminNav = function () {
  if (window.adminNavInitialized) return;
  window.adminNavInitialized = true;

  const NAV_ITEMS = [
    { href: '/admin/buildings.html', label: '🏢 Tòa nhà', paths: ['/admin/buildings'] },
    { href: '/admin/upload.html', label: '📤 Upload', paths: ['/admin/upload'] },
    { href: '/admin/rooms.html', label: '🏠 Phòng', paths: ['/admin/rooms'] },
    { href: '/admin/minimap.html', label: '🗺️ Minimap', paths: ['/admin/minimap'] },
    { href: '/admin/tour.html', label: '⚡ Kịch bản', paths: ['/admin/tour'] },
    { href: '/admin/users.html', label: '👥 Phân Quyền', paths: ['/admin/users'], role: 'admin' }
  ];

  window.handleLogout = async function() {
    if (!confirm('Bạn có chắc chắn muốn đăng xuất không?')) return;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      sessionStorage.removeItem('vt_token');
      window.location.href = '/admin/login.html';
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const mount = document.getElementById('adminHeaderMount');
  if (!mount) return;

  const path = window.location.pathname.replace(/\.html$/, '');
  const isDashboard = path.endsWith('/admin/index') || path.endsWith('/admin/') || path.endsWith('/admin');

  function isActive(item) {
    return item.paths.some((p) => path === p || path.startsWith(p + '/'));
  }

  // Lọc NAV_ITEMS theo phân quyền của user hiện tại
  const userRole = window.currentUser ? window.currentUser.role : 'user';
  const filteredItems = NAV_ITEMS.filter(item => {
    if (item.role === 'admin') {
      return userRole === 'admin';
    }
    return true;
  });

  const navLinks = filteredItems.map((item) => {
    const cls = isActive(item) ? 'nav-link active' : 'nav-link';
    return `<a href="${item.href}" class="${cls}">${item.label}</a>`;
  }).join('');

  const menuItems = filteredItems.map((item) => {
    const cls = isActive(item) ? 'menu-item active' : 'menu-item';
    return `<a href="${item.href}" class="${cls}">${item.label}</a>`;
  }).join('');

  const isUserAdmin = userRole === 'admin';
  const userDisplayName = window.currentUser ? (window.currentUser.displayName || window.currentUser.username) : '';

  mount.innerHTML = `
    <div class="header-content">
      <a class="header-brand" href="/admin/index.html" title="Dashboard">
        <img src="/images/logo-qi.png" alt="Qi">
        <span>Qi Dashboard</span>
      </a>
      ${!isDashboard ? `
      <nav class="header-nav" aria-label="Menu quản lý">${navLinks}</nav>
      <a href="/" class="nav-link nav-link--tour">👁️ Xem Tour</a>
      ` : `
      <div style="flex: 1;"></div>
      `}
      
      ${isDashboard && isUserAdmin ? `
      <button id="adminSettingsBtn" class="admin-settings-nav-btn" title="Cấu hình Icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      ` : ''}

      <div class="user-profile-nav" style="display:flex;align-items:center;gap:16px;margin-left:12px;padding-left:12px;border-left:1px solid rgba(0,0,0,0.08)">
        
        <!-- Notification Bell Container -->
        <div id="adminNotificationBell" class="position-relative" style="cursor:pointer;padding:4px;display:flex;align-items:center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span id="adminNotificationBadge" class="position-absolute bg-danger border border-light rounded-circle" style="top: 2px; right: 2px; width: 8px; height: 8px; display: none;"></span>
          
          <!-- Dropdown Card -->
          <div id="adminNotificationDropdown" style="display:none; position:absolute; right:-80px; top:36px; width:320px; background:#ffffff; border:1px solid rgba(0,0,0,0.08); border-radius:12px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); z-index:2200; color:#1e293b; font-family:system-ui,-apple-system,sans-serif;">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid rgba(0,0,0,0.06); font-weight:600; font-size:13px;">
              <span>🔔 Thông báo thay đổi</span>
              <button id="adminMarkAllReadBtn" style="background:none; border:none; color:#2563eb; font-size:11px; padding:0; cursor:pointer;">Đánh dấu đã đọc</button>
            </div>
            <div id="adminNotificationList" style="max-height:280px; overflow-y:auto; font-size:12px; line-height:1.4;">
              <div style="padding:20px; text-align:center; color:#64748b;">Đang tải thông báo...</div>
            </div>
          </div>
        </div>

        <span id="userProfileBtn" style="font-size:13px;color:#4a5568;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;" title="Chỉnh sửa thông tin tài khoản">👤 <span style="text-decoration:underline;text-underline-offset:3px;">${userDisplayName}</span></span>
        <button onclick="handleLogout()" class="btn btn-outline-danger btn-sm" style="padding:4px 10px;font-size:12px;border-radius:6px;border-color:rgba(220,53,69,0.5);color:#ff6b76;">Đăng xuất</button>
      </div>

      ${!isDashboard ? `
      <div class="admin-menu-mobile">
        <button class="menu-button" type="button" aria-expanded="false" aria-label="Menu">
          ☰ Menu <span class="menu-caret">▼</span>
        </button>
        <div class="menu-dropdown">
          ${menuItems}
          <a href="/" class="menu-item menu-item--tour">👁️ Xem Tour</a>
        </div>
      </div>
      ` : ''}
    </div>
  `;

  // Inject Settings Panel HTML to body if not already present
  if (isDashboard && !document.getElementById("adminSettingsPanel")) {
    const panel = document.createElement("div");
    panel.id = "adminSettingsPanel";
    panel.className = "admin-settings-panel";
    panel.innerHTML = `
      <div class="settings-panel-header">
        <h3>⚙️ Cấu hình Icon</h3>
        <button id="adminSettingsPanelClose" class="settings-panel-close" title="Đóng">×</button>
      </div>
      <div class="settings-panel-body">
        <p class="settings-panel-desc">Tải lên file ảnh (PNG, JPG, SVG, WEBP) để thay đổi biểu tượng hiển thị trong tour.</p>
        
        <div class="settings-group-list">
          <!-- Navigation Arrow -->
          <div class="settings-item" data-key="nav_arrow">
            <div class="settings-item-info">
              <span class="settings-item-title">Mũi tên di chuyển</span>
              <div class="settings-item-preview" id="admin-preview-nav_arrow"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- Note -->
          <div class="settings-item" data-key="media_note">
            <div class="settings-item-info">
              <span class="settings-item-title">Tư liệu: Ghi chú</span>
              <div class="settings-item-preview" id="admin-preview-media_note"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- Image -->
          <div class="settings-item" data-key="media_image">
            <div class="settings-item-info">
              <span class="settings-item-title">Tư liệu: Hình ảnh</span>
              <div class="settings-item-preview" id="admin-preview-media_image"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- PDF -->
          <div class="settings-item" data-key="media_pdf">
            <div class="settings-item-info">
              <span class="settings-item-title">Tư liệu: PDF</span>
              <div class="settings-item-preview" id="admin-preview-media_pdf"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- Video -->
          <div class="settings-item" data-key="media_video">
            <div class="settings-item-info">
              <span class="settings-item-title">Tư liệu: Video</span>
              <div class="settings-item-preview" id="admin-preview-media_video"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- 3D -->
          <div class="settings-item" data-key="media_3d">
            <div class="settings-item-info">
              <span class="settings-item-title">Tư liệu: 3D Model</span>
              <div class="settings-item-preview" id="admin-preview-media_3d"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- Gallery -->
          <div class="settings-item" data-key="media_gallery">
            <div class="settings-item-info">
              <span class="settings-item-title">Tư liệu: Bộ sưu tập</span>
              <div class="settings-item-preview" id="admin-preview-media_gallery"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- YouTube -->
          <div class="settings-item" data-key="media_youtube">
            <div class="settings-item-info">
              <span class="settings-item-title">Tư liệu: YouTube</span>
              <div class="settings-item-preview" id="admin-preview-media_youtube"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- Web -->
          <div class="settings-item" data-key="media_web">
            <div class="settings-item-info">
              <span class="settings-item-title">Tư liệu: Website</span>
              <div class="settings-item-preview" id="admin-preview-media_web"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- Mail -->
          <div class="settings-item" data-key="mail">
            <div class="settings-item-info">
              <span class="settings-item-title">Điểm gửi mail</span>
              <div class="settings-item-preview" id="admin-preview-mail"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- Sensor -->
          <div class="settings-item" data-key="sensor">
            <div class="settings-item-info">
              <span class="settings-item-title">Cảm biến IoT</span>
              <div class="settings-item-preview" id="admin-preview-sensor"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>

          <!-- Camera -->
          <div class="settings-item" data-key="camera">
            <div class="settings-item-info">
              <span class="settings-item-title">Camera Live</span>
              <div class="settings-item-preview" id="admin-preview-camera"></div>
            </div>
            <div class="settings-item-actions">
              <label class="settings-upload-btn">
                📁 Chọn ảnh
                <input type="file" accept="image/*" class="settings-file-input">
              </label>
              <button class="settings-reset-btn">Reset</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  const settingsPanel = document.getElementById("adminSettingsPanel");
  const settingsBtn = document.getElementById("adminSettingsBtn");
  const settingsMobileBtn = document.getElementById("adminSettingsMobileBtn");
  const settingsPanelClose = document.getElementById("adminSettingsPanelClose");

  let customIcons = {};

  const togglePanel = (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle("open");
  };

  if (settingsBtn) settingsBtn.onclick = togglePanel;
  if (settingsMobileBtn) settingsMobileBtn.onclick = togglePanel;
  if (settingsPanelClose) {
    settingsPanelClose.onclick = (e) => {
      e.stopPropagation();
      settingsPanel.classList.remove("open");
    };
  }

  document.addEventListener("click", () => {
    if (settingsPanel) settingsPanel.classList.remove("open");
  });

  if (settingsPanel) {
    settingsPanel.onclick = (e) => {
      e.stopPropagation();
    };
  }

  // Load custom icons config
  async function loadCustomIcons() {
    try {
      const res = await fetch("/api/custom-icons").then(r => r.json());
      if (res && res.success) {
        customIcons = res.config || {};
        updatePreviews();
      }
    } catch (err) {
      console.warn("⚠️ Cannot load custom icons config:", err);
    }
  }

  function updatePreviews() {
    const items = settingsPanel.querySelectorAll(".settings-item");
    const defaultRepresentations = {
      nav_arrow: `<svg viewBox="0 0 44 36" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
        <polyline points="8,20 22,6 36,20" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="8,32 22,18 36,32" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      media_note: `<img src="/images/info.png" style="width:20px;height:20px;object-fit:contain;">`,
      media_image: "🖼️",
      media_pdf: "📄",
      media_video: "🎥",
      media_3d: "🧊",
      media_gallery: "📸",
      media_youtube: "▶️",
      media_web: "🌐",
      mail: "✉️",
      sensor: "🌡️",
      camera: "📹"
    };

    items.forEach(item => {
      const key = item.dataset.key;
      const previewContainer = item.querySelector(".settings-item-preview");
      if (!previewContainer) return;

      const customUrl = customIcons[key];
      if (customUrl) {
        previewContainer.innerHTML = `<img src="${customUrl}" alt="">`;
      } else {
        previewContainer.innerHTML = defaultRepresentations[key] || "📁";
      }
    });
  }

  if (settingsPanel) {
    const items = settingsPanel.querySelectorAll(".settings-item");
    items.forEach(item => {
      const key = item.dataset.key;
      const fileInput = item.querySelector(".settings-file-input");
      const resetBtn = item.querySelector(".settings-reset-btn");

      if (fileInput) {
        fileInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const formData = new FormData();
          formData.append("icon", file);
          formData.append("iconKey", key);

          try {
            const uploadRes = await fetch("/api/custom-icons/upload", {
              method: "POST",
              body: formData
            }).then(r => r.json());

            if (uploadRes && uploadRes.success) {
              customIcons[key] = uploadRes.url;
              
              const saveRes = await fetch("/api/custom-icons/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(customIcons)
              }).then(r => r.json());

              if (saveRes && saveRes.success) {
                updatePreviews();
                if (typeof window.reloadAdminHotspots === "function") {
                  window.reloadAdminHotspots();
                }
              } else {
                alert("Lưu cấu hình thất bại: " + (saveRes.error || ""));
              }
            } else {
              alert("Upload ảnh thất bại: " + (uploadRes.error || ""));
            }
          } catch (err) {
            console.error("Error uploading custom icon:", err);
            alert("Lỗi kết nối upload icon");
          }
        };
      }

      if (resetBtn) {
        resetBtn.onclick = async (e) => {
          e.stopPropagation();
          try {
            customIcons[key] = "";
            
            const saveRes = await fetch("/api/custom-icons/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(customIcons)
            }).then(r => r.json());

            if (saveRes && saveRes.success) {
              updatePreviews();
              if (typeof window.reloadAdminHotspots === "function") {
                window.reloadAdminHotspots();
              }
            } else {
              alert("Reset thất bại: " + (saveRes.error || ""));
            }
          } catch (err) {
            console.error("Error resetting custom icon:", err);
            alert("Lỗi kết nối reset icon");
          }
        };
      }
    });

    loadCustomIcons();
  }

  const menuWrap = mount.querySelector('.admin-menu-mobile');
  const menuBtn = mount.querySelector('.menu-button');
  if (menuBtn && menuWrap) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menuWrap.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!menuWrap.contains(e.target)) {
        menuWrap.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Tự động thêm Modal chỉnh sửa thông tin cá nhân vào trang nếu chưa có
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

    // Xử lý sự kiện lưu thông tin
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

            // Reset và vẽ lại Nav để đổi tên mới hiển thị
            window.adminNavInitialized = false;
            window.initializeAdminNav();
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

  // Đăng ký sự kiện mở modal khi click vào tên tài khoản
  const profileBtn = document.getElementById('userProfileBtn');
  if (profileBtn) {
    profileBtn.onclick = () => {
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
    };
  }

  // Khởi tạo chuông thông báo
  initializeNotificationBell();
};

function initializeNotificationBell() {
  const bell = document.getElementById('adminNotificationBell');
  const dropdown = document.getElementById('adminNotificationDropdown');
  const badge = document.getElementById('adminNotificationBadge');
  const listContainer = document.getElementById('adminNotificationList');
  const markReadBtn = document.getElementById('adminMarkAllReadBtn');

  if (!bell || !dropdown) return;

  let notificationsList = [];

  // Toggle dropdown
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.style.display === 'none') {
      dropdown.style.display = 'block';
      renderNotifications();
      markAllAsReadLocally();
    } else {
      dropdown.style.display = 'none';
    }
  });

  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!bell.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Fetch initial notifications
  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (data.success) {
        notificationsList = data.notifications || [];
        updateBadge();
        if (dropdown.style.display === 'block') {
          renderNotifications();
        }
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }

  // Get max notification ID from list
  function getMaxNotifId() {
    if (notificationsList.length === 0) return 0;
    return Math.max(...notificationsList.map(n => n.id));
  }

  // Update unread badge
  function updateBadge() {
    if (!badge) return;
    const lastReadId = Number(localStorage.getItem('vt_last_read_notif_id') || 0);
    const hasUnread = notificationsList.some(n => n.id > lastReadId);
    badge.style.display = hasUnread ? 'block' : 'none';
  }

  // Mark all as read locally
  function markAllAsReadLocally() {
    const maxId = getMaxNotifId();
    if (maxId > 0) {
      localStorage.setItem('vt_last_read_notif_id', maxId);
      updateBadge();
    }
  }

  // Render notifications to HTML
  function renderNotifications() {
    if (!listContainer) return;
    if (notificationsList.length === 0) {
      listContainer.innerHTML = `<div style="padding:24px; text-align:center; color:#64748b;">Không có thông báo mới</div>`;
      return;
    }

    const typeEmoji = {
      room_add: '🏠',
      room_delete: '🗑️',
      hotspot_add: '📍',
      media_add: '📂',
      mail_add: '✉️',
      building_add: '🏢',
      building_delete: '🗑️'
    };

    listContainer.innerHTML = notificationsList.map(n => {
      const emoji = typeEmoji[n.type] || '🔔';
      const timeStr = formatRelativeTime(n.createdAt);
      return `
        <div style="padding:12px 16px; border-bottom:1px solid rgba(0,0,0,0.04); display:flex; gap:12px; align-items:flex-start; transition:background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='none'">
          <span style="font-size:18px; margin-top:2px;">${emoji}</span>
          <div style="flex:1;">
            <div style="font-weight:600; font-size:13px; color:#1e293b;">${n.title}</div>
            <div style="font-size:12px; color:#475569; margin-top:2px;">${n.message}</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:4px; display:flex; justify-content:space-between;">
              <span>bởi @${n.createdBy}</span>
              <span>${timeStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Format relative time in Vietnamese
  function formatRelativeTime(isoStr) {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHr < 24) return `${diffHr} giờ trước`;
    if (diffDay < 7) return `${diffDay} ngày trước`;
    
    return date.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Listen to SSE updates
  let sseSource = window.adminSseSource;
  if (!sseSource) {
    sseSource = new EventSource('/events');
    window.adminSseSource = sseSource;
  }

  sseSource.addEventListener('notifications', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (Array.isArray(data)) {
        notificationsList = data;
        updateBadge();
        if (dropdown.style.display === 'block') {
          renderNotifications();
          markAllAsReadLocally();
        }
      }
    } catch (err) {
      console.error('Error parsing SSE notifications:', err);
    }
  });

  // Handle Mark All Read button
  if (markReadBtn) {
    markReadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markAllAsReadLocally();
    });
  }

  // Initial fetch
  fetchNotifications();
}

if (window.currentUser) {
  window.initializeAdminNav();
}

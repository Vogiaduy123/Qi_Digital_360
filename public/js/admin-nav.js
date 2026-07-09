(function () {
  const NAV_ITEMS = [
    { href: '/admin/buildings.html', label: '🏢 Tòa nhà', paths: ['/admin/buildings'] },
    { href: '/admin/upload.html', label: '📤 Upload', paths: ['/admin/upload'] },
    { href: '/admin/rooms.html', label: '🏠 Phòng', paths: ['/admin/rooms'] },
    { href: '/admin/minimap.html', label: '🗺️ Minimap', paths: ['/admin/minimap'] },
    { href: '/admin/tour.html', label: '⚡ Kịch bản', paths: ['/admin/tour'] }
  ];

  const mount = document.getElementById('adminHeaderMount');
  if (!mount) return;

  const path = window.location.pathname.replace(/\.html$/, '');
  const isDashboard = path.endsWith('/admin/index') || path.endsWith('/admin/') || path.endsWith('/admin');

  function isActive(item) {
    return item.paths.some((p) => path === p || path.startsWith(p + '/'));
  }

  const navLinks = NAV_ITEMS.map((item) => {
    const cls = isActive(item) ? 'nav-link active' : 'nav-link';
    return `<a href="${item.href}" class="${cls}">${item.label}</a>`;
  }).join('');

  const menuItems = NAV_ITEMS.map((item) => {
    const cls = isActive(item) ? 'menu-item active' : 'menu-item';
    return `<a href="${item.href}" class="${cls}">${item.label}</a>`;
  }).join('');

  mount.innerHTML = `
    <div class="header-content">
      <a class="header-brand" href="/admin/index.html" title="Dashboard">
        <img src="/images/logo-qi.png" alt="Qi">
        <span>Qi Dashboard</span>
      </a>
      <nav class="header-nav" aria-label="Menu quản lý">${navLinks}</nav>
      <a href="/" class="nav-link nav-link--tour">👁️ Xem Tour</a>
      ${isDashboard ? `
      <button id="adminSettingsBtn" class="admin-settings-nav-btn" title="Cấu hình Icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      ` : ''}
      <div class="admin-menu-mobile">
        <button class="menu-button" type="button" aria-expanded="false" aria-label="Menu">
          ☰ Menu <span class="menu-caret">▼</span>
        </button>
        <div class="menu-dropdown">
          ${menuItems}
          <a href="/" class="menu-item menu-item--tour">👁️ Xem Tour</a>
          ${isDashboard ? `
          <button id="adminSettingsMobileBtn" class="menu-item menu-item--settings" style="background:none;border:none;width:100%;text-align:left;cursor:pointer;font-size:13px;color:#dbe3ff;display:flex;align-items:center;gap:6px;padding:10px 14px;">
            <span>⚙️</span> Cấu hình Icon
          </button>
          ` : ''}
        </div>
      </div>
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
})();

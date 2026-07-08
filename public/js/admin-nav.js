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
      <div class="admin-menu-mobile">
        <button class="menu-button" type="button" aria-expanded="false" aria-label="Menu">
          ☰ Menu <span class="menu-caret">▼</span>
        </button>
        <div class="menu-dropdown">
          ${menuItems}
          <a href="/" class="menu-item menu-item--tour">👁️ Xem Tour</a>
        </div>
      </div>
    </div>
  `;

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

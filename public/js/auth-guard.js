// Intercept all fetch requests to add Authorization header from sessionStorage
(() => {
  const originalFetch = window.fetch;
  window.fetch = function (url, options = {}) {
    const token = sessionStorage.getItem('vt_token');
    console.log(`[Auth Guard Fetch] Requesting: ${url}, Token in sessionStorage: ${token ? token.slice(0, 15) + '...' : 'none'}`);
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

(async function() {
  // Tạm thời ẩn body để tránh nhấp nháy giao diện khi đang kiểm tra quyền
  const style = document.createElement('style');
  style.id = 'auth-guard-flash-protection';
  style.innerHTML = 'html, body { display: none !important; }';
  document.head.appendChild(style);

  function removeFlashProtection() {
    const el = document.getElementById('auth-guard-flash-protection');
    if (el) el.remove();
  }

  const path = window.location.pathname.replace(/\.html$/, '');
  const isLoginPage = path.endsWith('/admin/login');
  const isSetupPage = path.endsWith('/admin/setup');
  const isRegisterPage = path.endsWith('/admin/register');

  try {
    // 1. Kiểm tra trạng thái Setup của hệ thống
    const statusRes = await fetch('/api/auth/setup-status');
    const statusData = await statusRes.json();
    const isSetup = statusData.success && statusData.isSetup;

    if (!isSetup) {
      if (!isSetupPage) {
        window.location.href = '/admin/setup.html';
        return;
      }
      removeFlashProtection();
      return;
    } else {
      if (isSetupPage) {
        window.location.href = '/admin/login.html';
        return;
      }
    }

    if (isLoginPage || isRegisterPage) {
      removeFlashProtection();
      return;
    }

    // 2. Xác thực phiên đăng nhập hiện tại
    const meRes = await fetch('/api/auth/me');
    if (!meRes.ok) {
      console.warn('[Auth Guard] /api/auth/me failed with status:', meRes.status);
      window.location.href = '/admin/login.html';
      return;
    }

    const meData = await meRes.json();
    console.log('[Auth Guard] User from server:', meData.user ? meData.user.username : 'none', 'Role:', meData.user ? meData.user.role : 'none');
    if (!meData.success || !meData.user) {
      window.location.href = '/admin/login.html';
      return;
    }

    const user = meData.user;
    window.currentUser = user;

    // 3. Định nghĩa ma trận quyền hạn các trang
    const PAGE_PERMISSIONS = {
      '/admin/buildings': ['admin', 'collaborator'],
      '/admin/upload':    ['admin', 'collaborator'],
      '/admin/rooms':     ['admin', 'collaborator'],
      '/admin/minimap':   ['admin', 'collaborator'],
      '/admin/tour':      ['admin', 'collaborator'],
      '/admin/drag':      ['admin', 'collaborator'],
      '/admin/users':     ['admin'],
      '/admin/api-config':['admin'],
      '/admin/index':     ['admin', 'collaborator'],
      '/admin/':          ['admin', 'collaborator'],
      '/admin':           ['admin', 'collaborator']
    };

    let cleanPath = path;
    if (cleanPath.endsWith('/')) {
      cleanPath = cleanPath.slice(0, -1);
    }

    const allowedRoles = PAGE_PERMISSIONS[cleanPath];
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      alert('Bạn không có quyền truy cập trang này.');
      if (user.role === 'user') {
        window.location.href = '/';
      } else {
        window.location.href = '/admin/index.html';
      }
      return;
    }

    // 4. Helper kiểm tra quyền trực tiếp trên giao diện
    window.hasPermission = function(permission) {
      if (user.role === 'admin') return true;
      if (user.role === 'collaborator') {
        const collabAllowed = ['buildings', 'upload', 'rooms', 'minimap', 'tour', 'drag', 'view_tour'];
        return collabAllowed.includes(permission);
      }
      return permission === 'view_tour';
    };

    if (typeof window.initializeAdminNav === 'function') {
      window.initializeAdminNav();
    }

    // Hiển thị thẻ Phân Quyền trên dashboard nếu là admin
    if (user.role === 'admin') {
      const cardUsers = document.getElementById('cardUsers');
      if (cardUsers) {
        cardUsers.style.display = 'flex';
      }
    }

    removeFlashProtection();
  } catch (err) {
    console.error('Auth guard error:', err);
    if (!isLoginPage && !isSetupPage) {
      window.location.href = '/admin/login.html';
    } else {
      removeFlashProtection();
    }
  }
})();

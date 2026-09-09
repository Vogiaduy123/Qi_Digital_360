let viewerInstance = null;

// FOV range chuẩn (theo Google Street View & Marzipano)
const DEFAULT_FOV_DEG = 75;  // mặc định: tự nhiên, gần với tầm nhìn con người
const MAX_FOV_DEG = 110;     // thu nhỏ hết (góc rộng)
const MIN_FOV_DEG = 30;      // phóng to hết (góc hẹp)
export const MIN_FOV = MIN_FOV_DEG * Math.PI / 180;
export const MAX_FOV = MAX_FOV_DEG * Math.PI / 180;


let env = {
  getCurrentRoomId: () => null,
  getScene: (id) => null
};

export function initViewer(panoElement, dependencies) {
  env = { ...env, ...dependencies };
  viewerInstance = new Marzipano.Viewer(panoElement);
  setupDeviceMode();
  return viewerInstance;
}

export function getViewer() {
  return viewerInstance;
}

export function setupDeviceMode() {
  if (window.matchMedia) {
    const setMode = () => {
      const mql = window.matchMedia("(max-width: 500px), (max-height: 500px)");
      if (mql.matches) {
        document.body.classList.remove("desktop");
        document.body.classList.add("mobile");
      } else {
        document.body.classList.remove("mobile");
        document.body.classList.add("desktop");
      }
    };

    setMode();
    const mql = window.matchMedia("(max-width: 500px), (max-height: 500px)");
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", setMode);
    } else if (typeof mql.addListener === "function") {
      mql.addListener(setMode);
    }
  } else {
    document.body.classList.add("desktop");
  }

  document.body.classList.add("no-touch");
  window.addEventListener("touchstart", () => {
    document.body.classList.remove("no-touch");
    document.body.classList.add("touch");
  }, { passive: true, once: true });
}

export function initZoomControl() {
  const zoomSlider = document.getElementById("zoomSlider");
  const zoomValue = document.getElementById("zoomValue");
  const pano = document.getElementById("pano");
  const viewer = getViewer();

  // Thiết lập slider: value = FOV degree, giảm = zoom in, tăng = zoom out
  if (zoomSlider) {
    zoomSlider.min = String(MIN_FOV_DEG);
    zoomSlider.max = String(MAX_FOV_DEG);
    const cur = parseInt(zoomSlider.value, 10);
    const clamped = (isNaN(cur) || cur < MIN_FOV_DEG || cur > MAX_FOV_DEG) ? DEFAULT_FOV_DEG : cur;
    zoomSlider.value = String(clamped);
    if (zoomValue) zoomValue.textContent = String(clamped);
  }

  if (!zoomSlider) return;

  // Khi kéo slider: value = FOV degree trực tiếp
  zoomSlider.addEventListener("input", (e) => {
    const fovDeg = parseFloat(e.target.value);
    const targetFov = fovDeg * Math.PI / 180;
    if (zoomValue) zoomValue.textContent = String(Math.round(fovDeg));
    animateFovTo(targetFov);
  });

  // Zoom bằng cuộn chuột: 1°/notch, không easing (easing gây giật lui)
  let pendingWheelDelta = 0;
  let wheelRafId = null;

  if (pano) {
    pano.addEventListener("wheel", (e) => {
      e.preventDefault();
      pendingWheelDelta += e.deltaY;

      if (wheelRafId) return;
      wheelRafId = requestAnimationFrame(() => {
        wheelRafId = null;

        const currentRoomId = env.getCurrentRoomId();
        if (!viewer || !currentRoomId) { pendingWheelDelta = 0; return; }

        const scene = env.getScene(currentRoomId);
        if (!scene || !scene.view()) { pendingWheelDelta = 0; return; }

        // Huỷ animation đang chạy trước khi đọc view.fov()
        // (đọc SAU cancel = lấy vị trí thực tế, không bị drift)
        if (fovAnimFrame) {
          cancelAnimationFrame(fovAnimFrame);
          fovAnimFrame = null;
        }

        const view = scene.view();
        const currentFovDeg = view.fov() * 180 / Math.PI; // vị trí thực tế

        // 1° mỗi notch (deltaY ~100 mỗi notch)
        const notches = pendingWheelDelta / 100;
        pendingWheelDelta = 0;

        const targetDeg = Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, currentFovDeg + notches));
        view.setFov(targetDeg * Math.PI / 180);

        // Đồng bộ slider
        const deg = Math.round(targetDeg);
        const slider = document.getElementById("zoomSlider");
        const valueEl = document.getElementById("zoomValue");
        if (slider) slider.value = String(deg);
        if (valueEl) valueEl.textContent = String(deg);
      });
    }, { passive: false });
  }
}

// Hàm helper để cập nhật zoom
export function updateSceneZoom(fov) {
  const viewer = getViewer();
  const currentRoomId = env.getCurrentRoomId();
  if (viewer && currentRoomId) {
    const scene = env.getScene(currentRoomId);
    if (scene && scene.view()) {
      scene.view().setFov(fov);
    }
  }
}

// Animation mượt để chuyển FOV
let fovAnimFrame = null;
export function animateFovTo(targetFov) {
  const viewer = getViewer();
  const currentRoomId = env.getCurrentRoomId();
  if (!viewer || !currentRoomId) return;
  
  const scene = env.getScene(currentRoomId);
  if (!scene || !scene.view()) return;

  // Hủy frame cũ nếu đang chạy
  if (fovAnimFrame) cancelAnimationFrame(fovAnimFrame);

  const view = scene.view();
  const ease = 0.08; // chậm, mượt — mỗi frame tiến 8% khoảng cách còn lại

  function step() {
    const cur = view.fov();
    const diff = targetFov - cur;
    if (Math.abs(diff) < 0.0005) {
      view.setFov(targetFov);
      // đồng bộ slider theo FOV degree
      const deg = Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, Math.round(targetFov * 180 / Math.PI)));
      const slider = document.getElementById("zoomSlider");
      const valueEl = document.getElementById("zoomValue");
      if (slider) slider.value = String(deg);
      if (valueEl) valueEl.textContent = String(deg);
      fovAnimFrame = null;
      return;
    }
    const next = cur + diff * ease;
    view.setFov(next);
    // đồng bộ slider mỗi frame theo FOV degree
    const degNext = Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, Math.round(next * 180 / Math.PI)));
    const slider = document.getElementById("zoomSlider");
    const valueEl = document.getElementById("zoomValue");
    if (slider) slider.value = String(degNext);
    if (valueEl) valueEl.textContent = String(degNext);
    fovAnimFrame = requestAnimationFrame(step);
  }
  fovAnimFrame = requestAnimationFrame(step);
}

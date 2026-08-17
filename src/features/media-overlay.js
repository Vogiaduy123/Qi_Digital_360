export const MEDIA_ICONS = { image: "🖼️", pdf: "📄", video: "🎥", "3d": "🧊", gallery: "📸", youtube: "▶️", facebook: "", web: "🌐", note: "i" };

// Media overlay elements
let mediaOverlay, mediaOverlayTitle, mediaOverlayDescription, mediaOverlayContent, mediaOverlayLink, mediaOverlayClose;

// Store active media hotspot overlay reference
let activeMediaHotspotOverlay = null;
let active3DModal = null;

export function initMediaOverlay() {
  mediaOverlay = document.getElementById("mediaOverlay");
  mediaOverlayTitle = document.getElementById("mediaOverlayTitle");
  mediaOverlayDescription = document.getElementById("mediaOverlayDescription");
  mediaOverlayContent = document.getElementById("mediaOverlayContent");
  mediaOverlayLink = document.getElementById("mediaOverlayLink");
  mediaOverlayClose = document.getElementById("mediaOverlayClose");

  if (mediaOverlayClose) {
    mediaOverlayClose.addEventListener("click", hideMediaOverlay);
  }

  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") {
      hideMediaOverlay();
    }
  });

  document.addEventListener("click", () => {
    clearActiveNoteHotspot();
  });
}

function normalizeMediaUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `${window.location.origin}${url}`;
}

// Show a full-screen 3D modal (fixed, not a Marzipano hotspot)
function show3DModal(media) {
  close3DModal();
  const url = normalizeMediaUrl(media.mediaUrl);
  
  const backdrop = document.createElement("div");
  backdrop.className = "museum-modal-backdrop";
  backdrop.onclick = close3DModal;

  const card = document.createElement("div");
  card.className = "museum-card-overlay museum-card-fullscreen";
  card.onclick = (e) => e.stopPropagation();

  const leftCol = document.createElement("div");
  leftCol.className = "museum-card-left";

  const model = document.createElement("model-viewer");
  model.src = url;
  model.alt = media.title || "3D Model";
  model.setAttribute("auto-rotate", "");
  model.setAttribute("camera-controls", "");
  model.style.width = "100%";
  model.style.height = "100%";
  model.style.display = "block";
  ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((ev) => {
    model.addEventListener(ev, (e) => e.stopPropagation(), { passive: false });
  });
  leftCol.appendChild(model);

  const rightCol = document.createElement("div");
  rightCol.className = "museum-card-right";

  const closeWrap = document.createElement("div");
  closeWrap.style.cssText = "display:flex;justify-content:flex-end;margin-bottom:5px;";
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "×";
  closeBtn.style.cssText = "background:transparent;border:none;font-size:28px;color:#333;cursor:pointer;line-height:1;";
  closeBtn.onclick = close3DModal;
  closeWrap.appendChild(closeBtn);

  const title = document.createElement("h3");
  title.className = "museum-card-title";
  title.textContent = media.title || "Mô hình 3D";

  const desc = document.createElement("div");
  desc.className = "museum-card-desc";
  desc.innerHTML = (media.description || "").replace(/\n/g, "<br>");

  const buttons = document.createElement("div");
  buttons.className = "museum-card-buttons";
  const playBtn = document.createElement("button");
  playBtn.className = "btn-icon";
  playBtn.innerHTML = "🔈";
  const view3DBtn = document.createElement("button");
  view3DBtn.className = "btn-primary";
  view3DBtn.textContent = "TRẢI NGHIỆM 3D";
  view3DBtn.onclick = () => { if (model.requestFullscreen) model.requestFullscreen(); };
  buttons.appendChild(playBtn);
  buttons.appendChild(view3DBtn);

  rightCol.appendChild(closeWrap);
  rightCol.appendChild(title);
  rightCol.appendChild(desc);
  rightCol.appendChild(buttons);

  card.appendChild(leftCol);
  card.appendChild(rightCol);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  active3DModal = backdrop;
}

function close3DModal() {
  if (active3DModal) {
    active3DModal.remove();
    active3DModal = null;
  }
}

// Create media overlay as a Marzipano hotspot
// Create media overlay as a Marzipano hotspot
export function createMediaHotspotOverlay(media, container, yaw, pitch) {
  // Close existing overlay if any
  if (activeMediaHotspotOverlay) {
    container.destroyHotspot(activeMediaHotspotOverlay);
    activeMediaHotspotOverlay = null;
  }

  // Parse mediaItems and legacy values
  let items = media.mediaItems || {};
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch {}
  }

  // Helper to extract YouTube video ID
  function getYouTubeVideoId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^?&\n]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // Create overlay element
  const overlayEl = document.createElement("div");
  overlayEl.className = "media-hotspot-overlay";
  overlayEl.onclick = (e) => e.stopPropagation();
  
  // Header
  const header = document.createElement("div");
  header.className = "media-overlay-header";
  
  const headerLeft = document.createElement("div");
  headerLeft.style.display = "flex";
  headerLeft.style.alignItems = "center";
  headerLeft.style.gap = "8px";
  headerLeft.style.flex = "1";

  const customIconUrl = media.iconUrl || (window.customIcons && window.customIcons['media_' + media.mediaType]) || (window.customIcons && window.customIcons['media_doc']);
  if (customIconUrl) {
    const iconImg = document.createElement("img");
    iconImg.src = customIconUrl;
    iconImg.alt = "Icon";
    iconImg.style.width = "22px";
    iconImg.style.height = "22px";
    iconImg.style.objectFit = "contain";
    iconImg.style.borderRadius = "4px";
    headerLeft.appendChild(iconImg);
  }

  const title = document.createElement("h3");
  title.className = "media-overlay-title";
  title.textContent = media.title || "Tư liệu";
  headerLeft.appendChild(title);
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "media-overlay-close-btn";
  closeBtn.textContent = "×";
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    if (activeMediaHotspotOverlay) {
      container.destroyHotspot(activeMediaHotspotOverlay);
      activeMediaHotspotOverlay = null;
    }
  };
  
  header.appendChild(headerLeft);
  header.appendChild(closeBtn);
  overlayEl.appendChild(header);

  // Content container
  const content = document.createElement("div");
  content.className = "media-overlay-content";
  content.style.display = "flex";
  content.style.flexDirection = "column";
  content.style.gap = "8px";

  let hasAnyContent = false;

  // 1. Description / Note
  if (media.description && media.description.trim()) {
    hasAnyContent = true;
    const desc = document.createElement("div");
    desc.className = "media-overlay-description";
    desc.style.whiteSpace = "pre-wrap";
    desc.style.lineHeight = "1.5";
    desc.style.fontSize = "12px";
    desc.style.maxHeight = "80px";
    desc.style.overflowY = "auto";
    desc.style.padding = "6px 10px";
    desc.textContent = media.description;
    content.appendChild(desc);
  }

  // 2. Images / Gallery
  let images = items.images || [];
  if (!images.length && (media.mediaType === "image" || media.mediaType === "gallery") && media.mediaUrl && !media.mediaUrl.startsWith("{")) {
    images = media.mediaUrl.split(',').map(u => u.trim()).filter(Boolean);
  }
  if (images.length > 0) {
    hasAnyContent = true;
    const galleryWrapper = document.createElement("div");
    galleryWrapper.style.position = "relative";
    galleryWrapper.style.width = "100%";
    galleryWrapper.style.maxHeight = "150px";
    galleryWrapper.style.height = "150px";
    galleryWrapper.style.display = "flex";
    galleryWrapper.style.alignItems = "center";
    galleryWrapper.style.justifyContent = "center";
    galleryWrapper.style.background = "rgba(0,0,0,0.4)";
    galleryWrapper.style.borderRadius = "8px";
    galleryWrapper.style.overflow = "hidden";

    let currentIndex = 0;
    const img = new Image();
    img.src = normalizeMediaUrl(images[0]);
    img.style.maxHeight = "150px";
    img.style.maxWidth = "100%";
    img.style.objectFit = "contain";
    img.style.borderRadius = "6px";
    img.style.cursor = "pointer";
    img.onclick = () => window.open(normalizeMediaUrl(images[currentIndex]), '_blank');
    galleryWrapper.appendChild(img);

    if (images.length > 1) {
      const counter = document.createElement("div");
      counter.style.position = "absolute";
      counter.style.bottom = "6px";
      counter.style.right = "6px";
      counter.style.background = "rgba(0,0,0,0.75)";
      counter.style.color = "#fff";
      counter.style.fontSize = "10px";
      counter.style.padding = "2px 6px";
      counter.style.borderRadius = "6px";
      counter.textContent = `1 / ${images.length}`;
      galleryWrapper.appendChild(counter);

      const createBtn = (text, isPrev) => {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.style.position = "absolute";
        btn.style[isPrev ? 'left' : 'right'] = "6px";
        btn.style.background = "rgba(0,0,0,0.6)";
        btn.style.color = "white";
        btn.style.border = "none";
        btn.style.borderRadius = "50%";
        btn.style.width = "26px";
        btn.style.height = "26px";
        btn.style.cursor = "pointer";
        btn.style.zIndex = "10";
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        return btn;
      };

      const prevBtn = createBtn("◀", true);
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        img.src = normalizeMediaUrl(images[currentIndex]);
        counter.textContent = `${currentIndex + 1} / ${images.length}`;
      };

      const nextBtn = createBtn("▶", false);
      nextBtn.onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % images.length;
        img.src = normalizeMediaUrl(images[currentIndex]);
        counter.textContent = `${currentIndex + 1} / ${images.length}`;
      };

      galleryWrapper.appendChild(prevBtn);
      galleryWrapper.appendChild(nextBtn);
    }
    content.appendChild(galleryWrapper);
  }

  // 3. Video
  const videoUrl = items.videoUrl || (media.mediaType === "video" ? media.mediaUrl : null);
  if (videoUrl && !videoUrl.startsWith("{")) {
    hasAnyContent = true;
    const video = document.createElement("video");
    video.controls = true;
    video.src = normalizeMediaUrl(videoUrl);
    video.style.width = "100%";
    video.style.maxHeight = "150px";
    video.style.borderRadius = "8px";
    content.appendChild(video);
  }

  // 4. YouTube
  const ytUrl = items.youtubeUrl || (media.mediaType === "youtube" ? media.mediaUrl : null);
  if (ytUrl && !ytUrl.startsWith("{")) {
    const videoId = getYouTubeVideoId(ytUrl);
    if (videoId) {
      hasAnyContent = true;
      const iframeWrapper = document.createElement("div");
      iframeWrapper.style.width = "100%";
      iframeWrapper.style.height = "150px";
      iframeWrapper.style.overflow = "hidden";
      iframeWrapper.style.borderRadius = "8px";
      iframeWrapper.style.position = "relative";

      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
      iframe.title = media.title || "YouTube Video";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;

      iframeWrapper.appendChild(iframe);
      content.appendChild(iframeWrapper);
    }
  }

  // 5. 3D Model
  const model3dUrl = items.model3dUrl || (media.mediaType === "3d" ? media.mediaUrl : null);
  if (model3dUrl && !model3dUrl.startsWith("{")) {
    hasAnyContent = true;
    const modelWrapper = document.createElement("div");
    modelWrapper.style.position = "relative";
    modelWrapper.style.width = "100%";
    modelWrapper.style.height = "150px";
    modelWrapper.style.borderRadius = "8px";
    modelWrapper.style.overflow = "hidden";
    modelWrapper.style.background = "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)";

    const model = document.createElement("model-viewer");
    model.src = normalizeMediaUrl(model3dUrl);
    model.alt = media.title || "3D Model";
    model.setAttribute("auto-rotate", "");
    model.setAttribute("camera-controls", "");
    model.style.width = "100%";
    model.style.height = "100%";
    ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((ev) => {
      model.addEventListener(ev, (e) => e.stopPropagation(), { passive: false });
    });

    const fullBtn = document.createElement("button");
    fullBtn.textContent = "⛶ Toàn màn hình";
    fullBtn.style.position = "absolute";
    fullBtn.style.bottom = "6px";
    fullBtn.style.right = "6px";
    fullBtn.style.background = "rgba(0,0,0,0.65)";
    fullBtn.style.color = "white";
    fullBtn.style.border = "1px solid rgba(255,255,255,0.2)";
    fullBtn.style.borderRadius = "4px";
    fullBtn.style.padding = "3px 6px";
    fullBtn.style.fontSize = "11px";
    fullBtn.style.cursor = "pointer";
    fullBtn.onclick = (e) => {
      e.stopPropagation();
      if (model.requestFullscreen) model.requestFullscreen();
    };

    modelWrapper.appendChild(model);
    modelWrapper.appendChild(fullBtn);
    content.appendChild(modelWrapper);
  }

  // 6. PDF
  const pdfUrl = items.pdfUrl || (media.mediaType === "pdf" ? media.mediaUrl : null);
  if (pdfUrl && !pdfUrl.startsWith("{")) {
    hasAnyContent = true;
    const pdfCard = document.createElement("div");
    pdfCard.style.background = "rgba(239, 68, 68, 0.12)";
    pdfCard.style.border = "1px solid rgba(239, 68, 68, 0.35)";
    pdfCard.style.padding = "10px 12px";
    pdfCard.style.borderRadius = "8px";
    pdfCard.style.display = "flex";
    pdfCard.style.alignItems = "center";
    pdfCard.style.justifyContent = "space-between";
    pdfCard.style.gap = "8px";

    const pdfInfo = document.createElement("div");
    pdfInfo.style.display = "flex";
    pdfInfo.style.alignItems = "center";
    pdfInfo.style.gap = "8px";
    pdfInfo.style.overflow = "hidden";

    const pdfIcon = document.createElement("span");
    pdfIcon.textContent = "📄";
    pdfIcon.style.fontSize = "18px";
    pdfInfo.appendChild(pdfIcon);

    const pdfText = document.createElement("span");
    pdfText.style.fontSize = "12px";
    pdfText.style.fontWeight = "600";
    pdfText.style.color = "#fca5a5";
    pdfText.style.overflow = "hidden";
    pdfText.style.textOverflow = "ellipsis";
    pdfText.style.whiteSpace = "nowrap";
    const pdfFileName = pdfUrl.split('/').pop().replace(/^media_\d+_/, '') || "Tài liệu PDF";
    pdfText.textContent = decodeURIComponent(pdfFileName);
    pdfInfo.appendChild(pdfText);

    const pdfBtn = document.createElement("a");
    pdfBtn.href = normalizeMediaUrl(pdfUrl);
    pdfBtn.target = "_blank";
    pdfBtn.className = "btn-primary";
    pdfBtn.style.padding = "5px 10px";
    pdfBtn.style.fontSize = "11px";
    pdfBtn.style.whiteSpace = "nowrap";
    pdfBtn.style.textDecoration = "none";
    pdfBtn.style.background = "#dc2626";
    pdfBtn.textContent = "Xem PDF ↗";

    pdfCard.appendChild(pdfInfo);
    pdfCard.appendChild(pdfBtn);
    content.appendChild(pdfCard);
  }

  // 7. Facebook
  const fbUrl = items.facebookUrl || (media.mediaType === "facebook" ? media.mediaUrl : null);
  if (fbUrl && !fbUrl.startsWith("{")) {
    hasAnyContent = true;
    const fbCard = document.createElement("div");
    fbCard.style.background = "linear-gradient(135deg, #1877f2 0%, #0a66c2 100%)";
    fbCard.style.padding = "16px";
    fbCard.style.borderRadius = "8px";
    fbCard.style.textAlign = "center";
    fbCard.style.color = "white";

    const fbTitle = document.createElement("div");
    fbTitle.style.fontWeight = "600";
    fbTitle.style.fontSize = "13px";
    fbTitle.style.marginBottom = "8px";
    fbTitle.textContent = "👍 Bài viết / Trang Facebook";

    const fbLink = document.createElement("a");
    fbLink.href = fbUrl;
    fbLink.target = "_blank";
    fbLink.style.display = "inline-block";
    fbLink.style.padding = "6px 14px";
    fbLink.style.background = "white";
    fbLink.style.color = "#1877f2";
    fbLink.style.fontWeight = "700";
    fbLink.style.fontSize = "12px";
    fbLink.style.borderRadius = "6px";
    fbLink.style.textDecoration = "none";
    fbLink.textContent = "Mở liên kết Facebook ↗";

    fbCard.appendChild(fbTitle);
    fbCard.appendChild(fbLink);
    content.appendChild(fbCard);
  }

  // 8. Web Link
  const webUrl = items.webUrl || (media.mediaType === "web" ? media.mediaUrl : null);
  if (webUrl && !webUrl.startsWith("{")) {
    hasAnyContent = true;
    const webCard = document.createElement("div");
    webCard.style.background = "rgba(37,99,235,0.15)";
    webCard.style.border = "1px solid rgba(37,99,235,0.3)";
    webCard.style.padding = "14px";
    webCard.style.borderRadius = "8px";
    webCard.style.display = "flex";
    webCard.style.alignItems = "center";
    webCard.style.justifyContent = "space-between";
    webCard.style.gap = "10px";

    const webText = document.createElement("span");
    webText.style.fontSize = "12px";
    webText.style.color = "#93c5fd";
    webText.style.overflow = "hidden";
    webText.style.textOverflow = "ellipsis";
    webText.style.whiteSpace = "nowrap";
    webText.textContent = `🌐 ${webUrl}`;

    const webLink = document.createElement("a");
    webLink.href = normalizeMediaUrl(webUrl);
    webLink.target = "_blank";
    webLink.className = "btn-primary";
    webLink.style.padding = "6px 12px";
    webLink.style.fontSize = "11px";
    webLink.style.whiteSpace = "nowrap";
    webLink.style.textDecoration = "none";
    webLink.textContent = "Mở trang ↗";

    webCard.appendChild(webText);
    webCard.appendChild(webLink);
    content.appendChild(webCard);
  }

  if (hasAnyContent) {
    overlayEl.appendChild(content);
  }

  // Create hotspot using Marzipano positioning
  activeMediaHotspotOverlay = container.createHotspot(overlayEl, {
    yaw: yaw,
    pitch: pitch
  });

  return overlayEl;
}

export function hideMediaOverlay() {
  if (!mediaOverlay) return;
  mediaOverlay.classList.add("hidden");
  if (mediaOverlayContent) mediaOverlayContent.innerHTML = "";
  if (mediaOverlayLink) mediaOverlayLink.href = "#";
  
  // remove active hotspot overlay in container? 
  // actually hideMediaOverlay doesn't destroy the hotspot overlay, 
  // only createMediaHotspotOverlay handles activeMediaHotspotOverlay destruction or closing when X is clicked.
}

export function showMediaOverlay(media) {
  if (!mediaOverlay) return;
  const url = normalizeMediaUrl(media.mediaUrl);

  if (mediaOverlayTitle) mediaOverlayTitle.textContent = media.title || "Tư liệu";
  if (mediaOverlayDescription) {
    mediaOverlayDescription.textContent = media.description || "";
    mediaOverlayDescription.style.display = media.description ? "block" : "none";
  }

  if (mediaOverlayContent) {
    mediaOverlayContent.innerHTML = "";

    if (media.mediaType === "image") {
    const img = new Image();
    img.src = url;
    img.alt = media.title || "Media";
    mediaOverlayContent.appendChild(img);
  } else if (media.mediaType === "3d") {
    const model = document.createElement("model-viewer");
    model.src = url;
    model.alt = media.title || "3D Model";
    model.autoRotate = true;
    model.cameraControls = true;
    model.style.width = "100%";
    model.style.height = "320px";
    model.style.background = "linear-gradient(#ffffff, #ada996)"; 
    ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((eventName) => {
      model.addEventListener(eventName, (e) => e.stopPropagation(), { passive: false });
    });
    mediaOverlayContent.appendChild(model);
  } else if (media.mediaType === "gallery") {
    let urls = [];
    if (media.gallery && Array.isArray(media.gallery)) {
      urls = media.gallery;
    } else if (media.mediaUrl) {
      urls = media.mediaUrl.split(',').map(u => u.trim()).filter(u => u);
    }
    
    if (urls.length > 0) {
      let currentIndex = 0;
      
      const galleryWrapper = document.createElement("div");
      galleryWrapper.style.position = "relative";
      galleryWrapper.style.width = "100%";
      galleryWrapper.style.height = "320px";
      galleryWrapper.style.display = "flex";
      galleryWrapper.style.alignItems = "center";
      galleryWrapper.style.justifyContent = "center";
      galleryWrapper.style.background = "#000";
      
      const img = new Image();
      img.src = normalizeMediaUrl(urls[0]);
      img.style.maxHeight = "100%";
      img.style.maxWidth = "100%";
      img.style.objectFit = "contain";
      
      galleryWrapper.appendChild(img);
      
      if (urls.length > 1) {
        const createBtn = (text, isPrev) => {
          const btn = document.createElement("button");
          btn.textContent = text;
          btn.style.position = "absolute";
          btn.style[isPrev ? 'left' : 'right'] = "10px";
          btn.style.background = "rgba(0,0,0,0.5)";
          btn.style.color = "white";
          btn.style.border = "none";
          btn.style.borderRadius = "50%";
          btn.style.width = "40px";
          btn.style.height = "40px";
          btn.style.cursor = "pointer";
          btn.style.zIndex = "10";
          return btn;
        };

        const prevBtn = createBtn("◀", true);
        prevBtn.onclick = (e) => {
          e.stopPropagation();
          currentIndex = (currentIndex - 1 + urls.length) % urls.length;
          img.src = normalizeMediaUrl(urls[currentIndex]);
        };
        
        const nextBtn = createBtn("▶", false);
        nextBtn.onclick = (e) => {
          e.stopPropagation();
          currentIndex = (currentIndex + 1) % urls.length;
          img.src = normalizeMediaUrl(urls[currentIndex]);
        };
        
        galleryWrapper.appendChild(prevBtn);
        galleryWrapper.appendChild(nextBtn);
      }
      mediaOverlayContent.appendChild(galleryWrapper);
    } else {
      const err = document.createElement("div");
      err.textContent = "Gallery trống";
      mediaOverlayContent.appendChild(err);
    }
  } else if (media.mediaType === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.src = url;
      video.style.maxHeight = "320px";
      mediaOverlayContent.appendChild(video);
    } else if (media.mediaType === "pdf") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.title = media.title || "PDF";
      iframe.height = "320";
      mediaOverlayContent.appendChild(iframe);
    } else if (media.mediaType === "web") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.title = media.title || "Web";
      iframe.height = "450";
      iframe.style.width = "100%";
      iframe.style.border = "none";
      iframe.style.borderRadius = "6px";
      mediaOverlayContent.appendChild(iframe);
    } else {
      const note = document.createElement("div");
      note.style.color = "#d7d7d7";
      note.style.fontSize = "13px";
      note.textContent = "Không thể xem trực tiếp. Nhấn " + "\u27a1\ufe0f" + " để mở trong tab mới.";
      mediaOverlayContent.appendChild(note);
    }
  }

  if (mediaOverlayLink) {
    mediaOverlayLink.href = url || "#";
    mediaOverlayLink.style.display = url ? "inline-flex" : "none";
  }

  mediaOverlay.classList.remove("hidden");
}


export let activeNoteHotspotEl = null;

export function clearActiveNoteHotspot() {
  if (activeNoteHotspotEl) {
    activeNoteHotspotEl.classList.remove("visible");
    activeNoteHotspotEl = null;
  }
}

export function resetActiveNoteHotspot() {
  activeNoteHotspotEl = null;
}

export function createMediaHotspotElement(media, onClickHandler) {
  function getYouTubeVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^?&\n]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  const customIconKey = 'media_' + media.mediaType;
  const hasCustomIcon = window.customIcons && window.customIcons[customIconKey];

  // Inline YouTube video player if YouTube type with valid video ID and no custom icon
  if (media.mediaType === "youtube" && !hasCustomIcon) {
    const videoId = getYouTubeVideoId(media.mediaUrl);
    if (videoId) {
      const el = document.createElement("div");
      el.className = "media-hotspot youtube-hotspot";
      el.setAttribute("aria-label", media.title || "YouTube Video");
      
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
      iframe.title = media.title || "YouTube Video";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.borderRadius = "6px";
      iframe.frameBorder = "0";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      
      el.appendChild(iframe);
      return el;
    }
  }

  // Create expandable pill tag element (info-hotspot) for note and all document media tags
  const el = document.createElement("div");
  const isNote = media.mediaType === "note";
  el.className = isNote ? "note-hotspot info-hotspot" : `media-doc-hotspot info-hotspot media-${media.mediaType}-hotspot`;
  el.setAttribute("aria-label", media.title || getMediaDefaultTitle(media.mediaType));
  el.style.cursor = "pointer";

  const header = document.createElement("div");
  header.className = "info-hotspot-header";

  const iconWrap = document.createElement("div");
  iconWrap.className = "info-hotspot-icon-wrapper";

  if (media.iconUrl) {
    const icon = document.createElement("img");
    icon.className = "info-hotspot-icon";
    icon.src = media.iconUrl;
    icon.alt = "Icon";
    iconWrap.appendChild(icon);
  } else if (hasCustomIcon) {
    const icon = document.createElement("img");
    icon.className = "info-hotspot-icon";
    icon.src = window.customIcons[customIconKey];
    icon.alt = media.mediaType || "media";
    iconWrap.appendChild(icon);
  } else if (window.customIcons && window.customIcons['media_doc']) {
    const icon = document.createElement("img");
    icon.className = "info-hotspot-icon";
    icon.src = window.customIcons['media_doc'];
    icon.alt = "doc";
    iconWrap.appendChild(icon);
  } else {
    iconWrap.innerHTML = getMediaIconSVG(media.mediaType || "doc");
  }

  const titleWrap = document.createElement("div");
  titleWrap.className = "info-hotspot-title-wrapper";
  const title = document.createElement("div");
  title.className = "info-hotspot-title";
  title.textContent = media.title || getMediaDefaultTitle(media.mediaType);
  titleWrap.appendChild(title);

  header.appendChild(iconWrap);
  header.appendChild(titleWrap);

  if (isNote) {
    const closeWrap = document.createElement("div");
    closeWrap.className = "info-hotspot-close-wrapper";
    closeWrap.setAttribute("role", "button");
    closeWrap.setAttribute("aria-label", "Đóng ghi chú");
    const closeIcon = document.createElement("span");
    closeIcon.className = "info-hotspot-close-icon";
    closeIcon.textContent = "×";
    closeWrap.appendChild(closeIcon);
    header.appendChild(closeWrap);

    const content = document.createElement("div");
    content.className = "info-hotspot-text";
    content.textContent = media.mediaUrl || media.description || "Không có nội dung";

    el.appendChild(header);
    el.appendChild(content);

    closeWrap.addEventListener("click", (e) => {
      e.stopPropagation();
      el.classList.remove("visible");
      if (activeNoteHotspotEl === el) activeNoteHotspotEl = null;
    });

    header.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activeNoteHotspotEl && activeNoteHotspotEl !== el) {
        activeNoteHotspotEl.classList.remove("visible");
      }
      const willOpen = !el.classList.contains("visible");
      el.classList.toggle("visible", willOpen);
      activeNoteHotspotEl = willOpen ? el : null;
    });

    el.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((eventName) => {
      content.addEventListener(eventName, (e) => e.stopPropagation(), { passive: false });
    });
  } else {
    // Document & media tags: click header triggers media overlay viewer
    el.appendChild(header);

    header.addEventListener("click", (e) => {
      e.stopPropagation();
      if (onClickHandler) onClickHandler(media);
    });

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (onClickHandler) onClickHandler(media);
    });
  }

  return el;
}

function getMediaDefaultTitle(type) {
  const titles = {
    note: "Ghi chú",
    pdf: "Tài liệu PDF",
    image: "Hình ảnh",
    gallery: "Bộ sưu tập",
    video: "Video",
    "3d": "Mô hình 3D",
    web: "Liên kết web",
    facebook: "Trang Facebook",
    youtube: "Video YouTube"
  };
  return titles[type] || "Tư liệu";
}

export function getMediaIconSVG(type) {
  switch (type) {
    case "pdf":
      return `<svg viewBox="0 0 24 24" class="info-hotspot-icon" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
    case "image":
    case "gallery":
      return `<svg viewBox="0 0 24 24" class="info-hotspot-icon" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    case "video":
      return `<svg viewBox="0 0 24 24" class="info-hotspot-icon" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="15" height="16" rx="2"/><polygon points="17 9 22 6 22 18 17 15" fill="#f59e0b"/></svg>`;
    case "3d":
      return `<svg viewBox="0 0 24 24" class="info-hotspot-icon" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
    case "web":
      return `<svg viewBox="0 0 24 24" class="info-hotspot-icon" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
    case "facebook":
      return `<svg viewBox="0 0 24 24" class="info-hotspot-icon" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
    case "note":
      return `<svg viewBox="0 0 24 24" class="info-hotspot-icon" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`;
    case "all":
    case "doc":
    default:
      return `<svg viewBox="0 0 24 24" class="info-hotspot-icon" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  }
}

/**
 * Creates a 3D highlight polygon element for Marzipano.
 * Renders an SVG polygon with blue fill + white glow, anchored at the centroid.
 * @param {Object} media - media hotspot data with highlightPolygon: [[yaw,pitch],...]
 * @returns {{ el: HTMLElement, anchorYaw: number, anchorPitch: number } | null}
 */
export function create3DHighlightElement(media) {
  const points = media.highlightPolygon;
  if (!points || points.length < 3) return null;

  // Compute centroid in yaw/pitch space
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;

  const SCALE = 10; // px per degree
  const OFFSET = 500; // SVG center
  const SIZE = 1000;

  const svgPoints = points.map(([y, p]) => {
    const sx = OFFSET + (y - cx) * SCALE;
    const sy = OFFSET - (p - cy) * SCALE;
    return `${sx},${sy}`;
  }).join(' ');

  const el = document.createElement('div');
  el.className = 'highlight-3d-hotspot';
  el.style.cssText = 'position:absolute;pointer-events:none;width:0;height:0;overflow:visible;';

  el.innerHTML = `
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
         xmlns="http://www.w3.org/2000/svg"
         style="position:absolute;left:-${OFFSET}px;top:-${OFFSET}px;overflow:visible;pointer-events:none;">
      <defs>
        <filter id="glow-3d-filter" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- Outer glow -->
      <polygon points="${svgPoints}"
        fill="none"
        stroke="rgba(60,160,255,0.45)"
        stroke-width="10"
        stroke-linejoin="round"
        opacity="0.7"/>
      <!-- Main polygon -->
      <polygon points="${svgPoints}"
        fill="rgba(30,100,255,0.25)"
        stroke="rgba(255,255,255,0.88)"
        stroke-width="2.5"
        stroke-linejoin="round"
        filter="url(#glow-3d-filter)"
        class="highlight-3d-polygon"/>
    </svg>
  `.trim();

  return { el, anchorYaw: cx, anchorPitch: cy };
}

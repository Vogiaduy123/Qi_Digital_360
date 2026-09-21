const fs = require('fs');
const path = require('path');

const MEDIAMTX_API_URL = process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997';
const MEDIAMTX_WHEP_PORT = process.env.MEDIAMTX_WHEP_PORT || '8889';
const CONFIG_FILE = path.resolve(__dirname, '../mediamtx.yml');

/**
 * Generate a clean stream key from sensor ID or name
 * e.g. "cam_1787306462029"
 */
function sanitizeStreamKey(rawKey) {
  if (!rawKey) return `cam_${Date.now()}`;
  const cleaned = String(rawKey)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.startsWith('cam_') || cleaned.startsWith('cam') ? cleaned : `cam_${cleaned}`;
}

/**
 * Read existing stream paths from mediamtx.yml
 */
function readExistingPathsFromYaml() {
  const paths = new Map();
  try {
    if (!fs.existsSync(CONFIG_FILE)) return paths;
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    const lines = content.split(/\r?\n/);
    let inPaths = false;
    let currentKey = null;

    for (const line of lines) {
      if (/^paths:\s*$/.test(line.trim())) {
        inPaths = true;
        continue;
      }
      if (inPaths) {
        if (/^[a-zA-Z0-9_-]+:/.test(line)) {
          // Reached another top-level section
          break;
        }
        const keyMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/);
        if (keyMatch) {
          currentKey = keyMatch[1];
          continue;
        }
        const sourceMatch = line.match(/^ {4}source:\s*(.+)$/);
        if (sourceMatch && currentKey) {
          paths.set(currentKey, sourceMatch[1].trim());
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Error reading mediamtx.yml:', err.message);
  }
  return paths;
}

/**
 * Update the mediamtx.yml file cleanly with proper indentation
 */
function persistPathToYaml(streamKey, rtspUrl) {
  try {
    const paths = readExistingPathsFromYaml();
    paths.set(streamKey, rtspUrl);

    let output = `# MediaMTX config for RTSP -> WebRTC (WHEP)
# Run MediaMTX in this folder and it will expose WHEP endpoint on port 8889.

logLevel: info

# REST API for dynamic stream path management
api: yes
apiAddress: :9997

# WebRTC (WHEP/WHIP) listener
webrtc: yes
webrtcAddress: :8889

paths:
`;

    for (const [key, source] of paths.entries()) {
      output += `  ${key}:\n    source: ${source}\n    rtspTransport: tcp\n    sourceOnDemand: yes\n`;
    }

    fs.writeFileSync(CONFIG_FILE, output, 'utf8');
  } catch (err) {
    console.error('⚠️ [WebRTC Manager] Error updating mediamtx.yml:', err.message);
  }
}

/**
 * Register or update an RTSP path in MediaMTX via REST API
 */
async function registerRtspStream(streamKey, rtspUrl) {
  const key = sanitizeStreamKey(streamKey);
  let effectiveRtsp = String(rtspUrl || '').trim();

  // WebRTC cannot play MJPEG (Profile 3/4 on Matrix). Auto-remap to H.264 sub-stream (unicaststream/2)
  if (effectiveRtsp.includes('/unicaststream/4') || effectiveRtsp.includes('/unicaststream/3')) {
    console.log('ℹ️ [WebRTC Manager] Auto-remapping Matrix MJPEG stream (3/4) to H.264 sub-stream (/unicaststream/2)');
    effectiveRtsp = effectiveRtsp.replace(/\/unicaststream\/[34]/, '/unicaststream/2');
  }

  const payload = {
    source: effectiveRtsp,
    rtspTransport: 'tcp',
    sourceOnDemand: true
  };

  // 1. Persist to mediamtx.yml cleanly (MediaMTX automatically reloads via file watcher)
  persistPathToYaml(key, effectiveRtsp);

  // 2. Optionally ping REST API with strict 800ms timeout
  try {
    const addRes = await fetch(`${MEDIAMTX_API_URL}/v3/config/paths/add/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(800)
    });

    if (addRes.ok) {
      console.log(`✅ [WebRTC Manager] Added path "${key}" -> ${effectiveRtsp}`);
      return { success: true, streamKey: key };
    }

    // If already exists, patch it
    const patchRes = await fetch(`${MEDIAMTX_API_URL}/v3/config/paths/patch/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(800)
    });

    if (patchRes.ok) {
      console.log(`✅ [WebRTC Manager] Updated path "${key}" -> ${effectiveRtsp}`);
      return { success: true, streamKey: key };
    }

    return { success: true, streamKey: key, note: 'Saved to mediamtx.yml' };
  } catch (err) {
    // MediaMTX automatically reloads from mediamtx.yml, so timeout/error is completely safe
    return { success: true, streamKey: key, note: 'Saved to mediamtx.yml' };
  }
}

/**
 * Generate client-accessible WHEP URL
 */
function getWhepUrl(streamKey, req) {
  const key = sanitizeStreamKey(streamKey);
  let host = 'localhost';

  if (req) {
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || '';
    host = hostHeader.split(':')[0] || 'localhost';
  }

  const isHttps = req && (req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https');

  // If in production HTTPS behind reverse proxy, standard path is /whep/:key/whep
  if (isHttps) {
    return `https://${host}/whep/${key}/whep`;
  }

  // Local development: direct port 8889
  return `http://${host}:${MEDIAMTX_WHEP_PORT}/${key}/whep`;
}

/**
 * Synchronize all camera sensors on startup
 */
async function syncAllCameraStreams(sensors) {
  if (!Array.isArray(sensors)) return;
  for (const s of sensors) {
    if (s.type === 'camera' && s.camera) {
      const rtsp = s.camera.rtspUrl || (s.camera.streamUrl?.startsWith('rtsp://') ? s.camera.streamUrl : null);
      if (rtsp) {
        const streamKey = s.camera.streamKey || `cam_${s.id}`;
        await registerRtspStream(streamKey, rtsp);
      }
    }
  }
}

module.exports = {
  sanitizeStreamKey,
  registerRtspStream,
  getWhepUrl,
  syncAllCameraStreams
};

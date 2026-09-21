const SensorModel = require("../models/sensorModel");
const db = require("../db");
const { broadcastSensors } = require("./sseController");
const { createNotification } = require("../services/notificationService");
const webrtcService = require("../services/webrtcService");

const sensorLastStateCache = new Map();

function calculateAQI(pm25) {
  if (pm25 <= 12.0) return Math.round((50 / 12.0) * pm25);
  if (pm25 <= 35.4) return Math.round(50 + ((100 - 50) / (35.4 - 12.0)) * (pm25 - 12.0));
  if (pm25 <= 55.4) return Math.round(101 + ((150 - 101) / (55.4 - 35.4)) * (pm25 - 35.4));
  if (pm25 <= 150.4) return Math.round(151 + ((200 - 151) / (150.4 - 55.4)) * (pm25 - 55.4));
  if (pm25 <= 250.4) return Math.round(201 + ((300 - 201) / (250.4 - 150.4)) * (pm25 - 150.4));
  return 301;
}

function getValueByPath(obj, pathStr) {
  if (!obj || !pathStr) return null;
  const parts = pathStr.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    current = current[part];
  }
  return current;
}

async function fetchCombinedData(config) {
  const weatherApi = config.weatherApi;
  const airApi = config.airQualityApi;

  let temp = 26 + Math.random() * 5;
  let humidity = 70 + Math.random() * 10;
  let weather = "partly cloudy";

  try {
    const lat = Number(weatherApi?.params?.lat);
    const lon = Number(weatherApi?.params?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const weatherUrl = `${weatherApi.url}?lat=${lat}&lon=${lon}&appid=${weatherApi.apiKey}&units=${weatherApi.params.units}`;
      const weatherResponse = await fetch(weatherUrl);
      const weatherData = await weatherResponse.json();
      if (weatherData.main && weatherData.main.temp !== undefined) {
        temp = Math.round(weatherData.main.temp * 10) / 10;
        humidity = Math.round(weatherData.main.humidity);
        weather = weatherData.weather?.[0]?.description || weather;
      }
    }
  } catch {}

  let pm25Value = 25 + Math.random() * 20;

  try {
    const pm25Url = `${airApi.url}?token=${airApi.token}`;
    const pm25Response = await fetch(pm25Url);
    const pm25Data = await pm25Response.json();
    if (pm25Data.status === "ok" && pm25Data.data?.iaqi?.pm25?.v && typeof pm25Data.data.iaqi.pm25.v === "number") {
      pm25Value = pm25Data.data.iaqi.pm25.v;
    } else if (pm25Data.status === "ok" && pm25Data.data?.aqi && typeof pm25Data.data.aqi === "number" && pm25Data.data.aqi > 0) {
      pm25Value = pm25Data.data.aqi;
    }
  } catch {}

  const customApi = config.customApi;
  if (customApi && customApi.url) {
    try {
      const response = await fetch(customApi.url, { headers: customApi.headers || {} });
      const customData = await response.json();
      const mappings = customApi.mappings || {};
      if (mappings.temperature) {
        const val = getValueByPath(customData, mappings.temperature);
        if (val !== null && !isNaN(Number(val))) temp = Number(val);
      }
      if (mappings.humidity) {
        const val = getValueByPath(customData, mappings.humidity);
        if (val !== null && !isNaN(Number(val))) humidity = Number(val);
      }
      if (mappings.pm25) {
        const val = getValueByPath(customData, mappings.pm25);
        if (val !== null && !isNaN(Number(val))) pm25Value = Number(val);
      }
      if (customData.weather) weather = String(customData.weather);
    } catch {}
  }

  const locationName = weatherApi && weatherApi.params ? `Lat: ${weatherApi.params.lat}, Lon: ${weatherApi.params.lon}` : "Custom Source";

  return {
    temperature: temp,
    humidity: humidity,
    pm25: Math.round(pm25Value * 10) / 10,
    location: locationName,
    timestamp: new Date().toISOString(),
    aqi: calculateAQI(pm25Value),
    weather: weather
  };
}

class SensorController {
  // GET /api/sensors
  static async getSensors(req, res) {
    try {
      let sensors = await SensorModel.getAll();
      const roomId = req.query.roomId ? Number(req.query.roomId) : null;
      if (roomId) {
        sensors = sensors.filter(s => Number(s.roomId) === roomId);
      }
      res.json({ success: true, sensors });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/sensors/:id
  static async getSensorById(req, res) {
    const sensorId = Number(req.params.id);
    try {
      const sensors = await SensorModel.getAll();
      const sensor = sensors.find(s => Number(s.id) === sensorId);
      if (!sensor) return res.status(404).json({ success: false, error: "Sensor not found" });
      res.json({ success: true, sensor });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/sensors
  static async createSensor(req, res) {
    const { name, roomId, position, sensors, type, camera, iconUrl } = req.body;
    if (!name || !roomId) {
      return res.status(400).json({ success: false, error: "Missing required fields: name, roomId" });
    }

    try {
      const newSensorId = Date.now();
      let finalCamera = camera ? { ...camera } : {};
      if (type === "camera" && finalCamera.rtspUrl) {
        const cleanRtsp = String(finalCamera.rtspUrl).trim();
        const streamKey = `cam_${newSensorId}`;
        await webrtcService.addCameraStream(streamKey, cleanRtsp);
        finalCamera.rtspUrl = cleanRtsp;
        finalCamera.streamKey = streamKey;
        finalCamera.streamUrl = webrtcService.getWhepUrl(streamKey, req);
      }

      const newSensor = {
        id: newSensorId,
        name,
        roomId: Number(roomId),
        type: type || "environment",
        position: position || { yaw: 0, pitch: 0 },
        lastUpdate: new Date().toISOString(),
        color: type === "camera" ? "#2196F3" : "#4CAF50",
        iconUrl: iconUrl || null,
        ...(type === "camera" ? { camera: finalCamera } : { sensors: sensors || {} })
      };

      await db.insertSensor(newSensor);
      await broadcastSensors();
      res.json({ success: true, sensor: newSensor });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PUT /api/sensors/:id
  static async updateSensor(req, res) {
    const sensorId = req.params.id;
    const { name, roomId, position, sensors: envSensors, type, camera, iconUrl } = req.body;

    try {
      const allSensors = await SensorModel.getAll();
      const sensor = allSensors.find(s => String(s.id) === String(sensorId) || Number(s.id) === Number(sensorId));

      const nextType = type || sensor?.type || "environment";
      const isCamera = nextType === "camera";
      const updates = { type: nextType };
      if (name) updates.name = name;
      if (roomId) updates.roomId = Number(roomId);
      if (position) updates.position = position;
      if (iconUrl !== undefined) updates.iconUrl = iconUrl;
      updates.color = isCamera ? "#2196F3" : "#4CAF50";

      if (isCamera && camera) {
        const cameraObj = { ...(sensor?.camera || {}), ...camera };
        if (camera.rtspUrl) {
          const cleanRtsp = String(camera.rtspUrl).trim();
          const streamKey = `cam_${sensorId}`;
          await webrtcService.addCameraStream(streamKey, cleanRtsp);
          cameraObj.rtspUrl = cleanRtsp;
          cameraObj.streamKey = streamKey;
          cameraObj.streamUrl = webrtcService.getWhepUrl(streamKey, req);
        }
        updates.camera = cameraObj;
      } else if (!isCamera && envSensors) {
        updates.sensors = envSensors;
      }
      updates.lastUpdate = new Date().toISOString();

      await db.updateSensor(sensorId, updates);
      await broadcastSensors();
      const updated = (await SensorModel.getAll()).find(s => String(s.id) === String(sensorId) || Number(s.id) === Number(sensorId));
      res.json({ success: true, sensor: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/sensors/:id
  static async deleteSensor(req, res) {
    const sensorId = Number(req.params.id);
    try {
      await db.deleteSensor(sensorId);
      await broadcastSensors();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/camera/convert-rtsp
  static async convertRtsp(req, res) {
    const { rtspUrl, streamKey } = req.body;
    if (!rtspUrl) {
      return res.status(400).json({ success: false, error: "rtspUrl is required" });
    }

    try {
      const key = streamKey || `cam_${Date.now()}`;
      const cleanRtsp = String(rtspUrl).trim();
      await webrtcService.addCameraStream(key, cleanRtsp);
      const whepUrl = webrtcService.getWhepUrl(key, req);
      res.json({ success: true, streamKey: key, whepUrl });
    } catch (err) {
      console.error("❌ Lỗi chuyển đổi RTSP sang WebRTC:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/admin/sensors
  static async getAdminSensors(req, res) {
    try {
      const sensors = await SensorModel.getAll();
      res.json({ success: true, sensors });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/sensors
  static async saveAdminSensors(req, res) {
    const { sensors } = req.body;
    if (!Array.isArray(sensors)) {
      return res.status(400).json({ success: false, error: "sensors must be an array" });
    }

    try {
      await SensorModel.saveAll(sensors);
      await broadcastSensors();
      res.json({ success: true, message: "Sensors saved successfully", sensors });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/sensors/realtime-update
  static async updateRealtime(req, res) {
    const { sensorId, temperature, humidity, pm25, co2, smoke } = req.body;
    if (!sensorId) {
      return res.status(400).json({ success: false, error: "Missing sensorId" });
    }

    const sId = Number(sensorId);
    try {
      const allSensors = await SensorModel.getAll();
      const dbSensor = allSensors.find(s => Number(s.id) === sId);
      if (!dbSensor) {
        return res.status(404).json({ success: false, error: "Sensor not found" });
      }

      const thresholds = await SensorModel.getThresholds();
      let lastState = sensorLastStateCache.get(sId);
      if (!lastState) {
        lastState = {
          temperature: dbSensor.temperature?.value ?? null,
          humidity: dbSensor.humidity?.value ?? null,
          pm25: dbSensor.pm25?.value ?? null,
          co2: dbSensor.co2?.value ?? null,
          smoke: dbSensor.smoke?.value ?? null
        };
        sensorLastStateCache.set(sId, lastState);
      }

      const updates = {};
      const changes = [];

      if (temperature !== undefined && temperature !== null) {
        const val = Number(temperature);
        if (lastState.temperature === null || Math.abs(val - lastState.temperature) >= thresholds.temperature) {
          updates.temperature = { ...(dbSensor.temperature || {}), value: val };
          changes.push(`Nhiệt độ: ${lastState.temperature}°C -> ${val}°C`);
          lastState.temperature = val;
        }
      }

      if (humidity !== undefined && humidity !== null) {
        const val = Number(humidity);
        if (lastState.humidity === null || Math.abs(val - lastState.humidity) >= thresholds.humidity) {
          updates.humidity = { ...(dbSensor.humidity || {}), value: val };
          changes.push(`Độ ẩm: ${lastState.humidity}% -> ${val}%`);
          lastState.humidity = val;
        }
      }

      if (pm25 !== undefined && pm25 !== null) {
        const val = Number(pm25);
        if (lastState.pm25 === null || Math.abs(val - lastState.pm25) >= thresholds.pm25) {
          updates.pm25 = { ...(dbSensor.pm25 || {}), value: val };
          changes.push(`PM2.5: ${lastState.pm25} -> ${val} µg/m³`);
          lastState.pm25 = val;
        }
      }

      if (co2 !== undefined && co2 !== null) {
        const val = Number(co2);
        if (lastState.co2 === null || Math.abs(val - lastState.co2) >= thresholds.co2) {
          updates.co2 = { ...(dbSensor.co2 || {}), value: val };
          changes.push(`CO2: ${lastState.co2} -> ${val} ppm`);
          lastState.co2 = val;
        }
      }

      if (smoke !== undefined && smoke !== null) {
        const val = Number(smoke);
        if (lastState.smoke === null || Math.abs(val - lastState.smoke) >= thresholds.smoke) {
          updates.smoke = { ...(dbSensor.smoke || {}), value: val };
          changes.push(`Khói: ${lastState.smoke} -> ${val}`);
          lastState.smoke = val;
        }
      }

      if (Object.keys(updates).length > 0) {
        const updatedSensors = allSensors.map(s => {
          if (Number(s.id) === sId) {
            return { ...s, ...updates };
          }
          return s;
        });

        await SensorModel.saveAll(updatedSensors);
        await broadcastSensors();

        if (changes.length > 0) {
          await createNotification(
            "sensor_update",
            `Cập nhật cảm biến: ${dbSensor.name || sId}`,
            `Cảm biến [${dbSensor.name || sId}] thay đổi: ${changes.join(", ")}`,
            "IoT Gateway"
          );
        }

        return res.json({ success: true, updated: true, changes });
      }

      res.json({ success: true, updated: false, message: "No significant threshold change" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/real-data/combined
  static async getCombinedData(req, res) {
    try {
      const roomId = req.query.roomId;
      let config;
      if (roomId) {
        const roomConfigObj = await SensorModel.getRoomApiConfig(roomId);
        config = roomConfigObj.config;
      } else {
        config = await SensorModel.getApiConfig();
      }

      const data = await fetchCombinedData(config);
      res.json({ success: true, data });
    } catch (err) {
      res.json({
        success: true,
        data: {
          temperature: 26.5,
          humidity: 70,
          pm25: 35,
          location: "Mock Data",
          timestamp: new Date().toISOString(),
          aqi: calculateAQI(35),
          weather: "clear sky"
        }
      });
    }
  }

  // POST /api/real-data/combined/custom
  static async getCustomCombinedData(req, res) {
    try {
      const config = req.body;
      const data = await fetchCombinedData(config);
      res.json({ success: true, data });
    } catch (err) {
      res.json({
        success: true,
        data: {
          temperature: 26.5,
          humidity: 70,
          pm25: 35,
          location: "Mock Data",
          timestamp: new Date().toISOString(),
          aqi: calculateAQI(35),
          weather: "clear sky"
        }
      });
    }
  }

  // GET /api/real-data/pm25
  static async getPm25Data(req, res) {
    try {
      const config = await SensorModel.getApiConfig();
      const combined = await fetchCombinedData(config);
      res.json({
        success: true,
        pm25: combined.pm25,
        aqi: combined.aqi,
        location: combined.location,
        timestamp: combined.timestamp
      });
    } catch (err) {
      res.json({
        success: true,
        pm25: 35,
        aqi: calculateAQI(35),
        location: "Mock Data",
        timestamp: new Date().toISOString()
      });
    }
  }

  // GET & POST /api/rooms/:roomId/api-config
  static async getRoomApiConfig(req, res) {
    try {
      const result = await SensorModel.getRoomApiConfig(req.params.roomId);
      res.json({ success: true, config: result.config, isDefault: result.isDefault });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async saveRoomApiConfig(req, res) {
    try {
      await SensorModel.saveRoomApiConfig(req.params.roomId, req.body);
      res.json({ success: true, message: "Room API config saved successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET & POST /api/config/api
  static async getGlobalApiConfig(req, res) {
    try {
      const config = await SensorModel.getApiConfig();
      res.json({ success: true, config });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async saveGlobalApiConfig(req, res) {
    try {
      await SensorModel.saveApiConfig(req.body);
      res.json({ success: true, message: "API config saved successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = SensorController;

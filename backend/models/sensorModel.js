const db = require("../db");
const fs = require("fs");
const path = require("path");
const { DATA_DIR, ROOM_API_CONFIGS_DIR } = require("../config/env");

const SENSOR_THRESHOLDS_FILE = path.join(DATA_DIR, "sensor-thresholds.json");

function getDefaultApiConfig() {
  return {
    weatherApi: {
      provider: "openweathermap",
      url: "https://api.openweathermap.org/data/2.5/weather",
      apiKey: "",
      params: { lat: 10.7769, lon: 106.7009, units: "metric" }
    },
    airQualityApi: {
      provider: "waqi",
      url: "https://api.waqi.info/feed/@13659/",
      token: ""
    },
    refreshInterval: 10000,
    autoRefresh: true
  };
}

class SensorModel {
  static async getAll() {
    return await db.getSensors();
  }

  static async saveAll(sensors) {
    return await db.saveSensors(sensors);
  }

  static async getApiConfig() {
    try {
      const config = await db.getAppConfig("api_config");
      return config || getDefaultApiConfig();
    } catch {
      return getDefaultApiConfig();
    }
  }

  static async saveApiConfig(config) {
    return await db.saveAppConfig("api_config", config);
  }

  static async getRoomApiConfig(roomId) {
    const safeRoomId = String(roomId).replace(/[^0-9]/g, "");
    try {
      const allConfigs = await db.getAppConfig("room_api_configs");
      if (allConfigs && typeof allConfigs === "object" && allConfigs[safeRoomId]) {
        return { config: allConfigs[safeRoomId], isDefault: false };
      }
    } catch (e) {
      console.warn("Error getting room API config from Supabase:", e.message);
    }
    return { config: getDefaultApiConfig(), isDefault: true };
  }

  static async saveRoomApiConfig(roomId, config) {
    const safeRoomId = String(roomId).replace(/[^0-9]/g, "");
    let allConfigs = {};
    try {
      allConfigs = (await db.getAppConfig("room_api_configs")) || {};
    } catch {}
    allConfigs[safeRoomId] = config;
    await db.saveAppConfig("room_api_configs", allConfigs);
    return true;
  }

  static async getThresholds() {
    try {
      const saved = await db.getAppConfig("sensor_thresholds");
      if (saved && typeof saved === "object") {
        return saved;
      }
    } catch (err) {
      console.error("Error reading sensor thresholds from Supabase:", err.message);
    }
    return {
      temperature: 0.5,
      humidity: 2.0,
      pm25: 5.0,
      co2: 50.0,
      smoke: 1.0
    };
  }

  static async saveThresholds(thresholds) {
    await db.saveAppConfig("sensor_thresholds", thresholds);
  }

  static getDefaultApiConfig() {
    return getDefaultApiConfig();
  }
}

module.exports = SensorModel;

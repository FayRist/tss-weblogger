import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes)]
};

/**
 * Application Configuration
 * เก็บการตั้งค่าต่างๆ ของแอปพลิเคชัน
 */

export const APP_CONFIG = {
  // API Configuration
  API: {
    HOST: 'http://localhost:7005',
    BASE_URL: 'http://localhost:7005/api',
    HOST_SERVER: 'http://localhost:7005',
    BASE_URL_SERVER: 'http://43.228.85.167:7001/api',

    URL_SOCKET_LOCAL: 'ws://localhost:7005',
    URL_SOCKET_SERVER: 'ws://43.228.85.167:7001',
    ENDPOINTS: {
      // Config
      GET_CONFIG: '/configWeb/getAllConfig',
      ADD_CONFIG: '/configWeb/addConfig',
      UPDATE_CONFIG: '/configWeb/updateConfig',
      DELETE_CONFIG: '/configWeb/deleteConfig',

      // Event
      GET_EVENT: '/event/getEvent',
      ADD_EVENT: '/event/addEvent',
      UPDATE_EVENT: '/event/updateEvent',
      DELETE_EVENT: '/event/deleteEvent',
      ACTIVE_EVENT: '/event/activeEvent',
      END_EVENT: '/event/endEvent',
      EVENT_DROPDOWN: '/event/dropDownValue',
      EVENT_SEGMENT_DROPDOWN: '/event/dropDownOptionSegment',
      EVENT_SESSION_DROPDOWN: '/event/dropDownOptionSession',

      // Season
      GET_SEASON: '/seasonal/getSeason',
      ADD_SEASON: '/seasonal/addSeason',
      UPDATE_SEASON: '/seasonal/updateSeason',
      DELETE_SEASON: '/seasonal/deleteSeason',

      // Race
      GET_RACE: '/race/getRace',
      ADD_RACE: '/race/addRace',
      END_RACE: '/race/endRace',
      UPDATE_RACE: '/race/updateRace',
      DELETE_RACE: '/race/deleteRace',
      EXPORT_RACE_DATA_LOGGER: '/race/exportDataLoggerInRace',

      // Loggers/Racers
      GET_LOGGERS: '/logger/get-logger',
      GET_SETTING_LOGGERS: '/logger/get-setting-logger',
      ADD_LOGGER: '/logger/add-allnew-logger',
      UPDATE_LOGGER: '/logger/updateLoger',
      DELETE_LOGGER: '/logger/deleteLoger',
      RESET_LOGGER: '/logger/resetLoger',
      LIST_LOGGER_FOREXCEL: '/logger/getListLoger',
      GET_DETAIL_LOGGERS_IN_RACE: '/logger/getDetailLoggerInRace',
      GET_ALL_DATA_HISTORY_LOGGERS_IN_RACE: '/logger/getHistoryLoggerInRace',
      GET_ALL_LOGGERS_DATE: '/logger/getLoggerDate',

      // Users (สำหรับอนาคต)
      GET_USERS: '/users/getUsers',
      ADD_USER: '/users/addUser',
      UPDATE_USER: '/users/updateUser',
      DELETE_USER: '/users/deleteUser',

      // Authentication (สำหรับอนาคต)
      LOGIN: '/auth/login',
      LOGOUT: '/auth/logout',
      REFRESH_TOKEN: '/auth/refresh',
      // WebSocket

      WEB_SOCKET: '/ws/logger',
      WEB_SOCKET_BY_CARNUMBER: '/ws/logger-by-carnumber',
      WEB_LOGGER_STATUS: '/ws/logger-status',
      WEB_SOCKET_LOGGER_REAL_TIME: '/ws/logger-realtime',
      WEB_SOCKET_REAL_TIME: '/ws/realtime'
    }
  },

  // Application Settings
  APP: {
    NAME: 'TSS Race Management',
    VERSION: '1.0.0',
    DEFAULT_PAGE_SIZE: 10,
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    SUPPORTED_FILE_TYPES: ['.txt', '.csv']
  },

  // UI Settings
  UI: {
    THEME: {
      PRIMARY_COLOR: '#007bff',
      SUCCESS_COLOR: '#28a745',
      WARNING_COLOR: '#ffc107',
      DANGER_COLOR: '#dc3545'
    },
    ANIMATION: {
      DURATION: 300,
      EASING: 'ease-in-out'
    }
  },

  // Map Configuration
  MAP: {
    // MapTiler API Key - Set via environment variable MAP_API_KEY or use default
    // For production, configure via build-time replacement or environment service
    API_KEY: 'uA8Sp5KU2WAOHVMJEYqJ', // Default key from .env

    // Circuit centers - can be overridden via environment variables
    // Format: MAP_CENTER_{CIRCUIT}_LAT and MAP_CENTER_{CIRCUIT}_LON
    CIRCUITS: {
      // Bira Circuit (bic)
      bic: {
        LAT: 12.921067,
        LNG: 101.008893,
        MAP_ZOOM: 15.3,
        ROTATION: 0
      },
      // Chang International Circuit (bric)
      bric: {
        LAT: 14.963283,
        LNG: 103.084855,
        MAP_ZOOM: 14.8,
        ROTATION: -78
      },

      // Bangsaen Street Circuit (bsc)
      bsc: {
        LAT: 13.304227,
        LNG: 100.903282,
        MAP_ZOOM: 14.7,
        ROTATION: -60
      }
    }
  }
};

/**
 * Get map center for a specific circuit
 * @param circuitName Circuit name (bic, bric, bsc)
 * @returns Center coordinates or null if circuit not found
 */
export function getMapCenterForCircuit(circuitName: string | null | undefined): { lat: number; lng: number, zoom: number, rotation: number} | null {
  if (!circuitName) return null;

  const circuit = APP_CONFIG.MAP.CIRCUITS[circuitName.toLowerCase() as keyof typeof APP_CONFIG.MAP.CIRCUITS];
  if (!circuit) return null;

  return {
    lat: circuit.LAT,
    lng: circuit.LNG,
    zoom: circuit.MAP_ZOOM,
    rotation: circuit.ROTATION
  };
}

/**
 * Helper function สำหรับสร้าง API URL
 */
/** ปกติ endpoint ควรขึ้นต้นด้วย "/" */
function normalizeEndpoint(endpoint: string): string {
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}


/** เลือก Base API URL ตาม host ที่กำลังรันอยู่ */
function resolveBaseApiUrl(): string {
  // กันไว้กรณี SSR/ไม่มี window
  if (typeof window === 'undefined') return APP_CONFIG.API.BASE_URL_SERVER;

  const { hostname } = window.location;

  // local
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return APP_CONFIG.API.BASE_URL;
  }

  // server IP ของคุณ
  if (hostname === '43.228.85.167') {
    return APP_CONFIG.API.BASE_URL_SERVER;
  }

  // ดีฟอลต์: ถือว่าเป็น server
  return APP_CONFIG.API.BASE_URL_SERVER;
}

/** ถ้ามี WebSocket และต้องสลับตาม host ด้วย */
function resolveSocketBaseUrl(): string {
  if (typeof window === 'undefined') return APP_CONFIG.API.URL_SOCKET_LOCAL;

  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return APP_CONFIG.API.URL_SOCKET_LOCAL;
  }
  return APP_CONFIG.API.URL_SOCKET_SERVER;
}

/** ====== ฟังก์ชันที่คุณเรียกใช้เดิม ====== */
export function getApiUrl(endpoint: string): string {
  return `${resolveBaseApiUrl()}${normalizeEndpoint(endpoint)}`;
}

export function getApiWebSocket(endpoint: string): string {
  return `${resolveSocketBaseUrl()}${normalizeEndpoint(endpoint)}`;
}

/** Helper: สร้าง URL พร้อม query params โดยเลือก base แบบอัตโนมัติ */
export function getApiUrlWithParams(
  endpoint: string,
  params: Record<string, string | number>
): string {
  const url = new URL(`${resolveBaseApiUrl()}${normalizeEndpoint(endpoint)}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));
  return url.toString();
}

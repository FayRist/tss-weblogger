// src/app/service/logger-data.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';

// ====== ปรับตามโปรเจกต์คุณ ======
const API_BASE = ''; // เช่น environment.apiBase
const GET_LIST_LOGGER_URL = API_BASE + '/api/get-list-logger'; // path ของ GetListLoger

// ====== Types จาก Go ======
export interface ApiListLoggerRequest {
  key: string;        // e.g. "client_101" (ฝั่ง Go จะ trim prefix เองใน case 4/7/68)
  date: string;       // "4/7/68" | "5/7/68" | "6/7/68"
  page?: number;      // optional
  page_size?: number; // optional
}

export interface ApiListLoggerRow {
  id: string;
  lat: string;        // Go ส่งมาเป็น string
  lon: string;        // Go ส่งมาเป็น string (long → lon)
  data: string;       // heading หรือข้อมูลอื่น
  timestamp: string;  // e.g. "2025-01-01 10:20:30.123" หรือ ISO string จาก redis
}

export interface ApiListLoggerResponse {
  success: boolean;
  data: ApiListLoggerRow[];
  count?: number;
  total_count?: number;  // เฉพาะเคส 4/7/68
  total_pages?: number;  // เฉพาะเคส 4/7/68
  message?: string;
}

// ====== Types ที่แปลงแล้ว (เผื่อใช้งานต่อ) ======
export interface LoggerRow {
  id: string;
  lat: number;
  lon: number;
  heading: string;
  timestampText: string;
  // afr: string;
  ts: number;         // ms epoch
}

@Injectable({ providedIn: 'root' })
export class LoggerDataService {
  constructor(private http: HttpClient) {}

  /**
   * เรียก backend GetListLoger แบบ raw (ได้ type ตรงกับ Go)
   */
  getListLoggerRaw$(req: ApiListLoggerRequest): Observable<ApiListLoggerResponse> {
    const body = {
      key: req.key,
      date: req.date,
      page: req.page ?? 1,
      page_size: req.page_size ?? 1000,
    };
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const eventUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.LIST_LOGGER_FOREXCEL);
    return this.http.post<ApiListLoggerResponse>(eventUrl, body, { headers });
  }

  /**
   * เรียกแล้ว map เป็นตัวเลข/Date พร้อมใช้งานกับกราฟ/แผนที่
   */
  getListLogger$(req: ApiListLoggerRequest): Observable<LoggerRow[]> {
    return this.getListLoggerRaw$(req).pipe(
      map((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        return rows.map<LoggerRow>((r) => {
          const lat = Number(r.lat);
          const lon = Number(r.lon);
          const ts  = Date.parse(r.timestamp);  // ถ้าเป็นรูปแบบ "YYYY-MM-DD HH:mm:ss.SSS" แล้ว parse ไม่ได้ ให้แปลงเป็น ISO ก่อน

          return {
            id: r.id,
            lat: Number.isFinite(lat) ? lat : NaN,
            lon: Number.isFinite(lon) ? lon : NaN,
            heading: r.data ?? '',
            timestampText: r.timestamp ?? '',
            ts: Number.isFinite(ts) ? ts : NaN,
          };
        });
      })
    );
  }
}

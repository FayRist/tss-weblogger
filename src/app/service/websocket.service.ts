import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CarLogger } from '../../../public/models/car-logger.model';
import { APP_CONFIG } from '../app.config';

export interface WebSocketMessage {
  type: string;
  data: unknown;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 1 second
  private isConnecting = false;
  private currentLoggerId: string | null = null; // เก็บ loggerId ปัจจุบัน
  private manualDisconnect = false;
  private lastUrl: string | null = null;

  private messageSubject = new BehaviorSubject<WebSocketMessage | null>(null);
  private connectionStatusSubject = new BehaviorSubject<'connected' | 'disconnected' | 'connecting'>('disconnected');
  private loggerDataSubject = new BehaviorSubject<CarLogger[]>([]);

  public message$ = this.messageSubject.asObservable();
  public connectionStatus$ = this.connectionStatusSubject.asObservable();
  public loggerData$ = this.loggerDataSubject.asObservable();

  // ===== New channels =====
  private wsRealtime: WebSocket | null = null;
  private wsHistory: WebSocket | null = null;
  private wsStatus: WebSocket | null = null;

  private realtimePointSubject = new BehaviorSubject<any | null>(null);
  private historyPointSubject = new BehaviorSubject<any | null>(null);
  private statusListSubject = new BehaviorSubject<any[] | null>(null);

  public realtimePoint$ = this.realtimePointSubject.asObservable();
  public historyPoint$ = this.historyPointSubject.asObservable();
  public statusList$ = this.statusListSubject.asObservable();

  constructor() {}

  /**
   * เชื่อมต่อ WebSocket
   */
  connect(url: string = `${APP_CONFIG.API.URL_SOCKET_SERVER}${APP_CONFIG.API.ENDPOINTS.WEB_SOCKET}`, loggerId?: string): void {
    this.manualDisconnect = false; // reset flag ทุกครั้งที่เริ่ม connect ใหม่
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket: Already connecting or connected');
      return;
    }

    // เก็บ loggerId สำหรับการ reconnect
    if (loggerId) {
      this.currentLoggerId = loggerId;
    }
    this.lastUrl = url;

    this.isConnecting = true;
    this.connectionStatusSubject.next('connecting');

    try {
      console.log('WebSocket: Connecting to', url);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket: Connected successfully');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.connectionStatusSubject.next('connected');

        // ส่ง loggerId ไปยัง Backend หลังจากเชื่อมต่อสำเร็จ
        // ถ้า URL มี query logger= อยู่แล้ว ให้ข้ามการส่ง subscribe เพื่อหลีกเลี่ยงการปิดจากฝั่ง server
        if (this.currentLoggerId && !(this.lastUrl || '').includes('logger=')) {
          this.sendLoggerId(this.currentLoggerId);
        }
      };

      this.ws.onmessage = (event) => {
        // console.log('WebSocket: Received message:', event.data);
        this.handleMessage(event.data, this.currentLoggerId);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket: Connection closed', event.code, event.reason);
        this.isConnecting = false;
        this.connectionStatusSubject.next('disconnected');
        this.handleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket: Error occurred:', error);
        this.isConnecting = false;
        this.connectionStatusSubject.next('disconnected');
      };

    } catch (error) {
      console.error('WebSocket: Failed to create connection:', error);
      this.isConnecting = false;
      this.connectionStatusSubject.next('disconnected');
    }
  }

  // ===== Realtime channel (JSON payload: { lat, lon, data, timestamp }) =====
  connectRealtime(loggerId: string): void {
    try {
      if (this.wsRealtime && this.wsRealtime.readyState === WebSocket.OPEN) return;
      const base = typeof location !== 'undefined' ? `ws://${location.host}` : APP_CONFIG.API.URL_SOCKET_SERVER.replace(/^http/, 'ws');
      const url = `${base}/ws/logger-realtime?logger=${encodeURIComponent(loggerId)}`;
      this.wsRealtime = new WebSocket(url);
      this.wsRealtime.onopen = () => console.log('[WS realtime] open:', url);
      this.wsRealtime.onmessage = (ev) => {
        console.log('[WS realtime] message len:', typeof ev.data === 'string' ? ev.data.length : -1);
        this.handleRealtimeMessage(ev.data);
      };
      this.wsRealtime.onclose = (e) => { console.log('[WS realtime] close:', e.code, e.reason); this.wsRealtime = null; };
      this.wsRealtime.onerror = (err) => { console.warn('[WS realtime] error:', err); };
    } catch {}
  }

  disconnectRealtime(): void {
    try { this.wsRealtime?.close(); } finally { this.wsRealtime = null; }
  }

  private handleRealtimeMessage(data: string): void {
    try {
      let payload: any = JSON.parse(data);
      if (payload && payload.type && typeof payload.data === 'string') {
        try { payload = JSON.parse(payload.data); } catch {}
      }
      if (!payload) return;
      const lat = Number(payload.lat ?? payload.latitude);
      const lon = Number(payload.lon ?? payload.long ?? payload.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const afrValue = payload.afr != null ? Number(payload.afr) : (payload.data != null ? Number(payload.data) : (payload.afrValue != null ? Number(payload.afrValue) : undefined));
      const velocity = payload.velocity != null ? Number(payload.velocity) : (payload.speed != null ? Number(payload.speed) : undefined);
      const heading  = payload.heading != null ? Number(payload.heading) : undefined;
      const timeVal  = payload.timestamp ?? payload.time ?? Date.now();
      const ts       = typeof timeVal === 'number' ? timeVal : (Number.isFinite(Number(timeVal)) ? Number(timeVal) : Date.parse(String(timeVal)) || Date.now());
      this.realtimePointSubject.next({ ts, lat, lon, velocity, heading, afrValue, time: timeVal });
    } catch {}
  }

  // ===== History channel (JSON payload per message; query: startIndex) =====
  connectHistory(loggerId: string, startIndex: number = 0): void {
    try {
      if (this.wsHistory && this.wsHistory.readyState === WebSocket.OPEN) return;
      const base = typeof location !== 'undefined' ? `ws://${location.host}` : APP_CONFIG.API.URL_SOCKET_SERVER.replace(/^http/, 'ws');
      const url = `${base}/ws/logger?logger=${encodeURIComponent(loggerId)}&startIndex=${Number.isFinite(startIndex) ? startIndex : 0}`;
      this.wsHistory = new WebSocket(url);
      this.wsHistory.onopen = () => console.log('[WS history] open:', url);
      this.wsHistory.onmessage = (ev) => {
        console.log('[WS history] message len:', typeof ev.data === 'string' ? ev.data.length : -1);
        this.handleHistoryMessage(ev.data);
      };
      this.wsHistory.onclose = (e) => { console.log('[WS history] close:', e.code, e.reason); this.wsHistory = null; };
      this.wsHistory.onerror = (err) => { console.warn('[WS history] error:', err); };
    } catch {}
  }

  disconnectHistory(): void {
    try { this.wsHistory?.close(); } finally { this.wsHistory = null; }
  }

  private handleHistoryMessage(data: string): void {
    try {
      let payload: any = JSON.parse(data);
      const lat = Number(payload.lat ?? payload.latitude);
      const lon = Number(payload.lon ?? payload.long ?? payload.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const afrValue = payload.afr != null ? Number(payload.afr) : (payload.data != null ? Number(payload.data) : (payload.afrValue != null ? Number(payload.afrValue) : undefined));
      const velocity = payload.velocity != null ? Number(payload.velocity) : (payload.speed != null ? Number(payload.speed) : undefined);
      const heading  = payload.heading != null ? Number(payload.heading) : undefined;
      const timeVal  = payload.timestamp ?? payload.time ?? Date.now();
      const ts       = typeof timeVal === 'number' ? timeVal : (Number.isFinite(Number(timeVal)) ? Number(timeVal) : Date.parse(String(timeVal)) || Date.now());
      this.historyPointSubject.next({ ts, lat, lon, velocity, heading, afrValue, time: timeVal });
    } catch {}
  }

  // ===== Status channel =====
  connectStatus(): void {
    try {
      if (this.wsStatus && this.wsStatus.readyState === WebSocket.OPEN) return;
      const base = typeof location !== 'undefined' ? `ws://${location.host}` : APP_CONFIG.API.URL_SOCKET_SERVER.replace(/^http/, 'ws');
      const url = `${base}/ws/logger-status`;
      this.wsStatus = new WebSocket(url);
      this.wsStatus.onopen = () => console.log('[WS status] open:', url);
      this.wsStatus.onmessage = (ev) => {
        console.log('[WS status] message len:', typeof ev.data === 'string' ? ev.data.length : -1);
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.type === 'logger_status') {
            this.statusListSubject.next(Array.isArray(msg.data) ? msg.data : []);
          }
        } catch {}
      };
      this.wsStatus.onclose = (e) => { console.log('[WS status] close:', e.code, e.reason); this.wsStatus = null; };
      this.wsStatus.onerror = (err) => { console.warn('[WS status] error:', err); };
    } catch {}
  }

  disconnectStatus(): void {
    try { this.wsStatus?.close(); } finally { this.wsStatus = null; }
  }

  /**
   * จัดการข้อความที่ได้รับ
   */
  private handleMessage(data: string, loggerId?: any): void {
    try {
      // type จะเป็น sensor_data:loggerId ถ้ามี loggerId, ถ้าไม่มีเป็น unknown
      const type = loggerId ? 'sensor_data:' + loggerId : 'unknown';
      const message: WebSocketMessage = {
        type: type,
        data: data,
        timestamp: Date.now()
      };

      // ส่งข้อความไปยัง subscribers
      this.messageSubject.next(message);

      // ถ้าเป็นข้อมูล logger ให้แปลงและส่งไปยัง loggerDataSubject
      if (this.isLoggerData(data)) {
        const loggerData = this.parseLoggerData(data);
        if (loggerData) {
          const currentData = this.loggerDataSubject.value;
          const newData = [...currentData, loggerData];
          this.loggerDataSubject.next(newData);
        }
      }

    } catch (error) {
      console.error('WebSocket: Error parsing message:', error);
    }
  }

  /**
   * ตรวจสอบว่าเป็นข้อมูล logger หรือไม่
   */
  private isLoggerData(data: string): boolean {
    // ตรวจสอบรูปแบบข้อมูล logger
    const trimmedData = data.trim();

    // ตรวจสอบว่ามีข้อมูลเพียงพอและไม่ใช่ข้อความว่าง
    if (!trimmedData || trimmedData.length < 10) {
      return false;
    }

    // ตรวจสอบว่ามีตัวเลขและข้อมูล GPS
    const values = trimmedData.split(/\s+/);

    // ตรวจสอบว่ามีข้อมูล GPS coordinates
    const hasLatLong = values.length >= 4 &&
                      !isNaN(parseFloat(values[2])) &&
                      !isNaN(parseFloat(values[3]));

    // ตรวจสอบว่ามีข้อมูล velocity
    const hasVelocity = values.length >= 5 && !isNaN(parseFloat(values[4]));

    return hasLatLong && hasVelocity;
  }

  /**
   * แปลงข้อมูล logger
   */
  private parseLoggerData(data: string): CarLogger | null {
    try {
      // แยกข้อมูลตามช่องว่างหรือ tab
      const values = data.trim().split(/\s+/);

      if (values.length < 10) {
        return null;
      }

      // สร้าง CarLogger object ตามโครงสร้างจริง
      const logger: CarLogger = {
        sats: values[0] || '',
        time: values[1] || '',
        lat: values[2] || '',
        long: values[3] || '',
        velocity: parseFloat(values[4]) || 0,
        heading: values[5] || '',
        height: values[6] || '',
        FixType: values[7] || '',
        accelX: values[8] || '',
        accelY: values[9] || '',
        accelZ: values[10] || '',
        accelSqrt: values[11] || '',
        gyroX: values[12] || '',
        gyroY: values[13] || '',
        gyroZ: values[14] || '',
        magX: values[15] || '',
        magY: values[16] || '',
        magZ: values[17] || '',
        mDirection: values[18] || '',
        Time_ms: values[19] || '',
        averageHeight: parseFloat(values[20]) || 0
      };

      return logger;
    } catch (error) {
      console.error('WebSocket: Error parsing logger data:', error);
      return null;
    }
  }

  /**
   * ส่งข้อความไปยัง WebSocket
   */
  sendMessage(message: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      console.log('WebSocket: Sent message:', message);
    } else {
      console.warn('WebSocket: Cannot send message - connection not open');
    }
  }

  /**
   * ส่ง loggerId ไปยัง Backend
   */
  sendLoggerId(loggerId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'subscribe',
        loggerId: loggerId,
        timestamp: Date.now()
      });

      this.ws.send(message);
      console.log('WebSocket: Sent loggerId subscription:', loggerId);
    } else {
      console.warn('WebSocket: Cannot send loggerId - connection not open');
    }
  }

  /**
   * เปลี่ยน loggerId subscription
   */
  changeLoggerId(newLoggerId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // ส่งคำสั่งยกเลิก subscription เดิม
      const unsubscribeMessage = JSON.stringify({
        type: 'unsubscribe',
        loggerId: this.currentLoggerId,
        timestamp: Date.now()
      });

      this.ws.send(unsubscribeMessage);
      console.log('WebSocket: Unsubscribed from loggerId:', this.currentLoggerId);

      // ส่ง subscription ใหม่
      this.currentLoggerId = newLoggerId;
      this.sendLoggerId(newLoggerId);
    } else {
      console.warn('WebSocket: Cannot change loggerId - connection not open');
    }
  }

  /**
   * จัดการการเชื่อมต่อใหม่
   */
  private handleReconnect(): void {
    if (this.manualDisconnect) {
      // ถ้าเป็นการ disconnect แบบ manual จะไม่ reconnect
      return;
    }
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      // console.log(`WebSocket: Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        // ใช้ URL และ loggerId เดิมในการ reconnect (คง query params เดิม)
        const url = this.lastUrl ?? `${APP_CONFIG.API.URL_SOCKET_LOCAL}${APP_CONFIG.API.ENDPOINTS.WEB_SOCKET}`;
        this.connect(url, this.currentLoggerId || undefined);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('WebSocket: Max reconnection attempts reached');
    }
  }

  /**
   * ปิดการเชื่อมต่อ
   */
  disconnect(): void {
    this.manualDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // close new channels
    try { this.wsRealtime?.close(); } catch {}
    try { this.wsHistory?.close(); } catch {}
    try { this.wsStatus?.close(); } catch {}
    this.wsRealtime = null;
    this.wsHistory = null;
    this.wsStatus = null;

    this.isConnecting = false;
    this.currentLoggerId = null; // ล้าง loggerId เมื่อปิดการเชื่อมต่อ
    this.connectionStatusSubject.next('disconnected');
    console.log('WebSocket: Disconnected');
  }

  /**
   * รับสถานะการเชื่อมต่อปัจจุบัน
   */
  getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    return this.connectionStatusSubject.value;
  }

  /**
   * รับข้อมูล logger ปัจจุบัน
   */
  getCurrentLoggerData(): CarLogger[] {
    return this.loggerDataSubject.value;
  }

  /**
   * ล้างข้อมูล logger
   */
  clearLoggerData(): void {
    this.loggerDataSubject.next([]);
  }
}

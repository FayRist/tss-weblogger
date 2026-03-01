import { optionEventModel, optionModel } from "./season-model";

export interface ApiUsersResponse {
  count: number;
  data: ApiUserData[];
  success: boolean;
}
export interface ApiUserData {
  email : number;
  password_hash : string;
  username : string;
  role_id : string;
}


// API Response interface for loggers
export interface ApiLoggerResponse {
  count: number;
  data: ApiLoggerData[];
  success: boolean;
}

export interface ApiLoggerData {
  id: number;
  logger_id: string;
  car_number: string;
  first_name: string;
  last_name: string;
  class_type: string;
  team_name: string;
}

export interface ApiEventResponse {
  count: number;
  data: ApiEventData[];
  success: boolean;
}

export interface ApiEventData {
  eventid: number;
  seasonid: number;
  eventname: string;
  circuitname: string;
  eventstart: Date;
  eventend: Date;
  active: number;
}
export interface ApiDropDownResponse {
  count: number;
  data: optionModel[];
  success: boolean;
}

export interface ApiDropDownoptionEventResponse {
  count: number;
  data: optionEventModel[];
  success: boolean;
}

export interface ApiSeasonResponse {
  count: number;
  data: ApiSeasonData[];
  success: boolean;
}

export interface ApiSeasonData {
  season_id: number;
  season_name: string;
  created_at: Date;
}

export interface ApiRaceResponse {
  count: number;
  data: ApiRaceData[];
  success: boolean;
}

export interface ApiRaceData {
  id_list: number;
  event_id: number;
  season_id: number;
  category_name: string;
  class_value: string;
  segment_value: string;
  session_value: string;
  session_start: Date;
  session_end: Date;
  active: number;
}


// payload ที่ส่งไป (ตามที่พี่มี)
export interface LoggerDetailPayload {
  race_id: number;
  segment_type: string;
  class_type: string;
  logger_id?: number;
}

// สิ่งที่ BE ส่งกลับมา
export interface LoggerRaceDetailRes {
  LoggerID: number;
  CarNumber: string;
  FirstName: string;
  LastName: string;
  ClassType: string;
  SegmentValue: string;
  SeasonID: number;
  CategoryName: string;
  SessionValue: string;
  Circuitname: string;

  // ฟิลด์ใหม่จาก countdetect_afr (อาจเป็น null)
  countDetect?: number | null;
  afr?: number | null;
  afrAverage?: number | null;
  status?: string | null;
  onlineTime: string;
  disconnectTime: string;
}

export interface ApiLoggerRaceResponse {
  success: boolean;
  data: LoggerRaceDetailRes;  // <- อ็อบเจ็กต์เดียว
}

export interface LoggerRaceDetailModel {
  loggerId: number;
  carNumber: string;
  firstName: string;
  lastName: string;
  classType: string;
  segmentValue: string;
  seasonId: number;
  categoryName: string;
  sessionValue: string;
  circuitName: string;

  // ฟิลด์ใหม่ (ทำให้เป็น number/string เสมอเพื่อตัดปัญหา strictNullChecks)
  countDetect: number;      // default 0
  afr: number;              // default 0
  afrAverage: number;       // default 0
  status: string;           // default ''
  onlineTime: string;
  disconnectTime: string;
}


export interface ExportDataLoggerInRaceModel {
  velocity: number;      // float64
  height: number;
  heading: number;
  lat: number;
  long: number;
  sats: number;          // int32
  fixtype: number;
  accelx: number;        // float64
  accely: number;
  accelz: number;
  accelsqrt: number;
  gyrox: number;         // float64
  gyroy: number;
  gyroz: number;
  magx: number;          // float64
  magy: number;
  magz: number;
  mdirection: number;
  time_ms: number;       // int64 (TS number ใช้ได้ แต่ถ้าใหญ่มากอาจพิจารณา bigint)
  car_id: number;        // int32
  afr: number;           // float64
  rpm: number;           // float64
}



export interface ExportDataLoggerInRaceRes {
  velocity: number;      // float64
  height: number;
  heading: number;

  lat: number;
  long: number;

  sats: number;          // int32
  fixtype: number;

  accelx: number;        // float64
  accely: number;
  accelz: number;
  accelsqrt: number;

  gyrox: number;         // float64
  gyroy: number;
  gyroz: number;

  magx: number;          // float64
  magy: number;
  magz: number;
  mdirection: number;

  time_ms: number;       // int64 (TS number ใช้ได้ แต่ถ้าใหญ่มากอาจพิจารณา bigint)
  car_id: number;        // int32

  afr: number;           // float64
  rpm: number;           // float64
}

export interface ApiExportDataLoggerInRaceResponse {
  count: number;
  data: ExportDataLoggerInRaceRes[];
  success: boolean;
}

// api-shapes.ts
export interface ApiLoggerAFR {
  id: number;             // lr.id
  id_list: string;        // r.id_list
  logger_id: number;      // lr.logger_id
  car_number: string;     // lr.car_number
  first_name: string;
  last_name: string;
  created_date: string;   // ISO string จาก DB
  class_type: string;

  // จาก countdetect_afr (อาจเป็น null)
  count_detect?: number | null;
  current_count_detect?: number | null;
  afr?: number | null;
  afr_average?: number | null;
  status?: string | null;
  online_time: string;
  disconnect_time: string;
}

export interface ApiLoggerAFRResponse {
  success: boolean;
  race_id?: number;
  count: number;
  data: ApiLoggerAFR[];
}

// model ที่หน้าบ้านใช้งาน
export interface LoggerItem {
  id: number;
  idList: string;
  loggerId: number;
  carNumber: string;
  firstName: string;
  lastName: string;
  createdDate: Date;
  classType: string;

  // metrics จาก AFR (optional)
  countDetect?: number | null;
  currentCountDetect: number;  // จำนวนนับปัจจุบัน (แสดงในคอลัมน์ Count)
  afr?: number | null;
  afrAverage?: number | null;
  status?: string | null;

  // ของเดิมที่คุณมี
  numberLimit: number;
  warningDetector: boolean;
  loggerStatus: 'online' | 'offline';
  onlineTime: Date| null;
  disconnectTime: Date| null;
}


export interface ApiConfigResponse {
  count: number;
  data: ApiConfigData[];
  success: boolean;
}

export interface ApiConfigData {
  id: number;
  form_code: string;
  config_name: string;
  value?: string;
  description?: string;
  update_by?: string;
  update_date?: string | Date;
}

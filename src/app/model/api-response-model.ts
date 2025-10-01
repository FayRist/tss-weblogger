import { optionModel } from "./season-model";

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
}

export interface ApiEventResponse {
  count: number;
  data: ApiEventData[];
  success: boolean;
}

export interface ApiEventData {
  event_id: number;
  season_id: number;
  event_name: string;
  circuit_name: string;
  event_start: Date;
  event_end: Date;
}
export interface ApiDropDownResponse {
  count: number;
  data: optionModel[];
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

  // ฟิลด์ใหม่จาก countdetect_afr (อาจเป็น null)
  countDetect?: number | null;
  afr?: number | null;
  afrAverage?: number | null;
  status?: string | null;
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

  // ฟิลด์ใหม่ (ทำให้เป็น number/string เสมอเพื่อตัดปัญหา strictNullChecks)
  countDetect: number;      // default 0
  afr: number;              // default 0
  afrAverage: number;       // default 0
  status: string;           // default ''
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
  afr?: number | null;
  afr_average?: number | null;
  status?: string | null;
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
  countDetect: number;   
  afr?: number | null;
  afrAverage?: number | null;
  status?: string | null;

  // ของเดิมที่คุณมี
  numberLimit: number;
  warningDetector: boolean;
  loggerStatus: 'online' | 'offline';
}

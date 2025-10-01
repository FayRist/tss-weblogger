// ====== รูปแบบที่ backend ส่งกลับ (ดูจาก Go struct: ID, LoggerID, ... ) ======
export interface ApiLoggerRow {
  ID: number;
  LoggerID: string;
  CarNumber: string;
  FirstName: string;
  LastName: string;
  CreatedDate: string;    // ISO string จาก Go
  ClassType: string;
  TeamName: string;

  EventID: number;
  EventName: string;
  RaceID: string;
  SessionValue: string;
  IDList: number;
  SegmentValue: string;
  ClassValue: string;
}

export interface ApiGetLoggerDateResponse {
  success: boolean;
  data: ApiLoggerRow[];
  count: number;
  limit: number;
  offset: number;
}

// ====== รูปแบบที่ UI ใช้ ======
export interface LoggerByDateItem {
  id: number;
  loggerId: string;
  carNumber: string;
  firstName: string;
  lastName: string;
  createdDate: Date;
  classType: string;
  teamName: string;

  eventId: number;
  eventName: string;
  sessionValue: string;
  idList: number;
  segmentValue: string;
  classValue: string;
}

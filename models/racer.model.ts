export interface Racer {
  id?: number | null;      // ID ของ racer (null สำหรับการเพิ่มใหม่)
  matchId: string;        // Logger ID (รหัสอุปกรณ์จับข้อมูล)
  loggerId: string;        // Logger ID (รหัสอุปกรณ์จับข้อมูล)
  carNumber: string;       // หมายเลขรถ
  carType: string;       // หมายเลขรถ
  racerName: string;       // ชื่อนักขับ
  onlineStatus: boolean;   // true = ออนไลน์, false = ออฟไลน์
  warningCode: number;     // รหัสสถานะเตือน (0-6)
}


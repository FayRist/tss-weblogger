# คำอธิบายการทำงานของ REALTIME_RETENTION_MS และการลบข้อมูลอัตโนมัติ

## สรุป

ระบบเดิมมีการลบข้อมูลอัตโนมัติ 3 จุด เพื่อป้องกัน memory leak และจำกัดข้อมูลให้อยู่ใน "rolling window" แต่ตอนนี้ได้ถูก **comment ออกทั้งหมด** เพื่อเก็บข้อมูลทั้งหมดไว้

---

## 1. Frontend: telemetryBuffer Time-based Trim

**ตำแหน่ง:** `logger.component.ts` → `addTelemetryPoint()`

**การทำงานเดิม:**
```typescript
// คำนวณ cutoff time = เวลาปัจจุบัน - REALTIME_RETENTION_MS (1 hour)
const cutoff = Date.now() - this.MAX_BUFFER_TIME_MS;
while (this.telemetryBuffer.length > 0 && this.telemetryBuffer[0].ts < cutoff) {
  this.telemetryBuffer.shift(); // ลบ point เก่าที่สุดออก
}
```

**ผลกระทบ:**
- ข้อมูลที่เก่ากว่า 1 ชั่วโมงจะถูกลบออกอัตโนมัติ
- ใช้ `shift()` ซึ่งเป็น O(n) แต่ทำเฉพาะเมื่อมี point ใหม่เข้ามา
- ทำให้ `telemetryBuffer` เป็น "rolling window" ที่เก็บข้อมูลแค่ 1 ชั่วโมงล่าสุด

**ตัวอย่าง:**
- เวลาปัจจุบัน: 14:00
- REALTIME_RETENTION_MS = 1 hour
- Cutoff = 13:00
- → ลบข้อมูลที่ timestamp < 13:00 ออก

**สถานะ:** ✅ **COMMENTED OUT** - ข้อมูลจะไม่ถูกลบตามเวลา

---

## 2. Frontend: telemetryBuffer Size-based Trim

**ตำแหน่ง:** `logger.component.ts` → `addTelemetryPoint()`

**การทำงานเดิม:**
```typescript
// ถ้า buffer เกิน MAX_BUFFER_SIZE (~259,200 points) ให้ลบ point เก่าออก
if (this.telemetryBuffer.length > this.MAX_BUFFER_SIZE) {
  this.telemetryBuffer.shift();
}
```

**ผลกระทบ:**
- MAX_BUFFER_SIZE = 60Hz * 3600s * 1.2 = ~259,200 points
- ถ้ามีข้อมูลมากกว่า 259,200 points จะลบ point เก่าที่สุดออกทีละตัว
- เป็น safety limit เพื่อป้องกัน memory overflow

**สถานะ:** ✅ **COMMENTED OUT** - ข้อมูลจะไม่ถูกลบตามขนาด

---

## 3. Frontend: deck.gl Ring Buffer Time-based Trim

**ตำแหน่ง:** `logger.component.ts` → `trimOldPoints()` และ `deckIngestPoint()`

**การทำงานเดิม:**
```typescript
// ลบ point ที่เก่ากว่า 30 นาที (WINDOW_MS) ออกจาก ring buffer
const cutoff = currentTs - this.WINDOW_MS; // 30 minutes
while (this.ringBufferCount > 0 && this.ringBufferTail !== this.ringBufferHead) {
  const tailTs = this.pointTimestamps[this.ringBufferTail];
  if (tailTs >= cutoff) break;
  
  // Advance tail pointer (O(1) operation)
  this.ringBufferTail = (this.ringBufferTail + 1) % this.MAX_POINTS;
  this.ringBufferCount--;
}
```

**ผลกระทบ:**
- ข้อมูลที่เก่ากว่า 30 นาทีจะถูกลบออกจาก deck.gl ring buffer
- ใช้ ring buffer → O(1) operation (เร็วกว่า array shift)
- ทำให้ deck.gl แสดงเฉพาะข้อมูล 30 นาทีล่าสุด (rolling window)

**ตัวอย่าง:**
- เวลาปัจจุบัน: 14:00
- WINDOW_MS = 30 minutes
- Cutoff = 13:30
- → ลบข้อมูลที่ timestamp < 13:30 ออก

**สถานะ:** ✅ **COMMENTED OUT** - ข้อมูลจะไม่ถูกลบตามเวลา

---

## 4. Backend: Redis List Time-based Trim

**ตำแหน่ง:** `server.go` → `pushToRedisAndBroadcast()`

**การทำงานเดิม:**
```go
// คำนวณจำนวน records สูงสุดตาม retention time
estimatedMaxRecords := int64(20 * 60 * redisHistoryRetentionMinutes * 2)
// Default: 20Hz * 60s * 30min * 2 = 72,000 records

// ใช้ LTrim เพื่อลบข้อมูลเก่าที่เกิน estimatedMaxRecords
_ = services.Rdb.LTrim(ctx, storageKey, 0, estimatedMaxRecords-1).Err()
```

**ผลกระทบ:**
- Redis จะเก็บข้อมูลแค่ N records ล่าสุด (default: 72,000 records)
- ข้อมูลเก่าที่เกิน N records จะถูกลบออกอัตโนมัติ
- LTrim 0, N-1 = เก็บแค่ N records ล่าสุด (index 0 = newest)

**ตัวอย่าง:**
- redisHistoryRetentionMinutes = 30 (default)
- Hz = 20 (estimated)
- estimatedMaxRecords = 20 * 60 * 30 * 2 = 72,000 records
- → เก็บข้อมูล 72,000 records ล่าสุด
- → ข้อมูลที่เก่ากว่า 30 นาทีจะถูกลบออก

**สถานะ:** ✅ **COMMENTED OUT** - ข้อมูลจะไม่ถูกลบใน Redis

---

## สรุปการเปลี่ยนแปลง

### ก่อนแก้ไข (ข้อมูลจะหาย):
1. ✅ Frontend: ลบข้อมูลเก่ากว่า 1 ชั่วโมง (telemetryBuffer)
2. ✅ Frontend: ลบข้อมูลเมื่อเกิน 259,200 points (telemetryBuffer)
3. ✅ Frontend: ลบข้อมูลเก่ากว่า 30 นาที (deck.gl ring buffer)
4. ✅ Backend: ลบข้อมูลเก่าใน Redis (LTrim)

### หลังแก้ไข (ข้อมูลไม่หาย):
- ✅ **ทุกส่วนถูก comment ออก** → ข้อมูลจะไม่ถูกลบอัตโนมัติ
- ✅ ข้อมูลจะสะสมต่อเนื่องตั้งแต่เริ่มต้น session
- ✅ ใช้ memory มากขึ้นตามจำนวน point ที่สะสม

---

## ⚠️ คำเตือน

### Memory Usage:
- **Frontend:** `telemetryBuffer` และ deck.gl ring buffer จะเติบโตต่อเนื่อง
- **Backend:** Redis list จะเติบโตต่อเนื่อง (อาจใช้ memory มาก)
- **แนะนำ:** ตรวจสอบ memory usage อย่างสม่ำเสมอ

### การแก้ไขในอนาคต:
- ถ้าต้องการจำกัดข้อมูลอีกครั้ง ให้ uncomment ส่วนที่ comment ไว้
- ปรับค่า `REALTIME_RETENTION_MS`, `WINDOW_MS`, `redisHistoryRetentionMinutes` ตามต้องการ

---

## Constants ที่เกี่ยวข้อง

### Frontend (logger.component.ts):
```typescript
REALTIME_RETENTION_MS = 60 * 60 * 1000;  // 1 hour
MAX_BUFFER_SIZE = ~259,200 points;       // 60Hz * 1h * 1.2
WINDOW_MS = 30 * 60 * 1000;              // 30 minutes (deck.gl)
```

### Backend (server.go):
```go
redisHistoryRetentionMinutes = 30;       // 30 minutes (default)
redisHistoryMaxLen = 100000;              // Fallback limit
```

---

## การตรวจสอบ

### ตรวจสอบว่า comment ออกแล้ว:
1. ✅ `addTelemetryPoint()` - ไม่มี trim by time/size
2. ✅ `trimOldPoints()` - function body เป็น comment
3. ✅ `deckIngestPoint()` - ไม่เรียก `trimOldPoints()`
4. ✅ `pushToRedisAndBroadcast()` - ไม่มี `LTrim()`

### ตรวจสอบข้อมูลไม่หาย:
- เปิด session ต่อเนื่อง > 1 ชั่วโมง
- ตรวจสอบว่า `telemetryBuffer.length` เพิ่มขึ้นต่อเนื่อง
- ตรวจสอบว่า deck.gl แสดงเส้นทางทั้งหมดตั้งแต่เริ่มต้น
- ตรวจสอบว่า Redis list length เพิ่มขึ้นต่อเนื่อง

# Dashboard Sort / Priority Documentation

เอกสารนี้อธิบายลำดับการเรียงข้อมูล (Priority), จุดที่ถูกเรียกใช้งาน, และพฤติกรรมตอนรับข้อมูล realtime ของหน้า Dashboard

ไฟล์อ้างอิงหลัก:
- `src/app/pages/full-main/dashboard/dashboard.component.ts`
- `src/app/pages/full-main/dashboard/dashboard.component.html`
- `src/app/pages/full-main/dashboard/dashboard.component.scss`

## 1) Priority การเรียงข้อมูล (Business Sort หลัก)

ใช้งานผ่านฟังก์ชัน `sortLoggers(loggers: LoggerItem[])`

ลำดับการเรียงแบบหลายชั้น (multi-key sort):
1. `currentCountDetect` มาก -> น้อย
2. ถ้า Count เท่ากัน: `status`/`loggerStatus` ที่เป็น `online` มาก่อน `offline`
3. ถ้า Count เท่ากันและเป็น `offline` ทั้งคู่: เรียง `onlineTime` ใหม่ -> เก่า
4. ถ้ายังเท่ากัน: `carNumber` น้อย -> มาก

สรุปสั้น: `Count desc` -> `Status online first` -> `(offline) onlineTime desc` -> `NBR asc`

## 2) Data Source ที่ใช้ในการ sort

ข้อมูลแต่ละแถวเป็น `LoggerItem` โดย field ที่เกี่ยวกับการ sort มีดังนี้:
- `currentCountDetect` ใช้เป็น priority อันดับ 1
- `status` หรือ `loggerStatus` ใช้เป็น priority อันดับ 2
- `carNumber` ใช้เป็น priority อันดับ 3

ข้อมูลชุดแรกมาจาก API `getLoggersWithAfr(...)` และในโหมด live จะมีการอัปเดตแบบ realtime ผ่าน WebSocket

## 3) Flow การทำงานหลัก (โหลดครั้งแรก + filter + sort)

เมื่อหน้า Dashboard โหลดข้อมูลสำเร็จ:
1. เก็บข้อมูลดิบไว้ที่ `allLoggers`
2. เรียก `updateView(allLoggers)`
3. `updateView` ทำงานตามลำดับ:
   - คำนวณ filter จาก `filterLogger`
   - กรองข้อมูลด้วย `filterLoggers(...)`
   - เรียงข้อมูลด้วย `sortLoggers(...)`
   - เซ็ตผลลัพธ์ไปที่ `onShowAllLoggers` และ `dataSource.data`

ดังนั้นค่าที่ผู้ใช้เห็นในตารางเป็นผลจาก `filter -> sort -> bind table`

## 4) พฤติกรรมตอนมี realtime update

เมื่อ WebSocket ส่งสถานะใหม่เข้ามา (`handleStatusUpdate`):
- ระบบจะอัปเดต `allLoggers` แบบ immutable
- ถ้าไม่มีการล็อคตำแหน่ง (`isSortLocked = false`):
  - เรียก `updateView(this.allLoggers)`
  - รายการสามารถเลื่อนอันดับใหม่ตาม Count/Status/NBR ได้ทันที
- ถ้ามีการล็อคตำแหน่ง (`isSortLocked = true`):
  - ไม่ re-sort ใหม่ทั้งก้อน
  - อัปเดตเฉพาะข้อมูลในตำแหน่งเดิมตาม snapshot ที่ล็อคไว้

ผลลัพธ์คือโหมดไม่ล็อคจะ "อันดับไหลตามข้อมูลจริง" และโหมดล็อคจะ "ค่าขยับ แต่อันดับคงที่"

## 5) Sort Lock (ล็อคตำแหน่ง Logger)

ปุ่ม "ล็อคตำแหน่ง Logger" ทำงานผ่าน `toggleSortLock()`

### ตอนกดล็อค
- เซ็ต `isSortLocked = true`
- เก็บ snapshot ปัจจุบันไว้ที่ `lockedLoggersSnapshot`
- ตารางยังรับค่า realtime ได้ แต่ตำแหน่งแถวคงตาม snapshot

### ตอนปลดล็อค
- เซ็ต `isSortLocked = false`
- ล้าง snapshot
- เรียก `updateView(this.allLoggers)` เพื่อจัดอันดับใหม่ตามค่าปัจจุบัน

## 6) User Sort (MatSort) กับ Business Sort

ปัจจุบันหน้า Dashboard ถูกกำหนดให้ใช้ Business Sort เพียงแบบเดียว
โดยไม่เปิดให้ผู้ใช้คลิกหัวตารางเพื่อเปลี่ยนลำดับ (ปิด interactive sort)

หมายเหตุ:
- ลำดับที่เห็นบนตารางมาจาก `updateView(...)` และ `sortLoggers(...)` เท่านั้น
- ผู้ใช้ยังค้นหา (search), filter และแบ่งหน้าได้ตามปกติ แต่ไม่สามารถ override ลำดับด้วยการคลิกหัวตาราง

## 7) Filter ที่มีผลกับข้อมูลก่อน sort

ตัวเลือก filter ปัจจุบัน:
- `all`: ทั้งหมด
- `allSmokeDetect`: แสดงเฉพาะรายการที่มีควัน/แจ้งเตือน
- `excludeSmokeDetect`: ตัดรายการที่มีควันออก (คงไว้เฉพาะ Count = 0)

การกรองเกิดก่อนการเรียงเสมอ

## 8) จุดสังเกตสำหรับรอบแก้ไขถัดไป

ถ้าต้องการปรับความหมายของเวลาในกลุ่ม `offline` ภายหลัง:
- ตอนนี้ใช้ `onlineTime` ตาม requirement ของงานนี้
- หากต้องการสื่อความหมายว่า "เพิ่งหลุดล่าสุด" มากขึ้น อาจเปลี่ยนไปใช้ `disconnectTime`

## 9) สรุปแบบใช้งาน

- ค่า Priority หลักของ Dashboard ตอนนี้คือ:
  `Count desc -> Online first -> (offline) onlineTime desc -> Car number asc`
- ข้อมูล live จะ re-rank ทันทีเมื่อไม่ล็อค
- ถ้าล็อคตำแหน่ง รายการจะไม่สลับอันดับแม้ค่าเปลี่ยน
- ผู้ใช้ไม่สามารถ sort เองผ่านการคลิกหัวตาราง (เพื่อคงลำดับตามธุรกิจเสมอ)

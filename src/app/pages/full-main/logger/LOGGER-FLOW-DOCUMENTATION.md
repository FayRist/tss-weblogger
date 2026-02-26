# Logger Component — Flow และเงื่อนไขการแสดงผล

เอกสารนี้อธิบายการทำงานของ **Logger Component** ตั้งแต่กดเข้า page การรับข้อมูลจาก WebSocket และเงื่อนไขการนำค่ามาแสดงใน **กราฟ AFR** และ **แผนที่** ทั้งโหมด **Online (Realtime)** และ **Offline (History)**.

---

## 1. การเริ่มต้นเมื่อกดเข้า Page

### 1.1 อ่าน Query Parameters

ใน `ngOnInit()` component อ่านค่าจาก URL ดังนี้:

| Parameter      | ใช้สำหรับ |
|----------------|-----------|
| `statusRace`  | `'history'` = โหมดประวัติ, อื่นๆ = โหมด Realtime (live) |
| `raceId`       | รหัส race |
| `segment`      | segment |
| `class`        | class |
| `loggerId`     | รหัส logger (ใช้เชื่อม WebSocket และโหลดข้อมูล) |
| `circuitName`  | ชื่อสนาม (bic, bric, bsc) ใช้กำหนดศูนย์กลางแผนที่และ background |

- **โหมด Realtime:** `isRealtimeMode = true`, `isHistoryMode = false`
- **โหมด History:** `isHistoryMode = true`, `isRealtimeMode = false`

### 1.2 ขั้นตอนหลังโหลด Page

1. **Batch subscription สำหรับ Realtime UI**  
   `rtBatch$` ถูก buffer ทุก 100ms แล้วเรียก `flushBatch()` เพื่ออัปเดตแผนที่/กราฟแบบรวม (ใช้กับ Legacy WebSocket path)

2. **ดึงข้อมูล Logger จาก API**  
   `getDetailLoggerById()` เรียก `eventService.getDetailLoggerInRace(...)` ด้วย `parameterLoggerID`  
   จาก response จะได้:
   - `loggerID`, `carNumber`, `firstName`, `lastName`, `classType`, `segmentValue`, `sessionValue`, `circuitName`
   - `onlineLastTime`, `countDetect`, `afr`, `afrAverage`, `loggerStatus` (เช่น 'Offline' / 'Online')
   - ตั้งค่า rotation/flip ของ SVG ตาม `circuitName` และโหลด background image สำหรับ canvas

3. **เริ่มโหลดข้อมูลตามโหมด**
   - **History:** `loadHistoryData()` — ดึงจาก API แล้วใส่ `allDataLogger`, แบ่ง lap, build map + chart
   - **Realtime:** เรียก **`loadAndRestoreLoggerCache()`** ก่อน (โหลด cache จาก Redis ผ่าน `GET /api/realtime/cache`) แล้วใน `complete` ของ request นั้นจึงเรียก **`initializeRealtimeWithBacklog()`** — เปิด WebSocket แบบ realtime พร้อม backlog 2 นาที

4. **หลัง View สร้างแล้ว (`ngAfterViewInit`)**  
   - เรียก `initializeCanvas()`, `calculateSvgScale()`, `initializeSvgTransformForCircuit()`
   - เรียก **`initializeDeckMap()`** เพื่อตัดสินใจแสดงแผนที่แบบ deck.gl หรือ canvas

---

## 2. การรับข้อมูลจาก WebSocket

มี **สองเส้นทาง** การรับข้อมูลที่เกี่ยวข้องกับการแสดงผล:

### 2.1 Realtime WebSocket (เส้นทางหลักสำหรับ Live)

- **จุดเริ่มต้น:** `initializeRealtimeWithBacklog()` ในโหมด Realtime
- **URL:** `getApiWebSocket("/ws/realtime?logger=client_{loggerId}&tail_ms=120000&wrap=1")`  
  - `tail_ms=120000` = backlog 2 นาที
  - `wrap=1` = รูปแบบข้อความแบบ batch

เมื่อได้รับข้อความ:

1. **`ws.onmessage`** → `handleRealtimeMessage(data, loggerId)`
2. อัปเดตสถิติ WebSocket: `updateWebSocketStats(data, Date.now())`
3. ตั้งสถานะเป็น **Online** เมื่อมีข้อมูล และ `resetStatusTimeout()` (ถ้าไม่มีข้อมูลต่อเนื่อง 5 วินาที จะกลับเป็น Offline)
4. แยกประเภทข้อความและส่งแต่ละจุดเข้า **`addTelemetryPoint(point)`**:
   - `type === 'snapshot'` และ `payload.items` → แต่ละ item ส่งเข้า `addTelemetryPoint(parseTelemetryPoint(item, loggerId))`
   - `type === 'batch'` และ `payload.items` → เหมือนกัน
   - `type === 'race_tick'` และ `payload.points` → เหมือนกัน
   - `type === 'tick'` และ `payload.item` → ส่ง item เดียว
   - ถ้าเป็น array โดยตรง หรือ single object → ส่งเข้า `addTelemetryPoint` เช่นกัน

**`parseTelemetryPoint`** แปลง payload เป็น `TelemetryPoint`:  
`loggerId`, `ts`, `x`(lat), `y`(lon), `afr`, `rpm`, `velocity` (รวมถึงการแก้ lat/lon ที่ผิดปกติ เช่น หาร 60)

**`addTelemetryPoint(point, options?)` ทำดังนี้:**

- พารามิเตอร์ตัวที่สอง (optional): `{ skipTimeTrim?: boolean; skipChartUpdate?: boolean }` — ใช้ตอน restore จาก cache เพื่อไม่ให้ trim ตามเวลา และไม่ให้ push เข้า `chartDataPoints` / อัปเดตกราฟในจุดเดียว (จะอัปเดตกราฟครั้งเดียวหลัง restore ทั้งก้อน)
- เขียนจุดเข้า **ring buffer** `telemetryBuffer` (trim ตามเวลาเมื่อไม่ใช่ `skipTimeTrim` ไม่เกิน `MAX_BUFFER_TIME_MS` = 1 ชม.)
- ส่งจุดเข้า **pipeline 5Hz:** `processChartResampling(point)` → bucket 200ms → `flushChartBucket()` เข้า `chartDisplayBuffer` (ยังมีใช้สำหรับ pipeline ภายใน แต่การอัปเดตกราฟจริงใช้ `chartDataPoints`)
- **กราฟ (เมื่อไม่ใช่ `skipChartUpdate`):** push จุดเข้า **`chartDataPoints`** (array กลางตัวเดียวสำหรับ feed กราฟ) → trim จุดที่เก่ากว่า `CHART_WINDOW_MS` (30 นาที) → throttle 150ms แล้วเรียก **`updateChartFromGlobalArray()`** → อ่าน `chartDataPoints` อัปเดต `detailOpts.series` / `brushOpts.series` (หรือ imperative `chart.updateSeries`)
- **แผนที่:**
  - ถ้า **ไม่ใช้ canvas mode** (มี circuit center): `deckIngestPoint(point)` → อัปเดต deck.gl layers
  - ถ้า **ใช้ canvas mode**: `drawPointOnCanvas(point)` และ `scheduleRender()` สำหรับ canvas

ไม่มีการ push เข้า `allDataLogger` หรือ `rtBatch$` ในเส้นทางนี้; กราฟ realtime ใช้ **`chartDataPoints`** เป็นแหล่งข้อมูลหลัก แผนที่ใช้ telemetryBuffer / deck buffer หรือ canvas โดยตรง

### 2.2 Legacy WebSocket (WebSocket Service)

- ใช้เมื่อมีระบบเดิมที่ส่งข้อมูลผ่าน `webSocketService.message$`
- ใน `processWebSocketMessage()` ถ้า `message.type === 'sensor_data:' + this.currentLoggerId`:
  - แปลงข้อมูลเป็น `MapPoint` (ts, lat, lon, velocity, time)
  - **push เข้า `allDataLogger[key]`** (key เช่น `'realtime'`)
  - **`rtBatch$.next({ key, point })`** เพื่อให้ batch ไปที่ `flushBatch()`

**`flushBatch(events)`:**

- สำหรับแต่ละ `{ key, point }`: `pushPointToLap(key, point)`, `updateCachedBounds(key, point)`
- เรียก **`updateChartsFromSelection(selection)`** และ **`updateMapFromSelection(selection)`** ครั้งเดียวต่อ batch
- selection มาจาก `selectedRaceKey` หรือ keys ที่มีใน events

ดังนั้นใน Legacy path กราฟและแผนที่ถูกเลี้ยงจาก `allDataLogger` ผ่าน `updateChartsFromSelection` / `updateMapFromSelection` ไม่ใช่จาก ring buffer โดยตรง

### 2.3 สถานะ Online / Offline

- **เป็น Online:** เมื่อ Realtime WebSocket ได้รับข้อความครั้งแรก หรือ Legacy path มีข้อมูล
- **เป็น Offline:**  
  - เมื่อ WebSocket ปิด (`onclose`) หรือ error (`onerror`)  
  - หรือเมื่อ **ไม่มีข้อมูลเข้ามาต่อเนื่อง 5 วินาที** (`STATUS_TIMEOUT_MS`) — ใช้ `resetStatusTimeout()` ทุกครั้งที่มีข้อมูล และเมื่อ timeout ถึงจะตั้ง `loggerStatus = 'Offline'`

---

## 3. เงื่อนไขการแสดงผลในกราฟ (Graph Realtime Average AFR)

ส่วน template ที่เกี่ยวข้อง (บรรทัด 274–369 ใน `logger.component.html`):

- **กราฟหลัก (detail):** `<apx-chart [series]="detailOpts.series" ...>`
- **กราฟล่าง (brush):** `<apx-chart [series]="brushOpts.series" ...>`
- หัวข้อ: `Graph Realtime Average AFR` และถ้ามี `lapCount` จะแสดง `— Laps: {{ lapCount }}`
- Toggle **กลับด้านกราฟ:** `afrGraphInverted` → `onAfrGraphInvertChange()` อัปเดต `detailOpts.yaxis` / `brushOpts.yaxis` (reversed, min/max)

### 3.1 โหมด Realtime (Online)

- **แหล่งข้อมูลกราฟ (ตัวเดียว):** **`chartDataPoints`** (array ในหน่วยความจำ)
  - **ครั้งแรกเมื่อเข้า path:** เติมจาก **`GET /api/realtime/cache?logger=client_{id}&limit=5000`** (backend อ่านจาก Redis แล้วส่ง `items` เรียงเวลาเก่า→ใหม่) ใน `loadAndRestoreLoggerCache()` → ตั้ง `chartDataPoints = sorted` แล้วเรียก `restoreFromSessionCache(points)` → สุดท้ายเรียก `updateChartFromGlobalArray()`
  - **หลังจากนั้น:** ทุกครั้งที่ `addTelemetryPoint(point)` (ไม่มี `skipChartUpdate`) จะ push จุดเข้า `chartDataPoints` แล้ว trim จุดที่เก่ากว่า 30 นาที (`CHART_WINDOW_MS`)
- **การอัปเดตกราฟ:** ทุกครั้งที่ `addTelemetryPoint()` และผ่าน throttle 150ms จะเรียก **`updateChartFromGlobalArray()`**:
  - อ่าน **`chartDataPoints`** (ไม่ใช้ `chartDisplayBuffer` สำหรับ binding กราฟแล้ว)
  - แปลงเป็น `{ x: p.ts, y: p.afr }` แล้วอัปเดต:
    - **detail:** ข้อมูลทั้งหมดใน `chartDataPoints`
    - **brush:** 1000 จุดล่าสุด (`data.slice(-1000)`)
  - ใช้ imperative `chart.updateSeries()` ถ้ามี `this.chart?.chart` ไม่ฉะนั้น assign `detailOpts` / `brushOpts` ใหม่

**หมายเหตุ:** `processChartResampling` / `flushChartBucket` / `chartDisplayBuffer` ยังทำงานอยู่แต่ไม่ได้ใช้เป็นแหล่งข้อมูลสำหรับอัปเดตกราฟโดยตรงแล้ว — ใช้ `chartDataPoints` เป็นตัว feed กราฟเดียว

**เงื่อนไขสรุป:**

- กราฟจะแสดงเมื่อมีจุดใน `chartDataPoints` (โหลดจาก Redis cache เมื่อเข้า path หรือรับจาก WebSocket)
- แกน Y ใช้ `afrYAxisMin`, `afrYAxisMax` และ `afrGraphInverted` (กลับด้านหรือไม่)
- สีและรูปแบบเส้นมาจาก `detailOpts` / `brushOpts` ต้นฉบับ (PAL, stroke, markers ฯลฯ)

### 3.2 โหมด History (Offline)

- **แหล่งข้อมูล:** หลัง `loadHistoryData()` จะได้ `mapPoints` จาก API → เก็บใน `allDataLogger[dataKey]` (dataKey = `race_${raceId}_logger_${loggerId}`)  
  → แบ่ง lap เป็น `raceLab` → เรียก **`buildChartsFromLaps(this.raceLab)`**

**`buildChartsFromLaps(laps)`:**

- **detail:** แต่ละ lap เป็น 1 series ชื่อ `Lap 1`, `Lap 2`, ... ข้อมูลเป็น `{ x: toMillis(p.ts), y: afrValue }` หลัง downsample (สูงสุด 5000 จุดต่อ series)
- **markers แบบ discrete:** จุดที่ AFR < limit (เช่น 14) จะเป็น marker สีแดง
- **brush:** รวมทุก lap เป็นข้อมูลต่อเนื่อง แล้ว downsample ไม่เกิน 10000 จุด
- **annotations:** เส้น y = AFR limit

**เงื่อนไขสรุป:**

- กราฟแสดงเมื่อโหลด History สำเร็จและมี `raceLab.length > 0`
- จำนวน Lap ที่แสดงในหัวข้อมาจาก `lapCount` (จาก lap counting / `raceLab.length` ตามที่ component ตั้งค่า)

### 3.3 การ Export และการกลับด้านกราฟ

- ปุ่ม **Export Data** เรียก `exportLoggerDataToTxt()`
- **กลับด้านกราฟ:** `mat-slide-toggle` ผูก `afrGraphInverted` และ `onAfrGraphInvertChange()` อัปเดต min/max และ reversed ของแกน Y ใน `detailOpts` และ `brushOpts`

---

## 4. เงื่อนไขการแสดงผลในแผนที่ (Map)

ส่วน template ที่เกี่ยวข้อง (บรรทัด 136–262 ใน `logger.component.html`):

- **แผนที่ deck.gl (WebGL):**  
  `<div #raceMapDeck class="race-map-deck" [style.display]="useCanvasMode ? 'none' : 'block'">`
- **แผนที่ canvas (เส้นทางอย่างเดียว ไม่มี circuit):**  
  `<canvas #raceMapCanvas ... [style.display]="useCanvasMode ? 'block' : 'none'">`
- บล็อก Legacy SVG+Canvas อยู่ภายใน `style="display: none;"` จึงไม่แสดงใน UI ปัจจุบัน

ดังนั้นการแสดงผลแผนที่จริงมีสองโหมด: **deck.gl** หรือ **canvas** ตาม `useCanvasMode`.

### 4.1 การเลือกโหมดแผนที่ (useCanvasMode)

ใน **`initializeDeckMap()`** (เรียกจาก `ngAfterViewInit`):

- เรียก **`getMapCenterForCircuit(this.circuitName)`** (จาก `app.config.ts`)
- **ถ้าไม่มี center (circuit ไม่รู้จัก):**  
  `useCanvasMode = true` → แสดง **raceMapCanvas** เท่านั้น (พื้นที่วาดเส้นทางอย่างเดียว ไม่มีแผนที่พื้นหลัง circuit)
- **ถ้ามี center (bic, bric, bsc ใน APP_CONFIG.MAP.CIRCUITS):**  
  `useCanvasMode = false` → สร้าง MapLibre + deck.gl overlay → แสดง **raceMapDeck**
- ถ้า deck.gl เริ่มต้นไม่สำเร็จ (error) จะ fallback เป็น `useCanvasMode = true` และ `initializeCanvasMap()`

สรุป:

- **circuit รู้จัก (bic, bric, bsc):** แผนที่ = deck.gl (มี satellite และ layers เส้นทาง/จุด)
- **circuit ไม่รู้จัก หรือ error:** แผนที่ = canvas วาดเส้นทางอย่างเดียว

### 4.2 โหมด Realtime (Online) — แผนที่

- **เมื่อ `useCanvasMode === false` (deck.gl):**
  - แต่ละจุดจาก `addTelemetryPoint()` ไปที่ **`deckIngestPoint(point)`**
  - ข้อมูลถูกเก็บใน ring buffer ของ deck (sourcePositions, segmentColors ฯลฯ) และวาดเป็น LineLayer / ScatterplotLayer ผ่าน `scheduleDeckRender()`
  - สีจุด/เส้นตาม AFR (และ logic ที่ใช้ใน deck layers)
- **เมื่อ `useCanvasMode === true` (canvas):**
  - แต่ละจุดไปที่ **`drawPointOnCanvas(point)`** — แปลง lat/lon เป็นพิกัด canvas แล้ววาดเส้น/จุดตามสี AFR
  - อาจมี `scheduleRender()` สำหรับการวาดรวม

ในโหมด Realtime **ไม่มีการอัปเดต `currentMapPoints`** จาก realtime WebSocket โดยตรง; การแสดงผลแผนที่ realtime ใช้ deck buffer หรือ canvas drawing เท่านั้น

### 4.3 โหมด History (Offline) — แผนที่

หลัง `loadHistoryData()`:

- ข้อมูลอยู่ใน `allDataLogger[dataKey]`, แบ่ง lap เป็น `raceLab`
- เรียก **`buildMapFromLaps(this.raceLab, dataKey)`**:
  - คำนวณ bounds จาก lat/lon ทั้งหมด
  - แปลงแต่ละ segment เป็นพิกัด XY (toX, toY) เก็บใน `segmentsByKey[key]`
  - สร้าง `currentMapPoints` เป็น array ของ `{ x, y, ts, afr }` สำหรับทุกจุดในทุก lap
  - ใช้สีจาก `getAfrColor(afrValue)` ตามค่า AFR
- จากนั้น:
  - **ถ้า `!useCanvasMode` และมี `deckOverlay`:** เรียก **`loadHistoryDataToDeckMap(allLapPoints)`** → อัปเดต deck layers ด้วยข้อมูล history
  - **ถ้า `useCanvasMode` และมี `raceMapCanvasCtx`:** เรียก **`loadHistoryDataToCanvasMap(allLapPoints)`** → วาดเส้นทางลง canvas

**เงื่อนไขสรุป:**

- History แผนที่แสดงเมื่อโหลด History สำเร็จและมีจุดใน `raceLab`
- แผนที่ใช้ deck.gl หรือ canvas ตาม `useCanvasMode` เหมือน realtime

### 4.4 Legacy SVG (ถูกซ่อน)

ภายในบล็อก `track-image-container` (display: none):

- **จุด START (วงกลม + ข้อความ "START"):**  
  แสดงเมื่อ `startLatLongPoint` มีค่า **และ** (`circuitName === 'bsc'` **หรือ** (`circuitName === 'bric'` และ `loggerID === 118`))  
  ตำแหน่งจาก `startPointPx` (คำนวณจาก `currentMapPoints` ที่ใกล้กับ `startLatLongPoint`)
- **จุดล่าสุด (วงกลมแดง):**  
  แสดงเมื่อ `circuitName !== 'bsc'` และไม่ใช่กรณี (bric และ loggerID === 118) **และ** `currentMapPoints.length > 0` — ใช้จุดสุดท้ายของ `currentMapPoints` เป็นตำแหน่ง

เนื่องจาก div นี้ถูกซ่อน เงื่อนไขเหล่านี้จึงไม่ส่งผลต่อ UI ที่ผู้ใช้เห็นในโหมด deck.gl / canvas ปัจจุบัน

---

## 5. สรุปตารางเงื่อนไข

| หัวข้อ | Realtime (Online) | History (Offline) |
|--------|-------------------|-------------------|
| **แหล่งข้อมูลกราฟ** | **`chartDataPoints`** (เติมจาก Redis cache เมื่อเข้า path แล้วต่อด้วย WebSocket; trim 30 นาที) | `allDataLogger[dataKey]` → `raceLab` → `buildChartsFromLaps` |
| **การอัปเดตกราฟ** | `updateChartFromGlobalArray()` (throttle 150ms) อ่านจาก `chartDataPoints` | ครั้งเดียวหลังโหลด History |
| **แหล่งข้อมูลแผนที่** | `telemetryBuffer` → deck layers หรือ canvas drawing (restore จาก cache เติม buffer ด้วย) | `raceLab` → deck layers หรือ canvas ผ่าน loadHistoryDataToDeckMap / loadHistoryDataToCanvasMap |
| **การแสดงแผนที่** | deck.gl ถ้า circuit รู้จัก มิฉะนั้น canvas | เหมือนกัน ตาม `useCanvasMode` |
| **สถานะ Online/Offline** | ตาม WebSocket และ timeout 5 วินาที | ไม่ใช้ WebSocket; โหมดเป็น History อยู่แล้ว |

---

## 6. ค่าคงที่สำคัญ

- **กราฟ:**  
  - Bucket 5Hz: 200ms  
  - หน้าต่างกราฟ: 30 นาที  
  - Throttle อัปเดต: 150ms  
  - Brush แสดง 1000 จุดล่าสุด  
- **Realtime buffer:**  
  - เก็บข้อมูลสูงสุด 1 ชั่วโมง  
  - อัตราเข้าเป้า 60 Hz, ring buffer ขนาดใหญ่  
- **Status Offline:** ไม่มีข้อมูลเข้ามา 5 วินาที  
- **แผนที่:**  
  - Circuit ที่รู้จัก: bic, bric, bsc (กำหนดใน `APP_CONFIG.MAP.CIRCUITS` และ `getMapCenterForCircuit`)

---

## 7. ทำไมตอน Online ออกแล้วกลับมาข้อมูลยังอยู่ แต่หลัง Timeout ออกแล้วกลับมาข้อมูลหาย?

### สถานการณ์ที่คุณเห็น

1. **ตอน Online (มีข้อมูลส่งอยู่):** กด "ย้อนกลับ" หรือไปหน้าอื่น แล้วกลับมาที่ path logger → กราฟและแผนที่**ยังแสดงข้อมูล**อยู่  
2. **หลัง Broadcast หยุด + Timeout (สถานะ Offline):** กด "ย้อนกลับ" หรือไปหน้าอื่น แล้วกลับมาที่ path logger → **ค่าที่เคยมีหายหมด** (กราฟและแผนที่ว่าง)

สาเหตุอยู่ที่ **การทำลาย component + แหล่งที่มาของข้อมูลเมื่อกลับเข้าใหม่** และ **ช่วงเวลา backlog บน server** ดังนี้

### 7.1 เมื่อออกจากหน้า Logger (ย้อนกลับ / ไปหน้าอื่น)

- ปุ่ม "ย้อนกลับ" ใน `full-main.component.html` เรียก `navigateBack()` ซึ่งทำ `this.location.back()`  
  → ไปยัง URL ก่อนหน้า (เช่น dashboard / race) **ไม่ใช่แค่ซ่อนหน้า logger**
- การเปลี่ยน route แบบนี้ทำให้ Angular **ทำลาย (destroy) LoggerComponent**
- ใน **`ngOnDestroy()`** ของ logger component จะมีการ:
  - ปิด WebSocket realtime (`this.realtimeWS.close()`)
  - ล้าง subscription ต่างๆ
  - **รีเซ็ต buffer ทั้งหมด:**  
    `telemetryBufferHead/Tail/Count`, `chartDisplayHead/Tail/Count`, `currentBucket = null`, `historyPoints`, `historyDownsampled` ฯลฯ

ดังนั้น **ข้อมูลที่แสดงบนกราฟและแผนที่เก็บอยู่แค่ใน memory ของ component** — พอออกจากหน้าแล้ว component ถูกทำลาย ข้อมูลในหน้าจอนั้นก็หายไปจากแอปด้วย

### 7.2 เมื่อกลับเข้ามาที่หน้า Logger อีกครั้ง (Flow ปัจจุบัน)

- Angular **สร้าง LoggerComponent ใหม่** (instance ใหม่)
- `ngOnInit()` → `initializeDataLoading()` → **Realtime:** เรียก **`loadAndRestoreLoggerCache()`** ก่อน (ไม่เรียก `initializeRealtimeWithBacklog()` ทันที)
  - **`loadAndRestoreLoggerCache()`:** ส่ง **`GET /api/realtime/cache?logger=client_{loggerId}&limit=5000`** (ใช้ `getApiUrl('/realtime/cache')`)
  - **ถ้า API ส่ง `items` มา:** ตั้ง `chartDataPoints = sorted` แล้วเรียก **`restoreFromSessionCache(points)`** — loop `addTelemetryPoint(p, { skipTimeTrim: true, skipChartUpdate: true })` เพื่อเติม `telemetryBuffer` และ deck/canvas แล้วเรียก `updateChartFromGlobalArray()` และ `scheduleDeckRender()` / `scheduleRender()`
  - **ใน `complete` ของ HTTP request (ไม่ว่าจะมี items หรือไม่):** เรียก **`initializeRealtimeWithBacklog()`** — เปิด WebSocket ไปที่ `/ws/realtime?logger=client_{loggerId}&tail_ms=120000&wrap=1`

ดังนั้น **ข้อมูลที่เห็นเมื่อกลับเข้ามา มาจาก (1) Redis ผ่าน GET /api/realtime/cache ก่อน (สูงสุด 5000 จุด ไม่ตัดตาม 2 นาที) และ (2) หลังจากนั้นจาก WebSocket snapshot/batch ตามเดิม** — ถ้า Redis ยังมีข้อมูลของ logger นั้น กราฟและแผนที่จะถูก restore ก่อนแล้วค่อยต่อด้วย realtime

### 7.3 Backend: ส่ง backlog อย่างไร

ใน `server.go`:

- เมื่อมี client ต่อ `/ws/realtime` และ `tail_ms > 0` (เช่น 120000 ms = 2 นาที) จะเรียก **`sendBacklogSnapshot(conn, loggerName, tailMs, hz, wrap)`**
- Snapshot ดึงจาก Redis (หรือ in-memory fallback) ที่ key ประมาณ `sensor_data:client_{loggerId}`
- **กรองเวลา:**  
  `cutoffTime = time.Now().Add(-tailMs)` = **“เวลาปัจจุบันลบ 2 นาที”**  
  จะส่งเฉพาะ item ที่ **timestamp อยู่ในช่วง [cutoffTime, now]** (คือไม่เก่ากว่า 2 นาทีจาก **เวลาที่ client กลับมาเชื่อมต่อ**)

สรุป: **ถ้ากลับมาเชื่อมต่อหลังเวลาที่ข้อมูลล่าสุดเกิน 2 นาทีแล้ว → snapshot จะไม่มี item → frontend ได้ข้อความ snapshot แบบ `items: []` หรือไม่ส่ง snapshot → กราฟและแผนที่ว่าง**

### 7.4 ทำไมตอน Online ออกแล้วกลับมาข้อมูลยังอยู่

- ตอนที่ **Broadcast ยังส่งอยู่** คุณมักจะ **ออกแล้วกลับมาในระยะเวลาสั้น** (ภายในไม่กี่สิบวินาที หรืออย่างมาก 1–2 นาที)
- เมื่อกลับมา → component ใหม่ → WebSocket ใหม่ → server ส่ง **snapshot 2 นาทีล่าสุด**
- ข้อมูลล่าสุดยังอยู่ในช่วง `[now - 2min, now]` จึงถูกส่งมา → frontend ได้ `snapshot.items` เต็ม → กราฟและแผนที่ถูกเติมจาก snapshot + ต่อด้วย batch ที่ยังส่งมาเรื่อยๆ  
→ **ดูเหมือน “ข้อมูลยังอยู่”** แม้จริงๆ เป็นการโหลดใหม่จาก server

### 7.5 ทำไมหลัง Timeout ออกแล้วกลับมาข้อมูลหาย (และความต่างหลังมี Cache API)

- **Flow เดิม (ก่อนมี GET /api/realtime/cache):**  
  หลัง Broadcast หยุด → Timeout 5 วินาที → Offline. เมื่อออกแล้วกลับมา component ใหม่เปิด WebSocket อย่างเดียว → server ส่ง snapshot ที่กรองด้วย **cutoffTime = now - 2 นาที** เท่านั้น. ถ้ากลับมาหลังจากข้อมูลล่าสุดเกิน 2 นาที snapshot จะว่าง → กราฟและแผนที่ว่าง

- **Flow ปัจจุบัน (มี GET /api/realtime/cache):**  
  เมื่อกลับเข้ามาที่ path logger จะเรียก **`loadAndRestoreLoggerCache()`** ก่อน — ส่ง **GET /api/realtime/cache?logger=client_{id}&limit=5000**  
  Backend (**`getRealtimeCacheFromRedis`** / **`getRealtimeCacheItems`**) อ่านจาก Redis (หรือ in-memory) ที่ key `sensor_data:client_{id}` แล้วส่งกลับ **สูงสุด 5000 รายการล่าสุด (เรียงเวลาเก่า→ใหม่)** **โดยไม่มีการตัดตาม 2 นาที** — ใช้จำนวนรายการ (limit) เป็นหลัก  
  ดังนั้น **ถ้า Redis ยังมีข้อมูลของ logger นั้น** (ยังไม่หมดอายุ/ยังไม่ถูกลบ) เมื่อกลับมาหลัง Timeout กราฟและแผนที่จะถูก **restore จาก cache API** ก่อน แล้วค่อยเปิด WebSocket ต่อ  
  **ข้อมูลจะหาย** ก็ต่อเมื่อ Redis ไม่มีข้อมูลของ logger นั้น (เช่น key ไม่มี หรือ list ว่าง) หรือ API ล้มเหลว

### 7.6 สรุปสั้นๆ

| สถานการณ์ | ออกจากหน้า | กลับเข้า (Flow ปัจจุบัน) | แหล่งข้อมูล | ผลลัพธ์ |
|-----------|-------------|----------|-------------|----------|
| **Online** | Component ถูก destroy, chartDataPoints ถูกล้าง | Component ใหม่ → GET /api/realtime/cache → restore → เปิด WS | Redis cache (สูงสุด 5000 จุด) + WebSocket snapshot/batch | กราฟ/แผนที่เต็ม (จาก cache + realtime) |
| **หลัง Timeout** | Component ถูก destroy, chartDataPoints ถูกล้าง | Component ใหม่ → GET /api/realtime/cache → restore ถ้า Redis มีข้อมูล → เปิด WS | Redis cache (โดยจำนวนรายการ ไม่ตัด 2 นาที) + WebSocket | กราฟ/แผนที่เต็ม ถ้า Redis ยังมีข้อมูล; ว่างถ้า Redis ไม่มีหรือ API ล้มเหลว |

การที่หลัง Timeout ออกแล้วกลับมาข้อมูลหายในบางครั้ง อาจเป็นเพราะ Redis ไม่มี key หรือ list ว่าง (เช่น retention ล้างแล้ว หรือ logger ไม่เคยมีข้อมูลใน Redis)  
- “” 
---

## 8. Logger cache เมื่อกลับเข้า path logger (Flow ปัจจุบัน)

โหลดข้อมูลจาก **Redis ผ่าน Backend** ทุกครั้งที่เข้า path logger (โหมด Realtime) — **ไม่ใช้ sessionStorage**

- **Backend:**  
  - Route: **`GET /api/realtime/cache?logger=client_{id}&limit=5000`** (handler: **`getRealtimeCacheFromRedis`** ใน `server.go`)  
  - อ่านจาก Redis key `sensor_data:client_{id}` (หรือ in-memory fallback `memLIndex`) ส่งกลับ **`{ "items": [...] }`** สูงสุด `limit` รายการ (default 5000, max 10000) เรียงลำดับเวลา **เก่า→ใหม่** (chronological)  
  - **ไม่มีการตัดตาม 2 นาที** — ใช้จำนวนรายการ (last N items ใน list) เป็นหลัก
- **Frontend:**  
  - **`chartDataPoints`** = array กลางตัวเดียวสำหรับ feed กราฟ (detail + brush). ใน **`ngOnDestroy()`** มีการ **`this.chartDataPoints = []`** (ไม่มีการเรียก `saveLoggerCache()` — โค้ดถูก comment ไว้)  
  - **`arrayLoggerCache`** ยังมีใน component แต่ใช้เคลียร์ตอนต้น `loadAndRestoreLoggerCache()` ถ้ามีค่า ไม่ได้ใช้เป็นแหล่งโหลดจาก Redis โดยตรง
- **โหลด:** ใน **`initializeDataLoading()`** (โหมด Realtime) เรียก **`loadAndRestoreLoggerCache()`**:
  1. เคลียร์ `arrayLoggerCache` (ถ้ามีความยาว) และ **`chartDataPoints = []`**
  2. ถ้าไม่มี `loggerId` → เรียก `initializeRealtimeWithBacklog()` แล้ว return
  3. เรียก **`GET getApiUrl('/realtime/cache') + ?logger=client_{id}&limit=5000`** (ค่าจาก `LOGGER_CACHE_MAX_POINTS`)
  4. **next:** ถ้า `res.items` มีข้อมูล → แปลงเป็น `TelemetryPoint` → ตั้ง **`chartDataPoints = sorted`** → เรียก **`restoreFromSessionCache(points)`** (loop `addTelemetryPoint(p, { skipTimeTrim: true, skipChartUpdate: true })` แล้ว `updateChartFromGlobalArray()`, `scheduleDeckRender()`, `scheduleRender()`)
  5. **complete:** เรียก **`initializeRealtimeWithBacklog()`** (เปิด WebSocket) — เรียกเสมอไม่ว่า API จะมี items หรือไม่
- **ผล:** ทุกครั้งที่กดเข้ามาที่ path logger (รวมหลัง Timeout) จะพยายามโหลดจาก Redis ก่อน → แสดงกราฟและแผนที่จาก cache ถ้ามี → จากนั้นเปิด WebSocket ต่อด้วย snapshot/batch ตามเดิม

---

## 9. ความต่างจาก Flow เดิม (สรุปการเปลี่ยนแปลง)

| หัวข้อ | Flow เดิม | Flow ปัจจุบัน |
|--------|-----------|----------------|
| **แหล่งข้อมูลกราฟ Realtime** | `chartDisplayBuffer` (ring buffer จาก 5Hz resampling) อัปเดตผ่าน `updateChartIncremental()` | **`chartDataPoints`** (array เดียว) อัปเดตผ่าน **`updateChartFromGlobalArray()`**; เติมจาก Redis cache เมื่อเข้า path แล้วต่อด้วย WebSocket |
| **เมื่อเข้า path logger (Realtime)** | เปิด WebSocket เลย → ได้เฉพาะ snapshot 2 นาที + batch ต่อ | เรียก **`loadAndRestoreLoggerCache()`** ก่อน (GET /api/realtime/cache สูงสุด 5000 จุด) → restore กราฟ+แผนที่ → **complete** แล้วจึงเปิด WebSocket |
| **หลัง Timeout แล้วออกแล้วกลับมา** | ข้อมูลหายถ้า snapshot ว่าง (ข้อมูลล่าสุดเก่ากว่า 2 นาที) | ข้อมูลยังแสดงได้ **ถ้า Redis ยังมีข้อมูล** (cache API ส่ง last N items ไม่ตัด 2 นาที); หายถ้า Redis ไม่มีหรือ API ล้มเหลว |
| **Backend** | มีเฉพาะ WebSocket snapshot (cutoff 2 นาที) | เพิ่ม **GET /api/realtime/cache** — อ่าน Redis/in-memory ส่ง `items` ตาม `limit` (ไม่ตัดเวลา) |
| **addTelemetryPoint** | ไม่มี options | รองรับ **`options?: { skipTimeTrim?: boolean; skipChartUpdate?: boolean }`** สำหรับ restore จาก cache (ไม่ trim เวลา, ไม่ push เข้า chartDataPoints ในจุดเดียว) |
| **ngOnDestroy** | ล้าง ring buffers + chartDisplay ฯลฯ | เหมือนเดิม + **`chartDataPoints = []`**; ไม่มี `saveLoggerCache()` (comment ไว้) |

- **`processChartResampling` / `flushChartBucket` / `chartDisplayBuffer`** ยังมีอยู่ในโค้ดแต่ไม่ได้ใช้เป็นแหล่ง binding กราฟโดยตรงแล้ว — กราฟใช้ **`chartDataPoints`** เป็นตัว feed เดียว
- **Import:** ใช้ **`getApiUrl`** จาก `app.config` สำหรับเรียก API cache (นอกจาก `getApiWebSocket`)

---

*เอกสารนี้อ้างอิงจาก `logger.component.ts`, `logger.component.html` ของ TSS WebLogger และ `server.go` ของ tss-race-backend*

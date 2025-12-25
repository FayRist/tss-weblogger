# deck.gl Migration - Logger Race Map

## Overview
แผนที่สนาม (race map) ของ logger component ได้ถูกย้ายจาก SVG+Canvas ไปเป็น deck.gl (WebGL) บน MapLibre GL JS โดยใช้ MapTiler basemap เพื่อรองรับการรับข้อมูล 60Hz ต่อเนื่องและ render 60fps ได้ลื่น

## Configuration

### MapTiler API Key
API Key ถูกตั้งค่าใน `src/app/app.config.ts`:

```typescript
MAP: {
  API_KEY: 'uA8Sp5KU2WAOHVMJEYqJ', // Default key from .env
  CIRCUITS: {
    bic: { LAT: 12.921067, LNG: 101.008893 },   // Bira Circuit
    bric: { LAT: 14.962671, LNG: 103.084393 },  // Chang International Circuit
    bsc: { LAT: 13.305132, LNG: 100.901529 }    // Bangsaen Street Circuit
  }
}
```

**การตั้งค่า MAP_API_KEY:**
- ปัจจุบันใช้ค่า default ใน `app.config.ts`
- สำหรับ production: สามารถตั้งค่าได้ผ่าน:
  1. **Build-time replacement**: สร้าง `environment.ts` และใช้ Angular's file replacement
  2. **Runtime config**: อ่านจาก environment variable หรือ API config service
  3. **.env file**: ใช้ build tool ที่รองรับ (เช่น dotenv-webpack)

**การตั้งค่า Circuit Centers:**
ระบบจะดึง center ตาม `circuitName` (bic, bric, bsc) จาก `APP_CONFIG.MAP.CIRCUITS`
- **ถ้ามี circuitName ที่ตรงกัน** → แสดง MapLibre map พร้อม deck.gl overlay
- **ถ้าไม่มี circuitName ที่ตรงกัน** → แสดงพื้นที่เปล่า (canvas) สำหรับลากเส้น

**Style URL ที่ใช้:**
- MapTiler Streets: `https://api.maptiler.com/maps/streets/style.json?key=${MAP_API_KEY}`

## Performance Constants

ค่าคงที่ที่สามารถปรับได้ใน `logger.component.ts`:

```typescript
private readonly WINDOW_MS = 30 * 60 * 1000;        // 30 minutes rolling window
private readonly INPUT_HZ = 60;                      // Expected input frequency (60Hz)
private readonly LINE_WIDTH_PX = 2;                  // Line width in pixels
private readonly MARKER_RADIUS_PX = 4;               // Marker radius in pixels
```

## Architecture

### Data Flow
1. **WebSocket (60Hz)** → `handleRealtimeMessage()` → `addTelemetryPoint()` → `deckIngestPoint()`
2. **Ingestion (O(1))**: ข้อมูลถูก push เข้า ring buffer (typed arrays) โดยไม่ render
3. **Render Loop**: `requestAnimationFrame` ตรวจสอบ `deckDirty` flag และ render เฉพาะเมื่อมีข้อมูลใหม่

### Ring Buffer
- ใช้ `Float32Array` สำหรับ positions (source/target)
- ใช้ `Uint8Array` สำหรับ colors (RGBA)
- ใช้ `Float64Array` สำหรับ timestamps (สำหรับ trim 30 นาที)
- Ring buffer ขนาด: `MAX_POINTS ≈ INPUT_HZ * 1800 = 108,000` (+ 20% headroom)

### Rendering Modes

**Map Mode (deck.gl + MapLibre):**
- ใช้เมื่อมี `circuitName` ที่ตรงกับ `APP_CONFIG.MAP.CIRCUITS`
- **LineLayer**: แสดงเส้นทางย้อนหลัง 30 นาทีล่าสุด
- **ScatterplotLayer**: แสดง marker ตำแหน่งล่าสุด
- ใช้ `interleaved: true` mode สำหรับ WebGL2 performance
- ไม่มี interaction (`pickable: false`)

**Canvas Mode (Empty Area):**
- ใช้เมื่อไม่มี `circuitName` ที่ตรงกัน
- แสดงพื้นที่เปล่าสีเข้ม (#0e1113) สำหรับลากเส้น
- วาดเส้นและ marker บน HTML5 Canvas
- ใช้ coordinate transformation แบบง่าย (ปรับได้ตามต้องการ)

## Key Features

✅ **60Hz Data Ingestion**: รับข้อมูลต่อเนื่องได้โดยไม่หน่วง  
✅ **60fps Rendering**: Render ลื่นด้วย requestAnimationFrame  
✅ **Rolling 30-minute Window**: แสดงเฉพาะข้อมูล 30 นาทีล่าสุด  
✅ **Memory Bounded**: หน่วยความจำคงที่ (bounded by MAX_POINTS)  
✅ **No GC Pressure**: ใช้ typed arrays และ reusable object arrays  
✅ **Separated Concerns**: แยก ingestion ออกจาก rendering  
✅ **Circuit-based Configuration**: ดึง center ตาม circuitName อัตโนมัติ  
✅ **Fallback Canvas Mode**: แสดงพื้นที่เปล่าสำหรับลากเส้นเมื่อไม่มี circuit match

## Files Modified

- `logger.component.ts`: เพิ่ม deck.gl logic, ring buffer, render loop
- `logger.component.html`: เพิ่ม `#raceMapDeck` container
- `logger.component.scss`: เพิ่ม styles สำหรับ `.race-map-deck`
- `app.config.ts`: เพิ่ม MAP configuration
- `angular.json`: เพิ่ม maplibre-gl CSS

## Dependencies Added

- `maplibre-gl`: MapLibre GL JS library
- `@deck.gl/core`: deck.gl core
- `@deck.gl/layers`: deck.gl layers (LineLayer, ScatterplotLayer)
- `@deck.gl/mapbox`: MapboxOverlay สำหรับ MapLibre

## Testing Checklist

- [ ] รับ 60Hz ต่อเนื่องได้: 30 นาทีแล้ว UI ยังลื่น ไม่หน่วงสะสม
- [ ] หน่วยความจำคงที่ในส่วน map (bounded by MAX_POINTS/MAX_SEGS)
- [ ] ไม่มีการ concat/flat array ของ points ทุกเฟรม
- [ ] deck.gl overlay อัปเดตเฉพาะเมื่อ dirty (มีข้อมูลใหม่)
- [ ] แสดง marker ไหลลื่น และเส้นทางย้อนหลัง 30 นาทีล่าสุดบนจอครบ


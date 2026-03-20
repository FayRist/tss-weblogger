# Login & Session Timeout Guide

เอกสารนี้สรุป flow การ Login และการหมดอายุ session (idle timeout) เพื่อให้ทีมสามารถดูแล/ส่งต่องานได้ง่าย

## เป้าหมายที่ทำแล้ว

- Session มีอายุแบบ idle timeout (Production 4 ชั่วโมง)
- เริ่มนับตั้งแต่ login สำเร็จ (รวม login ครั้งแรก)
- ถ้ามี user action จะต่ออายุ session ใหม่ (sliding window)
- ถ้าไม่มี action ครบ 1 ชั่วโมง จะบังคับกลับหน้า login
- เมื่อ timeout จะแสดง SweetAlert2:
  - `Your connection has timed out. Please log in again.`
- ถ้าเปิดแท็บค้างไว้จนหมดอายุ หรือ refresh หลังหมดอายุ จะถูกบังคับ login ใหม่และแจ้งเตือนเหมือนกัน

## ไฟล์ที่เกี่ยวข้อง

- `src/app/core/auth/auth.service.ts`
- `src/app/core/auth/auth.guard.ts`
- `src/app/core/auth/role.guard.ts`
- `src/app/app.routes.ts`
- `src/app/pages/login/login.component.ts`

## Session Model

ใน `AuthState` มี field เพิ่ม:

- `lastActivityAt` (timestamp ms)
- `expiresAt` (timestamp ms)

ค่าคงที่สำคัญ:

- `SESSION_TIMEOUT_PROD_MS = 4 * 60 * 60 * 1000` (4 ชั่วโมง)
- `SESSION_TIMEOUT_TEST_MS = 1 * 60 * 1000` (1 นาที)
- `USE_TEST_TIMEOUT = true` (ค่าปัจจุบันสำหรับทดสอบ)
- `SESSION_TIMEOUT_MS` จะเลือกจาก test/prod ตาม `USE_TEST_TIMEOUT`
- `ACTIVITY_THROTTLE_MS = 5000`

## เก็บข้อมูลใน Browser

- auth state: `localStorage['auth_state_v2']`
- timeout notice flag: `localStorage['auth_timeout_notice']`

หมายเหตุ:

- ถ้าอ่าน auth state แล้วพบว่า `expiresAt` หมดอายุแล้ว ระบบจะ clear auth และ set timeout notice flag ทันที

## User Activity ที่ใช้ต่ออายุ Session

ระบบต่ออายุ session เฉพาะ user action ตามที่ตกลง:

- `click`
- `keydown`
- `touchstart`
- `scroll`
- `mousemove`
- `NavigationEnd` (เปลี่ยนหน้าในเว็บ)

ถี่เกินไปจะถูก throttle ทุก 5 วินาทีเพื่อไม่เขียน localStorage บ่อยเกินจำเป็น

## Timeout Flow

1. Login สำเร็จ -> บันทึก `lastActivityAt` และ `expiresAt`
2. เริ่ม monitor timer ตาม `expiresAt`
3. ถ้ามี user action -> reset `expiresAt = now + 1h`
4. ถ้าหมดเวลา -> `logoutDueToTimeout()`
5. เคลียร์ session, set timeout flag, redirect `/login?reason=timeout`
6. หน้า login แสดง SweetAlert2 แล้วล้าง query reason

## Route Protection

- Route `/pages` ถูกป้องกันด้วย `authGuard`
- `roleGuard` เช็ค login ก่อนเช็ค role เสมอ

## Dependency

- เพิ่มแพ็กเกจ `sweetalert2`

## วิธีทดสอบแบบ Manual

1. Login แล้วใช้งานต่อเนื่อง (มี click/scroll/key) -> ไม่หลุด
2. Login แล้วไม่แตะหน้าเว็บจนเกิน 1 ชั่วโมง -> ถูกพาไป login + เห็น alert
3. เปิดค้างไว้จนหมดเวลา แล้วค่อยกลับมาแตะหน้า -> ถูกพาไป login + เห็น alert
4. Refresh หลังหมดเวลา -> อยู่หน้า login + เห็น alert
5. เปิด `/pages/...` โดยไม่ login -> เข้าไม่ได้ และถูกส่งไปหน้า login

## จุดที่ปรับแต่งได้เร็ว

- ถ้าจะใช้ Production ให้ตั้ง `USE_TEST_TIMEOUT = false` ใน `auth.service.ts`
- ถ้าจะทดสอบเร็ว ให้ตั้ง `USE_TEST_TIMEOUT = true` ใน `auth.service.ts`
- ปรับข้อความ alert ได้ที่ `showTimeoutAlert()` ใน `login.component.ts`
- เพิ่ม/ลด event ที่ถือเป็น activity ได้ที่ `activityEvents` ใน `auth.service.ts`

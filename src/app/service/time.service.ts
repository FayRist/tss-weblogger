// time.service.ts
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TimeService {
  // ✅ ล็อกเวลาไว้ที่ 2025-05-20 13:23:00 เวลาไทย (UTC+7)
  readonly now = signal<Date>(new Date('2025-05-20T13:23:00+07:00'));

  // ❌ ไม่ต้องมี timer ถ้าจะให้ค่านิ่ง
  // private timer = setInterval(() => this.now.set(new Date()), 1000);

  // เผื่ออยากเปลี่ยนตอนรันไทม์
  freezeAt(d: Date) {
    this.now.set(d);
  }

  // ngOnDestroy() {} // ไม่จำเป็นแล้ว
}

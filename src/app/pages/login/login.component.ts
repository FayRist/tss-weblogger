import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { EventService } from '../../service/event.service';
import { TimeService } from '../../service/time.service';

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    // ถ้าไม่มี timezone ให้สมมติเป็นเวลาไทย (+07:00) และเปลี่ยน ' ' เป็น 'T'
    const iso = v.includes('T') || /Z|[+-]\d\d:?\d\d$/.test(v)
      ? v
      : v.replace(' ', 'T') + '+07:00';
    return new Date(iso);
  }
  // number (ms) หรืออย่างอื่น
  return new Date(v as any);
}
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ]
})
export class LoginComponent {
  username = '';
  password = '';
  isLoading = false;
  errorMsg = '';

  private time = inject(TimeService);
  currentTime = this.time.now;
  constructor(private auth: AuthService
    , private router: Router
    , private eventService: EventService
  ) {}

  // ใช้แทน navigateToMainPage() เดิมบนปุ่ม
  navigateToMainPage() {
    this.onSubmit();
  }

  onSubmit() {
    this.errorMsg = '';
    this.isLoading = true;
    const { ok, error } = this.auth.login(this.username.trim(), this.password);
    this.isLoading = false;
    if (!ok) { this.errorMsg = error ?? 'Login failed'; return; }
    // this.router.navigate(['/pages/dashboard']);

    // ส่งเป็น UTC เสมอ
    const now = toDate(this.time.now());
    this.eventService.getLoggerByDate(now).subscribe({
      next: ({ items, count }) => {
          this.router.navigate(['/pages', 'dashboard'], {
            queryParams: { eventId: items[0].eventId, raceId: items[0].idList, segment: items[0].segmentValue, class: items[0].classValue, circuitName: items[0].circuitName, statusRace: 'live'},
          });
      },
      error: (e) => console.error(e),
    });
  }
}

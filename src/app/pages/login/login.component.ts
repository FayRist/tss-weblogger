import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { EventService } from '../../service/event.service';
import { TimeService } from '../../service/time.service';
import { NavigationContextService } from '../../core/navigation/navigation-context.service';
import Swal from 'sweetalert2';

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
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  isLoading = false;
  errorMsg = '';

  private time = inject(TimeService);
  currentTime = this.time.now;
  constructor(private auth: AuthService
    , private router: Router
    , private route: ActivatedRoute
    , private eventService: EventService
    , private navContext: NavigationContextService
  ) {}

  ngOnInit(): void {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    const hasTimeoutNotice = reason === 'timeout' || this.auth.consumeTimeoutNotice();
    if (hasTimeoutNotice) {
      this.showTimeoutAlert();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { reason: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  // ใช้แทน navigateToMainPage() เดิมบนปุ่ม
  navigateToMainPage() {
    this.onSubmit();
  }

  onSubmit() {
    this.errorMsg = '';
    this.isLoading = true;
    this.auth.login(this.username.trim(), this.password).subscribe(({ ok, error }) => {
      this.isLoading = false;
      if (!ok) {
        this.errorMsg = error ?? 'Login failed';
        return;
      }

      // ส่งเป็น UTC เสมอ
      const now = toDate(this.time.now());
      this.eventService.getLoggerByDate(now).subscribe({
        next: ({ items }) => {
          if (!items || items.length === 0) {
            this.navContext.replaceContext({ raceMode: 'history' });
            this.router.navigate(['/pages', 'event']);
            return;
          }
          this.navContext.replaceContext({
            eventId: Number(items[0].eventId),
            raceId: Number(items[0].idList),
            segment: items[0].segmentValue,
            classCode: items[0].classValue,
            circuit: items[0].circuitName,
            raceMode: 'live'
          });
          this.router.navigate(['/pages', 'dashboard']);
        },
        error: (e) => {
          console.error(e);
          this.navContext.replaceContext({ raceMode: 'history' });
          this.router.navigate(['/pages', 'event']);
        },
      });
    });
  }

  private showTimeoutAlert(): void {
    void Swal.fire({
      icon: 'warning',
      title: 'Session Timeout',
      text: 'Your connection has timed out. Please log in again.',
      confirmButtonText: 'OK',
      // allowOutsideClick: false,
      allowEscapeKey: true,
    });
  }
}

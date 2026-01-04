// time.service.ts
import { Injectable, signal, OnDestroy } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TimeService implements OnDestroy {
  readonly now = signal<Date>(new Date());

  private timer = setInterval(() => this.now.set(new Date()), 1000);

  freezeAt(d: Date) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null as any;
    }
    this.now.set(d);
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}

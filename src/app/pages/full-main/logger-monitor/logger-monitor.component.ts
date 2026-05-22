import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NavigationContextService } from '../../../core/navigation/navigation-context.service';
import { EventService } from '../../../service/event.service';
import { WebSocketService } from '../../../service/websocket.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-logger-monitor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './logger-monitor.component.html',
  styleUrl: './logger-monitor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoggerMonitorComponent implements OnInit, OnDestroy {
  loggerId = '';
  carNumber = '';
  firstName = '';
  lastName = '';
  classType = '';

  status: 'online' | 'offline' = 'offline';
  onlineTime: Date | null = null;
  disconnectTime: Date | null = null;
  afr = 0;
  currentCountDetect = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private readonly navContext: NavigationContextService,
    private readonly eventService: EventService,
    private readonly wsService: WebSocketService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const ctx = this.navContext.snapshot;
    this.loggerId = String(ctx.loggerId ?? '').trim();
    if (!this.loggerId) {
      this.router.navigate(['/pages', 'all-logger']);
      return;
    }

    const sub = this.eventService.getDetailLoggerMonitor(this.loggerId, ctx.eventId, ctx.carNBR).subscribe({
      next: (detail) => {
        this.loggerId = String(detail.loggerId ?? this.loggerId);
        this.carNumber = String(detail.carNumber ?? '');
        this.firstName = String(detail.firstName ?? '');
        this.lastName = String(detail.lastName ?? '');
        this.classType = String(detail.classType ?? '');
        this.status = String(detail.status ?? '').toLowerCase() === 'online' ? 'online' : 'offline';
        this.onlineTime = detail.onlineTime ? new Date(detail.onlineTime) : null;
        this.disconnectTime = detail.disconnectTime ? new Date(detail.disconnectTime) : null;
        this.afr = Number(detail.afr ?? 0);
        this.currentCountDetect = Number(detail.currentCountDetect ?? 0);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('getDetailLoggerMonitor error:', err);
      }
    });
    this.subscriptions.push(sub);

    const statusSub = this.wsService.statusList$.subscribe((list) => {
      if (!Array.isArray(list) || list.length === 0) {
        return;
      }
      const target = list.find((x: any) => String(x?.logger_key ?? '').trim() === this.loggerId);
      if (!target) {
        return;
      }
      this.status = String(target?.status ?? '').toLowerCase() === 'online' ? 'online' : 'offline';
      if (target?.online_time) {
        this.onlineTime = new Date(target.online_time);
      }
      if (target?.disconnect_time) {
        this.disconnectTime = new Date(target.disconnect_time);
      }
      if (target?.afr !== undefined && target?.afr !== null && Number.isFinite(Number(target.afr))) {
        this.afr = Number(target.afr);
      }
      if (target?.afr_count !== undefined && target?.afr_count !== null && Number.isFinite(Number(target.afr_count))) {
        this.currentCountDetect = Number(target.afr_count);
      }
      this.cdr.markForCheck();
    });
    this.subscriptions.push(statusSub);

    this.wsService.connectStatus();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.wsService.disconnectStatus();
  }

  goBack(): void {
    this.router.navigate(['/pages', 'all-logger']);
  }
}

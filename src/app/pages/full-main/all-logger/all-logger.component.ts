import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { EventService } from '../../../service/event.service';
import { WebSocketService } from '../../../service/websocket.service';
import { NavigationContextService } from '../../../core/navigation/navigation-context.service';
import { ToastrService } from 'ngx-toastr';
import { LoggerItem } from '../../../model/api-response-model';

type FilterKey = 'all' | 'online' | 'offline';

@Component({
  selector: 'app-all-logger',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  templateUrl: './all-logger.component.html',
  styleUrl: '../dashboard/dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllLoggerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  displayedColumns: string[] = ['carNumber', 'loggerStatus', 'loggerId', 'firstName', 'classType', 'afr', 'countDetect'];
  dataSource = new MatTableDataSource<LoggerItem>([]);

  filterLogger = new FormControl<FilterKey>('all', { nonNullable: true });
  filterLogList: { value: FilterKey; name: string }[] = [
    { value: 'all', name: 'All Logger' },
    { value: 'online', name: 'Online' },
    { value: 'offline', name: 'Offline' },
  ];

  private subscriptions: Subscription[] = [];
  private allLoggers: LoggerItem[] = [];

  constructor(
    private readonly eventService: EventService,
    private readonly wsService: WebSocketService,
    private readonly navContext: NavigationContextService,
    private readonly router: Router,
    private readonly toastr: ToastrService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAllLoggerRows();

    const statusSub = this.wsService.statusList$.subscribe((items) => {
      if (!Array.isArray(items) || items.length === 0) {
        return;
      }

      const statusMap = new Map<string, { status: 'online' | 'offline'; onlineTime?: Date | null; disconnectTime?: Date | null; afrCount?: number; afr?: number }>();
      for (const item of items) {
        const loggerKey = String(item?.logger_key ?? '').trim();
        if (!loggerKey) {
          continue;
        }
        statusMap.set(loggerKey, {
          status: String(item?.status ?? '').toLowerCase() === 'online' ? 'online' : 'offline',
          onlineTime: item?.online_time ? new Date(item.online_time) : null,
          disconnectTime: item?.disconnect_time ? new Date(item.disconnect_time) : null,
          afrCount: Number.isFinite(Number(item?.afr_count)) ? Number(item.afr_count) : undefined,
          afr: Number.isFinite(Number(item?.afr)) ? Number(item.afr) : undefined,
        });
      }

      if (statusMap.size === 0) {
        return;
      }

      this.allLoggers = this.allLoggers.map((logger) => {
        const key = String(logger.loggerId ?? '').trim();
        const statusUpdate = statusMap.get(key);
        if (!statusUpdate) {
          return logger;
        }

        return {
          ...logger,
          loggerStatus: statusUpdate.status,
          status: statusUpdate.status,
          onlineTime: statusUpdate.onlineTime ?? logger.onlineTime,
          disconnectTime: statusUpdate.disconnectTime ?? logger.disconnectTime,
          currentCountDetect: statusUpdate.afrCount ?? logger.currentCountDetect,
          afr: statusUpdate.afr ?? logger.afr,
        };
      });

      this.applyFilter(this.filterLogger.value);
    });
    this.subscriptions.push(statusSub);

    this.wsService.connectStatus();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.wsService.disconnectStatus();
  }

  onSelectChange(event: MatSelectChange): void {
    this.applyFilter(event.value as FilterKey);
  }

  searchFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value ?? '';
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  navigateToLoggerDetail(loggerId: any, carNBR: any): void {
    const loggerIdText = String(loggerId ?? '').trim();
    if (!loggerIdText) {
      this.toastr.warning('ไม่พบ logger id', 'Info');
      return;
    }

    this.navContext.patchContext({
      loggerId: loggerIdText,
      carNBR: String(carNBR ?? ''),
      raceMode: 'live',
    });
    this.router.navigate(['/pages', 'logger-monitor']);
  }

  getStatusTime(item: LoggerItem): Date | null {
    if ((item.status ?? item.loggerStatus ?? '').toString().toLowerCase() === 'online') {
      return item.onlineTime ?? null;
    }
    return item.disconnectTime ?? null;
  }

  private loadAllLoggerRows(): void {
    const sub = this.eventService.getLoggersWithAfr({ statusRace: 'live' }).subscribe({
      next: (rows) => {
        this.allLoggers = (rows ?? []).map((logger) => ({
          ...logger,
          loggerStatus: 'offline',
          status: 'offline',
          currentCountDetect: Number(logger.currentCountDetect ?? 0),
        }));

        this.applyFilter(this.filterLogger.value);
      },
      error: (err) => {
        console.error('Error loading all logger rows:', err);
      }
    });
    this.subscriptions.push(sub);
  }

  private applyFilter(filter: FilterKey): void {
    let rows = [...this.allLoggers];
    if (filter === 'online') {
      rows = rows.filter((r) => (r.status ?? r.loggerStatus ?? '').toString().toLowerCase() === 'online');
    } else if (filter === 'offline') {
      rows = rows.filter((r) => (r.status ?? r.loggerStatus ?? '').toString().toLowerCase() !== 'online');
    }

    rows.sort((a, b) => Number(a.carNumber) - Number(b.carNumber));
    this.dataSource.data = rows;
    this.cdr.markForCheck();
  }
}

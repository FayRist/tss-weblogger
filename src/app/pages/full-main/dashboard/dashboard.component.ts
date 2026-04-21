import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatCardModule} from '@angular/material/card';
import {MatChipsModule} from '@angular/material/chips';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { LoggerModel } from '../../../model/season-model';
import { ResetWarningLoggerComponent } from './reset-warning-logger/reset-warning-logger.component';
import { MatDialog } from '@angular/material/dialog';
import { EventService } from '../../../service/event.service';
import { ToastrService } from 'ngx-toastr';
import { merge, Subscription, startWith } from 'rxjs';
import { formControlWithInitial } from '../../../utility/rxjs-utils';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { CommonModule } from '@angular/common';
import { LoggerItem } from '../../../model/api-response-model';
import { TimeService } from '../../../service/time.service';
import { APP_CONFIG, getApiWebSocket } from '../../../app.config';
import { createWebSocketConnection, WebSocketConnection } from '../../../utility/websocket-connection.util';
import { AuthService } from '../../../core/auth/auth.service';
import { NavigationContextService } from '../../../core/navigation/navigation-context.service';
import Swal from 'sweetalert2';
import { RaceConfigMode, RaceConfigSource } from '../../../model/api-race-config-snapshot.model';

type FilterKey = 'all' | 'allWarning' | 'allSmokeDetect' | 'excludeSmokeDetect';
type AfrSeverity = 'normal' | 'warning' | 'penalty';

interface AfrRuleConfig {
  penaltyLow: number;
  warningHigh: number;
  warningSeconds: number;
  penaltySeconds: number;
  warningsPerPenalty: number;
  penaltyAlsoIncrementsWarning: boolean;
}

interface LoggerAlertState {
  lastSeverity: AfrSeverity;
  lastWarningCount: number;
  lastNotifiedAt: number;
  warningNotifications: number;
  penaltyNotifications: number;
}

interface LoggerRowHighlightState {
  severity: Exclude<AfrSeverity, 'normal'>;
  expiresAt: number;
}

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
  selector: 'app-dashboard',
  imports: [MatCardModule, MatChipsModule, MatProgressBarModule, MatPaginatorModule, CommonModule
    , MatIconModule ,MatBadgeModule, MatButtonModule, MatToolbarModule, MatTableModule
    , FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule
    , MatSlideToggleModule, MatMenuModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private subscriptions: Subscription[] = [];
  private reactiveUiSubscription: Subscription | null = null;
  private lastDashboardContextKey = '';
  private loggerLoadSequence = 0;

  private wsStatusConnection: WebSocketConnection | null = null;
    // WebSocket สำหรับ logger status
  private wsStatus: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 3000; // 3 seconds
  private reconnectTimeout: any = null;



  allLoggers: LoggerItem[] = [ ];
  readonly dialog = inject(MatDialog);
  onShowAllLoggers: LoggerItem[] = []
  countMax: number = 0;
  afrRuleConfig: AfrRuleConfig = {
    penaltyLow: 14.0,
    warningHigh: 16.0,
    warningSeconds: 1.0,
    penaltySeconds: 3.0,
    warningsPerPenalty: 3,
    penaltyAlsoIncrementsWarning: true,
  };
  private readonly alertCooldownMs = 8000;
  private readonly maxRepeatedAlertsPerSeverity = 2;
  private readonly loggerAlertState = new Map<number, LoggerAlertState>();
  private readonly warningHighlightHoldMs = 7000;
  private readonly penaltyHighlightHoldMs = 10000;
  private readonly loggerRowHighlightState = new Map<number, LoggerRowHighlightState>();

  configAFR: any;
  configSource: RaceConfigSource = 'global';

  sortStatus:string = '';
  showRoutePath: boolean = true;
  isSortLocked: boolean = false; // สถานะล็อคตำแหน่งการ sort
  lockedLoggersSnapshot: LoggerItem[] | null = null; // เก็บ snapshot ของตำแหน่งที่ล็อค

  displayedColumns: string[] = [
    'carNumber',
    'loggerStatus',
    'loggerId',
    'firstName',
    'classType',
    'afr',
    'countDetect',
    'resetLimit'
  ];

  dataSource = new MatTableDataSource<LoggerItem>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  filterLogList: any[] = [
    {
      name: 'Logger ทั้งหมด',
      value: 'all'
    },{
      name: 'เฉพาะ ควันดำ',
      value: 'allSmokeDetect'
    },{
      name: 'ยกเว้น ควันดำ',
      value: 'excludeSmokeDetect'
    }
  ];
  filterLogger = new FormControl<FilterKey>('all', { nonNullable: true });
  private _formBuilder = inject(FormBuilder);
  isChecked = true;
  formGroup = this._formBuilder.group({
    sortType: [true, Validators.requiredTrue],
    sortLoggerType: [true, Validators.requiredTrue],
  });

  private time = inject(TimeService);
  currentTime = this.time.now;

  constructor(
    private router: Router,
    private eventService: EventService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private auth: AuthService,
    private navContext: NavigationContextService
  ) {}

  isReadOnlyRaceTeamUser(): boolean {
    return this.auth.current?.role === 'race_team_user';
  }

  private isAdminOrMechanicUser(): boolean {
    const role = this.auth.current?.role;
    return role === 'admin' || role === 'super_admin' || role === 'mechanic_user';
  }

  isSuperAdminUser(): boolean {
    return this.auth.current?.role === 'super_admin';
  }

  getConfigSourceLabel(): string {
    if (this.configSource === 'snapshot') return 'Config Source: Snapshot';
    if (this.configSource === 'global_fallback') return 'Config Source: Global (Fallback)';
    return 'Config Source: Global';
  }

  getConfigSourceClass(): string {
    if (this.configSource === 'snapshot') return 'source-snapshot';
    if (this.configSource === 'global_fallback') return 'source-fallback';
    return 'source-global';
  }

  loadAndApplyConfig(mode: RaceConfigMode, raceId: number): void {
    const sub = this.eventService.getRaceConfigSnapshot(raceId, mode).subscribe({
      next: (response) => {
        this.configSource = response.source;
        this.applyAfrConfigFromSnapshot(response.config);
      },
      error: (error) => {
        console.error('Error loading AFR config snapshot:', error);
        this.configSource = mode === 'history' ? 'global_fallback' : 'global';
        this.afrRuleConfig = {
          penaltyLow: 14.0,
          warningHigh: 16.0,
          warningSeconds: 1.0,
          penaltySeconds: 3.0,
          warningsPerPenalty: 3,
          penaltyAlsoIncrementsWarning: true,
        };
        this.countMax = 3;
      }
    });
    this.subscriptions.push(sub);
  }

  private sortLoggers(loggers: LoggerItem[]): LoggerItem[] {
    const now = Date.now();
    return [...loggers].sort((a, b) => {
      // 1. penalty ขึ้นก่อนเสมอ
      const penaltyPriorityA = this.getPenaltyPriorityForSort(a, now);
      const penaltyPriorityB = this.getPenaltyPriorityForSort(b, now);
      if (penaltyPriorityA !== penaltyPriorityB) {
        return penaltyPriorityB - penaltyPriorityA;
      }

      // 2. เรียงตาม Count (currentCountDetect) จากมากไปน้อย
      const countA = a.currentCountDetect ?? 0;
      const countB = b.currentCountDetect ?? 0;
      if (countA !== countB) {
        return countB - countA; // มาก→น้อย
      }

      // 3. เรียงตาม Status (online ก่อน offline)
      const statusA = (a.status ?? a.loggerStatus ?? '').toString().toLowerCase().trim();
      const statusB = (b.status ?? b.loggerStatus ?? '').toString().toLowerCase().trim();
      const isOnlineA = statusA === 'online' ? 1 : 0;
      const isOnlineB = statusB === 'online' ? 1 : 0;
      if (isOnlineA !== isOnlineB) {
        return isOnlineB - isOnlineA; // online (1) ก่อน offline (0)
      }

      // 4. ถ้าเป็น offline ทั้งคู่ ให้รายการที่เวลา onlineTime ใหม่กว่าแสดงก่อน
      if (isOnlineA === 0 && isOnlineB === 0) {
        const timeA = a.onlineTime ? toDate(a.onlineTime).getTime() : 0;
        const timeB = b.onlineTime ? toDate(b.onlineTime).getTime() : 0;
        if (timeA !== timeB) {
          return timeB - timeA; // ใหม่→เก่า
        }
      }

      // 5. เรียงตาม NBR. (carNumber) จากน้อยไปมาก
      const carNumA = Number(a.carNumber) || 0;
      const carNumB = Number(b.carNumber) || 0;
      return carNumA - carNumB; // น้อย→มาก
    });
  }

  updateView(allLoggers: LoggerItem[] = []): void {
    const filter = this.filterLogger.value ?? 'all';
    this.syncRowHighlightState(allLoggers);

    // ถ้าล็อคตำแหน่งอยู่ ให้ใช้ snapshot และอัปเดตข้อมูลจาก allLoggers แต่คงตำแหน่งเดิม
    if (this.isSortLocked && this.lockedLoggersSnapshot) {
      // สร้าง Map จาก allLoggers เพื่อค้นหาข้อมูลล่าสุด
      const loggerMap = new Map<number, LoggerItem>();
      allLoggers.forEach(logger => {
        loggerMap.set(logger.loggerId, logger);
      });

      // อัปเดตข้อมูลใน snapshot แต่คงตำแหน่งเดิม
      const updatedSnapshot = this.lockedLoggersSnapshot.map(lockedLogger => {
        const latestLogger = loggerMap.get(lockedLogger.loggerId);
        if (latestLogger) {
          // อัปเดตข้อมูลจาก allLoggers แต่คงตำแหน่งเดิม
          return {
            ...latestLogger,
            // เก็บตำแหน่งเดิมไว้
          };
        }
        return lockedLogger;
      });

      const filteredSnapshot = this.filterLoggers(updatedSnapshot, filter);

      this.onShowAllLoggers = filteredSnapshot;
      this.lockedLoggersSnapshot = filteredSnapshot; // อัปเดต snapshot
      this.dataSource.data = this.onShowAllLoggers;
      return;
    }

    // FILTER
    let filtered = this.filterLoggers(allLoggers, filter);

    // SORT: penalty ขึ้นก่อน / Count (มาก→น้อย) / Status(online→offline) / offline onlineTime(ใหม่→เก่า) / NBR. (น้อย→มาก)
    filtered = this.sortLoggers(filtered);

    // อัปเดต list ให้เป็นอาเรย์ใหม่ทุกครั้ง เพื่อให้ OnPush จับได้
    this.onShowAllLoggers = filtered;
    this.sortStatus = 'Penalty↑ / Count↓ / Status(online→offline) / OfflineTime↓ / NBR.↑';
    this.dataSource.data = this.onShowAllLoggers;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.disconnectWebSocket();
  }

  parameterRaceId:any = null;
  parameterEventId:any = null;
  parameterSegment:any = null;
  parameterClass:any = null;
  circuitName:string = '';
  statusRace:string = '';

  ngOnInit() {
    if (this.isReadOnlyRaceTeamUser()) {
      this.displayedColumns = this.displayedColumns.filter((col) => col !== 'resetLimit');
    }

    this.filterLogger.setValue('all', { emitEvent: false });
    this.applyFilter('all');

    if (!this.reactiveUiSubscription) {
      this.reactiveUiSubscription = merge(
        formControlWithInitial(this.filterLogger),
        formControlWithInitial(this.formGroup.get('sortType') as FormControl)
      ).subscribe(() => {
        this.updateView(this.allLoggers);
        this.cdr.markForCheck();
      });
      this.subscriptions.push(this.reactiveUiSubscription);
    }

    const contextSub = this.navContext.context$.subscribe(ctx => {
      this.parameterRaceId = Number(ctx.raceId ?? 0);
      this.parameterEventId = Number(ctx.eventId ?? 0);
      this.parameterSegment = ctx.segment ?? '';
      this.parameterClass = ctx.classCode ?? '';
      this.circuitName = ctx.circuit ?? '';
      this.statusRace = ctx.raceMode ?? 'live';

      const contextKey = [
        this.parameterRaceId,
        this.parameterEventId,
        this.parameterSegment,
        this.parameterClass,
        this.circuitName,
        this.statusRace,
      ].join('|');

      if (contextKey === this.lastDashboardContextKey) {
        return;
      }
      this.lastDashboardContextKey = contextKey;

      this.loadAndApplyConfig(this.statusRace === 'history' ? 'history' : 'live', this.parameterRaceId);

      const apiStatusRace = this.statusRace === 'history' ? 'history' : 'live';
      this.filterLogger.setValue('all', { emitEvent: false });
      this.applyFilter('all');

      this.disconnectWebSocket();

      if(!this.parameterRaceId && !this.parameterSegment && !this.parameterClass){
        const now = toDate(this.time.now());
          // this.eventService.getLoggerByDate(now).subscribe({
          //   next: ({ items, count }) => {

          //     this.allLoggers;
          //     // this.loggers = items.sort((a, b) => Number(a.carNumber) - Number(b.carNumber));
          //     // this.total = count;
          //     // this.dataSource.data = this.loggers;
          //   },
          //   error: (e) => console.error(e),
          // });
      }else{
        const currentSequence = ++this.loggerLoadSequence;
        // >>> ยิง service แบบที่ backend ต้องการ: ?race_id=xxx&event_id=yyy&circuit_name=zzz
        const sub = this.eventService
          .getLoggersWithAfr({
            raceId: this.parameterRaceId,
            eventId: this.parameterEventId,
            circuitName: this.circuitName,
            statusRace: apiStatusRace
          })
          .subscribe({
          next: (loggerRes) => {
            if (currentSequence !== this.loggerLoadSequence) {
              return;
            }
            this.allLoggers = loggerRes ?? [];
            this.allLoggers = this.allLoggers.map(logger => ({
                ...logger,
                onlineTime: (logger.onlineTime && logger.disconnectTime && logger.onlineTime > logger.disconnectTime)? logger.onlineTime : logger.disconnectTime
              }));
            this.updateView(this.allLoggers);
            this.cdr.markForCheck();
            // เชื่อมต่อ WebSocket เฉพาะในโหมด live เท่านั้น
            if ((this.statusRace || 'live').toLowerCase() === 'live') {
              this.connectWebSocket();
            } else {
              // ในโหมด history ให้แน่ใจว่าไม่มีการเชื่อมต่อ WS ค้างอยู่
              this.disconnectWebSocket();
            }
          },
          error: (err) => console.error('Error loading logger list:', err)
        });
        this.subscriptions.push(sub);

        this.sortStatus = 'Penalty↑ / Count↓ / Status(online→offline) / OfflineTime↓ / NBR.↑';
      }
    });
    this.subscriptions.push(contextSub);
  }

  onSelectChange(event: MatSelectChange) {
    const value = event.value as FilterKey;
    this.applyFilter(value);
  }

  private applyFilter(value: FilterKey) {
    // ถ้าล็อคตำแหน่งอยู่ ให้ใช้ updateView เพื่อจัดการ snapshot
    if (this.isSortLocked && this.lockedLoggersSnapshot) {
      this.updateView(this.allLoggers);
      return;
    }

    const filtered = this.filterLoggers(this.allLoggers, value);
    // เรียงลำดับข้อมูลตามที่กำหนด
    this.onShowAllLoggers = this.sortLoggers(filtered);
    this.dataSource.data = this.onShowAllLoggers;
  }

  searchFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value ?? '';
    const keyword = filterValue.trim().toLowerCase();
    this.dataSource.filter = keyword;

    if (keyword) {
      const matchedResults = this.dataSource.data
        .map((element) => {
          const matchedValues = [
            { field: 'carNumber', value: String(element.carNumber ?? '') },
            { field: 'loggerId', value: String(element.loggerId ?? '') },
            { field: 'firstName', value: String(element.firstName ?? '') },
            { field: 'lastName', value: String(element.lastName ?? '') },
          ].filter((item) => item.value.toLowerCase().includes(keyword));

          return matchedValues.length > 0
            ? {
                loggerId: element.loggerId,
                carNumber: element.carNumber,
                matchedValues,
              }
            : null;
        })
        .filter((item): item is { loggerId: number; carNumber: string; matchedValues: { field: string; value: string }[] } => item !== null);

      console.log('[Dashboard Search] keyword:', keyword);
      console.log('[Dashboard Search] matched results:', matchedResults);
    } else {
      console.log('[Dashboard Search] cleared keyword');
    }

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  private filterLoggers(loggers: LoggerItem[], filter: FilterKey): LoggerItem[] {
    switch (filter) {
      case 'all':
        return loggers;
      case 'allSmokeDetect':
        return loggers.filter(l => (l.currentCountDetect ?? 0) > 0);
      case 'excludeSmokeDetect':
        return loggers.filter(l => (l.currentCountDetect ?? 0) === 0);
      default:
        return loggers;
    }
  }

  applyAfrConfig(configRows: any[]): void {
    const byCode = new Map<string, string>();
    (configRows ?? []).forEach((row: any) => {
      const code = String(row?.form_code ?? '').trim();
      const value = String(row?.value ?? '').trim();
      if (code) {
        byCode.set(code, value);
      }
    });

    const readNumber = (code: string, fallback: number): number => {
      const raw = byCode.get(code);
      const val = Number(raw);
      return Number.isFinite(val) ? val : fallback;
    };

    const readBoolean = (code: string, fallback: boolean): boolean => {
      const raw = (byCode.get(code) ?? '').toLowerCase();
      if (raw === 'true' || raw === '1') return true;
      if (raw === 'false' || raw === '0') return false;
      return fallback;
    };

    this.countMax = readNumber('max_count', 3);
    const penaltyLow = readNumber('afr_penalty_low', readNumber('limit_afr', 14.0));
    const warningHigh = readNumber('afr_warning_high', 16.0);

    this.afrRuleConfig = {
      penaltyLow,
      warningHigh: warningHigh > penaltyLow ? warningHigh : penaltyLow + 0.1,
      warningSeconds: readNumber('afr_warning_seconds', 1.0),
      penaltySeconds: readNumber('afr_penalty_seconds', 3.0),
      warningsPerPenalty: Math.max(1, Math.floor(readNumber('afr_warnings_per_penalty', 3))),
      penaltyAlsoIncrementsWarning: readBoolean('afr_penalty_also_increments_warning', true),
    };
  }

  private getAfrSeverity(afr: number | null | undefined): AfrSeverity {
    if (!Number.isFinite(afr)) {
      return 'normal';
    }

    const value = Number(afr);
    if (value < this.afrRuleConfig.penaltyLow) {
      return 'penalty';
    }
    if (value >= this.afrRuleConfig.penaltyLow && value < this.afrRuleConfig.warningHigh) {
      return 'warning';
    }
    return 'normal';
  }

  private applyAfrConfigFromSnapshot(config: any): void {
    const toNum = (v: unknown, fallback: number): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    const penaltyLow = toNum(config?.afr_penalty_low, 14.0);
    const warningHighRaw = toNum(config?.afr_warning_high, 16.0);
    const warningHigh = warningHighRaw > penaltyLow ? warningHighRaw : penaltyLow + 0.1;

    this.countMax = Math.max(1, Math.floor(toNum(config?.max_count, 3)));
    this.afrRuleConfig = {
      penaltyLow,
      warningHigh,
      warningSeconds: toNum(config?.afr_warning_seconds, toNum(config?.time_count, 1.0)),
      penaltySeconds: toNum(config?.afr_penalty_seconds, 3.0),
      warningsPerPenalty: Math.max(1, Math.floor(toNum(config?.afr_warnings_per_penalty, 3))),
      penaltyAlsoIncrementsWarning: this.toBool(config?.afr_penalty_also_increments_warning, true),
    };
  }

  private toBool(v: unknown, fallback: boolean): boolean {
    if (typeof v === 'boolean') return v;
    const s = String(v ?? '').toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
    return fallback;
  }

  private getValidAfrValue(item: LoggerItem): number | null {
    const status = (item.status ?? item.loggerStatus ?? '').toString().trim().toLowerCase();
    if (status !== 'online') {
      return null;
    }

    const rawAfr = item.afr;
    if (rawAfr == null) {
      return null;
    }

    const afr = Number(rawAfr);
    if (!Number.isFinite(afr) || afr <= 0) {
      return null;
    }

    return afr;
  }

  private getLoggerId(item: LoggerItem): number | null {
    const loggerId = Number(item.loggerId);
    if (!Number.isFinite(loggerId) || loggerId <= 0) {
      return null;
    }
    return loggerId;
  }

  private cleanupExpiredRowHighlightState(now: number): void {
    for (const [loggerId, state] of this.loggerRowHighlightState.entries()) {
      if (state.expiresAt <= now) {
        this.loggerRowHighlightState.delete(loggerId);
      }
    }
  }

  private getLiveAfrSeverity(item: LoggerItem): AfrSeverity {
    const afr = this.getValidAfrValue(item);
    if (afr == null) {
      return 'normal';
    }
    return this.getAfrSeverity(afr);
  }

  private upsertRowHighlightState(item: LoggerItem, now: number): void {
    const loggerId = this.getLoggerId(item);
    if (loggerId == null) {
      return;
    }

    const severity = this.getLiveAfrSeverity(item);
    const prev = this.loggerRowHighlightState.get(loggerId);
    const prevActive = !!prev && prev.expiresAt > now;

    if (severity === 'penalty') {
      const expiresAt = now + this.penaltyHighlightHoldMs;
      this.loggerRowHighlightState.set(loggerId, {
        severity: 'penalty',
        expiresAt: prevActive ? Math.max(prev.expiresAt, expiresAt) : expiresAt,
      });
      return;
    }

    if (severity === 'warning') {
      if (prevActive && prev?.severity === 'penalty') {
        return;
      }
      const expiresAt = now + this.warningHighlightHoldMs;
      this.loggerRowHighlightState.set(loggerId, {
        severity: 'warning',
        expiresAt: prevActive ? Math.max(prev.expiresAt, expiresAt) : expiresAt,
      });
    }
  }

  private getDisplaySeverity(item: LoggerItem, now: number): AfrSeverity {
    const loggerId = this.getLoggerId(item);
    if (loggerId != null) {
      const sticky = this.loggerRowHighlightState.get(loggerId);
      if (sticky) {
        if (sticky.expiresAt > now) {
          return sticky.severity;
        }
        this.loggerRowHighlightState.delete(loggerId);
      }
    }

    return this.getLiveAfrSeverity(item);
  }

  private getPenaltyPriorityForSort(item: LoggerItem, now: number): number {
    const severity = this.getDisplaySeverity(item, now);
    return severity === 'penalty' ? 1 : 0;
  }

  private syncRowHighlightState(loggers: LoggerItem[]): void {
    const now = Date.now();
    this.cleanupExpiredRowHighlightState(now);
    for (const item of loggers) {
      this.upsertRowHighlightState(item, now);
    }
  }

  getRowClass(item: LoggerItem): string {
    const severity = this.getDisplaySeverity(item, Date.now());
    if (severity === 'penalty') {
      return 'row-penalty';
    }
    if (severity === 'warning') {
      return 'row-warning';
    }
    return '';
  }

  private maybeNotifyAfrCondition(item: LoggerItem): void {
    if ((this.statusRace || 'live').toLowerCase() !== 'live') {
      return;
    }

    const loggerId = Number(item.loggerId);
    if (!Number.isFinite(loggerId) || loggerId <= 0) {
      return;
    }

    const afr = this.getValidAfrValue(item);
    if (afr == null) {
      this.loggerAlertState.delete(loggerId);
      return;
    }

    const severity = this.getAfrSeverity(afr);
    const warningCount = Number(item.currentCountDetect ?? 0);
    const now = Date.now();
    const prev = this.loggerAlertState.get(loggerId) ?? {
      lastSeverity: 'normal' as AfrSeverity,
      lastWarningCount: 0,
      lastNotifiedAt: 0,
      warningNotifications: 0,
      penaltyNotifications: 0,
    };

    if (severity === 'normal') {
      this.loggerAlertState.delete(loggerId);
      return;
    }

    const cooldownPassed = (now - prev.lastNotifiedAt) >= this.alertCooldownMs;
    const severityChanged = prev.lastSeverity !== severity;

    const nbr = item.carNumber || '-';
    const afrText = Number.isFinite(afr) ? afr.toFixed(2) : '-';

    if (severity === 'penalty') {
      if (prev.penaltyNotifications >= this.maxRepeatedAlertsPerSeverity) {
        this.loggerAlertState.set(loggerId, {
          ...prev,
          lastSeverity: severity,
          lastWarningCount: warningCount,
        });
        return;
      }

      if (!severityChanged && !cooldownPassed) {
        return;
      }

      const message = `NBR ${nbr} ค่า AFR ${afrText} ผิด Condition Penalty (AFR < ${this.afrRuleConfig.penaltyLow.toFixed(1)})`;
      this.notifyByRole('penalty', message, nbr);

      this.loggerAlertState.set(loggerId, {
        ...prev,
        lastSeverity: severity,
        lastWarningCount: warningCount,
        lastNotifiedAt: now,
        penaltyNotifications: prev.penaltyNotifications + 1,
      });
    } else {
      const warningCountIncreased = warningCount > prev.lastWarningCount;

      // นับ/แจ้งเตือน warning เฉพาะเมื่อ count เพิ่มจริงเท่านั้น
      // เพื่อให้ "แจ้งเตือน 1 ครั้ง" สอดคล้องกับ "count +1"
      if (!warningCountIncreased) {
        this.loggerAlertState.set(loggerId, {
          ...prev,
          lastSeverity: severity,
          lastWarningCount: warningCount,
        });
        return;
      }

      if (prev.warningNotifications >= this.maxRepeatedAlertsPerSeverity) {
        this.loggerAlertState.set(loggerId, {
          ...prev,
          lastSeverity: severity,
          lastWarningCount: warningCount,
        });
        return;
      }

      if (!severityChanged && !cooldownPassed) {
        return;
      }

      const message = `NBR ${nbr} Warning ครั้งที่ ${warningCount} ด้วยค่า AFR ${afrText} (Condition Warning: ${this.afrRuleConfig.penaltyLow.toFixed(1)} <= AFR < ${this.afrRuleConfig.warningHigh.toFixed(1)})`;
      this.notifyByRole('warning', message, nbr);

      this.loggerAlertState.set(loggerId, {
        ...prev,
        lastSeverity: severity,
        lastWarningCount: warningCount,
        lastNotifiedAt: now,
        warningNotifications: prev.warningNotifications + 1,
      });
    }
  }

  private notifyByRole(severity: 'warning' | 'penalty', message: string, nbr: string): void {
    if (this.isReadOnlyRaceTeamUser()) {
      const isPenalty = severity === 'penalty';
      void Swal.fire({
        title: isPenalty ? 'Penalty Condition' : 'Warning Condition',
        text: message,
        icon: isPenalty ? 'error' : 'warning',
        confirmButtonText: 'รับทราบ',
      });
      return;
    }

    if (!this.isAdminOrMechanicUser()) {
      return;
    }

    if (severity === 'penalty') {
      this.toastr.error(message, `Penalty Alert - NBR ${nbr}`);
    } else {
      this.toastr.warning(message, `Warning Alert - NBR ${nbr}`);
    }
  }

  /** ค่า AFR ที่ใช้แสดง (ล่าสุดก่อน ถ้าไม่มีใช้ค่าเฉลี่ย) */
  getAFRDisplayValue(item: LoggerItem): number | null {
    const v = item.afr ?? item.afrAverage ?? null;
    return v != null ? Number(v) : null;
  }

  ngAfterViewInit(): void {
    this.dataSource.filterPredicate = (element: LoggerItem, filter: string): boolean => {
      const keyword = (filter || '').trim().toLowerCase();
      if (!keyword) {
        return true;
      }

      const searchableFields = [
        String(element.carNumber ?? '').toLowerCase(),
        String(element.loggerId ?? '').toLowerCase(),
        String(element.firstName ?? '').toLowerCase(),
        String(element.lastName ?? '').toLowerCase(),
      ];

      return searchableFields.some((value) => value.includes(keyword));
    };

    this.dataSource.paginator = this.paginator;
  }

  /** Toggle สถานะล็อคตำแหน่งการ sort */
  toggleSortLock() {
    this.isSortLocked = !this.isSortLocked;

    if (this.isSortLocked) {
      // เมื่อล็อค ให้เก็บ snapshot ของตำแหน่งปัจจุบัน
      this.lockedLoggersSnapshot = [...this.onShowAllLoggers]; // deep copy
    } else {
      // เมื่อปลดล็อค ให้ลบ snapshot
      this.lockedLoggersSnapshot = null;

      // เรียงลำดับใหม่ตามปกติ
      this.updateView(this.allLoggers);
    }

    this.cdr.markForCheck();
  }
  onToggleSortCarNumber() {
    // ใช้การเรียงลำดับแบบเดียวกัน (Count → Status → NBR.)
    this.onShowAllLoggers = this.sortLoggers(this.onShowAllLoggers);
    this.dataSource.data = this.onShowAllLoggers;
  }

  get allWarning(): LoggerItem[] {
    return this.allLoggers.filter(x => (x.currentCountDetect ?? 0) > 0);
  }

  navigateToLoggerDetail(LoggerId :any) {
    this.navContext.patchContext({
      raceId: Number(this.parameterRaceId),
      segment: this.parameterSegment,
      classCode: this.parameterClass,
      loggerId: String(LoggerId),
      circuit: this.circuitName,
      raceMode: this.statusRace === 'history' ? 'history' : (this.statusRace === 'prerace' ? 'prerace' : 'live'),
    });
    this.router.navigate(['/pages', 'logger']);
    // this.router.navigate(['logger'], { relativeTo: this.route });
  }

  navigateToResetLogger(enterAnimationDuration: string, exitAnimationDuration: string, modeName:string, loggerID:string): void {
    const dialogRef = this.dialog.open(ResetWarningLoggerComponent, {
      enterAnimationDuration, exitAnimationDuration,
      data: {
        mode: modeName,
        loggerId: loggerID,
        raceId: this.parameterRaceId
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      const success = result && (result === 'success' || (typeof result === 'object' && result.success));
      if (success) {
        const mode = typeof result === 'object' ? result.mode : '';
        const loggerId = typeof result === 'object' ? result.loggerId : '';
        // เคลียร์ค่า Count และ AFR ในตารางให้เป็น 0 ทันที (ก่อน refetch)
        this.allLoggers = this.allLoggers.map(l => {
          const match = mode === 'all' || String(l.loggerId) === String(loggerId);
          if (!match) return l;
          return { ...l, currentCountDetect: 0, afr: 0 };
        });
        this.updateView(this.allLoggers);
        this.cdr.markForCheck();

        this.toastr.success('Reset เรียบร้อย');
        const ctx = this.navContext.snapshot;
        this.parameterRaceId = Number(ctx.raceId ?? 0);
        this.parameterEventId = Number(ctx.eventId ?? 0);
        this.parameterSegment = ctx.segment ?? '';
        this.parameterClass = ctx.classCode ?? '';
        this.circuitName = ctx.circuit ?? '';
        this.statusRace = ctx.raceMode ?? 'live';
        this.filterLogger.setValue('all', { emitEvent: true });
        this.applyFilter('all');
        const apiStatusRace = this.statusRace === 'history' ? 'history' : 'live';
        const sub = this.eventService
          .getLoggersWithAfr({
            raceId: this.parameterRaceId,
            eventId: this.parameterEventId,
            circuitName: this.circuitName,
            statusRace: apiStatusRace
          })
          .subscribe({
          next: (loggerRes) => {
            this.allLoggers = loggerRes ?? [];
            this.updateView(this.allLoggers);
            this.cdr.markForCheck();
          },
          error: (err) => console.error('Error loading logger list:', err)
        });
        this.subscriptions.push(sub);
      }
    });
  }

  /**
   * เชื่อมต่อ WebSocket สำหรับ logger status
   */
  private connectWebSocket(): void {
    // ถ้ามี connection อยู่แล้วและยังเปิดอยู่ ให้ข้าม
    if (this.wsStatus && this.wsStatus.readyState === WebSocket.OPEN) {
      console.log('[WS Status] Already connected');
      return;
    }

    // ถ้ากำลังเชื่อมต่ออยู่ ให้ข้าม
    if (this.wsStatus && this.wsStatus.readyState === WebSocket.CONNECTING) {
      console.log('[WS Status] Already connecting');
      return;
    }

    try {
      const loggersStatusUrl = getApiWebSocket(APP_CONFIG.API.ENDPOINTS.WEB_LOGGER_STATUS)
      console.log('[WS Status] Connecting to:', loggersStatusUrl);
      this.wsStatus = new WebSocket(loggersStatusUrl);

      this.wsStatus.onopen = () => {
        console.log('[WS Status] Connected successfully');
        this.reconnectAttempts = 0;
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      };

      this.wsStatus.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleStatusUpdate(data);
        } catch (error) {
          console.error('[WS Status] Error parsing message:', error, event.data);
        }
      };

      this.wsStatus.onclose = (event) => {
        console.log('[WS Status] Connection closed', event.code, event.reason);
        this.wsStatus = null;
        this.handleReconnect();
      };

      this.wsStatus.onerror = (error) => {
        console.error('[WS Status] Error occurred:', error);
      };

    } catch (error) {
      console.error('[WS Status] Failed to create connection:', error);
      this.handleReconnect();
    }
  }

  /**
   * จัดการการเชื่อมต่อใหม่
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS Status] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    console.log(`[WS Status] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  /**
   * อัปเดต status ของ loggers จาก WebSocket
   */
  private handleStatusUpdate(data: any): void {
    // ตรวจสอบรูปแบบข้อมูลที่ได้รับ
    // อาจเป็น array ของ status objects หรือ object เดียว
    let statusList: any[] = [];

    if (Array.isArray(data)) {
      statusList = data;
    } else if (data && Array.isArray(data.data)) {
      statusList = data.data;
    } else if (data && typeof data === 'object') {
      // ถ้าเป็น object เดียว ให้แปลงเป็น array
      statusList = [data];
    }

    if (statusList.length === 0) {
      return;
    }

    // สร้าง map สำหรับเก็บ status updates พร้อม online_time, disconnect_time และ afr_count
    const statusMap = new Map<string, { status: string; onlineTime?: string; disconnectTime?: string; afrCount?: number; afr?: number }>();
    statusList.forEach((statusItem: any) => {
      const loggerId = statusItem.logger_key || '';
      const status = (statusItem.status || '').toString().toLowerCase().trim();
      if (loggerId && status) {
        statusMap.set(String(loggerId), {
          status: status === 'online' ? 'online' : 'offline',
          onlineTime: statusItem.online_time || undefined,
          disconnectTime: statusItem.disconnect_time || undefined,
          afrCount: statusItem.afr_count !== undefined ? Number(statusItem.afr_count) : undefined,
          afr: statusItem.afr !== undefined && statusItem.afr !== null ? Number(statusItem.afr) : undefined
        });
      }
    });

    if (statusMap.size === 0) {
      return;
    }

    // อัปเดต status ของ loggers แบบ immutable (สร้าง array และ object ใหม่)
    let hasUpdate = false;
    const updatedLoggers = this.allLoggers.map(logger => {
      const loggerIdStr = String(logger.loggerId);
      const statusUpdate = statusMap.get(loggerIdStr);

      if (statusUpdate) {
        const oldStatus = (logger.loggerStatus || logger.status || '').toString().toLowerCase().trim();
        const statusChanged = oldStatus !== statusUpdate.status;
        const onlineTimeChanged = statusUpdate.onlineTime && logger.onlineTime?.toString() !== statusUpdate.onlineTime;
        const disconnectTimeChanged = statusUpdate.disconnectTime && logger.disconnectTime?.toString() !== statusUpdate.disconnectTime;
        const afrCountChanged = statusUpdate.afrCount !== undefined && (logger.currentCountDetect ?? null) !== (statusUpdate.afrCount ?? null);
        const afrChanged = statusUpdate.afr !== undefined && (logger.afr ?? null) !== (statusUpdate.afr ?? null);

        if (statusChanged || onlineTimeChanged || disconnectTimeChanged || afrCountChanged || afrChanged) {
          hasUpdate = true;
          const nextCountDetect = statusUpdate.afrCount !== undefined
            ? statusUpdate.afrCount
            : logger.currentCountDetect;
          // สร้าง object ใหม่แทนการแก้ไขโดยตรง (immutable update)
          const updatedLogger: any = {
            ...logger,
            loggerStatus: statusUpdate.status as 'online' | 'offline',
            status: statusUpdate.status,
            currentCountDetect: nextCountDetect,
            afr: statusUpdate.afr !== undefined ? statusUpdate.afr : logger.afr,
            afrAverage: logger.afrAverage
          };

          // อัพเดท onlineTime ถ้ามี
          if (statusUpdate.onlineTime) {
            updatedLogger.onlineTime = new Date(statusUpdate.onlineTime);
          }

          // อัพเดท disconnectTime ถ้ามี
          if (statusUpdate.disconnectTime) {
            updatedLogger.disconnectTime = new Date(statusUpdate.disconnectTime);
          }

          // อัพเดท currentCountDetect จาก afr_count (real-time)
          this.upsertRowHighlightState(updatedLogger, Date.now());
          this.maybeNotifyAfrCondition(updatedLogger);
          return updatedLogger;
        }
      }
      return logger;
    });

    // ถ้ามีการอัปเดต ให้ refresh view
    if (hasUpdate) {
      // อัปเดต allLoggers ด้วย array ใหม่
      this.allLoggers = updatedLoggers;

      // ถ้าล็อคตำแหน่งอยู่ ให้อัปเดต snapshot แทน
      if (this.isSortLocked && this.lockedLoggersSnapshot) {
        // สร้าง Map จาก allLoggers เพื่อค้นหาข้อมูลล่าสุด
        const loggerMap = new Map<number, LoggerItem>();
        this.allLoggers.forEach(logger => {
          loggerMap.set(logger.loggerId, logger);
        });

        // อัปเดตข้อมูลใน snapshot แต่คงตำแหน่งเดิม
        const updatedSnapshot = this.lockedLoggersSnapshot.map(lockedLogger => {
          const latestLogger = loggerMap.get(lockedLogger.loggerId);
          if (latestLogger) {
            // อัปเดตข้อมูลจาก allLoggers แต่คงตำแหน่งเดิม
            return {
              ...latestLogger,
            };
          }
          return lockedLogger;
        });

        this.lockedLoggersSnapshot = updatedSnapshot;
        this.onShowAllLoggers = updatedSnapshot;
        this.dataSource.data = this.onShowAllLoggers;
      } else {
        // ถ้าไม่ล็อค ให้ทำงานปกติ
        this.updateView(this.allLoggers);
      }

      // ใช้ detectChanges() เพื่อให้อัปเดต view ทันที (เหมาะกับ real-time updates)
      this.cdr.detectChanges();
    }
  }

  /**
   * ปิดการเชื่อมต่อ WebSocket
   */
  private disconnectWebSocket(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.wsStatus) {
      try {
        this.wsStatus.onopen = null;
        this.wsStatus.onmessage = null;
        this.wsStatus.onerror = null;
        this.wsStatus.onclose = null;
        this.wsStatus.close();
      } catch (e) {
        console.warn('[WS Status] Error while closing socket:', e);
      }
      this.wsStatus = null;
    }

    if (this.wsStatusConnection) {
      this.wsStatusConnection.disconnect();
      this.wsStatusConnection = null;
    }
  }

}

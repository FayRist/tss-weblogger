import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatCardModule} from '@angular/material/card';
import {MatChipsModule} from '@angular/material/chips';
import { ActivatedRoute, Router } from '@angular/router';
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
import { merge, startWith, Subscription, take } from 'rxjs';
import { RACE_SEGMENT } from '../../../constants/race-data';
import { parseClassQueryToCombined } from '../../../utility/race-param.util';
import {MatSort, Sort, MatSortModule} from '@angular/material/sort';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { CommonModule } from '@angular/common';
import { LoggerItem } from '../../../model/api-response-model';
import { TimeService } from '../../../service/time.service';
import { APP_CONFIG, getApiWebSocket } from '../../../app.config';

type FilterKey = 'all' | 'allWarning' | 'allSmokeDetect' | 'excludeSmokeDetect';

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
    , MatIconModule ,MatBadgeModule, MatButtonModule, MatToolbarModule, MatTableModule, MatSortModule
    , FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule
    , MatSlideToggleModule, MatMenuModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private _liveAnnouncer = inject(LiveAnnouncer);
  private subscriptions: Subscription[] = [];

  // WebSocket สำหรับ logger status
  private wsStatus: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 3000; // 3 seconds
  private reconnectTimeout: any = null;


  allLoggers: LoggerItem[] = [
    // {
    //   id: 1,
    //   firstName: "ทดสอบ1",
    //   lastName: "Test01",
    //   carNumber: "1",
    //   loggerId: "Client121",
    //   createdDate: new Date(10/9/2025),
    //   numberLimit: 2,
    //   classType: 'PickupA',
    //   warningDetector: false,
    //   loggerStatus: 'offline',
    //   afrAverage: 0,

    // },{
    //   id: 4,
    //   firstName: "ทดสอบ4",
    //   lastName: "Test04",
    //   carNumber: "4",
    //   loggerId: "Client124",
    //   createdDate: new Date(10/9/2025),
    //   numberLimit: 0,
    //   classType: 'PickupA',
    //   warningDetector: false,
    //   loggerStatus: 'offline',
    //   afrAverage: 0,
    // },
  ];
  readonly dialog = inject(MatDialog);
  onShowAllLoggers: LoggerItem[] = []
  countMax: number = 0;

  configAFR: any;

  sortStatus:string = '';
  showRoutePath: boolean = true;

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
  @ViewChild(MatSort) sort!: MatSort;

  filterLogList: any[] = [
    {
      name: 'Logger ทั้งหมด',
      value: 'all'
    },{
      name: 'เฉพาะ ควันคำ',
      value: 'allSmokeDetect'
    },{
      name: 'ยกเว้น ควันคำ',
      value: 'excludeSmokeDetect'
    }
  ];
  filterLogger = new FormControl<FilterKey>('all', { nonNullable: true });
  private wasAllSelected = this.filterLogger.value.includes('all');
  private _formBuilder = inject(FormBuilder);
  filterIsAnd = false;
  isChecked = true;
  formGroup = this._formBuilder.group({
    sortType: [true, Validators.requiredTrue],
    sortLoggerType: [true, Validators.requiredTrue],
  });

  private time = inject(TimeService);
  currentTime = this.time.now;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private eventService: EventService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    this.loadAndApplyConfig();
  }

  async loadAndApplyConfig() {
    const form_code = `max_count, limit_afr`
    const MatchSub = this.eventService.getConfigAdmin(form_code).subscribe(
      config => {
        this.configAFR = [];
        this.configAFR = config;
        this.countMax = Number(this.configAFR.filter((x: { form_code: string; }) => x.form_code == 'max_count')[0].value);
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);
  }

  private sortLoggers(loggers: LoggerItem[]): LoggerItem[] {
    return [...loggers].sort((a, b) => {
      // 1. เรียงตาม Count (countDetect) จากมากไปน้อย
      const countA = a.countDetect ?? 0;
      const countB = b.countDetect ?? 0;
      if (countA !== countB) {
        return countB - countA; // มาก→น้อย
      }

      // 2. เรียงตาม Status (online ก่อน offline)
      const statusA = (a.status ?? a.loggerStatus ?? '').toString().toLowerCase().trim();
      const statusB = (b.status ?? b.loggerStatus ?? '').toString().toLowerCase().trim();
      const isOnlineA = statusA === 'online' ? 1 : 0;
      const isOnlineB = statusB === 'online' ? 1 : 0;
      if (isOnlineA !== isOnlineB) {
        return isOnlineB - isOnlineA; // online (1) ก่อน offline (0)
      }

      // 3. เรียงตาม NBR. (carNumber) จากน้อยไปมาก
      const carNumA = Number(a.carNumber) || 0;
      const carNumB = Number(b.carNumber) || 0;
      return carNumA - carNumB; // น้อย→มาก
    });
  }

  updateView(allLoggers: LoggerItem[] = []): void {
    const filters = this.filterLogger.value ?? ['all'];

    // FILTER
    let filtered = allLoggers.filter(x => this.matchesFilters(x, filters));

    // SORT: เรียงตาม Count (มาก→น้อย) / Status(online→offline) / NBR. (น้อย→มาก)
    filtered = this.sortLoggers(filtered);

    // อัปเดต list ให้เป็นอาเรย์ใหม่ทุกครั้ง เพื่อให้ OnPush จับได้
    this.onShowAllLoggers = filtered;
    this.sortStatus = 'Count↓ / Status(online→offline) / NBR.↑';
    this.dataSource.data = this.onShowAllLoggers;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.disconnectWebSocket();
  }

  parameterRaceId:any = null;
  parameterSegment:any = null;
  parameterClass:any = null;

  ngOnInit() {
    this.parameterRaceId  = Number(this.route.snapshot.queryParamMap.get('raceId') ?? 0);
    this.parameterSegment = this.route.snapshot.queryParamMap.get('segment') ?? '';
    this.parameterClass   = this.route.snapshot.queryParamMap.get('class') ?? ''; // ใช้ชื่อแปรอื่นแทน class
    this.filterLogger.setValue('all', { emitEvent: true });
    this.applyFilter('all');  // ให้แสดงทั้งหมดเป็นค่าเริ่มต้น

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
      const qpSub = this.route.queryParamMap.pipe(take(1)).subscribe(qp => {
        // รองรับทั้ง class=ab | class=a,b | class=pickupa,pickupb | class=a&class=b
        const classMulti = qp.getAll('class');
        const classSingle = qp.get('class');
        const segmentQP = qp.get('segment') || undefined; // เผื่อส่งมาด้วย

        const { classTypes } = parseClassQueryToCombined(
          classMulti.length ? classMulti : classSingle,
          segmentQP // เป็น defaultSegment ถ้า class ไม่ได้พรีฟิกซ์มา
        );

        // >>> ยิง service แบบที่ backend ต้องการ: ?class_type=a&class_type=b
        const sub = this.eventService
          .getLoggersWithAfr({ classTypes, raceId: this.parameterRaceId }) // <-- ใส่ raceId ตรงนี้
          .subscribe({
          next: (loggerRes) => {
            this.allLoggers = loggerRes ?? [];
            // ถ้า raceId === 39 ให้แสดงค่าว่างสำหรับ Name, class และหมายเลขรถ
            if (this.parameterRaceId === 39) {
              this.allLoggers = this.allLoggers.map(logger => ({
                ...logger,
                carNumber: '',
                firstName: '',
                lastName: '',
                classType: ''
              }));
            }
            this.updateView(this.allLoggers);
            this.cdr.markForCheck();
            // เชื่อมต่อ WebSocket หลังจากโหลดข้อมูล loggers แล้ว
            this.connectWebSocket();
          },
          error: (err) => console.error('Error loading logger list:', err)
        });
        this.subscriptions.push(sub);

        // reactive UI เดิม
        const reactSub = merge(
          this.filterLogger.valueChanges.pipe(startWith(this.filterLogger.value)),
          this.formGroup.get('sortType')!.valueChanges.pipe(startWith(this.formGroup.value.sortType))
        ).subscribe(() => {
          this.updateView(this.allLoggers);
          this.cdr.markForCheck();
        });
        this.subscriptions.push(reactSub);

        this.sortStatus = this.formGroup.value.sortType ? 'มาก - น้อย' : 'น้อย - มาก';
      });
      this.subscriptions.push(qpSub);
    }
  }

  onSelectChange(event: MatSelectChange) {
    const value = event.value as FilterKey;
    this.applyFilter(value);
  }

  private applyFilter(value: FilterKey) {
    let filtered: LoggerItem[] = [];
    switch (value) {
      case 'all':
        filtered = this.allLoggers;
        break;
      case 'allSmokeDetect': // มี warning > 1
        filtered = this.allLoggers.filter(l => (l.countDetect ?? 0) > 1);
        break;
      case 'excludeSmokeDetect': // ไม่มี warning เลย
        filtered = this.allLoggers.filter(l => (l.countDetect ?? 0) === 0);
        break;
    }
    // เรียงลำดับข้อมูลตามที่กำหนด
    this.onShowAllLoggers = this.sortLoggers(filtered);
    this.dataSource.data = this.onShowAllLoggers;
  }

  searchFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  private matchesFilters(item: LoggerItem, filters: FilterKey): boolean {
    if (filters.length === 0 || filters.includes('all')) return true;

    const conds: any[] = [];
    if (filters.includes('allSmokeDetect')) conds.push((item.countDetect ?? 0) > 0 && !item.warningDetector);
    if (filters.includes('excludeSmokeDetect')) conds.push(item.countDetect == 0);

    return this.filterIsAnd ? conds.every(Boolean) : conds.some(Boolean);
  }


  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.sortingDataAccessor = (item, property) => {

      switch (property) {
        case 'carNumber': return Number(item.carNumber);
        case 'afr': return Number(item.afrAverage);
        case 'countDetect': return Number(item.countDetect);
        case 'loggerStatus': return (item.loggerStatus + '').toLowerCase() === 'online' ? 1 : 0;
        default: return (item as any)[property];
      }
    };
  }

  /** Announce the change in sort state for assistive technology. */
  announceSortChange(sortState: Sort) {
    // This example uses English messages. If your application supports
    // multiple language, you would internationalize these strings.
    // Furthermore, you can customize the message to add additional
    // details about the values being sorted.
    if (sortState.direction) {
      this._liveAnnouncer.announce(`Sorted ${sortState.direction}ending`);
    } else {
      this._liveAnnouncer.announce('Sorting cleared');
    }
  }
  onToggleSortCarNumber() {
    // ใช้การเรียงลำดับแบบเดียวกัน (Count → Status → NBR.)
    this.onShowAllLoggers = this.sortLoggers(this.onShowAllLoggers);
    this.dataSource.data = this.onShowAllLoggers;
  }

  get allWarning(): LoggerItem[] {
    return this.allLoggers.filter(x => (x.countDetect ?? 0) > 0);
  }

  navigateToLoggerDetail(LoggerId :any) {
    this.router.navigate(['/pages', 'logger'], {
      queryParams: { raceId: this.parameterRaceId, segment: this.parameterSegment, class: this.parameterClass, loggerId: LoggerId }
    });
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
      // console.log('The dialog was closed');
      if(result == 'success'){
        this.toastr.success('Reset ทั้งหมด เรียบร้อย')
        this.parameterRaceId  = Number(this.route.snapshot.queryParamMap.get('raceId') ?? 0);
        this.parameterSegment = this.route.snapshot.queryParamMap.get('segment') ?? '';
        this.parameterClass   = this.route.snapshot.queryParamMap.get('class') ?? ''; // ใช้ชื่อแปรอื่นแทน class
        this.filterLogger.setValue('all', { emitEvent: true });
        this.applyFilter('all');  // ให้แสดงทั้งหมดเป็นค่าเริ่มต้น
        const qpSub = this.route.queryParamMap.pipe(take(1)).subscribe(qp => {
          // รองรับทั้ง class=ab | class=a,b | class=pickupa,pickupb | class=a&class=b
          const classMulti = qp.getAll('class');
          const classSingle = qp.get('class');
          const segmentQP = qp.get('segment') || undefined; // เผื่อส่งมาด้วย

          const { classTypes } = parseClassQueryToCombined(
            classMulti.length ? classMulti : classSingle,
            segmentQP // เป็น defaultSegment ถ้า class ไม่ได้พรีฟิกซ์มา
          );

          // >>> ยิง service แบบที่ backend ต้องการ: ?class_type=a&class_type=b
          const sub = this.eventService
            .getLoggersWithAfr({ classTypes, raceId: this.parameterRaceId }) // <-- ใส่ raceId ตรงนี้
            .subscribe({
            next: (loggerRes) => {
              this.allLoggers = loggerRes ?? [];
              // ถ้า raceId === 39 ให้แสดงค่าว่างสำหรับ Name, class และหมายเลขรถ
              if (this.parameterRaceId === 39) {
                this.allLoggers = this.allLoggers.map(logger => ({
                  ...logger,
                  carNumber: '',
                  firstName: '',
                  lastName: '',
                  classType: ''
                }));
              }
              this.updateView(this.allLoggers);
              this.cdr.markForCheck();
            },
            error: (err) => console.error('Error loading logger list:', err)
          });
          this.subscriptions.push(sub);

          // reactive UI เดิม
          const reactSub = merge(
            this.filterLogger.valueChanges.pipe(startWith(this.filterLogger.value)),
            this.formGroup.get('sortType')!.valueChanges.pipe(startWith(this.formGroup.value.sortType))
          ).subscribe(() => {
            this.updateView(this.allLoggers);
            this.cdr.markForCheck();
          });
          this.subscriptions.push(reactSub);

          this.sortStatus = this.formGroup.value.sortType ? 'มาก - น้อย' : 'น้อย - มาก';
        });
        this.subscriptions.push(qpSub);
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

    // สร้าง map สำหรับเก็บ status updates
    const statusMap = new Map<string, string>();
    statusList.forEach((statusItem: any) => {
      const loggerId = statusItem.logger_key || '';
      const status = (statusItem.status || '').toString().toLowerCase().trim();
      if (loggerId && status) {
        statusMap.set(String(loggerId), status === 'online' ? 'online' : 'offline');
      }
    });

    if (statusMap.size === 0) {
      return;
    }

    // อัปเดต status ของ loggers แบบ immutable (สร้าง array และ object ใหม่)
    let hasUpdate = false;
    const updatedLoggers = this.allLoggers.map(logger => {
      const loggerIdStr = String(logger.loggerId);
      const newStatus = statusMap.get(loggerIdStr);

      if (newStatus) {
        const oldStatus = (logger.loggerStatus || logger.status || '').toString().toLowerCase().trim();
        if (oldStatus !== newStatus) {
          hasUpdate = true;
          // สร้าง object ใหม่แทนการแก้ไขโดยตรง (immutable update)
          return {
            ...logger,
            loggerStatus: newStatus as 'online' | 'offline',
            status: newStatus
          };
        }
      }
      return logger;
    });

    // ถ้ามีการอัปเดต ให้ refresh view
    if (hasUpdate) {
      // อัปเดต allLoggers ด้วย array ใหม่
      this.allLoggers = updatedLoggers;
      this.updateView(this.allLoggers);
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
        this.wsStatus.close();
      } catch (error) {
        console.error('[WS Status] Error closing connection:', error);
      }
      this.wsStatus = null;
    }
    console.log('[WS Status] Disconnected');
  }

}

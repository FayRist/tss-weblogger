import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
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
export class DashboardComponent implements OnInit, AfterViewInit {
  private _liveAnnouncer = inject(LiveAnnouncer);
  private subscriptions: Subscription[] = [];


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
  updateView(allLoggers: LoggerItem[] = []): void {
    const filters = this.filterLogger.value ?? ['all'];

    // FILTER
    let filtered = allLoggers.filter(x => this.matchesFilters(x, filters));

    // SORT
    const desc = !!this.formGroup.value.sortType; // true = มาก→น้อย
    filtered.sort((a, b) => {
      const byWarning = desc ? b.countDetect - a.countDetect : a.countDetect - b.countDetect;
      if (byWarning !== 0) return byWarning;
      const byDetector = Number(b.warningDetector) - Number(a.warningDetector);
      if (byDetector !== 0) return byDetector;
      return a.firstName.localeCompare(b.firstName, 'th');
    });

    // อัปเดต list ให้เป็นอาเรย์ใหม่ทุกครั้ง เพื่อให้ OnPush จับได้
    this.onShowAllLoggers = [...filtered];

    this.formGroup.get('sortLoggerType')?.value;
    this.onShowAllLoggers = [...this.onShowAllLoggers].sort((a, b) => {
      return Number(a.carNumber) - Number(b.carNumber); // ✅ แปลงเป็นตัวเลข
    });
    this.sortStatus = desc ? 'มาก - น้อย' : 'น้อย - มาก';
    this.dataSource.data = this.onShowAllLoggers;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
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
  }

  onSelectChange(event: MatSelectChange) {
    const value = event.value as FilterKey;
    this.applyFilter(value);
  }

  private applyFilter(value: FilterKey) {
    switch (value) {
      case 'all':
        this.onShowAllLoggers = this.allLoggers;
        this.dataSource.data = this.onShowAllLoggers;
        break;
      case 'allSmokeDetect': // มี warning > 1
        this.onShowAllLoggers = this.allLoggers.filter(l => (l.countDetect ?? 0) > 1);
        this.dataSource.data = this.onShowAllLoggers;
        break;
      case 'excludeSmokeDetect': // ไม่มี warning เลย
        this.onShowAllLoggers = this.allLoggers.filter(l => (l.countDetect ?? 0) === 0);
        this.dataSource.data = this.onShowAllLoggers;
        break;
    }
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
    const isSortCarNumber = this.formGroup.get('sortLoggerType')?.value;

    if (isSortCarNumber) {
      this.onShowAllLoggers = [...this.onShowAllLoggers].sort((a, b) => {
        return Number(a.carNumber) - Number(b.carNumber); // ✅ แปลงเป็นตัวเลข
      });
    } else {
      this.onShowAllLoggers = [...this.onShowAllLoggers].sort((a, b) => {
        return Number(b.carNumber) - Number(a.carNumber); // ✅ แปลงเป็นตัวเลข
      });
    }
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

}

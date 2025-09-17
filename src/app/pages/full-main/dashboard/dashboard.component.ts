import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
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

type FilterKey = 'all' | 'allWarning' | 'allSmokeDetect';

@Component({
  selector: 'app-dashboard',
  imports: [MatCardModule, MatChipsModule, MatProgressBarModule
    , MatIconModule ,MatBadgeModule, MatButtonModule, MatToolbarModule
    , FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule
    , MatSlideToggleModule, MatMenuModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private subscriptions: Subscription[] = [];

  allLoggers: LoggerModel[] = [
    {
      id: 1,
      firstName: "ทดสอบ1",
      lastName: "Test01",
      carNumber: "1",
      loggerId: "Client121",
      createdDate: new Date(10/9/2025),
      numberWarning: 2,
      warningDetector: false,

    },{
      id: 4,
      firstName: "ทดสอบ4",
      lastName: "Test04",
      carNumber: "4",
      loggerId: "Client124",
      createdDate: new Date(10/9/2025),
      numberWarning: 0,
      warningDetector: false,
    },
  ];
  readonly dialog = inject(MatDialog);
  onShowAllLoggers: LoggerModel[] = []


  sortStatus:string = '';
  showRoutePath: boolean = true;
  filterLogList: any[] = [
    {
      name: 'Logger ทั้งหมด',
      value: 'all'
    },{
      name: 'เฉพาะ ควันคำ',
      value: 'allSmokeDetect'
    },{
      name: 'เฉพาะ Warning',
      value: 'allWarning'
    }
  ];
  filterLogger = new FormControl<FilterKey[]>(['all'], { nonNullable: true });
  private wasAllSelected = this.filterLogger.value.includes('all');
  private _formBuilder = inject(FormBuilder);
  filterIsAnd = false;
  isChecked = true;
  formGroup = this._formBuilder.group({
    sortType: [true, Validators.requiredTrue],
  });

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private eventService: EventService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
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
      const sub = this.eventService.getLogger({ classTypes }).subscribe({
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

  isAllSelected(): boolean {
    return this.filterLogger.value.includes('all');
  }

  private matchesFilters(item: LoggerModel, filters: FilterKey[]): boolean {
    if (filters.length === 0 || filters.includes('all')) return true;

    const conds: any[] = [];
    if (filters.includes('allWarning')) conds.push(item.numberWarning > 0 && !item.warningDetector);
    if (filters.includes('allSmokeDetect')) conds.push(item.warningDetector === true);

    return this.filterIsAnd ? conds.every(Boolean) : conds.some(Boolean);
  }

  updateView(allLoggers: LoggerModel[] = []): void {
    const filters = this.filterLogger.value ?? ['all'];

    // FILTER
    let filtered = allLoggers.filter(x => this.matchesFilters(x, filters));

    // SORT
    const desc = !!this.formGroup.value.sortType; // true = มาก→น้อย
    filtered.sort((a, b) => {
      const byWarning = desc ? b.numberWarning - a.numberWarning : a.numberWarning - b.numberWarning;
      if (byWarning !== 0) return byWarning;
      const byDetector = Number(b.warningDetector) - Number(a.warningDetector);
      if (byDetector !== 0) return byDetector;
      return a.firstName.localeCompare(b.firstName, 'th');
    });

    // อัปเดต list ให้เป็นอาเรย์ใหม่ทุกครั้ง เพื่อให้ OnPush จับได้
    this.onShowAllLoggers = [...filtered];
    this.sortStatus = desc ? 'มาก - น้อย' : 'น้อย - มาก';
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  // ถ้าเลือก "ทั้งหมด" พร้อมกับตัวอื่น ให้เหลือแค่ "ทั้งหมด"
  onSelectChange(event: MatSelectChange) {
    const values = (event.value || []) as FilterKey[];
    const hadAll = this.wasAllSelected;
    const hasAllNow = values.includes('all');

    if (hasAllNow && values.length > 1) {
      if (hadAll) {
        this.filterLogger.setValue(values.filter(v => v !== 'all'), { emitEvent: false });
      } else {
        this.filterLogger.setValue(['all'], { emitEvent: false });
      }
    }else if(values.length == 0){
      this.filterLogger.setValue(['all'], { emitEvent: false });
    }

    this.wasAllSelected = (this.filterLogger.value ?? values).includes('all');

    // อัปเดตผลทุกครั้งหลังเปลี่ยน
    this.updateView(this.allLoggers);
  }

  get allWarning(): LoggerModel[] {
    return this.allLoggers.filter(x => x.numberWarning > 0);
  }

  onToggleSort(): void {
    const desc = !!this.formGroup.value.sortType; // true = มาก - น้อย
    this.sortStatus = desc ? 'มาก - น้อย' : 'น้อย - มาก';
    this.updateView(this.allLoggers); // 👉 เรียงใหม่ตามสถานะล่าสุด
  }

  navigateToLoggerDetail() {
    this.router.navigate(['/pages', 'logger']);
    // this.router.navigate(['logger'], { relativeTo: this.route });
  }

  navigateToResetLogger(enterAnimationDuration: string, exitAnimationDuration: string): void {
      const dialogRef = this.dialog.open(ResetWarningLoggerComponent, {
      enterAnimationDuration, exitAnimationDuration,
    });
  }
}

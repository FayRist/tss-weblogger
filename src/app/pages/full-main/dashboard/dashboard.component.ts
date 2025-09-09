import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
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
      id: 2,
      firstName: "ทดสอบ2",
      lastName: "Test02",
      carNumber: "2",
      loggerId: "Client122",
      createdDate: new Date(10/9/2025),
      numberWarning: 3,
      warningDetector: false,
    },{
      id: 3,
      firstName: "ทดสอบ3",
      lastName: "Test03",
      carNumber: "3",
      loggerId: "Client123",
      createdDate: new Date(10/9/2025),
      numberWarning: 3,
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

  constructor(private router: Router, private route: ActivatedRoute) {
    // this.allLoggers = this.allLoggers.filter(x => x.matchId == 1);
  }
  ngOnInit() {
    // this.loadEvent();

    this.sortStatus = (this.formGroup.value.sortType)? 'มาก - น้อย':'น้อย - มาก';
    this.updateView();
    // ถ้าอยากอัปเดตอัตโนมัติเมื่อฟอร์มเปลี่ยนค่า:
    this.filterLogger.valueChanges.subscribe(() => this.updateView());
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

  private updateView(): void {
    const filters = this.filterLogger.value ?? ['all'];

    // 1) FILTER
    let filtered = this.allLoggers.filter(x => this.matchesFilters(x, filters));

    filtered.sort((a, b) => {
      // ทิศทางเรียงจากฟอร์ม: true = มาก→น้อย, false = น้อย→มาก
      const desc = !!this.formGroup.value.sortType;

      // 1) เรียงตามจำนวน warning ก่อน (เป็นคีย์หลัก)
      const byWarning = desc
        ? b.numberWarning - a.numberWarning   // มาก→น้อย
        : a.numberWarning - b.numberWarning;  // น้อย→มาก
      if (byWarning !== 0) return byWarning;

      // 2) tie-breaker: ให้ warningDetector=true มาก่อน (เฉพาะตอนจำนวนเท่ากัน)
      const byDetector = Number(b.warningDetector) - Number(a.warningDetector);
      if (byDetector !== 0) return byDetector;

      // 3) tie-breaker สุดท้าย: ชื่อคนขับ (โลแคลไทย)
      return a.firstName.localeCompare(b.firstName, 'th');
    });

    this.onShowAllLoggers = filtered;
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
    this.updateView();
  }

  get allWarning(): LoggerModel[] {
    return this.allLoggers.filter(x => x.numberWarning > 0);
  }

  onToggleSort(): void {
    const desc = !!this.formGroup.value.sortType; // true = มาก - น้อย
    this.sortStatus = desc ? 'มาก - น้อย' : 'น้อย - มาก';
    this.updateView(); // 👉 เรียงใหม่ตามสถานะล่าสุด
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

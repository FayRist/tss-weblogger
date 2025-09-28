import { AfterViewInit, Component, inject, OnInit, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { AddLoggerComponent } from './add-logger/add-logger.component';
import { EditLoggerComponent } from './edit-logger/edit-logger.component';
import { DeleteLoggerComponent } from './delete-logger/delete-logger.component';
import { LoggerModel } from '../../../model/season-model';
import { EventService } from '../../../service/event.service';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { parseClassQueryToCombined } from '../../../utility/race-param.util';
import * as XLSX from 'xlsx';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { CommonModule } from '@angular/common';

// ===== Helper ใช้ร่วมกัน =====
function toDate(v: Date | string | undefined | null): Date | '' {
  if (!v) return '';
  return (v instanceof Date) ? v : new Date(v);
}


interface ExcelRow {
  logger: string;
  nbr: number | string;
  firstname: string;
  lastname: string;
  class: string;
  // team?: string; // ถ้าคุณมี team ให้เปิดบรรทัดนี้
}

interface EventItem {
  event: string;
  startDate: Date | string;
  endDate: Date | string;
  classType: string;
  category: string;
}
export interface DialogLoggerData {
  id: number;
  loggerId: string;
  carNumber: string;
  firstName: string;
  lastName: string;
  classValue: string;
}

@Component({
  selector: 'app-setting-logger',
  imports: [MatCardModule, MatMenuModule, MatSelectModule, MatTableModule, MatSortModule
    , MatPaginatorModule, CommonModule, MatButtonModule, MatIconModule
  ],
  templateUrl: './setting-logger.component.html',
  styleUrl: './setting-logger.component.scss'
})
export class SettingLoggerComponent implements OnInit, AfterViewInit {
  readonly dialog = inject(MatDialog);
  private _liveAnnouncer = inject(LiveAnnouncer);
  private subscriptions: Subscription[] = [];
  loggerData: LoggerModel[] = [];

  dataSource = new MatTableDataSource<LoggerModel>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns: string[] = [
    'carNumber',
    'loggerStatus',
    'loggerId',
    'firstName',
    'classType',
    'afr',
    'numberLimit',
    'resetLimit'
  ];

  allLoggers: LoggerModel[] = [
    {
      id: 1,
      firstName: "ทดสอบ1",
      lastName: "Test01",
      carNumber: "1",
      loggerId: "Client121",
      createdDate: new Date(10 / 9 / 2025),
      numberLimit: 2,
      classType: 'PickupA',
      warningDetector: false,
      loggerStatus: 'offline',
      afrAverage: 15.2,

    }, {
      id: 4,
      firstName: "ทดสอบ4",
      lastName: "Test04",
      carNumber: "4",
      loggerId: "Client124",
      createdDate: new Date(10 / 9 / 2025),
      numberLimit: 0,
      classType: 'PickupA',
      warningDetector: false,
      loggerStatus: 'offline',
      afrAverage: 15.2,

    },
  ];

  // สมมติคุณมีรายการอีเวนต์ 1..n (ถ้าไม่มีให้ส่ง [] ได้)
  eventList: EventItem[] = [
    // { event: 'Thailand Super Pickup', startDate: '2025-06-20 09:00', endDate: '2025-06-22 18:00', classType: 'PickupC', category: 'Race' }
  ];


  constructor(
    // private router: Router, private route: ActivatedRoute,
    private eventService: EventService, private toastr: ToastrService) {

  }
  ngOnInit() {
    this.loadLogger();
  }

  addLogger(enterAnimationDuration: string, exitAnimationDuration: string): void {
    const dialogRef = this.dialog.open(AddLoggerComponent, {
      width: '100vw', maxWidth: '750px',
      enterAnimationDuration, exitAnimationDuration,
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed');
      if (result == 'success') {
        this.loadLogger();
      }
    });
  }

  settingLogger(enterAnimationDuration: string, exitAnimationDuration: string, loggerId: any): void {
    let arrayData = this.allLoggers.filter(x => x.loggerId == loggerId);
    const dialogRef = this.dialog.open(EditLoggerComponent, {
      width: '100vw', maxWidth: '450px',
      enterAnimationDuration, exitAnimationDuration,
      data: {
        id: arrayData[0].id, firstName: arrayData[0].firstName,  lastName: arrayData[0].lastName,
        carNumber: arrayData[0].carNumber, loggerId: arrayData[0].loggerId,
        classValue: arrayData[0].classType
      },
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if (result == 'success') {
        this.toastr.success(`แก้ไขข้ออมูล ${arrayData[0].loggerId} สำเร็จ`);
        this.loadLogger();
      }
    });
  }

  deleteLogger(enterAnimationDuration: string, exitAnimationDuration: string, loggerId: any): void {
    let arrayData = this.allLoggers.filter(x => x.loggerId == loggerId);
    const dialogRef = this.dialog.open(DeleteLoggerComponent, {
      width: '100vw', maxWidth: '350px',
      enterAnimationDuration, exitAnimationDuration,
      data: { loggerId: arrayData[0].loggerId },
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if (result == 'success') {
        this.loadLogger();
        this.toastr.success('แก้ไข Logger เรียบร้อย')

      }
    });
  }

  loadLogger() {
    this.allLoggers = []
    const { classTypes } = parseClassQueryToCombined(
      'abcd',
      'pickup' //
    );

    // >>> ยิง service แบบที่ backend ต้องการ: ?class_type=a&class_type=b
    const sub = this.eventService.getLogger({ classTypes }).subscribe({
      next: (loggerRes) => {
        this.allLoggers = loggerRes ?? [];
        this.allLoggers = [...this.allLoggers].sort((a, b) => {
          return Number(a.carNumber) - Number(b.carNumber); // ✅ แปลงเป็นตัวเลข
        });
        // this.updateView(this.allLoggers);
        // this.cdr.markForCheck();
        this.dataSource.data = this.allLoggers;

      },
      error: (err) => console.error('Error loading logger list:', err)
    });
    this.subscriptions.push(sub);

  }



/** ===========================
 *  ปุ่ม: Export เฉพาะชีต Logger
 *  =========================== */
exportLoggerEx(): void {
  const wb = XLSX.utils.book_new();

  // header ของชีต Logger
  const loggerHeader = [['Number', 'Name', 'Surname', 'Team', 'Class', 'logger']];

  // ดึงจาก dataSource ของตาราง (ปรับ map ให้ตรง field จริงของคุณ)
  const rows = (this.dataSource?.data ?? []).map(l => ([
    l.carNumber ?? '',
    l.firstName ?? '',
    l.lastName ?? '',
    '',        // ถ้าไม่มี team ให้คงค่าว่าง
    // (l.team ?? ''),        // ถ้าไม่มี team ให้คงค่าว่าง
    l.classType ?? '',
    l.loggerId ?? ''       // ถ้าจะ prefix เช่น TSS: `TSS${l.loggerId}`
  ]));

  const ws = XLSX.utils.aoa_to_sheet([...loggerHeader, ...rows]);
  ws['!cols'] = [
    { wch: 8 },  // Number
    { wch: 18 }, // Name
    { wch: 18 }, // Surname
    { wch: 20 }, // Team
    { wch: 12 }, // Class
    { wch: 12 }, // logger
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Logger');
  const fileName = `Logger_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/** ===========================
 *  ปุ่ม: Export เฉพาะชีต Event
 *  =========================== */
exportEventEx(): void {
  const wb = XLSX.utils.book_new();

  // header ของชีต Event
  const eventHeader = [['Event', 'Start Date', 'End Date', 'Class', 'Category']];

  // แปลงรายการ event ของคุณ (ให้เป็น Date object เพื่อให้ Excel เข้าใจว่าเป็นวันเวลา)
  const rows = (this.eventList ?? []).map(e => ([
    e.event ?? '',
    toDate(e.startDate),
    toDate(e.endDate),
    e.classType ?? '',
    e.category ?? ''
  ]));

  const ws = XLSX.utils.aoa_to_sheet([...eventHeader, ...rows], { cellDates: true });
  ws['!cols'] = [
    { wch: 32 }, // Event
    { wch: 20 }, // Start Date
    { wch: 20 }, // End Date
    { wch: 12 }, // Class
    { wch: 16 }, // Category
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Event');
  const fileName = `Event_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // ✅ กำหนดการเข้าถึงค่าที่จะใช้ sort
    this.dataSource.sortingDataAccessor = (item, property) => {

      switch (property) {
        case 'carNumber': return Number(item.carNumber);
        case 'afr': return Number(item.afrAverage);
        case 'numberLimit': return Number(item.numberLimit);
        case 'loggerStatus': return (item.loggerStatus + '').toLowerCase() === 'online' ? 1 : 0;
        default: return (item as any)[property];
      }
    };
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
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
}


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


interface ExcelRow {
  logger: string;
  nbr: number | string;
  firstname: string;
  lastname: string;
  class: string;
  // team?: string; // ถ้าคุณมี team ให้เปิดบรรทัดนี้
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


  exportFileEx() {
    const { classTypes } = parseClassQueryToCombined(
      'abcd',
      'pickup' //
    );

    // >>> ยิง service แบบที่ backend ต้องการ: ?class_type=a&class_type=b
    const sub = this.eventService.getLogger({ classTypes }).subscribe({
      next: (loggerRes) => {
        try {
          // 1) ตรวจว่ามีข้อมูลจากการ import หรือไม่
          const rows: any[] = loggerRes ?? [];
          if (!rows.length) {
            // กรณีไม่มีข้อมูลให้แจ้งเตือน/ตั้ง error ตามที่คุณใช้ในหน้า
            this.toastr.error('ไม่มีข้อมูลสำหรับ Export (กรุณา Import ไฟล์ก่อน)');
            return;
          }

          // 2) จัดเตรียม header ให้ "อ้างอิงชื่อคอลัมน์ตามไฟล์ที่คุณรองรับตอน import"
          //    (Logger, Number, Name, Surname, Class, Team)
          //    ถ้ายังไม่ใช้ team ให้คอมเมนต์ไว้ได้
          const header = ['Logger', 'Number', 'Name', 'Surname', 'Class'/*, 'Team'*/];

          // 3) map ข้อมูลกลับเป็น object ที่ key = header ตามด้านบน
          const exportData = rows.map(r => ({
            Logger: (r.loggerId  ?? '').toString(),
            Number: typeof r.carNumber === 'number' ? r.carNumber : (r.carNumber ?? '').toString(),
            Name: (r.firstName ?? '').toString(),
            Surname: (r.lastName  ?? '').toString(),
            Class: (r.classType ?? '').toString(),
            // Team: (r as any).team ? (r as any).team.toString() : ''
          }));

          // 4) แปลง JSON -> Worksheet และใส่ header ตามลำดับที่ต้องการ
          const ws = XLSX.utils.json_to_sheet(exportData, { header, skipHeader: false });

          // 5) ออปชันเสริม: ตั้งความกว้างคอลัมน์ (auto-fit คร่าวๆ)
          const colWidths = header.map(h => Math.max(
            h.length,
            ...exportData.map(row => (row[h as keyof typeof row] ?? '').toString().length)
          ));
          (ws as any)['!cols'] = colWidths.map(w => ({ wch: Math.min(Math.max(w + 2, 10), 40) })); // 10–40 ตัวอักษร

          // 6) สร้าง Workbook และแนบ Worksheet ลงชีตแรก
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Loggers');

          // 7) ตั้งชื่อไฟล์และสั่งดาวน์โหลด
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          const fileName = `Loggers_${y}${m}${d}.xlsx`;

          XLSX.writeFile(wb, fileName);
        } catch (err) {
          console.error(err);
          this.toastr.error('ไม่สามารถ Export ไฟล์ได้ กรุณาลองใหม่');
        }
      },
      error: (err) => console.error('Error loading logger list:', err)
    });
    this.subscriptions.push(sub);

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


import { AfterViewInit, Component, inject, OnInit, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { AddLoggerComponent } from './add-logger/add-logger.component';
import { EditLoggerComponent } from './edit-logger/edit-logger.component';
import { DeleteLoggerComponent } from './delete-logger/delete-logger.component';
import { LoggerModel } from '../../../model/season-model';
import { EventService } from '../../../service/event.service';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { NavigationContextService } from '../../../core/navigation/navigation-context.service';
import * as XLSX from 'xlsx';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { CommonModule } from '@angular/common';
import { eventModel } from '../../../model/season-model';
import { getRaceStatus, RaceStatus } from '../../../service/race-status.pipe';

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
  teamName: string;
  circuit_name: string;
  event_id: string;
  existingLoggers: Array<{ id: number; loggerId: string; carNumber: string }>;
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
    // 'afr',
    // 'numberLimit',
    'teamName',
    'resetLimit'
  ];

  allLoggers: LoggerModel[] = [  ];

  circuitName: string = '';
  CurrentEventId: any = null;
  selectedEvent: eventModel | null = null;
  canImportLogger = false;
  canExportLogger = false;


  // สมมติคุณมีรายการอีเวนต์ 1..n (ถ้าไม่มีให้ส่ง [] ได้)
  eventList: EventItem[] = [
    // { event: 'Thailand Super Pickup', startDate: '2025-06-20 09:00', endDate: '2025-06-22 18:00', classType: 'PickupC', category: 'Race' }
  ];


  constructor(
    // private router: Router, private route: ActivatedRoute,
    private router: Router,
    private eventService: EventService, private toastr: ToastrService,
    private navContext: NavigationContextService) {

  }
  ngOnInit() {
    const contextSub = this.navContext.context$.subscribe(ctx => {
      this.CurrentEventId = ctx.eventId;
      this.circuitName = ctx.circuit ?? '';
      this.loadLogger(this.circuitName, this.CurrentEventId);
      this.syncSelectedEvent();
    });
    this.subscriptions.push(contextSub);

    const eventSub = this.eventService.getEvent().subscribe({
      next: (events) => {
        const list = events ?? [];
        this.eventList = list.map((e) => ({
          event: e.event_name,
          startDate: e.event_start,
          endDate: e.event_end,
          classType: '',
          category: ''
        }));
        this._eventCache = list;
        this.syncSelectedEvent();
      },
      error: (err) => {
        console.error('Error loading events for setting logger:', err);
        this._eventCache = [];
        this.selectedEvent = null;
        this.canImportLogger = false;
        this.canExportLogger = false;
      }
    });
    this.subscriptions.push(eventSub);
  }

  private _eventCache: eventModel[] = [];

  private syncSelectedEvent(): void {
    const currentId = Number(this.CurrentEventId);
    if (!Number.isFinite(currentId) || currentId <= 0) {
      this.selectedEvent = null;
      this.canImportLogger = false;
      this.canExportLogger = false;
      return;
    }

    this.selectedEvent = this._eventCache.find((eventItem) => Number(eventItem.event_id) === currentId) ?? null;
    this.updateImportExportAvailability();
  }

  private updateImportExportAvailability(): void {
    if (!this.selectedEvent) {
      this.canImportLogger = false;
      this.canExportLogger = false;
      return;
    }

    const status = getRaceStatus(new Date(), this.selectedEvent.event_start, this.selectedEvent.event_end);
    this.canExportLogger = true;
    this.canImportLogger = status !== RaceStatus.Finished;
  }

  addLogger(enterAnimationDuration: string, exitAnimationDuration: string): void {
    const dialogRef = this.dialog.open(AddLoggerComponent, {
      width: '100vw', maxWidth: '750px',
      data: {
        circuit_name: this.circuitName,
        event_id: this.CurrentEventId
      },
      enterAnimationDuration, exitAnimationDuration,
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed');
      if (result == 'success') {
        this.loadLogger(this.circuitName, this.CurrentEventId);
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
        classValue: arrayData[0].classType, teamName: arrayData[0].teamName,
        circuit_name: this.circuitName,
        event_id: this.CurrentEventId,
        existingLoggers: this.allLoggers.map(item => ({
          id: item.id,
          loggerId: item.loggerId,
          carNumber: item.carNumber
        }))
      },
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if (result == 'success') {
        this.toastr.success(`แก้ไขข้อมูล Logger ${arrayData[0].loggerId} สำเร็จ`);
        this.loadLogger(this.circuitName, this.CurrentEventId);
      }
    });
  }

  deleteLogger(enterAnimationDuration: string, exitAnimationDuration: string, loggerId: any): void {
    let arrayData = this.allLoggers.filter(x => x.loggerId == loggerId);
    const dialogRef = this.dialog.open(DeleteLoggerComponent, {
      width: '100vw', maxWidth: '350px',
      enterAnimationDuration, exitAnimationDuration,
      data: {
        id: arrayData[0].id,
        loggerId: arrayData[0].loggerId,
        carNumber: arrayData[0].carNumber,
        circuit_name: this.circuitName,
        event_id: this.CurrentEventId
      },
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if (result == 'success') {
        this.loadLogger(this.circuitName, this.CurrentEventId);
        // this.toastr.success('แก้ไข Logger เรียบร้อย')

      }
    });
  }

  loadLogger(circuitName: string, EventId: number | null) {
    this.allLoggers = []

    // >>> ยิง service แบบที่ backend ต้องการ: ?circuit_name=xxx&event_id=yyy
    const sub = this.eventService.getLoggerSetting({
      circuitName: circuitName,
      eventId: EventId ?? undefined
    }).subscribe({
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
  const loggerHeader = [[
    'Number',
    'Name',
    'Surname',
    'Team',
    'Class',
    'Logger'
  ]];

  // แปลงข้อมูลจาก this.allLoggers เป็น array ของ rows
  const rows = (this.allLoggers ?? []).map(logger => ([
    logger.carNumber ?? '',
    logger.firstName ?? '',
    logger.lastName ?? '',
    logger.teamName ?? '',
    logger.classType ?? '',
    logger.loggerId ?? ''
  ]));

  // สร้าง worksheet รวม header และข้อมูล
  const ws = XLSX.utils.aoa_to_sheet([...loggerHeader, ...rows]);

  // set ความกว้าง column ตามเหมาะสม
  ws['!cols'] = [
    { wch: 10 }, // Number
    { wch: 20 }, // Name
    { wch: 20 }, // Surname
    { wch: 20 }, // Team
    { wch: 12 }, // Class
    { wch: 12 }, // Logger
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Logger');

  const fileName = `Logger_Template_${new Date().toISOString().slice(0,10)}.xlsx`;
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


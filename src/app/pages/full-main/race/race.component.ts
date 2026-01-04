import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {MatInputModule} from '@angular/material/input';
import {MatFormFieldModule} from '@angular/material/form-field';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MaterialModule } from '../../../material.module';
import { EventService } from '../../../service/event.service';
import { Subscription } from 'rxjs';
import { optionModel, RaceModel } from '../../../model/season-model';
import { getQueryParamAsNumber } from '../../../utility/rxjs-utils';
import { AddEventComponent } from '../add-event/add-event.component';
import { CLASS_LIST, RACE_SEGMENT, SESSION_LIST } from '../../../constants/race-data';
import { ToastrService } from 'ngx-toastr';
import { DateRangePipe } from '../../../utility/date-range.pipe';
import { TimeRangePipe } from '../../../utility/time-range.pipe';
import { AuthService } from '../../../core/auth/auth.service';
import { MatIcon } from '@angular/material/icon';
import { getRaceStatus, RaceStatus } from '../../../service/race-status.pipe';
import { TimeService } from '../../../service/time.service';
@Component({
  selector: 'app-race',
  imports: [ FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule, MaterialModule,
    DateRangePipe,
    TimeRangePipe],
  templateUrl: './race.component.html',
  styleUrl: './race.component.scss'
})
export class RaceComponent implements OnInit, OnDestroy {
  readonly dialog = inject(MatDialog);
  allRace: RaceModel[] = [];
  eventRes: optionModel[] = [];
  private subscriptions: Subscription[] = [];
  private sub!: Subscription;

  circuitName: string = '';
  statusRace: string = '';
  CurrentEventId: any = null;
  sessionList = SESSION_LIST;
  raceSegment = RACE_SEGMENT;
  classList = CLASS_LIST;

  constructor(private router: Router, private route: ActivatedRoute
    , private eventService: EventService, private toastr: ToastrService
    , public time: TimeService) {

  }
  RaceStatus = RaceStatus;
  statusOf = (e: RaceModel) => getRaceStatus(this.time.now(), e.session_start, e.session_end);
  ngOnInit() {
    // Subscribe ต่อ query params changes เพื่อให้ reload ข้อมูลเมื่อ navigate ไปยัง route เดิม
    const queryParamsSub = this.route.queryParamMap.subscribe(params => {
      const eventId = params.get('eventId') ?? '';
      const statusRace = params.get('statusRace') ?? '';
      this.circuitName = params.get('circuitName') ?? '';

      if (eventId) {
        this.CurrentEventId = eventId;
        this.loadRace(eventId, statusRace);
      }
    });
    this.subscriptions.push(queryParamsSub);

    // โหลดข้อมูลครั้งแรก
    let eventId = this.route.snapshot.queryParamMap.get('eventId') ?? '';
    this.statusRace = this.route.snapshot.queryParamMap.get('statusRace') ?? '';
    this.circuitName = this.route.snapshot.queryParamMap.get('circuitName') ?? '';
    this.CurrentEventId = eventId;

    if (eventId) {
      this.loadRace(eventId, this.statusRace);
    }

    this.allRace = [
      {
        id_list: 1,
        event_id: 1,
        season_id: 1,
        category_name: 'Thailand Super Pickup D2',
        segment_value: 'pickup',
        session_value: 'race5',
        class_value: 'c',
        session_start: new Date('6/9/2024 15:10:00'),
        session_end: new Date('6/9/2024 15:30:00'),
        active: 1,
      }
    ];
    this.loadDropDownEvent();
  }

  raceListActive(sessionName: string, eventId: number, raceId :number, active :number, type: string){
    console.log("raceListActive(): ",raceId, active);
    let payload = {
      id_req: raceId,
      current_Time : this.time.now(),
      active: active,
      type: type,
    }

    this.eventService.updateActiveEvent(payload).subscribe(
      response => {
        console.log('Event added/updated successfully:', response);
        // this.dialogRef.close('success');
        this.toastr.success(`เริ่มการแข่ง ${this.getSessionName(sessionName)} `);
        // this.loadEvent();
        this.loadRace(eventId, 'live');

      },
      error => {
        console.error('Error adding/updating Event:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม/แก้ไข Event');
      }
    );
  }


  loadDropDownEvent(){
    const eventData = this.eventService.getDropDownEvent().subscribe(
      eventReslist => {
        this.eventRes = []
        this.eventRes = eventReslist;
      },
      error => {
        console.error('Error loading matchList:', error);
      }
    );
    this.subscriptions.push(eventData);
  }


  getSessionName(value: string): string {
    const found = this.sessionList.find(m => m.value === value);
    return found ? found.name : value;
  }
  getRaceSegmentName(value: string): string {
    const found = this.raceSegment.find(m => m.value === value);
    return found ? found.name : value;
  }
  getClassName(value: string): string {
    // ถ้า value เป็นหลายตัวอักษร เช่น 'ab'
    if (value && value.length > 1) {
      const parts = value.toUpperCase().split('');
      return parts.join('-');
    }

    // ค่า default
    return value.toUpperCase();
  }


  private loadRace(eventId: any, statusRace: string): void {
    // อันดับตามที่ต้องการ
    const ORDER: Record<string, number> = {
      'practice': 0,
      'qualify': 1,
      'race 1':  2,
      'race 2':  3,
    };

    // ปกติ session_value อาจมีตัวพิมพ์/เว้นวรรคต่างกัน หรือรูปแบบย่อ
    const norm = (v: any) => String(v ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^qualifying|qualification$/, 'qualify')   // normalize
      .replace(/^r1$|^race1$|^race 1$/, 'race 1')
      .replace(/^r2$|^race2$|^race 2$/, 'race 2');

    const rank = (r: any) => {
      const key = norm(r.session_value);
      return ORDER[key] ?? Number.MAX_SAFE_INTEGER; // อื่นๆ ไปท้ายสุด
    };

    const startOf = (r: any) => {
      const t = r?.start_time ?? r?.race_start ?? r?.session_start ?? r?.event_start ?? r?.start;
      const d = t instanceof Date ? t : (t ? new Date(t) : null);
      return d ? d.getTime() : Number.MAX_SAFE_INTEGER; // ไม่มีเวลา → ท้ายในกลุ่มเดียวกัน
    };

    const RaceSub = this.eventService.getRace(eventId, statusRace).subscribe(
      race => {
        this.allRace = [...race].sort((a, b) =>
          (rank(a) - rank(b)) ||                  // 1) เรียงตาม session_value
          (startOf(a) - startOf(b)) ||            // 2) ถ้าเท่ากันให้ดูเวลาเริ่ม
          norm(a.session_value).localeCompare(norm(b.session_value)) // 3) กันชน
        );
      },
      error => {
        console.error('Error loading race:', error);
      }
    );

    this.subscriptions.push(RaceSub);
  }


  navigateToDashboard(raceId: number, segmentType: string, classType: string) {
    this.router.navigate(['/pages', 'dashboard'], {
      queryParams: { eventId: this.CurrentEventId, raceId, segment: segmentType, class: classType, circuitName: this.circuitName, statusRace: this.statusRace }   // ➜ /pages/dashboard?raceId=10&class=c
    });
  }

  openAdd(enterAnimationDuration: string, exitAnimationDuration: string, raceId: number = 0): void {
    let arrayData: any[] = [];
    if(raceId){
      arrayData = this.allRace.filter(x => x.id_list == raceId);
    }

    const dialogRef = this.dialog.open(AddEventComponent, {
      width: "100vw",
      maxWidth: "750px",
      enterAnimationDuration,
      exitAnimationDuration,
      autoFocus: false,
      data: {race_data: arrayData,
        NameTab: 'Race'
      }
    });

    dialogRef.afterClosed().subscribe((updated: RaceModel | undefined) => {
      if (!updated) return; // กดยกเลิก
      const idx = this.allRace.findIndex(e => e.id_list === updated.id_list);
      if (idx > -1) {
        this.allRace = [
          ...this.allRace.slice(0, idx),
          { ...this.allRace[idx], ...updated }, // merge field ที่แก้
          ...this.allRace.slice(idx + 1),
        ];
      }
      // this.loadRace();

    });
  }

  openEdit(enterAnimationDuration: string, exitAnimationDuration: string, raceId: number = 0): void {
    let arrayData: any[] = [];
    if(raceId){
      arrayData = this.allRace.filter(x => x.id_list == raceId);
    }

    const dialogRef = this.dialog.open(DialogAnimationsModalEdit, {
      width: "100vw",
      maxWidth: "750px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {race_data: arrayData,
        NameTab: 'Race',
        eventRes: this.eventRes
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if(result == 'success'){
        this.toastr.success('แก้ไข Event เรียบร้อย')
        this.loadRace(this.CurrentEventId, 'live');
      }
    });
  }

  openRaceDelete(enterAnimationDuration: string, exitAnimationDuration: string, raceId: number): void {
    const dialogRef = this.dialog.open(DialogAnimationsRaceModalDelete, {
      width: "100vw",
      maxWidth: "350px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {race_id: raceId}
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      this.allRace = this.allRace.filter(e => e.id_list !== result);
    });
  }


  openRaceEnd(enterAnimationDuration: string, exitAnimationDuration: string, raceId: number, category_name: string): void {
    const dialogRef = this.dialog.open(DialogAnimationsRaceModalEnd, {
      width: "100vw",
      maxWidth: "350px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {race_id: raceId, raceName: category_name}
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      this.allRace = this.allRace.filter(e => e.id_list !== result);
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }
}


@Component({
  selector: 'dialog-animations-race-dialog',
  templateUrl: './modal-race/edit-race.html',
  styleUrl: './race.component.scss',
  imports: [MatButtonModule, MatDialogActions, MatDialogClose,
    MatDialogTitle, MatDialogContent, MatTabsModule,
    FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatCheckboxModule, MatRadioModule],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAnimationsModalEdit implements OnInit {

  sessionList = SESSION_LIST;
  raceSegment = RACE_SEGMENT;
  classList = CLASS_LIST;

  raceMatchId: number = 0;
  seasonId: number = 0;
  eventId: number = 0;
  classValue: string = '';
  sessionValue: string = '';
  eventName: string = '';
  segmentValue: string = '';
  raceName: string = '';
  eventList: optionModel[] = [

  ];

  seasonList: any[] = [
    {
      value: 1,
      name:'TSS The Super Series by B-Quik 2025'
    },
  ];

  typeModal: string = 'เพิ่ม';

  readonly dialogRef = inject(MatDialogRef<DialogAnimationsModalEdit>);
  private readonly _adapter = inject<DateAdapter<unknown, unknown>>(DateAdapter);
  private readonly _locale = signal(inject<unknown>(MAT_DATE_LOCALE));
  readonly data:any = inject<RaceModel>(MAT_DIALOG_DATA);
  private subscriptions: Subscription[] = [];

  readonly range = new FormGroup({
      start: new FormControl<Date | null>(new Date()),
      end: new FormControl<Date | null>(new Date()),
  });

  constructor(private eventService: EventService, private toastr: ToastrService) {
    this.eventList = this.eventService.eventOption;
    this.typeModal = 'เพิ่ม'
    if (this.data.race_data && Object.keys(this.data.race_data).length > 0) {
      this.range.patchValue({
        start: this.data.race_data[0].session_start,
        end: this.data.race_data[0].session_end
      });
      this.typeModal = 'แก้ไข'
    }
  }

  // eventId = new FormControl(null);
  // seasonId = new FormControl(null);
  // classValue = new FormControl(null);
  // sessionValue = new FormControl(null);
  // eventName = new FormControl(null);
  // segmentValue = new FormControl(null);

  ngOnInit() {
    if (this.data.race_data && Object.keys(this.data.race_data).length > 0) {
      console.log(this.data.race_data[0]);
      // this.eventList = this.data.race_data[0].eventRes // drop Down

      this.raceMatchId  = this.data.race_data[0].id_list
      // this.seasonId  = this.data.race_data[0].seasonId
      this.eventId = this.data.race_data[0].event_id.toString();
      this.classValue = this.data.race_data[0].class_value;
      this.sessionValue = this.data.race_data[0].session_value;
      this.segmentValue = this.data.race_data[0].segment_value;
      this.raceName = this.data.race_data[0].race_name;
    }
    // this.dateSessionStart = this.data.race_data[0].eventStart;
    // this.dateSessionEnd = this.data.race_data[0].eventEnd;

    this._locale.set('en');
    this._adapter.setLocale(this._locale());
    // this.updateCloseButtonLabel('Fermer le calendrier');

  }

  onSubmit(): void {
    let payload = {
      id_list: this.raceMatchId,
      race_name: '',
      event_id: Number(this.eventId),
      // seasonId: this.seasonId,
      segment_value: this.segmentValue,
      session_value: this.sessionValue,
      class_value: this.classValue,
      session_start: this.range.controls.start.value,
      session_end: this.range.controls.end.value,
    }

    this.eventService.updateRace(payload).subscribe(
      response => {
        console.log('Race added/updated successfully:', response);
        this.dialogRef.close('success');
      },
      error => {
        console.error('Error adding/updating Race:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม/แก้ไข Race');
      }
    );
  }
}

@Component({
  selector: 'dialog-animations-race-dialog',
  templateUrl: './modal-race/delete-race.html',
  styleUrl: './race.component.scss',
  imports: [MatButtonModule, MatDialogContent, MatDialogClose,
    MatDialogTitle, MatTabsModule, MatIcon,
    FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatCheckboxModule, MatRadioModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAnimationsRaceModalDelete {
  raceMatchId: number = 0;
  raceName: String = '';

  readonly dialogRef = inject(MatDialogRef<DialogAnimationsRaceModalDelete>);
    readonly data:any = inject<RaceModel>(MAT_DIALOG_DATA);

  constructor(private eventService: EventService,  private authService: AuthService,private toastr: ToastrService) {}
  password: string = '';
  hide = true;

  ngOnInit() {
    console.log(this.data.race_id);
    this.raceMatchId = this.data.race_id;
    this.raceMatchId = this.data.race_id;
  }

  onDelete(): void {

    if (!this.authService.validatePassword(this.password)) {
       this.toastr.error('รหัสผ่านไม่ถูกต้อง');
      return;
    }
    const payload = {
      raceMatchId: this.raceMatchId,
      raceName: this.raceName,
    }

    this.eventService.deleteRace(payload).subscribe(
        response => {
          console.log('Event added/updated successfully:', response);
          this.toastr.success(`ลบ รายการ ${this.raceName} สำเร็จ`);
          this.dialogRef.close(this.raceMatchId);
        },
        error => {
          console.error('Error adding/updating match:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ ลบ Logger');
        }
    );
  }
}



@Component({
  selector: 'dialog-animations-race-dialog',
  templateUrl: './modal-race/end-race.html',
  styleUrl: './race.component.scss',
  imports: [MatButtonModule, MatDialogContent, MatDialogClose,
    MatDialogTitle, MatTabsModule, MatIcon,
    FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatCheckboxModule, MatRadioModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAnimationsRaceModalEnd {
  raceMatchId: number = 0;
  raceName: String = '';

  readonly dialogRef = inject(MatDialogRef<DialogAnimationsRaceModalDelete>);
    readonly data:any = inject<RaceModel>(MAT_DIALOG_DATA);

  constructor(private eventService: EventService,  private authService: AuthService,private toastr: ToastrService, public time: TimeService) {}
  password: string = '';
  hide = true;

  ngOnInit() {
    console.log(this.data.race_id);
    this.raceMatchId = this.data.race_id;
    this.raceName = this.data.raceName;
  }

  onEnd(): void {

    // if (!this.authService.validatePassword(this.password)) {
    //   this.toastr.error('รหัสผ่านไม่ถูกต้อง');
    //   return;
    // }
    const payload = {
      raceMatchId: this.raceMatchId,
      raceName: this.raceName,
      current_Time : this.time.now()
    }

    this.eventService.endRace(payload).subscribe(
        response => {
          console.log('Event added/updated successfully:', response);
          this.toastr.success(`${this.raceName} จบการแข่งขันแล้ว`);
          this.dialogRef.close(this.raceMatchId);
        },
        error => {
          console.error('Error adding/updating match:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ ลบ Logger');
        }
    );
  }
}

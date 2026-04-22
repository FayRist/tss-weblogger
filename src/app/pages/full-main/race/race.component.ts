import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
import { FlatpickrDirective } from 'angularx-flatpickr';
import { MaterialModule } from '../../../material.module';
import { EventService } from '../../../service/event.service';
import { Subscription } from 'rxjs';
import { optionModel, RaceModel } from '../../../model/season-model';
import { CLASS_LIST, RACE_SEGMENT, SESSION_LIST } from '../../../constants/race-data';
import { ToastrService } from 'ngx-toastr';
import { DateRangePipe } from '../../../utility/date-range.pipe';
import { TimeRangePipe } from '../../../utility/time-range.pipe';
import { AuthService } from '../../../core/auth/auth.service';
import { MatIcon } from '@angular/material/icon';
import { getRaceStatus, RaceStatus } from '../../../service/race-status.pipe';
import { TimeService } from '../../../service/time.service';
import { AddRaceComponent } from '../add-race/add-race.component';
import { NavigationContextService } from '../../../core/navigation/navigation-context.service';
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

  constructor(private router: Router
    , private eventService: EventService, private toastr: ToastrService
    , public time: TimeService, private authService: AuthService,
    private navContext: NavigationContextService) {

  }
  isReadOnlyRaceTeamUser(): boolean {
    return this.authService.current?.role === 'race_team_user';
  }

  canManageEventRace(): boolean {
    const role = this.authService.current?.role;
    return role === 'super_admin' || role === 'admin';
  }
  RaceStatus = RaceStatus;
  statusOf = (e: RaceModel) => getRaceStatus(this.time.now(), e.session_start, e.session_end);

  private resolveRaceMode(raceData: Pick<RaceModel, 'session_start' | 'session_end' | 'active'>): 'prerace' | 'live' | 'history' {
    const status = getRaceStatus(this.time.now(), raceData.session_start, raceData.session_end);
    if (status === RaceStatus.Finished) {
      return 'history';
    }
    if (Number(raceData.active ?? 0) === 1 || status === RaceStatus.Live) {
      return 'live';
    }
    return 'prerace';
  }

  canEditRace(raceData: RaceModel): boolean {
    return this.resolveRaceMode(raceData) === 'prerace';
  }

  ngOnInit() {
    const contextSub = this.navContext.context$.subscribe(ctx => {
      this.CurrentEventId = ctx.eventId;
      this.statusRace = ctx.raceMode;
      this.circuitName = ctx.circuit ?? '';

      if (this.CurrentEventId) {
        this.loadRace(this.CurrentEventId, this.statusRace);
      } else {
        this.allRace = [];
      }
    });
    this.subscriptions.push(contextSub);

    this.allRace = [
      // {
      //   id_list: 1,
      //   event_id: 1,
      //   season_id: 1,
      //   category_name: 'Thailand Super Pickup D2',
      //   segment_value: 'pickup',
      //   session_value: 'race5',
      //   class_value: 'c',
      //   session_start: new Date('6/9/2024 15:10:00'),
      //   session_end: new Date('6/9/2024 15:30:00'),
      //   active: 1,
      // }
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
        this.navContext.patchContext({ raceMode: 'live' });
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

  private toRaceDate(value: unknown): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value as any);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  private getBangkokDateKeyFromDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find(p => p.type === 'year')?.value ?? '0000';
    const month = parts.find(p => p.type === 'month')?.value ?? '00';
    const day = parts.find(p => p.type === 'day')?.value ?? '00';
    return `${year}-${month}-${day}`;
  }

  getRaceDateLabel(raceData: RaceModel): string {
    const date = this.toRaceDate(raceData.session_start ?? raceData.session_end);
    if (!date) return '-';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  isNewDateGroup(index: number): boolean {
    if (index <= 0) return true;
    const current = this.allRace[index];
    const previous = this.allRace[index - 1];
    if (!current || !previous) return false;

    const currentDate = this.toRaceDate(current.session_start ?? current.session_end);
    const previousDate = this.toRaceDate(previous.session_start ?? previous.session_end);
    if (!currentDate || !previousDate) {
      return index === 0;
    }

    return this.getBangkokDateKeyFromDate(currentDate) !== this.getBangkokDateKeyFromDate(previousDate);
  }


  private loadRace(eventId: any, statusRace: string): void {
    const toStartTime = (r: any) => {
      const t = r?.start_time ?? r?.race_start ?? r?.session_start ?? r?.event_start ?? r?.start;
      const d = t instanceof Date ? t : (t ? new Date(t) : null);
      return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
    };

    const toEndTime = (r: any) => {
      const t = r?.end_time ?? r?.race_end ?? r?.session_end ?? r?.event_end ?? r?.end;
      const d = t instanceof Date ? t : (t ? new Date(t) : null);
      return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
    };

    // Race list page should show all races in selected event (no statusRace filter).
    const RaceSub = this.eventService.getRace(eventId, '').subscribe(
      race => {
        console.log("race : ",race);

        this.allRace = [...race].sort((a, b) =>
          (toStartTime(a) - toStartTime(b)) ||
          (toEndTime(a) - toEndTime(b)) ||
          String(a?.session_value ?? '').localeCompare(String(b?.session_value ?? ''))
        );
      },
      error => {
        console.error('Error loading race:', error);
      }
    );

    this.subscriptions.push(RaceSub);
  }


  navigateToDashboard(raceData: RaceModel) {
    this.navContext.patchContext({
      eventId: Number(this.CurrentEventId),
      raceId: raceData.id_list,
      segment: raceData.segment_value,
      classCode: raceData.class_value,
      circuit: this.circuitName,
      raceMode: this.resolveRaceMode(raceData),
      loggerId: null,
    });
    this.router.navigate(['/pages', 'dashboard']);
  }

  openAdd(enterAnimationDuration: string, exitAnimationDuration: string, raceId: number = 0): void {
    let arrayData: any[] = [];
    if(raceId){
      arrayData = this.allRace.filter(x => x.id_list == raceId);
    }

    const dialogRef = this.dialog.open(AddRaceComponent, {
      width: "100vw",
      maxWidth: "750px",
      enterAnimationDuration,
      exitAnimationDuration,
      autoFocus: false,
      data: {
        race_data: arrayData,
        event_id: Number(this.CurrentEventId),
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
        this.loadRace(this.CurrentEventId, this.statusRace);
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
    MatDatepickerModule, MatCheckboxModule, MatRadioModule, FlatpickrDirective],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAnimationsModalEdit implements OnInit {

  sessionNameOptions: string[] = [
    'Practice 1',
    'Practice 2',
    'Practice 3',
    'Practice 4',
    'Practice 5',
    'Race 1',
    'Race 2',
    'Race 3',
    'Race 4',
    'Race 5',
    'Test Session',
    'Qualifying',
  ];
  raceSegment = RACE_SEGMENT;
  classList = CLASS_LIST;

  raceMatchId: number = 0;
  seasonId: number = 0;
  eventId: string = '';
  classValue: string[] = [];
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
    this.eventList = (this.eventService.eventOption ?? []).map((item: any) => ({
      ...item,
      value: String(item?.value ?? ''),
    }));
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
    if (!this.eventList.length) {
      const sub = this.eventService.getDropDownEvent().subscribe({
        next: (res) => {
          this.eventList = (res ?? []).map((item: any) => ({
            ...item,
            value: String(item?.value ?? ''),
          }));
        },
        error: () => {
          this.eventList = [];
        }
      });
      this.subscriptions.push(sub);
    }

    if (this.data.race_data && Object.keys(this.data.race_data).length > 0) {
      console.log(this.data.race_data[0]);
      // this.eventList = this.data.race_data[0].eventRes // drop Down

      this.raceMatchId  = this.data.race_data[0].id_list
      // this.seasonId  = this.data.race_data[0].seasonId
      this.eventId = String(this.data.race_data[0].event_id ?? '');
      this.classValue = this.parseClassValue(this.data.race_data[0].class_value);
      this.sessionValue = this.normalizeSessionValue(this.data.race_data[0].session_value);
      this.segmentValue = this.data.race_data[0].segment_value;
      this.raceName = this.data.race_data[0].race_name;
    }
    this.range.controls.start.setValue(this.data.race_data?.[0]?.session_start ? new Date(this.data.race_data[0].session_start) : null);
    this.range.controls.end.setValue(this.data.race_data?.[0]?.session_end ? new Date(this.data.race_data[0].session_end) : null);

    this._locale.set('en');
    this._adapter.setLocale(this._locale());
    // this.updateCloseButtonLabel('Fermer le calendrier');

  }

  private parseClassValue(raw: unknown): string[] {
    const source = String(raw ?? '').toLowerCase();
    if (!source.trim()) return [];

    const normalized = source
      .replace(/[^abc]/g, '')
      .split('')
      .filter((v) => v === 'a' || v === 'b' || v === 'c');

    const unique = Array.from(new Set(normalized));
    const order = ['a', 'b', 'c'];
    return unique.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  }

  private normalizeSessionValue(raw: unknown): string {
    const v = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!v) return '';
    if (v === 'practice') return 'Practice 1';
    if (v === 'testsession' || v === 'test session') return 'Test Session';
    if (v === 'qualifying' || v === 'qualification' || v === 'qualify') return 'Qualifying';
    if (v === 'race1' || v === 'race 1' || v === 'r1') return 'Race 1';
    if (v === 'race2' || v === 'race 2' || v === 'r2') return 'Race 2';
    if (v === 'race3' || v === 'race 3' || v === 'r3') return 'Race 3';
    if (v === 'race4' || v === 'race 4' || v === 'r4') return 'Race 4';
    if (v === 'race5' || v === 'race 5' || v === 'r5') return 'Race 5';
    if (v.startsWith('practice ')) {
      const num = Number(v.replace('practice ', ''));
      if (Number.isFinite(num) && num >= 1 && num <= 5) {
        return `Practice ${num}`;
      }
    }
    return this.sessionNameOptions.find(name => name.toLowerCase() === v) ?? String(raw ?? '').trim();
  }

  private isSessionOptionAllowed(value: unknown): boolean {
    const normalized = this.normalizeSessionValue(value);
    return this.sessionNameOptions.includes(normalized);
  }

  private fromInput(value: string): Date | null {
    if (!value) return null;
    const [d, t] = value.split('T');
    if (!d || !t) return null;
    const [y, m, day] = d.split('-').map(Number);
    const [h, min] = t.split(':').map(Number);
    const out = new Date(y, (m || 1) - 1, day || 1, h || 0, min || 0, 0, 0);
    return isNaN(out.getTime()) ? null : out;
  }

  private fromDisplayInput(value: string): Date | null {
    const trimmed = (value || '').trim();
    if (!trimmed) return null;
    const [datePart, timePart] = trimmed.split(' ');
    if (!datePart || !timePart) return null;
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    if (
      !Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year) ||
      !Number.isFinite(hour) || !Number.isFinite(minute)
    ) {
      return null;
    }
    const out = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
    return isNaN(out.getTime()) ? null : out;
  }

  private parseDateTimeValue(input: unknown): Date | null {
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : new Date(input);
    }

    if (Array.isArray(input) && input.length > 0 && input[0] instanceof Date) {
      const d = input[0] as Date;
      return isNaN(d.getTime()) ? null : new Date(d);
    }

    if (typeof input === 'string') {
      const fromIsoLike = this.fromInput(input);
      if (fromIsoLike) return fromIsoLike;

      const fromDisplay = this.fromDisplayInput(input);
      if (fromDisplay) return fromDisplay;

      const parsed = new Date(input);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    if (input && typeof input === 'object' && 'target' in (input as any)) {
      const value = ((input as any).target as HTMLInputElement | null)?.value ?? '';
      return this.fromInput(value);
    }

    return null;
  }

  onStartDateTimeChange(value: unknown): void {
    const dt = this.parseDateTimeValue(value);
    if (!dt) return;
    this.range.controls.start.setValue(dt);

    const end = this.range.controls.end.value;
    if (!end || end < dt) {
      this.range.controls.end.setValue(new Date(dt));
    }
  }

  onEndDateTimeChange(value: unknown): void {
    const dt = this.parseDateTimeValue(value);
    if (!dt) return;
    const start = this.range.controls.start.value;
    this.range.controls.end.setValue(start && dt < start ? new Date(start) : dt);
  }

  onSubmit(): void {
    if (!this.isSessionOptionAllowed(this.sessionValue)) {
      this.toastr.error('กรุณาเลือก Session จากรายการที่กำหนด');
      return;
    }

    if (!Array.isArray(this.classValue) || this.classValue.length === 0) {
      this.toastr.error('กรุณาเลือก Class อย่างน้อย 1 ค่า');
      return;
    }

    const start = this.range.controls.start.value ? new Date(this.range.controls.start.value) : null;
    const end = this.range.controls.end.value ? new Date(this.range.controls.end.value) : null;

    if (!start || !end) {
      this.toastr.error('กรุณาระบุวันเวลาเริ่มและสิ้นสุด race');
      return;
    }

    start.setSeconds(0, 0);
    end.setSeconds(0, 0);

    if (start.getTime() >= end.getTime()) {
      this.toastr.error('วันเวลาเริ่มต้องน้อยกว่าวันเวลาสิ้นสุด');
      return;
    }

    let payload = {
      id_list: this.raceMatchId,
      race_name: '',
      event_id: Number(this.eventId),
      // seasonId: this.seasonId,
      segment_value: this.segmentValue,
      session_value: this.normalizeSessionValue(this.sessionValue),
      class_value: this.classValue.join(''),
      session_start: start,
      session_end: end,
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

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
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
      id_list: this.raceMatchId,
      category_name: this.raceName,
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

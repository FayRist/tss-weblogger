import { ChangeDetectionStrategy, Component, computed, inject, model, OnInit, signal } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { JsonPipe } from '@angular/common';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { ToastrService } from 'ngx-toastr';
import { EventService } from '../../../service/event.service';
import { optionModel, RaceModel } from '../../../model/season-model';
import { CLASS_LIST, MAPS_LIST, RACE_SEGMENT, SESSION_LIST } from '../../../constants/race-data';
import { Subscription } from 'rxjs';

type SessionKey = 'practice' | 'testsession' | 'qualifying' | 'race1' | 'race2' | 'race3' | 'race4' | 'race5';

interface SessionRow {
  key: SessionKey;
  label: String;
  start: Date | null; // 'YYYY-MM-DDTHH:mm'
  end: Date | null;   // 'YYYY-MM-DDTHH:mm'
}

export interface seasonalPayLoad {
  id: number | null;
  season_name: String;
}

export interface eventPayLoad {
  event_id: number | null;
  season_id: number;
  event_name: String;
  circuit_name: String;
  event_start: Date | null;
  event_end: Date | null;
}



@Component({
  selector: 'app-add-event',
  imports: [MatButtonModule, MatDialogClose,
    MatDialogTitle, MatDialogContent, MatTabsModule,
    FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatCheckboxModule, MatRadioModule],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './add-event.component.html',
  styleUrl: './add-event.component.scss'
})
export class AddEventComponent implements OnInit {
  NameTab: String = "เพิ่ม รายการแข่ง";

  seasonName: String = '';
  eventName: String = '';
  raceName: String = '';
  eventId: number = 0;
  seasonId: number = 0;
  circuitName: String = '';

  dateSessionStart = new FormControl(new Date());
  dateSessionEnd = new FormControl(new Date());
  classValue:any = [];
  sessionValue = new FormControl(null);
  segmentValue = new FormControl(null);

  sessionList = SESSION_LIST;
  raceSegment = RACE_SEGMENT;
  classList = CLASS_LIST;
  mapsList = MAPS_LIST;

  eventList: optionModel[] = [
    {
      value: '6',
      name:'BANGSAEN'
    },
  ];

  seasonList: any[] = [
    {
      value: 2,
      name:'ทดสอบรายการแข่ง BANGSAEN'
    },
  ];

  private subscriptions: Subscription[] = [];

  readonly dialogRef = inject(MatDialogRef<AddEventComponent>);
  readonly data:any = inject<RaceModel>(MAT_DIALOG_DATA);
  private readonly _adapter = inject<DateAdapter<unknown, unknown>>(DateAdapter);
  private readonly _locale = signal(inject<unknown>(MAT_DATE_LOCALE));

  practice = true;
  testsession = true;
  qualifying = true;
  race1 = true;
  race2 = true;
  race3 = true;
  race4 = true;
  race5 = true;

  private order: SessionKey[] = [
    'practice', 'testsession', 'qualifying', 'race1', 'race2', 'race3', 'race4', 'race5'
  ];

  private labelMap: Record<SessionKey, String> = {
    practice: 'Practice',
    testsession: 'Test Session',
    qualifying: 'Qualifying',
    race1: 'Race 1',
    race2: 'Race 2',
    race3: 'Race 3',
    race4: 'Race 4',
    race5: 'Race 5',
  };

   // แถวที่ใช้แสดงใน <tbody>
  selectedSessions: SessionRow[] = [];
  constructor(private eventService: EventService, private toastr: ToastrService) {
  }

    labels = [
      // 'รายการแข่ง',
      'Event',
      'Race'];
  ngOnInit() {
    // this.NameTab = this.labels[0];
    this.NameTab = this.data.NameTab;

    this.selectedSessions = this.order.map(key => ({
      key,
      label: this.labelMap[key],
      start: null,
      end:  null,
    }));
    this._locale.set('en');
    this._adapter.setLocale(this._locale());

    // this.updateCloseButtonLabel('Fermer le calendrier');
    this.loadDropDownEvent();
  }


  loadDropDownEvent(){
    const eventData = this.eventService.getDropDownEvent().subscribe(
      eventRes => {
        this.eventList = []
        this.eventList = eventRes;
      },
      error => {
        console.error('Error loading matchList:', error);
      }
    );
    this.subscriptions.push(eventData);
  }

  changeName(event: any) {
    this.NameTab = this.labels[event.index];
  }

  readonly range = new FormGroup({
      start: new FormControl<Date | null>(new Date()),
      end: new FormControl<Date | null>(new Date()),
  });

    // เรียกจาก (change) ของแต่ละ checkbox
  onToggleSession(key: SessionKey, checked: boolean): void {
    if (checked) {
      if (!this.selectedSessions.some(s => s.key === key)) {
        this.selectedSessions.push({
          key,
          label: this.labelMap[key],
          start: null,
          end: null,
        });
        // เรียงตามลำดับที่กำหนดไว้
        this.selectedSessions.sort(
          (a, b) => this.order.indexOf(a.key) - this.order.indexOf(b.key)
        );
      }
    } else {
      this.selectedSessions = this.selectedSessions.filter(s => s.key !== key);
    }
  }

  // แปลง Date -> 'YYYY-MM-DDTHH:mm' (วินาที/มิลลิวินาที = 00)
  toInput(d: Date | null | undefined): String {
    if (!d) return '';
    const x = new Date(d);
    x.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2,'0');
    const yyyy = x.getFullYear();
    const MM   = pad(x.getMonth() + 1);
    const dd   = pad(x.getDate());
    const hh   = pad(x.getHours());
    const mm   = pad(x.getMinutes());
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
  }

  // แปลงสตริงจาก input -> Date (ตีความเป็น local time) และ set ss/ms = 0
  fromInput(value: String): Date | null {
    if (!value) return null;
    // ปลอดภัยกับ Safari: แยกส่วนเอง ไม่ใช้ new Date(isoString)
    const [d, t] = value.split('T');
    if (!d || !t) return null;
    const [y,m,day] = d.split('-').map(Number);
    const [h,min]   = t.split(':').map(Number);
    const out = new Date(y, (m||1)-1, day||1, h||0, min||0, 0, 0);
    return isNaN(out.getTime()) ? null : out;
  }
  // อัปเดตค่าเวลาเมื่อผู้ใช้แก้ใน input
  onStartChange(row: SessionRow, ev: Event) {
    const value = (ev.target as HTMLInputElement | null)?.value ?? '';
    const dt = this.fromInput(value);
    if (!dt) return;
    row.start = dt;
    if (!row.end || row.end < row.start) row.end = new Date(row.start);
  }

  onEndChange(row: SessionRow, ev: Event) {
    const value = (ev.target as HTMLInputElement | null)?.value ?? '';
    const dt = this.fromInput(value);
    if (!dt) return;
    row.end = (row.start && dt < row.start) ? new Date(row.start) : dt;
  }
  submitSeason(){
    const payload = {
      id: null,
      season_name: this.seasonName,
    }

    this.eventService.addNewSeason(payload).subscribe(
        response => {
          console.log('added Logger successfully:', response);
          this.toastr.success(`เพิ่ม รายการแข่ง ${this.seasonName} เรียบร้อยแล้ว`);
          this.dialogRef.close('success');

        },
        error => {
          console.error('Error adding/updating match:', error);
            this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม รายการแข่งขัน');
        }
      );
  }

  //   seasonName: String = '';
  // eventName: String = '';
  // raceName: String = '';
  // eventId: number = 0;
  // circuitName: String = '';
  // seasonId: number = 0;
  submitEvent(){

    const payload = {
      event_id: null,
      season_id: this.seasonId,
      event_name: this.eventName,
      circuit_name: this.circuitName,
      event_start: this.range.controls.start.value,
      event_end: this.range.controls.end.value,
    }

    this.eventService.addNewEvent(payload).subscribe(
        response => {
          console.log('added Event successfully:', response);
          // this.rows = {};
          // this.loadMatch();
          // this.modalService.dismissAll();
          this.toastr.success(`เพิ่ม Event ${this.seasonName} เรียบร้อยแล้ว`);
          this.dialogRef.close('success');

        },
        error => {
          console.error('Error adding/updating match:', error);
            this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม รายการแข่งขัน');
        }
      );
  }

  submitRace(){
    const payload: any[] =[]
    let classJoin:any = this.classValue;
    for (let index = 0; index < this.selectedSessions.length; index++) {
      const element = this.selectedSessions[index];
      let prePayload = {
        id_list: null,
        season_id: this.seasonId,
        event_id: Number(this.eventId),
        category_name: "",
        class_value: classJoin.join(''),
        segment_value: this.segmentValue,
        session_value: element.key,
        session_start: element.start,
        session_end: element.end,
      }

      payload.push(prePayload);
    }


    this.eventService.addNewRace(payload).subscribe(
        response => {
          console.log('added Event successfully:', response);
          // this.rows = {};
          // this.loadMatch();
          // this.modalService.dismissAll();
          this.toastr.success(`เพิ่ม Event ${this.seasonName} เรียบร้อยแล้ว`);
          this.dialogRef.close('success');

        },
        error => {
          console.error('Error adding/updating match:', error);
            this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม รายการแข่งขัน');
        }
      );
    // const payload = {
    //   eventId: this.eventId,
    //   seasonId: this.seasonId,
    //   classValue: this.classValue,
    //   sessionValue: this.classValue,
    //   segmentValue: this.segmentValue
    // }
  }


}

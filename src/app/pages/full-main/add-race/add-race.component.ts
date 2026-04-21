import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, model, OnInit, signal } from '@angular/core';
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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatRadioModule } from '@angular/material/radio';
import { FlatpickrDirective } from 'angularx-flatpickr';
import { ToastrService } from 'ngx-toastr';
import { EventService } from '../../../service/event.service';
import { optionModel, RaceModel } from '../../../model/season-model';
import { CLASS_LIST, MAPS_LIST, RACE_SEGMENT } from '../../../constants/race-data';
import { Subscription } from 'rxjs';

interface SessionRow {
  key: string;
  label: string;
  start: Date | null; // 'YYYY-MM-DDTHH:mm'
  end: Date | null;   // 'YYYY-MM-DDTHH:mm'
}

interface SessionInterval {
  key: string;
  label: string;
  start: Date;
  end: Date;
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
  selector: 'app-add-race',
  standalone: true,
  imports: [MatButtonModule, MatDialogClose,
    MatDialogTitle, MatDialogContent, MatTabsModule,
    FormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatRadioModule, FlatpickrDirective,],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './add-race.component.html',
  styleUrl: './add-race.component.scss'
})
export class AddRaceComponent implements OnInit {
  NameTab: String = "เพิ่ม รายการแข่ง";

  seasonName: String = '';
  eventName: String = '';
  raceName: String = '';
  eventId: string = '';
  seasonId: number = 0;
  circuitName: String = '';

  dateSessionStart = new FormControl(new Date());
  dateSessionEnd = new FormControl(new Date());
  classValue:any = [];
  sessionValue = new FormControl(null);
  segmentValue = new FormControl(null);

  raceSegment = RACE_SEGMENT;
  classList = CLASS_LIST;
  mapsList: optionModel[] = MAPS_LIST;

  eventList: optionModel[] = [  ];

  seasonList: any[] = [
    {
      value: 2,
      name:'ทดสอบรายการแข่ง BANGSAEN'
    },
  ];

  private subscriptions: Subscription[] = [];

  readonly dialogRef = inject(MatDialogRef<AddRaceComponent>);
  readonly data:any = inject<RaceModel>(MAT_DIALOG_DATA);
  private readonly _adapter = inject<DateAdapter<unknown, unknown>>(DateAdapter);
  private readonly _locale = signal(inject<unknown>(MAT_DATE_LOCALE));

  private nextSessionIndex = 1;

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

  // แถวที่ใช้แสดงใน <tbody>
  selectedSessions: SessionRow[] = [];

  get sortedSessions(): SessionRow[] {
    return [...this.selectedSessions].sort((a, b) => this.compareSessionRows(a, b));
  }

  constructor(private eventService: EventService, private toastr: ToastrService, private cdr: ChangeDetectorRef) {
  }

  ngOnInit() {
    // this.NameTab = this.labels[0];
    this.NameTab = this.data.NameTab;
    this.eventId = String(this.data.event_id ?? '');
    this.selectedSessions = [];
    this._locale.set('en');
    this._adapter.setLocale(this._locale());

    // this.updateCloseButtonLabel('Fermer le calendrier');
    this.loadDropDownEvent();
  }

  addSessionRow(): void {
    this.selectedSessions = [
      ...this.selectedSessions,
      {
        key: `session-${this.nextSessionIndex++}`,
        label: '',
        start: null,
        end: null,
      }
    ];
  }

  removeSessionRow(row: SessionRow): void {
    this.selectedSessions = this.selectedSessions.filter(x => x.key !== row.key);
    this.validateSessionTimeline(false, false);
  }

  private compareSessionRows(a: SessionRow, b: SessionRow): number {
    const aStart = a.start ? new Date(a.start).getTime() : Number.MAX_SAFE_INTEGER;
    const bStart = b.start ? new Date(b.start).getTime() : Number.MAX_SAFE_INTEGER;
    if (aStart !== bStart) {
      return aStart - bStart;
    }

    const aEnd = a.end ? new Date(a.end).getTime() : Number.MAX_SAFE_INTEGER;
    const bEnd = b.end ? new Date(b.end).getTime() : Number.MAX_SAFE_INTEGER;
    if (aEnd !== bEnd) {
      return aEnd - bEnd;
    }

    return String(a.label ?? '').localeCompare(String(b.label ?? ''));
  }


  loadDropDownEvent(){
    const eventData = this.eventService.getDropDownEvent().subscribe(
      eventRes => {
        this.eventList = eventRes.map((item: any) => ({
          ...item,
          value: String(item.value ?? ''),
        }));

        this.eventId = String(this.data.event_id ?? this.eventId ?? '');
        this.cdr.markForCheck();
      },
      error => {
        console.error('Error loading matchList:', error);
      }
    );
    this.subscriptions.push(eventData);

    const form_code = `map_list`
    const MatchSub = this.eventService.getConfigAdmin(form_code).subscribe(
        (config: any) => {
            this.mapsList = config.map((item: any) => ({
                name: item.config_name,
                value: String(item.value ?? item.id ?? '') // ใช้ id เป็นค่าสำรอง ถ้า value เป็น null
            }));

            this.cdr.markForCheck();
        },
        error => {
            console.error('Error loading matchList:', error);
        }
    );
    this.subscriptions.push(MatchSub);
  }


  readonly range = new FormGroup({
      start: new FormControl<Date | null>(new Date()),
      end: new FormControl<Date | null>(new Date()),
  });
  toInput(d: Date | null | undefined): string {
    if (!d) return '';
    const x = new Date(d);
    x.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = x.getFullYear();
    const MM = pad(x.getMonth() + 1);
    const dd = pad(x.getDate());
    const hh = pad(x.getHours());
    const mm = pad(x.getMinutes());
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
  }

  // แปลงสตริงจาก input -> Date (ตีความเป็น local time) และ set ss/ms = 0
  fromInput(value: string): Date | null {
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

  // อัปเดตค่าเวลาเมื่อผู้ใช้แก้ใน input
  onStartChange(row: SessionRow, value: unknown) {
    const dt = this.parseDateTimeValue(value);
    if (!dt) return;
    row.start = dt;
    if (!row.end || row.end < row.start) row.end = new Date(row.start);
    this.validateSessionTimeline(true, false);
  }

  onEndChange(row: SessionRow, value: unknown) {
    const dt = this.parseDateTimeValue(value);
    if (!dt) return;
    row.end = (row.start && dt < row.start) ? new Date(row.start) : dt;
    this.validateSessionTimeline(true, false);
  }

  onSessionLabelChange(row: SessionRow, value: string): void {
    row.label = String(value ?? '').trim();
    this.validateSessionTimeline(false, false);
  }

  onSessionLabelInput(row: SessionRow, value: string): void {
    row.label = String(value ?? '');
  }

  onSessionLabelBlur(row: SessionRow): void {
    const trimmed = String(row.label ?? '').trim();
    if (!trimmed) {
      row.label = '';
      return;
    }

    if (!this.isSessionNameOption(trimmed)) {
      row.label = '';
    } else {
      row.label = trimmed;
    }
  }

  getFilteredSessionOptions(currentRow: SessionRow): string[] {
    const keyword = String(currentRow.label ?? '').trim().toLowerCase();
    return this.sessionNameOptions.filter(name => {
      if (!keyword) {
        return true;
      }
      return name.toLowerCase().includes(keyword);
    });
  }

  private isSessionNameOption(label: string): boolean {
    const target = String(label ?? '').trim().toLowerCase();
    return this.sessionNameOptions.some(name => name.toLowerCase() === target);
  }

  private toBangkokDateKey(value: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);

    const year = parts.find(p => p.type === 'year')?.value ?? '0000';
    const month = parts.find(p => p.type === 'month')?.value ?? '00';
    const day = parts.find(p => p.type === 'day')?.value ?? '00';
    return `${year}-${month}-${day}`;
  }

  private hasDuplicateSessionLabelsByDay(showToast: boolean): boolean {
    const seen = new Map<string, { label: string; dateKey: string }>();
    for (const row of this.selectedSessions) {
      const label = String(row.label ?? '').trim();
      if (!label || !row.start) continue;

      const normalized = label.toLowerCase();
      const dateKey = this.toBangkokDateKey(new Date(row.start));
      const compositeKey = `${normalized}|${dateKey}`;
      const exists = seen.get(compositeKey);

      if (exists) {
        if (showToast) {
          this.toastr.error(`ชื่อ Session ซ้ำกันในวันเดียวกัน: ${label} (${dateKey})`);
        }
        return true;
      }
      seen.set(compositeKey, { label, dateKey });
    }
    return false;
  }

  private validateSessionTimeline(showToast: boolean, requireComplete: boolean): boolean {
    const intervals: SessionInterval[] = [];

    if (this.hasDuplicateSessionLabelsByDay(showToast)) {
      return false;
    }

    for (const row of this.selectedSessions) {
      const label = String(row.label ?? '').trim();
      if (!label) {
        if (showToast) {
          this.toastr.error('กรุณาเลือกชื่อ Session ให้ครบทุกแถว');
        }
        return false;
      }

      if (!this.isSessionNameOption(label)) {
        if (showToast) {
          this.toastr.error(`ชื่อ Session ไม่ถูกต้อง: ${label}`);
        }
        return false;
      }

      if (!row.start || !row.end) {
        if (requireComplete) {
          if (showToast) {
            this.toastr.error(`กรุณาระบุเวลาเริ่มและเวลาจบของ ${label}`);
          }
          return false;
        }
        continue;
      }

      const start = new Date(row.start);
      const end = new Date(row.end);
      if (start.getTime() >= end.getTime()) {
        if (showToast) {
          this.toastr.error(`เวลาเริ่มต้องน้อยกว่าเวลาจบของ ${label}`);
        }
        return false;
      }

      intervals.push({
        key: row.key,
        label,
        start,
        end,
      });
    }

    intervals.sort((a, b) => a.start.getTime() - b.start.getTime());

    for (let i = 1; i < intervals.length; i++) {
      const prev = intervals[i - 1];
      const current = intervals[i];

      // อนุญาตให้เวลาแตะกันได้ (end == next start) แต่ห้ามทับซ้อนจริง
      if (current.start.getTime() < prev.end.getTime()) {
        if (showToast) {
          this.toastr.error(`ช่วงเวลาของ ${current.label} ทับซ้อนกับ ${prev.label}`);
        }
        return false;
      }
    }

    return true;
  }


  submitRace(){
    if (this.selectedSessions.length === 0) {
      this.toastr.error('กรุณาเพิ่ม Session อย่างน้อย 1 รายการ');
      return;
    }

    if (!this.validateSessionTimeline(true, true)) {
      return;
    }

    const payload: any[] =[]
    let classJoin:any = this.classValue;
    for (let index = 0; index < this.selectedSessions.length; index++) {
      const element = this.selectedSessions[index];
      const start = element.start ? new Date(element.start) : null;
      const end = element.end ? new Date(element.end) : null;

      if (start) start.setSeconds(0, 0);
      if (end) end.setSeconds(0, 0);

        let prePayload = {
        id_list: null,
        season_id: this.seasonId,
        event_id: Number(this.eventId),
        category_name: "",
        class_value: classJoin.join(''),
        segment_value: this.segmentValue,
        session_value: String(element.label ?? '').trim(),
        session_start: start,
        session_end: end,
      }

      payload.push(prePayload);
    }


    this.eventService.addNewRace(payload).subscribe(
        response => {
          console.log('added Race successfully:', response);
          // this.rows = {};
          // this.loadMatch();
          // this.modalService.dismissAll();
          this.toastr.success(`เพิ่ม Race ${this.seasonName} เรียบร้อยแล้ว`);
          this.dialogRef.close('success');

        },
        error => {
          console.error('Error adding/updating match:', error);
            this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม รายการแข่งขัน');
        }
      );
  }


}

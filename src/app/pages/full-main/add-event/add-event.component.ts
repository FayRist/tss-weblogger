import { ChangeDetectionStrategy, Component, computed, inject, model, OnInit, signal } from '@angular/core';
import {
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

type SessionKey = 'freePractice' | 'qualifying' | 'race1' | 'race2' | 'race3' | 'race4' | 'race5';

interface SessionRow {
  key: SessionKey;
  label: string;
  start: Date | null; // 'YYYY-MM-DDTHH:mm'
  end: Date | null;   // 'YYYY-MM-DDTHH:mm'
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
  NameTab: string = "เพิ่ม รายการแข่ง";

  eventName: string = '';
  raceName: string = '';
  eventId: number = 0;
  circuitName: string = '';
  seasonId: number = 0;

  toppings = new FormControl('');
  dateSessionStart = new FormControl(new Date());
  dateSessionEnd = new FormControl(new Date());
  classValue = new FormControl(null);
  sessionValue = new FormControl(null);
  segmentValue = new FormControl(null);


  eventList: any[] = [
    {
      value: 1,
      name:'TSS Bangsaen Grand Prix 2025'
    },
  ];

  seasonList: any[] = [
    {
      value: 1,
      name:'TSS The Super Series by B-Quik 2025'
    },
  ];

  sessionList: any[] = [
    {
      value:'Free Practice',
      name:'freepractice'
    },{
      value:'qualify',
      name:'Qualifying'
    },{
      value:'race1',
      name:'Race 1'
    },{
      value:'race2',
      name:'Race 2'
    },{
      value:'race3',
      name:'Race 3'
    },{
      value:'race4',
      name:'Race 4'
    },{
      value:'race5',
      name:'Race 5'
    }
  ];

  raceSegment: any[] = [
    {
      value: 'pickup',
      name:'Pickup'
    },{
      value: 'touring',
      name:'Touring'
    }
  ];

  classList: any[] = [
    {
      value: 'a',
      name:'Class A'
    },{
      value: 'b',
      name:'Class B'
    },{
      value: 'c',
      name:'Class C'
    },{
      value: 'ab',
      name:'Class A-B'
    },{
      value: 'overall',
      name:'Over All'
    },
  ];

  mapsList: any[] = [
    {
      value:'bsc',
      name:'Bangsaen Street Circuit, Thailand'
    },{
      value:'sic',
      name:'Petronas Sepang International Circuit, Malaysia'
    },{
      value:'bric',
      name:'Buriram International Circuit, Thailand'
    },
  ];

  readonly dialogRef = inject(MatDialogRef<AddEventComponent>);
  private readonly _adapter = inject<DateAdapter<unknown, unknown>>(DateAdapter);
  private readonly _locale = signal(inject<unknown>(MAT_DATE_LOCALE));

  freePractice = true;
  qualifying = true;
  race1 = true;
  race2 = true;
  race3 = true;
  race4 = true;
  race5 = true;

  private order: SessionKey[] = [
    'freePractice', 'qualifying', 'race1', 'race2', 'race3', 'race4', 'race5'
  ];

  private labelMap: Record<SessionKey, string> = {
    freePractice: 'Free Practice',
    qualifying: 'Qualifying',
    race1: 'Race 1',
    race2: 'Race 2',
    race3: 'Race 3',
    race4: 'Race 4',
    race5: 'Race 5',
  };

   // แถวที่ใช้แสดงใน <tbody>
  selectedSessions: SessionRow[] = [];

  ngOnInit() {
    this.NameTab = "เพิ่ม รายการแข่ง";

    this.selectedSessions = this.order.map(key => ({
      key,
      label: this.labelMap[key],
      start: null,
      end:  null,
    }));
    this._locale.set('fr');
    this._adapter.setLocale(this._locale());
    // this.updateCloseButtonLabel('Fermer le calendrier');
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
  toInput(d: Date | null | undefined): string {
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
  fromInput(value: string): Date | null {
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
    // ไม่ให้ end < start
    row.end = (row.start && dt < row.start) ? new Date(row.start) : dt;
  }
  submitSeason(){

  }


}

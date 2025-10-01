import { ChangeDetectionStrategy, Component, computed, inject, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import * as XLSX from 'xlsx';
import { EventService } from '../../../../service/event.service';
import { ToastrService } from 'ngx-toastr';

interface ExcelRow {
  logger: string;      // <- จากไฟล์
  nbr: string | number;
  firstname: string;
  lastname: string;
  class: string;
  team: string;
}
export interface ExcelRowPayLoad {
  logger: string;      // <- จากไฟล์
  nbr: string;
  firstname: string;
  lastname: string;
}


@Component({
  selector: 'app-add-logger',
  imports: [MatButtonModule, MatDialogClose,
    MatDialogTitle, MatDialogContent, FormsModule, MatFormFieldModule, MatInputModule],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './add-logger.component.html',
  styleUrl: './add-logger.component.scss'
})
export class AddLoggerComponent implements OnInit {

  acceptTypes =
    '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

  rowsExcel: ExcelRow[] = [];
  error = '';
  isSubmitting = false;
  readonly dialogRef = inject(MatDialogRef<AddLoggerComponent>);

  constructor(private eventService: EventService, private toastr: ToastrService) {}
  ngOnInit() {

  }

  onFileSelected(evt: Event) {
    this.error = '';
    this.rowsExcel = [];

    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;

    // ตรวจไฟล์
    const validExt = /\.(xlsx|xls)$/i.test(file.name);
    const validMime = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ].includes(file.type) || file.type === '';
    if (!validExt && !validMime) {
      this.error = 'รองรับเฉพาะไฟล์ Excel (.xlsx หรือ .xls)';
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
          this.error = 'ไม่พบชีตในไฟล์';
          return;
        }

        const ws = wb.Sheets[firstSheetName];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: '',
          raw: true,
        });
        if (!raw.length) {
          this.error = 'ไฟล์ว่าง หรือไม่พบข้อมูล';
          return;
        }

        // ====== เฉพาะ ANGULAR: alias mapping สำหรับหัวตาราง ======
        type Canon = 'logger' | 'nbr' | 'firstname' | 'lastname' | 'class' | 'team';
        const REQUIRED: Canon[] = ['logger', 'nbr', 'firstname', 'lastname', 'class']; // team ไม่บังคับ

        const normalize = (s: string) =>
          s?.toString().trim().toLowerCase().replace(/\s+/g, '');

        // alias ตามไฟล์จริงของคุณ
        const ALIASES: Record<Canon, string[]> = {
          logger:     ['logger', 'loggerid', 'logger_id'],
          nbr:        ['number', 'nbr', 'no', '#'],       // ไฟล์ใช้ "Number"
          firstname:  ['name', 'firstname'],              // ไฟล์ใช้ "Name"
          lastname:   ['surname', 'lastname'],            // ไฟล์ใช้ "Surname"
          class:      ['class', 'classtype', 'category'], // ไฟล์ใช้ "Class"
          team:       ['team', 'team_name'],                           // optional
        };

        // map: headerเดิม -> canonical
        const sample = raw[0];
        const headerToCanon = new Map<string, Canon>();
        Object.keys(sample).forEach((orig) => {
          const nk = normalize(orig);
          for (const canon of Object.keys(ALIASES) as Canon[]) {
            if (ALIASES[canon].some(a => normalize(a) === nk)) {
              headerToCanon.set(orig, canon);
              break;
            }
          }
        });

        // เช็คว่าครบทุกฟิลด์ที่ต้องการ
        const found = new Set<Canon>(Array.from(headerToCanon.values()));
        const missing = REQUIRED.filter(k => !found.has(k));
        if (missing.length) {
          this.error =
            'รูปแบบคอลัมน์ไม่ถูกต้อง ต้องมี: logger, Number/Name/Surname, Class (รองรับ alias ได้)';
          return;
        }

        // helper: ดึงค่าตาม canonical
        const getByCanon = (row: Record<string, any>, canon: Canon) => {
          const entry = Array.from(headerToCanon.entries()).find(([, v]) => v === canon);
          if (!entry) return '';
          const [origKey] = entry;
          return row[origKey];
        };

        // พาร์สเป็นแถวที่เราต้องการ
        const parsed: ExcelRow[] = raw
        .map((row) => {
          const nbrRaw = getByCanon(row, 'nbr');
          const nbrNum = Number(nbrRaw);
          const rec: ExcelRow = {
            logger: (getByCanon(row, 'logger') ?? '').toString().trim(),
            nbr: Number.isFinite(nbrNum) ? nbrNum : (nbrRaw ?? '').toString().trim(),
            firstname: (getByCanon(row, 'firstname') ?? '').toString().trim(),
            lastname: (getByCanon(row, 'lastname') ?? '').toString().trim(),
            class: (getByCanon(row, 'class') ?? '').toString().trim(),
            team: (getByCanon(row, 'team') ?? '').toString().trim(), // ถ้าอยากเก็บทีมด้วย ให้เติมใน interface ด้วย
          };

          const empty = !rec.logger && !rec.nbr && !rec.firstname && !rec.lastname && !rec.class;
          return empty ? null : rec;
        })
        .filter((r): r is ExcelRow => !!r);

        if (!parsed.length) {
          this.error = 'ไม่พบข้อมูลที่ใช้งานได้ในไฟล์';
          return;
        }

        this.rowsExcel = parsed;
      } catch (e) {
        console.error(e);
        this.error = 'ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์';
      }
    };
    reader.onerror = () => {
      this.error = 'เกิดข้อผิดพลาดระหว่างอ่านไฟล์';
    };

    reader.readAsArrayBuffer(file);
  }


  submitAllLoggers(){
    const payload: any[] = this.rowsExcel.map(r => ({
      logger_id: String(r.logger ?? '').trim(),   // <- map ชื่อคีย์
      car_number: String(r.nbr ?? '').trim(),
      first_name: String(r.firstname ?? '').trim(),
      last_name: String(r.lastname ?? '').trim(),
      creat_date: String(r.lastname ?? '').trim(),
      class_type: String(r.class ?? '').trim(),
      team_name: String(r.team ?? '').trim(),
    }));


    this.eventService.addAllNewLogger(payload).subscribe(
        response => {
          console.log('added Logger successfully:', response);
          // this.rows = {};
          // this.loadMatch();
          // this.modalService.dismissAll();
          this.toastr.success(`เพิ่ม Logger จำนวน ${this.rowsExcel.length}`);
          this.dialogRef.close('success');

        },
        error => {
          console.error('Error adding/updating match:', error);
           this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม/แก้ไข Logger');
        }
      );
  }
}

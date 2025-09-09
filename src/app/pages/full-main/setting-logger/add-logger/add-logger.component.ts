import { ChangeDetectionStrategy, Component, computed, inject, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import * as XLSX from 'xlsx';
import { EventService } from '../../../../service/event.service';

interface ExcelRow {
  logger: string;      // <- จากไฟล์
  nbr: string | number;
  firstname: string;
  lastname: string;
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

  constructor(private eventService: EventService) {}
  ngOnInit() {

  }

  onFileSelected(evt: Event) {
    this.error = '';
    this.rowsExcel = [];

    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;

    // ตรวจนามสกุล/ MIME type
    const validExt = /\.(xlsx|xls)$/i.test(file.name);
    const validMime =
      [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ].includes(file.type) || file.type === '';
    if (!validExt && !validMime) {
      this.error = 'รองรับเฉพาะไฟล์ Excel (.xlsx หรือ .xls)';
      (evt.target as HTMLInputElement).value = '';
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
        // อ่านเป็นอ็อบเจกต์ โดยใช้แถวแรกเป็น header
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: '', // ค่าดีฟอลต์ถ้าเซลล์ว่าง
          raw: true,
        });

        if (!raw.length) {
          this.error = 'ไฟล์ว่าง หรือไม่พบข้อมูล';
          return;
        }

        // ตรวจว่ามีคอลัมน์ที่ต้องการครบหรือไม่ (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง)
        const required = ['logger', 'nbr', 'firstname', 'lastname'];
        const normalize = (s: string) => s?.toString().trim().toLowerCase();

        // แผนที่ชื่อ header เดิม -> ชื่อมาตรฐาน
        const headerMap = new Map<string, string>();
        Object.keys(raw[0]).forEach((k) => {
          const nk = normalize(k);
          if (required.includes(nk)) headerMap.set(k, nk);
        });

        const hasAllHeaders =
          required.every((req) =>
            Array.from(headerMap.values()).includes(req)
          );

        if (!hasAllHeaders) {
          this.error =
            'รูปแบบคอลัมน์ไม่ถูกต้อง ต้องมีคอลัมน์: logger, nbr, firstname, lastname (แถวแรกเป็น header)';
          return;
        }

        // แปลงทุกแถวเป็นรูปแบบ ExcelRow (ข้ามแถวที่ว่างทั้งหมด)
        const parsed: ExcelRow[] = raw
          .map((row) => {
            const get = (key: string) => {
              // หา key ดั้งเดิมที่แม็ปมาที่ชื่อมาตรฐาน "key"
              const sourceKey = [...headerMap.entries()].find(
                ([, std]) => std === key
              )?.[0];
              return sourceKey ? row[sourceKey] : '';
            };

            const rec: ExcelRow = {
              logger: (get('logger') ?? '').toString().trim(),
              nbr: get('nbr') ?? '',
              firstname: (get('firstname') ?? '').toString().trim(),
              lastname: (get('lastname') ?? '').toString().trim(),
            };


            // ข้ามถ้าทั้งแถวว่าง
            const allEmpty =
              !rec.logger && !rec.nbr && !rec.firstname && !rec.lastname;
            return allEmpty ? null : rec;
          })
          .filter((r): r is ExcelRow => !!r);

        if (!parsed.length) {
          this.error = 'ไม่พบข้อมูลที่ใช้งานได้ในไฟล์';
          return;
        }

        this.rowsExcel = parsed;
      } catch (e: any) {
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
    }));


    this.eventService.addAllNewLogger(payload).subscribe(
        response => {
          console.log('Match added/updated successfully:', response);
          // this.rows = {};
          // this.loadMatch();
          // this.modalService.dismissAll();
        },
        error => {
          console.error('Error adding/updating match:', error);
          alert('เกิดข้อผิดพลาดในการเพิ่ม/แก้ไข match');
        }
      );
  }
}

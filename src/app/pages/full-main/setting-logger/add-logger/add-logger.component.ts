import { ChangeDetectionStrategy, Component, computed, inject, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  MAT_DIALOG_DATA,
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

export interface DialogLoggerData {
  circuit_name: string;
  event_id: string;
}

interface ExcelRow {
  logger: string;      // <- จากไฟล์
  nbr: string | number;
  firstname: string;
  lastname: string;
  class: string;
  team: string;
  circuit: string;
  eventId: string;
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
  readonly data = inject<DialogLoggerData>(MAT_DIALOG_DATA);
  circuit_name = this.data.circuit_name;
  event_id = this.data.event_id;

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
          const errorMsg = 'รองรับเฉพาะไฟล์ Excel (.xlsx หรือ .xls)';
          this.error = errorMsg;
          this.toastr.error(errorMsg, 'รูปแบบไฟล์ไม่ถูกต้อง');
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
          const errorMsg = 'ไม่พบชีตในไฟล์';
          this.error = errorMsg;
          this.toastr.error(errorMsg, 'ไฟล์ไม่ถูกต้อง');
          return;
        }

        const ws = wb.Sheets[firstSheetName];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: '',
          raw: true,
        });
        if (!raw.length) {
          const errorMsg = 'ไฟล์ว่าง หรือไม่พบข้อมูล';
          this.error = errorMsg;
          this.toastr.error(errorMsg, 'ไฟล์ไม่มีข้อมูล');
          return;
        }

        // ====== เฉพาะ ANGULAR: alias mapping สำหรับหัวตาราง ======
        type Canon = 'logger' | 'nbr' | 'firstname' | 'lastname' | 'class' | 'team';
        const REQUIRED: Canon[] = ['logger', 'class']; // nbr, firstname, lastname มีเงื่อนไขพิเศษ

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

        // เช็คว่าครบทุกฟิลด์ที่ต้องการ (logger, class)
        const found = new Set<Canon>(Array.from(headerToCanon.values()));
        const missing = REQUIRED.filter(k => !found.has(k));
        if (missing.length) {
          const errorMsg = 'รูปแบบคอลัมน์ไม่ถูกต้อง ต้องมี: logger, Class (รองรับ alias ได้)';
          this.error = errorMsg;
          this.toastr.error(errorMsg, 'รูปแบบคอลัมน์ไม่ถูกต้อง');
          return;
        }

        // เช็คว่ามี Number หรือ (Name และ Surname) อย่างน้อยหนึ่งชุด
        const hasNbr = found.has('nbr');
        const hasFirstname = found.has('firstname');
        const hasLastname = found.has('lastname');
        if (!hasNbr && (!hasFirstname || !hasLastname)) {
          const errorMsg = 'รูปแบบคอลัมน์ไม่ถูกต้อง ต้องมี: Number หรือ (Name และ Surname) อย่างใดอย่างหนึ่ง';
          this.error = errorMsg;
          this.toastr.error(errorMsg, 'รูปแบบคอลัมน์ไม่ถูกต้อง');
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
          // ดึงค่าตาม canonical และแปลงให้สอดคล้องกับ validation
          const loggerRaw = getByCanon(row, 'logger');
          const nbrRaw = getByCanon(row, 'nbr');
          const firstnameRaw = getByCanon(row, 'firstname');
          const lastnameRaw = getByCanon(row, 'lastname');
          const classRaw = getByCanon(row, 'class');
          const teamRaw = getByCanon(row, 'team');
          
          // แปลงและ trim ให้เหมือนกับ validation
          const logger = (loggerRaw || '').toString().trim();
          const nbr = nbrRaw !== null && nbrRaw !== undefined && nbrRaw !== '' 
            ? String(nbrRaw).trim() 
            : '';
          const firstname = (firstnameRaw || '').toString().trim();
          const lastname = (lastnameRaw || '').toString().trim();
          const classType = (classRaw || '').toString().trim();
          const team = (teamRaw || '').toString().trim();
          
          const rec: ExcelRow = {
            logger: logger,
            nbr: nbr, // เก็บเป็น string เพื่อให้สอดคล้องกับ validation
            firstname: firstname,
            lastname: lastname,
            class: classType,
            team: team,
            circuit: this.circuit_name,
            eventId: this.event_id,
          };

          // เช็คว่าแถวว่างหรือไม่ (เหมือนเดิม)
          const empty = !rec.logger && !rec.nbr && !rec.firstname && !rec.lastname && !rec.class;
          return empty ? null : rec;
        })
        .filter((r): r is ExcelRow => !!r);

        if (!parsed.length) {
          const errorMsg = 'ไม่พบข้อมูลที่ใช้งานได้ในไฟล์';
          this.error = errorMsg;
          this.toastr.error(errorMsg, 'ไม่มีข้อมูลที่ใช้งานได้');
          return;
        }

        // ====== Validation: เช็คเงื่อนไข Logger, Number, Name, Surname ======
        const validationErrors: string[] = [];
        const loggerIdErrors: string[] = []; // สำหรับเก็บ Logger ID ที่ไม่มีค่า
        
        parsed.forEach((row, index) => {
          const rowNum = index + 2; // +2 เพราะ row 0 = header, row 1 = แถวแรกของข้อมูล
          
          // ใช้ค่าโดยตรงจาก parsed row (ซึ่งเป็น string แล้ว)
          const loggerId = (row.logger || '').trim();
          const nbr = (row.nbr !== null && row.nbr !== undefined && row.nbr !== '') 
            ? String(row.nbr).trim() 
            : '';
          const firstname = (row.firstname || '').trim();
          const lastname = (row.lastname || '').trim();
          
          const hasLogger = loggerId !== '';
          const hasNbr = nbr !== '';
          const hasFirstname = firstname !== '';
          const hasLastname = lastname !== '';
          const hasNameSurname = hasFirstname && hasLastname;
          
          // 1. เช็ค Logger ต้องมีค่าเสมอ
          if (!hasLogger) {
            // กรณีที่ไม่มี Logger แต่มี Number หรือ Name/Surname
            if (hasNbr) {
              const errorMsg = `แถว ${rowNum}: Number "${nbr}" ขาด Logger`;
              validationErrors.push(`แถว ${rowNum}: ฟิลด์ Logger ต้องมีค่า (มี Number "${nbr}" แต่ไม่มี Logger)`);
              loggerIdErrors.push(errorMsg);
            } else if (hasNameSurname) {
              const errorMsg = `แถว ${rowNum}: Name "${firstname}" Surname "${lastname}" ขาด Logger`;
              validationErrors.push(`แถว ${rowNum}: ฟิลด์ Logger ต้องมีค่า (มี Name "${firstname}" Surname "${lastname}" แต่ไม่มี Logger)`);
              loggerIdErrors.push(errorMsg);
            } else if (hasFirstname || hasLastname) {
              const namePart = hasFirstname ? `Name "${firstname}"` : '';
              const surnamePart = hasLastname ? `Surname "${lastname}"` : '';
              const nameInfo = [namePart, surnamePart].filter(Boolean).join(' ');
              const errorMsg = `แถว ${rowNum}: ${nameInfo} ขาด Logger`;
              validationErrors.push(`แถว ${rowNum}: ฟิลด์ Logger ต้องมีค่า (มี ${nameInfo} แต่ไม่มี Logger)`);
              loggerIdErrors.push(errorMsg);
            } else {
              const errorMsg = `แถว ${rowNum}: Logger ไม่ได้กรอกค่า`;
              validationErrors.push(`แถว ${rowNum}: ฟิลด์ Logger ต้องมีค่า`);
              loggerIdErrors.push(errorMsg);
            }
          }
          
          // 2. เช็ค Number หรือ (Name และ Surname) ต้องมีอย่างใดอย่างหนึ่ง (เมื่อมี Logger แล้ว)
          if (hasLogger && !hasNbr && !hasNameSurname) {
            // แสดงว่าขาดอะไรบ้าง
            const missingFields: string[] = [];
            if (!hasNbr) missingFields.push('Number');
            if (!hasFirstname) missingFields.push('Name');
            if (!hasLastname) missingFields.push('Surname');
            
            let errorMsg = `Logger "${loggerId}" (แถว ${rowNum}) ขาดข้อมูล: `;
            if (missingFields.length === 3) {
              errorMsg += 'Number หรือ (Name และ Surname)';
            } else {
              errorMsg += missingFields.join(', ');
            }
            
            validationErrors.push(`แถว ${rowNum}: Logger "${loggerId}" ต้องมี Number หรือ (Name และ Surname) อย่างใดอย่างหนึ่ง`);
            loggerIdErrors.push(errorMsg);
          }
        });

        if (validationErrors.length > 0) {
          const errorMsg = 'พบข้อผิดพลาดในการตรวจสอบข้อมูล:\n' + validationErrors.join('\n');
          this.error = errorMsg;
          
          // แสดง toastr.error แจ้ง Logger ID ที่มีปัญหา
          if (loggerIdErrors.length > 0) {
            const toastrMsg = loggerIdErrors.length > 5 
              ? loggerIdErrors.slice(0, 5).join('\n') + `\n... และอีก ${loggerIdErrors.length - 5} รายการ`
              : loggerIdErrors.join('\n');
            
            this.toastr.error(toastrMsg, `พบข้อผิดพลาด ${validationErrors.length} รายการ`, {
              timeOut: 20000, // แสดงนานขึ้นเพื่อให้อ่านได้ครบ
              enableHtml: false,
              closeButton: true,
              positionClass: 'toast-top-right',
              extendedTimeOut: 5000
            });
          } else {
            this.toastr.error(errorMsg, 'พบข้อผิดพลาดในการตรวจสอบข้อมูล', {
              timeOut: 10000,
              enableHtml: false,
              closeButton: true
            });
          }
          return;
        }

        this.rowsExcel = parsed;
      } catch (e) {
        console.error(e);
        const errorMsg = 'ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์';
        this.error = errorMsg;
        this.toastr.error(errorMsg, 'เกิดข้อผิดพลาด');
      }
    };
    reader.onerror = () => {
      const errorMsg = 'เกิดข้อผิดพลาดระหว่างอ่านไฟล์';
      this.error = errorMsg;
      this.toastr.error(errorMsg, 'เกิดข้อผิดพลาด');
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
      circuit: String(r.circuit ?? '').trim(),
      eventId: Number(r.eventId ?? 0),
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
          
          // Parse error message จาก backend
          let errorMessage = 'เกิดข้อผิดพลาดในการเพิ่ม/แก้ไข Logger';
          
          if (error?.error?.message) {
            const backendMessage = error.error.message;
            
            // เช็คว่าเป็น validation error หรือไม่
            if (backendMessage.includes('Validation error') || backendMessage.includes('Row')) {
              // แยก error messages ที่คั่นด้วย "; "
              const errors = backendMessage.split('; ');
              const loggerErrors: string[] = [];
              
              errors.forEach((err: string) => {
                if (err.includes('logger_id is required')) {
                  // Extract row number
                  const match = err.match(/Row (\d+):/);
                  if (match) {
                    const rowNum = match[1];
                    const loggerId = this.rowsExcel[parseInt(rowNum) - 1]?.logger || 'ไม่ระบุ';
                    loggerErrors.push(`Logger ID "${loggerId}" (แถว ${rowNum}) ไม่ได้กรอกค่า`);
                  } else {
                    loggerErrors.push(err);
                  }
                } else if (err.includes('must have car_number or')) {
                  // Extract row number
                  const match = err.match(/Row (\d+):/);
                  if (match) {
                    const rowNum = match[1];
                    const loggerId = this.rowsExcel[parseInt(rowNum) - 1]?.logger || 'ไม่ระบุ';
                    loggerErrors.push(`Logger ID "${loggerId}" (แถว ${rowNum}): ต้องมี Number หรือ (Name และ Surname)`);
                  } else {
                    loggerErrors.push(err);
                  }
                } else {
                  loggerErrors.push(err);
                }
              });
              
              if (loggerErrors.length > 0) {
                errorMessage = loggerErrors.join('\n');
              }
            } else {
              errorMessage = backendMessage;
            }
          }
          
          this.toastr.error(errorMessage, 'เกิดข้อผิดพลาด', {
            timeOut: 10000, // แสดงนานขึ้นเพื่อให้อ่านได้ครบ
            enableHtml: true,
            closeButton: true
          });
        }
      );
  }
}

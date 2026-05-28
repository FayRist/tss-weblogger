import { ChangeDetectionStrategy, Component, computed, inject, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { DialogLoggerData } from '../setting-logger.component';
import { ToastrService } from 'ngx-toastr';
import { EventService } from '../../../../service/event.service';
import { ExcelRowPayLoad } from '../add-logger/add-logger.component';
import { CLASS_SEGMENT_LIST } from '../../../../constants/race-data';
import { MatSelectModule } from '@angular/material/select';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-edit-logger',
  imports: [MatButtonModule, MatDialogActions, MatDialogClose, MatSelectModule, MatIconModule,
    MatDialogTitle, MatDialogContent, FormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-logger.component.html',
  styleUrl: './edit-logger.component.scss'
})
export class EditLoggerComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<EditLoggerComponent>);
  readonly data = inject<DialogLoggerData>(MAT_DIALOG_DATA);
  id = this.data.id;
  car_number = this.data.carNumber;
  logger_id = this.data.loggerId;
  logger_id_old = this.data.loggerId;

  firstName = this.data.firstName;
  lastName = this.data.lastName;
  classValue = this.data.classValue;
  teamName = this.data.teamName;
  classList = CLASS_SEGMENT_LIST;
  circuit_name = this.data.circuit_name;
  event_id = this.data.event_id;
  isUnlocked = false;
  existingLoggers = this.data.existingLoggers ?? [];

  swap_logger_id: any = null;
  isSwapMode = false;
  selectedSwapLogger: { id: number; loggerId: string; carNumber: string; firstName?: string; lastName?: string; classType?: string; teamName?: string } | null = null;



  constructor(private eventService: EventService, private toastr: ToastrService) {}

  ngOnInit() {

  }

  get filteredSwapLoggers(): Array<{ id: number; loggerId: string; carNumber: string; firstName?: string; lastName?: string; classType?: string; teamName?: string }> {
    const keyword = String(this.swap_logger_id ?? '').trim().toLowerCase();
    return this.existingLoggers
      .filter(item => Number(item.id) !== Number(this.id))
      .filter(item => {
        if (!keyword) return true;
        const loggerId = String(item.loggerId ?? '').toLowerCase();
        const carNumber = String(item.carNumber ?? '').toLowerCase();
        const firstName = String(item.firstName ?? '').toLowerCase();
        return loggerId.includes(keyword) || carNumber.includes(keyword) || firstName.includes(keyword);
      });
  }

  formatSwapOption(item: { id: number; loggerId: string; carNumber: string; firstName?: string; lastName?: string; classType?: string; teamName?: string } | null): string {
    if (!item) return '';
    return `${item.loggerId} | ${item.carNumber} | ${item.firstName ?? ''}`;
  }

  toggleSwapMode(): void {
    this.isSwapMode = !this.isSwapMode;
    this.logger_id = this.logger_id_old;
    if (!this.isSwapMode) {
      this.swap_logger_id = null;
      this.selectedSwapLogger = null;
    }
  }

  onSwapInputChange(value: any): void {
    if (value && typeof value === 'object' && 'id' in value) {
      this.selectedSwapLogger = value;
      return;
    }
    this.selectedSwapLogger = null;
  }

  selectSwapLogger(item: { id: number; loggerId: string; carNumber: string; firstName?: string; lastName?: string; classType?: string; teamName?: string }): void {
    this.selectedSwapLogger = item;
    this.swap_logger_id = this.formatSwapOption(item);
  }

  toggleUnlock(): void {
    this.isUnlocked = !this.isUnlocked;
  }

  onNoClick(): void {
    if (this.isSwapMode) {
      this.submitSwapLoggerId();
      return;
    }

    const nextLoggerId = String(this.logger_id ?? '').trim();
    if (!nextLoggerId) {
      this.toastr.error('กรุณากรอก Logger ID', 'ข้อมูลไม่ครบถ้วน');
      return;
    }

    const duplicateLogger = this.existingLoggers.find(item =>
      Number(item.id) !== Number(this.id) && String(item.loggerId ?? '').trim() === nextLoggerId
    );

    if (duplicateLogger) {
      this.toastr.error(`Logger ID ${nextLoggerId} ซ้ำกับ NBR. ${duplicateLogger.carNumber}`, 'พบข้อมูลซ้ำ');
      return;
    }

    const payload = {
      id: this.id,   // <- map ชื่อคีย์
      logger_id: nextLoggerId,   // <- map ชื่อคีย์
      car_number: this.car_number,
      first_name: this.firstName,
      last_name: this.lastName,
      class_type: this.classValue,
      team_name: this.teamName,
      circuit: this.circuit_name,
      eventId: Number(this.event_id),
      creat_date: new Date()
    }

    this.eventService.updateEditLogger(payload).subscribe(
        response => {
          console.log('Match added/updated successfully:', response);
          this.dialogRef.close('success');
        },
        error => {
          console.error('Error adding/updating match:', error);
          let errorMessage = 'เกิดข้อผิดพลาดในการเพิ่ม/แก้ไข Logger';
          if (error instanceof HttpErrorResponse) {
            const apiDescription = error.error?.description;
            if (typeof apiDescription === 'string' && apiDescription.trim() !== '') {
              errorMessage = apiDescription;
            }
          }
          this.toastr.error(errorMessage);
        }
    );
  }

  private submitSwapLoggerId(): void {
    const sourceLoggerId = String(this.logger_id ?? '').trim();
    if (!sourceLoggerId) {
      this.toastr.error('กรุณากรอก Logger ID ปัจจุบัน', 'ข้อมูลไม่ครบถ้วน');
      return;
    }

    if (!this.selectedSwapLogger) {
      this.toastr.error('กรุณาเลือก Logger ID ที่ต้องการสลับจากรายการ', 'ข้อมูลไม่ครบถ้วน');
      return;
    }

    if (Number(this.selectedSwapLogger.id) === Number(this.id)) {
      this.toastr.error('ไม่สามารถสลับกับข้อมูลเดียวกันได้', 'ข้อมูลไม่ถูกต้อง');
      return;
    }

    const targetLoggerId = String(this.selectedSwapLogger.loggerId ?? '').trim();
    if (!targetLoggerId) {
      this.toastr.error('Logger ID ปลายทางไม่ถูกต้อง', 'ข้อมูลไม่ถูกต้อง');
      return;
    }

    this.eventService.swapLoggerId({
      eventId: Number(this.event_id),
      circuit: this.circuit_name,
      source_id: Number(this.id),
      target_id: Number(this.selectedSwapLogger.id),
    }).subscribe({
      next: () => {
        this.dialogRef.close('success');
      },
      error: (error) => {
        console.error('Error swapping logger ids:', error);
        let errorMessage = `สลับ Logger ID ไม่สำเร็จ (${sourceLoggerId} <-> ${targetLoggerId})`;
        if (error instanceof HttpErrorResponse) {
          const apiDescription = error.error?.description;
          if (typeof apiDescription === 'string' && apiDescription.trim() !== '') {
            errorMessage = apiDescription;
          }
        }
        this.toastr.error(errorMessage);
      }
    });
  }
}

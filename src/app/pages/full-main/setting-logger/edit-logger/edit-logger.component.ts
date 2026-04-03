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
import { DialogLoggerData } from '../setting-logger.component';
import { ToastrService } from 'ngx-toastr';
import { EventService } from '../../../../service/event.service';
import { ExcelRowPayLoad } from '../add-logger/add-logger.component';
import { CLASS_SEGMENT_LIST } from '../../../../constants/race-data';
import { MatSelectModule } from '@angular/material/select';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-edit-logger',
  imports: [MatButtonModule, MatDialogActions, MatDialogClose, MatSelectModule,
    MatDialogTitle, MatDialogContent, FormsModule, MatFormFieldModule, MatInputModule],
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
  firstName = this.data.firstName;
  lastName = this.data.lastName;
  classValue = this.data.classValue;
  teamName = this.data.teamName;
  classList = CLASS_SEGMENT_LIST;
  circuit_name = this.data.circuit_name;
  event_id = this.data.event_id;
  isUnlocked = false;
  existingLoggers = this.data.existingLoggers ?? [];



  constructor(private eventService: EventService, private toastr: ToastrService) {}

  ngOnInit() {

  }

  toggleUnlock(): void {
    this.isUnlocked = !this.isUnlocked;
  }

  onNoClick(): void {
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
}

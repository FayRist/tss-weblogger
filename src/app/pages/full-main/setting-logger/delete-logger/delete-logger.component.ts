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
import { DialogLoggerData } from '../setting-logger.component';
import { EventService } from '../../../../service/event.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-delete-logger',
  imports: [MatButtonModule, MatDialogClose, MatDialogContent,
    MatDialogTitle, FormsModule],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delete-logger.component.html',
  styleUrl: './delete-logger.component.scss'
})
export class DeleteLoggerComponent implements OnInit {

  readonly dialogRef = inject(MatDialogRef<DeleteLoggerComponent>);
  readonly data = inject<DialogLoggerData>(MAT_DIALOG_DATA);
  logger_id = this.data.loggerId;
  id = this.data.id;
  car_number = this.data.carNumber;
  constructor(private eventService: EventService, private toastr: ToastrService) {}

  ngOnInit() {
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  onSubmitDelete(){
    const payload = {
      id: this.id,   // <- map ชื่อคีย์
      logger_id: this.logger_id,   // <- map ชื่อคีย์
      car_number: this.car_number,
    }

    this.eventService.deleteLogger(payload).subscribe(
        response => {
          console.log('Match added/updated successfully:', response);
          this.toastr.success(`ลบ Logger ${this.logger_id} สำเร็จ`);
          this.dialogRef.close('success');
        },
        error => {
          console.error('Error adding/updating match:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ ลบ Logger');
        }
    );
  }
}

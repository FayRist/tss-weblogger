import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { EventService } from '../../../../service/event.service';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../../core/auth/auth.service';

export interface resetCountLimit {
  mode: string;
  loggerId: string;
}


@Component({
  selector: 'app-reset-warning-logger',
  templateUrl: './reset-warning-logger.component.html',
  styleUrl: './reset-warning-logger.component.scss',
  imports: [MatButtonModule, MatDialogClose,
    MatDialogContent, MatDialogTitle, FormsModule],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetWarningLoggerComponent implements OnInit {

  readonly dialogRef = inject(MatDialogRef<ResetWarningLoggerComponent>);
  readonly data:any = inject<resetCountLimit>(MAT_DIALOG_DATA);
  mode: string = 'all';
  loggerId: string = '';
  raceId: number = 0;

  constructor(private eventService: EventService, private authService: AuthService,private toastr: ToastrService) {}
  

  ngOnInit() {
    this.mode = 'all';
    this.loggerId = '';

    this.mode = this.data.mode;
    this.loggerId = this.data.loggerId;
    this.raceId = this.data.raceId;
  }


  submitResetById(){
    const payload = {
      mode: this.mode,
      logger_id: this.loggerId,
      race_id: this.raceId,
    }

    this.eventService.resetLoggerById(payload).subscribe(
        response => {
          console.log('Reset Count successfully:', response);
          this.toastr.success(`Reset Count Logger ${this.loggerId} สำเร็จ`);
          this.dialogRef.close({ success: true, mode: this.mode, loggerId: this.loggerId });
        },
        error => {
          console.error('Error Reset Count:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ Reset Count Logger');
        }
    );
  }
}

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

  ngOnInit() {
    this.mode = 'all';
    this.loggerId = '';

    this.mode = this.data.mode;
    this.loggerId = this.data.loggerId;
  }

}

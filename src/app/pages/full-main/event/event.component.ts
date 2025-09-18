import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import { eventModel } from '../../../model/season-model';
import { DateRangePipe } from '../../../utility/date-range.pipe';
import { EventService } from '../../../service/event.service';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { AddEventComponent } from '../add-event/add-event.component';
import { MAPS_LIST } from '../../../constants/race-data';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';

type SessionKey = 'freePractice' | 'qualifying' | 'race1' | 'race2' | 'race3' | 'race4' | 'race5';

interface SessionRow {
  key: SessionKey;
  label: string;
  start: Date | null; // 'YYYY-MM-DDTHH:mm'
  end: Date | null;   // 'YYYY-MM-DDTHH:mm'
}

@Component({
  selector: 'app-event',
  imports: [DateRangePipe],
  templateUrl: './event.component.html',
  styleUrl: './event.component.scss'
})
export class EventComponent implements OnInit {
  mapsList = MAPS_LIST;

  readonly dialog = inject(MatDialog);
  allEvent: eventModel[] = [{
        event_id: 1,
        season_id: 1,
        event_name: 'TSS Bangsaen Grand Prix 2025',
        circuit_name: 'bsc',
        event_start: new Date('6/9/2024 15:10:00'),
        event_end: new Date('6/10/2024 15:30:00'),
      }];
  private subscriptions: Subscription[] = [];


  constructor(private router: Router, private route: ActivatedRoute,
      private eventService: EventService, private toastr: ToastrService) {
  }


  ngOnInit() {
    this.loadEvent();

  }

  getCircuitName(value: string): string {
    const found = this.mapsList.find(m => m.value === value);
    return found ? found.name : value;
  }


  loadEvent(){
    const eventData = this.eventService.getEvent().subscribe(
      eventRes => {
        this.allEvent = []
        this.allEvent = eventRes;
      },
      error => {
        console.error('Error loading matchList:', error);
      }
    );
    this.subscriptions.push(eventData);
  }

  navigateToRace(eventId: number) {
    this.router.navigate(['/pages', 'race', eventId]);
  }

  openAdd(enterAnimationDuration: string, exitAnimationDuration: string, eventId: any = 0): void {
    let arrayData: any[] = [];
    if(eventId){
      arrayData = this.allEvent.filter(x => x.event_id == eventId);
    }

    const dialogRef = this.dialog.open(AddEventComponent, {
      width: "100vw",
      maxWidth: "750px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {event_data: arrayData,
        NameTab: 'Event'
      }
    });

    dialogRef.afterClosed().subscribe((updated: eventModel | undefined) => {
      if (!updated) return; // กดยกเลิก
      // อัปเดต allEvent แบบ immutable (เหมาะกับ OnPush)
      const idx = this.allEvent.findIndex(e => e.event_id === updated.event_id);
      if (idx > -1) {
        this.allEvent = [
          ...this.allEvent.slice(0, idx),
          { ...this.allEvent[idx], ...updated }, // merge field ที่แก้
          ...this.allEvent.slice(idx + 1),
        ];
      }
      this.loadEvent();
    });
  }

  openEdit(enterAnimationDuration: string, exitAnimationDuration: string, eventId: any = 0): void {
    let arrayData: any[] = [];
    if(eventId){
      arrayData = this.allEvent.filter(x => x.event_id == eventId);
    }

    const dialogRef = this.dialog.open(DialogAnimationsModalEdit, {
      width: "100vw",
      maxWidth: "750px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {event_data: arrayData,
        NameTab: 'Event'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if(result == 'success'){
        this.toastr.success('แก้ไข Event เรียบร้อย')
        this.loadEvent();
      }
    });

    // dialogRef.afterClosed().subscribe((updated: eventModel | undefined) => {
    //   if (!updated) return; // กดยกเลิก
    //   // อัปเดต allEvent แบบ immutable (เหมาะกับ OnPush)
    //   const idx = this.allEvent.findIndex(e => e.event_id === updated.event_id);
    //   if (idx > -1) {
    //     this.allEvent = [
    //       ...this.allEvent.slice(0, idx),
    //       { ...this.allEvent[idx], ...updated }, // merge field ที่แก้
    //       ...this.allEvent.slice(idx + 1),
    //     ];
    //   }
    //   this.loadEvent();
    // });
  }

  openDelete(enterAnimationDuration: string, exitAnimationDuration: string, eventId: any): void {
    let arrayData = this.allEvent.filter(x => x.event_id == eventId);
    const dialogRef = this.dialog.open(DialogAnimationsModalDelete, {
      width: "100vw",
      maxWidth: "350px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {event_id: eventId, event_name: arrayData[0].event_name}
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed');
      this.allEvent = this.allEvent.filter(e => e.event_id !== result);
    });
  }
}


@Component({
  selector: 'dialog-animations-example-dialog',
  templateUrl: './modal-event/edit-event.html',
  styleUrl: './event.component.scss',
  imports: [MatButtonModule, MatDialogActions, MatDialogClose,
    MatDialogTitle, MatDialogContent, MatTabsModule,
    FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatCheckboxModule, MatRadioModule],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class DialogAnimationsModalEdit implements OnInit {
  mapsList = MAPS_LIST;

  eventName: string = '';
  eventId: number = 0;
  circuitName: string = '';
  seasonId: number = 0;
  dateSessionStart = new FormControl(new Date());
  dateSessionEnd = new FormControl(new Date());
  typeModal: string = 'เพิ่ม';

  seasonList: any[] = [
    {
      value:1,
      name:'TSS The Super Series by B-Quik 2025'
    },{
      value:2,
      name:'TSS The Super Series by B-Quik 2024'
    },
  ];


  // mapsList: string[] = ['Extra cheese', 'Mushroom', 'Onion', 'Pepperoni', 'Sausage', 'Tomato'];

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

  readonly dialogRef = inject(MatDialogRef<DialogAnimationsModalEdit>);
  readonly data:any = inject<eventModel>(MAT_DIALOG_DATA);
  private readonly _adapter = inject<DateAdapter<unknown, unknown>>(DateAdapter);
  private readonly _locale = signal(inject<unknown>(MAT_DATE_LOCALE));

  readonly range = new FormGroup({
      start: new FormControl<Date | null>(new Date()),
      end: new FormControl<Date | null>(new Date()),
  });


  constructor(private eventService: EventService, private toastr: ToastrService) {
    this.typeModal = 'เพิ่ม'
    if (this.data.event_data && Object.keys(this.data.event_data).length > 0) {
      this.range.patchValue({
        start: this.data.event_data[0].event_start,
        end: this.data.event_data[0].event_end
      });
      this.typeModal = 'แก้ไข'
    }
  }

  ngOnInit() {
    if (this.data.event_data && Object.keys(this.data.event_data).length > 0) {
      console.log(this.data.event_data[0]);
      this.eventId = this.data.event_data[0].event_id;
      this.eventName = this.data.event_data[0].event_name;
      this.circuitName = this.data.event_data[0].circuit_name;
      // this.seasonId = this.data.event_data[0].season_id;

      this.dateSessionStart = this.data.event_data[0].event_start;
      this.dateSessionEnd = this.data.event_data[0].event_end;

    }

    this._locale.set('en');
    this._adapter.setLocale(this._locale());
  }

  onSubmitEvent(): void {
    let payload = {
      event_name: this.eventName,
      event_id: this.eventId,
      circuit_name: this.circuitName,
      event_start: this.range.controls.start.value,
      event_end: this.range.controls.end.value,
    }

    this.eventService.updateEditEvent(payload).subscribe(
      response => {
        console.log('Event added/updated successfully:', response);
        this.dialogRef.close('success');
      },
      error => {
        console.error('Error adding/updating Event:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม/แก้ไข Event');
      }
    );
  }
}

@Component({
  selector: 'dialog-animations-example-dialog',
  templateUrl: './modal-event/delete-event.html',
  styleUrl: './event.component.scss',
  imports: [MatButtonModule, MatDialogContent, MatDialogClose,
    MatDialogTitle, MatTabsModule, MatIcon,
    FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatCheckboxModule, MatRadioModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAnimationsModalDelete {

  eventId: string = ''
  eventName: string = ''

  readonly dialogRef = inject(MatDialogRef<DialogAnimationsModalDelete>);
  readonly data:any = inject<eventModel>(MAT_DIALOG_DATA);
  password: string = '';
  hide = true;
  constructor(private eventService: EventService,   private authService: AuthService,private toastr: ToastrService) {}

  ngOnInit() {
    console.log(this.data.event_id);
    this.eventId = this.data.event_id;
    this.eventName = this.data.event_name;
  }

  onDelete(): void {
    if (!this.authService.validatePassword(this.password)) {
       this.toastr.error('รหัสผ่านไม่ถูกต้อง');
      return;
    }
    const payload = {
      event_id : this.eventId,
      event_name : this.eventName
    }

    this.eventService.deleteEvent(payload).subscribe(
        response => {
          console.log('Event added/updated successfully:', response);
          this.toastr.success(`ลบ Logger ${this.eventId} สำเร็จ`);
          this.dialogRef.close(this.eventId);
        },
        error => {
          console.error('Error adding/updating match:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ ลบ Logger');
        }
    );
  }
}


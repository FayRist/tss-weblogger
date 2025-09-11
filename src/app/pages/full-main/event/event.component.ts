import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
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
  readonly dialog = inject(MatDialog);
  allEvent: eventModel[] = [];
  private subscriptions: Subscription[] = [];

  constructor(private router: Router, private route: ActivatedRoute,
      private eventService: EventService, private toastr: ToastrService) {
  }
  ngOnInit() {
    // this.allEvent = [
    //   {
    //     eventId: 1,
    //     seasonId: 1,
    //     eventName: 'TSS Bangsaen Grand Prix 2025',
    //     circuitName: 'bsc',
    //     eventStart: new Date('6/9/2024 15:10:00'),
    //     eventEnd: new Date('6/10/2024 15:30:00'),
    //   }
    // ];
    this.loadEvent();

  }

  loadEvent(){
    this.allEvent = []
    const eventData = this.eventService.getEvent().subscribe(
      eventRes => {
        this.allEvent = eventRes;
      },
      error => {
        console.error('Error loading matchList:', error);
      }
    );
    this.subscriptions.push(eventData);
  }

  navigateToRace(){
    this.router.navigate(['/pages', 'race']);
  }
  openEdit(enterAnimationDuration: string, exitAnimationDuration: string, eventId: any): void {
    let arrayData = this.allEvent.filter(x => x.event_id == eventId);

    const dialogRef = this.dialog.open(DialogAnimationsModalEdit, {
      width: "100vw",
      maxWidth: "750px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {event_data: arrayData}
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
    });
  }

  openDelete(enterAnimationDuration: string, exitAnimationDuration: string, eventId: any): void {
    const dialogRef = this.dialog.open(DialogAnimationsModalDelete, {
      width: "100vw",
      maxWidth: "350px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {event_id: eventId}
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

  eventName: string = '';
  eventId: number = 0;
  circuitName: string = '';
  seasonId: number = 0;
  dateSessionStart = new FormControl(new Date());
  dateSessionEnd = new FormControl(new Date());


  seasonList: any[] = [
    {
      value:1,
      name:'TSS The Super Series by B-Quik 2025'
    },{
      value:2,
      name:'TSS The Super Series by B-Quik 2024'
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
      start: new FormControl<Date | null>(this.data.event_data[0].eventStart),
      end: new FormControl<Date | null>(this.data.event_data[0].eventEnd),
  });

  constructor() {

  }

  ngOnInit() {
    console.log(this.data.event_data[0]);
    this.eventId = this.data.event_data[0].eventId;
    this.eventName = this.data.event_data[0].eventName;
    this.circuitName = this.data.event_data[0].circuitName;
    this.seasonId = this.data.event_data[0].seasonId;

    this.dateSessionStart = this.data.event_data[0].eventStart;
    this.dateSessionEnd = this.data.event_data[0].eventEnd;

    this._locale.set('fr');
    this._adapter.setLocale(this._locale());
  }

  onNoClick(): void {
    let submit = {
      "eventName": this.eventName,
      "eventId": this.eventId,
      "circuitName": this.circuitName,
      "seasonId": this.seasonId,
      "dateSessionStart": this.range.controls.start,
      "dateSessionEnd": this.range.controls.end,
    }
    this.dialogRef.close(submit);
  }
}

@Component({
  selector: 'dialog-animations-example-dialog',
  templateUrl: './modal-event/delete-event.html',
  styleUrl: './event.component.scss',
  imports: [MatButtonModule, MatDialogActions, MatDialogClose,
    MatDialogTitle, MatTabsModule,
    FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatCheckboxModule, MatRadioModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAnimationsModalDelete {

  eventId: string = ''

  readonly dialogRef = inject(MatDialogRef<DialogAnimationsModalDelete>);
  readonly data:any = inject<eventModel>(MAT_DIALOG_DATA);

  ngOnInit() {
    console.log(this.data.event_id);
    this.eventId = this.data.event_id;
  }

  onSubmit(): void {
    this.dialogRef.close(this.eventId);
  }
}


import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, ViewChild } from '@angular/core';
import { DateRangePipe } from '../../../utility/date-range.pipe';
import { EventService } from '../../../service/event.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { TimeService } from '../../../service/time.service';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatIcon, MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { CommonModule } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { Subscription } from 'rxjs';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ApiConfigData } from '../../../model/api-response-model';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { AuthService } from '../../../core/auth/auth.service';
import { configAFRModel } from '../config-afr-modal/config-afr-modal.component';

@Component({
  selector: 'app-admin-config',
  imports: [MatCardModule, MatChipsModule, MatProgressBarModule, MatPaginatorModule, CommonModule
    , MatIconModule ,MatBadgeModule, MatButtonModule, MatToolbarModule, MatTableModule, MatSortModule
    , FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule
    , MatSlideToggleModule, MatMenuModule],
  templateUrl: './admin-config.component.html',
  styleUrl: './admin-config.component.scss'
})
export class AdminConfigComponent implements OnInit, AfterViewInit {
  private _liveAnnouncer = inject(LiveAnnouncer);
  private subscriptions: Subscription[] = [];

  configAFR: any;

  configName:string = ''
  formCode:string = ''
  description:string = ''
  valueNewData:string = ''

  constructor(private router: Router, private route: ActivatedRoute,
      private eventService: EventService, private toastr: ToastrService, public time: TimeService) {
  }

  dataSource = new MatTableDataSource<ApiConfigData>([]);
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  readonly dialog = inject(MatDialog);

  displayedColumns: string[] = [
    'form_code',
    'config_name',
    'value',
    'description',
    'setting',
  ];

  async loadAndApplyConfig() {
    const form_code = ``
    const MatchSub = this.eventService.getConfigAdmin(form_code).subscribe(
      config => {
        this.configAFR = [];
        this.configAFR = config;
        this.dataSource.data  = this.configAFR;
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  ngOnInit() {
    this.loadAndApplyConfig();

  }

  searchFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'form_code': return Number(item.form_code);
        case 'config_name': return Number(item.config_name);
        case 'value': return Number(item.value);
        case 'description': return Number(item.description);
        default: return (item as any)[property];
      }
    };
  }


  openEdit(enterAnimationDuration: string, exitAnimationDuration: string, configId: any = 0): void {
    let arrayData: any[] = [];
    if(configId){
      arrayData = this.configAFR.filter((x: any) => x.id == configId);
    }

    const dialogRef = this.dialog.open(ConfigAfrModalUpdateComponent, {
      width: "100vw",
      maxWidth: "450px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {listConfig: arrayData}
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if(result == 'success'){
        // this.toastr.success('แก้ไข Event เรียบร้อย')
        this.loadAndApplyConfig();

        // this.loadEvent();
      }
    });
  }

  openDelete(enterAnimationDuration: string, exitAnimationDuration: string, configId: any): void {
    let arrayData =  this.configAFR.filter((x: any) => x.id == configId);
    const dialogRef = this.dialog.open(DialogAnimationsModalDelete, {
      width: "100vw",
      maxWidth: "350px",
      enterAnimationDuration,
      exitAnimationDuration,
      data: {config_id: configId, config_name: arrayData[0].config_name}
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed');
      this.loadAndApplyConfig();

      // this.allEvent = this.allEvent.filter(e => e.event_id !== result);
    });
  }

  announceSortChange(sortState: Sort) {
    if (sortState.direction) {
      this._liveAnnouncer.announce(`Sorted ${sortState.direction}ending`);
    } else {
      this._liveAnnouncer.announce('Sorting cleared');
    }
  }


  saveConfig(){
    const payload = {
      id: null,
      config_name: this.configName,
      form_code: this.formCode,
      description: this.description,
      value: this.valueNewData,
    }

    this.eventService.addNewConfig(payload).subscribe(
        response => {
          console.log('added Event successfully:', response);
          this.toastr.success(`เพิ่ม Config ${this.configName} เรียบร้อยแล้ว`);
          this.configName = '';
          this.formCode = '';
          this.description = '';
          this.valueNewData = '';
          this.loadAndApplyConfig();
        },
        error => {
          console.error('Error adding/updating match:', error);
            this.toastr.error('เกิดข้อผิดพลาดในการเพิ่ม Config');
        }
      );
  }
}



@Component({
  selector: 'dialog-animations-example-dialog',
  templateUrl: './modal/delete-config.html',
  styleUrl: './admin-config.component.scss',
  imports: [MatButtonModule, MatDialogContent, MatDialogClose,
    MatDialogTitle, MatTabsModule, MatIcon,
    FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,
    MatDatepickerModule, MatCheckboxModule, MatRadioModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAnimationsModalDelete {

  configID : string = ''
  configName: string = ''

  readonly dialogRef = inject(MatDialogRef<DialogAnimationsModalDelete>);
  readonly data:any = inject<configAFRModel>(MAT_DIALOG_DATA);
  password: string = '';
  hide = true;
  constructor(private eventService: EventService,   private authService: AuthService,private toastr: ToastrService) {}

  ngOnInit() {
    console.log(this.data.config_id);
    this.configID = this.data.config_id;
    this.configName  = this.data.config_name ;
  }

  onDelete(): void {
    if (!this.authService.validatePassword(this.password)) {
       this.toastr.error('รหัสผ่านไม่ถูกต้อง');
      return;
    }
    const payload = {
      id : this.configID,
      config_ame : this.configName
    }

    this.eventService.deleteEvent(payload).subscribe(
        response => {
          console.log('Event added/updated successfully:', response);
          this.toastr.success(`ลบ Config ${this.configName} สำเร็จ`);
          this.dialogRef.close(this.configID);
        },
        error => {
          console.error('Error adding/updating match:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ ลบ Config');
        }
    );
  }
}


@Component({
  imports: [MatButtonModule, MatDialogClose,
    MatDialogContent, MatDialogTitle, FormsModule, MatTabsModule,   MatDialogActions,
    MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,

  ],
  selector: 'dialog-animations-delete-config-dialog',
  templateUrl: './modal/update-config.html',
  styleUrl: './admin-config.component.scss',
})
export class ConfigAfrModalUpdateComponent  implements OnInit {

  configAFR : any[] = []
  configName: string = ''
  valueDate: string = ''
  description: string = ''
  readonly dialogRef = inject(MatDialogRef<ConfigAfrModalUpdateComponent>);
  readonly data:any = inject<configAFRModel>(MAT_DIALOG_DATA);

  constructor(private eventService: EventService,   private authService: AuthService,private toastr: ToastrService) {}

  ngOnInit() {
    console.log(this.data.listConfig);
    this.configAFR = this.data.listConfig;
    this.configName = this.configAFR[0].config_name
    this.valueDate = this.configAFR[0].value
    this.description = this.configAFR[0].description

  }


  submitUpdateConfig(){
    this.configAFR[0].config_name = this.configName;
    this.configAFR[0].value = this.valueDate;
    this.configAFR[0].description = this.description;

    this.eventService.updateConfig(this.configAFR).subscribe(
        response => {
          console.log('Update Config successfully:', response);
          // this.toastr.success(`Reset Count Logger ${this.loggerId} สำเร็จ`);
          this.toastr.success('Update Config สำเร็จ');
          this.dialogRef.close('success');
        },
        error => {
          console.error('Error Update Config:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ Update Config');
        }
    );
  }

}

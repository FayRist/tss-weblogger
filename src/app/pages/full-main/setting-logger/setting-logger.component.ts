import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { AddLoggerComponent } from './add-logger/add-logger.component';
import { EditLoggerComponent } from './edit-logger/edit-logger.component';
import { DeleteLoggerComponent } from './delete-logger/delete-logger.component';
import { LoggerModel } from '../../../model/season-model';
import { EventService } from '../../../service/event.service';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

export interface DialogLoggerData {
  id: number;
  loggerId: string;
  carNumber: string;
  firstName: string;
  lastName: string;
}

@Component({
  selector: 'app-setting-logger',
  imports: [MatCardModule,MatMenuModule, MatSelectModule
    , MatButtonModule, MatIconModule],
  templateUrl: './setting-logger.component.html',
  styleUrl: './setting-logger.component.scss'
})
export class SettingLoggerComponent implements OnInit {
  readonly dialog = inject(MatDialog);
  private subscriptions: Subscription[] = [];
  loggerData: LoggerModel[] = [];

  allLoggers: LoggerModel[] = [
    {
      id: 1,
      firstName: "ทดสอบ1",
      lastName: "Test01",
      carNumber: "1",
      loggerId: "Client121",
      createdDate: new Date(10/9/2025),
      numberWarning: 2,
      warningDetector: false,

    },{
      id: 4,
      firstName: "ทดสอบ4",
      lastName: "Test04",
      carNumber: "4",
      loggerId: "Client124",
      createdDate: new Date(10/9/2025),
      numberWarning: 0,
      warningDetector: false,
    },
  ];

  constructor(
    // private router: Router, private route: ActivatedRoute,
    private eventService: EventService, private toastr: ToastrService) {

  }
  ngOnInit() {
    this.loadLogger();
  }

  addLogger(enterAnimationDuration: string, exitAnimationDuration: string): void {
      const dialogRef = this.dialog.open(AddLoggerComponent, {
      width: '100vw', maxWidth: '750px',
      enterAnimationDuration, exitAnimationDuration,
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed');
      if(result == 'success'){
        this.loadLogger();
      }
    });
  }

  settingLogger(enterAnimationDuration: string, exitAnimationDuration: string, loggerId:any): void {
    let arrayData = this.allLoggers.filter(x => x.loggerId == loggerId);
    const dialogRef = this.dialog.open(EditLoggerComponent, {
      width: '100vw', maxWidth: '350px',
      enterAnimationDuration, exitAnimationDuration,
        data: {id:arrayData[0].id ,firstName: arrayData[0].firstName, lastName: arrayData[0].lastName, carNumber: arrayData[0].carNumber, loggerId: arrayData[0].loggerId},
      });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if(result == 'success'){
        this.toastr.success(`แก้ไขข้ออมูล ${arrayData[0].loggerId} สำเร็จ`);
        this.loadLogger();
      }
    });
  }

  deleteLogger(enterAnimationDuration: string, exitAnimationDuration: string, loggerId:any): void {
    let arrayData = this.allLoggers.filter(x => x.loggerId == loggerId);
      const dialogRef = this.dialog.open(DeleteLoggerComponent, {
      width: '100vw', maxWidth: '150px',
      enterAnimationDuration, exitAnimationDuration,
        data: {loggerId: arrayData[0].loggerId},
    });

    dialogRef.afterClosed().subscribe(result => {
      // console.log('The dialog was closed');
      if(result == 'success'){
        this.loadLogger();
      }
    });
  }

  loadLogger(){
    this.allLoggers = []
    const loggerData = this.eventService.getLogger('PickupA').subscribe(
      loggerRes => {
        this.allLoggers = loggerRes;
      },
      error => {
        console.error('Error loading matchList:', error);
      }
    );
    this.subscriptions.push(loggerData);
  }

}


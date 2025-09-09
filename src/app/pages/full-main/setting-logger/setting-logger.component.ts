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

export interface DialogLoggerData {
  loggerId: string;
  carNumber: string;
  name: string;
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
    // {
    //   id: 1,
    //   firstName: "ทดสอบ1",
    //   lastName: "Test01",
    //   carNumber: "1",
    //   loggerId: "Client121",
    //   createdDate: new Date(10/9/2025),
    //   numberWarning: 2,
    //   warningDetector: false,

    // },{
    //   id: 2,
    //   firstName: "ทดสอบ2",
    //   lastName: "Test02",
    //   carNumber: "2",
    //   loggerId: "Client122",
    //   createdDate: new Date(10/9/2025),
    //   numberWarning: 3,
    //   warningDetector: false,
    // },{
    //   id: 3,
    //   firstName: "ทดสอบ3",
    //   lastName: "Test03",
    //   carNumber: "3",
    //   loggerId: "Client123",
    //   createdDate: new Date(10/9/2025),
    //   numberWarning: 3,
    //   warningDetector: false,
    // },{
    //   id: 4,
    //   firstName: "ทดสอบ4",
    //   lastName: "Test04",
    //   carNumber: "4",
    //   loggerId: "Client124",
    //   createdDate: new Date(10/9/2025),
    //   numberWarning: 0,
    //   warningDetector: false,
    // },
  ];

  constructor(private router: Router, private route: ActivatedRoute, private eventService: EventService) {

  }
  ngOnInit() {
    this.loadLogger();
  }

  addLogger(enterAnimationDuration: string, exitAnimationDuration: string): void {
      const dialogRef = this.dialog.open(AddLoggerComponent, {
      width: '100vw', maxWidth: '750px',
      enterAnimationDuration, exitAnimationDuration,
    });
  }

  settingLogger(enterAnimationDuration: string, exitAnimationDuration: string, loggerId:any): void {
    let arrayData = this.allLoggers.filter(x => x.loggerId == loggerId);
       const dialogRef = this.dialog.open(EditLoggerComponent, {
      width: '100vw', maxWidth: '350px',
      enterAnimationDuration, exitAnimationDuration,
        data: {name: arrayData[0].firstName, carNumber: arrayData[0].carNumber, loggerId: arrayData[0].loggerId},
      });
  }

  deleteLogger(enterAnimationDuration: string, exitAnimationDuration: string, loggerId:any): void {
    let arrayData = this.allLoggers.filter(x => x.loggerId == loggerId);
       const dialogRef = this.dialog.open(DeleteLoggerComponent, {
      width: '100vw', maxWidth: '150px',
      enterAnimationDuration, exitAnimationDuration,
        data: {loggerId: arrayData[0].loggerId},
    });
  }

  loadLogger(){
    const loggerData = this.eventService.getLogger().subscribe(
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


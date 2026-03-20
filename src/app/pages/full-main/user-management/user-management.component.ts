import { CLASS_SEGMENT_LIST } from './../../../constants/race-data';
import { UserManagementService } from './../../../service/user-management.service';
import { AfterViewInit, Component, OnInit, ViewChild, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { combineLatest, interval, Observable, Subscription, firstValueFrom } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastrService } from 'ngx-toastr';


export interface UserModel {
  id: number;
  username: string;
  passwordHash: string;
  email: string;
  roleId: number;
  createdAt: string;
}

export interface RoleModel {
  id: number;
  name: string;
  description: string;
}

export interface PermissionModel {
  id: number;
  permissionsName: string;
  description: string;
}

export interface UserAdminPermissionModel {
  id: number;
  roleId: number;
  permissionId: number;
  permission: string;
}

export interface UserRacePermissionModel {
  id: number;
  userId: number;
  raceId: number;
  carNumber: number;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss'
})
export class UserManagementComponent implements OnInit, AfterViewInit {
  private _liveAnnouncer = inject(LiveAnnouncer);
  readonly dialog = inject(MatDialog);

  displayedColumns: string[] = [
    'id',
    'username',
    'passwordHash',
    'email',
    'roleId',
    'createdAt',
    'setting'
  ];

  users: UserModel[] = [  ];
  permission: PermissionModel[] = [  ];
  userAdminPermission: UserAdminPermissionModel[] = [  ];

  dataSource = new MatTableDataSource<UserModel>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  private subscriptions: Subscription[] = [];
  private sub!: Subscription;


  constructor(
    private userManagementService: UserManagementService
  ) {
  }

  ngOnInit(): void {
    const MatchSub = this.userManagementService.getUser().subscribe(
      res  => {
        this.users = res
        this.dataSource.data = this.users;
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);

  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'id':
          return Number(item.id);
        case 'roleId':
          return Number(item.roleId);
        default:
          return (item as any)[property] ?? '';
      }
    };
  }

  searchFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  announceSortChange(sortState: Sort): void {
    if (sortState.direction) {
      this._liveAnnouncer.announce(`Sorted ${sortState.direction}ending`);
    } else {
      this._liveAnnouncer.announce('Sorting cleared');
    }
  }

  maskedPassword(): string {
    return '*****';
  }

  openAddUser(): void {
    // Placeholder: user will implement add flow
  }

  loadUser(): void {
    const MatchSub = this.userManagementService.getUser().subscribe(
      res  => {
        this.users = res
        this.dataSource.data = this.users;
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);
  }

  loadUserAdminPermission(): void {
    const MatchSub = this.userManagementService.getUserAdminPermission().subscribe(
      res  => {
        this.userAdminPermission = res
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);
  }


  // loadPermission(): void {
  //   const MatchSub = this.userManagementService.getPermission().subscribe(
  //     res  => {
  //       this.permission = res
  //     },
  //     error => {
  //       console.error('Error loading matchList:', error);
  //       // Fallback to mock data if API fails
  //       // this.matchList = this.eventService.getMatchSync();
  //     }
  //   );
  //   this.subscriptions.push(MatchSub);
  // }

    openEdit(enterAnimationDuration: string, exitAnimationDuration: string, userId: any = 0): void {
      let arrayData: any[] = [];
      if(userId){
        arrayData = this.users.filter((x: any) => x.id == userId);
      }

      const dialogRef = this.dialog.open(UserModalUpdateComponent, {
        width: "100vw",
        maxWidth: "450px",
        enterAnimationDuration,
        exitAnimationDuration,
        data: {listConfig: arrayData}
      });

      dialogRef.afterClosed().subscribe(result => {
        // console.log('The dialog was closed');
        if(result == 'success'){
          this.loadUser();
        }
      });
    }

    openDelete(enterAnimationDuration: string, exitAnimationDuration: string, configId: any): void {
      // let arrayData =  this.configAFR.filter((x: any) => x.id == configId);
      // const dialogRef = this.dialog.open(DialogAnimationsModalDelete, {
      //   width: "100vw",
      //   maxWidth: "350px",
      //   enterAnimationDuration,
      //   exitAnimationDuration,
      //   data: {config_id: configId, config_name: arrayData[0].config_name}
      // });

      // dialogRef.afterClosed().subscribe(result => {
      //   console.log('The dialog was closed');
      //     this.loadUser();

      //   // this.allEvent = this.allEvent.filter(e => e.event_id !== result);
      // });
    }




}


@Component({
  imports: [MatButtonModule, MatDialogClose,
    MatDialogContent, MatDialogTitle, FormsModule, MatTabsModule,   MatDialogActions,
    MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule,

  ],
  selector: 'dialog-animations-update-user-dialog',
  templateUrl: './modal/update-user.html',
  styleUrl: './user-management.component.scss',
})
export class UserModalUpdateComponent  implements OnInit {

  userData : any[] = []
  valueDate: string = ''
  description: string = ''

  userName: string = '';
  password: string = '';
  passwordHx: string = '';
  roleId: number = 0;
  userEmail : string = '';

  roleList: any[] = [];


  readonly dialogRef = inject(MatDialogRef<UserModalUpdateComponent>);
  readonly data:any = inject<UserModel>(MAT_DIALOG_DATA);
  private subscriptions: Subscription[] = [];

  constructor(
    private userManagementService: UserManagementService,
    private authService: AuthService,
    private toastr: ToastrService
  ) {}

  ngOnInit() {
    this.loadRole();
    let user =this.data.listConfig[0]
    this.userName = user.username;
    this.password = user.passwordHash;
    this.roleId = user.roleId;
    this.userEmail = user.email;
  }


  loadRole(): void {
    const MatchSub = this.userManagementService.getRole().subscribe(
      res  => {
        this.roleList = res
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);
  }


  submitUpdateUser(){
    // this.userData[0].config_name = this.configName;
    // this.userData[0].value = this.valueDate;
    // this.userData[0].description = this.description;

    // this.userManagementService.(this.userData).subscribe(
    //     response => {
    //       console.log('Update Config successfully:', response);
    //       // this.toastr.success(`Reset Count Logger ${this.loggerId} สำเร็จ`);
    //       this.toastr.success('Update Config สำเร็จ');
    //       this.dialogRef.close('success');
    //     },
    //     error => {
    //       console.error('Error Update Config:', error);
    //       this.toastr.error('เกิดข้อผิดพลาดในการ Update Config');
    //     }
    // );
  }

}

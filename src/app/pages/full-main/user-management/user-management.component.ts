import { CLASS_SEGMENT_LIST } from './../../../constants/race-data';
import { UserManagementService, UserRacePermissionRowModel } from './../../../service/user-management.service';
import { EventService } from './../../../service/event.service';
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
import { MatIconModule } from '@angular/material/icon';
import { eventModel } from '../../../model/season-model';


export interface UserModel {
  id: number;
  username: string;
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
    'email',
    'roleId',
    'createdAt',
    'setting'
  ];

  users: UserModel[] = [  ];
  permission: PermissionModel[] = [  ];
  userAdminPermission: UserAdminPermissionModel[] = [  ];

  dataSource = new MatTableDataSource<UserModel>([]);
  roleList: any[] = [];
  private roleNameMap = new Map<number, string>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  private subscriptions: Subscription[] = [];
  private sub!: Subscription;


  constructor(
    private userManagementService: UserManagementService
  ) {
  }

  ngOnInit(): void {
    this.loadRole();
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

  loadRole(): void {
    const MatchSub = this.userManagementService.getRole().subscribe(
      res  => {
        this.roleList = res;
        this.roleNameMap.clear();
        this.roleList.forEach((role: any) => {
          this.roleNameMap.set(Number(role.value), String(role.name ?? ''));
        });
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);
  }

  getRoleName(roleId: number): string {
    return this.roleNameMap.get(Number(roleId)) || '-';
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

  openAddUser(): void {
    const dialogRef = this.dialog.open(UserModalUpdateComponent, {
      width: "100vw",
      maxWidth: "450px",
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
      data: { mode: 'create', listConfig: [] }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'success') {
        this.loadUser();
      }
    });
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
        data: { mode: 'update', listConfig: arrayData }
      });

      dialogRef.afterClosed().subscribe(result => {
        // console.log('The dialog was closed');
        if(result == 'success'){
          this.loadUser();
        }
      });
    }

    openDelete(enterAnimationDuration: string, exitAnimationDuration: string, userId: any = 0): void {
      let arrayData: any[] = [];
      if(userId){
        arrayData = this.users.filter((x: any) => x.id == userId);
      }

      const dialogRef = this.dialog.open(UserModalDelteComponent, {
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

    openRacePermission(enterAnimationDuration: string, exitAnimationDuration: string, userId: any = 0): void {
      let arrayData: any[] = [];
      if (userId) {
        arrayData = this.users.filter((x: any) => x.id == userId);
      }

      const dialogRef = this.dialog.open(UserRacePermissionListModalComponent, {
        width: '100vw',
        maxWidth: '550px',
        enterAnimationDuration,
        exitAnimationDuration,
        data: { listConfig: arrayData },
      });

      dialogRef.afterClosed().subscribe(() => {});
    }




}

@Component({
  imports: [
    MatButtonModule,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatDialogActions,
  ],
  selector: 'dialog-user-race-permission-list',
  templateUrl: './modal/user-race-permission-list.html',
  styleUrl: './user-management.component.scss',
})
export class UserRacePermissionListModalComponent implements OnInit {
  userId = 0;
  userName = '';
  rows: UserRacePermissionRowModel[] = [];
  eventRows: Array<{
    eventId: number;
    eventName: string;
    carNumbers: number[];
    loggerCount: number;
  }> = [];

  readonly dialogRef = inject(MatDialogRef<UserRacePermissionListModalComponent>);
  readonly data: any = inject<UserModel>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialog);

  constructor(
    private userManagementService: UserManagementService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    const user = this.data?.listConfig?.[0];
    this.userId = Number(user?.id ?? 0);
    this.userName = String(user?.username ?? '');
    this.loadRows();
  }

  loadRows(): void {
    if (!this.userId) {
      this.rows = [];
      return;
    }
    this.userManagementService.getUserRacePermissionRows(this.userId).subscribe({
      next: (rows) => {
        this.rows = rows || [];
        this.buildEventRows();
      },
      error: () => this.toastr.error('โหลดรายการสิทธิ์ไม่สำเร็จ'),
    });
  }

  private buildEventRows(): void {
    const byEvent = new Map<number, UserRacePermissionRowModel[]>();
    for (const row of this.rows) {
      const key = Number(row.eventId);
      if (!byEvent.has(key)) {
        byEvent.set(key, []);
      }
      byEvent.get(key)!.push(row);
    }

    this.eventRows = Array.from(byEvent.values()).map((items) => {
      const sample = items[0];
      const nbrSet = new Set(items.map((x) => String(x.carNumber || '').trim()).filter(Boolean));

      return {
        eventId: Number(sample.eventId),
        eventName: String(sample.eventName || '-'),
        carNumbers: Array.from(nbrSet).map((x) => Number(x)).filter((x) => Number.isFinite(x)),
        loggerCount: nbrSet.size,
      };
    }).sort((a, b) => a.eventName.localeCompare(b.eventName));
  }

  openAdd(): void {
    const dialogRef = this.dialog.open(UserRacePermissionModalComponent, {
      width: '100vw',
      maxWidth: '850px',
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
      data: {
        mode: 'create',
        listConfig: [{ id: this.userId, username: this.userName }],
      },
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result === 'success') {
        this.loadRows();
      }
    });
  }

  openEditByEvent(row: { eventId: number; carNumbers: number[] }): void {
    const dialogRef = this.dialog.open(UserRacePermissionModalComponent, {
      width: '100vw',
      maxWidth: '850px',
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
      data: {
        mode: 'edit',
        lockEventRace: true,
        initialEventId: row.eventId,
        initialCarNumbers: row.carNumbers || [],
        listConfig: [{ id: this.userId, username: this.userName }],
      },
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result === 'success') {
        this.loadRows();
      }
    });
  }
}

@Component({
  imports: [
    MatButtonModule,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    FormsModule,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  selector: 'dialog-user-race-permission',
  templateUrl: './modal/user-race-permission.html',
  styleUrl: './user-management.component.scss',
})
export class UserRacePermissionModalComponent implements OnInit {
  userId = 0;
  userName = '';
  selectedEventId = 0;
  selectedCarNumbers: number[] = [];
  mode: 'create' | 'edit' = 'create';
  lockEventRace = false;
  initialCarNumbers: number[] = [];

  eventList: eventModel[] = [];
  loggerCandidates: Array<{ carNumber: number; loggerId: string; driverName: string }> = [];

  readonly dialogRef = inject(MatDialogRef<UserRacePermissionModalComponent>);
  readonly data: any = inject<UserModel>(MAT_DIALOG_DATA);

  constructor(
    private eventService: EventService,
    private userManagementService: UserManagementService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    const user = this.data?.listConfig?.[0];
    this.userId = Number(user?.id ?? 0);
    this.userName = String(user?.username ?? '');
    this.mode = this.data?.mode === 'edit' ? 'edit' : 'create';
    this.lockEventRace = Boolean(this.data?.lockEventRace);

    this.selectedEventId = Number(this.data?.initialEventId ?? 0);
    this.initialCarNumbers = Array.isArray(this.data?.initialCarNumbers)
      ? this.data.initialCarNumbers.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x))
      : [];
    this.selectedCarNumbers = [...this.initialCarNumbers];

    this.loadEvents();

    if (this.selectedEventId) {
      this.onEventChange(true);
    }
  }

  loadEvents(): void {
    this.eventService.getEvent().subscribe({
      next: (events) => {
        this.eventList = events || [];
      },
      error: () => this.toastr.error('โหลดรายการ Event ไม่สำเร็จ'),
    });
  }

  onEventChange(_keepRace = false): void {
    this.selectedCarNumbers = [];
    this.loggerCandidates = [];
    if (!this.selectedEventId) {
      return;
    }

    this.userManagementService.getRaceLoggerCandidates(this.selectedEventId).subscribe({
      next: (rows) => {
        this.loggerCandidates = rows || [];
        if (this.mode === 'edit' && this.initialCarNumbers.length > 0) {
          const candidateSet = new Set(this.loggerCandidates.map((x) => x.carNumber));
          this.selectedCarNumbers = this.initialCarNumbers.filter((c) => candidateSet.has(c));
        }
      },
      error: () => this.toastr.error('โหลดรายการ Logger ไม่สำเร็จ'),
    });
  }

  savePermissions(): void {
    if (!this.userId) {
      this.toastr.error('ไม่พบข้อมูลผู้ใช้');
      return;
    }
    if (!this.selectedEventId) {
      this.toastr.error('กรุณาเลือก Event');
      return;
    }

    const payload = {
      user_id: this.userId,
      event_id: this.selectedEventId,
      car_numbers: [...this.selectedCarNumbers].map(Number).filter((n) => Number.isFinite(n)),
    };

    this.userManagementService.setUserRacePermissions(payload).subscribe({
      next: () => {
        this.toastr.success(this.mode === 'edit' ? 'อัปเดตสิทธิ์สำเร็จ' : 'บันทึกสิทธิ์การมองเห็นรถสำเร็จ');
        this.dialogRef.close('success');
      },
      error: (err) => {
        const description = err?.error?.description;
        this.toastr.error(description || 'บันทึกสิทธิ์ไม่สำเร็จ');
      },
    });
  }
}


@Component({
  imports: [MatButtonModule, MatDialogClose,
    MatDialogContent, MatDialogTitle, FormsModule, MatTabsModule,   MatDialogActions,
    MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule, MatIconModule,

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
  currentUserId: number = 0;
  newPassword: string = '';
  hideNewPassword = true;
  roleId: number = 0;
  userEmail : string = '';
  mode: 'create' | 'update' = 'update';

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
    this.mode = this.data?.mode === 'create' ? 'create' : 'update';

    if (this.mode === 'update') {
      const user = this.data?.listConfig?.[0];
      this.currentUserId = Number(user?.id ?? 0);
      this.userName = String(user?.username ?? '');
      this.roleId = Number(user?.roleId ?? 0);
      this.userEmail = String(user?.email ?? '');
    } else {
      this.currentUserId = 0;
      this.userName = '';
      this.roleId = 0;
      this.userEmail = '';
    }
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


  submitUser(){
    const username = String(this.userName ?? '').trim();
    const trimmedPassword = String(this.newPassword ?? '').trim();
    const email = String(this.userEmail ?? '').trim();
    const roleId = Number(this.roleId);

    if (this.mode === 'create' && !username) {
      this.toastr.error('กรุณากรอก Username');
      return;
    }

    if (!roleId) {
      this.toastr.error('กรุณาเลือก Role');
      return;
    }

    if (this.mode === 'create') {
      if (trimmedPassword.length < 8 || trimmedPassword.length > 16) {
        this.toastr.error('รหัสผ่านใหม่ต้องมีความยาว 8-16 ตัวอักษร');
        return;
      }

      const createPayload = {
        username,
        email,
        role_id: roleId,
        new_password: trimmedPassword,
      };

      this.userManagementService.addUser(createPayload).subscribe(
        () => {
          this.toastr.success('เพิ่มผู้ใช้สำเร็จ');
          this.dialogRef.close('success');
        },
        (error) => {
          console.error('Error add user:', error);
          const description = error?.error?.description;
          this.toastr.error(description || 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้');
        }
      );
      return;
    }

    if (!this.currentUserId) {
      this.toastr.error('ไม่พบข้อมูลผู้ใช้ที่ต้องการอัปเดต');
      return;
    }

    if (trimmedPassword && (trimmedPassword.length < 8 || trimmedPassword.length > 16)) {
      this.toastr.error('รหัสผ่านใหม่ต้องมีความยาว 8-16 ตัวอักษร');
      return;
    }

    const updatePayload: any = {
      id: this.currentUserId,
      email,
      role_id: roleId,
    };
    if (trimmedPassword) {
      updatePayload.new_password = trimmedPassword;
    }

    this.userManagementService.updateUser(updatePayload).subscribe(
      () => {
        this.toastr.success('อัปเดตข้อมูลผู้ใช้สำเร็จ');
        this.dialogRef.close('success');
      },
      (error) => {
        console.error('Error update user:', error);
        const description = error?.error?.description;
        this.toastr.error(description || 'เกิดข้อผิดพลาดในการอัปเดตผู้ใช้');
      }
    );
  }

}


@Component({
  imports: [MatButtonModule, MatDialogClose,
    MatDialogContent, MatDialogTitle, FormsModule, MatTabsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule, MatIconModule,

  ],
  selector: 'dialog-animations-update-user-dialog',
  templateUrl: './modal/delete-user.html',
  styleUrl: './user-management.component.scss',
})
export class UserModalDelteComponent  implements OnInit {
  userName: string = '';
  currentUserId: number = 0;
  roleId: number = 0;
  userEmail : string = '';
  userId: number = 0;
  password : string = '';

  readonly dialogRef = inject(MatDialogRef<UserModalUpdateComponent>);
  readonly data:any = inject<UserModel>(MAT_DIALOG_DATA);
  private subscriptions: Subscription[] = [];

  hide = true;
  constructor(private userManagementService: UserManagementService,   private authService: AuthService,private toastr: ToastrService) {}

  ngOnInit() {
    console.log(this.data.event_id);
    let user = this.data.listConfig[0]
    this.userId = Number(user.id ?? 0);
    this.userName = user.username;
    this.roleId = user.roleId;
    this.userEmail = user.email;
  }

  onDelete(): void {
    if (!this.authService.validatePassword(this.password)) {
      this.toastr.error('รหัสผ่านไม่ถูกต้อง');
      return;
    }

    const payload: any = {
      id: this.userId,
      username: this.userName,
      email: String(this.userEmail ?? '').trim(),
      role_id: Number(this.roleId),
    };

    this.userManagementService.deleteUser(payload).subscribe(
        response => {
          console.log('Event added/updated successfully:', response);
          this.toastr.success(`ลบ User ${this.userId} สำเร็จ`);
          this.dialogRef.close('success');
        },
        error => {
          console.error('Error adding/updating match:', error);
          this.toastr.error('เกิดข้อผิดพลาดในการ ลบ Logger');
        }
    );
  }


}

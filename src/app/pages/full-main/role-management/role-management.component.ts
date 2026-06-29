import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, Inject, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { forkJoin } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AuthService, PermissionItem } from '../../../core/auth/auth.service';
import {
  RoleManagementPermissionModel,
  RoleManagementRoleModel,
  RoleManagementService,
  RolePermissionModel,
  SavePermissionPayload,
  SaveRolePayload,
} from '../../../service/role-management.service';

interface PermissionFormGroup {
  formCode: string;
  permissions: RoleManagementPermissionModel[];
}

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    MatTabsModule,
  ],
  templateUrl: './role-management.component.html',
  styleUrl: './role-management.component.scss',
})
export class RoleManagementComponent implements OnInit {
  private readonly liveAnnouncer = inject(LiveAnnouncer);
  readonly dialog = inject(MatDialog);

  roleDisplayedColumns = ['id', 'name', 'roleType', 'setting'];
  permissionDisplayedColumns = ['id', 'permissionsName', 'path', 'type', 'formCode', 'active', 'setting'];

  roles: RoleManagementRoleModel[] = [];
  permissions: RoleManagementPermissionModel[] = [];
  rolePermissions: RolePermissionModel[] = [];
  permissionsListData: PermissionItem[] = [];

  roleDataSource = new MatTableDataSource<RoleManagementRoleModel>([]);
  permissionDataSource = new MatTableDataSource<RoleManagementPermissionModel>([]);

  @ViewChild('rolesPaginator') rolesPaginator!: MatPaginator;
  @ViewChild('rolesSort') rolesSort!: MatSort;
  @ViewChild('permissionsPaginator') permissionsPaginator!: MatPaginator;
  @ViewChild('permissionsSort') permissionsSort!: MatSort;

  constructor(
    private roleManagementService: RoleManagementService,
    private auth: AuthService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.permissionsListData = this.auth.getPermissionsByPath('pages/role-management');
    this.configureDataSources();
    this.loadAll();
  }

  private configureDataSources(): void {
    this.roleDataSource.sortingDataAccessor = (item, property) => {
      if (property === 'id') return Number(item.id);
      return String((item as any)[property] ?? '').toLowerCase();
    };

    this.permissionDataSource.sortingDataAccessor = (item, property) => {
      if (property === 'id') return Number(item.id);
      if (property === 'active') return Number(item.active);
      return String((item as any)[property] ?? '').toLowerCase();
    };

    this.permissionDataSource.filterPredicate = (item, filter) => {
      const text = [
        item.id,
        item.permissionsName,
        item.path,
        item.type,
        item.formCode,
        item.active === 1 ? 'active' : 'inactive',
      ].join(' ').toLowerCase();
      return text.includes(filter);
    };
  }

  ngAfterViewInit(): void {
    this.roleDataSource.paginator = this.rolesPaginator;
    this.roleDataSource.sort = this.rolesSort;
    this.permissionDataSource.paginator = this.permissionsPaginator;
    this.permissionDataSource.sort = this.permissionsSort;
  }

  loadAll(): void {
    forkJoin({
      roles: this.roleManagementService.getRoles(),
      permissions: this.roleManagementService.getPermissions(),
      rolePermissions: this.roleManagementService.getRolePermissions(),
    }).subscribe({
      next: ({ roles, permissions, rolePermissions }) => {
        this.roles = roles;
        this.permissions = permissions;
        this.rolePermissions = rolePermissions;
        this.roleDataSource.data = roles;
        this.permissionDataSource.data = permissions;
      },
      error: (error) => {
        console.error('Error loading role management data:', error);
        this.toastr.error('โหลดข้อมูล Role Management ไม่สำเร็จ');
      },
    });
  }

  permissionsCheck(type: string): boolean {
    return this.permissionsListData.some(p => this.auth.normalizePermissionType(p.type) === this.auth.normalizePermissionType(type));
  }

  searchRoleFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.roleDataSource.filter = filterValue.trim().toLowerCase();
  }

  searchPermissionFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.permissionDataSource.filter = filterValue.trim().toLowerCase();
  }

  announceSortChange(sortState: Sort): void {
    if (sortState.direction) {
      this.liveAnnouncer.announce(`Sorted ${sortState.direction}ending`);
    } else {
      this.liveAnnouncer.announce('Sorting cleared');
    }
  }

  openAddRole(): void {
    const dialogRef = this.dialog.open(RoleModalUpdateComponent, {
      width: '100vw',
      maxWidth: '450px',
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
      data: { mode: 'create' },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'success') this.loadAll();
    });
  }

  openEditRole(roleId: number): void {
    const role = this.roles.find(x => x.id === Number(roleId));
    if (!role) return;

    const dialogRef = this.dialog.open(RoleModalUpdateComponent, {
      width: '100vw',
      maxWidth: '980px',
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
      data: {
        mode: 'update',
        role,
        permissions: this.permissions,
        selectedPermissionIds: this.rolePermissions
          .filter(row => Number(row.roleId) === Number(roleId) && Number(row.active) === 1)
          .map(row => Number(row.permissionsId)),
      },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'success') this.loadAll();
    });
  }

  deleteRole(roleId: number): void {
    const role = this.roles.find(x => x.id === Number(roleId));
    if (!role) return;
    if (!window.confirm(`ยืนยันลบ role: ${role.name} ?`)) return;

    this.roleManagementService.deleteRole(role.id).subscribe({
      next: () => {
        this.toastr.success('ลบ Role สำเร็จ');
        this.loadAll();
      },
      error: (error) => {
        console.error('Error deleting role:', error);
        this.toastr.error(error?.error?.description || 'ลบ Role ไม่สำเร็จ');
      },
    });
  }

  openAddPermission(): void {
    const dialogRef = this.dialog.open(PermissionModalUpdateComponent, {
      width: '100vw',
      maxWidth: '520px',
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
      data: { mode: 'create' },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'success') this.loadAll();
    });
  }

  openEditPermission(permissionId: number): void {
    const permission = this.permissions.find(x => x.id === Number(permissionId));
    if (!permission) return;

    const dialogRef = this.dialog.open(PermissionModalUpdateComponent, {
      width: '100vw',
      maxWidth: '520px',
      enterAnimationDuration: '0ms',
      exitAnimationDuration: '0ms',
      data: { mode: 'update', permission },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'success') this.loadAll();
    });
  }

  togglePermissionActive(permissionId: number): void {
    const permission = this.permissions.find(x => x.id === Number(permissionId));
    if (!permission) return;
    const nextActive = Number(permission.active) === 1 ? 0 : 1;
    const action = nextActive === 1 ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
    if (!window.confirm(`ยืนยัน${action} permission: ${permission.permissionsName} ?`)) return;

    this.roleManagementService.updatePermissionActive(permission.id, nextActive).subscribe({
      next: () => {
        this.toastr.success(`${action} Permission สำเร็จ`);
        this.loadAll();
      },
      error: (error) => {
        console.error('Error toggling permission active:', error);
        this.toastr.error(error?.error?.description || `${action} Permission ไม่สำเร็จ`);
      },
    });
  }

  getActiveText(active: number): string {
    return Number(active) === 1 ? 'Active' : 'Inactive';
  }

  getActiveClass(active: number): string {
    return Number(active) === 1 ? 'badge bg-success' : 'badge bg-secondary';
  }
}

@Component({
  selector: 'app-role-modal-update',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'เพิ่ม Role' : 'แก้ไข Role' }}</h2>
    <div mat-dialog-content>
      <mat-form-field class="w-100">
        <mat-label>Role Name</mat-label>
        <input matInput [(ngModel)]="name" autocomplete="off">
      </mat-form-field>

      <mat-form-field class="w-100">
        <mat-label>Role Type</mat-label>
        <mat-select [(ngModel)]="roleType">
          <mat-option value="admin">Admin</mat-option>
          <mat-option value="user">User</mat-option>
        </mat-select>
      </mat-form-field>

      @if (data.mode === 'update' && roleType === 'admin') {
        <div class="permission-matrix">
          <h4>Permissions</h4>
          @for (group of permissionGroups; track group.formCode) {
            <div class="permission-group">
              <div class="permission-group-title">{{ group.formCode || '-' }}</div>
              <div class="permission-checkbox-grid">
                @for (permission of group.permissions; track permission.id) {
                  <mat-checkbox
                    [checked]="isPermissionChecked(permission.id)"
                    [disabled]="permission.active !== 1"
                    (change)="togglePermission(permission, $event.checked)">
                    {{ permission.type }}
                    <span class="permission-path">{{ permission.path }}</span>
                    @if (permission.active !== 1) {
                      <span class="inactive-label">Inactive</span>
                    }
                  </mat-checkbox>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-raised-button color="primary" type="button" (click)="save()">บันทึก</button>
    </div>
  `,
  styleUrl: './role-management.component.scss',
})
export class RoleModalUpdateComponent {
  name = '';
  roleType: 'admin' | 'user' = 'admin';
  selectedPermissionIds = new Set<number>();
  permissionGroups: PermissionFormGroup[] = [];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: {
      mode: 'create' | 'update';
      role?: RoleManagementRoleModel;
      permissions?: RoleManagementPermissionModel[];
      selectedPermissionIds?: number[];
    },
    private dialogRef: MatDialogRef<RoleModalUpdateComponent>,
    private roleManagementService: RoleManagementService,
    private toastr: ToastrService,
  ) {
    this.name = data.role?.name ?? '';
    this.roleType = data.role?.roleType ?? 'admin';
    this.selectedPermissionIds = new Set((data.selectedPermissionIds ?? []).map(Number));
    this.permissionGroups = this.buildPermissionGroups(data.permissions ?? []);
  }

  isPermissionChecked(permissionId: number): boolean {
    return this.selectedPermissionIds.has(Number(permissionId));
  }

  togglePermission(permission: RoleManagementPermissionModel, checked: boolean): void {
    if (permission.active !== 1) {
      return;
    }
    const id = Number(permission.id);
    if (checked) {
      this.selectedPermissionIds.add(id);
    } else {
      this.selectedPermissionIds.delete(id);
    }
  }

  save(): void {
    const payload: SaveRolePayload = {
      id: this.data.role?.id,
      name: this.name.trim(),
      role_type: this.roleType,
    };

    if (!payload.name) {
      this.toastr.warning('กรุณากรอก Role Name');
      return;
    }

    const request$ = this.data.mode === 'create'
      ? this.roleManagementService.addRole(payload)
      : this.roleManagementService.updateRole(payload);

    request$.subscribe({
      next: () => {
        if (this.data.mode === 'create' || !this.data.role?.id || this.roleType === 'user') {
          this.toastr.success(this.data.mode === 'create' ? 'เพิ่ม Role สำเร็จ' : 'แก้ไข Role สำเร็จ');
          this.dialogRef.close('success');
          return;
        }

        const activePermissionIds = Array.from(this.selectedPermissionIds.values())
          .filter(id => (this.data.permissions ?? []).some(p => p.id === id && p.active === 1))
          .sort((a, b) => a - b);
        this.roleManagementService.setRolePermissions(this.data.role.id, activePermissionIds).subscribe({
          next: () => {
            this.toastr.success('แก้ไข Role สำเร็จ');
            this.dialogRef.close('success');
          },
          error: (error) => {
            console.error('Error saving role permissions:', error);
            this.toastr.error(error?.error?.description || 'บันทึก Role Permissions ไม่สำเร็จ');
          },
        });
      },
      error: (error) => {
        console.error('Error saving role:', error);
        this.toastr.error(error?.error?.description || 'บันทึก Role ไม่สำเร็จ');
      },
    });
  }

  private buildPermissionGroups(permissions: RoleManagementPermissionModel[]): PermissionFormGroup[] {
    const order = ['GET', 'ADD', 'EDIT', 'DELETE', 'IMPORT', 'EXPORT'];
    const groups = new Map<string, RoleManagementPermissionModel[]>();
    for (const permission of permissions) {
      const formCode = permission.formCode || '-';
      const list = groups.get(formCode) ?? [];
      list.push(permission);
      groups.set(formCode, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([formCode, list]) => ({
        formCode,
        permissions: list.sort((a, b) => {
          const orderA = order.indexOf(a.type);
          const orderB = order.indexOf(b.type);
          const rankA = orderA >= 0 ? orderA : order.length;
          const rankB = orderB >= 0 ? orderB : order.length;
          if (rankA !== rankB) return rankA - rankB;
          return a.type.localeCompare(b.type) || a.path.localeCompare(b.path);
        }),
      }));
  }
}

@Component({
  selector: 'app-permission-modal-update',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'เพิ่ม Permission' : 'แก้ไข Permission' }}</h2>
    <div mat-dialog-content>
      <mat-form-field class="w-100">
        <mat-label>Permission Name</mat-label>
        <input matInput [(ngModel)]="permissionsName" autocomplete="off">
      </mat-form-field>

      <mat-form-field class="w-100">
        <mat-label>Path</mat-label>
        <input matInput [(ngModel)]="path" placeholder="pages/role-management" autocomplete="off">
      </mat-form-field>

      <mat-form-field class="w-100">
        <mat-label>Type</mat-label>
        <mat-select [(ngModel)]="type">
          @for (item of permissionTypes; track item) {
            <mat-option [value]="item">{{ item }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field class="w-100">
        <mat-label>Form Code</mat-label>
        <input matInput [(ngModel)]="formCode" placeholder="role-management" autocomplete="off">
      </mat-form-field>

      <mat-form-field class="w-100">
        <mat-label>Active</mat-label>
        <mat-select [(ngModel)]="active">
          <mat-option [value]="1">Active</mat-option>
          <mat-option [value]="0">Inactive</mat-option>
        </mat-select>
      </mat-form-field>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-raised-button color="primary" type="button" (click)="save()">บันทึก</button>
    </div>
  `,
  styleUrl: './role-management.component.scss',
})
export class PermissionModalUpdateComponent {
  permissionTypes = ['GET', 'ADD', 'EDIT', 'DELETE', 'IMPORT', 'EXPORT'];
  permissionsName = '';
  path = '';
  type = 'GET';
  formCode = '';
  active = 1;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { mode: 'create' | 'update'; permission?: RoleManagementPermissionModel },
    private dialogRef: MatDialogRef<PermissionModalUpdateComponent>,
    private roleManagementService: RoleManagementService,
    private toastr: ToastrService,
  ) {
    this.permissionsName = data.permission?.permissionsName ?? '';
    this.path = data.permission?.path ?? '';
    this.type = data.permission?.type ?? 'GET';
    this.formCode = data.permission?.formCode ?? '';
    this.active = Number(data.permission?.active ?? 1);
  }

  save(): void {
    const payload: SavePermissionPayload = {
      id: this.data.permission?.id,
      permissions_name: this.permissionsName.trim(),
      path: this.path.trim(),
      type: this.type.trim().toUpperCase(),
      form_code: this.formCode.trim(),
      active: Number(this.active) === 1 ? 1 : 0,
    };

    if (!payload.permissions_name || !payload.path || !payload.type || !payload.form_code) {
      this.toastr.warning('กรุณากรอกข้อมูล Permission ให้ครบ');
      return;
    }

    const request$ = this.data.mode === 'create'
      ? this.roleManagementService.addPermission(payload)
      : this.roleManagementService.updatePermission(payload);

    request$.subscribe({
      next: () => {
        this.toastr.success(this.data.mode === 'create' ? 'เพิ่ม Permission สำเร็จ' : 'แก้ไข Permission สำเร็จ');
        this.dialogRef.close('success');
      },
      error: (error) => {
        console.error('Error saving permission:', error);
        this.toastr.error(error?.error?.description || 'บันทึก Permission ไม่สำเร็จ');
      },
    });
  }
}

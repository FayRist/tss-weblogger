import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { NgxApexchartsModule } from 'ngx-apexcharts';
import { ToastrService } from 'ngx-toastr';
import { of } from 'rxjs';
import { AuthService, PermissionItem } from '../core/auth/auth.service';
import { NavigationContextService } from '../core/navigation/navigation-context.service';
import { DashboardComponent } from '../pages/full-main/dashboard/dashboard.component';
import { LoggerComponent } from '../pages/full-main/logger/logger.component';
import { PermissionModalUpdateComponent, RoleModalUpdateComponent } from '../pages/full-main/role-management/role-management.component';
import { DataProcessingService } from '../service/data-processing.service';
import { EventService } from '../service/event.service';
import { MapPointConfigService } from '../service/map-point-config.service';
import { TimeService } from '../service/time.service';
import { WebSocketService } from '../service/websocket.service';

describe('Count display permissions', () => {
  let permissions: PermissionItem[];
  let auth: any;
  const grant = (path: string, type = 'COUNT'): PermissionItem => ({
    path, type, permissions_name: 'Count', form_code: path.split('/').pop()!
  });

  beforeEach(() => {
    permissions = [];
    auth = {
      current: { role: 'admin' },
      getPermissionsByPath: (path: string) => permissions.filter(permission => permission.path === path),
      normalizePermissionType: (type: string) => type.trim().toUpperCase()
    };
    // Render the real templates without starting networking, charts or map engines.
    for (const component of [DashboardComponent, LoggerComponent]) {
      spyOn(component.prototype, 'ngOnInit').and.stub();
      spyOn(component.prototype, 'ngAfterViewInit').and.stub();
      spyOn(component.prototype, 'ngOnDestroy').and.stub();
    }
    TestBed.configureTestingModule({
      imports: [DashboardComponent, LoggerComponent],
      providers: [provideHttpClient(), provideNoopAnimations(),
        { provide: AuthService, useValue: auth },
        { provide: MatDialog, useValue: {} }, { provide: Router, useValue: {} },
        { provide: ToastrService, useValue: {} }, { provide: EventService, useValue: {} },
        { provide: WebSocketService, useValue: {} }, { provide: DataProcessingService, useValue: {} },
        { provide: MapPointConfigService, useValue: {} },
        { provide: NavigationContextService, useValue: { snapshot: {} } },
        { provide: TimeService, useValue: { now: of(new Date()) } }
      ]
    }).overrideComponent(LoggerComponent, {
      remove: { imports: [NgxApexchartsModule] }, add: { schemas: [NO_ERRORS_SCHEMA] }
    });
  });

  it('removes the entire Dashboard Count column without a grant', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentInstance.dataSource.data = [{ loggerId: 1, currentCountDetect: 12 } as any];
    fixture.detectChanges();
    expect(fixture.componentInstance.displayedColumns).not.toContain('countDetect');
    expect(fixture.nativeElement.querySelector('.mat-column-countDetect')).toBeNull();
    expect(fixture.componentInstance.dataSource.data[0].currentCountDetect).toBe(12);
  });

  it('shows Dashboard Count only for its own COUNT permission', async () => {
    permissions = [grant('pages/logger'), grant('pages/dashboard', 'GET')];
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentInstance.dataSource.data = [{ loggerId: 1, currentCountDetect: 12 } as any];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mat-column-countDetect')).toBeNull();
    fixture.destroy();
    permissions.push(grant('pages/dashboard', 'count'));
    const grantedFixture = TestBed.createComponent(DashboardComponent);
    grantedFixture.componentInstance.dataSource.data = [{ loggerId: 1, currentCountDetect: 12 } as any];
    grantedFixture.detectChanges();
    await grantedFixture.whenStable();
    expect(grantedFixture.nativeElement.querySelector('th.mat-column-countDetect').textContent).toContain('Count');
    expect(grantedFixture.nativeElement.querySelector('td.mat-column-countDetect').textContent).toContain('12');
    expect(grantedFixture.componentInstance.displayedColumns).toContain('resetLimit');
  });

  for (const role of ['admin', 'race_team_user']) {
    it(`removes all Logger Count fields for ${role} without changing the stored value`, () => {
      auth.current.role = role;
      permissions = [grant('pages/dashboard'), grant('pages/logger', 'EDIT')];
      const fixture = TestBed.createComponent(LoggerComponent);
      const component = fixture.componentInstance;
      component.currentCountDetect = 12;
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.logger-meta-item--count')).toBeNull();
      const countCards = () => Array.from(fixture.nativeElement.querySelectorAll('.logger-metric-label'))
        .filter((element: any) => element.textContent.trim() === 'Count');
      expect(countCards().length).toBe(0);
      expect(component.currentCountDetect).toBe(12);
      permissions.push(grant('pages/logger'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.logger-meta-item--count')).not.toBeNull();
      expect(countCards().length).toBe(role === 'race_team_user' ? 1 : 0);
      permissions = [];
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.logger-meta-item--count')).toBeNull();
      expect(countCards().length).toBe(0);
    });
  }

  it('does not grant Count implicitly to super_admin', () => {
    auth.current.role = 'super_admin';
    const component = TestBed.createComponent(DashboardComponent).componentInstance;
    expect(component.canViewCount).toBeFalse();
  });
});

describe('Count permission creation', () => {
  it('can grant and revoke COUNT in an admin-type Role using the existing permission matrix', () => {
    const permission = { id: 77, permissionsName: 'Count', path: 'pages/logger', type: 'COUNT', formCode: 'logger', active: 1 };
    const service = {
      updateRole: jasmine.createSpy().and.returnValue(of({ success: true })),
      setRolePermissions: jasmine.createSpy().and.returnValue(of({ success: true }))
    };
    const component = new RoleModalUpdateComponent({
      mode: 'update', role: { id: 3, name: 'Operator', roleType: 'admin' },
      permissions: [permission], selectedPermissionIds: []
    }, { close: () => {} } as any, service as any, { success: () => {} } as any);
    component.togglePermission(permission, true);
    component.save();
    expect(service.setRolePermissions).toHaveBeenCalledWith(3, [77]);
    component.togglePermission(permission, false);
    component.save();
    expect(service.setRolePermissions).toHaveBeenCalledWith(3, []);
  });

  for (const page of ['dashboard', 'logger']) {
    it(`can save an active COUNT permission for ${page}`, () => {
      const service = { addPermission: jasmine.createSpy().and.returnValue(of({ success: true })) };
      const dialog = { close: jasmine.createSpy() };
      const toast = { success: jasmine.createSpy(), warning: jasmine.createSpy() };
      const component = new PermissionModalUpdateComponent({ mode: 'create' }, dialog as any, service as any, toast as any);
      expect(component.permissionTypes).toContain('COUNT');
      component.permissionsName = 'Count';
      component.path = `pages/${page}`;
      component.formCode = page;
      component.type = 'count';
      component.save();
      expect(service.addPermission).toHaveBeenCalledWith(jasmine.objectContaining({
        permissions_name: 'Count', path: `pages/${page}`, type: 'COUNT', form_code: page, active: 1
      }));
      expect(dialog.close).toHaveBeenCalledWith('success');
    });
  }
});

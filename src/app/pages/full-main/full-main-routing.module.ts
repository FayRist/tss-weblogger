import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { requireDashboardContextGuard, requireLoggerContextGuard } from '../../core/navigation/navigation-context.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },{
    path: 'dashboard',
    canActivate: [requireDashboardContextGuard],
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  }, {
    path: 'season',
    canActivate: [roleGuard],
    data: { roles: ['admin'], permissionPath: 'pages/season' },
    loadComponent: () => import('./season/season.component').then(m => m.SeasonComponent)
  }, {
    path: 'event',
    canActivate: [roleGuard],
    data: { roles: ['admin', 'race_team_user'], permissionPath: 'pages/event' },
    loadComponent: () => import('./event/event.component').then(m => m.EventComponent)
  }, {
    path: 'race',
    canActivate: [roleGuard],
    data: { roles: ['admin', 'race_team_user', 'mechanic_user'], permissionPath: 'pages/race' },
    loadComponent: () => import('./race/race.component').then(m => m.RaceComponent)
  }, {
    path: 'logger',
    canActivate: [requireLoggerContextGuard],
    loadComponent: () => import('./logger/logger.component').then(m => m.LoggerComponent)
  }, {
    path: 'logger/add-logger',
    canActivate: [roleGuard],
    data: { roles: ['admin'], permissionPath: 'pages/setting-logger', permissionType: 'IMPORT' },
    loadComponent: () => import('./setting-logger/add-logger/add-logger.component').then(m => m.AddLoggerComponent)
  }, {
    path: 'add-event',
    canActivate: [roleGuard],
    data: { roles: ['admin'], permissionPath: 'pages/event', permissionType: 'ADD' },
    loadComponent: () => import('./add-event/add-event.component').then(m => m.AddEventComponent)
  }, {
    path: 'setting-logger',
    canActivate: [roleGuard],
    data: { roles: ['admin'], permissionPath: 'pages/setting-logger' },
    loadComponent: () => import('./setting-logger/setting-logger.component').then(m => m.SettingLoggerComponent)
  }, {
    path: 'admin-config',
    canActivate: [roleGuard],
    data: { roles: ['admin'], permissionPath: 'pages/admin-config' },
    loadComponent: () => import('./admin-config/admin-config.component').then(m => m.AdminConfigComponent)
  },
   {
    path: 'role-management',
    canActivate: [roleGuard],
    data: { roles: ['admin'], permissionPath: 'pages/role-management' },
    loadComponent: () => import('./role-management/role-management.component').then(m => m.RoleManagementComponent)
  },
   {
    path: 'user-management',
    canActivate: [roleGuard],
    data: { roles: ['admin'], permissionPath: 'pages/user-management' },
    loadComponent: () => import('./user-management/user-management.component').then(m => m.UserManagementComponent)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FullMainRoutingModule { }

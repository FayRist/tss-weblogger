import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  count?: number;
  message?: string;
}

export interface RoleManagementRoleModel {
  id: number;
  name: string;
  roleType: 'admin' | 'user';
}

export interface RoleManagementPermissionModel {
  id: number;
  permissionsName: string;
  path: string;
  type: string;
  formCode: string;
  active: number;
}

export interface RolePermissionModel {
  id: number;
  roleId: number;
  permissionsId: number;
  createdAt: string;
  permissionsName: string;
  path: string;
  type: string;
  formCode: string;
  active: number;
}

export interface SaveRolePayload {
  id?: number;
  name: string;
  role_type: 'admin' | 'user';
}

export interface SavePermissionPayload {
  id?: number;
  permissions_name: string;
  path: string;
  type: string;
  form_code: string;
  active: number;
}

@Injectable({ providedIn: 'root' })
export class RoleManagementService {
  constructor(private http: HttpClient) {}

  getRoles(): Observable<RoleManagementRoleModel[]> {
    return this.http.get<ApiResponse<any[]>>(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_GET_ROLES)).pipe(
      map(response => (response.data ?? []).map(row => ({
        id: Number(row?.id),
        name: String(row?.name ?? ''),
        roleType: String(row?.role_type ?? 'admin').toLowerCase() === 'user' ? 'user' : 'admin',
      })))
    );
  }

  getPermissions(): Observable<RoleManagementPermissionModel[]> {
    return this.http.get<ApiResponse<any[]>>(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_GET_PERMISSIONS)).pipe(
      map(response => (response.data ?? []).map(row => ({
        id: Number(row?.id),
        permissionsName: String(row?.permissions_name ?? ''),
        path: String(row?.path ?? ''),
        type: String(row?.type ?? '').toUpperCase(),
        formCode: String(row?.form_code ?? ''),
        active: Number(row?.active ?? 1),
      })))
    );
  }

  getRolePermissions(): Observable<RolePermissionModel[]> {
    return this.http.get<ApiResponse<any[]>>(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_GET_ROLE_PERMISSIONS)).pipe(
      map(response => (response.data ?? []).map(row => ({
        id: Number(row?.id),
        roleId: Number(row?.role_id),
        permissionsId: Number(row?.permissions_id),
        createdAt: String(row?.created_at ?? ''),
        permissionsName: String(row?.permissions_name ?? ''),
        path: String(row?.path ?? ''),
        type: String(row?.type ?? '').toUpperCase(),
        formCode: String(row?.form_code ?? ''),
        active: Number(row?.active ?? 1),
      })))
    );
  }

  addRole(payload: SaveRolePayload): Observable<unknown> {
    return this.http.post(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_ADD_ROLE), payload);
  }

  updateRole(payload: SaveRolePayload): Observable<unknown> {
    return this.http.post(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_UPDATE_ROLE), payload);
  }

  deleteRole(id: number): Observable<unknown> {
    return this.http.post(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_DELETE_ROLE), { id });
  }

  setRolePermissions(roleId: number, permissionIds: number[]): Observable<unknown> {
    return this.http.post(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_SET_ROLE_PERMISSIONS), {
      role_id: roleId,
      permission_ids: permissionIds,
    });
  }

  addPermission(payload: SavePermissionPayload): Observable<unknown> {
    return this.http.post(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_ADD_PERMISSION), payload);
  }

  updatePermission(payload: SavePermissionPayload): Observable<unknown> {
    return this.http.post(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_UPDATE_PERMISSION), payload);
  }

  updatePermissionActive(id: number, active: number): Observable<unknown> {
    return this.http.post(getApiUrl(APP_CONFIG.API.ENDPOINTS.ROLE_MANAGEMENT_UPDATE_PERMISSION_ACTIVE), { id, active });
  }
}

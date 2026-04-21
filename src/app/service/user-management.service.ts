import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG, getApiUrl } from '../app.config';
import {
  ApiPermissionResponse,
  ApiRoleResponse,
  ApiUserAdminPermissionResponse,
  ApiUserRacePermissionResponse,
  ApiUserResponse,
} from '../model/api-response-model';


export interface UserModel {
  id: number;
  username: string;
  passwordHash: string;
  email: string;
  roleId: number;
  createdAt: string;
}

export interface RoleModel {
  value: number;
  name: string;
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

export interface RaceLoggerCandidateModel {
  carNumber: number;
  loggerId: string;
  driverName: string;
}

export interface UserRacePermissionRowModel {
  eventId: number;
  eventName: string;
  raceId: number;
  raceName: string;
  loggerId: string;
  carNumber: number;
  driverName: string;
}

export interface UpdateUserPayload {
  id: number;
  email: string;
  role_id: number;
  new_password?: string;
}

export interface AddUserPayload {
  username: string;
  email: string;
  role_id: number;
  new_password: string;
}


@Injectable({
  providedIn: 'root'
})
export class UserManagementService {
  public userList: UserModel[] = [];
  public roleList: RoleModel[] = [];
  public permissionList: PermissionModel[] = [];
  public userAdminPermissionList: UserAdminPermissionModel[] = [];
  public userRacePermissionList: UserRacePermissionModel[] = [];

  constructor(private http: HttpClient) {  }

  // --------- User -------------------------------------------------------
  getUser(): Observable<UserModel[]> {
    const userURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_USERS);
      return this.http.get<ApiUserResponse>(userURL).pipe(
        map(response => {
          // Map API data to Match interface
          this.userList = response.data.map((apiData) => ({
            id: apiData.id,
            username: apiData.username,
            passwordHash: apiData.password_hash,
            email: apiData.email,
            roleId: apiData.role_id,
            createdAt: apiData.created_at
          }));
          return this.userList;
        })
      );
  }


  // --------- Role -------------------------------------------------------
  getRole(): Observable<RoleModel[]> {
    const roleURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_ROLES);
      return this.http.get<ApiRoleResponse>(roleURL).pipe(
        map(response => {
          this.roleList = response.data.map((apiData) => ({
            value: apiData.id,
            name: apiData.name,
          }));
          return this.roleList;
        })
      );
  }

  getPermission(): Observable<PermissionModel[]> {
    const permissionURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_PERMISSION);
    return this.http.get<ApiPermissionResponse>(permissionURL).pipe(
      map(response => {
        this.permissionList = response.data.map((apiData) => ({
          id: apiData.id,
          permissionsName: apiData.permissions_name,
          description: apiData.description,
        }));
        return this.permissionList;
      })
    );
  }

  getUserAdminPermission(): Observable<UserAdminPermissionModel[]> {
    const userAdminPermissionURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_USER_ADMIN_PERMISSIONS);
    return this.http.get<ApiUserAdminPermissionResponse>(userAdminPermissionURL).pipe(
      map(response => {
        this.userAdminPermissionList = response.data.map((apiData) => ({
          id: apiData.id,
          roleId: apiData.role_id,
          permissionId: apiData.permission_id,
          permission: apiData.permission,
        }));
        return this.userAdminPermissionList;
      })
    );
  }

  getUserRacePermission(): Observable<UserRacePermissionModel[]> {
    const userRacePermissionURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_USER_RACE_PERMISSIONS);
    return this.http.get<ApiUserRacePermissionResponse>(userRacePermissionURL).pipe(
      map(response => {
        this.userRacePermissionList = response.data.map((apiData) => ({
          id: apiData.id,
          userId: apiData.user_id,
          raceId: apiData.race_id,
          carNumber: apiData.car_number,
        }));
        return this.userRacePermissionList;
      })
    );
  }

  getUserRacePermissionsByRace(userId: number, raceId: number): Observable<number[]> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_USER_RACE_PERMISSIONS);
    return this.http.get<any>(url, {
      params: {
        user_id: String(userId),
        race_id: String(raceId),
      },
    }).pipe(
      map((response) => {
        const rows = Array.isArray(response?.data) ? response.data : [];
        return rows
          .map((r: any) => Number(r?.car_number))
          .filter((n: number) => Number.isFinite(n));
      })
    );
  }

  getUserRacePermissionRows(userId: number): Observable<UserRacePermissionRowModel[]> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_USER_RACE_PERMISSION_ROWS);
    return this.http.get<any>(url, {
      params: {
        user_id: String(userId),
      },
    }).pipe(
      map((response) => {
        const rows = Array.isArray(response?.data) ? response.data : [];
        return rows.map((r: any) => ({
          eventId: Number(r?.event_id),
          eventName: String(r?.event_name ?? ''),
          raceId: Number(r?.race_id),
          raceName: String(r?.race_name ?? ''),
          loggerId: String(r?.logger_id ?? ''),
          carNumber: Number(r?.car_number),
          driverName: String(r?.driver_name ?? '').trim(),
        }));
      })
    );
  }

  getRaceLoggerCandidates(eventId: number): Observable<RaceLoggerCandidateModel[]> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_RACE_LOGGER_CANDIDATES);
    return this.http.get<any>(url, {
      params: {
        event_id: String(eventId),
      },
    }).pipe(
      map((response) => {
        const rows = Array.isArray(response?.data) ? response.data : [];
        return rows.map((r: any) => ({
          carNumber: Number(r?.car_number),
          loggerId: String(r?.logger_id ?? ''),
          driverName: String(r?.driver_name ?? '').trim(),
        }));
      })
    );
  }

  setUserRacePermissions(payload: { user_id: number; event_id: number; car_numbers: number[] }): Observable<unknown> {
    const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.SET_USER_RACE_PERMISSIONS);
    return this.http.post(url, payload);
  }

  updateUser(payload: UpdateUserPayload): Observable<unknown> {
    const updateUserURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_USER);
    return this.http.post(updateUserURL, payload);
  }

  addUser(payload: AddUserPayload): Observable<unknown> {
    const addUserURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.ADD_USER);
    return this.http.post(addUserURL, payload);
  }

  deleteUser(payload: UpdateUserPayload): Observable<unknown> {
    const updateUserURL = getApiUrl(APP_CONFIG.API.ENDPOINTS.DELETE_USER);
    return this.http.post(updateUserURL, payload);
  }

}

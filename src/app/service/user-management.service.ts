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
            name: apiData.description,
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

}


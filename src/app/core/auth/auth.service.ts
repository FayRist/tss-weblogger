import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { APP_CONFIG, getApiUrl } from '../../app.config';
import { hashPassword } from '../../utility/password.util';

export type Role = 'super_admin' | 'admin' | 'mechanic_user' | 'race_team_user' | 'scruitineer';

export interface AuthState {
  userId: number;
  username: string;
  role: Role;
  roleId: number;
  permissions: string[];
  allowedRaceIds: number[];
  allRaceAccess: boolean;
  token: string;
  passwordProof?: string;
}

interface LoginApiResponse {
  success: boolean;
  data: {
    access_token: string;
    token_type: string;
    expires_in: number;
    user: {
      user_id: number;
      username: string;
      role_id: number;
      role: Role;
      permissions: string[];
      allowed_race_ids: number[];
      all_race_access: boolean;
    };
  };
}

const LS_KEY = 'auth_state_v2';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user$ = new BehaviorSubject<AuthState | null>(this.readFromLS());
  user$ = this._user$.asObservable();

  constructor(private http: HttpClient) {}

  private readFromLS(): AuthState | null {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    } catch {
      return null;
    }
  }

  private writeToLS(v: AuthState | null): void {
    if (v) {
      localStorage.setItem(LS_KEY, JSON.stringify(v));
    } else {
      localStorage.removeItem(LS_KEY);
    }
  }

  login(username: string, password: string): Observable<{ ok: boolean; error?: string }> {
    const apiUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.LOGIN);
    const payload = {
      username: username.trim(),
      password,
    };

    return this.http.post<LoginApiResponse>(apiUrl, payload).pipe(
      map((res) => {
        if (!res?.success || !res?.data?.access_token || !res?.data?.user) {
          return { ok: false, error: 'Login failed' };
        }

        const u = res.data.user;
        const state: AuthState = {
          userId: Number(u.user_id || 0),
          username: u.username,
          role: (u.role || 'race_team_user') as Role,
          roleId: Number(u.role_id || 0),
          permissions: Array.isArray(u.permissions) ? u.permissions : [],
          allowedRaceIds: Array.isArray(u.allowed_race_ids) ? u.allowed_race_ids.map(Number) : [],
          allRaceAccess: !!u.all_race_access,
          token: res.data.access_token,
          passwordProof: hashPassword(password),
        };

        this._user$.next(state);
        this.writeToLS(state);
        return { ok: true };
      }),
      catchError((err) => {
        const status = Number(err?.status || 0);
        const backendMsg = err?.error?.description || err?.error?.error || '';
        const msg = backendMsg || (status > 0 ? `Login request failed (${status})` : 'Cannot connect to login service');
        return of({ ok: false, error: msg });
      })
    );
  }

  logout(): void {
    const apiUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.LOGOUT);
    const token = this.current?.token;
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    this.http.post(apiUrl, {}, { headers }).pipe(
      catchError(() => of(null)),
      tap(() => {
        this._user$.next(null);
        this.writeToLS(null);
      })
    ).subscribe();
  }

  get current(): AuthState | null {
    return this._user$.value;
  }

  isLoggedIn(): boolean {
    return !!this.current?.token;
  }

  hasAnyRole(...roles: Role[]): boolean {
    const r = this.current?.role;
    if (!r) return false;
    if (r === 'super_admin') return true;
    return roles.includes(r);
  }

  hasPermission(permission: string): boolean {
    const user = this.current;
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return user.permissions.includes(permission);
  }

  canAccessRace(raceId: number): boolean {
    const user = this.current;
    if (!user) return false;
    if (user.allRaceAccess || user.role === 'super_admin') return true;
    return user.allowedRaceIds.includes(Number(raceId));
  }

  validatePassword(password: string): boolean {
    const userState = this._user$.value;
    if (!userState?.passwordProof) return false;
    return hashPassword(password) === userState.passwordProof;
  }
}

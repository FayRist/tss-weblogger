import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, from, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { switchMap } from 'rxjs/operators';
import { APP_CONFIG, getApiUrl } from '../../app.config';
import { hashPassword } from '../../utility/password.util';
import { NavigationEnd, Router } from '@angular/router';

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
  lastActivityAt: number;
  expiresAt: number;
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

interface LoginPublicKeyApiResponse {
	success: boolean;
	data: {
		kid: string;
		algorithm: string;
		public_key: string;
		max_skew_sec: number;
	};
}

const LS_KEY = 'auth_state_v2';
const TIMEOUT_NOTICE_KEY = 'auth_timeout_notice';
const SESSION_TIMEOUT_PROD_MS = 4 * 60 * 60 * 1000;
// const SESSION_TIMEOUT_TEST_MS = 1 * 60 * 1000;
const USE_TEST_TIMEOUT = false;
// const SESSION_TIMEOUT_MS = USE_TEST_TIMEOUT ? SESSION_TIMEOUT_TEST_MS : SESSION_TIMEOUT_PROD_MS;
const ACTIVITY_THROTTLE_MS = 5000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user$ = new BehaviorSubject<AuthState | null>(this.readFromLS());
  user$ = this._user$.asObservable();
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private routerSub: Subscription | null = null;
  private listenersAttached = false;
  private lastActivityPersistAt = 0;

  private readonly activityEvents: readonly string[] = [
    'click',
    'keydown',
    'touchstart',
    'scroll',
    'mousemove',
  ];

  constructor(private http: HttpClient, private router: Router) {
    if (this.current?.token) {
      this.startSessionMonitoring();
    }
  }

  private readFromLS(): AuthState | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<AuthState> | null;
      if (!parsed?.token) {
        localStorage.removeItem(LS_KEY);
        return null;
      }

      const now = Date.now();
      const lastActivityAt = Number(parsed.lastActivityAt || now);
      const expiresAt = Number(parsed.expiresAt || (lastActivityAt + SESSION_TIMEOUT_PROD_MS));

      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        localStorage.removeItem(LS_KEY);
        localStorage.setItem(TIMEOUT_NOTICE_KEY, '1');
        return null;
      }

      const state: AuthState = {
        userId: Number(parsed.userId || 0),
        username: String(parsed.username || ''),
        role: (parsed.role || 'race_team_user') as Role,
        roleId: Number(parsed.roleId || 0),
        permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
        allowedRaceIds: Array.isArray(parsed.allowedRaceIds) ? parsed.allowedRaceIds.map(Number) : [],
        allRaceAccess: !!parsed.allRaceAccess,
        token: String(parsed.token),
        passwordProof: parsed.passwordProof,
        lastActivityAt,
        expiresAt,
      };

      this.writeToLS(state);
      return state;
    } catch {
      localStorage.removeItem(LS_KEY);
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
    const keyUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.LOGIN_PUBLIC_KEY);
    const trimmedUsername = username.trim();

    return this.http.get<LoginPublicKeyApiResponse>(keyUrl).pipe(
      switchMap((keyRes) => {
        if (!keyRes?.success || !keyRes?.data?.public_key) {
          // Temporary fallback for non-HTTPS/test environments.
          return this.loginWithPlaintext(apiUrl, trimmedUsername, password);
        }

        const ts = Date.now();
        const nonce = this.generateNonce();

        return from(this.encryptPasswordWithPublicKey(password, keyRes.data.public_key)).pipe(
          switchMap((passwordEnc) => {
            const payload = {
              username: trimmedUsername,
              password_enc: passwordEnc,
              enc_ver: 'rsa-oaep-sha256',
              ts,
              nonce,
              kid: keyRes.data.kid,
            };
            return this.http.post<LoginApiResponse>(apiUrl, payload);
          }),
          catchError(() => {
            // Temporary fallback for non-HTTPS/test environments.
            return this.loginWithPlaintext(apiUrl, trimmedUsername, password);
          })
        );
      }),
      map((res) => {
        if (!res || !res.success || !res?.data?.access_token || !res?.data?.user) {
          return { ok: false, error: 'Login failed' };
        }

        const u = res.data.user;
        const now = Date.now();
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
          lastActivityAt: now,
          expiresAt: now + SESSION_TIMEOUT_PROD_MS,
        };

        this._user$.next(state);
        this.writeToLS(state);
        this.startSessionMonitoring();
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

  private loginWithPlaintext(apiUrl: string, username: string, password: string): Observable<LoginApiResponse> {
    const payload = {
      username,
      password,
    };
    return this.http.post<LoginApiResponse>(apiUrl, payload);
  }

  private async encryptPasswordWithPublicKey(password: string, publicKeyPem: string): Promise<string> {
    const cryptoApi = globalThis.crypto?.subtle;
    if (!cryptoApi) {
      throw new Error('WebCrypto unavailable');
    }

    const publicKey = await cryptoApi.importKey(
      'spki',
      this.pemToArrayBuffer(publicKeyPem),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );

    const encoded = new TextEncoder().encode(password);
    const encrypted = await cryptoApi.encrypt({ name: 'RSA-OAEP' }, publicKey, encoded);
    return this.arrayBufferToBase64(encrypted);
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const clean = pem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private generateNonce(length = 24): string {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    let binary = '';
    for (let i = 0; i < arr.length; i++) {
      binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  logout(): void {
    const apiUrl = getApiUrl(APP_CONFIG.API.ENDPOINTS.LOGOUT);
    const token = this.current?.token;
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    this.http.post(apiUrl, {}, { headers }).pipe(
      catchError(() => of(null)),
      tap(() => {
        this.clearSession(false);
      })
    ).subscribe();
  }

  logoutDueToTimeout(): void {
    this.clearSession(true);
    this.router.navigate(['/login'], {
      queryParams: { reason: 'timeout' },
      replaceUrl: true,
    });
  }

  get current(): AuthState | null {
    return this._user$.value;
  }

  isLoggedIn(): boolean {
    const user = this.current;
    if (!user?.token) {
      return false;
    }

    if (this.isExpired(user)) {
      this.logoutDueToTimeout();
      return false;
    }

    return true;
  }

  consumeTimeoutNotice(): boolean {
    const hasNotice = localStorage.getItem(TIMEOUT_NOTICE_KEY) === '1';
    if (hasNotice) {
      localStorage.removeItem(TIMEOUT_NOTICE_KEY);
    }
    return hasNotice;
  }

  markUserActivity(): void {
    this.bumpSessionFromActivity();
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

  private isExpired(state: AuthState | null): boolean {
    if (!state?.expiresAt) {
      return true;
    }
    return state.expiresAt <= Date.now();
  }

  private clearSession(showTimeoutNotice: boolean): void {
    if (showTimeoutNotice) {
      localStorage.setItem(TIMEOUT_NOTICE_KEY, '1');
    }
    this.stopSessionMonitoring();
    this._user$.next(null);
    this.writeToLS(null);
  }

  private startSessionMonitoring(): void {
    if (!this.current?.token) {
      return;
    }

    this.attachActivityListeners();
    this.attachRouterListener();
    this.scheduleSessionTimer();
  }

  private stopSessionMonitoring(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }

    if (this.routerSub) {
      this.routerSub.unsubscribe();
      this.routerSub = null;
    }

    if (this.listenersAttached) {
      for (const eventName of this.activityEvents) {
        window.removeEventListener(eventName, this.onUserActivity, true);
      }
      this.listenersAttached = false;
    }
  }

  private scheduleSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }

    const expiresAt = this.current?.expiresAt;
    if (!expiresAt) {
      return;
    }

    const delay = Math.max(0, expiresAt - Date.now());
    this.sessionTimer = setTimeout(() => {
      if (this.isLoggedIn()) {
        this.scheduleSessionTimer();
        return;
      }
    }, delay);
  }

  private attachRouterListener(): void {
    if (this.routerSub) {
      return;
    }

    this.routerSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.bumpSessionFromActivity();
      }
    });
  }

  private attachActivityListeners(): void {
    if (this.listenersAttached) {
      return;
    }

    for (const eventName of this.activityEvents) {
      window.addEventListener(eventName, this.onUserActivity, { capture: true, passive: true });
    }
    this.listenersAttached = true;
  }

  private onUserActivity = (): void => {
    this.bumpSessionFromActivity();
  };

  private bumpSessionFromActivity(): void {
    const current = this.current;
    if (!current?.token) {
      return;
    }

    if (this.isExpired(current)) {
      this.logoutDueToTimeout();
      return;
    }

    const now = Date.now();
    if (now - this.lastActivityPersistAt < ACTIVITY_THROTTLE_MS) {
      return;
    }

    this.lastActivityPersistAt = now;
    const updated: AuthState = {
      ...current,
      lastActivityAt: now,
      expiresAt: now + SESSION_TIMEOUT_PROD_MS,
    };
    this._user$.next(updated);
    this.writeToLS(updated);
    this.scheduleSessionTimer();
  }
}

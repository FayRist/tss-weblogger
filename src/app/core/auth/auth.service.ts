import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Role = 'admin' | 'scruitineer';
export interface AuthState { username: string; role: Role; }

const USERS: Record<string, { password: string; role: Role }> = {
  admin:       { password: 'pass1235', role: 'admin' },
  scruitineer: { password: 'pass2356', role: 'scruitineer' },
};

const LS_KEY = 'auth_state_v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user$ = new BehaviorSubject<AuthState | null>(this.readFromLS());
  user$ = this._user$.asObservable();

  private readFromLS(): AuthState | null {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  }
  private writeToLS(v: AuthState | null) {
    if (v) localStorage.setItem(LS_KEY, JSON.stringify(v));
    else localStorage.removeItem(LS_KEY);
  }

  login(username: string, password: string): { ok: boolean; error?: string } {
    const rec = USERS[username];
    if (!rec || rec.password !== password) return { ok: false, error: 'Invalid username or password' };
    const state: AuthState = { username, role: rec.role };
    this._user$.next(state);
    this.writeToLS(state);
    return { ok: true };
  }

  logout() {
    this._user$.next(null);
    this.writeToLS(null);
  }

  get current(): AuthState | null { return this._user$.value; }
  isLoggedIn(): boolean { return !!this.current; }
  hasAnyRole(...roles: Role[]): boolean {
    const r = this.current?.role; return !!r && roles.includes(r);
  }
}

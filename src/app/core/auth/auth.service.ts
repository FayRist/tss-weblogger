import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { hashPassword } from '../../utility/password.util';
import { EventService } from '../../service/event.service';

export type Role = 'admin' | 'scruitineer';
export interface AuthState { username: string; role: Role; }

// Password ที่ hash แล้ว (MD5 แล้วตามด้วย SHA256)
const USERS: Record<string, { password: string; role: Role }> = {
  admin:       { password: hashPassword('pass1235'), role: 'admin' },
  scruitineer: { password: hashPassword('pass2356'), role: 'scruitineer' },
};

const LS_KEY = 'auth_state_v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user$ = new BehaviorSubject<AuthState | null>(this.readFromLS());
  user$ = this._user$.asObservable();

  constructor(private eventService: EventService) {  }

  private readFromLS(): AuthState | null {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  }
  private writeToLS(v: AuthState | null) {
    if (v) localStorage.setItem(LS_KEY, JSON.stringify(v));
    else localStorage.removeItem(LS_KEY);
  }

  login(username: string, password: string): { ok: boolean; error?: string } {

    const hashedPassword = hashPassword(password);
    const MatchSub = this.eventService.getUser(username, hashedPassword).subscribe(
      (config: any) => {
        console.log(config);

      },
      error => {
          console.error('Error loading matchList:', error);
      }
    );

    const rec = USERS[username];
    if (!rec) return { ok: false, error: 'Invalid username or password' };

    // Hash password ที่ผู้ใช้ป้อนเข้ามา (MD5 แล้วตามด้วย SHA256)

    if (rec.password !== hashedPassword) return { ok: false, error: 'Invalid username or password' };
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


  validatePassword(password: string): boolean {
    const userState = this._user$.value;   // ดึงค่าล่าสุดจาก BehaviorSubject
    if (!userState) return false;

    const user = USERS[userState.username];
    if (!user) return false;

    // Hash password ที่ผู้ใช้ป้อนเข้ามา (MD5 แล้วตามด้วย SHA256)
    const hashedPassword = hashPassword(password);
    return user.password === hashedPassword;
  }
}

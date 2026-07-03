import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApiUrl } from '../../app.config';

export interface TssWeighingSessionPayload {
  event: string;
  year: number;
  class_name: string;
  session_name: string;
  cars: Record<string, unknown>;
}

export interface TssWeighingCacheResponse {
  event: string;
  year: number;
  updated_at?: string;
  classes?: Record<string, {
    sessions?: Record<string, {
      updated_at?: string;
      cars?: Record<string, any>;
    }>;
  }>;
}

export interface TssWeighingActiveEventResponse {
  event: string;
  year: number;
  updated_at?: string;
}

export interface TssWeighingConfigResponse {
  event: string;
  year: number;
  updated_at?: string;
  class_sessions: Record<string, string[]>;
  locked_sessions?: Record<string, string[]>;
}

@Injectable({ providedIn: 'root' })
export class TssWeighingService {
  constructor(private http: HttpClient) {}

  getCache(eventName: string, year: number, token: string): Observable<TssWeighingCacheResponse> {
    const params = new HttpParams().set('event', eventName).set('year', String(year));
    return this.http.get<TssWeighingCacheResponse>(getApiUrl('/tss-weighing/cache'), {
      headers: this.headers(token),
      params,
    });
  }

  getActiveEvent(token: string): Observable<TssWeighingActiveEventResponse> {
    return this.http.get<TssWeighingActiveEventResponse>(getApiUrl('/tss-weighing/active-event'), {
      headers: this.headers(token),
    });
  }

  setActiveEvent(eventName: string, year: number, token: string): Observable<TssWeighingActiveEventResponse> {
    return this.http.put<TssWeighingActiveEventResponse>(getApiUrl('/tss-weighing/active-event'), { event: eventName, year }, {
      headers: this.headers(token),
    });
  }

  getConfig(eventName: string, year: number, token: string): Observable<TssWeighingConfigResponse> {
    const params = new HttpParams().set('event', eventName).set('year', String(year));
    return this.http.get<TssWeighingConfigResponse>(getApiUrl('/tss-weighing/config'), {
      headers: this.headers(token),
      params,
    });
  }

  setConfig(eventName: string, year: number, classSessions: Record<string, string[]>, lockedSessions: Record<string, string[]>, token: string): Observable<TssWeighingConfigResponse> {
    return this.http.put<TssWeighingConfigResponse>(getApiUrl('/tss-weighing/config'), {
      event: eventName,
      year,
      class_sessions: classSessions,
      locked_sessions: lockedSessions,
    }, {
      headers: this.headers(token),
    });
  }

  saveSession(payload: TssWeighingSessionPayload, token: string): Observable<TssWeighingCacheResponse> {
    return this.http.post<TssWeighingCacheResponse>(getApiUrl('/tss-weighing/cache/session'), payload, {
      headers: this.headers(token),
    });
  }

  deleteClass(eventName: string, year: number, className: string, token: string): Observable<TssWeighingCacheResponse> {
    const params = new HttpParams()
      .set('event', eventName)
      .set('year', String(year))
      .set('class_name', className);
    return this.http.delete<TssWeighingCacheResponse>(getApiUrl('/tss-weighing/cache/class'), {
      headers: this.headers(token),
      params,
    });
  }

  private headers(token: string): HttpHeaders {
    return new HttpHeaders({ 'X-Weighing-Token': token });
  }
}

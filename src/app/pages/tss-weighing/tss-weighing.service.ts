import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApiUrl, getApiWebSocket } from '../../app.config';

export interface TssWeighingSessionPayload {
  event: string;
  year: number;
  class_name: string;
  session_name: string;
  cars: Record<string, unknown>;
}

export interface TssWeighingFieldPayload {
  event: string;
  year: number;
  class_name: string;
  session_name: string;
  car_number: string;
  field: string;
  value: unknown;
  expected_version: number;
  updated_by: string;
}

export interface TssWeighingRowPayload {
  event: string;
  year: number;
  class_name: string;
  session_name: string;
  car_number: string;
  car: Record<string, unknown>;
  expected_versions?: Record<string, number>;
  updated_by: string;
}

export interface TssWeighingMoveRowPayload {
  event: string;
  year: number;
  class_name: string;
  session_name: string;
  old_car_number: string;
  new_car_number: string;
  updated_by: string;
}

export interface TssWeighingUpdateMessage {
  type: 'weighing_field_updated' | 'weighing_row_updated' | 'weighing_class_reset';
  event?: string;
  year?: number;
  class_name?: string;
  session_name?: string;
  car_number?: string;
  field?: string;
  value?: unknown;
  version?: number;
  updated_by?: string;
  updated_at?: string;
  deleted?: boolean;
  car?: Record<string, unknown>;
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

  getSessionCache(eventName: string, year: number, className: string, sessionName: string, token: string): Observable<TssWeighingCacheResponse> {
    const params = new HttpParams()
      .set('event', eventName)
      .set('year', String(year))
      .set('class_name', className)
      .set('session_name', sessionName);
    return this.http.get<TssWeighingCacheResponse>(getApiUrl('/tss-weighing/cache/session'), {
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

  updateField(payload: TssWeighingFieldPayload, token: string): Observable<{ cache: TssWeighingCacheResponse; car: Record<string, unknown> }> {
    return this.http.post<{ cache: TssWeighingCacheResponse; car: Record<string, unknown> }>(getApiUrl('/tss-weighing/cache/field'), payload, {
      headers: this.headers(token),
    });
  }

  saveRow(payload: TssWeighingRowPayload, token: string): Observable<{ event: string; year: number; class_name: string; session_name: string; car_number: string; updated_at: string; car: Record<string, unknown> }> {
    return this.http.post<{ event: string; year: number; class_name: string; session_name: string; car_number: string; updated_at: string; car: Record<string, unknown> }>(getApiUrl('/tss-weighing/cache/row'), payload, {
      headers: this.headers(token),
    });
  }

  moveRow(payload: TssWeighingMoveRowPayload, token: string): Observable<{ car_number: string; updated_at: string; car: Record<string, unknown> }> {
    return this.http.post<{ car_number: string; updated_at: string; car: Record<string, unknown> }>(getApiUrl('/tss-weighing/cache/row/move'), payload, {
      headers: this.headers(token),
    });
  }

  deleteRow(eventName: string, year: number, className: string, sessionName: string, carNumber: string, token: string): Observable<TssWeighingCacheResponse> {
    const params = new HttpParams()
      .set('event', eventName)
      .set('year', String(year))
      .set('class_name', className)
      .set('session_name', sessionName)
      .set('car_number', carNumber);
    return this.http.delete<TssWeighingCacheResponse>(getApiUrl('/tss-weighing/cache/row'), {
      headers: this.headers(token),
      params,
    });
  }

  weighingUpdatesUrl(eventName: string, year: number, className: string, sessionName: string, token: string): string {
    const base = getApiWebSocket('/ws/tss-weighing');
    const params = new URLSearchParams({
      event: eventName,
      year: String(year),
      class_name: className,
      session_name: sessionName,
      token,
    });
    return `${base}?${params.toString()}`;
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

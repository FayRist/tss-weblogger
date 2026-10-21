import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, tap } from 'rxjs';
import { APP_CONFIG, getApiUrl, getMapCenterForCircuit } from '../app.config';
import { MapPointConfig, MapPointConfigApiResponse, MapViewConfig } from '../model/map-point-config.model';

@Injectable({
  providedIn: 'root',
})
export class MapPointConfigService {
  private readonly configs = new Map<string, MapPointConfig>();
  private loadRequest$: Observable<MapPointConfig[]> | null = null;

  constructor(private readonly http: HttpClient) {}

  load(): Observable<MapPointConfig[]> {
    if (!this.loadRequest$) {
      const url = getApiUrl(APP_CONFIG.API.ENDPOINTS.GET_MAP_POINT_CONFIGS);
      this.loadRequest$ = this.http.get<MapPointConfigApiResponse>(url).pipe(
        map(response => (response?.data ?? []).map(item => this.normalize(item)).filter((item): item is MapPointConfig => item !== null)),
        tap(items => this.replaceCache(items)),
        catchError(error => {
          console.warn('[map config] using hardcoded fallback:', error);
          return of([]);
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    }

    return this.loadRequest$;
  }

  getForCircuit(circuitName: string | null | undefined): MapViewConfig | null {
    const code = this.normalizeCode(circuitName);
    if (!code) return null;

    const config = this.configs.get(code);
    if (config) {
      return {
        lat: config.lat,
        lng: config.lon,
        zoom: config.zoom,
        rotation: config.rotation,
      };
    }

    return getMapCenterForCircuit(code);
  }

  getConfig(circuitName: string | null | undefined): MapPointConfig | null {
    const code = this.normalizeCode(circuitName);
    return code ? this.configs.get(code) ?? null : null;
  }

  save(config: MapPointConfig): Observable<MapPointConfig> {
    const code = this.normalizeCode(config.map_code);
    const payload: MapPointConfig = {
      ...config,
      map_code: code,
      map_name: String(config.map_name ?? '').trim(),
      lat: Number(config.lat),
      lon: Number(config.lon),
      zoom: Number(config.zoom),
      rotation: Number(config.rotation),
    };
    const url = `${getApiUrl(APP_CONFIG.API.ENDPOINTS.UPDATE_MAP_POINT_CONFIG)}/${encodeURIComponent(code)}`;

    return this.http.put<{ data?: MapPointConfig }>(url, payload).pipe(
      map(response => response?.data ?? payload),
      tap(saved => this.configs.set(this.normalizeCode(saved.map_code), saved)),
    );
  }

  private replaceCache(items: MapPointConfig[]): void {
    this.configs.clear();
    for (const item of items) {
      this.configs.set(this.normalizeCode(item.map_code), item);
    }
  }

  private normalize(item: MapPointConfig | null | undefined): MapPointConfig | null {
    if (!item) return null;

    const mapCode = this.normalizeCode(item.map_code);
    const mapName = String(item.map_name ?? '').trim();
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    const zoom = Number(item.zoom);
    const rotation = Number(item.rotation);
    const valid = mapCode && mapName && Number.isFinite(lat) && lat >= -90 && lat <= 90
      && Number.isFinite(lon) && lon >= -180 && lon <= 180
      && Number.isFinite(zoom) && zoom >= 0 && zoom <= 24
      && Number.isFinite(rotation) && rotation >= -360 && rotation <= 360;

    if (!valid) return null;
    return { ...item, map_code: mapCode, map_name: mapName, lat, lon, zoom, rotation };
  }

  private normalizeCode(value: string | null | undefined): string {
    return String(value ?? '').trim().toLowerCase();
  }
}

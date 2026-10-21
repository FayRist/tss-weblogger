import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ToastrService } from 'ngx-toastr';
import { APP_CONFIG } from '../../../app.config';
import { AfrExclusionShapeType, AfrExclusionZone, AfrExclusionZoneConfigItemPayload, AfrExclusionZoneConfigPayload, AfrExclusionZonePayload, AfrExclusionZonePoint } from '../../../model/afr-exclusion-zone.model';
import { MapPointConfig, MapViewConfig } from '../../../model/map-point-config.model';
import { EventService } from '../../../service/event.service';
import { MapPointConfigService } from '../../../service/map-point-config.service';
import { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { LineLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { forkJoin, of } from 'rxjs';

type ZoneLayerDatum = { zone: AfrExclusionZone };

@Component({
  selector: 'app-afr-exclusion-zone-config',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './afr-exclusion-zone-config.component.html',
  styleUrl: './afr-exclusion-zone-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AfrExclusionZoneConfigComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('zoneMap', { static: true }) zoneMap!: ElementRef<HTMLDivElement>;
  @Input() initialCircuit = '';
  @Input() initialMapConfig: MapPointConfig | null = null;
  @Input() initialMapName = '';

  circuits = Object.keys(APP_CONFIG.MAP.CIRCUITS);
  private circuitNames: Record<string, string> = {
    bic: 'Bira International Circuit',
    bric: 'Buriram International Circuit',
    sic: 'Petronas Sepang International Circuit',
    bsc: 'Bangsaen Street Circuit',
  };
  selectedCircuit = this.circuits[0] ?? '';
  zones: AfrExclusionZone[] = [];
  loading = false;
  saving = false;
  configDirty = false;
  mapConfigDirty = false;
  zoneConfigDirty = false;
  drawingPolygon = false;
  editingZoneId: number | null = null;
  formError = '';

  zoneName = '';
  shapeType: AfrExclusionShapeType = 'circle';
  enabled = true;
  centerLat: number | null = null;
  centerLon: number | null = null;
  radiusM = 100;
  polygonPoints: AfrExclusionZonePoint[] = [];
  mapCode = '';
  mapName = '';
  mapLat = 0;
  mapLon = 0;
  mapZoom = 13;
  mapRotation = 0;
  mapFormError = '';

  private map: MapLibreMap | null = null;
  private deckOverlay: MapboxOverlay | null = null;
  private mapResizeObserver: ResizeObserver | null = null;
  private mapViewConfig: MapViewConfig | null = null;
  private loadedCircuit = this.selectedCircuit;
  private nextDraftZoneId = -1;
  private drawingPointerId: number | null = null;
  private lastFreehandContainerPoint: { x: number; y: number } | null = null;
  private pointsBeforeDrawing: AfrExclusionZonePoint[] = [];
  private readonly freehandPointDistancePx = 4;
  private readonly maxFreehandPoints = 500;

  private readonly mapPointerDownHandler = (event: PointerEvent) => this.onMapPointerDown(event);
  private readonly mapPointerMoveHandler = (event: PointerEvent) => this.onMapPointerMove(event);
  private readonly mapPointerUpHandler = (event: PointerEvent) => this.onMapPointerUp(event);
  private readonly mapPointerCancelHandler = (event: PointerEvent) => this.onMapPointerCancel(event);

  constructor(
    private eventService: EventService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef,
    private mapPointConfigService: MapPointConfigService,
  ) {}

  ngOnInit(): void {
    const requestedCircuit = String(this.initialCircuit ?? '').trim().toLowerCase();
    if (requestedCircuit) {
      this.selectedCircuit = requestedCircuit;
    }
    this.initializeMapConfig();
    this.setDefaultCenter();
    this.loadZones();
    this.loadMapCircuits();
    this.mapPointConfigService.load().subscribe(() => {
      if (!this.mapConfigDirty) {
        this.initializeMapConfig();
        this.setDefaultCenter();
      }
      this.updateMapView();
      this.renderDeckLayers();
      this.cdr.markForCheck();
    });
  }

  ngAfterViewInit(): void {
    this.initializeMap();
    this.mapResizeObserver = new ResizeObserver(() => this.map?.resize());
    this.mapResizeObserver.observe(this.zoneMap.nativeElement);
    setTimeout(() => this.map?.resize(), 0);
  }

  ngOnDestroy(): void {
    this.releaseFreehandPointer();
    const mapContainer = this.map?.getContainer();
    mapContainer?.removeEventListener('pointerdown', this.mapPointerDownHandler);
    mapContainer?.removeEventListener('pointermove', this.mapPointerMoveHandler);
    mapContainer?.removeEventListener('pointerup', this.mapPointerUpHandler);
    mapContainer?.removeEventListener('pointercancel', this.mapPointerCancelHandler);
    if (this.map && this.deckOverlay) {
      this.map.removeControl(this.deckOverlay);
    }
    this.mapResizeObserver?.disconnect();
    this.mapResizeObserver = null;
    this.deckOverlay = null;
    this.map?.remove();
  }

  onCircuitChange(): void {
    if (this.configDirty && !confirm('มีการแก้ไข Config ที่ยังไม่ได้บันทึก ต้องการเปลี่ยน circuit และทิ้งการแก้ไขหรือไม่?')) {
      this.selectedCircuit = this.loadedCircuit;
      this.cdr.markForCheck();
      return;
    }
    this.resetEditor();
    this.mapConfigDirty = false;
    this.zoneConfigDirty = false;
    this.updateConfigDirty();
    this.initializeMapConfig();
    this.setDefaultCenter();
    this.loadZones();
    this.updateMapView();
  }

  onMapViewConfigChange(): void {
    this.mapFormError = '';
    this.mapViewConfig = {
      lat: Number(this.mapLat),
      lng: Number(this.mapLon),
      zoom: Number(this.mapZoom),
      rotation: Number(this.mapRotation),
    };
    this.mapConfigDirty = true;
    this.updateConfigDirty();
    this.updateMapView();
    this.renderDraft();
    this.cdr.markForCheck();
  }

  onShapeTypeChange(): void {
    if (this.drawingPolygon) {
      this.cancelPolygon();
    }
    this.formError = '';
    this.polygonPoints = [];
    this.renderDraft();
  }

  startPolygon(): void {
    if (this.saving || this.drawingPolygon) return;
    this.formError = '';
    this.shapeType = 'polygon';
    this.pointsBeforeDrawing = this.polygonPoints.map(point => ({ ...point }));
    this.polygonPoints = [];
    this.drawingPolygon = true;
    this.renderDeckLayers();
    this.setMapDrawingMode(true);
    this.cdr.markForCheck();
  }

  cancelPolygon(): void {
    if (!this.drawingPolygon && this.drawingPointerId === null) return;

    this.releaseFreehandPointer();
    this.drawingPolygon = false;
    this.polygonPoints = this.pointsBeforeDrawing.map(point => ({ ...point }));
    this.pointsBeforeDrawing = [];
    this.formError = '';
    this.renderDeckLayers();
    this.setMapDrawingMode(false);
    this.renderDraft();
    this.cdr.markForCheck();
  }

  onCircleValueChange(): void {
    this.renderDraft();
  }

  editZone(zone: AfrExclusionZone): void {
    if (this.drawingPolygon) {
      this.cancelPolygon();
    }
    this.editingZoneId = zone.id;
    this.selectedCircuit = zone.circuit_name;
    this.zoneName = zone.zone_name;
    this.shapeType = zone.shape_type;
    this.enabled = zone.enabled;
    this.centerLat = zone.center_lat ?? null;
    this.centerLon = zone.center_lon ?? null;
    this.radiusM = zone.radius_m ?? 100;
    this.polygonPoints = zone.points.map(point => ({ ...point }));
    this.drawingPolygon = false;
    this.formError = '';
    this.updateMapView();
    this.renderDraft();
  }

  resetEditor(resetShapeType = true): void {
    this.releaseFreehandPointer();
    this.editingZoneId = null;
    this.zoneName = '';
    if (resetShapeType) {
      this.shapeType = 'circle';
    }
    this.enabled = true;
    this.radiusM = 100;
    this.polygonPoints = [];
    this.pointsBeforeDrawing = [];
    this.drawingPolygon = false;
    this.formError = '';
    this.setMapDrawingMode(false);
    this.renderDeckLayers();
    if (this.shapeType === 'circle') {
      this.setDefaultCenter();
    }
  }

  savePreset(): void {
    const payload = this.buildPayload();
    if (!payload) return;

    const existingZone = this.editingZoneId == null
      ? undefined
      : this.zones.find(zone => zone.id === this.editingZoneId);
    const preset: AfrExclusionZone = {
      ...(existingZone ?? {}),
      ...payload,
      id: existingZone?.id ?? this.nextDraftZoneId--,
      points: payload.points.map(point => ({ ...point })),
    };

    this.zones = existingZone
      ? this.zones.map(zone => zone.id === existingZone.id ? preset : zone)
      : [...this.zones, preset];
    this.zoneConfigDirty = true;
    this.updateConfigDirty();
    this.toastr.success('เพิ่มพื้นที่เข้า Preset แล้ว ยังไม่ได้บันทึกลง DB');
    this.resetEditor(false);
    this.renderDeckLayers();
    this.cdr.markForCheck();
  }

  toggleZone(zone: AfrExclusionZone): void {
    this.zones = this.zones.map(item => item.id === zone.id
      ? { ...item, enabled: !item.enabled }
      : item);
    this.zoneConfigDirty = true;
    this.updateConfigDirty();
    this.renderDeckLayers();
    this.cdr.markForCheck();
  }

  deleteZone(zone: AfrExclusionZone): void {
    if (!confirm(`ลบพื้นที่ ${zone.zone_name} หรือไม่?`)) return;
    this.zones = this.zones.filter(item => item.id !== zone.id);
    if (this.editingZoneId === zone.id) this.resetEditor();
    this.zoneConfigDirty = true;
    this.updateConfigDirty();
    this.renderDeckLayers();
    this.toastr.success('ลบพื้นที่ออกจาก Preset แล้ว จะลบจาก DB เมื่อบันทึก Config');
    this.cdr.markForCheck();
  }

  saveConfig(): void {
    if (this.saving || this.drawingPolygon) return;
    if (!this.configDirty) {
      this.toastr.info('ยังไม่มีการแก้ไข Config');
      return;
    }

    const mapPayload = this.mapConfigDirty ? this.buildMapPayload() : null;
    if (this.mapConfigDirty && !mapPayload) return;

    const saveMap$ = mapPayload ? this.mapPointConfigService.save(mapPayload) : of(null);
    const saveZones$ = this.zoneConfigDirty
      ? this.eventService.saveAfrExclusionZoneConfig({
        circuit_name: this.selectedCircuit,
        zones: this.zones.map(zone => this.toConfigItem(zone)),
      })
      : of(null);
    const savingZones = this.zoneConfigDirty;

    this.saving = true;
    forkJoin({ map: saveMap$, zones: saveZones$ }).subscribe({
      next: ({ map, zones }) => {
        if (map) {
          this.applySavedMapConfig(map);
          this.mapConfigDirty = false;
        }
        if (Array.isArray(zones)) {
          this.zones = zones;
          this.zoneConfigDirty = false;
          this.loadedCircuit = this.selectedCircuit;
          this.resetEditor();
        }
        this.updateConfigDirty();
        this.saving = false;
        this.renderDeckLayers();
        const savedParts = [map ? 'Map Config' : '', savingZones ? 'AFR Config' : ''].filter(Boolean).join(' และ ');
        this.toastr.success(`บันทึก ${savedParts} แล้ว`);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.saving = false;
        const message = this.errorMessage(error, 'บันทึก Map/AFR Config ไม่สำเร็จ');
        this.formError = message;
        this.mapFormError = message;
        this.cdr.markForCheck();
      },
    });
  }

  discardChanges(): void {
    if (!this.configDirty) return;
    if (!confirm('ทิ้งการแก้ไข Map และ AFR Config ที่ยังไม่ได้บันทึกหรือไม่?')) return;

    this.resetEditor();
    this.mapConfigDirty = false;
    this.zoneConfigDirty = false;
    this.updateConfigDirty();
    this.initializeMapConfig();
    this.setDefaultCenter();
    this.updateMapView();
    this.loadZones();
  }

  shapeLabel(shape: AfrExclusionShapeType): string {
    return shape === 'circle' ? 'Circle' : 'Polygon';
  }

  circuitLabel(circuit: string): string {
    return this.circuitNames[circuit] ?? circuit.toUpperCase();
  }

  private initializeMapConfig(): void {
    const mapCode = this.selectedCircuit.toLowerCase();
    const saved = this.mapPointConfigService.getConfig(mapCode) ?? this.initialMapConfig;
    const fallback = this.mapPointConfigService.getForCircuit(mapCode);

    this.mapCode = mapCode;
    this.mapName = saved?.map_name || this.initialMapName || this.circuitLabel(mapCode);
    this.mapLat = saved?.lat ?? fallback?.lat ?? 13.7563;
    this.mapLon = saved?.lon ?? fallback?.lng ?? 100.5018;
    this.mapZoom = saved?.zoom ?? fallback?.zoom ?? 13;
    this.mapRotation = saved?.rotation ?? fallback?.rotation ?? 0;
    this.mapViewConfig = {
      lat: this.mapLat,
      lng: this.mapLon,
      zoom: this.mapZoom,
      rotation: this.mapRotation,
    };
    this.mapFormError = '';
  }

  private buildMapPayload(): MapPointConfig | null {
    this.mapFormError = '';
    const mapCode = this.mapCode.trim().toLowerCase();
    const mapName = this.mapName.trim();
    const lat = Number(this.mapLat);
    const lon = Number(this.mapLon);
    const zoom = Number(this.mapZoom);
    const rotation = Number(this.mapRotation);
    const valid = mapCode && mapName
      && Number.isFinite(lat) && lat >= -90 && lat <= 90
      && Number.isFinite(lon) && lon >= -180 && lon <= 180
      && Number.isFinite(zoom) && zoom >= 0 && zoom <= 24
      && Number.isFinite(rotation) && rotation >= -360 && rotation <= 360;

    if (!valid) {
      this.mapFormError = 'กรุณาตรวจสอบค่า Map Config ให้ถูกต้อง';
      return null;
    }

    return {
      map_code: mapCode,
      map_name: mapName,
      lat,
      lon,
      zoom,
      rotation,
    };
  }

  private applySavedMapConfig(config: MapPointConfig): void {
    this.initialMapConfig = config;
    this.mapCode = config.map_code;
    this.mapName = config.map_name;
    this.mapLat = config.lat;
    this.mapLon = config.lon;
    this.mapZoom = config.zoom;
    this.mapRotation = config.rotation;
    this.mapViewConfig = {
      lat: config.lat,
      lng: config.lon,
      zoom: config.zoom,
      rotation: config.rotation,
    };
    this.updateMapView();
  }

  private updateConfigDirty(): void {
    this.configDirty = this.mapConfigDirty || this.zoneConfigDirty;
  }

  private loadMapCircuits(): void {
    this.eventService.getConfigAdmin('map_list').subscribe({
      next: (rows: any) => {
        const configs = Array.isArray(rows) ? rows : [];
        const nextCircuits = configs
          .map(row => String(row?.value ?? '').trim().toLowerCase())
          .filter((code, index, values) => code && values.indexOf(code) === index);
        if (nextCircuits.length === 0) return;

        this.circuits = nextCircuits;
        this.circuitNames = configs.reduce((labels: Record<string, string>, row: any) => {
          const code = String(row?.value ?? '').trim().toLowerCase();
          const name = String(row?.config_name ?? '').trim();
          if (code && name) labels[code] = name;
          return labels;
        }, {});

        if (!this.circuits.includes(this.selectedCircuit)) {
          this.selectedCircuit = this.circuits[0];
          this.initializeMapConfig();
          this.setDefaultCenter();
          this.loadZones();
          this.updateMapView();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        // Keep the hardcoded circuit list when map_list is unavailable.
      },
    });
  }

  private loadZones(): void {
    if (!this.selectedCircuit) return;
    this.loading = true;
    this.eventService.getAfrExclusionZones(this.selectedCircuit).subscribe({
      next: (zones) => {
        this.zones = zones;
        this.loading = false;
        this.zoneConfigDirty = false;
        this.updateConfigDirty();
        this.loadedCircuit = this.selectedCircuit;
        this.nextDraftZoneId = -1;
        this.renderDeckLayers();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.loading = false;
        this.toastr.error(this.errorMessage(error, 'โหลด AFR exclusion zones ไม่สำเร็จ'));
        this.cdr.markForCheck();
      },
    });
  }

  private toConfigItem(zone: AfrExclusionZone): AfrExclusionZoneConfigItemPayload {
    return {
      id: zone.id > 0 ? zone.id : undefined,
      zone_name: zone.zone_name,
      shape_type: zone.shape_type,
      enabled: zone.enabled,
      center_lat: zone.center_lat ?? null,
      center_lon: zone.center_lon ?? null,
      radius_m: zone.radius_m ?? null,
      points: zone.points.map(point => ({ ...point })),
    };
  }

  private initializeMap(): void {
    const center = this.mapCenter();
    this.map = new MapLibreMap({
      container: this.zoneMap.nativeElement,
      style: `https://api.maptiler.com/maps/satellite/style.json?key=${APP_CONFIG.MAP.API_KEY}`,
      center: [center.lng, center.lat],
      zoom: this.getMapZoom(),
      pitch: 0,
      bearing: this.getMapRotation(),
    });
    this.deckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
    });
    this.map.addControl(this.deckOverlay);
    this.map.on('click', (event: MapMouseEvent) => this.onMapClick(event));
    const mapContainer = this.map.getContainer();
    mapContainer.addEventListener('pointerdown', this.mapPointerDownHandler);
    mapContainer.addEventListener('pointermove', this.mapPointerMoveHandler);
    mapContainer.addEventListener('pointerup', this.mapPointerUpHandler);
    mapContainer.addEventListener('pointercancel', this.mapPointerCancelHandler);
    this.renderDeckLayers();
  }

  private onMapClick(event: MapMouseEvent): void {
    if (this.shapeType === 'circle' && !this.drawingPolygon) {
      this.centerLat = Number(event.lngLat.lat.toFixed(7));
      this.centerLon = Number(event.lngLat.lng.toFixed(7));
      this.renderDraft();
    }
  }

  private onMapPointerDown(event: PointerEvent): void {
    if (!this.map || !this.drawingPolygon || this.shapeType !== 'polygon' || this.saving) return;
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    event.preventDefault();
    event.stopPropagation();
    this.drawingPointerId = event.pointerId;
    this.map.getContainer().setPointerCapture?.(event.pointerId);
    this.map.dragPan.disable();
    this.lastFreehandContainerPoint = null;
    this.appendFreehandPoint(event);
  }

  private onMapPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.drawingPointerId) return;

    event.preventDefault();
    event.stopPropagation();
    this.appendFreehandPoint(event);
  }

  private onMapPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.drawingPointerId) return;

    event.preventDefault();
    event.stopPropagation();
    this.finishFreehandPolygon();
  }

  private onMapPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.drawingPointerId) return;

    event.preventDefault();
    event.stopPropagation();
    this.cancelPolygon();
  }

  private appendFreehandPoint(event: PointerEvent): void {
    if (!this.map) return;

    const container = this.map.getContainer();
    const rect = container.getBoundingClientRect();
    const containerPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    if (this.lastFreehandContainerPoint
      && Math.hypot(
        this.lastFreehandContainerPoint.x - containerPoint.x,
        this.lastFreehandContainerPoint.y - containerPoint.y,
      ) < this.freehandPointDistancePx) {
      return;
    }

    const lngLat = this.map.unproject([containerPoint.x, containerPoint.y]);
    this.polygonPoints = [...this.polygonPoints, {
      lat: Number(lngLat.lat.toFixed(7)),
      lon: Number(lngLat.lng.toFixed(7)),
    }];
    this.lastFreehandContainerPoint = containerPoint;
    this.renderFreehandPreview();
  }

  private finishFreehandPolygon(): void {
    const completedPoints = this.limitFreehandPoints(this.polygonPoints);
    this.releaseFreehandPointer();
    this.drawingPolygon = false;

    if (completedPoints.length < 3) {
      this.polygonPoints = this.pointsBeforeDrawing.map(point => ({ ...point }));
      this.formError = 'กรุณาลากให้เกิดพื้นที่อย่างน้อย 3 จุด';
    } else {
      this.polygonPoints = completedPoints;
      this.formError = '';
    }

    this.pointsBeforeDrawing = [];
    this.setMapDrawingMode(false);
    this.renderDraft();
    this.cdr.markForCheck();
  }

  private limitFreehandPoints(points: AfrExclusionZonePoint[]): AfrExclusionZonePoint[] {
    if (points.length <= this.maxFreehandPoints) {
      return points.map(point => ({ ...point }));
    }

    const lastIndex = points.length - 1;
    return Array.from({ length: this.maxFreehandPoints }, (_, index) => {
      const sourceIndex = Math.round((index * lastIndex) / (this.maxFreehandPoints - 1));
      return { ...points[sourceIndex] };
    });
  }

  private renderFreehandPreview(): void {
    this.renderDeckLayers();
  }

  private releaseFreehandPointer(): void {
    const mapContainer = this.map?.getContainer();
    if (this.drawingPointerId !== null && mapContainer?.hasPointerCapture?.(this.drawingPointerId)) {
      mapContainer.releasePointerCapture(this.drawingPointerId);
    }
    this.drawingPointerId = null;
    this.lastFreehandContainerPoint = null;
    this.map?.dragPan.enable();
  }

  private setMapDrawingMode(active: boolean): void {
    const mapContainer = this.map?.getContainer();
    if (!mapContainer) return;

    mapContainer.style.cursor = active ? 'crosshair' : '';
    mapContainer.style.touchAction = active ? 'none' : '';
  }

  private buildPayload(): AfrExclusionZonePayload | null {
    this.formError = '';
    const name = this.zoneName.trim();
    if (!name) {
      this.formError = 'กรุณาระบุชื่อพื้นที่';
      return null;
    }

    if (this.shapeType === 'circle') {
      if (this.centerLat == null || this.centerLon == null || !Number.isFinite(Number(this.centerLat)) || !Number.isFinite(Number(this.centerLon))) {
        this.formError = 'กรุณาคลิกแผนที่หรือกรอกจุดศูนย์กลางของ Circle';
        return null;
      }
      if (!Number.isFinite(this.radiusM) || this.radiusM <= 0) {
        this.formError = 'Radius ต้องมากกว่า 0 เมตร';
        return null;
      }
      return {
        circuit_name: this.selectedCircuit,
        zone_name: name,
        shape_type: 'circle',
        enabled: this.enabled,
        center_lat: Number(this.centerLat),
        center_lon: Number(this.centerLon),
        radius_m: Number(this.radiusM),
        points: [],
      };
    }

    if (this.polygonPoints.length < 3 || this.polygonPoints.some(point => !Number.isFinite(point.lat) || !Number.isFinite(point.lon))) {
      this.formError = 'Polygon ต้องมีพิกัดที่ถูกต้องอย่างน้อย 3 จุด';
      return null;
    }
    return {
      circuit_name: this.selectedCircuit,
      zone_name: name,
      shape_type: 'polygon',
      enabled: this.enabled,
      center_lat: null,
      center_lon: null,
      radius_m: null,
      points: this.polygonPoints.map(point => ({ lat: Number(point.lat), lon: Number(point.lon) })),
    };
  }

  private renderDraft(): void {
    this.renderDeckLayers();
  }

  private setDefaultCenter(): void {
    const center = this.currentMapView();
    this.centerLat = center?.lat ?? null;
    this.centerLon = center?.lng ?? null;
  }

  private mapCenter(): { lat: number; lng: number } {
    const center = this.currentMapView();
    return { lat: center?.lat ?? 13.7563, lng: center?.lng ?? 100.5018 };
  }

  private getMapZoom(): number {
    return this.currentMapView()?.zoom ?? 13;
  }

  private getMapRotation(): number {
    return this.currentMapView()?.rotation ?? 0;
  }

  private currentMapView(): MapViewConfig | null {
    const override = this.mapViewConfig;
    if (override
      && Number.isFinite(override.lat) && override.lat >= -90 && override.lat <= 90
      && Number.isFinite(override.lng) && override.lng >= -180 && override.lng <= 180
      && Number.isFinite(override.zoom) && override.zoom >= 0 && override.zoom <= 24
      && Number.isFinite(override.rotation) && override.rotation >= -360 && override.rotation <= 360) {
      return override;
    }
    return this.mapPointConfigService.getForCircuit(this.selectedCircuit);
  }

  private updateMapView(): void {
    if (!this.map) return;
    const center = this.mapCenter();
    this.map.jumpTo({
      center: [center.lng, center.lat],
      zoom: this.getMapZoom(),
      bearing: this.getMapRotation(),
      pitch: 0,
    });
  }

  private renderDeckLayers(): void {
    if (!this.deckOverlay) return;

    const layers: Layer[] = [];
    const circleData: ZoneLayerDatum[] = this.zones
      .filter(zone => zone.shape_type === 'circle' && zone.center_lat != null && zone.center_lon != null && zone.radius_m != null)
      .map(zone => ({ zone }));
    const polygonData: ZoneLayerDatum[] = this.zones
      .filter(zone => zone.shape_type === 'polygon' && zone.points.length >= 3)
      .map(zone => ({ zone }));

    if (circleData.length > 0) {
      layers.push(new ScatterplotLayer({
        id: 'afr-zone-circles',
        data: circleData,
        getPosition: (item: ZoneLayerDatum) => [item.zone.center_lon!, item.zone.center_lat!],
        getRadius: (item: ZoneLayerDatum) => item.zone.radius_m!,
        radiusUnits: 'meters',
        radiusMinPixels: 2,
        getFillColor: (item: ZoneLayerDatum) => this.zoneColor(item.zone),
        getLineColor: (item: ZoneLayerDatum) => this.zoneLineColor(item.zone),
        lineWidthMinPixels: 2,
        stroked: true,
        filled: true,
        pickable: true,
        onClick: (info: any) => this.onZoneLayerClick(info),
        parameters: { depthTest: false },
      }));
    }

    if (polygonData.length > 0) {
      layers.push(new PolygonLayer({
        id: 'afr-zone-polygons',
        data: polygonData,
        getPolygon: (item: ZoneLayerDatum) => item.zone.points.map(point => [point.lon, point.lat]),
        getFillColor: (item: ZoneLayerDatum) => this.zoneColor(item.zone),
        getLineColor: (item: ZoneLayerDatum) => this.zoneLineColor(item.zone),
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        stroked: true,
        filled: true,
        pickable: true,
        onClick: (info: any) => this.onZoneLayerClick(info),
        parameters: { depthTest: false },
      }));
    }

    if (this.shapeType === 'circle' && this.centerLat != null && this.centerLon != null
      && Number.isFinite(this.radiusM) && this.radiusM > 0) {
      layers.push(new ScatterplotLayer({
        id: 'afr-zone-draft-circle',
        data: [{ position: [this.centerLon, this.centerLat], radius: this.radiusM }],
        getPosition: (item: any) => item.position,
        getRadius: (item: any) => item.radius,
        radiusUnits: 'meters',
        radiusMinPixels: 2,
        getFillColor: [96, 165, 250, 52],
        getLineColor: [37, 99, 235, 255],
        lineWidthMinPixels: 3,
        stroked: true,
        filled: true,
        pickable: false,
        parameters: { depthTest: false },
      }));
    }

    if (this.shapeType === 'polygon' && this.polygonPoints.length >= 2) {
      const path = this.polygonPoints.map(point => [point.lon, point.lat]);
      if (!this.drawingPolygon && this.polygonPoints.length >= 3) {
        layers.push(new PolygonLayer({
          id: 'afr-zone-draft-polygon',
          data: [{ path }],
          getPolygon: (item: any) => item.path,
          getFillColor: [96, 165, 250, 52],
          getLineColor: [37, 99, 235, 255],
          getLineWidth: 3,
          lineWidthUnits: 'pixels',
          stroked: true,
          filled: true,
          pickable: false,
          parameters: { depthTest: false },
        }));
      } else {
        layers.push(new LineLayer({
          id: 'afr-zone-freehand-preview',
          data: [{ path }],
          getPath: (item: any) => item.path,
          getColor: [37, 99, 235, 255],
          getWidth: 3,
          widthUnits: 'pixels',
          pickable: false,
          parameters: { depthTest: false },
        }));
      }
    }

    this.deckOverlay.setProps({ layers });
  }

  private onZoneLayerClick(info: any): void {
    const zone = (info?.object as ZoneLayerDatum | undefined)?.zone;
    if (zone && !this.drawingPolygon) {
      this.editZone(zone);
    }
  }

  private zoneColor(zone: AfrExclusionZone): [number, number, number, number] {
    if (!zone.enabled) return [100, 116, 139, 38];
    if (zone.id < 0) return [245, 158, 11, 52];
    return [220, 38, 38, 52];
  }

  private zoneLineColor(zone: AfrExclusionZone): [number, number, number, number] {
    if (!zone.enabled) return [100, 116, 139, 230];
    if (zone.id < 0) return [245, 158, 11, 255];
    return [220, 38, 38, 255];
  }

  private errorMessage(error: unknown, fallback: string): string {
    const response = error as { error?: { description?: string; error?: string }; message?: string } | null;
    return response?.error?.description || response?.error?.error || response?.message || fallback;
  }
}

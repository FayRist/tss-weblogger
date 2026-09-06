import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { ToastrService } from 'ngx-toastr';
import { APP_CONFIG, getMapCenterForCircuit } from '../../../app.config';
import { AfrExclusionShapeType, AfrExclusionZone, AfrExclusionZoneConfigItemPayload, AfrExclusionZoneConfigPayload, AfrExclusionZonePayload, AfrExclusionZonePoint } from '../../../model/afr-exclusion-zone.model';
import { EventService } from '../../../service/event.service';

@Component({
  selector: 'app-afr-exclusion-zone-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './afr-exclusion-zone-config.component.html',
  styleUrl: './afr-exclusion-zone-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AfrExclusionZoneConfigComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('zoneMap', { static: true }) zoneMap!: ElementRef<HTMLDivElement>;

  readonly circuits = Object.keys(APP_CONFIG.MAP.CIRCUITS);
  selectedCircuit = this.circuits[0] ?? '';
  zones: AfrExclusionZone[] = [];
  loading = false;
  saving = false;
  configDirty = false;
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

  private map: L.Map | null = null;
  private savedLayerGroup: L.LayerGroup = L.layerGroup();
  private draftLayer: L.Layer | null = null;
  private loadedCircuit = this.selectedCircuit;
  private nextDraftZoneId = -1;
  private drawingPointerId: number | null = null;
  private lastFreehandContainerPoint: L.Point | null = null;
  private pointsBeforeDrawing: AfrExclusionZonePoint[] = [];
  private readonly freehandPointDistancePx = 4;
  private readonly maxFreehandPoints = 500;

  private readonly mapPointerDownHandler = (event: PointerEvent) => this.onMapPointerDown(event);
  private readonly mapPointerMoveHandler = (event: PointerEvent) => this.onMapPointerMove(event);
  private readonly mapPointerUpHandler = (event: PointerEvent) => this.onMapPointerUp(event);
  private readonly mapPointerCancelHandler = (event: PointerEvent) => this.onMapPointerCancel(event);

  constructor(private eventService: EventService, private toastr: ToastrService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.setDefaultCenter();
    this.loadZones();
  }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnDestroy(): void {
    this.releaseFreehandPointer();
    const mapContainer = this.map?.getContainer();
    mapContainer?.removeEventListener('pointerdown', this.mapPointerDownHandler);
    mapContainer?.removeEventListener('pointermove', this.mapPointerMoveHandler);
    mapContainer?.removeEventListener('pointerup', this.mapPointerUpHandler);
    mapContainer?.removeEventListener('pointercancel', this.mapPointerCancelHandler);
    this.map?.remove();
  }

  onCircuitChange(): void {
    if (this.configDirty && !confirm('มีการแก้ไข Config ที่ยังไม่ได้บันทึก ต้องการเปลี่ยน circuit และทิ้งการแก้ไขหรือไม่?')) {
      this.selectedCircuit = this.loadedCircuit;
      this.cdr.markForCheck();
      return;
    }
    this.resetEditor();
    this.configDirty = false;
    this.setDefaultCenter();
    this.loadZones();
    this.map?.setView(this.mapCenter(), this.mapZoom());
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
    this.removeDraftLayer();
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
    this.removeDraftLayer();
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
    this.map?.setView(this.mapCenter(), this.mapZoom());
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
    this.removeDraftLayer();
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
    this.configDirty = true;
    this.toastr.success('เพิ่มพื้นที่เข้า Preset แล้ว ยังไม่ได้บันทึกลง DB');
    this.resetEditor(false);
    this.renderSavedZones();
    this.cdr.markForCheck();
  }

  toggleZone(zone: AfrExclusionZone): void {
    this.zones = this.zones.map(item => item.id === zone.id
      ? { ...item, enabled: !item.enabled }
      : item);
    this.configDirty = true;
    this.renderSavedZones();
    this.cdr.markForCheck();
  }

  deleteZone(zone: AfrExclusionZone): void {
    if (!confirm(`ลบพื้นที่ ${zone.zone_name} หรือไม่?`)) return;
    this.zones = this.zones.filter(item => item.id !== zone.id);
    if (this.editingZoneId === zone.id) this.resetEditor();
    this.configDirty = true;
    this.renderSavedZones();
    this.toastr.success('ลบพื้นที่ออกจาก Preset แล้ว จะลบจาก DB เมื่อบันทึก Config');
    this.cdr.markForCheck();
  }

  saveConfig(): void {
    if (this.saving || this.drawingPolygon) return;
    if (!this.configDirty) {
      this.toastr.info('ยังไม่มีการแก้ไข Config');
      return;
    }

    const payload: AfrExclusionZoneConfigPayload = {
      circuit_name: this.selectedCircuit,
      zones: this.zones.map(zone => this.toConfigItem(zone)),
    };
    this.saving = true;
    this.eventService.saveAfrExclusionZoneConfig(payload).subscribe({
      next: (zones) => {
        this.zones = zones;
        this.configDirty = false;
        this.saving = false;
        this.loadedCircuit = this.selectedCircuit;
        this.toastr.success(`บันทึก AFR Config แล้ว ${zones.length} พื้นที่`);
        this.resetEditor();
        this.renderSavedZones();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.saving = false;
        this.formError = this.errorMessage(error, 'บันทึก AFR Config ไม่สำเร็จ');
        this.cdr.markForCheck();
      },
    });
  }

  discardChanges(): void {
    if (!this.configDirty) return;
    if (!confirm('ทิ้งการแก้ไข AFR Config ที่ยังไม่ได้บันทึกหรือไม่?')) return;

    this.resetEditor();
    this.configDirty = false;
    this.loadZones();
  }

  shapeLabel(shape: AfrExclusionShapeType): string {
    return shape === 'circle' ? 'Circle' : 'Polygon';
  }

  circuitLabel(circuit: string): string {
    const labels: Record<string, string> = { bic: 'Bira Circuit', bric: 'Chang International Circuit', bsc: 'Bangsaen Street Circuit' };
    return labels[circuit] ?? circuit.toUpperCase();
  }

  private loadZones(): void {
    if (!this.selectedCircuit) return;
    this.loading = true;
    this.eventService.getAfrExclusionZones(this.selectedCircuit).subscribe({
      next: (zones) => {
        this.zones = zones;
        this.loading = false;
        this.configDirty = false;
        this.loadedCircuit = this.selectedCircuit;
        this.nextDraftZoneId = -1;
        this.renderSavedZones();
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
    this.map = L.map(this.zoneMap.nativeElement, { doubleClickZoom: false }).setView(center, this.mapZoom());
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 20,
    }).addTo(this.map);
    this.savedLayerGroup.addTo(this.map);
    this.map.on('click', (event: L.LeafletMouseEvent) => this.onMapClick(event.latlng));
    const mapContainer = this.map.getContainer();
    mapContainer.addEventListener('pointerdown', this.mapPointerDownHandler);
    mapContainer.addEventListener('pointermove', this.mapPointerMoveHandler);
    mapContainer.addEventListener('pointerup', this.mapPointerUpHandler);
    mapContainer.addEventListener('pointercancel', this.mapPointerCancelHandler);
    this.renderSavedZones();
  }

  private onMapClick(latlng: L.LatLng): void {
    if (this.shapeType === 'circle' && !this.drawingPolygon) {
      this.centerLat = Number(latlng.lat.toFixed(7));
      this.centerLon = Number(latlng.lng.toFixed(7));
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
    this.map.dragging.disable();
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

    const containerPoint = this.map.mouseEventToContainerPoint(event);
    if (this.lastFreehandContainerPoint && this.lastFreehandContainerPoint.distanceTo(containerPoint) < this.freehandPointDistancePx) {
      return;
    }

    const latLng = this.map.containerPointToLatLng(containerPoint);
    this.polygonPoints = [...this.polygonPoints, {
      lat: Number(latLng.lat.toFixed(7)),
      lon: Number(latLng.lng.toFixed(7)),
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
    if (!this.map) return;

    const latLngs: L.LatLngExpression[] = this.polygonPoints.map(point => [point.lat, point.lon]);
    const previewLayer = this.draftLayer as L.Polyline | null;
    if (previewLayer && typeof previewLayer.setLatLngs === 'function') {
      previewLayer.setLatLngs(latLngs);
      return;
    }

    this.removeDraftLayer();
    this.draftLayer = L.polyline(latLngs, {
      color: '#2563eb',
      weight: 3,
      dashArray: '6 4',
      interactive: false,
    }).addTo(this.map);
  }

  private releaseFreehandPointer(): void {
    const mapContainer = this.map?.getContainer();
    if (this.drawingPointerId !== null && mapContainer?.hasPointerCapture?.(this.drawingPointerId)) {
      mapContainer.releasePointerCapture(this.drawingPointerId);
    }
    this.drawingPointerId = null;
    this.lastFreehandContainerPoint = null;
    this.map?.dragging.enable();
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

  private renderSavedZones(): void {
    if (!this.map) return;
    this.savedLayerGroup.clearLayers();
    this.zones.forEach(zone => {
      const color = !zone.enabled ? '#64748b' : zone.id < 0 ? '#f59e0b' : '#dc2626';
      let layer: L.Layer | null = null;
      if (zone.shape_type === 'circle' && zone.center_lat != null && zone.center_lon != null && zone.radius_m != null) {
        layer = L.circle([zone.center_lat, zone.center_lon], { radius: zone.radius_m, color, fillColor: color, fillOpacity: 0.15, weight: 2 });
      } else if (zone.shape_type === 'polygon' && zone.points.length >= 3) {
        layer = L.polygon(zone.points.map(point => [point.lat, point.lon] as [number, number]), { color, fillColor: color, fillOpacity: 0.15, weight: 2 });
      }
      if (layer) {
        layer.bindTooltip(`${zone.zone_name} (${this.shapeLabel(zone.shape_type)})`);
        layer.on('click', () => {
          if (!this.drawingPolygon) this.editZone(zone);
        });
        this.savedLayerGroup.addLayer(layer);
      }
    });
  }

  private renderDraft(): void {
    if (!this.map) return;
    this.removeDraftLayer();
    const options = { color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.2, weight: 3, dashArray: '6 4' };
    if (this.shapeType === 'circle' && this.centerLat != null && this.centerLon != null && Number.isFinite(this.radiusM) && this.radiusM > 0) {
      this.draftLayer = L.circle([this.centerLat, this.centerLon], { ...options, radius: this.radiusM }).addTo(this.map);
    } else if (this.shapeType === 'polygon' && this.polygonPoints.length >= 2) {
      this.draftLayer = L.polygon(this.polygonPoints.map(point => [point.lat, point.lon] as [number, number]), options).addTo(this.map);
    }
  }

  private removeDraftLayer(): void {
    if (this.draftLayer && this.map) {
      this.map.removeLayer(this.draftLayer);
    }
    this.draftLayer = null;
  }

  private setDefaultCenter(): void {
    const center = getMapCenterForCircuit(this.selectedCircuit);
    this.centerLat = center?.lat ?? null;
    this.centerLon = center?.lng ?? null;
  }

  private mapCenter(): L.LatLngExpression {
    const center = getMapCenterForCircuit(this.selectedCircuit);
    return [center?.lat ?? 13.7563, center?.lng ?? 100.5018];
  }

  private mapZoom(): number {
    return getMapCenterForCircuit(this.selectedCircuit)?.zoom ?? 13;
  }

  private errorMessage(error: unknown, fallback: string): string {
    const response = error as { error?: { description?: string; error?: string }; message?: string } | null;
    return response?.error?.description || response?.error?.error || response?.message || fallback;
  }
}

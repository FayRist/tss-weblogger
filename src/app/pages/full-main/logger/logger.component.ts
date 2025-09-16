import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {MatInputModule} from '@angular/material/input';
import {MatFormFieldModule} from '@angular/material/form-field';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_SELECT_CONFIG, MatSelect, MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { CarLogger } from '../../../../../public/models/car-logger.model';
import { delay, of, startWith, Subscription } from 'rxjs';
import {
  ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis, ApexStroke, ApexDataLabels,
  ApexFill, ApexMarkers, ApexGrid, ApexLegend, ApexTooltip, ApexTheme,
  NgxApexchartsModule,
  ChartComponent
} from 'ngx-apexcharts';
import * as L from 'leaflet';

type ChartKey   = 'avgAfr' | 'realtimeAfr' | 'warningAfr' | 'speed'; // ใช้กับกราฟจริง
type SelectKey  = ChartKey | 'all';

//-----Chart--------------###############################################
// === โมเดลจุดข้อมูล (x = เวลาแบบ ms, y = ค่าตัวเลข) ===
interface LoggerPoint {
  ts: number;            // timestamp (ms)
  avgAfr: number;
  realtimeAfr: number;
  warningAfr: number;
  speed: number;
}


// พาเล็ตให้เข้ากับธีมหน้าคุณ
const PAL = {
  text:      '#CFD8DC',
  textMuted: '#9AA7B2',
  grid:      '#2A3139',
  axis:      '#3B444D',
  series:    ['#4FC3F7', '#00E5A8', '#FFCA28', '#7E57C2']
};
const SERIES_COLORS: Record<ChartKey, string> = {
  avgAfr:      '#4FC3F7',
  realtimeAfr: '#00E5A8',
  warningAfr:  '#FFCA28',
  speed:       '#7E57C2',
};
//-----Chart--------------###############################################


//-----MapRace--------------###############################################

type RawRow = {
  gps_time: string;  // ISO
  lat: number;       // latitude in degrees
  long: number;      // longitude in degrees
  velocity?: number;
  heading?: number;
  // เพิ่มฟิลด์ได้ตามจริง เช่น afr: number
};

type MapPoint = {
  ts: number;
  lat: number;
  lon: number;
  afr?: number;
  warning?: boolean; // ถ้าคำนวณไว้แล้วก็ใส่มาได้
};

const AFR_LIMIT = 13.5; // เกณฑ์เตือนตัวอย่าง (ปรับได้)
const COLORS = {
  track: '#22D3EE',      // เส้นทางปกติ (เขียวฟ้า)
  warn:  '#F59E0B',      // จุดเตือน (เหลือง)
  live:  '#00FFA3'       // ตำแหน่งล่าสุด
};
type PointDef = { idMap: string; lat: number; lon: number; zoom?: number };
//-----MapRace--------------###############################################





@Component({
  selector: 'app-logger',
  imports: [ FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule
    , ReactiveFormsModule, MatButtonModule, MatDividerModule, MatIconModule
    , MatToolbarModule, NgxApexchartsModule],
  templateUrl: './logger.component.html',
  styleUrl: './logger.component.scss',
  providers: [
    { provide: MAT_SELECT_CONFIG, useValue: { overlayPanelClass: 'chart-filter-overlay-180' } }
  ]
})
export class LoggerComponent implements OnInit , OnDestroy, AfterViewInit {
  //--- Chart ------
  @ViewChild('selectButton', { read: ElementRef }) selectButtonEl!: ElementRef<HTMLElement>;
  @ViewChild('select') select!: MatSelect;
  @ViewChild('chart') chart!: ChartComponent;
  chartsReady = false;

  pointMap: PointDef[] = [
    { idMap:'bric', lat: 14.9635357, lon: 103.085812,   zoom: 16 },
    { idMap:'sic',  lat:  2.76101,   lon: 101.7343345,  zoom: 16 },
    { idMap:'bsc',  lat: 13.304051,  lon: 100.9014779,  zoom: 16 },
  ];

  currentPoints: LoggerPoint[] = [];
  options: { value: ChartKey; label: string; }[] = [
    { value: 'avgAfr',      label: 'Average AFR' },
    { value: 'realtimeAfr', label: 'Realtime AFR' },
    { value: 'warningAfr',  label: 'Warning AFR' },
    { value: 'speed',       label: 'Speed' },
  ];

  selectedKeys: ChartKey[] = ['avgAfr', 'realtimeAfr'];
  brushOverviewKey: ChartKey = 'realtimeAfr';

  currentPageData: any[] = [];
  chartFilter = new FormControl<SelectKey[]>(['avgAfr', 'realtimeAfr'], { nonNullable: true });
  private isChartKey = (k: SelectKey): k is ChartKey => k !== 'all';
  showRoutePath: boolean = true;
  private subscriptions: Subscription[] = [];


  allLogger: CarLogger[] = [];

  private fieldMap: Record<ChartKey, keyof LoggerPoint> = {
    avgAfr: 'avgAfr',
    realtimeAfr: 'realtimeAfr',
    warningAfr: 'warningAfr',
    speed: 'speed'
  };
  //--- Chart ------


  //--- Race ------
  @ViewChild('raceMap') raceMapRef!: ElementRef<HTMLDivElement>;

  private map!: L.Map;
  private baseLayers!: Record<string, L.TileLayer>;
  private trackLine?: L.Polyline;
  private warnLayer = L.layerGroup();
  private liveMarker?: L.Marker;
  //--- Race ------

  // ////////////////////////
  // ===== กราฟหลัก (Detail) =====
  detailOpts: {
    series: ApexAxisChartSeries;
    chart:  ApexChart;
    xaxis:  ApexXAxis;
    yaxis:  ApexYAxis | ApexYAxis[];
    stroke: ApexStroke;
    dataLabels: ApexDataLabels;
    markers: ApexMarkers;
    colors: string[];
    grid: ApexGrid;
    fill: ApexFill;
    tooltip: ApexTooltip;
    legend: ApexLegend;
    theme: ApexTheme;
  } = {
    series: [],
    chart: {
      id: 'detailChart',
      type: 'line',
      height: 300,
      background: 'transparent',
      foreColor: PAL.text,
      toolbar: { show: true }
    },
    xaxis: {
      type: 'datetime',
      axisBorder: { color: PAL.axis },
      axisTicks:  { color: PAL.axis },
      labels:     { style: { colors: PAL.textMuted } }
    },
    yaxis: { labels: { style: { colors: PAL.textMuted } } },
    stroke: { curve: 'smooth', width: [2, 2, 3, 2], dashArray: [0, 0, 6, 0] }, // warning = เส้นประ
    dataLabels: { enabled: false },
    markers: { size: 0 },
    colors: PAL.series,
    grid: { borderColor: PAL.grid, strokeDashArray: 3 },
    fill: { type: 'gradient', gradient: { shade: 'dark'} },
    tooltip: { theme: 'dark', fillSeriesColor: false },
    legend:  { show: true, position: 'bottom', labels: { colors: PAL.textMuted } },
    theme:   { mode: 'dark' }
  };

  // ===== กราฟล่าง (Brush/Navigator) =====
  brushOpts: {
    series: ApexAxisChartSeries;
    chart:  ApexChart;
    xaxis:  ApexXAxis;
    yaxis:  ApexYAxis | ApexYAxis[];
    colors: string[];
    fill: ApexFill;
    grid: ApexGrid;
    dataLabels: ApexDataLabels;
    stroke: ApexStroke;
    theme: ApexTheme;
  } = {
    series: [],
    chart: {
      id: 'brushChart',
      type: 'line',
      height: 120,
      brush: { enabled: true, target: 'detailChart' },
      selection: { enabled: true },       // ลากเลือกช่วง
      background: 'transparent',
      foreColor: PAL.text
    },
    xaxis: {
      type: 'datetime',
      labels: { show: false }, axisTicks: { show: false }, axisBorder: { show: false }
    },
    yaxis: { labels: { show: false } },
    colors: [PAL.series[1]],              // สีเดียวกับ overviewKey
    fill: { type: 'gradient', gradient: { shade: 'dark'} },
    grid: { borderColor: PAL.grid, strokeDashArray: 3 },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 1.5 },
    theme: { mode: 'dark' }
  };
  // ---------- OPTIONS ของกราฟหลัก (detail) ----------
  // ////////////////////////

  constructor(private router: Router, private route: ActivatedRoute, private cdr: ChangeDetectorRef ) {
    this.setCurrentPoints(this.buildMock(180));
  }

  ngOnInit() {
    this.chartFilter.valueChanges
      .pipe(startWith(this.chartFilter.value))
      .subscribe(values => {
        let v = (values ?? []) as SelectKey[];
        if (v.includes('all')) {
          v = this.options.map(o => o.value);
          this.chartFilter.setValue(v, { emitEvent: false });
        }
        this.selectedKeys = v.filter(this.isChartKey);
        this.refreshDetail();
        this.refreshBrush();
        this.chartsReady = true; // ✅ พร้อมแล้ว
      });
  }

  // === เมื่อโหลด/เปลี่ยนข้อมูล ===
  setCurrentPoints(points: LoggerPoint[]) {
    this.currentPoints = points ?? [];

    // ตั้งค่าช่วงเลือกเริ่มต้น (เช่น ช่วงท้ายสุด 45 จุด)
    if (this.currentPoints.length > 2) {
      const last = this.currentPoints.at(-1)!.ts;
      const first = this.currentPoints[Math.max(0, this.currentPoints.length - 45)].ts;
      this.brushOpts = {
        ...this.brushOpts,
        chart: {
          ...this.brushOpts.chart,
          selection: { enabled: true, xaxis: { min: first, max: last } }
        }
      };
    }

    this.refreshBrush();   // series ของกราฟล่าง
    this.refreshDetail();  // series ของกราฟบน

    this.cdr.markForCheck();
  }

  // === เมื่อผู้ใช้เลือกเส้น (จาก mat-select multiple ของคุณ) ===
  onMultiSelectChange(values: SelectKey[] | null): void {
    let arr = (values ?? []);
    if (arr.includes('all')) {
      arr = this.options.map(o => o.value); // ทุกเส้น
    }
    this.selectedKeys = arr.filter((k): k is ChartKey => k !== 'all');
    this.refreshDetail(); // หรือ applySeries()
    this.refreshBrush();
  }
  // ---------- Helpers ----------
  // private refreshDetail() {
  //   const series: ApexAxisChartSeries = this.selectedKeys.map((k) => {
  //     const name = this.options.find(o => o.value === k)?.label ?? k;
  //     const field = this.fieldMap[k];
  //     // ใช้รูปแบบ {x: timestamp(ms), y: number}
  //     const data = this.currentPoints.map(p => ({ x: p.ts, y: Number(p[field]) || null }));
  //     return { name, data };
  //   }) as ApexAxisChartSeries;

  //   this.detailOpts = { ...this.detailOpts, series };
  // }

  private buildSeries(keys: ChartKey[]): ApexAxisChartSeries {
    if (!Array.isArray(this.currentPoints) || !this.currentPoints.length || !keys.length) {
      return [];
    }
    return keys.map(k => {
      const field = this.fieldMap[k];
      const name  = this.options.find(o => o.value === k)?.label ?? k;
      const data  = this.currentPoints.map(p => {
        const y = Number(p[field]);
        return { x: p.ts, y: isFinite(y) ? y : null }; // null ได้ แต่หลีกเลี่ยง undefined/NaN
      });
      return { name, data };
    });
  }


  private refreshDetail(): void {
    const series = this.buildSeries(this.selectedKeys);
    if (!series.length) {
      // เคลียร์แบบปลอดภัย (บางเวอร์ชันของ Apex ไม่ชอบ series = undefined)
      this.detailOpts = { ...this.detailOpts, series: [] };
      return;
    }
    const widthArr    = new Array(series.length).fill(2);
    const dashArr     = this.selectedKeys.map(k => k === 'warningAfr' ? 6 : 0);
    const colorArr    = this.selectedKeys.map(k => SERIES_COLORS[k]).filter(Boolean);

    this.detailOpts = {
      ...this.detailOpts,
      series,
      colors: colorArr.length ? colorArr : PAL.series.slice(0, series.length),
      stroke: { ...this.detailOpts.stroke, curve: 'smooth', width: widthArr, dashArray: dashArr }
    };
  }

  private refreshBrush(): void {
    const series = this.buildSeries(this.selectedKeys);
    if (!series.length) {
      this.brushOpts = { ...this.brushOpts, series: [] };
      return;
    }
    const colorArr    = this.selectedKeys.map(k => SERIES_COLORS[k]).filter(Boolean);
    const widthArr    = this.selectedKeys.map(k => (k === 'warningAfr' ? 2 : 1.5));
    const dashArr     = this.selectedKeys.map(k => (k === 'warningAfr' ? 5 : 0));

    this.brushOpts = {
      ...this.brushOpts,
      series,
      colors: colorArr.length ? colorArr : [PAL.series[1]],
      stroke: { ...this.brushOpts.stroke, width: widthArr, dashArray: dashArr }
    };
  }

  // ---- Mock data (แทน service จริง) ----
  private buildMock(n = 180): LoggerPoint[] {
    const start = new Date('2025-06-15T10:00:00Z').getTime();
    const out: LoggerPoint[] = [];
    let avg = 13.2, rt = 13.2, spd = 80;
    for (let i = 0; i < n; i++) {
      const ts = start + i * 1000; // ทุก 1 วินาที
      avg += (Math.random() - 0.5) * 0.05;
      rt  += (Math.random() - 0.5) * 0.15;
      spd += (Math.random() - 0.5) * 2;
      out.push({
        ts,
        avgAfr: Number(avg.toFixed(2)),
        realtimeAfr: Number(rt.toFixed(2)),
        warningAfr: 13.0,
        speed: Math.max(0, Math.round(spd))
      });
    }
    return out;
  }

  private ro?: ResizeObserver;
  ngAfterViewInit(): void {
    this.initMap();

    // 2.1 ถ้า parent เปลี่ยนขนาด ให้ redraw อัตโนมัติ
    this.ro = new ResizeObserver(() => this.map?.invalidateSize());
    this.ro.observe(this.raceMapRef.nativeElement);

    // 2.2 กันเคส init ตอน layout ยังจัดไม่เสร็จ
    setTimeout(() => this.map?.invalidateSize(true), 0);
    // DEMO: แปลงข้อมูลตัวอย่าง → วางลงแผนที่
    // TODO: เปลี่ยนเป็นข้อมูลจริงจาก service
    const sample: RawRow[] = []; // ใส่ข้อมูลจริงของคุณที่มี lat/long ปกติ
    const points = this.transformRows(sample);
    this.setMapPoints(points);
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    // this.wsSubscriptions.forEach(sub => sub.unsubscribe());
    this.ro?.disconnect();
    this.map?.remove();
    // // ปิด WebSocket connection
    // this.webSocketService.disconnect();
  }

  //////////// RACE /////////////////////////////////
  // ช่วยค้นหา
  private siteById(id: string): PointDef | undefined {
    return this.pointMap.find(p => p.idMap === id);
  }


  initMap(): void {
    // พื้นภาพดาวเทียม (MapTiler Satellite) – ใส่คีย์ของคุณเอง
    // const MAPTILER_KEY = 'YOUR_MAPTILER_KEY';
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 50,
        attribution:
          'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      }
    );

    // แผนที่โทนมืด (สำรอง)
    const dark = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 50, attribution: '© CARTO © OpenStreetMap' }
    );

    this.baseLayers = { Satellite: satellite, Dark: dark };

    const site = this.siteById('bric') ?? this.pointMap[0];  // แทน 'bric' ด้วยค่าจาก route/detail ของคุณ
    this.map = L.map(this.raceMapRef.nativeElement, {
      center: [site.lat, site.lon],
      zoom: site.zoom ?? 16,
      layers: [satellite],
      zoomControl: true
    });


    L.control.layers(this.baseLayers, { Warnings: this.warnLayer }).addTo(this.map);
    this.warnLayer.addTo(this.map);

    // ปรับไอคอน marker default (Leaflet 1.x ไม่รู้ path ถ้าใช้ bundler)
    const iconRetinaUrl = 'assets/leaflet/marker-icon-2x.png';
    const iconUrl = 'assets/leaflet/marker-icon.png';
    const shadowUrl = 'assets/leaflet/marker-shadow.png';
    (L.Marker.prototype as any).options.icon = L.icon({
      iconRetinaUrl, iconUrl, shadowUrl,
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28], shadowSize: [41, 41]
    });
  }

  transformRows(rows: RawRow[]): MapPoint[] {
    const pts: MapPoint[] = [];
    for (const r of rows) {
      const lat = Number(r.lat);
      const lon = Number(r.long);
      // ข้ามค่าที่นอกช่วงพิกัดปกติ
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

      const ts = Date.parse(r.gps_time);
      // สมมติว่ามี r['afr'] หรือเอามาจากที่อื่น
      const afr = (r as any).afr as number | undefined;
      const warning = typeof afr === 'number' ? afr > AFR_LIMIT : false;

      pts.push({ ts, lat, lon, afr, warning });
    }
    return pts.sort((a, b) => a.ts - b.ts);
  }

  setMapPoints(points: MapPoint[]): void {
    if (!points.length) return;

    // 3.1 เส้นทาง (polyline)
    const latlngs = points.map(p => L.latLng(p.lat, p.lon));

    if (!this.trackLine) {
      this.trackLine = L.polyline(latlngs, {
        color: COLORS.track,
        weight: 3,
        opacity: 0.9
      }).addTo(this.map);
    } else {
      this.trackLine.setLatLngs(latlngs);
    }

    // 3.2 จุดเตือน (วงกลมสีเหลือง)
    this.warnLayer.clearLayers();
    points.forEach(p => {
      if (p.warning) {
        L.circleMarker([p.lat, p.lon], {
          radius: 5,
          color: COLORS.warn,
          weight: 2,
          fillColor: COLORS.warn,
          fillOpacity: 0.9
        })
          .bindPopup(this.popupHtml(p))
          .addTo(this.warnLayer);
      }
    });

    // 3.3 จุดตำแหน่งล่าสุด (ไอคอนพัลส์)
    const last = points[points.length - 1];
    const liveIcon = L.divIcon({
      className: 'live-pin',
      html: `<span class="dot"></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    if (!this.liveMarker) {
      this.liveMarker = L.marker([last.lat, last.lon], { icon: liveIcon })
        .bindTooltip('Current', { permanent: false })
        .addTo(this.map);
    } else {
      this.liveMarker.setLatLng([last.lat, last.lon]);
    }

    // ปรับมุมมองให้พอดี
    const bounds = L.latLngBounds(latlngs);
    this.map.fitBounds(bounds.pad(0.15));
  }

  addLivePoint(p: MapPoint): void {
    if (!this.trackLine) return this.setMapPoints([p]); // เผื่อยังไม่ init
    this.trackLine.addLatLng([p.lat, p.lon]);
    this.liveMarker?.setLatLng([p.lat, p.lon]);
    if (p.warning) {
      L.circleMarker([p.lat, p.lon], {
        radius: 5, color: COLORS.warn, weight: 2, fillColor: COLORS.warn, fillOpacity: 0.9
      }).addTo(this.warnLayer);
    }
  }

  private popupHtml(p: MapPoint): string {
    const t = new Date(p.ts).toLocaleString();
    const afr = p.afr != null ? p.afr.toFixed(2) : '—';
    return `<div>
      <div><b>Time:</b> ${t}</div>
      <div><b>Lat/Lon:</b> ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</div>
      <div><b>AFR:</b> ${afr}</div>
    </div>`;
  }
  //////////// RACE /////////////////////////////////

  navigateToDashboard(){
    this.router.navigate(['/pages', 'dashboard']);
  }

  formatGpsTimeToText(timeStr: string): string {
    const hour = timeStr.slice(0, 2);
    const minute = timeStr.slice(2, 4);
    const secRaw = parseFloat(timeStr.slice(4));
    const second = Math.floor(secRaw).toString().padStart(2, '0');
    const millis = Math.round((secRaw % 1) * 1000).toString().padStart(3, '0');

    return `${hour}:${minute}:${second}:${millis}`;
  }

  formatToTimeLabel(timeStr: string): string {
    const hour = timeStr.slice(0, 2);
    const minute = timeStr.slice(2, 4);
    const second = Math.floor(parseFloat(timeStr.slice(4))).toString().padStart(2, '0');

    return `${hour}:${minute}:${second}`;
  }



}

import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_SELECT_CONFIG, MatSelect, MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { CarLogger } from '../../../../../public/models/car-logger.model';
import { delay, distinctUntilChanged, map, of, startWith, Subscription } from 'rxjs';
import {
  ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis, ApexStroke, ApexDataLabels,
  ApexFill, ApexMarkers, ApexGrid, ApexLegend, ApexTooltip, ApexTheme,
  NgxApexchartsModule, ApexAnnotations,
  ChartComponent
} from 'ngx-apexcharts';
import * as L from 'leaflet';
import { LoggerDataService } from '../../../service/logger-data.service';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { EventService } from '../../../service/event.service';
import { ResetWarningLoggerComponent } from '../dashboard/reset-warning-logger/reset-warning-logger.component';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';



type ChartKey = 'avgAfr' | 'realtimeAfr' | 'warningAfr' | 'speed'; // ใช้กับกราฟจริง
type SelectKey = ChartKey | 'all';

//-----Chart--------------###############################################
// === โมเดลจุดข้อมูล (x = เวลาแบบ ms, y = ค่าตัวเลข) ===
interface LoggerPoint {
  ts: number;            // timestamp (ms)
  avgAfr: number;
  realtimeAfr: number;
  warningAfr: number;
  speed: number;
}

// จุดบนแผนที่ (ใช้กับ Leaflet)
type MapPoint = {
  ts: number;
  lat: any;
  lon: any;
  velocity?: number;
  heading?: number;
  afrValue?: number;
  time?: string | number; // ถ้าพี่มีเวลาใน CSV
};

// เติม field เสริมให้ CarLogger เดิม (optional)
type CarLoggerWithPath = CarLogger & {
  path?: MapPoint[];
  lastPoint?: MapPoint;
};


// พาเล็ตให้เข้ากับธีมหน้าคุณ
const PAL = {
  text: '#CFD8DC',
  textMuted: '#9AA7B2',
  grid: '#2A3139',
  axis: '#3B444D',
  series: ['#4FC3F7', '#00E5A8', '#FFCA28', '#7E57C2']
};
const SERIES_COLORS: Record<ChartKey, string> = {
  avgAfr: '#4FC3F7',
  realtimeAfr: '#00E5A8',
  warningAfr: '#FFCA28',
  speed: '#7E57C2',
};
//-----Chart--------------###############################################


//-----MapRace--------------###############################################
type XY = { x: number; y: number };

const AFR_LIMIT = 13.5; // เกณฑ์เตือนตัวอย่าง (ปรับได้)
const COLORS = {
  track: '#22D3EE',      // เส้นทางปกติ (เขียวฟ้า)
  warn: '#F59E0B',      // จุดเตือน (เหลือง)
  live: '#00FFA3'       // ตำแหน่งล่าสุด
};
type PointDef = { idMap: string; lat: number; lon: number; zoom?: number };
//-----MapRace--------------###############################################


type RawRow = {
  lat: number | string;
  lon: number | string;
  afr?: number | string;      // ถ้ามี field ชื่อ afr
  heading?: number | string;  // คุณใช้ heading = AFR ได้
  velocity?: number | string;
  gps_time?: string;
};


type ChartPoint = { x: number; y: number; meta?: any };
const MAX_STORE_POINTS = 10_000; // เก็บสูงสุดต่อไฟล์
// const MAX_STORE_POINTS = 1_000_000; // เก็บสูงสุดต่อไฟล์

// ==== ค่ากรอบ AFR สำหรับสเกลสี (แก้ได้ตามต้องการ/หรือปล่อยให้คำนวณจากข้อมูล) ====
const AFR_DEFAULT_MIN = 10;
const AFR_DEFAULT_MAX = 20;

// เก็บเส้นย่อยต่อ key

// utils
function clamp01(x:number){ return x < 0 ? 0 : (x > 1 ? 1 : x); }
function hslToHex(h:number, s:number, l:number){
  // h[0..360], s/l [0..1]
  const c = (1 - Math.abs(2*l - 1)) * s;
  const hp = h/60;
  const x = c*(1 - Math.abs(hp % 2 - 1));
  let [r,g,b] = hp<1?[c,x,0]:hp<2?[x,c,0]:hp<3?[0,c,x]:hp<4?[0,x,c]:hp<5?[x,0,c]:[c,0,x];
  const m = l - c/2; r+=m; g+=m; b+=m;
  const toHex = (v:number)=>('0'+Math.round(v*255).toString(16)).slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
// สเกลสี: 0 => เขียว (120°), 1 => แดง (0°)
function afrToColor(v:number, min:number, max:number){
  const t = clamp01((v - min) / Math.max(1e-9, max - min));
  const hue = 120*(1 - t);        // 120 → 0
  return hslToHex(hue, 1, 0.5);   // s=100%, l=50%
}


@Component({
  selector: 'app-logger',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule
    , ReactiveFormsModule, MatButtonModule, MatDividerModule, MatIconModule
    , MatToolbarModule, NgxApexchartsModule, CommonModule],
  templateUrl: './logger.component.html',
  styleUrl: './logger.component.scss',
  providers: [
    { provide: MAT_SELECT_CONFIG, useValue: { overlayPanelClass: 'chart-filter-overlay-180' } }
  ]
})
export class LoggerComponent implements OnInit, OnDestroy, AfterViewInit {
  segmentsByKey: Record<string, Array<{ i: number; x1:number; y1:number; x2:number; y2:number; c:string; afr:number;  }>> = {};
  currentMapPoints: Array<{ x:number; y:number; ts:number; afr:number }> = [];
  readonly dialog = inject(MatDialog);
  loggerStatus : string = 'offline';

  afr: number = 0;
  countDetect: number = 0;
  afrAverage: number = 0;
  raceLab: MapPoint[][] = [];         // ผลลัพธ์รอบ
  startLatLongPoint?: { lat: number; lon: number }; // ตัวกลางเก็บจุด start
  lapCount?: number= 0;

  readonly START_RADIUS_M = 10;          // ±10m
  readonly START_RADIUS_UNITS = 15;     // สำหรับพิกัดที่ไม่ใช่ lat/lon (โมเดล/พิกัดภายใน)
  readonly MIN_LAP_GAP_MS = 5000;        // กันนับซ้ำภายใน 5s (ปรับได้)
  activeKey: string | null = null;  // เช่น 'race1'
  lapStats: Array<{ lap: number; start: number; end: number; durationMs: number; count: number }> = [];


  // private currentMapPoints: Array<{ ts: number; x: number; y: number; afr: number }> = [];
  // ลบ private ออก (การไม่ระบุ access modifier จะถือว่าเป็น public โดยอัตโนมัติ)

  // ตัวแปรสำหรับควบคุมการแสดงผลของจุดและ tooltip บนแผนที่
  hoverPoint = {
    visible: false,
    x: 0,
    y: 0,
    afr: 0
  };

  //--- Chart ------
  @ViewChild('selectButton', { read: ElementRef }) selectButtonEl!: ElementRef<HTMLElement>;
  @ViewChild('select') select!: MatSelect;
  @ViewChild('chart') chart!: ChartComponent;
  chartsReady = false;

  // เก็บ path/lastPoint แยก โดยไม่ไปแตะ type ของ allLogger
  // private pathsByLoggerId: Record<string, MapPoint[]> = {};
  // private lastPointByLoggerId: Record<string, MapPoint | undefined> = {};

  // ====== เพิ่มฟิลด์/ยูทิล ======
  // private isSyncingChart = false;
  private isSyncingRace  = false;

  @ViewChild('mapSvg') mapSvgEl!: ElementRef<SVGElement>;

  private scaleX = 1;
  private scaleY = 1;

  tooltipStyle = {
    left: '0px',
    top: '0px',
    visibility: 'hidden' as 'hidden' | 'visible'
  };


  // private arraysEqual(a?: any[], b?: any[]) {
  //   if (a === b) return true;
  //   if (!a || !b) return false;
  //   if (a.length !== b.length) return false;
  //   for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  //   return true;
  // }

  pointMap: PointDef[] = [
    { idMap: 'bric', lat: 14.9635357, lon: 103.085812, zoom: 16 },
    { idMap: 'sic', lat: 2.76101, lon: 101.7343345, zoom: 16 },
    { idMap: 'bsc', lat: 13.304051, lon: 100.9014779, zoom: 15 },
  ];

  // จุด (x,y,lat,long,afr) ต่อ key สำหรับ hover
  svgPtsByKey: Record<string, Array<{ x:number; y:number; lat:number; long:number; afr?:number }>> = {};

  // tooltip state
  tip = { visible: false, x: 0, y: 0, afr: NaN as number, lat: NaN as number, lon: NaN as number, key: '' };
  // อ้างอิงกล่องห่อ SVG เพื่อคำนวณตำแหน่งเมาส์สัมพัทธ์
  @ViewChild('mapWrap', { static: true }) mapWrapEl!: { nativeElement: HTMLElement };

  onPointEnter(evt: MouseEvent, key: string, p: {x:number;y:number;lat:number;long:number;afr?:number}) {
    const rect = this.mapWrapEl?.nativeElement?.getBoundingClientRect();
    const left = rect ? rect.left : 0;
    const top  = rect ? rect.top  : 0;

    this.tip = {
      visible: true,
      x: evt.clientX - left + 12,  // ขยับให้พ้นเมาส์นิด
      y: evt.clientY - top  + 12,
      afr: p.afr ?? NaN,
      lat: p.lat,
      lon: p.long,
      key
    };
  }

  onPointLeave() {
    this.tip.visible = false;
  }

  // พาเล็ตต์สีและแมปสีต่อ key (ใช้กับ legend/polyline)
  private palette = ['#007bff','#28a745','#dc3545','#ffc107','#6f42c1','#20c997','#17a2b8','#6610f2','#e83e8c','#795548'];
  colorByKey: Record<string, string> = {};
  private recomputeColors(keys: string[]) {
    this.colorByKey = {};
    keys.forEach((k, i) => this.colorByKey[k] = this.palette[i % this.palette.length]);
  }

  currentPoints: LoggerPoint[] = [];
  options: { value: ChartKey; label: string; }[] = [
    { value: 'avgAfr', label: 'Average AFR' },
    { value: 'realtimeAfr', label: 'Realtime AFR' },
    // { value: 'warningAfr', label: 'Warning AFR' },
  ];

  selectedKeys: ChartKey[] = ['avgAfr', 'realtimeAfr'];
  brushOverviewKey: ChartKey = 'realtimeAfr';

  currentPageData: any[] = [];
  chartFilter = new FormControl<SelectKey[]>(['avgAfr', 'realtimeAfr'], { nonNullable: true });
  private isChartKey = (k: SelectKey): k is ChartKey => k !== 'all';
  showRoutePath: boolean = true;
  private subscriptions: Subscription[] = [];

  // ปรับรัศมีนับรอบ (หน่วยเดียวกับข้อมูล CSV: เมตรจำลอง)
  lapRadiusUnits: number = this.START_RADIUS_UNITS;
  setLapRadiusUnits(units: number) {
    const u = Number(units);
    this.lapRadiusUnits = Number.isFinite(u) && u > 0 ? u : this.START_RADIUS_UNITS;
  }


  allLogger: CarLogger[] = [];

  private fieldMap: Record<ChartKey, keyof LoggerPoint> = {
    avgAfr: 'avgAfr',
    realtimeAfr: 'realtimeAfr',
    warningAfr: 'warningAfr',
    speed: 'speed'
  };
  //--- Chart ------
  filterRace = new FormControl<string>('');
  selectedRaceKey: string = '';

  //--- Race ------
  @ViewChild('raceMap') raceMapRef!: ElementRef<HTMLDivElement>;

  // เพิ่ม property เก็บ cache (ใน component class)
  private chartPointsByDate: Record<string, LoggerPoint[]> = {}; // or Map<string, LoggerPoint[]>
  private upsertCacheForDate(dateKey: string, pts: LoggerPoint[]) {
    this.chartPointsByDate[dateKey] = Array.isArray(pts) ? pts : [];
  }

  afrLimit: number = 0;
  countMax: number = 0;

  configAFR: any;


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
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis | ApexYAxis[];
    annotations: ApexAnnotations;
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
        toolbar: { show: true },
        events: {
          mouseMove: (event, chartContext, config) => {
            const dataPointIndex = config.dataPointIndex;
            const seriesIndex = config.seriesIndex;

            if (dataPointIndex > -1 && seriesIndex > -1) {
              const w: any = (chartContext as any)?.w ?? (config as any)?.w;
              const seriesCfg = w?.config?.series?.[seriesIndex];
              const seriesData = Array.isArray(seriesCfg?.data) ? seriesCfg.data : undefined;
              const pointOnChart: any = seriesData ? seriesData[dataPointIndex] : undefined;
              if (pointOnChart && (pointOnChart.x != null || pointOnChart.t != null || pointOnChart.time != null)) {
                const timestamp = pointOnChart.x ?? pointOnChart.t ?? pointOnChart.time;
                const closestMapPoint = (this.currentMapPoints?.length ? this.currentMapPoints : []).reduce((prev, curr) =>
                  Math.abs(curr.ts - timestamp) < Math.abs(prev.ts - timestamp) ? curr : prev
                , this.currentMapPoints?.[0] ?? { ts: timestamp, x: 0, y: 0, afr: 0 });

                if (closestMapPoint) {
                  this.hoverPoint = {
                    visible: true,
                    x: closestMapPoint.x,
                    y: closestMapPoint.y,
                    afr: closestMapPoint.afr
                  };
                }
              }
            }
            const left = this.hoverPoint.x * this.scaleX;
            const top = this.hoverPoint.y * this.scaleY;
            this.tooltipStyle = { left: `${left}px`, top: `${top}px`, visibility: 'visible' };
            this.cdr.detectChanges();
          },
          mouseLeave: () => {
            this.hoverPoint.visible = false;
            this.tooltipStyle.visibility = 'hidden';
            this.cdr.detectChanges();
          }
        }
      },
      xaxis: {
        type: 'datetime',
        axisBorder: { color: PAL.axis },
        axisTicks: { color: PAL.axis },
        labels: { style: { colors: PAL.textMuted } }
      },
      yaxis: {
        labels: {
          formatter: (val: number) => {
            // แปลงให้เป็นจำนวนเต็ม
            return Math.round(val).toString();
          }
        }
      },
      stroke: {
        curve: 'smooth', width: [2, 2, 3, 2], dashArray: [0, 0, 6, 0]
      }, // warning = เส้นประ
      annotations: {
        yaxis: [
          {
            y: 15,
            borderColor: '#dc3545',
            strokeDashArray: 2,
            label: {
              borderColor: '#dc3545',
              style: {
                color: '#fff',
                background: '#dc3545',
              },
              text: 'AFR Limit',
              position: 'right',
              offsetX: 5,
            }
          }
        ]
      },
      dataLabels: { enabled: false },
      markers: { size: 0 },
      colors: PAL.series,
      grid: { borderColor: PAL.grid, strokeDashArray: 3 },
      fill: { type: 'gradient', gradient: { shade: 'dark' } },
      tooltip: { theme: 'dark', fillSeriesColor: false },
      legend: { show: true, position: 'bottom', labels: { colors: PAL.textMuted } },
      theme: { mode: 'dark' }
  };


  svgPoints = '';
  startPoint = { x: 0, y: 0, lat: 0, long: 0 };
  endPoint = { x: 0, y: 0, lat: 0, long: 0 };

  polyTransCsvform = '';
  startPointCsv: XY = { x: 0, y: 0 };
  endPointCsv: XY = { x: 0, y: 0 };

  // สำหรับวาดแผนที่หลายเส้น
  selectedSvgSets: Array<{
    name: string;
    points: string;      // polyline points
    start: {x:number;y:number};
    end:   {x:number;y:number};
  }> = [];

  hasRouteData = false;
  // ===== กราฟล่าง (Brush/Navigator) =====
  brushOpts: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis | ApexYAxis[];
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
      fill: { type: 'gradient', gradient: { shade: 'dark' } },
      grid: { borderColor: PAL.grid, strokeDashArray: 3 },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 1.5 },
      theme: { mode: 'dark' }
  };

  // ---------- OPTIONS ของกราฟหลัก (detail) ----------
  raceDateList: any[] = [
    {
      name: 'Practice',
      value: 'practice'
    }, {
      name: 'Qualifying',
      value: 'qualifying'
    },
    {
      name: 'Race 1',
      value: 'race1'
    },
    {
      name: 'Race 2',
      value: 'race2'
    }
  ];
  mapraceDateList: Record<string, MapPoint[]> = {};
  // ////////////////////////

  // ---- Utils ----
  private num(v: any): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  }
  private getLatLon(p: MapPoint): { lat: number; lon: number } | null {
    const lat = this.num(p.lat);
    const lon = this.num(p.lon);
    return (lat != null && lon != null) ? { lat, lon } : null;
  }
  private toMillis(ts: number): number {
    // ถ้า ts เป็นวินาที ให้คูณ 1000 (เดาตามขนาด)
    return ts < 2_000_000_000 ? ts * 1000 : ts;
  }
  // Haversine (meter)
  private haversineMeters(a: {lat:number; lon:number}, b: {lat:number; lon:number}): number {
    const R = 6371000;
    const rad = (d: number) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const la1 = rad(a.lat), la2 = rad(b.lat);
    const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // ใช้ Haversine ถ้าพิกัดดูเหมือน lat/lon จริง ไม่เช่นนั้นใช้ระยะเชิงเส้น (Cartesian)
  private isLatLon(p: {lat:number; lon:number}): boolean {
    return Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  }
  private distanceMetersOrUnits(a: {lat:number; lon:number}, b: {lat:number; lon:number}): number {
    if (this.isLatLon(a) && this.isLatLon(b)) {
      return this.haversineMeters(a, b);
    }
    const dx = b.lon - a.lon;
    const dy = b.lat - a.lat;
    return Math.hypot(dx, dy);
  }

  // ---- ตั้งจุดสตาร์ท ----
  setstartLatLongPoint(latDeg: any, lonDeg: any) {
    const lat = this.num(latDeg);
    const lon = this.num(lonDeg);
    if (lat == null || lon == null) return;
    this.startLatLongPoint = { lat, lon };
  }

  // ---- แบ่งรอบจาก "หนึ่งชุด" (Array) ----
  private splitIntoLapsArray(points: MapPoint[]): MapPoint[][] {
    if (!points?.length) return [];

    if (!this.startLatLongPoint) {
      // ยังไม่ตั้ง start → ใช้พิกัดจุดแรกที่ valid
      for (const p of points) {
        const ll = this.getLatLon(p);
        if (ll) { this.startLatLongPoint = ll; break; }
      }
      if (!this.startLatLongPoint) return [points.slice()]; // ไม่มี lat/lon เลย
    }

    // เรียงตามเวลา
    const data = points.slice().sort((a, b) => this.toMillis(a.ts) - this.toMillis(b.ts));

    let laps: MapPoint[][] = [];
    let current: MapPoint[] = [];

    let insidePrev = false;
    let lastCrossMs = -Infinity;

    // ใช้รัศมีคงที่ 10 หน่วยสำหรับ non-lat/lon (และ 10 เมตรสำหรับ lat/lon)
    const startLL = this.startLatLongPoint!;
    const useHaversine = this.isLatLon(startLL);
    const dynamicRadius = this.lapRadiusUnits;

    for (const pt of data) {
      current.push(pt);

      const ll = this.getLatLon(pt);
      if (!ll) continue;

      const dist = this.distanceMetersOrUnits(ll, startLL);
      const radius = useHaversine ? this.START_RADIUS_M : dynamicRadius;
      const inside = dist <= radius;

      // นอก → ใน และห่างจากครั้งก่อน ≥ MIN_LAP_GAP_MS
      if (!insidePrev && inside) {
        const nowMs = this.toMillis(pt.ts);
        if (nowMs - lastCrossMs >= this.MIN_LAP_GAP_MS) {
          if (current.length > 1) {
            // ปิดรอบก่อนหน้า (ไม่รวมจุดปัจจุบัน เพื่อให้จุดนี้เริ่มรอบใหม่)
            const done = current.slice(0, -1);
            if (done.length) laps.push(done);
          }
          // เปิดรอบใหม่เริ่มที่จุดปัจจุบัน
          current = [pt];
          lastCrossMs = nowMs;
        }
      }
      insidePrev = inside;
    }

    // เก็บรอบสุดท้าย
    if (current.length) laps.push(current);
    return laps;
  }

  // ---- อินพุตได้ทั้ง Array และ Record<string, MapPoint[]> ----
  splitIntoLapsInput(input: MapPoint[] | Record<string, MapPoint[]>) {
    if (Array.isArray(input)) {
      const laps = this.splitIntoLapsArray(input);
      this.raceLab = laps;
      return laps;
    } else {
      const result: Record<string, MapPoint[][]> = {};
      for (const [key, arr] of Object.entries(input)) {
        result[key] = this.splitIntoLapsArray(arr);
      }
      // ถ้าต้องการใช้งานเฉพาะ key ปัจจุบัน ให้เลือกมาใส่ raceLab เอง เช่น:
      // this.raceLab = result[this.activeKey] ?? [];
      // เก็บทั้งหมดไว้ด้วยถ้าอยาก:
      // this.raceLabByKey = result;
      return result;
    }
  }

  recomputeLaps() {
    if (!this.allDataLogger) return;

    if (this.activeKey && this.allDataLogger[this.activeKey]) {
      // แบ่งเฉพาะ race เดียว (แนะนำ)
      this.raceLab = this.splitIntoLapsArray(this.allDataLogger[this.activeKey]);
    } else {
      // ถ้าต้องการคำนวณทุก key (นานกว่า)
      const byKey = this.splitIntoLapsInput(this.allDataLogger) as Record<string, MapPoint[][]>;
      this.raceLab = this.activeKey ? (byKey[this.activeKey] ?? []) : (byKey[Object.keys(byKey)[0]] ?? []);
    }

    // ถ้ามีส่วนอื่นต้องอาศัย lap (เช่นอัปเดตกาาฟ/สรุป) ก็เรียกต่อที่นี่
    // this.updateChartByLaps();
  }

  onRaceChange(key: string) {
    this.selectedRaceKey = key;
    // this.ensureStartPointForKey(key);
    this.recomputeLapsForKey(key);

    const sel = [key];
    this.updateMapFromSelection?.(sel);
    this.updateChartsFromSelection?.(sel);
  }


  // ====== ตั้ง start ด้วยการคลิกบน SVG (ถ้าคุณใช้วิธีนี้) ======
  startPx?: { x:number; y:number };

  private svgClientToLocal(evt: MouseEvent): {x:number;y:number} {
    const svg = (evt.currentTarget || evt.target) as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: local.x, y: local.y };
  }
  private findNearestMapPoint(px: {x:number;y:number}) {
    if (!this.currentMapPoints?.length) return null;
    let best = null, bestD2 = Number.POSITIVE_INFINITY;
    for (const p of this.currentMapPoints) {
      const dx = p.x - px.x, dy = p.y - px.y, d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; best = p; }
    }
    return best;
  }
  onSetStartByClick(evt: MouseEvent) {
    const local = this.svgClientToLocal(evt);
    const nearest = this.findNearestMapPoint(local);
    if (!nearest) return;

    this.startPx = { x: nearest.x, y: nearest.y };

    // ถ้ามี mapping จาก currentMapPoints → MapPoint จริง เพื่อดึง lat/lon ให้ทำที่นี่
    // ในตัวอย่างนี้ สมมติคุณสามารถหา lat/lon ของจุดใกล้สุดได้จาก selectedRaceKey
    const arr = this.allDataLogger?.[this.selectedRaceKey ?? ''] ?? [];
    // หา MapPoint ที่เวลาใกล้กับ nearest.ts
    let best: MapPoint | null = null, bestDt = Number.POSITIVE_INFINITY;
    for (const p of arr) {
      const dt = Math.abs(this.toMillis(p.ts) - nearest.ts);
      if (dt < bestDt) { bestDt = dt; best = p; }
    }
    if (best) {
      const ll = this.getLatLon(best);
      if (ll) {
        this.setStartPoint(ll.lat, ll.lon);
        if (this.selectedRaceKey) this.recomputeLapsForKey(this.selectedRaceKey);
      }
    }
  }

  private readonly intLabel = (val: number) =>
    Number.isFinite(val) ? Math.round(val).toString() : '';

  private applyYAxisIntegerLabels() {
    this.detailOpts = {
      ...this.detailOpts,
      yaxis: {
        ...(this.detailOpts?.yaxis ?? {}),
        labels: { formatter: this.intLabel }
      }
    };
    this.brushOpts = {
      ...this.brushOpts,
      yaxis: {
        ...(this.brushOpts?.yaxis ?? {}),
        labels: { formatter: this.intLabel }
      }
    };
  }

  allDataLogger: Record<string, MapPoint[]> = {};
  loggerKey: any[] = [];

  constructor(private router: Router, private route: ActivatedRoute, private cdr: ChangeDetectorRef
    , private toastr: ToastrService
    // , private loggerData: LoggerDataService
    , private http: HttpClient
    , private eventService: EventService
  ) {
    // Mock start point for lap counting
    // this.setStartPoint(798.479,-6054.195);
    this.setstartLatLongPoint(798.451662,-6054.358584);
    this.loadAndApplyConfig();
    // this.setCurrentPoints(this.buildMock(180));
    let parameterClass = this.route.snapshot.queryParamMap.get('class') ?? '';

    // ใช้ string interpolation สร้าง path ใหม่
    this.loadCsvAndDraw(`models/mock-data/practice_section_${parameterClass}_test.csv`);
    this.loadCsvAndDraw(`models/mock-data/qualifying_section_${parameterClass}.csv`);
    this.loadCsvAndDraw(`models/mock-data/race1_section_${parameterClass}.csv`);
    this.loadCsvAndDraw(`models/mock-data/race2_section_${parameterClass}.csv`);
  }

  downsample(data: { x: any; y: number }[], threshold: number): { x: any; y: number }[] {
    if (threshold >= data.length || threshold === 0) {
      return data; // ไม่ต้องลดทอน
    }

    // แปลงข้อมูลเป็น [number, number][] ชั่วคราวเพื่อใช้กับอัลกอริทึม
    const dataAsArray: [number, number][] = data.map(p => [p.x, p.y]);

    const sampled: [number, number][] = [];
    let sampledIndex = 0;

    const every = (dataAsArray.length - 2) / (threshold - 2);
    let a = 0;
    let maxAreaPoint: [number, number] | undefined;
    let maxArea: number;
    let area: number;
    let nextA = 0;

    sampled[sampledIndex++] = dataAsArray[a]; // เลือกจุดแรกเสมอ

    for (let i = 0; i < threshold - 2; i++) {
      let avgX = 0;
      let avgY = 0;
      let avgRangeStart = Math.floor((i + 1) * every) + 1;
      let avgRangeEnd = Math.floor((i + 2) * every) + 1;
      avgRangeEnd = avgRangeEnd < dataAsArray.length ? avgRangeEnd : dataAsArray.length;

      const avgRangeLength = avgRangeEnd - avgRangeStart;

      for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
        avgX += dataAsArray[avgRangeStart][0];
        avgY += dataAsArray[avgRangeStart][1];
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;

      const rangeOffs = Math.floor(i * every) + 1;
      const rangeTo = Math.floor((i + 1) * every) + 1;

      const pointAX = dataAsArray[a][0];
      const pointAY = dataAsArray[a][1];

      maxArea = -1;

      for (let j = rangeOffs; j < rangeTo; j++) {
        area = Math.abs(
          (pointAX - avgX) * (dataAsArray[j][1] - pointAY) -
          (pointAX - dataAsArray[j][0]) * (avgY - pointAY)
        ) * 0.5;
        if (area > maxArea) {
          maxArea = area;
          maxAreaPoint = dataAsArray[j];
          nextA = j;
        }
      }

      if (maxAreaPoint) {
        sampled[sampledIndex++] = maxAreaPoint;
      }
      a = nextA;
    }

    sampled[sampledIndex++] = dataAsArray[dataAsArray.length - 1]; // เลือกจุดสุดท้ายเสมอ

    // แปลงข้อมูลกลับเป็น { x, y }[]
    return sampled.map(p => ({ x: p[0], y: p[1] }));
  }



  async loadAndApplyConfig() {
    const form_code = `max_count, limit_afr`
    const MatchSub = this.eventService.getConfigAdmin(form_code).subscribe(
      config => {
        this.configAFR = [];
        this.configAFR = config;
        this.afrLimit = Number(this.configAFR.filter((x: { form_code: string; }) => x.form_code == 'limit_afr')[0].value);
        this.countMax = Number(this.configAFR.filter((x: { form_code: string; }) => x.form_code == 'max_count')[0].value);

        this.detailOpts = {
          ...this.detailOpts,
          annotations: {
            yaxis: [
              {
                // กำหนดค่าทั้งหมดที่ต้องการสำหรับเส้นแนวนอน
                y: this.afrLimit, // ใช้ค่าใหม่จาก config
                borderColor: '#dc3545',
                strokeDashArray: 2,
                label: {
                  borderColor: '#dc3545',
                  style: {
                    color: '#fff',
                    background: '#dc3545',
                  },
                  text: `AFR Limit: ${this.afrLimit.toFixed(1)}`, // อัปเดตข้อความ (แนะนำ .toFixed)
                  position: 'right',
                  offsetX: 5,
                }
              }
            ]
          }
        };
      },
      error => {
        console.error('Error loading matchList:', error);
        // Fallback to mock data if API fails
        // this.matchList = this.eventService.getMatchSync();
      }
    );
    this.subscriptions.push(MatchSub);
  }

  // ====== ngOnInit: สมัคร valueChanges พร้อมตั้งค่า default ======
  // ---------- ตั้งค่า DEFAULT ----------

  parameterRaceId:any = null;
  parameterSegment:any = null;
  parameterClass:any = null;
  parameterLoggerID:any = null;

  ngOnInit() {
    this.parameterRaceId  = Number(this.route.snapshot.queryParamMap.get('raceId') ?? 0);
    this.parameterSegment = this.route.snapshot.queryParamMap.get('segment') ?? '';
    this.parameterClass   = this.route.snapshot.queryParamMap.get('class') ?? ''; // ใช้ชื่อแปรอื่นแทน class
    this.parameterLoggerID   = this.route.snapshot.queryParamMap.get('loggerId') ?? ''; // ใช้ชื่อแปรอื่นแทน class

    this.getDetailLoggerById();

    this.applyYAxisIntegerLabels();
    // ----- DEFAULT: เลือกทั้งหมด -----
    const allKeys = Object.keys(this.allDataLogger || {}); // ใช้ this.allDataLogger แหล่งเดียวจะแม่นยำกว่า
    if (allKeys.length) {
      const defaultKey = allKeys.includes('practice') ? 'practice' : allKeys[0];
      this.isSyncingRace = true;
      this.filterRace.setValue(defaultKey, { emitEvent: false });
      this.isSyncingRace = false;

      this.selectedRaceKey = defaultKey;

      const selectionAsArray = [defaultKey];
      this.onRaceChange(defaultKey)
      this.recomputeColors(selectionAsArray);
      this.updateMapFromSelection(selectionAsArray);
      this.updateChartsFromSelection(selectionAsArray);
    }

    // ----- WORKFLOW หลัก (ตัวเดียว) -----
    this.filterRace.valueChanges
      .pipe(
        startWith(this.filterRace.value ?? ''),
        distinctUntilChanged()
      )
      .subscribe(selectedValue => {
        if (this.isSyncingRace || !selectedValue) {
          return;
        }
        this.selectedRaceKey = selectedValue;
        const selectionAsArray = [this.selectedRaceKey];

        this.recomputeColors(selectionAsArray);
        this.updateMapFromSelection(selectionAsArray);
        this.updateChartsFromSelection(selectionAsArray);
      });
  }

  loggerID     = 0;
  carNumber    = '';
  firstName    = '';
  lastName     = '';
  classType    = '';
  segmentValue = '';
  seasonID     = 0;
  categoryName = '';
  sessionValue = '';

  getDetailLoggerById(): void {
    // let payload = {
    //   race_id  : this.parameterRaceId,
    //   segment_type  : this.parameterSegment,
    //   class_type  : this.parameterClass,
    //   logger_id  : this.parameterLoggerID,
    // }
    this.eventService
      .getDetailLoggerInRace(this.parameterRaceId, this.parameterSegment, this.parameterClass, this.parameterLoggerID)
      .subscribe({
        next: (detail) => {
          this.loggerID     = detail.loggerId;
          this.carNumber    = detail.carNumber;
          this.firstName    = detail.firstName;
          this.lastName     = detail.lastName;
          this.classType    = detail.classType;
          this.segmentValue = detail.segmentValue;
          this.seasonID     = detail.seasonId;
          this.categoryName = detail.categoryName;
          this.sessionValue = detail.sessionValue;

          // ใหม่
          this.countDetect  = detail.countDetect;
          this.afr          = detail.afr;
          this.afrAverage   = detail.afrAverage;
          this.loggerStatus       = detail.status;
        },
        error: (err) => console.error('getDetailLoggerInRace error:', err),
      });

  }

  // ====== เวอร์ชันใหม่: อ่านจากไฟล์ .txt ======
  async generateSVGPointsFromFile(url: string) {
    try {
      // ถ้าใช้วิธี 1 ให้คง mode:'cors'; ถ้าวิธี 2 (proxy) จะไม่ต้อง CORS
      const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(Boolean);

      // หา section [data]
      const dataStart = lines.findIndex(l => /^\[data\]/i.test(l));
      if (dataStart === -1) throw new Error('No [data] section');

      const rows = lines.slice(dataStart + 1);

      const mapPoints = rows.map(r => {
        const [sats, time, lat, lon, velocity, heading] = r.split(',');
        return { lat, lon, velocity, heading };
      });

      this.generateSVGPoints(mapPoints); // วาด polyline ตามที่คุณทำไว้
    } catch (err) {
      console.error('Load model file failed:', err);
      this.svgPoints = '';
      this.hasRouteData = false;
    }
  }

  private extractKeyFromFilename(filename: string): string {
    const base = filename.replace(/\.[^/.]+$/, '');
    return base.split('_')[0].toLowerCase();
  }

  setStartPoint(latDeg: any, lonDeg: any) {
    const lat = this.num(latDeg);
    const lon = this.num(lonDeg);
    if (lat == null || lon == null) return;
    this.startLatLongPoint = { lat, lon };
  }

  private ensureStartPointForKey(key: string) {
    if (this.startLatLongPoint) return;
    const arr = this.allDataLogger?.[key] ?? [];
    for (const p of arr) {
      const ll = this.getLatLon(p);
      if (ll) { this.setStartPoint(ll.lat, ll.lon); break; }
    }
  }

  // สีต่อ lap (ปรับได้)
  private lapColors = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b'];

  private projectToXY(p: MapPoint): { x: number; y: number } | null {
    const rawX = (p as any).x;
    const rawY = (p as any).y;

    const x = typeof rawX === 'number' ? rawX : (rawX != null ? Number(rawX) : null);
    const y = typeof rawY === 'number' ? rawY : (rawY != null ? Number(rawY) : null);

    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x, y };
  }


  private buildMapFromLaps(laps: MapPoint[][], key: string) {
    const all = laps.flat().map(p => this.getLatLon(p)).filter((v): v is {lat:number;lon:number} => !!v);
    if (!all.length) {
      this.segmentsByKey = { ...(this.segmentsByKey ?? {}), [key]: [] };
      this.currentMapPoints = [];
      return;
    }
    const minLat = Math.min(...all.map(v => v.lat));
    const maxLat = Math.max(...all.map(v => v.lat));
    const minLon = Math.min(...all.map(v => v.lon));
    const maxLon = Math.max(...all.map(v => v.lon));
    const spanLat = Math.max(1e-9, maxLat - minLat);
    const spanLon = Math.max(1e-9, maxLon - minLon);
    const toX = (lon:number) => ((lon - minLon) / spanLon) * this.SVG_W;
    const toY = (lat:number) => this.SVG_H - ((lat - minLat) / spanLat) * this.SVG_H;

    const segs: Array<{ i:number;x1:number;y1:number;x2:number;y2:number;c:string;afr:number }> = [];
    let segIndex = 0;

    laps.forEach((lap, lapIdx) => {
      const color = this.lapColors[lapIdx % this.lapColors.length];
      for (let i = 1; i < lap.length; i++) {
        const a = lap[i-1], b = lap[i];
        const la = this.getLatLon(a); const lb = this.getLatLon(b);
        if (!la || !lb) continue;
        segs.push({
          i: segIndex++,
          x1: toX(la.lon), y1: toY(la.lat), x2: toX(lb.lon), y2: toY(lb.lat),
          c: color,
          afr: Number.isFinite(b.afrValue as number) ? (b.afrValue as number) : NaN
        });
      }
    });

    const pointsXY: Array<{x:number;y:number;ts:number;afr:number}> = [];
    laps.forEach(lap => {
      lap.forEach(p => {
        const ll = this.getLatLon(p);
        if (!ll) return;
        pointsXY.push({
          x: toX(ll.lon), y: toY(ll.lat),
          ts: this.toMillis(p.ts),
          afr: Number.isFinite(p.afrValue as number) ? (p.afrValue as number) : NaN
        });
      });
    });

    this.segmentsByKey = { ...(this.segmentsByKey ?? {}), [key]: segs };
    this.currentMapPoints = pointsXY;
    this.showRoutePath = true;
  }

  private buildChartsFromLaps(laps: MapPoint[][]) {
    // 5.1 detail series: 1 lap = 1 series
    const detailSeries = laps.map((lap, idx) => ({
      name: `Lap ${idx+1}`,
      type: 'line',
      data: lap.map(p => ({
        x: this.toMillis(p.ts),
        y: Number.isFinite(p.afrValue) ? (p.afrValue as number) : null
      }))
    }));

    // 5.2 จุดแดงเกินลิมิต
    const discrete: any[] = [];
    const limit = this.afrLimit ?? 14;
    detailSeries.forEach((s, sIdx) => {
      (s.data as Array<{x:number;y:number|null}>).forEach((pt, i) => {
        const y = pt.y;
        if (typeof y === 'number' && y > limit) {
          discrete.push({ seriesIndex: sIdx, dataPointIndex: i, fillColor: '#ff3b30', strokeColor: '#ff3b30', size: 4 });
        }
      });
    });

    // 5.3 brush: รวมทุกจุดต่อเนื่อง
    const brushData: Array<{x:number;y:number|null}> = [];
    laps.forEach(lap => lap.forEach(p => {
      brushData.push({
        x: this.toMillis(p.ts),
        y: Number.isFinite(p.afrValue) ? (p.afrValue as number) : null
      });
    }));

    // 5.4 commit
    this.detailOpts = {
      ...(this.detailOpts || {}),
      series: detailSeries,
      markers: { ...(this.detailOpts?.markers || {}), size: 0, discrete },
      annotations: { yaxis: [{ y: limit, borderColor: '#ff3b30', label: { text: `AFR Limit ${limit}` } }] }
    };
    this.brushOpts = {
      ...(this.brushOpts || {}),
      series: [{ name: 'AFR', type: 'line', data: brushData }]
    };
  }

  private updateLapArtifacts(key: string, laps: MapPoint[][]) {
    this.lapStats = laps.map((lap, i) => {
      const start = this.toMillis(lap[0].ts);
      const end   = this.toMillis(lap[lap.length - 1].ts);
      return {
        lap: i + 1,
        start,
        end,
        durationMs: Math.max(0, end - start),
        count: lap.length
      };
    });

    this.buildMapFromLaps(laps, key);
    const detailSeries = laps.map((lap, idx) => ({
      name: `Lap ${idx + 1}`,
      type: 'line',
      data: lap.map(p => ({
        x: this.toMillis(p.ts),
        y: Number.isFinite(p.afrValue) ? (p.afrValue as number) : null
      }))
    }));

    const limit = this.afrLimit ?? 14;
    const discrete: any[] = [];
    detailSeries.forEach((s, sIdx) => {
      (s.data as Array<{ x: number; y: number | null }>).forEach((pt, i) => {
        if (typeof pt.y === 'number' && pt.y > limit) {
          discrete.push({ seriesIndex: sIdx, dataPointIndex: i, fillColor: '#ff3b30', strokeColor: '#ff3b30', size: 4 });
        }
      });
    });

    const xAnn = this.lapStats.map(s => ({
      x: s.start,
      borderColor: '#999',
      strokeDashArray: 4,
      label: { text: `Lap ${s.lap}`, style: { fontSize: '11px' } }
    }));

    const brushData: Array<{ x: number; y: number | null }> = [];
    laps.forEach(lap => lap.forEach(p => {
      brushData.push({
        x: this.toMillis(p.ts),
        y: Number.isFinite(p.afrValue) ? (p.afrValue as number) : null
      });
    }));

    this.detailOpts = {
      ...(this.detailOpts || {}),
      series: detailSeries,
      markers: { ...(this.detailOpts?.markers || {}), size: 0, discrete },
      annotations: {
        ...(this.detailOpts?.annotations || {}),
        yaxis: [{ y: limit, borderColor: '#ff3b30', label: { text: `AFR Limit ${limit}` } }],
        xaxis: xAnn
      }
    };

    this.brushOpts = {
      ...(this.brushOpts || {}),
      series: [{ name: 'AFR', type: 'line', data: brushData }]
    };

    this.lapCount = this.lapStats.length; // สร้าง field: lapCount?: number;
  }



  private recomputeLapsForKey(key: string) {
    const points = this.allDataLogger?.[key] ?? [];
    this.raceLab = this.splitIntoLapsArray(points);
    // this.buildMapFromLaps(this.raceLab, this.selectedRaceKey);
    // this.buildChartsFromLaps(this.raceLab);
    this.updateLapArtifacts(key, this.raceLab);
  }

  // --- เพิ่มฟิลด์กันรันซ้ำ ---
  private initialisedDefault = false;

  // เรียกหลังโหลดข้อมูลเสร็จ (allDataLogger / mapraceDateList พร้อมแล้ว)
  private initDefaultSelectionOnce() {
    if (this.initialisedDefault) return;

    const keys = Object.keys(this.allDataLogger || {});
    if (!keys.length) return;

    const defaultKey = keys.includes('practice') ? 'practice' : keys[0];

    this.isSyncingRace = true;
    this.filterRace.setValue(defaultKey, { emitEvent: false });
    this.isSyncingRace = false;

    this.selectedRaceKey = defaultKey;

    // ตั้ง start ถ้ายังไม่มี แล้วคำนวณ + ปั้นข้อมูล map/chart
    // this.ensureStartPointForKey(this.selectedRaceKey);
    this.recomputeLapsForKey(this.selectedRaceKey);

    // ถ้ามีระบบสี/ฟิลเตอร์เดิมของคุณ ให้เรียกต่อได้
    const selArr = [this.selectedRaceKey];
    this.recomputeColors?.(selArr);
    this.updateMapFromSelection?.(selArr);      // ถ้าคุณยังใช้ในส่วนอื่น
    this.updateChartsFromSelection?.(selArr);   // ถ้าคุณยังใช้ในส่วนอื่น

    this.initialisedDefault = true;
  }

  // อ่าน CSV แล้วเก็บลง allDataLogger[key] (คงของเดิม)
  async loadCsvAndDraw(url: string): Promise<void> {
    try {
      const filename = url.split('/').pop() ?? 'unknown.csv';
      const key = this.extractKeyFromFilename(filename);
      if (this.allDataLogger[key]?.length) return;

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      const parsed = this.csvToMapPoints(text);

      const capped = parsed.length > MAX_STORE_POINTS ? parsed.slice(0, MAX_STORE_POINTS) : parsed;

      if (!this.loggerKey.includes(key)) this.loggerKey = [...this.loggerKey, key];
      this.allDataLogger = { ...this.allDataLogger, [key]: capped };

      this.initDefaultSelectionOnce();
    } catch (err) {
      console.error('loadCsvAndDraw error:', err);
    }
  }

  // ใช้ตอนมี text ของ CSV แล้ว (เช่นจาก fetch หรือ FileReader)
  csvToMapPoints(text: string): MapPoint[] {
    // กัน BOM + ตัดบรรทัดว่าง
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // header
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());

    const idxOf = (aliases: string[]) =>
      header.findIndex(h => aliases.includes(h));

    // รองรับหลายชื่อคอลัมน์
    const latIdx = idxOf(['lat', 'latitude', 'y']);
    const lonIdx = idxOf(['long', 'longitude', 'lon', 'x']);
    const velIdx = idxOf(['velocity', 'speed', 'v']);
    const hdgIdx = idxOf(['heading', 'course', 'bearing']);
    const afrIdx = idxOf(['afr', 'air-fuel ratio', 'afr_value']);
    const tsIdx  = idxOf(['ts', 'timestamp', 'time', 'gps_time', 'datetime']);

    if (latIdx === -1 || lonIdx === -1) {
      console.warn('CSV ต้องมีอย่างน้อย lat/long');
      return [];
    }

    const mapPoints: MapPoint[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (!cols.length) continue;

      const lat = parseFloat(cols[latIdx] ?? '');
      const lon = parseFloat(cols[lonIdx] ?? '');

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const velocity = velIdx !== -1 ? parseFloat(cols[velIdx] ?? '') : undefined;
      const heading  = hdgIdx !== -1 ? parseFloat(cols[hdgIdx] ?? '') : undefined;
      const afrValue = afrIdx !== -1 ? parseFloat(cols[afrIdx] ?? '') : undefined;

      // timestamp parsing with fallbacks
      let tsVal: number = i;
      if (tsIdx !== -1) {
        const raw = cols[tsIdx]?.trim();
        const asNum = raw != null && raw !== '' ? Number(raw) : NaN;
        if (Number.isFinite(asNum)) {
          tsVal = asNum;
        } else {
          const parsed = Date.parse(raw ?? '');
          if (Number.isFinite(parsed)) tsVal = parsed;
        }
      }

      mapPoints.push({
        ts: tsVal,
        lat,
        lon,
        ...(Number.isFinite(velocity!) ? { velocity } : {}),
        ...(Number.isFinite(heading!)  ? { heading }  : {}),
        ...(Number.isFinite(afrValue!)  ? { afrValue }  : {}),
      });
    }

    return mapPoints;
  }

  cal = { tx: 6, ty: 33, sx: 1, sy: 1, rot: 0 };
  readonly SVG_W = 800;
  readonly SVG_H = 600;

  get polyTransform(): string {
    const { tx, ty, sx, sy, rot } = this.cal;
    return `translate(${tx},${ty}) scale(${sx},${sy}) rotate(${rot} ${this.SVG_W/2} ${this.SVG_H/2})`;
  }


  svgPointsByKey: Record<string, string> = {};
  startPointByKey: Record<string, { x: number; y: number }> = {};
  endPointByKey: Record<string, { x: number; y: number }> = {};
  // polyTransform = '';

  generateSVGPoints(mapPoints: any) {
    if (!mapPoints || mapPoints.length === 0) {
      this.svgPoints = '';
      this.hasRouteData = false;
      return;
    }

    // กรองเฉพาะข้อมูลที่มี lat, long
    const validPoints = mapPoints.filter((log: { lat: string; lon: string; }) =>
      log.lat && log.lon &&
      !isNaN(parseFloat(log.lat)) &&
      !isNaN(parseFloat(log.lon))
    );

    if (validPoints.length === 0) {
      this.svgPoints = '';
      this.hasRouteData = false;
      return;
    }

    // คำนวณขอบเขตของข้อมูล GPS จากทุกจุด (ไม่ slice)
    const lats = validPoints.map((p: { lat: string; }) => parseFloat(p.lat));
    const longs = validPoints.map((p: { lon: string; }) => parseFloat(p.lon));

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLong = Math.min(...longs);
    const maxLong = Math.max(...longs);
    const SVG_W = 800;
    const SVG_H = 600;
    // สร้างจุดสำหรับ SVG โดยแปลงพิกัด GPS เป็นพิกัด SVG (0-800, 0-600)
    const points = validPoints.map((p: { lat: string; lon: string; }) => {
      const lat = parseFloat(p.lat);
      const long = parseFloat(p.lon);
      const x = ((long - minLong) / (maxLong - minLong)) * SVG_W;
      const y = SVG_H - ((lat - minLat) / (maxLat - minLat)) * SVG_H;
      return { x, y, lat, long };
    });


    this.svgPoints = points.map((pt: { x: any; y: any; }) => `${pt.x},${pt.y}`).join(' ');
    this.hasRouteData = points.length > 1;

    // กำหนดจุดเริ่มต้นและจุดสิ้นสุด
    if (points.length > 0) {
      this.startPoint = points[0];
      this.endPoint = points[points.length - 1];
    } else {
      this.startPoint = { x: 0, y: 0, lat: 0, long: 0 };
      this.endPoint = { x: 0, y: 0, lat: 0, long: 0 };
    }
  }

  onMultiSelectChange(values: SelectKey[] | null): void {
    let arr = (values ?? []);
    if (arr.includes('all')) {
      arr = this.options.map(o => o.value); // ทุกเส้น
    }
    this.selectedKeys = arr.filter((k): k is ChartKey => k !== 'all');
    this.refreshDetail(); // หรือ applySeries()
    this.refreshBrush();
  }

  // === เมื่อผู้ใช้เลือกเส้น (จาก mat-select multiple ของคุณ) ===
  // เรียกตอน select เปลี่ยน (รับเป็น string[] ตรง ๆ)
  // onMultiSelectRaceChange(values: string[]) {
  //   if (this.isSyncingRace) return;

  //   let next: string[] = values ?? [];

  //   // กรณีเลือก "all" -> แทนที่ด้วยทุก key
  //   if (next.includes('all')) {
  //     next = Object.keys(this.allDataLogger);

  //     this.isSyncingRace = true;
  //     this.filterRace.setValue(next, { emitEvent: false }); // << สำคัญ
  //     this.isSyncingRace = false;
  //   }

  //   this.selectedRaceKeys = next;
  //   this.updateMapFromSelection(next);
  // }

  private updateChartsFromSelection(keys: string[]) {
    // If laps are already computed for the selected race, prefer lap-based series
    if (keys?.length === 1 && keys[0] === this.selectedRaceKey && this.raceLab && this.raceLab.length) {
      return;
    }
    const mkSeries = (k: string) => {
      const data = (this.allDataLogger[k] || []);
      const seriesData = data.map((p, idx) => {
        const xValue = p.time && typeof p.time === 'string' && !isNaN(Date.parse(p.time))
          ? new Date(p.time).getTime()
          : (p.ts !== 0 ? p.ts : idx);

        const yValue = Number.isFinite(p.afrValue as number) ? (p.afrValue as number)
                : Number.isFinite(p.velocity as number) ? (p.velocity as number)
                : null;
        return yValue == null ? null : { x: xValue, y: yValue };
      }).filter(Boolean) as {x: any; y: number}[];

      return { name: k, data: seriesData };
    };

    const fullSeries = keys.map(mkSeries);
    const displayThreshold = 50000; // จำนวนจุดสูงสุดที่ต้องการแสดงผล
    const downsampledSeries = fullSeries.map((seriesItem: any) => {
      const downsampledData = this.downsample(seriesItem.data, displayThreshold);
      console.log(`Race '${seriesItem.name}' original points: ${seriesItem.data.length}, Downsampled to: ${downsampledData.length}`);
      return { name: seriesItem.name, data: downsampledData };
    });

    this.detailOpts = {
      ...this.detailOpts,
      series: downsampledSeries
    };

    this.brushOpts = {
      ...this.brushOpts,
      series: fullSeries
    };
  }


  getAfrColor(afr: any ): string {
    const lowerBound = 11.5; // ค่า AFR ต่ำสุดที่จะให้เป็นสีเขียว
    const upperBound = this.afrLimit; // ค่า AFR สูงสุดที่จะเป็นสีแดง

    if (afr >= upperBound) {
      return '#FF0000'; // สีแดง
    }
    if (afr <= lowerBound) {
      return '#00FF00'; // สีเขียว
    }

    // คำนวณสัดส่วนของค่า afr ในช่วง lowerBound ถึง upperBound
    const ratio = (afr - lowerBound) / (upperBound - lowerBound);

    let red, green;

    if (ratio < 0.5) {
      // จากเขียวไปเหลือง (Green -> Yellow)
      red = Math.round(255 * (ratio * 2));
      green = 255;
    } else {
      // จากเหลืองไปแดง (Yellow -> Red)
      red = 255;
      green = Math.round(255 * (1 - (ratio - 0.5) * 2));
    }

    const blue = 0;

    // แปลงค่าสี RGB เป็น Hex string
    const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
    return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  }

  private updateMapFromSelection(keys: string[]) {
    // If laps are already computed for the selected race, prefer lap-based map segments
    if (keys?.length === 1 && keys[0] === this.selectedRaceKey && this.raceLab && this.raceLab.length) {
      return;
    }
    if (!keys?.length) {
      this.svgPointsByKey = {};
      this.startPointByKey = {};
      this.endPointByKey = {};
      this.segmentsByKey = {};
      this.hasRouteData = false;
      return;
    }

    // รวมจุดทั้งหมด (ต้องมี lat/lon และอาจมี afrValue)
    type Raw = { key:string; lat:number; lon:number; afrValue?:number };
    const perKey: Record<string, Raw[]> = {};
    const all: Raw[] = [];

    for (const k of keys) {
      const src = this.allDataLogger?.[k] || this.mapraceDateList?.[k] || [];
      const arr: Raw[] = [];
      for (const p of src) {
        const lat = parseFloat(p.lat);    // ปรับตามโครงสร้างจริงของคุณ
        const lon = parseFloat(p.lon);
        const afr = p.afrValue != null ? Number(p.afrValue) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const item: Raw = { key:k, lat, lon };
          if (Number.isFinite(afr)) item.afrValue = afr;
          arr.push(item); all.push(item);
        }
      }
      perKey[k] = arr;
    }
    if (all.length < 2) {
      this.svgPointsByKey = {};
      this.startPointByKey = {};
      this.endPointByKey = {};
      this.segmentsByKey = {};
      this.hasRouteData = false;
      return;
    }

    // ---- bounds สำหรับ normalize (เหมือนเดิม)
    const lats = all.map(p => p.lat);
    const lons = all.map(p => p.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const spanLat = Math.max(1e-9, maxLat - minLat);
    const spanLon = Math.max(1e-9, maxLon - minLon);
    const SVG_W = 800, SVG_H = 600;

    // ---- ช่วง AFR (ถ้าไม่มีค่าเลย ใช้ค่า default)
    const afrVals = all.map(p => p.afrValue).filter((v): v is number => Number.isFinite(v));
    const afrMin = afrVals.length ? Math.min(...afrVals) : AFR_DEFAULT_MIN;
    const afrMax = afrVals.length ? Math.max(...afrVals) : AFR_DEFAULT_MAX;

    // ---- ค่าที่ต้องส่งออก
    const outPoints: Record<string, string> = {};
    const start: Record<string, {x:number;y:number;lat:number;long:number}> = {};
    const end:   Record<string, {x:number;y:number;lat:number;long:number}> = {};
    const segs:  Record<string, Array<{ i:number;x1:number;y1:number;x2:number;y2:number;c:string; afr:number;  }>> = {};

    for (const k of keys) {
      const arr = perKey[k];
      if (!arr.length) continue;

      // map เป็นพิกัด SVG
      const pts = arr.map((r, i) => {
        const x = ((r.lon - minLon) / spanLon) * SVG_W;
        const y = SVG_H - ((r.lat - minLat) / spanLat) * SVG_H;
        const ts = (r as any).time ? new Date((r as any).time).getTime() : i;

        return { ts, i, x, y, lat: r.lat, long: r.lon, afr: r.afrValue };
      });

      this.currentMapPoints = pts.map(p => ({
        ts: p.ts,
        x: p.x,
        y: p.y,
        afr: p.afr ?? 0
      }));

      // สตริง polyline (เผื่อยังใช้วาดแบบสีเดียว)
      outPoints[k] = pts.map(p => `${p.x},${p.y}`).join(' ');
      start[k] = { x: pts[0].x, y: pts[0].y, lat: pts[0].lat, long: pts[0].long };
      end[k]   = { x: pts[pts.length-1].x, y: pts[pts.length-1].y, lat: pts[pts.length-1].lat, long: pts[pts.length-1].long };

      // ---- แตกเป็น segment พร้อมสีจากค่า AFR (ใช้ค่าเฉลี่ยของคู่จุด)
      const step = Math.max(1, Math.ceil(pts.length / 20000)); // กันหนัก: สูงสุด ~20k segment ต่อ key
      const s: Array<{ i:number;x1:number;y1:number;x2:number;y2:number;c:string , afr:number; }> = [];
      for (let i = 0; i < pts.length - step; i += step) {
        const a = pts[i], b = pts[i + step];

        const p1 = pts[i];
        const p2 = pts[i + 1];

        const afrA = Number.isFinite(a.afr!) ? a.afr! : undefined;
        const afrB = Number.isFinite(b.afr!) ? b.afr! : undefined;
        const afr  = afrA!=null && afrB!=null ? (afrA + afrB)/2
                    : afrA!=null ? afrA
                    : afrB!=null ? afrB
                    : (afrMin + afrMax)/2; // ถ้าไม่มี ใช้กลางช่วง
        // const color = afrToColor(afr, afrMin, afrMax);

        s.push({ i, x1:a.x, y1:a.y, x2:b.x, y2:b.y
          // , c: color
          , c: this.getAfrColor(p1.afr)
          ,afr});
      }
      segs[k] = s;
    }

    this.svgPointsByKey = outPoints;
    this.startPointByKey = start;
    this.endPointByKey = end;
    this.segmentsByKey = segs;
    this.hasRouteData = true;
  }

  private buildSeries(keys: ChartKey[]): ApexAxisChartSeries {
    if (!Array.isArray(this.currentPoints) || !this.currentPoints.length || !keys.length) {
      return [];
    }
    return keys.map(k => {
      const field = this.fieldMap[k];
      const name = this.options.find(o => o.value === k)?.label ?? k;
      const data = this.currentPoints.map(p => {
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
    const widthArr = new Array(series.length).fill(2);
    const dashArr = this.selectedKeys.map(k => k === 'warningAfr' ? 6 : 0);
    const colorArr = this.selectedKeys.map(k => SERIES_COLORS[k]).filter(Boolean);

    this.detailOpts = {
      ...this.detailOpts,
      series,
      colors: colorArr.length ? colorArr : PAL.series.slice(0, series.length),
      stroke: { ...this.detailOpts.stroke, curve: 'smooth', width: widthArr, dashArray: dashArr },

      annotations: {
        yaxis: [
          {
            // กำหนดค่าทั้งหมดที่ต้องการสำหรับเส้นแนวนอน
            y: this.afrLimit, // ใช้ค่าใหม่จาก config
            borderColor: '#dc3545',
            strokeDashArray: 2,
            label: {
              borderColor: '#dc3545',
              style: {
                color: '#fff',
                background: '#dc3545',
              },
              text: `AFR Limit: ${Number.isFinite(this.afrLimit as number) ? (this.afrLimit as number).toFixed(1) : String(this.afrLimit)}`,
              position: 'right',
              offsetX: 5,
            }
          }
        ]
      }
    };
  }

  private refreshBrush(): void {
    const series = this.buildSeries(this.selectedKeys);
    if (!series.length) {
      this.brushOpts = { ...this.brushOpts, series: [] };
      return;
    }
    const colorArr = this.selectedKeys.map(k => SERIES_COLORS[k]).filter(Boolean);
    const widthArr = this.selectedKeys.map(k => (k === 'warningAfr' ? 2 : 1.5));
    const dashArr = this.selectedKeys.map(k => (k === 'warningAfr' ? 5 : 0));

    this.brushOpts = {
      ...this.brushOpts,
      series,
      colors: colorArr.length ? colorArr : [PAL.series[1]],
      stroke: { ...this.brushOpts.stroke, width: widthArr, dashArray: dashArr }
    };
  }


  // Method นี้จะถูกเรียกเมื่อเมาส์เข้าสู่พื้นที่ของจุดบนแผนที่
  onMapPointEnter(point: { x: number; y: number; afr: number }) {
    this.hoverPoint = { visible: true, x: point.x, y: point.y, afr: point.afr };

    // คำนวณตำแหน่ง Tooltip ใหม่
    const left = this.hoverPoint.x * this.scaleX;
    const top = this.hoverPoint.y * this.scaleY;
    this.tooltipStyle = { left: `${left}px`, top: `${top}px`, visibility: 'visible' };
  }

  // Method นี้จะถูกเรียกเมื่อเมาส์ออกจากพื้นที่ของจุดบนแผนที่
  onMapPointLeave() {
    this.hoverPoint.visible = false;
    this.tooltipStyle.visibility = 'hidden';
  }

  private calculateSvgScale() {
    const svg = this.mapSvgEl?.nativeElement;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const viewBox = (svg as SVGSVGElement).viewBox.baseVal;
    if (viewBox.width > 0 && viewBox.height > 0) {
      this.scaleX = rect.width / viewBox.width;
      this.scaleY = rect.height / viewBox.height;
    }
  }

  // private addRedDotSeries() {
  //   if (!this.detailOpts?.series?.length) return;

  //   const afrLimit = this.afrLimit ?? 14;
  //   const afr = this.detailOpts.series[0] as any;
  //   const afrData: any[] = afr.data ?? [];

  //   const redDotData = afrData.reduce(
  //     (acc: { x: any; y: number }[], pt: any) => {
  //       const x = Array.isArray(pt) ? pt[0] : (pt?.x ?? pt?.t ?? pt?.time);
  //       const y = Array.isArray(pt) ? pt[1] : (pt?.y ?? pt?.value);
  //       if (typeof y === 'number' && y > afrLimit) acc.push({ x, y });
  //       return acc;
  //     },
  //     []
  //   );

  //   const redDotSeries: ApexAxisChartSeries[number] = {
  //     name: 'AFR High Points',
  //     type: 'scatter' as const,
  //     data: redDotData
  //   };

  //   const base = (this.detailOpts.series as ApexAxisChartSeries).filter(
  //     (s: any) => s.name !== 'AFR High Points'
  //   ) as ApexAxisChartSeries;

  //   this.detailOpts.series = [...base, redDotSeries] as ApexAxisChartSeries;

  //   const existingColors = (this.detailOpts.colors as string[]) ?? [];
  //   this.detailOpts.colors = [...existingColors.filter(c => c !== '#ff3b30'), '#ff3b30'];

  //   this.detailOpts.markers = {
  //     ...(this.detailOpts.markers || {}),
  //     size: 0,
  //   };
  // }

  private ro?: ResizeObserver;
  ngAfterViewInit(): void {
    // this.initMap();
    // this.generateSVGPoints(this.allDataLogger[this.loggerKey[0]]);

    // this.ro = new ResizeObserver(() => this.map?.invalidateSize());
    // this.ro.observe(this.raceMapRef.nativeElement);

    setTimeout(() => this.map?.invalidateSize(true), 0);
    const sample: RawRow[] = [];
    // const points = this.transformRows(sample);
    // this.setMapPoints(points);

    setTimeout(() => this.calculateSvgScale(), 0);

    const ro = new ResizeObserver(() => this.calculateSvgScale());
    ro.observe(this.mapSvgEl.nativeElement);

    // this.addRedDotSeries();
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    // this.wsSubscriptions.forEach(sub => sub.unsubscribe());
    this.ro?.disconnect();
    this.map?.remove();
    // // ปิด WebSocket connection
    // this.webSocketService.disconnect();

    // this.addRedDotSeries();
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

    // const site = this.siteById('bsc') ?? this.pointMap[0];  // แทน 'bric' ด้วยค่าจาก route/detail ของคุณ
    // this.map = L.map(this.raceMapRef.nativeElement, {
    //   center: [site.lat, site.lon],
    //   zoom: site.zoom ?? 16,
    //   layers: [satellite],
    //   zoomControl: true
    // });


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

  // transformRows(rows: RawRow[]): MapPoint[] {
  //   const pts: MapPoint[] = [];
  //   for (const r of rows) {
  //     const lat = Number(r.lat);
  //     const lon = Number(r.long);
  //     // ข้ามค่าที่นอกช่วงพิกัดปกติ
  //     if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

  //     const ts = Date.parse(r.gps_time);
  //     // สมมติว่ามี r['afr'] หรือเอามาจากที่อื่น
  //     const afr = (r as any).afr as number | undefined;
  //     const warning = typeof afr === 'number' ? afr > AFR_LIMIT : false;

  //     pts.push({ ts, lat, lon, afr, warning });
  //   }
  //   return pts.sort((a, b) => a.ts - b.ts);
  // }

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
      // if (p.warning) {
      L.circleMarker([p.lat, p.lon], {
        radius: 5,
        color: COLORS.warn,
        weight: 2,
        fillColor: COLORS.warn,
        fillOpacity: 0.9
      })
        .bindPopup(this.popupHtml(p))
        .addTo(this.warnLayer);
      // }
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
    // if (p.warning) {
      L.circleMarker([p.lat, p.lon], {
        radius: 5, color: COLORS.warn, weight: 2, fillColor: COLORS.warn, fillOpacity: 0.9
      }).addTo(this.warnLayer);
    // }
  }

  private popupHtml(p: MapPoint): string {
    const t = new Date(p.ts).toLocaleString();
    // const afr = p.afr != null ? p.afr.toFixed(2) : '—';
    return `<div>
      <div><b>Time:</b> ${t}</div>
      <div><b>Lat/Lon:</b> ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</div>
    </div>`;
  }
  //////////// RACE /////////////////////////////////

  navigateToDashboard() {
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


  navigateToResetLogger(enterAnimationDuration: string, exitAnimationDuration: string, modeName:string): void {

    const dialogRef = this.dialog.open(ResetWarningLoggerComponent, {
      enterAnimationDuration, exitAnimationDuration,
      data: {
        mode: modeName,
        loggerId: this.parameterLoggerID,
        raceId: this.parameterRaceId
      }
    });

    // dialogRef.afterClosed().subscribe(result => {
    //   // console.log('The dialog was closed');
    //   if(result == 'success'){
    //     // this.toastr.success('Reset ทั้งหมด เรียบร้อย')
    //     // this.afrAverage
    //   }
    // });
  }
}

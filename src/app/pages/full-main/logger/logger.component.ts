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
import { CarLogger, CarLoggerMeta } from '../../../../../public/models/car-logger.model';
import { delay, of, startWith, Subscription, take } from 'rxjs';
import {
  ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis, ApexStroke, ApexDataLabels,
  ApexFill, ApexMarkers, ApexGrid, ApexLegend, ApexTooltip, ApexTheme,
  NgxApexchartsModule,
  ChartComponent
} from 'ngx-apexcharts';
import * as L from 'leaflet';
import { LoggerDataService } from '../../../service/logger-data.service';
import { HttpClient } from '@angular/common/http';

type ChartKey   = 'avgAfr' | 'realtimeAfr' | 'warningAfr' | 'speed'; // ใช้กับกราฟจริง
type SelectKey  = ChartKey | 'all';

// ======= Drop-in utils =======
type XYPoint = { x: number | null; y: number | null; meta?: any };
const toNumOrNull = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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
type MapPoint = { ts: number; lat: number; lon: number; velocity?: number; heading?: number };


// เติม field เสริมให้ CarLogger เดิม (optional)
type CarLoggerWithPath = CarLogger & {
  path?: MapPoint[];
  lastPoint?: MapPoint;
};

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
type FilterKey = '4/7/68' | '5/7/68';

// type RawRow = {
//   gps_time: string;  // ISO
//   lat: number;       // latitude in degrees
//   long: number;      // longitude in degrees
//   velocity?: number;
//   heading?: number;
//   // เพิ่มฟิลด์ได้ตามจริง เช่น afr: number
// };

// type MapPoint = {
//   ts: number;
//   lat: number;
//   lon: number;
//   afr?: number;
//   warning?: boolean; // ถ้าคำนวณไว้แล้วก็ใส่มาได้
// };

const AFR_LIMIT = 13.5; // เกณฑ์เตือนตัวอย่าง (ปรับได้)
const COLORS = {
  track: '#22D3EE',      // เส้นทางปกติ (เขียวฟ้า)
  warn:  '#F59E0B',      // จุดเตือน (เหลือง)
  live:  '#00FFA3'       // ตำแหน่งล่าสุด
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

// เก็บ path/lastPoint แยก โดยไม่ไปแตะ type ของ allLogger
private pathsByLoggerId: Record<string, MapPoint[]> = {};
private lastPointByLoggerId: Record<string, MapPoint | undefined> = {};

  pointMap: PointDef[] = [
    { idMap:'bric', lat: 14.9635357, lon: 103.085812,   zoom: 16 },
    { idMap:'sic',  lat:  2.76101,   lon: 101.7343345,  zoom: 16 },
    { idMap:'bsc',  lat: 13.304051,  lon: 100.9014779,  zoom: 15 },
  ];

  currentPoints: LoggerPoint[] = [];
  options: { value: ChartKey; label: string; }[] = [
    { value: 'avgAfr',      label: 'Average AFR' },
    { value: 'realtimeAfr', label: 'Realtime AFR' },
    // { value: 'warningAfr',  label: 'Warning AFR' },
    // { value: 'speed',       label: 'Speed' },
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
  filterRace = new FormControl<FilterKey[]>(['4/7/68'], { nonNullable: true });


  //--- Race ------
  @ViewChild('raceMap') raceMapRef!: ElementRef<HTMLDivElement>;

  // เพิ่ม property เก็บ cache (ใน component class)
  private chartPointsByDate: Record<string, LoggerPoint[]> = {}; // or Map<string, LoggerPoint[]>
  private upsertCacheForDate(dateKey: string, pts: LoggerPoint[]) {
    this.chartPointsByDate[dateKey] = Array.isArray(pts) ? pts : [];
  }

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
    stroke: ApexStroke;
    dataLabels: ApexDataLabels;
    colors: string[];
    grid: ApexGrid;
    fill: ApexFill;
    tooltip: ApexTooltip;
    legend: ApexLegend;
    theme: ApexTheme;
  } = {
    series: [],
    chart: { id: 'detailChart', type: 'line', height: 320, background: 'transparent', toolbar: { show: true } },
    xaxis: { labels: { show: false } },
    yaxis: { title: { text: 'AFR' } },
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    colors: PAL.series,
    grid: { borderColor: '#2A3139', strokeDashArray: 3 },
    fill: { type: 'gradient', gradient: { shade: 'dark' } },
    tooltip: { shared: false },
    legend: { show: true, position: 'bottom' },
    theme: { mode: 'dark' },
  };

  svgPoints = '';
  startPoint = { x: 0, y: 0, lat: 0, long: 0 };
  endPoint = { x: 0, y: 0, lat: 0, long: 0 };
  hasRouteData = false;

  // ===== กราฟล่าง (Brush/Navigator) =====
  brushOpts: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis | ApexYAxis[];
    dataLabels: ApexDataLabels;
    stroke: ApexStroke;
    colors: string[];
    fill: ApexFill;
    grid: ApexGrid;
    theme: ApexTheme;
  } = {
    series: [],
    chart: {
      id: 'brushChart',
      type: 'line',
      height: 120,
      brush: { enabled: true, target: 'detailChart' },
      selection: { enabled: true },
      background: 'transparent',
      foreColor: PAL.text
    },
    xaxis: { type: 'numeric', labels: { show: false } },
    yaxis: { labels: { show: false } },
    colors: [PAL.series[1]],              // สีเดียวกับ overviewKey
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 1.5 },
    fill: { type: 'gradient', gradient: { shade: 'dark' } },
    grid: { borderColor: '#2A3139', strokeDashArray: 3 },
    theme: { mode: 'dark' }
  };

  // ---------- OPTIONS ของกราฟหลัก (detail) ----------
  raceDateList: any[] = [
    {
      name: '4/7/68',
      value: '4/7/68'
    },{
      name: '5/7/68',
      value: '5/7/68'
    }
  ];
  // ////////////////////////

  constructor(private router: Router, private route: ActivatedRoute, private cdr: ChangeDetectorRef, private loggerData: LoggerDataService, private http: HttpClient ) {
    // this.setCurrentPoints(this.buildMock(180));

  }

  /** เลือกเฉพาะบางจุดเพื่อไม่ให้กราฟรับหนักเกินไป */
  private decimate<T>(arr: T[], maxPoints = 5000): T[] {
    const n = arr.length;
    if (n <= maxPoints) return arr;
    const step = Math.ceil(n / maxPoints);
    const out: T[] = [];
    for (let i = 0; i < n; i += step) out.push(arr[i]);
    // อย่าลืมจุดสุดท้าย
    if (out[out.length - 1] !== arr[n - 1]) out.push(arr[n - 1]);
    return out;
  }



  loadLogs(key: string, dateValue: '4/7/68' | '5/7/68' | '6/7/68') {
    // ถ้ามี cache อยู่แล้ว → ใช้เลย
    if (this.chartPointsByDate[dateValue]) {
      const cached = this.chartPointsByDate[dateValue];
      this.setCurrentPoints(cached);
      this.cdr.markForCheck();
      return;
    }

    this.loggerData.getListLoggerRaw$({ key, date: dateValue, page: 1, page_size: 50000 })
      .pipe(take(1))
      .subscribe({
        next: (res) => {
          const rows = Array.isArray(res.data) ? res.data : [];

          const carId: string = String((rows[0] as any)?.car_id ?? key ?? '');

          const mapPoints: MapPoint[] = rows
            .map(r => this.rowToMapPoint(r))
            .filter((p): p is MapPoint => !!p)
            .sort((a, b) => a.ts - b.ts);

          this.pathsByLoggerId[carId] = mapPoints;
          this.lastPointByLoggerId[carId] = mapPoints.at(-1);

          let chartPoints = rows
            .map(r => this.rowToLoggerPoint(r))
            .filter(p =>
              Number.isFinite(p.ts) &&
              (Number.isFinite(p.avgAfr) || Number.isFinite(p.realtimeAfr) || Number.isFinite(p.speed))
            )
            .sort((a, b) => a.ts - b.ts);

          chartPoints = this.decimate(chartPoints, 5000);

          let idx = this.allLogger.findIndex(l => String((l as any).loggerId) === carId);
          if (idx === -1) {
            const stub: Partial<CarLoggerMeta> = {
              loggerId: carId,
              carNumber: carId,
              firstName: '',
              lastName: '',
              createdDate: new Date(),
              numberWarning: 0,
              warningDetector: false,
            };
            this.allLogger = [...this.allLogger, stub as CarLogger];
            idx = this.allLogger.length - 1;
          }

          chartPoints = chartPoints.map(p => ({
            ...p,
            avgAfr: Number.isFinite(p.avgAfr) ? p.avgAfr : (null as any),
            realtimeAfr: Number.isFinite(p.realtimeAfr) ? p.realtimeAfr : (null as any),
            speed: Number.isFinite(p.speed) ? p.speed : (null as any),
          }));

          // เก็บ cache ตามวัน
          this.chartPointsByDate[dateValue] = chartPoints;

          // อัปเดตกาฟ
          this.setCurrentPoints(chartPoints);
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Load logs error:', err),
      });
  }

  private toPoint(x: number, y: number) {
    return {
      x: Number.isFinite(x) ? x : null,
      y: Number.isFinite(y) ? y : null,
    };
  }

  // ===== ช่วยกัน NaN/undefined =====
  private n(v: any): number | null {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }
  private sanitizeSeries(series: ApexAxisChartSeries | any): ApexAxisChartSeries {
    if (!Array.isArray(series)) return [];
    return series.map(s => {
      const data = Array.isArray(s.data) ? s.data : [];
      const safe = data.map((d: any) => {
        if (d && typeof d === 'object') {
          return { x: this.n(d.x), y: this.n(d.y), meta: d.meta ?? null };
        }
        const y = this.n(d);
        return y === null ? null : { x: null, y };
      }).filter(Boolean);
      return { ...s, data: safe };
    });
  }

  private buildCompareSeriesFromCache(dates: string[], metric: keyof LoggerPoint = 'avgAfr'): ApexAxisChartSeries {
    const out: ApexAxisChartSeries = [];
    for (const d of dates) {
      const pts = this.chartPointsByDate[d] ?? [];
      if (!pts.length) continue;

      const useX = pts.some(p => Number.isFinite((p as any).x));
      const data = pts.map(p => ({
        x: useX ? Number((p as any).x) : Number(p.ts),
        y: this.n(p[metric]),
        meta: { lat: (p as any).lat, lon: (p as any).lon, gps_time: (p as any).gps_time }
      })).filter(dp => Number.isFinite(dp.x) && dp.y !== null);

      if (data.length) out.push({ name: d, data });
    }
    return out;
  }


  private renderSelectedFromCache(dates: string[]) {
    if (!dates?.length) {
      this.detailOpts = { ...this.detailOpts, series: [] };
      this.brushOpts  = { ...this.brushOpts,  series: [] };
      this.cdr.markForCheck();
      return;
    }

    const series = this.buildCompareSeriesFromCache(dates ?? [], 'avgAfr');

    // -------- Type guard + null-safe --------
    type XYPoint = { x: number; y: number } & Record<string, any>;
    function isXYPoint(p: unknown): p is XYPoint {
      return !!p && typeof p === 'object'
        && 'x' in (p as any)
        && typeof (p as any).x === 'number'
        && 'y' in (p as any);
    }

// ให้แน่ใจว่า series เป็นอาร์เรย์เสมอ
const safeSeries: ApexAxisChartSeries = Array.isArray(series) ? series : [];

// ดึง datapoint แรกแบบปลอดภัย
const firstPoint: unknown =
  safeSeries.length > 0 &&
  Array.isArray(safeSeries[0].data) &&
  safeSeries[0].data.length > 0
    ? (safeSeries[0].data[0] as unknown)
    : null;

    // ใช้ type guard ตัดสินว่า x เป็นตัวเลข (ใช้แกน longitude)
    const usingLonX = isXYPoint(firstPoint);

    // -------- ตั้งค่า chart options (formatter ต้องรับ string) --------
    this.detailOpts = {
      ...this.detailOpts,
      chart: {
        id: 'detailChart',
        type: 'line',
        height: 300,
        animations: { enabled: false },   // กันพังช่วงอัปเดต
        toolbar: { show: true },
        background: 'transparent',
        foreColor: '#CFD8DC',
      },
      xaxis: {
        ...this.detailOpts.xaxis,
        // type ตั้งให้ตรงก่อน render จริง (ดูข้อ 4 ใช้ useX)
        labels: { formatter: (v: string) => String(v) } // ต้องคืน string เสมอ
      },
      tooltip: {
        ...this.detailOpts.tooltip,
        shared: false,
        intersect: true,
        followCursor: false,
        x: { formatter: (v: any) => String(v) },
        y: { formatter: (val: number) => Number.isFinite(val) ? val.toFixed(2) : '' },
        // *** สำคัญ: ห้ามส่ง undefined ออกไป ***
        custom: ({ w, seriesIndex, dataPointIndex }: any): string => {
          try {
            const series = Array.isArray(w?.config?.series) ? w.config.series : [];
            const s = series[seriesIndex];
            const dp = s && Array.isArray(s.data) ? s.data[dataPointIndex] : null;
            if (!dp) return '';
            const y = Number((dp as any).y);
            const meta = (dp as any).meta ?? {};
            const lat = Number(meta.lat), lon = Number(meta.lon);
            const afrTxt = Number.isFinite(y) ? y.toFixed(2) : '—';
            const latTxt = Number.isFinite(lat) ? lat.toFixed(6) : '—';
            const lonTxt = Number.isFinite(lon) ? lon.toFixed(6) : '—';
            return `<div class="apx-tip">
              <div><b>AFR:</b> ${afrTxt}</div>
              <div><b>Lat/Lon:</b> ${latTxt}, ${lonTxt}</div>
            </div>`;
          } catch { return ''; }
        }
      },
      legend: { ...this.detailOpts.legend, formatter: (name?: string) => String(name ?? '') },
      dataLabels: { enabled: false, formatter: (v: number) => Number.isFinite(v) ? String(v) : '' }
    };

    this.brushOpts = {
      ...this.brushOpts,
      chart: {
        id: 'brushChart',
        type: 'line',
        height: 120,
        animations: { enabled: false },
        brush: { enabled: true, target: 'detailChart' },
        selection: { enabled: true },
        background: 'transparent',
        foreColor: '#CFD8DC'
      },
      xaxis: {
        ...this.brushOpts.xaxis,
        labels: { formatter: (v: string) => String(v) }
      },
      dataLabels: { enabled: false },
    };
    this.cdr.markForCheck();
  }


  // แปลง timestamp ให้เป็น epoch ms (ลอง time_ms ก่อน, ถ้าไม่ได้ค่อย parse gps_time/iso)
  private toEpochMs(row: any): number {
    // ใช้ time_ms ก่อน ถ้าไม่มีค่อย parse gps_time/timestamp
    const n = Number(row?.time_ms);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(String(row?.gps_time ?? row?.timestamp ?? ''));
    return Number.isFinite(t) ? t : Date.now();
  }

  private rowToMapPoint(row: any): MapPoint | null {
    const lat = Number(row?.lat);
    const lon = Number(row?.long ?? row?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    // if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    return {
      ts: this.toEpochMs(row),
      lat,
      lon,
      velocity: Number(row?.velocity),
      afr: Number(row?.heading) || NaN,   // 👈 ใช้ heading เป็น afr
    } as MapPoint & { afr: number };
  }

  // ขนาดหน้าต่างเฉลี่ย (ปรับได้)
  private avgWindow = 10;

  // buffer เก็บค่า AFR ล่าสุด + ผลรวม เพื่อคำนวณเร็ว
  private _afrBuf: number[] = [];
  private _afrSum = 0;

  private rowToLoggerPoint(row: any): LoggerPoint {
    const afr = parseFloat(row?.data);        // <- AFR
    const spd = parseFloat(row?.velocity);
    return {
      ts: this.toEpochMs(row),                // หรือ Date.parse(row.gps_time)
      x: this.n(row?.lon) ?? undefined,       // ถ้าอยากใช้ lon เป็นแกน X
      avgAfr: this.n(afr),
      realtimeAfr: this.n(afr),
      warningAfr: null,
      speed: this.n(spd),
      // meta lat/lon เอาไปวางใน tooltip ได้
    } as any;
}


// ======= mock แหล่งข้อมูลรายวัน =======
  // ในงานจริง ให้ดึงมาจาก service แทน แล้วเก็บ cache ไว้ใน dayCache
  private dayCache: Record<string, RawRow[]> = {
    '4/7/68': [
      { lat: 13.3041, lon: 100.9015, heading: 13.1 },
      { lat: 13.3042, lon: 100.9017, heading: 13.4 },
      { lat: 13.3043, lon: 100.9019, heading: 13.2 },
    ],
    '5/7/68': [
      { lat: 13.30405, lon: 100.90148, heading: 13.0 },
      { lat: 13.30418, lon: 100.90166, heading: 13.6 },
      { lat: 13.30430, lon: 100.90183, heading: 13.3 },
    ],
    '6/7/68': [
      { lat: 13.3040, lon: 100.9014, heading: 13.2 },
      { lat: 13.3041, lon: 100.9016, heading: 13.5 },
      { lat: 13.3042, lon: 100.9018, heading: 13.1 },
    ],
  };

  // === Compare/Cache ===
  selectedDates: string[] = [];  // เก็บวันที่ที่เลือกจาก <mat-select multiple>

  private publicUrl(path: string): string {
    // path: 'models/mock-logger-2.txt' หรือ '/models/mock-logger-2.txt'
    const base = document.baseURI.replace(/\/$/, '');     // เคารพ <base href="...">
    const clean = path.replace(/^\/+/, '');               // ตัด / นำหน้าออกกันพลาด
    return `${base}/${clean}`;
  }
  ngOnInit() {
    this.generateSVGPointsFromFile('models/mock-logger-2.txt');

    let arrayTest : any[] = ['4/7/68' , '5/7/68']
    let arrayIDTest : any[] = ['client_1456' , 'client_456']
    for (let index = 0; index < arrayTest.length; index++) {
      const element = arrayTest[index];
      const elementId = arrayIDTest[index];

      this.loadLogs(elementId, element);
    }
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
    this.rebuildSeriesUsingLon(this.collectRowsBySelectedDates());

    // render จาก cache ครั้งแรก (ถ้าเคย load ไว้แล้ว)
    this.renderSelectedFromCache(this.filterRace.value ?? []);

    // ทุกครั้งที่เปลี่ยน → render จาก cache เท่านั้น
    this.subscriptions.push(
      this.filterRace.valueChanges.subscribe((v: string[] | null) => {
        this.selectedDates = Array.isArray(v) ? v : [];
        this.setCurrentPoints(this.currentPoints); // reuse cache & render ใหม่
      })
    );
  }

   // ======= Helper: รวม rows ตามวันที่ที่เลือก =======
  private collectRowsBySelectedDates(): Record<string, RawRow[]> {
    const dates = this.filterRace.value ?? [];
    const map: Record<string, RawRow[]> = {};
    for (const d of dates) {
      map[d] = this.dayCache[d] ?? [];
    }
    return map;
  }

  // ======= ใช้ "Longitude" เป็นแกน X =======
  private rowsToSeriesByLon(rows: RawRow[], ySelector: (r: RawRow) => number, name: string) {
    const data: ChartPoint[] = [];
    for (const r of rows) {
      const x = Number(r.lon);
      if (!Number.isFinite(x)) continue;
      const y = Number(ySelector(r));
      data.push({ x, y: Number.isFinite(y) ? y : NaN, meta: r });
    }
    data.sort((a, b) => a.x - b.x);
    return { name, data };
  }
  
  // ======= ประกอบซีรีส์เข้า Apex =======
  private rebuildSeriesUsingLon(rowsByDay: Record<string, RawRow[]>) {
    const out: ApexAxisChartSeries = [];

    for (const [day, rows] of Object.entries(rowsByDay)) {
      // ใช้ heading เป็น AFR (หรือถ้ามีฟิลด์ afr ก็เปลี่ยน selector ด้านล่างได้เลย)
      out.push(
        this.rowsToSeriesByLon(rows, r => Number(r.afr ?? r.heading), `Average AFR ${day}`),
        this.rowsToSeriesByLon(rows, r => Number(r.afr ?? r.heading), `Realtime AFR ${day}`),
      );
    }

    // อัปเดตกราฟหลัก
    this.detailOpts = {
      ...this.detailOpts,
      series: out,
      xaxis: {
        ...this.detailOpts.xaxis,
        type: 'numeric',
        title: { text: 'Longitude (°)' },
        // labels: { formatter: (v: any) => v.toFixed(5) }
        labels: { show: false }
      },
      tooltip: {
        ...this.detailOpts.tooltip,
        shared: false,
        x: { formatter: (v: number) => v.toFixed(6) + '°' },
        y: { formatter: (v: number) => v.toFixed(2) },
        custom: ({ w, seriesIndex, dataPointIndex }: any) => {
          const dp = w.config.series[seriesIndex].data[dataPointIndex];
          const m = dp?.meta;
          if (!m) return undefined;
          const lat = Number(m.lat), lon = Number(m.lon);
          return `<div class="apex-tooltip">
            <div><b>AFR:</b> ${Number(dp.y).toFixed(2)}</div>
            <div><b>Lat/Lon:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
            ${m.gps_time ? `<div><b>Time:</b> ${m.gps_time}</div>` : ''}
          </div>`;
        }
      }
    };

    // อัปเดตกราฟ brush
    this.brushOpts = {
      ...this.brushOpts,
      series: out,
      xaxis: { ...this.brushOpts.xaxis, type: 'numeric', labels: { show: false } }
    };
  }


  // ควรมีตัวลดจำนวนจุด เพื่อให้ SVG/กราฟลื่น
  private decimateFile<T>(arr: T[], maxPoints = 8000): T[] {
    const n = arr.length;
    if (n <= maxPoints) return arr;
    const step = Math.ceil(n / maxPoints);
    const out: T[] = [];
    for (let i = 0; i < n; i += step) out.push(arr[i]);
    if (out[out.length - 1] !== arr[n - 1]) out.push(arr[n - 1]);
    return out;
  }

  private findHeaderIndex(lines: string[]): number {
    // 1) กรณีมี [columnnames] → ใช้บรรทัดถัดไปที่ไม่ว่าง
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].trim().toLowerCase();
      if (ln === '[columnnames]') {
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim()) return j;
        }
      }
    }
    // 2) ไม่เจอ section → เดินหาบรรทัดแรกที่น่าจะเป็น header (มีคอมมา+พบ lat/long)
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].trim();
      if (!ln || !ln.includes(',')) continue;
      const lower = ln.toLowerCase();
      if ((lower.includes('lat') && (lower.includes('long') || lower.includes('lon')))) {
        return i;
      }
    }
    return -1;
  }

  /** แปลงไฟล์ logger (txt/csv) → MapPoint[] รองรับ [columnnames] */
  private parseLoggerTextToPoints(text: string): MapPoint[] {
    if (!text) return [];
    const lines = text.split(/\r?\n/).map(l => l.replace(/^\uFEFF/, '')); // strip BOM

    const headerIdx = this.findHeaderIndex(lines);
    if (headerIdx < 0) {
      console.warn('ไม่พบ header ในไฟล์ logger');
    }

    const headerLine = headerIdx >= 0 ? lines[headerIdx] : '';
    const sep = headerLine.includes('\t') ? '\t' : ','; // เผื่อเป็น TSV
    const headers = headerLine.split(sep).map(h => h.trim().toLowerCase());

    const col = (name: string) => headers.findIndex(h => h === name);

    // ตำแหน่งคอลัมน์ (รองรับหลายชื่อ)
    const iLat = col('lat');
    const iLon = col('long') >= 0 ? col('long') : col('lon');
    const iVel = col('velocity') >= 0 ? col('velocity') : col('speed');
    const iAfr = col('heading') >= 0 ? col('heading') : (col('data') >= 0 ? col('data') : col('afr'));
    const iTsMs = col('time_ms');
    const iTsTxt = ((): number => {
      const c1 = col('gps_time');
      const c2 = col('timestamp');
      const c3 = col('time');
      return c1 >= 0 ? c1 : (c2 >= 0 ? c2 : c3);
    })();

    const out: MapPoint[] = [];
    // เริ่มอ่านตั้งแต่บรรทัดหลัง header
    for (let i = Math.max(0, headerIdx + 1); i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('[')) continue; // ข้าม section ใหม่ (ถ้ามี)
      const cols = line.split(sep);

      const lat = Number(cols[iLat] ?? NaN);
      const lon = Number(cols[iLon] ?? NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      // if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

      // ts: ใช้ time_ms ก่อน ถ้าไม่มีค่อย parse ข้อความเวลา
      let ts = NaN;
      if (iTsMs >= 0) {
        ts = Number(cols[iTsMs]);
      }
      if (!Number.isFinite(ts) && iTsTxt >= 0) {
        const t = Date.parse(String(cols[iTsTxt]));
        if (Number.isFinite(t)) ts = t;
        // ถ้ายัง NaN และรูปแบบเป็น "2025-07-04T14:39:06+07:00" ก็ควร parse ผ่านอยู่แล้ว
      }
      if (!Number.isFinite(ts)) continue;

      const velocity = Number(cols[iVel] ?? NaN);
      const afr = Number(cols[iAfr] ?? NaN); // heading/data = AFR

      out.push({
        ts,
        lat,
        lon,
        velocity: Number.isFinite(velocity) ? velocity : undefined,
        // afr: Number.isFinite(afr) ? afr : undefined,
      });
    }

    out.sort((a, b) => a.ts - b.ts);
    return out;
  }

    // ====== เวอร์ชันใหม่: อ่านจากไฟล์ ======
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



  cal = { tx: 6, ty: 33, sx: 1, sy: 1, rot: 0 };
  readonly SVG_W = 800;
  readonly SVG_H = 600;

  get polyTransform(): string {
    const { tx, ty, sx, sy, rot } = this.cal;
    return `translate(${tx},${ty}) scale(${sx},${sy}) rotate(${rot} ${this.SVG_W/2} ${this.SVG_H/2})`;
  }
  generateSVGPoints(mapPoints:any) {
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

  // helper ทั่วไป
  private toNumOrNull(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // metric: 'avgAfr' | 'realtimeAfr' | 'speed' | 'warningAfr'
  private buildSeriesFromCurrentPoints(metric: keyof LoggerPoint = 'avgAfr'): ApexAxisChartSeries {
    const pts = this.currentPoints ?? [];
    if (!pts.length) return [];

    const useX = pts.some(p => Number.isFinite((p as any).x));
    const data = pts.map(p => ({
      x: useX ? Number((p as any).x) : Number(p.ts),
      y: this.n(p[metric]),
      meta: { lat: (p as any).lat, lon: (p as any).lon, gps_time: (p as any).gps_time }
    })).filter(dp => Number.isFinite(dp.x) && dp.y !== null);

    return [{ name: this.seriesNameFor(metric), data }];
  }

  private seriesNameFor(metric: keyof LoggerPoint) {
    switch (metric) {
      case 'realtimeAfr': return 'Realtime AFR';
      case 'speed':       return 'Speed';
      case 'warningAfr':  return 'Warning AFR';
      default:            return 'Average AFR';
    }
  }

  // === เมื่อโหลด/เปลี่ยนข้อมูล ===
  setCurrentPoints(points: LoggerPoint[] | null | undefined) {
    // 1) เตรียม currentPoints + กัน NaN
    const arr = Array.isArray(points) ? points : [];
    this.currentPoints = arr.map((p: any) => ({
      ...p,
      x: (p?.x != null && Number.isFinite(Number(p.x))) ? Number(p.x) : undefined,
      ts: Number.isFinite(Number(p?.ts)) ? Number(p.ts) : Date.now(),
      avgAfr: this.n(p?.avgAfr),
      realtimeAfr: this.n(p?.realtimeAfr),
      warningAfr: this.n(p?.warningAfr),
      speed: this.n(p?.speed),
    }));

    // 2) สร้าง series: ถ้าเลือกหลายวัน → compare, ไม่งั้นใช้ current
    let series: ApexAxisChartSeries =
      (this.selectedDates?.length ? this.buildCompareSeriesFromCache(this.selectedDates, 'avgAfr')
                                  : this.buildSeriesFromCurrentPoints('avgAfr'));

    // 2.1 ถ้า metric avgAfr ว่าง ลอง fallback เป็น realtimeAfr
    if (!series.length || !series.some(s => s.data?.length)) {
      series = this.selectedDates?.length
        ? this.buildCompareSeriesFromCache(this.selectedDates, 'realtimeAfr')
        : this.buildSeriesFromCurrentPoints('realtimeAfr');
    }

    // sanitize กัน NaN/undefined
    const safeSeries = this.sanitizeSeries(series);

    // 3) ตั้งชนิดแกน X และ selection เริ่มต้น
    const firstPt = safeSeries[0]?.data?.[0] as any;
    const useX = !!(firstPt && typeof firstPt === 'object' && typeof firstPt.x === 'number');

    // ช่วงเลือกเริ่มต้น (ท้ายสุด ~45 จุด)
    const xs: number[] = (safeSeries[0]?.data ?? []).map((d: any) => d?.x).filter((n: any) => Number.isFinite(n));
    const hasRange = xs.length >= 2;
    const end = hasRange ? xs[xs.length - 1] : undefined;
    const start = hasRange ? xs[Math.max(0, xs.length - 45)] : undefined;

    // 4) ตั้งค่าลง brush/detail + series
    this.brushOpts = {
      ...this.brushOpts,
      chart: { ...this.brushOpts.chart, selection: hasRange ? { enabled: true, xaxis: { min: start, max: end } } : { enabled: false } },
      xaxis: { ...this.brushOpts.xaxis, type: useX ? 'numeric' : 'datetime' },
      series: safeSeries
    };
    this.detailOpts = {
      ...this.detailOpts,
      xaxis: { ...this.detailOpts.xaxis, type: useX ? 'numeric' : 'datetime' },
      series: safeSeries
    };

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
        const y = Number((p as any)[field]);
        return { x: p.ts, y: isFinite(y) ? y : null }; // ✅ ส่ง null แทน NaN/undefined
      });
      return { name, data };
    });
  }

  private refreshDetail(): void {
    const series = this.buildSeries(this.selectedKeys);
    if (!series.length) {
      this.detailOpts = { ...this.detailOpts, series: [] }; // ✅ เคลียร์ปลอดภัย
      return;
    }
    const widthArr = new Array(series.length).fill(2);
    const dashArr  = this.selectedKeys.map(k => k === 'warningAfr' ? 6 : 0);
    const colorArr = this.selectedKeys.map(k => SERIES_COLORS[k]).filter(Boolean);

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
      this.brushOpts = { ...this.brushOpts, series: [] }; // ✅ เคลียร์ปลอดภัย
      return;
    }
    const colorArr = this.selectedKeys.map(k => SERIES_COLORS[k]).filter(Boolean);
    const widthArr = this.selectedKeys.map(k => (k === 'warningAfr' ? 2 : 1.5));
    const dashArr  = this.selectedKeys.map(k => (k === 'warningAfr' ? 5 : 0));

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
    // this.initMap();

    // 2.1 ถ้า parent เปลี่ยนขนาด ให้ redraw อัตโนมัติ
    // this.ro = new ResizeObserver(() => this.map?.invalidateSize());
    // this.ro.observe(this.raceMapRef.nativeElement);

    // 2.2 กันเคส init ตอน layout ยังจัดไม่เสร็จ
    setTimeout(() => this.map?.invalidateSize(true), 0);
    // DEMO: แปลงข้อมูลตัวอย่าง → วางลงแผนที่
    // TODO: เปลี่ยนเป็นข้อมูลจริงจาก service
    const sample: RawRow[] = []; // ใส่ข้อมูลจริงของคุณที่มี lat/long ปกติ
    // const points = this.transformRows(sample);
    // this.setMapPoints(points);
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

    const site = this.siteById('bsc') ?? this.pointMap[0];  // แทน 'bric' ด้วยค่าจาก route/detail ของคุณ
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

  // addLivePoint(p: MapPoint): void {
  //   if (!this.trackLine) return this.setMapPoints([p]); // เผื่อยังไม่ init
  //   this.trackLine.addLatLng([p.lat, p.lon]);
  //   this.liveMarker?.setLatLng([p.lat, p.lon]);
  //   if (p.warning) {
  //     L.circleMarker([p.lat, p.lon], {
  //       radius: 5, color: COLORS.warn, weight: 2, fillColor: COLORS.warn, fillOpacity: 0.9
  //     }).addTo(this.warnLayer);
  //   }
  // }

  private popupHtml(p: MapPoint): string {
    const t = new Date(p.ts).toLocaleString();
    // const afr = p.afr != null ? p.afr.toFixed(2) : '—';
    return `<div>
      <div><b>Time:</b> ${t}</div>
      <div><b>Lat/Lon:</b> ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</div>
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

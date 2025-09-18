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
// type FilterKey = '4/7/2025' | '5/7/2025';

type RawRow = {
  gps_time: string;  // ISO
  lat: number;       // latitude in degrees
  long: number;      // longitude in degrees
  velocity?: number;
  heading?: number;
  // เพิ่มฟิลด์ได้ตามจริง เช่น afr: number
};

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
  // filterRace = new FormControl<FilterKey[]>(['4/7/2025'], { nonNullable: true });


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

  svgPoints = '';
  startPoint = { x: 0, y: 0, lat: 0, long: 0 };
  endPoint = { x: 0, y: 0, lat: 0, long: 0 };
  hasRouteData = false;

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
  raceDateList: any[] = [
    {
      name: '4/7/2025',
      value: '4/7/2025'
    },{
      name: '5/7/2025',
      value: '5/7/2025'
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
    this.loggerData.getListLoggerRaw$({ key, date: dateValue, page: 1, page_size: 50000 })
      .pipe(take(1))
      .subscribe({
        next: (res) => {
          const rows = Array.isArray(res.data) ? res.data : [];

          // หา loggerId/carId (อินพุตจริงบาง response ไม่มี field ใน type → ใช้ as any)
          const carId: string =
            String((rows[0] as any)?.car_id ?? key ?? '');

          // 1) map → จุดสำหรับแผนที่
          const mapPoints: MapPoint[] = rows
            .map(r => this.rowToMapPoint(r))
            .filter((p): p is MapPoint => !!p)
            .sort((a, b) => a.ts - b.ts);

          this.pathsByLoggerId[carId] = mapPoints;
          this.lastPointByLoggerId[carId] = mapPoints.at(-1);

          // 2) map → จุดสำหรับกราฟ (เรียงเวลา + กรองค่าพัง)
          let chartPoints = rows
            .map(r => this.rowToLoggerPoint(r))
            .filter(p =>
              Number.isFinite(p.ts) &&
              (Number.isFinite(p.avgAfr) || Number.isFinite(p.realtimeAfr) || Number.isFinite(p.speed))
            )
            .sort((a, b) => a.ts - b.ts);

          // 2.1 ลดจำนวนจุดให้เหลือประมาณ 5,000 (พอสำหรับ UI/zoom/brush)
          chartPoints = this.decimate(chartPoints, 5000);

          // 3) อัปเดต allLogger เฉพาะ metadata (ไม่ไปเปลี่ยน type/shape)
          //    ถ้า allLogger ยังไม่มีรายการของ carId ให้เติม dummy entry
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

          // 4) อัปเดตแผนที่ (ลากเส้น)
          // if (mapPoints.length) {
          //   this.generateSVGPointsFromFile('/models/mock-logger-2.txt');
          //   // this.generateSVGPoints(mapPoints); // ฟังก์ชันของคุณที่วาด polyline/warn/livemarker
          // }

          // 5) อัปเดตกาฟ (ใช้ระบบกราฟเดิม)
          this.setCurrentPoints(chartPoints); // ฟังก์ชันของคุณที่เรียก refreshDetail/refreshBrush
          // this.generateSVGPoints();
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Load logs error:', err),
      });
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

  // เรียกอันนี้เมื่อเริ่มประมวลผลชุดข้อมูลใหม่ (ก่อน loop/map)
  private resetAvgAfr(): void {
    this._afrBuf = [];
    this._afrSum = 0;
  }

  private rowToLoggerPoint(row: any) {
    // AFR มาจาก data (heading as data)
    const afrNum = parseFloat(row?.data);
    const spdNum = parseFloat(row?.velocity);

    // realtime = ค่าดิบ
    const realtimeAfr = Number.isFinite(afrNum) ? afrNum : NaN;

    // === คำนวนค่าเฉลี่ยเคลื่อนที่ (SMA) ทันทีภายในฟังก์ชันนี้ ===
    let avgAfr = NaN;
    if (Number.isFinite(realtimeAfr)) {
      this._afrBuf.push(realtimeAfr);
      this._afrSum += realtimeAfr;

      // รักษาขนาดหน้าต่าง
      if (this._afrBuf.length > this.avgWindow) {
        const out = this._afrBuf.shift()!;
        this._afrSum -= out;
      }
      // ตอนนี้ _afrBuf มีเฉพาะค่าที่เป็นตัวเลข => หาเฉลี่ยได้ตรง ๆ
      avgAfr = this._afrSum / this._afrBuf.length;
    }

    return {
      ts: this.toEpochMs(row),
      avgAfr,                          // ✅ ค่าเฉลี่ยเคลื่อนที่ ณ จุดนี้
      realtimeAfr,                     // ✅ ค่าดิบ
      warningAfr: NaN,
      speed: Number.isFinite(spdNum) ? spdNum : NaN,
    };
  }



  ngOnInit() {
    this.generateSVGPointsFromFile('/models/mock-logger-2.txt');

    this.loadLogs('client_1456', '4/7/68');
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
  generateSVGPointsFromFile(fileUrl: string) {
    // ตัวอย่าง fileUrl: '/models/mock-logger-2.txt' หรือ '/assets/models/mock-logger-2.txt'
    this.http.get(fileUrl, { responseType: 'text' }).pipe(take(1))
      .subscribe({
        next: (text) => {
          const points = this.parseLoggerTextToPoints(text);
          const slim = this.decimateFile(points, 8000);   // ลดจุดกันไฟล์ใหญ่

          // เรียกเวอร์ชันเดิมของคุณต่อได้เลย
          this.generateSVGPoints(slim);               // <— ฟังก์ชันเดิม (รับ MapPoint[])
          // ถ้าคุณวาดด้วย Leaflet ให้เรียก this.setMapPoints(slim)
          // this.setMapPoints(slim);

          // ถ้าอยากอัพเดตกราฟ:
          const chartPoints = slim.map(p => ({
            ts: p.ts,
            // avgAfr: p.afr ?? NaN,
            // realtimeAfr: p.afr ?? NaN,
            warningAfr: NaN,
            speed: p.velocity ?? NaN,
          }));
          // this.setCurrentPoints(chartPoints);         // <— ระบบกราฟเดิม
          this.cdr.markForCheck();
        },
        error: err => {
          console.error('load file error:', err);
        }
      });
  }

generateSVGPoints(mapPoints: any) {
  // ขนาดผืนผ้าใบจริง
  const W = 800, H = 600;
  const PAD = 10;               // เผื่อขอบใน
  const innerW = W - PAD * 2;   // = 780
  const innerH = H - PAD * 2;   // = 580

  this.svgPoints = '';
  this.hasRouteData = false;

  if (!Array.isArray(mapPoints) || mapPoints.length === 0) {
    this.startPoint = { x: 0, y: 0, lat: 0, long: 0 };
    this.endPoint   = { x: 0, y: 0, lat: 0, long: 0 };
    return;
  }

  // กรองเฉพาะจุดที่มี lat/lon เป็นตัวเลข
  const valid = mapPoints.filter((p: any) =>
    p?.lat != null && p?.lon != null &&
    !Number.isNaN(parseFloat(p.lat)) &&
    !Number.isNaN(parseFloat(p.lon))
  );
  if (valid.length === 0) {
    this.startPoint = { x: 0, y: 0, lat: 0, long: 0 };
    this.endPoint   = { x: 0, y: 0, lat: 0, long: 0 };
    return;
  }

  // ขอบเขตพิกัด geodecimal
  const lats  = valid.map((p: any) => parseFloat(p.lat));
  const lons  = valid.map((p: any) => parseFloat(p.lon));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);

  // กันหารศูนย์ (เส้นตรงแนวตั้ง/แนวนอน)
  const latRange = (maxLat - minLat) || 1e-9;
  const lonRange = (maxLon - minLon) || 1e-9;

  // project → เฟรมด้านใน (0..innerW, 0..innerH) แล้วค่อยใส่ padding
  const points = valid.map((p: any) => {
    const lat = parseFloat(p.lat);
    const lon = parseFloat(p.lon);

    const nx = (lon - minLon) / lonRange;          // 0..1
    const ny = (lat - minLat) / latRange;          // 0..1

    const x = PAD + nx * innerW;                   // 10 .. 790
    const y = PAD + (1 - ny) * innerH;             // invert แกน Y แล้วเผื่อขอบ

    return { x, y, lat, long: lon };
  });

  this.svgPoints   = points.map(pt => `${pt.x},${pt.y}`).join(' ');
  this.hasRouteData = points.length > 1;

  // จุดเริ่ม/จุดจบ
  if (points.length) {
    this.startPoint = points[0];
    this.endPoint   = points[points.length - 1];
  } else {
    this.startPoint = { x: 0, y: 0, lat: 0, long: 0 };
    this.endPoint   = { x: 0, y: 0, lat: 0, long: 0 };
  }
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

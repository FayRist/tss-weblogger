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
import { Subscription, Subject } from 'rxjs';
import { bufferTime, filter } from 'rxjs/operators';
import { formControlWithInitial } from '../../../utility/rxjs-utils';
import {
  ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis, ApexStroke, ApexDataLabels,
  ApexFill, ApexMarkers, ApexGrid, ApexLegend, ApexTooltip, ApexTheme,
  NgxApexchartsModule, ApexAnnotations,
  ChartComponent
} from 'ngx-apexcharts';
import * as L from 'leaflet';
import { LoggerDataService } from '../../../service/logger-data.service';
import { WebSocketMessage, WebSocketService } from '../../../service/websocket.service';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { EventService } from '../../../service/event.service';
import { ResetWarningLoggerComponent } from '../dashboard/reset-warning-logger/reset-warning-logger.component';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { APP_CONFIG, getApiWebSocket, getMapCenterForCircuit } from '../../../app.config';
import { DataProcessingService } from '../../../service/data-processing.service';
import { convertTelemetryToSvgPolyline, TelemetryPoint as SvgTelemetryPoint, TelemetryToSvgInput } from '../../../utility/gps-to-svg.util';
import { NgZone } from '@angular/core';
// deck.gl imports
import { Map as MapLibreMap } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { LineLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';

// ===== Unified Telemetry Data Model =====
type TelemetryPoint = {
  loggerId: string;
  ts: number;        // epoch ms
  x: number; y: number;
  afr?: number;
  rpm?: number;
  velocity?: number;
  // Note: raw payloads are NOT stored to keep memory usage low
};

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
// สเกลสี: ถ้าน้อยกว่า limit => แดง (0°), ถ้ามากกว่าหรือเท่ากับ limit => เขียว (120°)
function afrToColor(v:number, min:number, max:number, limit?:number){
  // ถ้ามี limit และค่า AFR น้อยกว่า limit ให้เป็นสีแดง
  if (limit !== undefined && v < limit) {
    return hslToHex(0, 1, 0.5);  // สีแดง (hue = 0°)
  }
  // ถ้าไม่มี limit หรือค่ามากกว่าหรือเท่ากับ limit ให้ใช้สเกลตามปกติ (เขียว)
  const t = clamp01((v - min) / Math.max(1e-9, max - min));
  const hue = 120*(1 - t);        // 120 → 0
  return hslToHex(hue, 1, 0.5);   // s=100%, l=50%
}


// incremental laps state (non-breaking)
interface LapState {
  laps: MapPoint[][];           // completed laps
  current: MapPoint[];           // current lap being built
  state: 'outside' | 'inside';   // state machine state
  lastCrossMs: number;           // timestamp of last lap cross
  canCountAgain: boolean;        // can count new lap
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
  loggerStatus : string = 'Offline';

  afr: number = 0;
  countDetect: number = 0;
  afrAverage: number = 0;
  raceLab: MapPoint[][] = [];         // ผลลัพธ์รอบ
  startLatLongPoint?: { lat: number; lon: number }; // ตัวกลางเก็บจุด start
  lapCount?: number= 0;
  private wsReconnectTimeout:any;
  private wsReconnectDelay = 3000; // ms
  private statusTimeout: any = null; // Timer สำหรับเช็ค status offline หลังจาก 5 วินาที
  private readonly STATUS_TIMEOUT_MS = 5000; // 5 วินาที

  // Lap split tuning
  private readonly ENTER_RADIUS_M = 30;   // เข้าในรัศมีนี้ = ตัดรอบได้
  private readonly START_RADIUS_UNITS  = 30;   // ต้องออก ≥ นี้ก่อน ถึงนับรอบถัดไป
  private readonly MIN_LAP_GAP_MS = 5000; // กันเด้งซ้ำ
  private readonly MIN_SPEED_MS   = 0;    // กันนับตอนช้ามาก/จอด (0 = ปิด)

  activeKey: string | null = null;  // เช่น 'race1'
  lapStats: Array<{ lap: number; start: number; end: number; durationMs: number; count?: number }> = [];


  // private currentMapPoints: Array<{ ts: number; x: number; y: number; afr: number }> = [];

  clickedPointState: {
    seriesIndex: number;
    dataPointIndex: number;
    timestamp: number;
  } | null = null;

  get isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  //--- Chart ------
  @ViewChild('selectButton', { read: ElementRef }) selectButtonEl!: ElementRef<HTMLElement>;
  @ViewChild('select') select!: MatSelect;
  @ViewChild('chart') chart!: ChartComponent;
  chartsReady = false;

  private isSyncingRace  = false;

  @ViewChild('mapSvg') mapSvgEl!: ElementRef<SVGElement>;
  @ViewChild('hoverCircle') hoverCircleEl?: ElementRef<SVGCircleElement>;

  private scaleX = 1;
  private scaleY = 1;

  // การหมุนและกลับด้าน SVG
  svgRotation = 0; // องศาการหมุน (0-360) - จะตั้งค่าเริ่มต้นตาม circuitName
  svgFlipHorizontal = false; // กลับด้านแนวนอน - จะตั้งค่าเริ่มต้นตาม circuitName
  routeFlipHorizontal = false; // กลับด้านแนวนอน - จะตั้งค่าเริ่มต้นตาม circuitName
  svgFlipVertical = false; // กลับด้านแนวตั้ง

  tooltipStyle = {
    left: '0px',
    top: '0px',
    visibility: 'hidden' as 'hidden' | 'visible'
  };

  private fixedBoundsForBric: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null = null;

  private presetBoundsForRealtime: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null = null;

  /**
   * คำนวณ preset bounds จาก raw data ด้วยสูตรเดียวกับ initializeFixedBoundsForBric
   * ใช้ padding 10% เพื่อให้มีพื้นที่เพียงพอสำหรับการเดินทางต่อเนื่อง
   */
  private calculatePresetBoundsForRealtime(
    rawMinLat: number,
    rawMaxLat: number,
    rawMinLon: number,
    rawMaxLon: number
  ): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
    const padding = 0.10;
    const spanLat = Math.max(1e-9, rawMaxLat - rawMinLat);
    const spanLon = Math.max(1e-9, rawMaxLon - rawMinLon);

    return {
      minLat: rawMinLat - spanLat * padding,
      maxLat: rawMaxLat + spanLat * padding,
      minLon: rawMinLon - spanLon * padding,
      maxLon: rawMaxLon + spanLon * padding
    };
  }

  private initializeFixedBoundsForBric(all: Array<{lat: number; lon: number}>) {
    if (this.fixedBoundsForBric) return; // ถ้ามี bounds แล้ว ไม่ต้องตั้งใหม่

    if (all.length < 2) return;

    const lats = all.map(p => p.lat);
    const lons = all.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const padding = 0.10;
    const spanLat = Math.max(1e-9, maxLat - minLat);
    const spanLon = Math.max(1e-9, maxLon - minLon);

    this.fixedBoundsForBric = {
      minLat: minLat - spanLat * padding,
      maxLat: maxLat + spanLat * padding,
      minLon: minLon - spanLon * padding,
      maxLon: maxLon + spanLon * padding
    };

    console.log('Initialized fixed bounds for bric:', this.fixedBoundsForBric);
  }


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

  svgPtsByKey: Record<string, Array<{ x:number; y:number; lat:number; long:number; afr?:number }>> = {};

  tip = { visible: false, x: 0, y: 0, afr: NaN as number, lat: NaN as number, lon: NaN as number, key: '' };
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

  // performance: batched realtime UI flush
  private readonly rtBatch$ = new Subject<{ key: string; point: MapPoint }>();
  private rtBatchSubscription?: Subscription;
  private readonly BATCH_INTERVAL_MS = 100; // 80-120ms range, using 100ms

  // incremental laps state (non-breaking)
  private lapStateByKey: Record<string, LapState> = {};
  private cachedBoundsByKey: Record<string, {
    minLat: number; maxLat: number;
    minLon: number; maxLon: number;
    minAfr?: number; maxAfr?: number;
    pointCount: number;
  }> = {};

  // ปรับรัศมีนับรอบ (หน่วยเดียวกับข้อมูล CSV: เมตรจำลอง)
  lapRadiusUnits: number = this.START_RADIUS_UNITS;
  setLapRadiusUnits(units: number) {
    const u = Number(units);
    this.lapRadiusUnits = Number.isFinite(u) && u > 0 ? u : this.START_RADIUS_UNITS;
  }


  allLogger: CarLogger[] = [];
  wsLoggerData: CarLogger[] = [];

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

  // ===== deck.gl + MapLibre GL JS Configuration =====
  // Constants for performance tuning
  private readonly WINDOW_MS = 30 * 60 * 1000; // 30 minutes rolling window
  private readonly INPUT_HZ = 60; // Expected input frequency
  private readonly MAX_POINTS = Math.ceil(this.INPUT_HZ * (this.WINDOW_MS / 1000) * 1.2); // ~108,000 points with 20% headroom
  private readonly MAX_SEGS = this.MAX_POINTS - 1; // Segments = points - 1
  private readonly LINE_WIDTH_PX = 2; // Adjustable line width
  private readonly MARKER_RADIUS_PX = 4; // Adjustable marker radius

  // ===== Chart Performance Constants =====
  // Chart resampling: 5Hz display (200ms buckets) for smooth rendering
  private readonly CHART_BUCKET_MS = 200; // 200ms = 5Hz display rate
  private readonly CHART_WINDOW_MS = 30 * 60 * 1000; // 30 minutes rolling window for chart
  private readonly CHART_UPDATE_MS = 150; // Chart update throttle (100-200ms range)
  // Expected chart points: 30min * 60s * 5Hz = 9,000 points
  private readonly CHART_MAX_DISPLAY_POINTS = Math.ceil((this.CHART_WINDOW_MS / this.CHART_BUCKET_MS) * 1.1); // ~9,900 with 10% headroom

  // ===== Map Performance Constants =====
  private readonly MAP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes rolling window for map
  private readonly MAP_PATH_FPS = 25; // Path layer update rate (20-30fps range)
  private readonly MAP_PATH_UPDATE_MS = 1000 / this.MAP_PATH_FPS; // ~40ms per update

  // deck.gl map and overlay
  private deckMap: MapLibreMap | null = null;
  private deckOverlay: MapboxOverlay | null = null;
  @ViewChild('raceMapDeck') raceMapDeckRef!: ElementRef<HTMLDivElement>;
  @ViewChild('raceMapCanvas') raceMapCanvasRef!: ElementRef<HTMLCanvasElement>;
  private raceMapCanvasCtx: CanvasRenderingContext2D | null = null;
  useCanvasMode = false; // true = canvas (no map), false = deck.gl map (exposed for template)

  // Ring buffer for high-performance data storage (typed arrays)
  private ringBufferHead = 0; // Current write position
  private ringBufferTail = 0; // Oldest valid position (for 30min window)
  private ringBufferCount = 0; // Number of valid points in buffer
  private sourcePositions: Float32Array; // [lng, lat, lng, lat, ...] for segment sources
  private targetPositions: Float32Array; // [lng, lat, lng, lat, ...] for segment targets
  private segmentColors: Uint8Array; // [r, g, b, a, r, g, b, a, ...] RGBA per segment
  private pointTimestamps: Float64Array; // Timestamps for each point (for trimming)
  private latestMarkerLngLat: [number, number] | null = null; // Latest position for marker

  // Render state
  private deckDirty = false; // Flag to indicate data changed
  private deckRafId: number | null = null; // requestAnimationFrame ID

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
        selection: { enabled: true }, // เปิดใช้งานการเลือกช่วง (สำหรับ brush)
        zoom: { enabled: true, type: 'x', autoScaleYaxis: true }, // เปิดใช้งาน zoom
        // @ts-expect-error - pan property exists in ApexCharts but not in TypeScript types
        pan: { enabled: true, type: 'x' }, // เปิดใช้งานการลากกราฟ (panning)
        events: {
          mouseMove: (event, chartContext, config) => {
            // บน touch device (iPad/Tablet) ไม่มี mouseMove event - ใช้เฉพาะ dataPointSelection
            if (this.isTouchDevice) {
              return;
            }

            // ถ้ามีจุดที่ถูกคลิกอยู่แล้ว ไม่ต้องอัปเดต hover จาก mouse move
            if (this.clickedPointState) {
              return;
            }

            const dataPointIndex = config.dataPointIndex;
            const seriesIndex = config.seriesIndex;

            if (dataPointIndex > -1 && seriesIndex > -1) {
              this.showHoverForDataPoint(seriesIndex, dataPointIndex, chartContext);
            }
            this.cdr.detectChanges();
          },
          mouseLeave: () => {
            // บน touch device ไม่มี mouseLeave event
            if (this.isTouchDevice) {
              return;
            }

            // ถ้ามีจุดที่ถูกคลิกอยู่แล้ว ไม่ซ่อน hover
            if (this.clickedPointState) {
              return;
            }
            this.tooltipStyle.visibility = 'hidden';
            this.cdr.detectChanges();
          },
          dataPointSelection: (event: any, chartContext: any, config: any) => {
            // Event นี้ทำงานได้ทั้ง mouse และ touch (iPad/Tablet)
            const dataPointIndex = config.dataPointIndex;
            const seriesIndex = config.seriesIndex;

            if (dataPointIndex > -1 && seriesIndex > -1) {
              const w: any = (chartContext as any)?.w ?? (config as any)?.w;
              const seriesCfg = w?.config?.series?.[seriesIndex];
              const seriesData = Array.isArray(seriesCfg?.data) ? seriesCfg.data : undefined;
              const pointOnChart: any = seriesData ? seriesData[dataPointIndex] : undefined;

              if (pointOnChart && (pointOnChart.x != null || pointOnChart.t != null || pointOnChart.time != null)) {
                const timestamp = pointOnChart.x ?? pointOnChart.t ?? pointOnChart.time;

                // ตรวจสอบว่าคลิก/tap ที่จุดเดียวกันอีกครั้ง (toggle off)
                if (this.clickedPointState &&
                    this.clickedPointState.seriesIndex === seriesIndex &&
                    this.clickedPointState.dataPointIndex === dataPointIndex) {
                  // คลิก/tap ซ้ำ -> ยกเลิกการเลือก
                  this.clickedPointState = null;
                  this.tooltipStyle.visibility = 'hidden';
                } else {
                  // คลิก/tap ที่จุดใหม่ -> แสดง hover และเก็บ state
                  this.clickedPointState = {
                    seriesIndex,
                    dataPointIndex,
                    timestamp
                  };
                  this.showHoverForDataPoint(seriesIndex, dataPointIndex, chartContext);
                }
              }
            }
            this.cdr.detectChanges();
          },
        }
      },
      xaxis: {
        type: 'datetime',
        axisBorder: { color: PAL.axis },
        axisTicks: { color: PAL.axis },
        labels: { style: { colors: PAL.textMuted } }
      },
      yaxis: {
        reversed: true,
        min: 0,
        max: 30,
        labels: {
          formatter: (val: number) => {
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
      markers: {
        size: 0,
        hover: {
          size: 6, // ขนาด marker เมื่อ hover
          sizeOffset: 2
        }
      },
      colors: PAL.series,
      grid: { borderColor: PAL.grid, strokeDashArray: 3 },
      fill: { type: 'gradient', gradient: { shade: 'dark' } },
      tooltip: {
        theme: 'dark',
        fillSeriesColor: false,
        custom: ({ series, seriesIndex, dataPointIndex, w }: any) => {
          if (dataPointIndex < 0 || seriesIndex < 0) {
            return '';
          }

          const seriesCfg = w?.config?.series?.[seriesIndex];
          if (!seriesCfg || !Array.isArray(seriesCfg.data)) {
            return '';
          }

          const pointOnChart = seriesCfg.data[dataPointIndex];
          if (!pointOnChart) {
            return '';
          }

          const timestamp = pointOnChart.x ?? pointOnChart.t ?? pointOnChart.time;
          if (!timestamp) {
            return '';
          }

          // หาจุดที่ใกล้ที่สุดจากแผนที่
          const closestMapPoint = (this.currentMapPoints?.length ? this.currentMapPoints : []).reduce((prev, curr) =>
            Math.abs(curr.ts - timestamp) < Math.abs(prev.ts - timestamp) ? curr : prev
          , this.currentMapPoints?.[0] ?? { ts: timestamp, x: 0, y: 0, afr: 0 });

          const afrFromSeries = pointOnChart.y !== null && pointOnChart.y !== undefined
            ? pointOnChart.y
            : null;

          const seriesName = seriesCfg?.name || `Series ${seriesIndex + 1}`;
          const value = series[seriesIndex]?.[dataPointIndex];
          const timeStr = new Date(timestamp).toLocaleTimeString();

          let tooltipHTML = `
            <div style="padding: 8px 12px;">
              <div style="font-weight: 600; margin-bottom: 4px;">${seriesName}: <span style="color: ${seriesCfg.color || '#fff'};">${value !== undefined ? value.toFixed(2) : 'N/A'}</span></div>
              <div style="font-size: 11px; color: #aaa; margin-bottom: 2px;">Time: ${timeStr}</div>
          `;

          if (closestMapPoint && (closestMapPoint.x !== 0 || closestMapPoint.y !== 0)) {
            const transformedPoint = this.applyTransform({ x: closestMapPoint.x, y: closestMapPoint.y });

            tooltipHTML += `
              <div style="font-size: 11px; color: #aaa; margin-bottom: 2px;">Original: (${closestMapPoint.x.toFixed(1)}, ${closestMapPoint.y.toFixed(1)})</div>
              <div style="font-size: 11px; color: #4FC3F7;">Transformed: (${transformedPoint.x.toFixed(1)}, ${transformedPoint.y.toFixed(1)})</div>
            `;

            if (afrFromSeries !== null && !isNaN(afrFromSeries)) {
              tooltipHTML += `<div style="font-size: 11px; color: #00E5A8; margin-top: 4px;">AFR: ${afrFromSeries.toFixed(2)}</div>`;
            } else if (closestMapPoint.afr !== undefined) {
              tooltipHTML += `<div style="font-size: 11px; color: #00E5A8; margin-top: 4px;">AFR: ${closestMapPoint.afr.toFixed(2)}</div>`;
            }
          }

          tooltipHTML += `</div>`;
          return tooltipHTML;
        }
      },
      legend: { show: true, position: 'bottom', labels: { colors: PAL.textMuted } },
      theme: { mode: 'dark' }
  };


  svgPoints = '';
  startPoint = { x: 0, y: 0, lat: 0, long: 0 };
  endPoint = { x: 0, y: 0, lat: 0, long: 0 };

  telemetrySvgPolyline: string = '';

  polyTransCsvform = '';
  startPointCsv: XY = { x: 0, y: 0 };
  endPointCsv: XY = { x: 0, y: 0 };

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
        zoom: { enabled: false },            // ปิด zoom ใน brush chart
        // @ts-expect-error - pan property exists in ApexCharts but not in TypeScript types
        pan: { enabled: true, type: 'x' },  // เปิดใช้งานการลากกราฟ (panning)
        background: 'transparent',
        foreColor: PAL.text
      },
      xaxis: {
        type: 'datetime',
        labels: { show: false }, axisTicks: { show: false }, axisBorder: { show: false }
      },
      yaxis: {
        reversed: true,
        min: 0,
        max: 30,
        labels: { show: false }
      },
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
    console.log('splitIntoLapsArray called with', points.length, 'points');
    if (!points?.length) return [];

    // 1) เลือก/สร้าง startLatLongPoint ถ้ายังไม่มี
    if (!this.startLatLongPoint) {
      console.log('No start point found, using first valid point');
      for (const p of points) {
        const lat = this.num(p.lat), lon = this.num(p.lon);
        if (lat!=null && lon!=null) {
          this.startLatLongPoint = { lat, lon };
          console.log('Auto-selected start point:', this.startLatLongPoint);
          break;
        }
      }
      if (!this.startLatLongPoint) {
        console.log('No valid start point found, returning all points as single lap');
        return [points.slice()];
      }
    } else {
      console.log('Using existing start point:', this.startLatLongPoint);
    }

    // 2) ตัดสินใจว่าจะใช้ Haversine หรือ Euclidean
    const first = points.find(p => this.num(p.lat)!=null && this.num(p.lon)!=null);
    const useDegrees = first
      ? this.isLatLon(first)
      : false;

    const distMeters = (lat:number, lon:number) =>
      useDegrees
        ? this.haversineMeters({lat,lon}, this.startLatLongPoint!)
        : this.distanceMetersOrUnits({lat,lon}, this.startLatLongPoint!);

    // 3) เรียงตามเวลา
    const data = points.slice().sort((a,b)=>this.toMillis(a.ts)-this.toMillis(b.ts));

    // 4) state machine + hysteresis
    const laps: MapPoint[][] = [];
    let curr: MapPoint[] = [];
    let state: 'outside'|'inside' = 'outside';
    let lastCrossMs = -Infinity;
    let canCountAgain = true;
    let lapCount = 0;

    console.log('Starting lap detection with ENTER_RADIUS_M:', this.ENTER_RADIUS_M, 'START_RADIUS_UNITS:', this.START_RADIUS_UNITS);

    for (const pt of data) {
      curr.push(pt);

      const lat = this.num(pt.lat), lon = this.num(pt.lon);
      if (lat==null || lon==null) continue;

      // กันนับตอนจอด (ถ้าตั้ง MIN_SPEED_MS > 0)
      if (this.MIN_SPEED_MS > 0 && typeof pt.velocity === 'number') {
        if (pt.velocity < this.MIN_SPEED_MS) continue;
      }

      const d   = distMeters(lat, lon);
      const now = this.toMillis(pt.ts);

      // ออกนอกโซน (≥ EXIT) → พร้อมนับครั้งเข้าใหม่
      if (d >= this.START_RADIUS_UNITS) {
        if (state === 'inside') {
          console.log('Exited start zone, distance:', d.toFixed(2));
        }
        state = 'outside';
        canCountAgain = true;
      }

      // เข้าขอบเขต (≤ ENTER) + เพิ่งอยู่นอก/เพิ่งพร้อมนับ + ห่างเวลาเพียงพอ
      if (d <= this.ENTER_RADIUS_M && state === 'outside' && canCountAgain) {
        if (now - lastCrossMs >= this.MIN_LAP_GAP_MS) {
          lapCount++;
          console.log(`Lap ${lapCount} detected! Distance: ${d.toFixed(2)}m, Time gap: ${(now - lastCrossMs)/1000}s`);

          // ปิด lap เดิม (ไม่รวม pt ปัจจุบันเพื่อไม่ให้ซ้ำ)
          if (curr.length > 1) {
            const done = curr.slice(0, -1);
            if (done.length) laps.push(done);
            console.log(`  - Completed lap ${lapCount-1} with ${done.length} points`);
          }
          // เริ่ม lap ใหม่ด้วย pt นี้
          curr = [pt];

          lastCrossMs = now;
          state = 'inside';
          canCountAgain = false; // จนกว่าจะออก ≥ EXIT
        }
      }
    }

    // เก็บ lap สุดท้าย
    if (curr.length) {
      laps.push(curr);
      console.log(`Final lap with ${curr.length} points`);
    }

    console.log(`Total laps detected: ${laps.length}`);

    // 5) อัปเดตสรุป lap
    this.lapStats = laps.map(
      (lap, i): { lap: number; start: number; end: number; durationMs: number; count: number } => {
        const start = this.toMillis(lap[0].ts);
        const end   = this.toMillis(lap[lap.length - 1].ts);
        return {
          lap: i + 1,
          start,
          end,
          durationMs: Math.max(0, end - start),
          count: lap.length,          // ★ เพิ่มฟิลด์นี้ให้ตรง type
        };
      }
    );

    this.lapCount = laps.length;

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

    // รีเซ็ต fixed bounds เมื่อเปลี่ยน race (สำหรับ bric)
    if (this.circuitName === 'bric') {
      this.fixedBoundsForBric = null;
    }

    this.recomputeLapsForKey(key);

    // สร้าง SVG polyline จาก telemetry points (first point centered)
    // this.generateTelemetrySvgFromDataKey(key, 800, 660, 40);

    const sel = [key];
    this.updateMapFromSelection?.(sel);
    this.updateChartsFromSelection?.(sel);
  }


  // ====== ตั้ง start ด้วยการคลิกบน SVG ======
  startPx?: { x:number; y:number };
  startPointPx?: { x:number; y:number };

  // ตัวแปรสำหรับแสดง lap ที่เลือก
  selectedLapIndex: number = 0; // แสดง lap แรก (index 0)
  showOnlySelectedLap: boolean = true; // แสดงเฉพาะ lap ที่เลือก

  private svgClientToLocal(evt: MouseEvent): {x:number;y:number} {
    const svg = (evt.currentTarget || evt.target) as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM()!.inverse());

    // แปลงพิกัดกลับ (reverse transform) เพื่อให้ตรงกับข้อมูลเดิม
    return this.reverseTransform({ x: local.x, y: local.y });
  }

  /**
   * แปลงพิกัดกลับ (reverse transform) จากพิกัดที่แสดงผลเป็นพิกัดเดิม
   * เพื่อให้การคลิกและ hover ตรงกับตำแหน่งที่แสดงผล
   */
  private reverseTransform(point: {x: number; y: number}): {x: number; y: number} {
    const viewBoxWidth = 800;
    const viewBoxHeight = 660;
    const centerX = viewBoxWidth / 2;
    const centerY = viewBoxHeight / 2;

    let x = point.x;
    let y = point.y;

    // ย้ายไปที่จุดกึ่งกลาง
    x -= centerX;
    y -= centerY;

    // Reverse: สะท้อนบน-ล่าง ก่อน (ถ้ามี)
    if (this.svgFlipVertical) {
      y = -y;
    }

    // Reverse: สะท้อนซ้าย-ขวา ก่อน (ถ้ามี)
    if (this.svgFlipHorizontal) {
      x = -x;
    }

    // Reverse: หมุนกลับ (ถ้ามี)
    if (this.svgRotation !== 0) {
      const angle = -this.svgRotation * (Math.PI / 180); // แปลงเป็นเรเดียนและกลับทิศ
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const newX = x * cos - y * sin;
      const newY = x * sin + y * cos;
      x = newX;
      y = newY;
    }

    // ย้ายกลับ
    x += centerX;
    y += centerY;

    return { x, y };
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
    // หยุดการ propagate ของ event เพื่อไม่ให้เกิดการคลิกซ้อน
    evt.stopPropagation();

    const local = this.svgClientToLocal(evt);
    console.log('Clicked at SVG coordinates:', local);

    // หาจุดที่ใกล้ที่สุดจากข้อมูลปัจจุบัน
    const nearest = this.findNearestMapPoint(local);
    if (!nearest) {
      console.log('No nearest point found');
      return;
    }

    console.log('Nearest point found:', nearest);

    // เก็บพิกัด SVG สำหรับแสดงผล
    this.startPx = { x: nearest.x, y: nearest.y };

    // ตรวจสอบและตั้งค่า selectedRaceKey ถ้ายังไม่มี
    if (!this.selectedRaceKey) {
      const availableKeys = Object.keys(this.allDataLogger || {});
      if (availableKeys.length > 0) {
        this.selectedRaceKey = availableKeys[0];
        console.log('Auto-selected race key:', this.selectedRaceKey);
      } else {
        console.log('No race data available');
        return;
      }
    }

    // หา MapPoint ที่สอดคล้องกับจุดที่คลิก
    const arr = this.allDataLogger?.[this.selectedRaceKey ?? ''] ?? [];
    let best: MapPoint | null = null, bestDt = Number.POSITIVE_INFINITY;

    for (const p of arr) {
      const dt = Math.abs(this.toMillis(p.ts) - nearest.ts);
      if (dt < bestDt) {
        bestDt = dt;
        best = p;
      }
    }

    if (best) {
      const ll = this.getLatLon(best);
      if (ll) {
        console.log('Setting start point to:', ll);
        this.setStartPoint(ll.lat, ll.lon);

        // ตั้งค่าให้แสดงเฉพาะ lap แรก
        this.selectedLapIndex = 0;
        this.showOnlySelectedLap = true;

        // คำนวณ lap และอัปเดต map + กราฟ
        this.recomputeLapsForKey(this.selectedRaceKey);
        console.log('Laps recomputed. Total laps:', this.lapCount);
      }
    } else {
      console.log('No matching MapPoint found');
    }
  }

  updateMapWithSelectedLap() {
    console.log('updateMapWithSelectedLap called');
    console.log('raceLab length:', this.raceLab?.length || 0);
    console.log('showOnlySelectedLap:', this.showOnlySelectedLap);
    console.log('selectedLapIndex:', this.selectedLapIndex);

    if (!this.raceLab || this.raceLab.length === 0) {
      console.log('No laps available to display');
      return;
    }

    if (this.showOnlySelectedLap && this.selectedLapIndex < this.raceLab.length) {
      const selectedLap = this.raceLab[this.selectedLapIndex];
      console.log(`Displaying lap ${this.selectedLapIndex + 1} with ${selectedLap.length} points`);

      this.buildMapFromSingleLap(selectedLap, this.selectedRaceKey!);
      this.buildChartFromSingleLap(selectedLap);
    } else {
      console.log('Displaying all laps');
      this.buildMapFromLaps(this.raceLab, this.selectedRaceKey!);
      this.buildChartsFromLaps(this.raceLab);
    }
  }

  private currentLapDataForChart: MapPoint[] | null = null;
  private currentLapsDataForChart: MapPoint[][] | null = null;

  private buildMapFromSingleLap(lap: MapPoint[], key: string) {
    this.currentLapDataForChart = lap;
    this.currentLapsDataForChart = null;
    const all = lap.map(p => this.getLatLon(p)).filter((v): v is {lat:number;lon:number} => !!v);
    if (!all.length) {
      this.segmentsByKey = { ...(this.segmentsByKey ?? {}), [key]: [] };
      this.currentMapPoints = [];
      return;
    }

    const minLat = Math.min(...all.map(v => v.lat));
    const maxLat = Math.max(...all.map(v => v.lat));
    const minLon = Math.min(...all.map(v => v.lon));
    const maxLon = Math.max(...all.map(v => v.lon));

    // สำหรับ bric ใช้ padding เพื่อให้แสดงผลดีขึ้นเมื่อค่าพิกัดแตกต่างจาก bsc
    const padding = this.circuitName === 'bric' ? 0.05 : 0.02;
    const spanLat = Math.max(1e-9, maxLat - minLat);
    const spanLon = Math.max(1e-9, maxLon - minLon);
    const paddedSpanLat = spanLat * (1 + 2 * padding);
    const paddedSpanLon = spanLon * (1 + 2 * padding);
    const paddedMinLat = minLat - spanLat * padding;
    const paddedMinLon = minLon - spanLon * padding;

    const toX = (lon:number) => {
      // ตรวจสอบและป้องกันการหารด้วย 0 หรือค่าที่ไม่ถูกต้อง
      const normalizedX = paddedSpanLon > 0 ? (lon - paddedMinLon) / paddedSpanLon : 0.5;
      return Math.max(0, Math.min(this.SVG_W, normalizedX * this.SVG_W));
    };
    const toY = (lat:number) => {
      // ตรวจสอบและป้องกันการหารด้วย 0 หรือค่าที่ไม่ถูกต้อง
      const normalizedY = paddedSpanLat > 0 ? (lat - paddedMinLat) / paddedSpanLat : 0.5;
      return Math.max(0, Math.min(this.SVG_H, this.SVG_H - (normalizedY * this.SVG_H)));
    };

    const segs: Array<{ i:number;x1:number;y1:number;x2:number;y2:number;c:string;afr:number }> = [];
    let segIndex = 0;

    // สร้าง segments จาก lap เดียว
    for (let i = 1; i < lap.length; i++) {
      const a = lap[i-1], b = lap[i];
      const la = this.getLatLon(a); const lb = this.getLatLon(b);
      if (!la || !lb) continue;

      // ใช้การไล่ระดับสีจากค่า AFR
      const afrValue = Number.isFinite(b.afrValue as number) ? (b.afrValue as number) : NaN;
      const color = Number.isFinite(afrValue) ? this.getAfrColor(afrValue) : '#808080';

      segs.push({
        i: segIndex++,
        x1: toX(la.lon), y1: toY(la.lat), x2: toX(lb.lon), y2: toY(lb.lat),
        c: color,
        afr: afrValue
      });
    }

    const pointsXY: Array<{x:number;y:number;ts:number;afr:number}> = [];
    lap.forEach(p => {
      const ll = this.getLatLon(p);
      if (!ll) return;
      pointsXY.push({
        x: toX(ll.lon), y: toY(ll.lat),
        ts: this.toMillis(p.ts),
        afr: Number.isFinite(p.afrValue as number) ? (p.afrValue as number) : NaN
      });
    });

    this.segmentsByKey = { ...(this.segmentsByKey ?? {}), [key]: segs };
    this.currentMapPoints = pointsXY;
    this.showRoutePath = true;

    console.log(`Map updated for lap ${this.selectedLapIndex + 1}: ${segs.length} segments, ${pointsXY.length} points`);
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


  parameterRaceId:any = null;
  parameterSegment:any = null;
  parameterClass:any = null;
  parameterLoggerID:any = null;

  loggerID     = 0;
  carNumber    = '';
  firstName    = '';
  lastName     = '';
  classType    = '';
  segmentValue = '';
  seasonID     = 0;
  categoryName = '';
  sessionValue = '';
  circuitName = '';

  onlineLastTime: any;

  // ===== Mode Detection =====
  isHistoryMode: boolean = false;
  isRealtimeMode: boolean = true;

  // ===== Canvas Rendering =====
  @ViewChild('trackCanvas') trackCanvas!: ElementRef<HTMLCanvasElement>;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private pendingRender = false;
  private backgroundImage: HTMLImageElement | null = null;

  // ===== Realtime Buffering Configuration =====
  // Retention window: how long to keep data in memory (default: 1 hour)
  // This controls how much historical data is available for display/analysis
  private readonly REALTIME_RETENTION_MS = 60 * 60 * 1000; // 1 hour (configurable, e.g., 60 minutes)

  // Maximum buffer size: computed from expected Hz * retention time + headroom
  // Default: 60Hz * 3600s = 216,000 points, with 20% headroom = 259,200
  // This ensures we can handle 60Hz input for the full retention window
  private readonly REALTIME_EXPECTED_HZ = 60; // Expected input frequency
  private readonly REALTIME_MAX_BUFFER_POINTS = Math.ceil(
    this.REALTIME_EXPECTED_HZ * (this.REALTIME_RETENTION_MS / 1000) * 1.2 // 20% headroom
  ); // ~259,200 points for 60Hz * 1 hour

  // Legacy constants (mapped to new config for backward compatibility)
  private readonly MAX_BUFFER_SIZE = this.REALTIME_MAX_BUFFER_POINTS;
  private readonly MAX_BUFFER_TIME_MS = this.REALTIME_RETENTION_MS;

  // Chart update throttling to prevent excessive renders
  private chartUpdateThrottle = this.CHART_UPDATE_MS; // Use constant
  private lastChartUpdate = 0;
  private lastPathUpdate = 0; // For map path layer throttling

  // ===== Realtime Buffering (Ring Buffer) =====
  // Ring buffer for telemetry points (O(1) operations, no shift())
  private telemetryBuffer: TelemetryPoint[] = [];
  private telemetryBufferHead = 0; // Current write position
  private telemetryBufferTail = 0; // Oldest valid position
  private telemetryBufferCount = 0; // Number of valid points
  private readonly TELEMETRY_BUFFER_SIZE = Math.ceil(this.INPUT_HZ * (this.REALTIME_RETENTION_MS / 1000) * 1.2); // ~216,000 with 20% headroom

  // ===== Chart Display Buffer (5Hz Resampled) =====
  // Separate buffer for chart display (resampled to 5Hz)
  private chartDisplayBuffer: Array<{ ts: number; afr: number | null; avgAfr?: number; realtimeAfr?: number; warningAfr?: number; speed?: number }> = [];
  private chartDisplayHead = 0; // Current write position
  private chartDisplayTail = 0; // Oldest valid position
  private chartDisplayCount = 0; // Number of valid points
  private lastBucketTime = 0; // Last bucket timestamp for resampling
  private currentBucket: { ts: number; points: TelemetryPoint[] } | null = null; // Current 200ms bucket (5Hz)



  // ===== History Data =====
  private historyPoints: TelemetryPoint[] = [];
  private historyDownsampled: TelemetryPoint[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private toastr: ToastrService,
    private http: HttpClient,
    private eventService: EventService,
    private webSocketService: WebSocketService,
    private dataProcessingService: DataProcessingService,
    private ngZone: NgZone
  ) {
    // Mock start point for lap counting
    // this.setStartPoint(798.479,-6054.195);
    this.setstartLatLongPoint(798.451662,-6054.358584);
    this.loadAndApplyConfig();
    // this.setCurrentPoints(this.buildMock(180));

    // Initialize deck.gl ring buffer typed arrays
    this.sourcePositions = new Float32Array(this.MAX_SEGS * 2);
    this.targetPositions = new Float32Array(this.MAX_SEGS * 2);
    this.segmentColors = new Uint8Array(this.MAX_SEGS * 4);
    this.pointTimestamps = new Float64Array(this.MAX_POINTS);

    // Initialize telemetry ring buffer
    this.telemetryBuffer = new Array(this.TELEMETRY_BUFFER_SIZE);
    this.chartDisplayBuffer = new Array(this.CHART_MAX_DISPLAY_POINTS);
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

  ngOnInit() {
    // ===== Mode Detection from URL =====
    const statusRace = this.route.snapshot.queryParamMap.get('statusRace') ?? 'realtime';
    this.isHistoryMode = statusRace === 'history';
    this.isRealtimeMode = !this.isHistoryMode;

    this.parameterRaceId  = Number(this.route.snapshot.queryParamMap.get('raceId') ?? 0);
    this.parameterSegment = this.route.snapshot.queryParamMap.get('segment') ?? '';
    this.parameterClass   = this.route.snapshot.queryParamMap.get('class') ?? '';
    this.parameterLoggerID   = this.route.snapshot.queryParamMap.get('loggerId') ?? '';
    this.circuitName   = this.route.snapshot.queryParamMap.get('circuitName') ?? '';

    // performance: batched realtime UI flush - initialize batch subscription
    this.rtBatchSubscription = this.rtBatch$.pipe(
      bufferTime(this.BATCH_INTERVAL_MS),
      filter(events => events.length > 0)
    ).subscribe(events => this.flushBatch(events));
    this.subscriptions.push(this.rtBatchSubscription);

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
    formControlWithInitial(this.filterRace)
      .pipe(filter((v): v is string => !!v))
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
      this.subscribeWebSocketMessages();
    }

  private subscribeWebSocketMessages() {
    this.webSocketService.message$.subscribe((message) => {
      let msgObj;

      if(!message){
        return;
      }

      try {
        msgObj = typeof message === 'string' ? JSON.parse(message) : message;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        msgObj = {};
      }
      if (msgObj.index !== undefined) {
        this.wsCurrentIndex = msgObj.index + 1;
        // process msgObj.data ตามเดิม (ถ้าต้องการ)
      }
    });
  }



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
          this.circuitName = detail.circuitName;

          if(!detail.onlineTime && !detail.disconnectTime){
            this.onlineLastTime = ""
          }else {
            const selectedDate = (new Date(detail.onlineTime) <= new Date(detail.disconnectTime) || detail.onlineTime == "")? new Date(detail.onlineTime): new Date(detail.disconnectTime);
            this.onlineLastTime = this.formatDateTime(selectedDate);
          }


          // ตั้งค่าเริ่มต้นของการหมุนและกลับด้านตาม circuitName
          this.initializeSvgTransformForCircuit();

          // โหลด background image สำหรับ canvas
          this.loadCanvasBackgroundImage();
          this.countDetect  = detail.countDetect;
          this.afr          = detail.afr;
          this.afrAverage   = detail.afrAverage;
          this.loggerStatus       = detail.status || 'Offline';

          // เริ่มโหลดข้อมูลหลังจากได้ข้อมูลจาก API แล้วเท่านั้น
          this.initializeDataLoading();

          // Initialize canvas after view init
          setTimeout(() => this.initializeCanvas(), 0);
        },
        error: (err) => console.error('getDetailLoggerInRace error:', err),
      });

  }

  private initializeDataLoading(): void {
    if (this.isHistoryMode) {
      this.loadHistoryData();
    } else {
      // Realtime mode with late join (2-minute backlog)
      // Initialize empty chart series for realtime mode
      this.initializeRealtimeChart();
      this.initializeRealtimeWithBacklog();
    }
  }

  // Initialize chart series for realtime mode
  private initializeRealtimeChart(): void {
    console.log('[Chart] Initializing realtime chart');
    this.detailOpts = {
      ...this.detailOpts,
      series: [{ name: 'AFR', type: 'line', data: [] }]
    };
    this.brushOpts = {
      ...this.brushOpts,
      series: [{ name: 'AFR', type: 'line', data: [] }]
    };
    this.cdr.markForCheck();
  }

  // ===== History Mode =====
  private async loadHistoryData(): Promise<void> {
    try {
      // Try to load from WebSocket history endpoint first
      const loggerId = this.parameterLoggerID || String(this.loggerID);
      if (loggerId) {
        this.webSocketService.connectHistory(`client_${loggerId}`, 0);
        this.webSocketService.historyPoint$.subscribe(point => {
          if (point) {
            let lat = Number(point.lat);
            let lon = Number(point.lon);

            // แปลงค่าที่ผิดปกติด้วยสูตร: lat ÷ 60, lon: abs(lon) ÷ 60
            // เช็คว่าค่า lat/lon ผิดปกติหรือไม่ (ค่าปกติ: lat อยู่ระหว่าง -90 ถึง 90, lon อยู่ระหว่าง -180 ถึง 180)
            if (lat > 90 || lat < -90) {
              // ค่าผิดปกติ ให้หาร 60 ตรงๆ
              lat = lat / 60;
            }

            if (lon > 180 || lon < -180) {
              // ค่าผิดปกติ ให้ใช้ abs() ก่อน แล้วค่อยหาร 60
              // ตัวอย่าง: abs(-6060.505452) ÷ 60 = 101.008424
              lon = Math.abs(lon) / 60;
            }

            const tp: TelemetryPoint = {
              loggerId: loggerId,
              ts: point.ts,
              x: lat,
              y: lon,
              afr: point.afrValue,
              velocity: point.velocity
              // Note: raw payload is NOT stored to keep memory usage low
            };
            this.historyPoints.push(tp);
            // Downsample for display
            if (this.historyPoints.length % 10 === 0) {
              this.downsampleHistory();
            }
          }
        });
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  // ===== Realtime Mode with Late Join =====
  private realtimeWS: WebSocket | null = null;

  private initializeRealtimeWithBacklog(): void {
    const loggerId = this.parameterLoggerID || String(this.loggerID);
    if (!loggerId) return;

    // Connect with tail_ms=120000 for 2-minute backlog
    // Use wrap=1 for standardized message format (batch type)
    const base = typeof location !== 'undefined'
      ? `${APP_CONFIG.API.URL_SOCKET_LOCAL}`
      : APP_CONFIG.API.URL_SOCKET_SERVER.replace(/^http/, 'ws');
    const url = `${base}/ws/realtime?logger=client_${loggerId}&tail_ms=120000&wrap=1`;

    try {
      const ws = new WebSocket(url);
      this.realtimeWS = ws;

      ws.onopen = () => {
        console.log('[Realtime] Connected with backlog:', url);
        // Set status to Online when connected
        if (this.loggerStatus !== 'Online') {
          this.loggerStatus = 'Offline';
          this.cdr.detectChanges();
          console.log('[Logger Status] Updated to Online (WebSocket connected)');
        }
        // Start status timeout monitoring
        this.resetStatusTimeout();
      };
      ws.onmessage = (ev) => {
        console.log('[Realtime] Received message, length:', ev.data?.length || 0);
        this.handleRealtimeMessage(ev.data, loggerId);
      };
      ws.onclose = (e) => {
        console.log('[Realtime] Closed:', e.code, e.reason);
        this.realtimeWS = null;
        // Set status to Offline when disconnected
        if (this.loggerStatus !== 'Offline') {
          this.loggerStatus = 'Offline';
          this.cdr.detectChanges();
          console.log('[Logger Status] Updated to Offline (WebSocket disconnected)');
        }
        this.clearStatusTimeout();
        // Reconnect logic if needed
        if (!this.isHistoryMode) {
          setTimeout(() => this.initializeRealtimeWithBacklog(), 3000);
        }
      };
      ws.onerror = (err) => {
        console.error('[Realtime] Error:', err);
        // Set status to Offline on error
        if (this.loggerStatus !== 'Offline') {
          this.loggerStatus = 'Offline';
          this.cdr.detectChanges();
          console.log('[Logger Status] Updated to Offline (WebSocket error)');
        }
      };
    } catch (err) {
      console.error('Failed to connect realtime:', err);
      this.loggerStatus = 'Offline';
      this.cdr.detectChanges();
    }
  }

  // ===== Realtime Message Handler =====
  private handleRealtimeMessage(data: string, loggerId: string): void {
    try {
      let payload: any = JSON.parse(data);
      console.log('[Realtime] Message type:', payload.type, 'has items:', !!payload.items, 'has points:', !!payload.points);

      // Update status to Online when receiving data
      if (this.loggerStatus !== 'Online') {
        this.loggerStatus = 'Offline';
        this.cdr.detectChanges();
        console.log('[Logger Status] Updated to Online (data received)');
      }

      // Reset status timeout when receiving data
      this.resetStatusTimeout();

      // Handle snapshot (backlog)
      if (payload.type === 'snapshot' && Array.isArray(payload.items)) {
        console.log('[Realtime] Processing snapshot with', payload.items.length, 'items');
        payload.items.forEach((item: any) => {
          this.addTelemetryPoint(this.parseTelemetryPoint(item, loggerId));
        });
        return;
      }

      // Handle batch (wrapped format)
      if (payload.type === 'batch' && Array.isArray(payload.items)) {
        console.log('[Realtime] Processing batch with', payload.items.length, 'items');
        payload.items.forEach((item: any) => {
          this.addTelemetryPoint(this.parseTelemetryPoint(item, loggerId));
        });
        return;
      }

      // Handle race_tick (backward compatible format)
      if (payload.type === 'race_tick' && Array.isArray(payload.points)) {
        console.log('[Realtime] Processing race_tick with', payload.points.length, 'points');
        payload.points.forEach((item: any) => {
          this.addTelemetryPoint(this.parseTelemetryPoint(item, loggerId));
        });
        return;
      }

      // Handle tick (single update)
      if (payload.type === 'tick' && payload.item) {
        console.log('[Realtime] Processing tick');
        this.addTelemetryPoint(this.parseTelemetryPoint(payload.item, loggerId));
        return;
      }

      // Handle batch array (raw array format)
      if (Array.isArray(payload)) {
        console.log('[Realtime] Processing array with', payload.length, 'items');
        payload.forEach((item: any) => {
          this.addTelemetryPoint(this.parseTelemetryPoint(item, loggerId));
        });
        return;
      }

      // Handle single object (fallback)
      console.log('[Realtime] Processing single object');
      this.addTelemetryPoint(this.parseTelemetryPoint(payload, loggerId));
    } catch (err) {
      console.error('Failed to parse realtime message:', err, 'Data:', data?.substring(0, 200));
    }
  }

  private parseTelemetryPoint(payload: any, loggerId: string): TelemetryPoint {
    let lat = Number(payload.lat ?? payload.latitude);
    let lon = Number(payload.lon ?? payload.long ?? payload.longitude);

    // แปลงค่าที่ผิดปกติด้วยสูตร: lat ÷ 60, lon: abs(lon) ÷ 60
    // เช็คว่าค่า lat/lon ผิดปกติหรือไม่ (ค่าปกติ: lat อยู่ระหว่าง -90 ถึง 90, lon อยู่ระหว่าง -180 ถึง 180)
    if (lat > 90 || lat < -90) {
      // ค่าผิดปกติ ให้หาร 60 ตรงๆ
      lat = lat / 60;
    }

    if (lon > 180 || lon < -180) {
      // ค่าผิดปกติ ให้ใช้ abs() ก่อน แล้วค่อยหาร 60
      // ตัวอย่าง: abs(-6060.505452) ÷ 60 = 101.008424
      lon = Math.abs(lon) / 60;
    }

    const afr = payload.AFR != null ? Number(payload.AFR) : (payload.afr != null ? Number(payload.afr) : undefined);
    const rpm = payload.RPM != null ? Number(payload.RPM) : (payload.rpm != null ? Number(payload.rpm) : undefined);
    const velocity = payload.velocity != null ? Number(payload.velocity) : undefined;
    const timeVal = payload.timestamp ?? payload.time ?? Date.now();
    const ts = typeof timeVal === 'number'
      ? timeVal
      : (Number.isFinite(Number(timeVal)) ? Number(timeVal) : Date.parse(String(timeVal)) || Date.now());

    return {
      loggerId,
      ts,
      x: lat, // lat/lon are actually XY coordinates (converted if needed)
      y: lon,
      afr,
      rpm,
      velocity
      // Note: raw payload is NOT stored to keep memory usage low
    };
  }

  private addTelemetryPoint(point: TelemetryPoint): void {
    // Update status to Online when receiving data (only in realtime mode)
    if (this.isRealtimeMode && this.loggerStatus !== 'Online') {
      this.loggerStatus = 'Offline';
      this.cdr.detectChanges();
      console.log('[Logger Status] Updated to Online (telemetry point received)');
    }

    // Reset status timeout when receiving data
    if (this.isRealtimeMode) {
      this.resetStatusTimeout();
    }

    // Add to ring buffer (O(1) operation, no shift())
    const writeIdx = this.telemetryBufferHead;
    this.telemetryBuffer[writeIdx] = point;
    this.telemetryBufferHead = (this.telemetryBufferHead + 1) % this.TELEMETRY_BUFFER_SIZE;
    if (this.telemetryBufferCount < this.TELEMETRY_BUFFER_SIZE) {
      this.telemetryBufferCount++;
    } else {
      // Buffer full, advance tail (O(1))
      this.telemetryBufferTail = (this.telemetryBufferTail + 1) % this.TELEMETRY_BUFFER_SIZE;
    }

    // Trim buffer by time (O(1) per point, worst case O(N) but amortized O(1))
    const cutoff = Date.now() - this.MAX_BUFFER_TIME_MS;
    while (this.telemetryBufferCount > 0 && this.telemetryBuffer[this.telemetryBufferTail]?.ts < cutoff) {
      this.telemetryBufferTail = (this.telemetryBufferTail + 1) % this.TELEMETRY_BUFFER_SIZE;
      this.telemetryBufferCount--;
    }

    // Schedule render (throttled) - for Canvas (only if using canvas mode)
    if (this.isRealtimeMode && this.useCanvasMode) {
      this.scheduleRender();
    }

    // Ingest point into deck.gl ring buffer (separate from render, O(1) operation)
    // Only if using deck.gl map mode (not canvas mode)
    if (this.isRealtimeMode && !this.useCanvasMode) {
      this.deckIngestPoint(point);
    } else if (this.isRealtimeMode && this.useCanvasMode) {
      // For canvas mode, draw directly on canvas
      this.drawPointOnCanvas(point);
    }

    // Process point for chart resampling (5Hz pipeline)
    this.processChartResampling(point);

    // Update chart (throttled) - for ApexCharts
    const now = Date.now();
    const shouldUpdate = now - this.lastChartUpdate >= this.chartUpdateThrottle;

    if (shouldUpdate) {
      this.updateChartIncremental();
      this.lastChartUpdate = now;
    }
  }

  /**
   * Process telemetry point for chart resampling (5Hz pipeline)
   * Groups points into 200ms buckets and resamples to 5Hz display rate
   */
  private processChartResampling(point: TelemetryPoint): void {
    const bucketTime = Math.floor(point.ts / this.CHART_BUCKET_MS) * this.CHART_BUCKET_MS;

    // Initialize or update current bucket
    if (!this.currentBucket || this.currentBucket.ts !== bucketTime) {
      // Flush previous bucket if exists
      if (this.currentBucket && this.currentBucket.points.length > 0) {
        this.flushChartBucket(this.currentBucket);
      }

      // Start new bucket
      this.currentBucket = { ts: bucketTime, points: [point] };
    } else {
      // Add to current bucket
      this.currentBucket.points.push(point);
    }
  }

  /**
   * Flush a completed bucket to chart display buffer
   * Uses "last" value strategy (keep last point in bucket)
   */
  private flushChartBucket(bucket: { ts: number; points: TelemetryPoint[] }): void {
    if (bucket.points.length === 0) return;

    // Use last point in bucket (alternative: average, max, min)
    const lastPoint = bucket.points[bucket.points.length - 1];

    // Write to chart display ring buffer
    const writeIdx = this.chartDisplayHead;
    this.chartDisplayBuffer[writeIdx] = {
      ts: bucket.ts,
      afr: lastPoint.afr ?? null,
      avgAfr: lastPoint.afr ?? undefined,
      realtimeAfr: lastPoint.afr ?? undefined,
      warningAfr: lastPoint.afr ?? undefined,
      speed: lastPoint.velocity ?? undefined
    };

    this.chartDisplayHead = (this.chartDisplayHead + 1) % this.CHART_MAX_DISPLAY_POINTS;
    if (this.chartDisplayCount < this.CHART_MAX_DISPLAY_POINTS) {
      this.chartDisplayCount++;
    } else {
      // Buffer full, advance tail (O(1))
      this.chartDisplayTail = (this.chartDisplayTail + 1) % this.CHART_MAX_DISPLAY_POINTS;
    }

    // Trim old points outside 30-minute window (O(1) amortized)
    const cutoff = Date.now() - this.CHART_WINDOW_MS;
    while (this.chartDisplayCount > 0 && this.chartDisplayBuffer[this.chartDisplayTail]?.ts < cutoff) {
      this.chartDisplayTail = (this.chartDisplayTail + 1) % this.CHART_MAX_DISPLAY_POINTS;
      this.chartDisplayCount--;
    }
  }

  // ===== Canvas Rendering =====
  private loadCanvasBackgroundImage(): void {
    let imagePath = '';

    if (this.circuitName === 'bsc') {
      imagePath = 'images/map-race/imgBGBangsan-real.png';
    } else if (this.circuitName === 'bric') {
      imagePath = 'images/map-race/Track-Chang-International-Circuit-real.png';
    } else if (this.circuitName === 'bic') {
      imagePath = 'images/map-race/Bira-International-Circuit-real.jpg';
    }

    if (imagePath) {
      const img = new Image();
      img.onload = () => {
        this.backgroundImage = img;
        this.scheduleRender();
      };
      img.onerror = () => {
        console.warn(`[Canvas] Failed to load background image: ${imagePath}`);
        this.backgroundImage = null;
      };
      img.src = imagePath;
    } else {
      this.backgroundImage = null;
    }
  }

  private initializeCanvas(): void {
    if (!this.trackCanvas?.nativeElement) {
      console.warn('[Canvas] Canvas element not found, retrying...');
      // Retry after a short delay
      setTimeout(() => this.initializeCanvas(), 100);
      return;
    }

    const canvas = this.trackCanvas.nativeElement;
    this.canvasCtx = canvas.getContext('2d', { alpha: false });

    if (!this.canvasCtx) {
      console.error('[Canvas] Failed to get canvas context');
      return;
    }

    // Set canvas size to match container
    const container = canvas.parentElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width || 800;
      canvas.height = rect.height || 600;
      console.log(`[Canvas] Initialized with size: ${canvas.width}x${canvas.height}`);
    } else {
      // Fallback size
      canvas.width = 800;
      canvas.height = 600;
      console.log('[Canvas] Using fallback size: 800x600');
    }

    // Initial render
    this.scheduleRender();
  }

  /**
   * Schedule canvas render (legacy, only for canvas mode)
   * Disabled when using deck.gl map mode to avoid unnecessary rendering
   */
  private scheduleRender(): void {
    // Skip if using deck.gl map mode (not canvas mode)
    if (this.isRealtimeMode && !this.useCanvasMode) {
      return;
    }
    if (this.pendingRender || !this.canvasCtx) return;

    this.pendingRender = true;

    // Render outside Angular zone for performance
    this.ngZone.runOutsideAngular(() => {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }

      this.animationFrameId = requestAnimationFrame(() => {
        this.renderTrack();
        this.pendingRender = false;
      });
    });
  }

  private renderTrack(): void {
    if (!this.canvasCtx) {
      console.warn('[Canvas] No canvas context available');
      return;
    }

    const ctx = this.canvasCtx;
    const canvas = ctx.canvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image first (bottom layer)
    if (this.backgroundImage && this.backgroundImage.complete) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.backgroundImage, 0, 0, canvas.width, canvas.height);
    }

    // Get points to render (use buffer for realtime, history for history mode)
    // Note: For realtime mode, telemetryBuffer is now a ring buffer - need to extract valid points
    const points = this.isHistoryMode ? this.historyDownsampled : this.getTelemetryBufferPoints();

    if (points.length < 2) {
      // Draw placeholder text if no data
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Waiting for data... (${points.length} points)`, canvas.width / 2, canvas.height / 2);
      return;
    }

    console.log(`[Canvas] Rendering ${points.length} points`);

    // Ensure lines are drawn on top of background (top layer)
    ctx.globalCompositeOperation = 'source-over';

    // Calculate bounds - use preset bounds for 'bic' if available, otherwise calculate from data
    let minX: number, maxX: number, minY: number, maxY: number;

    if (this.circuitName === 'bic' && this.presetBoundsForRealtime) {
      // Use preset bounds for 'bic' circuit
      // minX = this.presetBoundsForRealtime.minLat;  // x = lat
      // maxX = this.presetBoundsForRealtime.maxLat;
      // minY = this.presetBoundsForRealtime.minLon;  // y = lon
      // maxY = this.presetBoundsForRealtime.maxLon;
      minX = 12.917735650000001;
      maxX = 12.923567383333332;
      minY = 101.01256463666667;
      maxY = 101.00549586333332;
      console.log(`[Canvas] Using preset bounds for 'bic':`, { minX, maxX, minY, maxY });

      // 12.9197441
      // 101.0091022
      // minX: 12.917006683333334, maxX: 12.924296349999999, minY: 101.01344823333334, maxY: 101.00461226666667

    } else {
      // Calculate bounds from actual data
      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      minX = Math.min(...xs);
      maxX = Math.max(...xs);
      minY = Math.min(...ys);
      maxY = Math.max(...ys);
    }

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const padding = 0.05;
    const paddedSpanX = spanX * (1 + 2 * padding);
    const paddedSpanY = spanY * (1 + 2 * padding);
    const paddedMinX = minX - spanX * padding;
    const paddedMinY = minY - spanY * padding;

    // Helper to convert data coords to canvas coords
    const toCanvasX = (dataX: number) => ((dataX - paddedMinX) / paddedSpanX) * canvas.width;
    const toCanvasY = (dataY: number) => canvas.height - ((dataY - paddedMinY) / paddedSpanY) * canvas.height;

    // Save context state before rotation (for 'bic' circuit only)
    ctx.save();

    // หมุน canvas -93 องศาสำหรับ 'bic' circuit (เฉพาะเส้นทาง ไม่หมุน background)
    if (this.circuitName === 'bic') {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(-93 * Math.PI / 180);
      ctx.translate(-centerX, -centerY);
    }

    // Draw path with color gradient based on AFR (on top of background)
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    let lastColor = '#808080';
    let lastX = 0, lastY = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = toCanvasX(p.x);
      const y = toCanvasY(p.y);

      if (i === 0) {
        ctx.moveTo(x, y);
        lastX = x;
        lastY = y;
      } else {
        // Get color for this segment
        const color = p.afr != null ? this.getAfrColor(p.afr) : '#808080';

        // If color changed, stroke previous segment and start new
        if (color !== lastColor && i > 1) {
          ctx.strokeStyle = lastColor;
          ctx.lineWidth = 1.5; // Increased line width for better visibility
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(lastX, lastY);
        }

        ctx.lineTo(x, y);
        lastColor = color;
        lastX = x;
        lastY = y;
      }
    }

    // Stroke final segment
    if (points.length > 0) {
      ctx.strokeStyle = lastColor;
      ctx.lineWidth = 3; // Increased line width for better visibility
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Restore context state (undo rotation)
    ctx.restore();

    // Draw current position marker (on top layer)
    if (points.length > 0) {
      ctx.save();

      // หมุน canvas -93 องศาสำหรับ 'bic' circuit (เหมือนกับเส้นทาง)
      if (this.circuitName === 'bic') {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(-93 * Math.PI / 180);
        ctx.translate(-centerX, -centerY);
      }

      ctx.globalCompositeOperation = 'source-over';
      const last = points[points.length - 1];
      const x = toCanvasX(last.x);
      const y = toCanvasY(last.y);

      // Draw current position marker (larger, more visible)
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#FF0000';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw info text near current position
      if (last.afr != null) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`AFR: ${last.afr.toFixed(2)}`, x + 12, y - 12);
      }

      ctx.restore();
    }
  }

  // ===== History Downsampling =====
  private downsampleHistory(): void {
    if (this.historyPoints.length === 0) return;

    // Downsample for track (5k-20k points)
    const trackMax = Math.min(20000, this.historyPoints.length);
    this.historyDownsampled = this.downsampleTelemetry(this.historyPoints, trackMax);

    // Trigger render
    this.scheduleRender();
  }

  private downsampleTelemetry(points: TelemetryPoint[], threshold: number): TelemetryPoint[] {
    if (threshold >= points.length || threshold === 0) return points;

    const sampled: TelemetryPoint[] = [];
    const every = (points.length - 2) / (threshold - 2);
    let a = 0;

    sampled.push(points[0]);

    for (let i = 0; i < threshold - 2; i++) {
      const avgRangeStart = Math.floor((i + 1) * every) + 1;
      const avgRangeEnd = Math.floor((i + 2) * every) + 1;
      const avgRangeLength = avgRangeEnd - avgRangeStart;

      let avgX = 0, avgY = 0;
      for (let j = avgRangeStart; j < avgRangeEnd && j < points.length; j++) {
        avgX += points[j].x;
        avgY += points[j].y;
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;

      const rangeOffs = Math.floor(i * every) + 1;
      const rangeTo = Math.floor((i + 1) * every) + 1;

      let maxArea = -1;
      let maxAreaPoint: TelemetryPoint | null = null;
      let nextA = rangeOffs;

      for (let j = rangeOffs; j < rangeTo && j < points.length; j++) {
        const area = Math.abs(
          (points[a].x - avgX) * (points[j].y - points[a].y) -
          (points[a].x - points[j].x) * (avgY - points[a].y)
        ) * 0.5;
        if (area > maxArea) {
          maxArea = area;
          maxAreaPoint = points[j];
          nextA = j;
        }
      }

      if (maxAreaPoint) {
        sampled.push(maxAreaPoint);
      }
      a = nextA;
    }

    sampled.push(points[points.length - 1]);
    return sampled;
  }

  // ===== Incremental Chart Update =====
  /**
   * Updates the chart with new telemetry data.
   *
   * IMPORTANT: When downsampling is applied (points.length > chartMax), we MUST rebuild
   * the entire series.data because the downsampled set changes over time. Appending
   * based on existingCount would cause data to disappear or freeze.
   *
   * Only use append-incremental mode when points.length <= chartMax (no downsampling).
   */
  /**
   * Update chart using resampled display buffer (5Hz)
   * Uses imperative update via ChartComponent API to avoid full rebuild
   */
  private updateChartIncremental(): void {
    // Use resampled display buffer (5Hz) instead of raw telemetry buffer
    const displayPoints = this.getChartDisplayPoints();
    if (displayPoints.length === 0) return;

    // Use imperative update via ChartComponent if available (more efficient)
    // Note: ApexCharts API uses updateSeries method (not appendSeries)
    if (this.chart?.chart) {
      try {
        // Build new data points from display buffer
        const newData: Array<{x: number; y: number | null}> = displayPoints.map(p => ({
          x: p.ts,
          y: p.afr ?? null
        }));

        // Use updateSeries for efficient update (ApexCharts API)
        // This is more efficient than full binding rebuild
        (this.chart.chart as any).updateSeries([{
          name: 'AFR',
          data: newData
        }], false); // false = don't animate

        // Update brush chart (last 1000 points)
        const brushData = newData.slice(-1000);
        // Note: Brush chart update handled separately if needed

        return; // Success, exit early
      } catch (err) {
        // Fallback to binding update if imperative update fails
        console.warn('[Chart] Imperative update failed, falling back to binding:', err);
      }
    }

    // Fallback: Use binding update (less efficient but reliable)
    const data: Array<{x: number; y: number | null}> = displayPoints.map(p => ({
      x: p.ts,
      y: p.afr ?? null
    }));

    this.detailOpts = {
      ...this.detailOpts,
      series: [{ name: 'AFR', type: 'line', data }]
    };

    // Update brush chart (last 1000 points)
    const brushData = data.slice(-1000);
    this.brushOpts = {
      ...this.brushOpts,
      series: [{ name: 'AFR', type: 'line', data: brushData }]
    };

    // Trigger change detection
    this.ngZone.run(() => {
      this.cdr.markForCheck();
    });
  }

  /**
   * Get telemetry buffer points from ring buffer (chronological order)
   * Returns points in chronological order for rendering/processing
   */
  private getTelemetryBufferPoints(): TelemetryPoint[] {
    if (this.telemetryBufferCount === 0) return [];

    const points: TelemetryPoint[] = [];

    if (this.telemetryBufferTail < this.telemetryBufferHead) {
      // No wrap: single contiguous segment
      for (let i = this.telemetryBufferTail; i < this.telemetryBufferHead; i++) {
        const p = this.telemetryBuffer[i];
        if (p) points.push(p);
      }
    } else {
      // Wrap-around: two segments
      // Part A: from tail to end of array
      for (let i = this.telemetryBufferTail; i < this.TELEMETRY_BUFFER_SIZE; i++) {
        const p = this.telemetryBuffer[i];
        if (p) points.push(p);
      }
      // Part B: from start of array to head
      for (let i = 0; i < this.telemetryBufferHead; i++) {
        const p = this.telemetryBuffer[i];
        if (p) points.push(p);
      }
    }

    return points;
  }

  /**
   * Get chart display points from ring buffer (5Hz resampled)
   * Returns points in chronological order
   */
  private getChartDisplayPoints(): Array<{ ts: number; afr: number | null }> {
    if (this.chartDisplayCount === 0) return [];

    const points: Array<{ ts: number; afr: number | null }> = [];

    if (this.chartDisplayTail < this.chartDisplayHead) {
      // No wrap: single contiguous segment
      for (let i = this.chartDisplayTail; i < this.chartDisplayHead; i++) {
        const p = this.chartDisplayBuffer[i];
        if (p) points.push({ ts: p.ts, afr: p.afr });
      }
    } else {
      // Wrap-around: two segments
      // Part A: from tail to end of array
      for (let i = this.chartDisplayTail; i < this.CHART_MAX_DISPLAY_POINTS; i++) {
        const p = this.chartDisplayBuffer[i];
        if (p) points.push({ ts: p.ts, afr: p.afr });
      }
      // Part B: from start of array to head
      for (let i = 0; i < this.chartDisplayHead; i++) {
        const p = this.chartDisplayBuffer[i];
        if (p) points.push({ ts: p.ts, afr: p.afr });
      }
    }

    return points;
  }

  // ===== History Text Parser =====
  parseHistoryText(text: string): TelemetryPoint[] {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Find [columnnames] and [data] sections
    const colStart = lines.findIndex(l => /^\[columnnames\]/i.test(l));
    const dataStart = lines.findIndex(l => /^\[data\]/i.test(l));

    if (colStart === -1 || dataStart === -1) return [];

    const headerLine = lines[colStart + 1];
    const headers = headerLine.split(',').map(h => h.trim().toLowerCase());

    const latIdx = headers.findIndex(h => ['lat', 'latitude', 'y'].includes(h));
    const lonIdx = headers.findIndex(h => ['long', 'longitude', 'lon', 'x'].includes(h));
    const afrIdx = headers.findIndex(h => ['afr', 'air-fuel ratio', 'afr_value'].includes(h));
    const velIdx = headers.findIndex(h => ['velocity', 'speed', 'v'].includes(h));
    const timeIdx = headers.findIndex(h => ['time', 'timestamp', 'gps_time', 'datetime'].includes(h));

    if (latIdx === -1 || lonIdx === -1) return [];

    const points: TelemetryPoint[] = [];
    const loggerId = this.parameterLoggerID || String(this.loggerID);

    for (let i = dataStart + 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < Math.max(latIdx, lonIdx) + 1) continue;

      let lat = parseFloat(cols[latIdx] ?? '');
      let lon = parseFloat(cols[lonIdx] ?? '');

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      // แปลงค่าที่ผิดปกติด้วยสูตร: lat ÷ 60, lon: abs(lon) ÷ 60
      // เช็คว่าค่า lat/lon ผิดปกติหรือไม่ (ค่าปกติ: lat อยู่ระหว่าง -90 ถึง 90, lon อยู่ระหว่าง -180 ถึง 180)
      if (lat > 90 || lat < -90) {
        // ค่าผิดปกติ ให้หาร 60 ตรงๆ
        lat = lat / 60;
      }

      if (lon > 180 || lon < -180) {
        // ค่าผิดปกติ ให้ใช้ abs() ก่อน แล้วค่อยหาร 60
        // ตัวอย่าง: abs(-6060.505452) ÷ 60 = 101.008424
        lon = Math.abs(lon) / 60;
      }

      const afr = afrIdx !== -1 ? parseFloat(cols[afrIdx] ?? '') : undefined;
      const velocity = velIdx !== -1 ? parseFloat(cols[velIdx] ?? '') : undefined;

      let ts = Date.now();
      if (timeIdx !== -1) {
        const timeVal = cols[timeIdx];
        if (timeVal) {
          const parsed = Date.parse(timeVal);
          if (Number.isFinite(parsed)) ts = parsed;
        }
      }

      points.push({
        loggerId,
        ts,
        x: lat,
        y: lon,
        afr,
        velocity
        // Note: raw payload is NOT stored to keep memory usage low
      });
    }

    return points;
  }

    clearWebSocketData(): void {
    this.webSocketService.clearLoggerData();
    this.wsLoggerData = [];
    this.allLogger = [];
    
    // Reset ring buffers
    this.telemetryBufferHead = 0;
    this.telemetryBufferTail = 0;
    this.telemetryBufferCount = 0;
    this.chartDisplayHead = 0;
    this.chartDisplayTail = 0;
    this.chartDisplayCount = 0;
    this.currentBucket = null;
    
    console.log('Cleared all WebSocket data and ring buffers');
  }


  // ===== WebSocket via service =====
  wsConnectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  loggerStatusList: Array<{ logger_key: string; status: string; last_seen?: string; data_count?: number; is_connected?: boolean }>=[];
  isWebSocketEnabled = false;
  private wsSubscriptions: Subscription[] = [];

  // เริ่มต้น WebSocket connection
  private initializeWebSocket(loggerId: string): void {
    console.log('MatchDetail: Initializing WebSocket connection for loggerId:', loggerId);

    // Subscribe to connection status
    const statusSub = this.webSocketService.connectionStatus$.subscribe(status => {
      this.wsConnectionStatus = status;
      if (status === 'disconnected') {
        this.tryReconnectWebSocket();
      } else if (status === 'connected' && this.wsReconnectTimeout) {
        clearTimeout(this.wsReconnectTimeout);
        this.wsReconnectTimeout = null;
      }
      console.log('MatchDetail: WebSocket status changed to:', status);
    });

    // Subscribe to logger data
    const dataSub = this.webSocketService.loggerData$.subscribe(data => {
      this.wsLoggerData = data;
      console.log('MatchDetail: Received WebSocket logger data, count:', data.length);

      // รวมข้อมูล WebSocket กับข้อมูลที่มีอยู่
      this.mergeWebSocketData();
    });

    // Subscribe to raw messages
    const messageSub = this.webSocketService.message$.subscribe(message => {
      if (message) {
        // console.log('MatchDetail: Received WebSocket message:', message);

        // ประมวลผลข้อมูล WebSocket และส่งไปยัง generateSVGPoints()
        this.processWebSocketMessage(message);
      }
    });

    // Subscribe to logger status updates
    const statusListSub = this.webSocketService.statusList$.subscribe(statusList => {
      if (statusList && Array.isArray(statusList)) {
        this.handleStatusUpdate(statusList);
      }
    });

    this.wsSubscriptions.push(statusSub, dataSub, messageSub, statusListSub);

    // เชื่อมต่อ WebSocket พร้อมส่ง loggerId
    this.connectWebSocket(loggerId);

    // เชื่อมต่อ WebSocket สำหรับ status
    this.webSocketService.connectStatus();

    // เริ่มต้น timer สำหรับเช็ค status offline
    this.resetStatusTimeout();
  }

    /**
   * ประมวลผลข้อมูล WebSocket และส่งไปยัง generateSVGPoints()
   */
  private processWebSocketMessage(message: WebSocketMessage): void {
    try {
      // เช็ค loggerId ปัจจุบันก่อน
      if (!this.currentLoggerId) return;
      // ตรวจสอบว่าเป็นข้อมูล sensor_data ของ loggerId ที่เลือก
      if (message.type === 'sensor_data:' + this.currentLoggerId && message.data) {
        const data = message.data as string;
        const parsedData = JSON.parse(data);

        // อัปเดต status ถ้ามีในข้อมูล
        if (parsedData.status && parsedData.logger_key) {
          const loggerKey = String(parsedData.logger_key);
          const currentLoggerKey = String(this.currentLoggerId);
          if (loggerKey === currentLoggerKey) {
            const status = (parsedData.status || '').toString().toLowerCase().trim();
            this.loggerStatus = status === 'online' ? 'Online' : 'Offline';
            this.cdr.detectChanges();
          }
        }

        if (parsedData.lat && parsedData.lon) {
          // รีเซ็ต timer เมื่อมีข้อมูลใหม่มา
          this.resetStatusTimeout();

          const loggerData: CarLogger = {
            sats: '12',
            time: parsedData.timestamp || new Date().toISOString(),
            lat: parsedData.lat,
            long: parsedData.lon,
            velocity: parseFloat(parsedData.AFR) || 0,
            heading: '0',
            height: '0',
            FixType: '3',
            accelX: '0',
            accelY: '0',
            accelZ: '0',
            accelSqrt: '0',
            gyroX: '0',
            gyroY: '0',
            gyroZ: '0',
            magX: '0',
            magY: '0',
            magZ: '0',
            mDirection: '0',
            Time_ms: Date.now().toString(),
            averageHeight: 0
          };
          this.allLogger.push(loggerData);
          console.log('ProcessWebSocketMessage. Total records:', this.allLogger.length);
          // อัปเดตข้อมูลแบบ real-time ให้กับแผนที่ SVG และกราฟ
          // ใช้ 'realtime' เป็น key เสมอเมื่อมีข้อมูลจาก WebSocket
          const key = 'realtime';
          // ตั้งค่า selectedRaceKey เป็น 'realtime' เพื่อให้ template แสดง segments ได้ถูกต้อง
          if (this.selectedRaceKey !== 'realtime') {
            this.selectedRaceKey = 'realtime';
          }
          const ts = typeof loggerData.time === 'string' && !isNaN(Date.parse(loggerData.time))
            ? new Date(loggerData.time).getTime()
            : Date.now();

          const point: MapPoint = {
            ts,
            lat: Number(loggerData.lat),
            lon: Number(loggerData.long),
            velocity: Number(loggerData.velocity),
            time: loggerData.time
          };

          (this.allDataLogger[key] ??= []).push(point);

          // performance: batched realtime UI flush - push to Subject instead of immediate updates
          this.rtBatch$.next({ key, point });
        }
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }

  // performance: batched realtime UI flush
  private flushBatch(events: Array<{ key: string; point: MapPoint }>): void {
    if (!events.length) return;

    const affectedKeys = new Set<string>();
    for (const { key, point } of events) {
      affectedKeys.add(key);
      // incremental laps state (non-breaking) - optionally process lap segmentation
      this.pushPointToLap(key, point);
      // Update cached bounds incrementally (performance optimization)
      this.updateCachedBounds(key, point);
    }

    // Use current selection source (same as existing flow)
    const selection = this.selectedRaceKey ? [this.selectedRaceKey] : Array.from(affectedKeys);

    // Call the SAME existing UI update functions exactly once per tick
    this.updateChartsFromSelection(selection);
    this.updateMapFromSelection(selection);

    // Change detection: prefer markForCheck at end of batch
    this.cdr.markForCheck();
  }

  // Optimize bounds calculations with incremental caching
  private updateCachedBounds(key: string, point: MapPoint): void {
    const lat = parseFloat(point.lat as any);
    const lon = parseFloat(point.lon as any);
    const afr = point.velocity != null ? Number(point.velocity) : undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const cached = this.cachedBoundsByKey[key];
    if (!cached) {
      // Initialize cache
      this.cachedBoundsByKey[key] = {
        minLat: lat,
        maxLat: lat,
        minLon: lon,
        maxLon: lon,
        minAfr: afr,
        maxAfr: afr,
        pointCount: 1
      };
    } else {
      // Update incrementally
      cached.minLat = Math.min(cached.minLat, lat);
      cached.maxLat = Math.max(cached.maxLat, lat);
      cached.minLon = Math.min(cached.minLon, lon);
      cached.maxLon = Math.max(cached.maxLon, lon);
      if (afr !== undefined && Number.isFinite(afr)) {
        cached.minAfr = cached.minAfr !== undefined ? Math.min(cached.minAfr, afr) : afr;
        cached.maxAfr = cached.maxAfr !== undefined ? Math.max(cached.maxAfr, afr) : afr;
      }
      cached.pointCount++;
    }
  }

  // incremental laps state (non-breaking)
  private initLapState(key: string): void {
    if (!this.lapStateByKey[key]) {
      this.lapStateByKey[key] = {
        laps: [],
        current: [],
        state: 'outside',
        lastCrossMs: -Infinity,
        canCountAgain: true
      };
    }
  }

  private pushPointToLap(key: string, pt: MapPoint): void {
    this.initLapState(key);
    const state = this.lapStateByKey[key];

    // Reuse existing constants/fields
    if (!this.startLatLongPoint) return; // Can't detect laps without start point

    const lat = this.num(pt.lat), lon = this.num(pt.lon);
    if (lat == null || lon == null) return;

    // Speed filter (if enabled)
    if (this.MIN_SPEED_MS > 0 && typeof pt.velocity === 'number') {
      if (pt.velocity < this.MIN_SPEED_MS) return;
    }

    // Determine distance calculation method (same as splitIntoLapsArray)
    const first = this.allDataLogger[key]?.[0];
    const useDegrees = first ? this.isLatLon(first) : false;
    const distMeters = (lat: number, lon: number) =>
      useDegrees
        ? this.haversineMeters({ lat, lon }, this.startLatLongPoint!)
        : this.distanceMetersOrUnits({ lat, lon }, this.startLatLongPoint!);

    const d = distMeters(lat, lon);
    const now = this.toMillis(pt.ts);

    // State machine matching splitIntoLapsArray logic
    // Exit zone (≥ START_RADIUS_UNITS) → ready to count again
    if (d >= this.START_RADIUS_UNITS) {
      if (state.state === 'inside') {
        // Exited start zone
      }
      state.state = 'outside';
      state.canCountAgain = true;
    }

    // Enter zone (≤ ENTER_RADIUS_M) + was outside + can count + time gap sufficient
    if (d <= this.ENTER_RADIUS_M && state.state === 'outside' && state.canCountAgain) {
      if (now - state.lastCrossMs >= this.MIN_LAP_GAP_MS) {
        // Close previous lap (if any points)
        if (state.current.length > 0) {
          state.laps.push([...state.current]);
        }
        // Start new lap with current point
        state.current = [pt];
        state.lastCrossMs = now;
        state.state = 'inside';
        state.canCountAgain = false;
        return;
      }
    }

    // Add point to current lap
    state.current.push(pt);
  }

  private getLaps(key: string): MapPoint[][] {
    const state = this.lapStateByKey[key];
    if (!state) return [];
    // Return completed laps + current lap (if has points)
    const result = [...state.laps];
    if (state.current.length > 0) {
      result.push([...state.current]);
    }
    return result;
  }


    private wsCurrentIndex = 0;
  /**
   * เชื่อมต่อ WebSocket
   */
  connectWebSocket(loggerId?: string): void {
    if (!loggerId) {
      console.warn('WebSocket: No loggerId provided, cannot connect');
      this.isWebSocketEnabled = false;
      return;
    }

    this.isWebSocketEnabled = true;
    // const apiEndPoint: string = APP_CONFIG.API.ENDPOINTS.WEB_SOCKET+'?logger=' + loggerId+'&startIndex=' + this.wsCurrentIndex;
    const apiEndPoint: string = APP_CONFIG.API.ENDPOINTS.WEB_SOCKET_REAL_TIME+'?logger=client_' + loggerId;
    this.currentLoggerId = loggerId;
    const loggersUrl = getApiWebSocket(apiEndPoint);



    console.log('WebSocket: Connecting with loggerId:', loggerId, ' this.wsCurrentIndex : ',this.wsCurrentIndex, 'URL:', loggersUrl);

    // ส่ง loggerId ไปยัง WebSocket service
    this.webSocketService.connect(loggersUrl, loggerId);


  }

  /**
   * ปิดการเชื่อมต่อ WebSocket
   */
  disconnectWebSocket(): void {
    this.isWebSocketEnabled = false;
    this.webSocketService.disconnect();
    this.webSocketService.disconnectStatus();
    this.wsConnectionStatus = 'disconnected';
    this.clearStatusTimeout();
    console.log('WebSocket: Disconnected by user');
  }

  /**
   * อัปเดต status ของ logger จาก WebSocket status list
   */
  private handleStatusUpdate(statusList: Array<{ logger_key: string; status: string; last_seen?: string; is_connected?: boolean }>): void {
    if (!this.currentLoggerId || !statusList || statusList.length === 0) {
      return;
    }

    const currentLoggerKey = String(this.currentLoggerId);
    const statusItem = statusList.find(item =>
      String(item.logger_key) === currentLoggerKey ||
      String(item.logger_key) === `client_${currentLoggerKey}` ||
      String(item.logger_key) === currentLoggerKey.replace('client_', '')
    );

    if (statusItem) {
      const status = (statusItem.status || '').toString().toLowerCase().trim();
      const newStatus = status === 'online' ? 'Online' : 'Offline';

      if (this.loggerStatus !== newStatus) {
        this.loggerStatus = newStatus;
        this.cdr.detectChanges();
        console.log(`[Logger Status] Updated to: ${newStatus} for logger ${currentLoggerKey}`);
      }

      // รีเซ็ต timer เมื่อได้รับ status update
      if (newStatus === 'Online') {
        this.resetStatusTimeout();
      }
    }
  }

  /**
   * รีเซ็ต timer สำหรับเช็ค status offline
   * เรียกใช้เมื่อมีข้อมูลใหม่มา
   */
  private resetStatusTimeout(): void {
    // ล้าง timer เดิม
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }

    // ตั้งค่า timer ใหม่: ถ้าไม่มีข้อมูลใหม่ภายใน 5 วินาที ให้ตั้งเป็น offline
    this.statusTimeout = setTimeout(() => {
      if (this.loggerStatus !== 'Offline') {
        console.log('[Logger Status] No data received for 5 seconds, setting status to Offline');
        this.loggerStatus = 'Offline';
        this.cdr.detectChanges();
      }
      this.statusTimeout = null;
    }, this.STATUS_TIMEOUT_MS);
  }

  /**
   * ล้าง status timeout
   */
  private clearStatusTimeout(): void {
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }
  }

  /**
   * รวมข้อมูล WebSocket กับข้อมูลที่มีอยู่
   */
  private mergeWebSocketData(): void {
    if (this.wsLoggerData.length > 0) {
      // ใช้ data processing service เพื่อรวมข้อมูล
      this.dataProcessingService.mergeWebSocketData(this.wsLoggerData);

      // อัพเดทข้อมูลใน component
      this.allLogger = this.dataProcessingService.getCurrentData();
      console.log("mergeWebSocketData : ", this.allLogger)
      // อัพเดทกราฟและแผนที่
      // if (this.showPageDataOnly && this.currentPageData.length > 0) {
      //   this.updateChartWithPageData(this.currentPageData);
      //   this.updateMapWithPageData(this.currentPageData);
      // } else {
      //   this.updateChartWithData(this.allLogger);
      //   this.updateMapWithAllData();
      // }
    }
  }

  /**
   * ส่งข้อความไปยัง WebSocket
   */
  sendWebSocketMessage(message: string): void {
    this.webSocketService.sendMessage(message);
  }
  private currentLoggerId: string | null = null;

  private tryReconnectWebSocket() {
    if (this.wsReconnectTimeout) {
      // ป้องกันการ setTimeout ซ้ำ
      return;
    }

    this.wsReconnectTimeout = setTimeout(() => {
      if (this.wsConnectionStatus === 'disconnected' && this.currentLoggerId) {
        this.connectWebSocket(this.currentLoggerId);
        this.wsReconnectTimeout = null; // reset เพื่อให้รอบถัดไป setTimeout ใหม่ได้
      }
    }, this.wsReconnectDelay);
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

    // อัปเดตพิกัด SVG สำหรับแสดงผล
    this.updateStartPointPx();
  }

  private updateStartPointPx() {
    if (!this.startLatLongPoint || !this.currentMapPoints?.length) {
      this.startPointPx = undefined;
      return;
    }

    // หาจุดที่ใกล้ที่สุดกับจุดเริ่มต้นจากข้อมูลทั้งหมด
    const allData = this.allDataLogger?.[this.selectedRaceKey ?? ''] ?? [];
    let best = null, bestD2 = Number.POSITIVE_INFINITY;

    for (const p of allData) {
      const ll = this.getLatLon(p);
      if (!ll) continue;

      const d = this.haversineMeters(this.startLatLongPoint!, ll);
      if (d < bestD2) {
        bestD2 = d;
        best = p;
      }
    }

    if (best) {
      // หาพิกัด SVG ที่สอดคล้องกับ MapPoint ที่ใกล้ที่สุด
      const correspondingPoint = this.currentMapPoints.find(cp =>
        Math.abs(cp.ts - this.toMillis(best!.ts)) < 1000 // ภายใน 1 วินาที
      );

      if (correspondingPoint) {
        this.startPointPx = { x: correspondingPoint.x, y: correspondingPoint.y };
      }
    }
  }

  private ensureStartPointForKey(key: string) {
    if (this.startLatLongPoint) return;
    const arr = this.allDataLogger?.[key] ?? [];
    for (const p of arr) {
      const ll = this.getLatLon(p);
      if (ll) { this.setStartPoint(ll.lat, ll.lon); break; }
    }
  }


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
    // เก็บ reference ไปยัง laps data
    this.currentLapsDataForChart = laps;
    this.currentLapDataForChart = null;
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

    // เพิ่ม padding เพื่อให้เส้นไม่ชิดขอบ (สำหรับ bric ใช้ padding มากขึ้น)
    const padding = this.circuitName === 'bric' ? 0.05 : 0.02;
    const spanLat = Math.max(1e-9, maxLat - minLat);
    const spanLon = Math.max(1e-9, maxLon - minLon);
    const paddedSpanLat = spanLat * (1 + 2 * padding);
    const paddedSpanLon = spanLon * (1 + 2 * padding);
    const paddedMinLat = minLat - spanLat * padding;
    const paddedMinLon = minLon - spanLon * padding;

    const toX = (lon:number) => {
      // ตรวจสอบและป้องกันการหารด้วย 0 หรือค่าที่ไม่ถูกต้อง
      const normalizedX = paddedSpanLon > 0 ? (lon - paddedMinLon) / paddedSpanLon : 0.5;
      return Math.max(0, Math.min(this.SVG_W, normalizedX * this.SVG_W));
    };
    const toY = (lat:number) => {
      // ตรวจสอบและป้องกันการหารด้วย 0 หรือค่าที่ไม่ถูกต้อง
      const normalizedY = paddedSpanLat > 0 ? (lat - paddedMinLat) / paddedSpanLat : 0.5;
      return Math.max(0, Math.min(this.SVG_H, this.SVG_H - (normalizedY * this.SVG_H)));
    };

    const segs: Array<{ i:number;x1:number;y1:number;x2:number;y2:number;c:string;afr:number }> = [];
    let segIndex = 0;

    laps.forEach((lap, lapIdx) => {
      for (let i = 1; i < lap.length; i++) {
        const a = lap[i-1], b = lap[i];
        const la = this.getLatLon(a); const lb = this.getLatLon(b);
        if (!la || !lb) continue;

        // ใช้การไล่ระดับสีจากค่า AFR แทนการใช้สีแบบเดิม
        const afrValue = Number.isFinite(b.afrValue as number) ? (b.afrValue as number) : NaN;
        const color = Number.isFinite(afrValue) ? this.getAfrColor(afrValue) : '#808080'; // สีเทาสำหรับค่าที่ไม่มี

        segs.push({
          i: segIndex++,
          x1: toX(la.lon), y1: toY(la.lat), x2: toX(lb.lon), y2: toY(lb.lat),
          c: color,
          afr: afrValue
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

  // ฟังก์ชันสำหรับสร้างกราฟจาก lap เดียว
  private buildChartFromSingleLap(lap: MapPoint[]) {
    const lapIndex = this.selectedLapIndex;

    // สร้าง series สำหรับ lap เดียว
    const detailSeries = [{
      name: `Lap ${lapIndex + 1}`,
      type: 'line',
      data: lap.map(p => ({
        x: this.toMillis(p.ts),
        y: Number.isFinite(p.afrValue) ? (p.afrValue as number) : null
      }))
    }];

    // จุดแดงเกินลิมิต
    const discrete: any[] = [];
    const limit = this.afrLimit ?? 14;
    // บน touch device (iPad/Tablet) ใช้ขนาด marker ใหญ่ขึ้นเพื่อให้ tap ได้ง่ายขึ้น
    const markerSize = this.isTouchDevice ? 6 : 4;
    detailSeries.forEach((s, sIdx) => {
      (s.data as Array<{x:number;y:number|null}>).forEach((pt, i) => {
        const y = pt.y;
        if (typeof y === 'number' && y < limit) {
          discrete.push({
            seriesIndex: sIdx,
            dataPointIndex: i,
            fillColor: '#ff3b30',
            strokeColor: '#ff3b30',
            size: markerSize
          });
        }
      });
    });

    // brush: ใช้ข้อมูลจาก lap เดียว
    const brushData: Array<{x:number;y:number|null}> = [];
    lap.forEach(p => {
      brushData.push({
        x: this.toMillis(p.ts),
        y: Number.isFinite(p.afrValue) ? (p.afrValue as number) : null
      });
    });

    // อัปเดตกราฟ detail และ brush
    this.detailOpts = {
      ...(this.detailOpts || {}),
      series: detailSeries,
      markers: { ...(this.detailOpts?.markers || {}), size: 0, discrete },
      annotations: {
        ...(this.detailOpts?.annotations || {}),
        yaxis: [{
          y: limit,
          borderColor: '#ff3b30',
          label: { text: `AFR Limit ${limit}` }
        }]
      }
    };

    this.brushOpts = {
      ...(this.brushOpts || {}),
      series: [{ name: `Lap ${lapIndex + 1}`, type: 'line', data: brushData }]
    };

    console.log(`Chart updated for lap ${lapIndex + 1}: ${detailSeries[0].data.length} data points`);
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
    // บน touch device (iPad/Tablet) ใช้ขนาด marker ใหญ่ขึ้นเพื่อให้ tap ได้ง่ายขึ้น
    const markerSize = this.isTouchDevice ? 6 : 4;
    detailSeries.forEach((s, sIdx) => {
      (s.data as Array<{x:number;y:number|null}>).forEach((pt, i) => {
        const y = pt.y;
        if (typeof y === 'number' && y < limit) {
          discrete.push({ seriesIndex: sIdx, dataPointIndex: i, fillColor: '#ff3b30', strokeColor: '#ff3b30', size: markerSize });
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

    // อัปเดตพิกัด SVG ของจุดเริ่มต้น
    this.updateStartPointPx();

    this.lapCount = this.lapStats.length;

    // ไม่สร้าง map และกราฟที่นี่ แต่ให้ updateMapWithSelectedLap() จัดการแทน
    // เพื่อให้สามารถเลือกแสดง lap เดียวหรือทุก lap ได้
  }



  private recomputeLapsForKey(key: string) {
    console.log('recomputeLapsForKey called for key:', key);
    const points = this.allDataLogger?.[key] ?? [];
    console.log('Points available:', points.length);

    this.raceLab = this.splitIntoLapsArray(points);
    console.log('Laps computed:', this.raceLab.length);

    // อัปเดตสถิติ lap
    this.updateLapArtifacts(key, this.raceLab);

    // อัปเดต map และกราฟตาม lap ที่เลือก
    this.updateMapWithSelectedLap();
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

      // สร้าง SVG polyline จาก telemetry points (first point centered)
      // this.generateTelemetrySvgFromDataKey(key, 800, 660, 40);

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

  cal = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };
  readonly SVG_W = 800;
  readonly SVG_H = 660;

  get polyTransform(): string {
    // ไม่ใช้ transform เพื่อให้พิกัดตรงกับ viewBox โดยตรง
    return '';
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
    const SVG_H = 660;
    // สร้างจุดสำหรับ SVG โดยแปลงพิกัด GPS เป็นพิกัด SVG (0-800, 0-660)
    const points = validPoints.map((p: { lat: string; lon: string; }) => {
      const lat = parseFloat(p.lat);
      const long = parseFloat(p.lon);
      const x = Math.max(0, Math.min(SVG_W, ((long - minLong) / (maxLong - minLong)) * SVG_W));
      const y = Math.max(0, Math.min(SVG_H, SVG_H - ((lat - minLat) / (maxLat - minLat)) * SVG_H));
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

  /**
   * สร้าง SVG polyline จาก telemetry points โดยให้จุดแรกอยู่กึ่งกลาง
   * ใช้ฟังก์ชัน convertTelemetryToSvgPolyline จาก utility
   *
   * @param points - Array of telemetry points (lat, lon, AFR, RPM, timestamp)
   * @param width - SVG width (default: 800)
   * @param height - SVG height (default: 660)
   * @param margin - Margin in pixels (default: 40)
   * @returns SVG string หรืออัปเดต this.telemetrySvgPolyline
   */
  generateTelemetrySvgPolyline(
    points: SvgTelemetryPoint[],
    width: number = 800,
    height: number = 660,
    margin: number = 40
  ): string {
    if (!points || points.length === 0) {
      this.telemetrySvgPolyline = '';
      return '';
    }

    const input: TelemetryToSvgInput = {
      width,
      height,
      margin,
      points: points as SvgTelemetryPoint[]
    };

    const svgString = convertTelemetryToSvgPolyline(input);
    this.telemetrySvgPolyline = svgString;
    return svgString;
  }

  /**
   * แปลงข้อมูลจาก allDataLogger หรือ allLogger เป็น SvgTelemetryPoint[]
   * และสร้าง SVG polyline
   *
   * @param key - Key ของ race/session (เช่น 'realtime', 'practice', etc.)
   * @param width - SVG width (default: 800)
   * @param height - SVG height (default: 660)
   * @param margin - Margin in pixels (default: 40)
   */
  generateTelemetrySvgFromDataKey(
    key: string,
    width: number = 800,
    height: number = 660,
    margin: number = 40
  ): void {
    const dataPoints = this.allDataLogger?.[key] || [];

    if (dataPoints.length === 0) {
      this.telemetrySvgPolyline = '';
      return;
    }

    // แปลง MapPoint[] เป็น SvgTelemetryPoint[] (for utility function)
    const telemetryPoints: SvgTelemetryPoint[] = dataPoints.map((p: MapPoint) => ({
      lat: Number.isFinite(p.lat) ? Number(p.lat) : 0,
      lon: Number.isFinite(p.lon) ? Number(p.lon) : 0,
      AFR: Number.isFinite(p.afrValue) ? Number(p.afrValue) : undefined,
      timestamp: p.time ? String(p.time) : undefined
    }));

    this.generateTelemetrySvgPolyline(telemetryPoints, width, height, margin);
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
    const limit = this.afrLimit; // ค่า AFR limit ที่ใช้เช็ค

    // ถ้าน้อยกว่า limit ให้เป็นสีแดง (เหมือนกับจุดในกราฟ)
    if (limit !== undefined && limit !== 0 && afr < limit) {
      return '#FF0000'; // สีแดง
    }
    if (afr <= lowerBound) {
      return '#00FF00'; // สีเขียว
    }

    // คำนวณสัดส่วนของค่า afr ในช่วง lowerBound ถึง limit (หรือค่า default ถ้าไม่มี limit)
    const upperBound = limit !== undefined && limit !== 0 ? limit : 20; // ใช้ limit หรือค่า default
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
        const lat = parseFloat(p.lat);
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

    // ---- bounds สำหรับ normalize (เพิ่ม padding เพื่อไม่ให้ชิดขอบ)
    const lats = all.map(p => p.lat);
    const lons = all.map(p => p.lon);

    let minLat: number = 0, maxLat: number = 0, minLon: number = 0, maxLon: number = 0;
    let padding: number = 0;

    // Optimize bounds calculation: use cached bounds if available (performance optimization)
    // Only use cached bounds in else branch (non-bric fixed bounds case) to avoid conflicts
    let useCachedBounds = false;

    // สำหรับ bric: ใช้ fixed bounds ถ้ามีแล้ว เพื่อไม่ให้แผนที่ปรับ scale ตลอดเวลา
    if (this.circuitName === 'bric' && this.fixedBoundsForBric) {
      // ใช้ fixed bounds ที่ตั้งไว้แล้ว
      minLat = this.fixedBoundsForBric.minLat;
      maxLat = this.fixedBoundsForBric.maxLat;
      minLon = this.fixedBoundsForBric.minLon;
      maxLon = this.fixedBoundsForBric.maxLon;
      padding = 0; // ไม่ต้อง padding อีกเพราะ fixed bounds มี padding แล้ว

      // อัปเดต fixed bounds ถ้าจุดใหม่อยู่นอก bounds (ขยายออกไป)
      const actualMinLat = Math.min(...lats);
      const actualMaxLat = Math.max(...lats);
      const actualMinLon = Math.min(...lons);
      const actualMaxLon = Math.max(...lons);

      if (actualMinLat < minLat || actualMaxLat > maxLat || actualMinLon < minLon || actualMaxLon > maxLon) {
        // ขยาย bounds ออกไป 10% จากจุดที่อยู่นอก bounds
        const expandPadding = 0.10;
        const newSpanLat = Math.max(1e-9, (actualMaxLat > maxLat ? actualMaxLat : maxLat) - (actualMinLat < minLat ? actualMinLat : minLat));
        const newSpanLon = Math.max(1e-9, (actualMaxLon > maxLon ? actualMaxLon : maxLon) - (actualMinLon < minLon ? actualMinLon : minLon));

        this.fixedBoundsForBric = {
          minLat: (actualMinLat < minLat ? actualMinLat : minLat) - newSpanLat * expandPadding,
          maxLat: (actualMaxLat > maxLat ? actualMaxLat : maxLat) + newSpanLat * expandPadding,
          minLon: (actualMinLon < minLon ? actualMinLon : minLon) - newSpanLon * expandPadding,
          maxLon: (actualMaxLon > maxLon ? actualMaxLon : maxLon) + newSpanLon * expandPadding
        };

        minLat = this.fixedBoundsForBric.minLat;
        maxLat = this.fixedBoundsForBric.maxLat;
        minLon = this.fixedBoundsForBric.minLon;
        maxLon = this.fixedBoundsForBric.maxLon;
      }
    } else {
      // สำหรับ bsc หรือ bric ที่ยังไม่มี fixed bounds: คำนวณจากข้อมูลจริง
      // Optimize: use cached bounds if available and point count matches (performance optimization)
      useCachedBounds = keys.length === 1 && this.cachedBoundsByKey[keys[0]]
        && this.cachedBoundsByKey[keys[0]].pointCount === all.length;
      if (useCachedBounds) {
        const cached = this.cachedBoundsByKey[keys[0]];
        // Use cached bounds (trust incremental updates - safe because we update incrementally in flushBatch)
        // Simple sanity check: ensure min <= max
        if (cached.minLat <= cached.maxLat && cached.minLon <= cached.maxLon) {
          minLat = cached.minLat;
          maxLat = cached.maxLat;
          minLon = cached.minLon;
          maxLon = cached.maxLon;
        } else {
          // Sanity check failed - recalculate
          useCachedBounds = false;
        }
      }
      if (!useCachedBounds) {
        minLat = Math.min(...lats);
        maxLat = Math.max(...lats);
        minLon = Math.min(...lons);
        maxLon = Math.max(...lons);
        // Update cache for next time
        if (keys.length === 1) {
          const afrVals = all.map(p => p.afrValue).filter((v): v is number => Number.isFinite(v));
          this.cachedBoundsByKey[keys[0]] = {
            minLat, maxLat, minLon, maxLon,
            minAfr: afrVals.length ? Math.min(...afrVals) : undefined,
            maxAfr: afrVals.length ? Math.max(...afrVals) : undefined,
            pointCount: all.length
          };
        }
      }

      // สำหรับ bric: ตั้ง fixed bounds ครั้งแรก (ใช้ข้อมูลเริ่มต้น 10 จุดแรกขึ้นไป)
      if (this.circuitName === 'bric' && !this.fixedBoundsForBric && all.length >= 10) {
        this.initializeFixedBoundsForBric(all);
      }

      // ใช้ fixed bounds ถ้ามี (หลังจาก initialize)
      const currentFixedBounds = this.fixedBoundsForBric;
      if (this.circuitName === 'bric' && currentFixedBounds) {
        minLat = currentFixedBounds.minLat;
        maxLat = currentFixedBounds.maxLat;
        minLon = currentFixedBounds.minLon;
        maxLon = currentFixedBounds.maxLon;
        padding = 0;
      } else {
        padding = this.circuitName === 'bric' ? 0.05 : 0.02;
      }
    }

    const spanLat = Math.max(1e-9, maxLat - minLat);
    const spanLon = Math.max(1e-9, maxLon - minLon);
    const paddedSpanLat = spanLat * (1 + 2 * padding);
    const paddedSpanLon = spanLon * (1 + 2 * padding);
    const paddedMinLat = minLat - spanLat * padding;
    const paddedMinLon = minLon - spanLon * padding;

    const SVG_W = 800, SVG_H = 660;

    // ---- ช่วง AFR (ถ้าไม่มีค่าเลย ใช้ค่า default)
    // Optimize: use cached AFR bounds if available (performance optimization)
    let afrMin: number, afrMax: number;
    if (useCachedBounds && keys.length === 1 && this.cachedBoundsByKey[keys[0]]?.minAfr !== undefined) {
      const cached = this.cachedBoundsByKey[keys[0]];
      afrMin = cached.minAfr!;
      afrMax = cached.maxAfr!;
    } else {
      const afrVals = all.map(p => p.afrValue).filter((v): v is number => Number.isFinite(v));
      afrMin = afrVals.length ? Math.min(...afrVals) : AFR_DEFAULT_MIN;
      afrMax = afrVals.length ? Math.max(...afrVals) : AFR_DEFAULT_MAX;
    }

    // ---- ค่าที่ต้องส่งออก
    const outPoints: Record<string, string> = {};
    const start: Record<string, {x:number;y:number;lat:number;long:number}> = {};
    const end:   Record<string, {x:number;y:number;lat:number;long:number}> = {};
    // ปรับเป็นไม่สร้างเส้น segment อีกต่อไป (ต้องการแค่จุดแดง)
    const segs:  Record<string, Array<{ i:number;x1:number;y1:number;x2:number;y2:number;c:string; afr:number;  }>> = {};

    for (const k of keys) {
      const arr = perKey[k];
      if (!arr.length) continue;

      // ถ้าเป็น bsc หรือ bric ที่มี loggerId = 118 หรือ realtime (หรือ WebSocket เปิดอยู่) ให้ใช้โหมดเส้น
      const isRealtimeMode = k === 'realtime' || (this.isWebSocketEnabled && keys.length === 1 && keys[0] === k);
      const isLineMode = this.circuitName === 'bsc' || (this.circuitName === 'bric' && this.loggerID === 118) || isRealtimeMode;

      // สำหรับ realtime: คำนวณ bounds จากข้อมูลของ key นี้เท่านั้น และขยายแบบไดนามิก
      let realtimeMinLat: number, realtimeMaxLat: number, realtimeMinLon: number, realtimeMaxLon: number;
      let realtimeSpanLat: number, realtimeSpanLon: number;
      let realtimePaddedMinLat: number, realtimePaddedMinLon: number;
      let realtimePaddedSpanLat: number, realtimePaddedSpanLon: number;

      if (isRealtimeMode && arr.length > 0) {
        // ใช้ preset bounds ถ้ามี (เพื่อป้องกันการขยับไปมา) หรือคำนวณจากข้อมูลจริง
        if (this.presetBoundsForRealtime) {
          // ใช้ preset bounds ที่ตั้งไว้ (ใช้ค่าจาก log ที่คำนวณแล้ว)
          realtimeMinLat = this.presetBoundsForRealtime.minLat;
          realtimeMaxLat = this.presetBoundsForRealtime.maxLat;
          realtimeMinLon = this.presetBoundsForRealtime.minLon;
          realtimeMaxLon = this.presetBoundsForRealtime.maxLon;

          // คำนวณ span จาก preset bounds
          realtimeSpanLat = Math.max(1e-9, realtimeMaxLat - realtimeMinLat);
          realtimeSpanLon = Math.max(1e-9, realtimeMaxLon - realtimeMinLon);

          // ใช้ preset bounds โดยตรง (ไม่ต้อง padding อีกเพราะ preset bounds มี padding แล้ว)
          // ปรับให้พอดีกับ SVG
          const SVG_W = 800, SVG_H = 660;
          const presetAspectRatio = realtimeSpanLon / realtimeSpanLat;
          const svgAspectRatio = SVG_W / SVG_H;

          // ปรับ bounds ให้พอดีกับ SVG โดยคง aspect ratio ของข้อมูล
          if (presetAspectRatio > svgAspectRatio) {
            // ข้อมูลกว้างกว่า SVG -> ใช้ความกว้างเต็มที่และปรับ lat span
            const adjustedSpanLat = realtimeSpanLon / svgAspectRatio;
            const centerLat = (realtimeMinLat + realtimeMaxLat) / 2;

            realtimePaddedSpanLat = adjustedSpanLat;
            realtimePaddedMinLat = centerLat - realtimePaddedSpanLat / 2;
            realtimePaddedSpanLon = realtimeSpanLon;
            realtimePaddedMinLon = realtimeMinLon;
          } else {
            // ข้อมูลสูงกว่า SVG -> ใช้ความสูงเต็มที่และปรับ lon span
            const adjustedSpanLon = realtimeSpanLat * svgAspectRatio;
            const centerLon = (realtimeMinLon + realtimeMaxLon) / 2;

            realtimePaddedSpanLat = realtimeSpanLat;
            realtimePaddedMinLat = realtimeMinLat;
            realtimePaddedSpanLon = adjustedSpanLon;
            realtimePaddedMinLon = centerLon - realtimePaddedSpanLon / 2;
          }

          console.log('Using preset bounds for realtime:', this.presetBoundsForRealtime);
        } else {
          // Fallback: คำนวณ bounds จากข้อมูลจริงถ้าไม่มี preset
          const lats = arr.map(p => p.lat);
          const lons = arr.map(p => p.lon);

          const actualMinLat = Math.min(...lats);
          const actualMaxLat = Math.max(...lats);
          const actualMinLon = Math.min(...lons);
          const actualMaxLon = Math.max(...lons);

          realtimeMinLat = actualMinLat;
          realtimeMaxLat = actualMaxLat;
          realtimeMinLon = actualMinLon;
          realtimeMaxLon = actualMaxLon;

          // คำนวณ span จากข้อมูลจริง
          realtimeSpanLat = Math.max(1e-9, realtimeMaxLat - realtimeMinLat);
          realtimeSpanLon = Math.max(1e-9, realtimeMaxLon - realtimeMinLon);

          // เพิ่ม padding รอบๆ ข้อมูลจริง (ใช้สูตรเดียวกับ initializeFixedBoundsForBric)
          const SVG_W = 800, SVG_H = 660;
          const padding = 0.10; // padding 10% รอบๆ ข้อมูล

          // คำนวณ aspect ratio ของข้อมูลจริงและ SVG
          const dataAspectRatio = realtimeSpanLon / realtimeSpanLat;
          const svgAspectRatio = SVG_W / SVG_H;

          // เพิ่ม padding และปรับให้พอดีกับ SVG
          if (dataAspectRatio > svgAspectRatio) {
            const paddedSpanLon = realtimeSpanLon * (1 + 2 * padding);
            const adjustedSpanLat = paddedSpanLon / svgAspectRatio;
            const centerLat = (realtimeMinLat + realtimeMaxLat) / 2;

            realtimePaddedSpanLat = adjustedSpanLat;
            realtimePaddedMinLat = centerLat - realtimePaddedSpanLat / 2;
            realtimePaddedSpanLon = paddedSpanLon;
            realtimePaddedMinLon = (realtimeMinLon + realtimeMaxLon) / 2 - realtimePaddedSpanLon / 2;
          } else {
            const paddedSpanLat = realtimeSpanLat * (1 + 2 * padding);
            const adjustedSpanLon = paddedSpanLat * svgAspectRatio;
            const centerLon = (realtimeMinLon + realtimeMaxLon) / 2;

            realtimePaddedSpanLat = paddedSpanLat;
            realtimePaddedMinLat = (realtimeMinLat + realtimeMaxLat) / 2 - realtimePaddedSpanLat / 2;
            realtimePaddedSpanLon = adjustedSpanLon;
            realtimePaddedMinLon = centerLon - realtimePaddedSpanLon / 2;
          }

          // Log bounds สุดท้ายเพื่อนำไปตั้งเป็น preset
          const realtimePaddedMaxLat = realtimePaddedMinLat + realtimePaddedSpanLat;
          const realtimePaddedMaxLon = realtimePaddedMinLon + realtimePaddedSpanLon;
          console.log('=== SVG Bounds สำหรับ Preset ===');
          console.log('Latitude (ความสูง/ยาว):');
          console.log(`  minLat: ${realtimePaddedMinLat.toFixed(6)}`);
          console.log(`  maxLat: ${realtimePaddedMaxLat.toFixed(6)}`);
          console.log(`  spanLat: ${realtimePaddedSpanLat.toFixed(6)}`);
          console.log('Longitude (ความกว้าง):');
          console.log(`  minLon: ${realtimePaddedMinLon.toFixed(6)}`);
          console.log(`  maxLon: ${realtimePaddedMaxLon.toFixed(6)}`);
          console.log(`  spanLon: ${realtimePaddedSpanLon.toFixed(6)}`);
          console.log('--- ใช้สำหรับ setPresetBoundsFromRawData() ---');
          console.log(`setPresetBoundsFromRawData(${realtimePaddedMinLat.toFixed(6)}, ${realtimePaddedMaxLat.toFixed(6)}, ${realtimePaddedMinLon.toFixed(6)}, ${realtimePaddedMaxLon.toFixed(6)});`);
          console.log('==========================================');
        }
      }

      // map เป็นพิกัด SVG (คำนวณให้อยู่ภายใน 0-800 และ 0-660)
      const pts = arr.map((r, i) => {
        let x: number, y: number;

        if (isRealtimeMode && realtimePaddedSpanLat > 0 && realtimePaddedSpanLon > 0) {
          // สำหรับ realtime: ใช้ min/max-based normalization จากข้อมูลจริง
          // เพื่อให้ภาพใหญ่ขึ้นและมี padding รอบๆ ที่พอดี
          const normalizedX = realtimePaddedSpanLon > 0 ? (r.lon - realtimePaddedMinLon) / realtimePaddedSpanLon : 0.5;
          const normalizedY = realtimePaddedSpanLat > 0 ? (r.lat - realtimePaddedMinLat) / realtimePaddedSpanLat : 0.5;

          // แปลงเป็นพิกัด SVG โดยตรง - ทำให้ข้อมูลพอดีกับกรอบ SVG (0-800, 0-660)
          // ข้อมูลจะถูก map ให้พอดีกับ SVG พร้อม padding รอบๆ
          x = normalizedX * SVG_W;
          y = SVG_H - (normalizedY * SVG_H); // ลบเพราะ Y แกนกลับกัน

          // Clamp ให้อยู่ในขอบเขต SVG เพื่อป้องกันข้อมูลที่อยู่นอก bounds
          x = Math.max(0, Math.min(SVG_W, x));
          y = Math.max(0, Math.min(SVG_H, y));

          if (this.routeFlipHorizontal) {
            x = SVG_W - x;
          }
        } else {
          // โหมดปกติ: คำนวณพิกัดแบบเดิม
          const normalizedX = paddedSpanLon > 0 ? (r.lon - paddedMinLon) / paddedSpanLon : 0.5;
          const normalizedY = paddedSpanLat > 0 ? (r.lat - paddedMinLat) / paddedSpanLat : 0.5;

          // แปลงเป็นพิกัด SVG และ clamp ให้อยู่ในขอบเขตอย่างแน่นหนา
          x = Math.max(0, Math.min(SVG_W, normalizedX * SVG_W));
          y = Math.max(0, Math.min(SVG_H, SVG_H - (normalizedY * SVG_H)));
        }

        const ts = (r as any).time ? new Date((r as any).time).getTime() : i;

        return { ts, i, x, y, lat: r.lat, long: r.lon, afr: r.afrValue };
      });

      if (isLineMode) {
        // โหมดเส้น: เก็บทุกจุด (ไม่มีจุดแดงแยกในเทมเพลต)
        this.currentMapPoints = pts.map(p => ({
          ts: p.ts,
          x: p.x,
          y: p.y,
          afr: p.afr ?? 0
        }));
      } else {
        // โหมดจุดเดียว: แสดงเฉพาะจุดล่าสุดให้ลากตาม
        const lastPt = pts[pts.length - 1];
        this.currentMapPoints = lastPt ? [{
          ts: lastPt.ts,
          x: lastPt.x,
          y: lastPt.y,
          afr: lastPt.afr ?? 0
        }] : [];
      }

      // สตริง polyline (เผื่อยังใช้วาดแบบสีเดียว)
      outPoints[k] = pts.map(p => `${p.x},${p.y}`).join(' ');
      start[k] = { x: pts[0].x, y: pts[0].y, lat: pts[0].lat, long: pts[0].long };
      end[k]   = { x: pts[pts.length-1].x, y: pts[pts.length-1].y, lat: pts[pts.length-1].lat, long: pts[pts.length-1].long };

      if (isLineMode) {
        // โหมดเส้น: แตกเป็น segment และระบายสีตาม AFR
        const step = Math.max(1, Math.ceil(pts.length / 20000));
        const s: Array<{ i:number;x1:number;y1:number;x2:number;y2:number;c:string , afr:number; }> = [];
        for (let i = 0; i < pts.length - step; i += step) {
          const a = pts[i], b = pts[i + step];
          const afrA = Number.isFinite(a.afr!) ? a.afr! : undefined;
          const afrB = Number.isFinite(b.afr!) ? b.afr! : undefined;
          const afr  = afrA!=null && afrB!=null ? (afrA + afrB)/2
                      : afrA!=null ? afrA
                      : afrB!=null ? afrB
                      : (afrMin + afrMax)/2;
          const color = afrToColor(afr, afrMin, afrMax, this.afrLimit);
          s.push({ i, x1:a.x, y1:a.y, x2:b.x, y2:b.y, c: color, afr });
        }
        segs[k] = s;
      } else {
        // โหมดจุด: ไม่สร้างเส้น
        segs[k] = [];
      }
    }

    this.svgPointsByKey = outPoints;
    this.startPointByKey = start;
    this.endPointByKey = end;
    this.segmentsByKey = segs;
    this.hasRouteData = true;
    // แสดงเส้นทางสำหรับ bsc, bric ที่มี loggerId = 118, และ realtime
    const isRealtimeKey = keys.some(k => k === 'realtime');
    this.showRoutePath = (this.circuitName === 'bsc' || (this.circuitName === 'bric' && this.loggerID === 118) || isRealtimeKey);
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


  /**
   * ฟังก์ชัน helper สำหรับแสดง hover point และ tooltip สำหรับ data point ในกราฟ
   */
  private showHoverForDataPoint(seriesIndex: number, dataPointIndex: number, chartContext: any) {
    const w: any = (chartContext as any)?.w;
    const seriesCfg = w?.config?.series?.[seriesIndex];
    const seriesData = Array.isArray(seriesCfg?.data) ? seriesCfg.data : undefined;
    const pointOnChart: any = seriesData ? seriesData[dataPointIndex] : undefined;

    if (pointOnChart && (pointOnChart.x != null || pointOnChart.t != null || pointOnChart.time != null)) {
      const timestamp = pointOnChart.x ?? pointOnChart.t ?? pointOnChart.time;

      // ดึงค่า AFR จากค่า y ของ series ที่ hover อยู่ (ตรงกับค่าที่แสดงในกราฟ)
      const afrFromSeries = pointOnChart.y !== null && pointOnChart.y !== undefined
        ? pointOnChart.y
        : null;

      let closestMapPoint = null;

      // ใช้ index โดยตรงถ้าเป็น single lap mode
      if (this.currentLapDataForChart && this.currentLapDataForChart.length > dataPointIndex) {
        const lapPoint = this.currentLapDataForChart[dataPointIndex];
        if (lapPoint) {
          // หา map point ที่สอดคล้องกับ lap point นี้
          const lapTimestamp = this.toMillis(lapPoint.ts);
          closestMapPoint = this.currentMapPoints?.find(mp =>
            Math.abs(mp.ts - lapTimestamp) < 100
          );

          // ถ้าไม่เจอ ใช้การคำนวณพิกัดใหม่
          if (!closestMapPoint && this.currentMapPoints?.length) {
            const ll = this.getLatLon(lapPoint);
            if (ll) {
              // คำนวณพิกัดเหมือน buildMapFromSingleLap
              const all = this.currentLapDataForChart.map(p => this.getLatLon(p))
                .filter((v): v is {lat:number;lon:number} => !!v);
              if (all.length > 0) {
                const minLat = Math.min(...all.map(v => v.lat));
                const maxLat = Math.max(...all.map(v => v.lat));
                const minLon = Math.min(...all.map(v => v.lon));
                const maxLon = Math.max(...all.map(v => v.lon));
                const padding = this.circuitName === 'bric' ? 0.05 : 0.02;
                const spanLat = Math.max(1e-9, maxLat - minLat);
                const spanLon = Math.max(1e-9, maxLon - minLon);
                const paddedSpanLat = spanLat * (1 + 2 * padding);
                const paddedSpanLon = spanLon * (1 + 2 * padding);
                const paddedMinLat = minLat - spanLat * padding;
                const paddedMinLon = minLon - spanLon * padding;

                const normalizedX = paddedSpanLon > 0 ? (ll.lon - paddedMinLon) / paddedSpanLon : 0.5;
                const normalizedY = paddedSpanLat > 0 ? (ll.lat - paddedMinLat) / paddedSpanLat : 0.5;
                const SVG_W = 800;
                const SVG_H = 660;
                const x = Math.max(0, Math.min(SVG_W, normalizedX * SVG_W));
                const y = Math.max(0, Math.min(SVG_H, SVG_H - (normalizedY * SVG_H)));

                closestMapPoint = {
                  x, y,
                  ts: lapTimestamp,
                  afr: Number.isFinite(lapPoint.afrValue as number) ? (lapPoint.afrValue as number) : 0
                };
              }
            }
          }
        }
      }

      // ถ้าเป็น multi-lap mode หรือไม่เจอ ให้ใช้วิธีเดิม
      if (!closestMapPoint && this.currentMapPoints?.length) {
        const timestampTolerance = 100; // 100ms tolerance
        let minTimeDiff = Number.POSITIVE_INFINITY;

        // ลองหา exact match ก่อน
        const exactMatch = this.currentMapPoints.find(mp => Math.abs(mp.ts - timestamp) < 50);
        if (exactMatch) {
          closestMapPoint = exactMatch;
        } else {
          // หาจุดที่ใกล้ที่สุดภายใน tolerance
          for (const mp of this.currentMapPoints) {
            const timeDiff = Math.abs(mp.ts - timestamp);
            if (timeDiff < timestampTolerance && timeDiff < minTimeDiff) {
              minTimeDiff = timeDiff;
              closestMapPoint = mp;
            }
          }

          // ถ้าไม่พบจุดที่ใกล้พอ ให้ใช้จุดที่ใกล้ที่สุดทั้งหมด (ไม่จำกัด tolerance)
          if (!closestMapPoint) {
            closestMapPoint = this.currentMapPoints.reduce((prev, curr) =>
              Math.abs(curr.ts - timestamp) < Math.abs(prev.ts - timestamp) ? curr : prev
            , this.currentMapPoints[0]);
          }
        }
      }

      if (closestMapPoint) {
        // ใช้ updateTooltipPosition เพื่อคำนวณตำแหน่งโดยคำนึงถึง transform
        this.updateTooltipPosition(closestMapPoint.x, closestMapPoint.y);
      }
    }
  }

  // Method นี้จะถูกเรียกเมื่อเมาส์เข้าสู่พื้นที่ของจุดบนแผนที่
  onMapPointEnter(point: { x: number; y: number; afr: number }) {
    this.updateTooltipPosition(point.x, point.y);
  }

  /**
   * จัดการ hover บน segment (เส้น) เพื่อแสดง AFR
   */
  onSegmentHover(evt: MouseEvent, seg: any) {
    if (!seg) return;

    // แปลงพิกัดที่ hover เป็นพิกัดเดิม (reverse transform)
    const local = this.svgClientToLocal(evt);

    // ตรวจสอบว่า hover อยู่บนเส้นหรือใกล้เส้น
    const distance = this.distanceToSegment(local, seg);
    if (distance < 15) { // ระยะห่างที่ยอมรับได้ (เพิ่มขึ้นเพื่อให้ hover ได้ง่ายขึ้น)
      // แสดง tooltip ที่ตำแหน่งเมาส์จริงๆ เพื่อให้ตามเมาส์ไปด้วย
      this.updateTooltipPositionFromMouse(evt);
    } else {
      // ถ้าไกลเกินไป ให้ซ่อน hover
      this.onSegmentLeave();
    }
  }

  /**
   * เมื่อเมาส์ออกจาก segment
   */
  onSegmentLeave() {
    // ไม่ต้องซ่อนทันที เพราะอาจจะ hover ไปที่จุดอื่น
    // จะซ่อนเมื่อ hover ออกจากพื้นที่ทั้งหมด
  }

  /**
   * เมื่อเมาส์ออกจาก SVG element ทั้งหมด
   */
  onSvgMouseLeave() {
    this.tooltipStyle.visibility = 'hidden';
  }

  /**
   * คำนวณระยะห่างจากจุดไปยังเส้น segment
   */
  private distanceToSegment(point: {x: number; y: number}, seg: {x1: number; y1: number; x2: number; y2: number}): number {
    const A = point.x - seg.x1;
    const B = point.y - seg.y1;
    const C = seg.x2 - seg.x1;
    const D = seg.y2 - seg.y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = 0;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx: number, yy: number;

    if (param < 0) {
      xx = seg.x1;
      yy = seg.y1;
    } else if (param > 1) {
      xx = seg.x2;
      yy = seg.y2;
    } else {
      xx = seg.x1 + param * C;
      yy = seg.y1 + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * หาจุดบนเส้น segment ที่ใกล้กับจุดที่กำหนดมากที่สุด
   */
  private closestPointOnSegment(point: {x: number; y: number}, seg: {x1: number; y1: number; x2: number; y2: number}): {x: number; y: number} {
    const A = point.x - seg.x1;
    const B = point.y - seg.y1;
    const C = seg.x2 - seg.x1;
    const D = seg.y2 - seg.y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = 0;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    // จำกัด param ให้อยู่ระหว่าง 0 ถึง 1 (บนเส้น segment)
    param = Math.max(0, Math.min(1, param));

    return {
      x: seg.x1 + param * C,
      y: seg.y1 + param * D
    };
  }

  /**
   * อัปเดตตำแหน่ง tooltip โดยคำนึงถึง transform
   * คำนวณให้ตรงกับตำแหน่งของ circle indicator หลัง transform มากที่สุด
   */
  private updateTooltipPosition(svgX: number, svgY: number) {
    if (!this.mapSvgEl?.nativeElement) return;

    const svg = this.mapSvgEl.nativeElement as SVGSVGElement;
    const svgRect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox?.baseVal || { width: 800, height: 660 };

    // หา group element ที่มี transform (คือ group ที่ครอบ circle)
    const transformedGroup = svg.querySelector('g[transform]') as SVGGElement;

    if (transformedGroup) {
      // สร้าง SVGPoint เพื่อแปลงพิกัด
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = svgX;
      svgPoint.y = svgY;

      // ใช้ getScreenCTM() ของ transformed group เพื่อแปลงพิกัด SVG เป็น screen coordinates
      // ซึ่งจะคำนึงถึง transform ทั้งหมด (rotation, flip, scale) อัตโนมัติ
      const groupCTM = transformedGroup.getScreenCTM();
      if (groupCTM) {
        // แปลงพิกัดผ่าน group transform matrix
        const screenPoint = svgPoint.matrixTransform(groupCTM);

        // คำนวณตำแหน่งสัมพัทธ์กับ container
        const container = svg.closest('.track-image-container') as HTMLElement;
        if (container) {
          const containerRect = container.getBoundingClientRect();

          // offset เล็กน้อยเพื่อให้ tooltip อยู่ใกล้กับ circle แต่ไม่บัง
          const offsetX = 12; // offset จากขอบขวาของ circle (radius 7 + gap 5)
          const offsetY = -8; // offset จากขอบบนของ circle

          const left = (screenPoint.x - containerRect.left) + offsetX;
          const top = (screenPoint.y - containerRect.top) + offsetY;

          this.tooltipStyle = {
            left: `${left}px`,
            top: `${top}px`,
            visibility: 'visible'
          };
          return;
        }
      }
    }

    // Fallback: ใช้วิธีคำนวณแบบเดิม
    this.calculateTooltipPositionFallback(svgX, svgY, svg, svgRect, viewBox);
  }

  /**
   * Fallback method สำหรับคำนวณตำแหน่ง tooltip
   */
  private calculateTooltipPositionFallback(
    svgX: number,
    svgY: number,
    svg: SVGSVGElement,
    svgRect: DOMRect,
    viewBox: { width: number; height: number }
  ) {
    // แปลงพิกัด SVG กลับเป็นพิกัดที่แสดงผล (apply transform)
    const transformedPoint = this.applyTransform({ x: svgX, y: svgY });

    // คำนวณตำแหน่งจาก viewBox coordinates เป็น pixel coordinates
    const scaleX = svgRect.width / viewBox.width;
    const scaleY = svgRect.height / viewBox.height;

    // คำนวณตำแหน่งของ circle หลัง transform ใน pixel coordinates
    const circleLeft = transformedPoint.x * scaleX;
    const circleTop = transformedPoint.y * scaleY;

    // offset เพื่อให้ tooltip อยู่ใกล้กับ circle แต่ไม่บัง
    const offsetX = 12;
    const offsetY = -8;

    // คำนวณตำแหน่งสัมพัทธ์กับ container
    const container = svg.closest('.track-image-container') as HTMLElement;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const left = (svgRect.left - containerRect.left) + circleLeft + offsetX;
      const top = (svgRect.top - containerRect.top) + circleTop + offsetY;

      this.tooltipStyle = {
        left: `${left}px`,
        top: `${top}px`,
        visibility: 'visible'
      };
    } else {
      // Fallback: ใช้วิธีเดิม
      const left = circleLeft + offsetX;
      const top = circleTop + offsetY;
      this.tooltipStyle = {
        left: `${left}px`,
        top: `${top}px`,
        visibility: 'visible'
      };
    }
  }

  /**
   * อัปเดตตำแหน่ง tooltip จากตำแหน่งเมาส์ (เพื่อให้ tooltip ตามเมาส์ไปด้วย)
   */
  private updateTooltipPositionFromMouse(evt: MouseEvent) {
    if (!this.mapSvgEl?.nativeElement) return;

    // ใช้ container แทน SVG เพื่อให้คำนวณตำแหน่งได้ถูกต้อง
    const container = this.mapSvgEl.nativeElement.closest('.track-image-container') as HTMLElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    // คำนวณตำแหน่ง tooltip จากตำแหน่งเมาส์บนหน้าจอ
    // offset เพื่อให้ tooltip ไม่บังเมาส์
    const offsetX = 15;
    const offsetY = 15;

    const left = evt.clientX - containerRect.left + offsetX;
    const top = evt.clientY - containerRect.top + offsetY;

    this.tooltipStyle = {
      left: `${left}px`,
      top: `${top}px`,
      visibility: 'visible'
    };
  }

  /**
   * แปลงพิกัดเดิมเป็นพิกัดที่แสดงผล (apply transform) - ตรงข้ามกับ reverseTransform
   */
  private applyTransform(point: {x: number; y: number}): {x: number; y: number} {
    const viewBoxWidth = 800;
    const viewBoxHeight = 660;
    const centerX = viewBoxWidth / 2;
    const centerY = viewBoxHeight / 2;

    let x = point.x;
    let y = point.y;

    // ย้ายไปที่จุดกึ่งกลาง
    x -= centerX;
    y -= centerY;

    // หมุน (ถ้ามี)
    if (this.svgRotation !== 0) {
      const angle = this.svgRotation * (Math.PI / 180);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const newX = x * cos - y * sin;
      const newY = x * sin + y * cos;
      x = newX;
      y = newY;
    }

    // สะท้อนซ้าย-ขวา (ถ้ามี)
    if (this.svgFlipHorizontal) {
      x = -x;
    }

    // สะท้อนบน-ล่าง (ถ้ามี)
    if (this.svgFlipVertical) {
      y = -y;
    }

    // ย้ายกลับ
    x += centerX;
    y += centerY;

    return { x, y };
  }

  // Method นี้จะถูกเรียกเมื่อเมาส์ออกจากพื้นที่ของจุดบนแผนที่
  onMapPointLeave() {
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

  // ===== deck.gl Methods =====
  /**
   * Ingest a new telemetry point into the ring buffer (O(1) operation, no rendering)
   * This is called from addTelemetryPoint for realtime mode
   */
  private deckIngestPoint(point: TelemetryPoint): void {
    if (!this.isRealtimeMode) return;

    const lng = point.y; // Note: y is actually longitude
    const lat = point.x; // Note: x is actually latitude
    const ts = point.ts;
    const afr = point.afr ?? 14.0; // Default AFR if missing

    // Check if we need to wrap around (ring buffer full)
    if (this.ringBufferCount >= this.MAX_POINTS) {
      // Advance tail to make room (oldest point removed)
      this.ringBufferTail = (this.ringBufferTail + 1) % this.MAX_POINTS;
      this.ringBufferCount--;
    }

    const writeIdx = this.ringBufferHead;

    // Store timestamp for this point
    this.pointTimestamps[writeIdx] = ts;

    // Store current point position
    this.targetPositions[writeIdx * 2] = lng;
    this.targetPositions[writeIdx * 2 + 1] = lat;

    // If this is not the first point, create a segment from previous point to current
    if (this.ringBufferCount > 0) {
      const prevIdx = (writeIdx - 1 + this.MAX_POINTS) % this.MAX_POINTS;
      const segIdx = prevIdx; // Segment index = index of source point

      // Update segment: source = previous point position, target = current point position (already stored above)
      this.sourcePositions[segIdx * 2] = this.targetPositions[prevIdx * 2];
      this.sourcePositions[segIdx * 2 + 1] = this.targetPositions[prevIdx * 2 + 1];
      // Note: target for this segment is already stored in targetPositions[writeIdx] above

      // Set color based on AFR (RGBA)
      const color = this.afrToColorUint8(afr);
      this.segmentColors[segIdx * 4] = color[0];
      this.segmentColors[segIdx * 4 + 1] = color[1];
      this.segmentColors[segIdx * 4 + 2] = color[2];
      this.segmentColors[segIdx * 4 + 3] = 255; // Alpha
    }

    // Update latest marker position
    this.latestMarkerLngLat = [lng, lat];

    // Advance head
    this.ringBufferHead = (this.ringBufferHead + 1) % this.MAX_POINTS;
    this.ringBufferCount++;

    // Trim old points outside 30-minute window
    this.trimOldPoints(ts);

    // Mark as dirty for render
    this.deckDirty = true;
    this.scheduleDeckRender();
  }

  /**
   * Trim points older than 30 minutes from the rolling window
   */
  private trimOldPoints(currentTs: number): void {
    const cutoff = currentTs - this.WINDOW_MS;
    while (this.ringBufferCount > 0 && this.ringBufferTail !== this.ringBufferHead) {
      const tailTs = this.pointTimestamps[this.ringBufferTail];
      if (tailTs >= cutoff) break; // Still within window

      // Advance tail (remove oldest point)
      this.ringBufferTail = (this.ringBufferTail + 1) % this.MAX_POINTS;
      this.ringBufferCount--;
    }
  }

  /**
   * Convert AFR value to RGBA color (Uint8Array)
   * Uses same color logic as existing afrToColor function
   */
  private afrToColorUint8(afr: number): [number, number, number] {
    const AFR_LIMIT = this.afrLimit ?? 14;
    const AFR_MIN = 30;
    const AFR_MAX = 0;

    if (afr < AFR_LIMIT) {
      // Red for low AFR
      return [255, 0, 0];
    }

    // Green scale for normal AFR
    const t = Math.max(0, Math.min(1, (afr - AFR_MIN) / (AFR_MAX - AFR_MIN)));
    const hue = 120 * (1 - t); // 120 (green) to 0 (red)
    return this.hslToRgbUint8(hue, 1, 0.5);
  }

  /**
   * Convert HSL to RGB (Uint8)
   */
  private hslToRgbUint8(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;

    if (hp < 1) { r = c; g = x; b = 0; }
    else if (hp < 2) { r = x; g = c; b = 0; }
    else if (hp < 3) { r = 0; g = c; b = x; }
    else if (hp < 4) { r = 0; g = x; b = c; }
    else if (hp < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const m = l - c / 2;
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return [r, g, b];
  }

  /**
   * Schedule deck.gl render (throttled via requestAnimationFrame)
   * Separates marker update (frequent) from path update (throttled)
   */
  private scheduleDeckRender(): void {
    if (this.deckRafId !== null) return; // Already scheduled

    this.deckRafId = requestAnimationFrame(() => {
      this.deckRafId = null;
      if (this.deckDirty) {
        const now = Date.now();
        const shouldUpdatePath = now - this.lastPathUpdate >= this.MAP_PATH_UPDATE_MS;

        if (shouldUpdatePath) {
          this.deckRender();
          this.lastPathUpdate = now;
        } else {
          // Update only marker (frequent, lightweight)
          this.deckRenderMarkerOnly();
        }
      }
    });
  }

  /**
   * Render only marker (lightweight, can be called frequently)
   */
  private deckRenderMarkerOnly(): void {
    if (!this.deckOverlay || !this.latestMarkerLngLat) return;

    const layers: Layer[] = [
      new ScatterplotLayer({
        id: 'track-marker',
        data: [{ position: this.latestMarkerLngLat }],
        getPosition: (d: any) => d.position,
        getRadius: this.MARKER_RADIUS_PX,
        radiusUnits: 'pixels',
        getFillColor: [255, 59, 48, 255], // #FF3B30
        stroked: true,
        getLineColor: [255, 255, 255, 255], // White
        lineWidthMinPixels: 2,
        pickable: false,
        parameters: { depthTest: false }
      })
    ];

    this.deckOverlay.setProps({ layers });
  }

  // Reusable segment data array (to avoid GC pressure)
  private segmentDataArray: Array<{ source: [number, number]; target: [number, number]; color: [number, number, number, number] }> = [];

  /**
   * Render deck.gl layers (only called when dirty)
   * Uses typed arrays internally but converts to minimal objects for deck.gl API
   */
  private deckRender(): void {
    if (!this.deckOverlay || this.ringBufferCount < 2) {
      this.deckDirty = false;
      return; // Need at least 2 points for a segment
    }

    const layers: Layer[] = [];

    // Calculate valid segment range
    const segCount = this.ringBufferCount - 1; // Segments = points - 1
    if (segCount <= 0) {
      this.deckDirty = false;
      return;
    }

    // Pre-allocate segment data array (grow only, never shrink to avoid GC)
    // Only initialize new elements (reuse existing ones to minimize allocations)
    if (this.segmentDataArray.length < segCount) {
      const oldLength = this.segmentDataArray.length;
      this.segmentDataArray.length = segCount;
      // Only initialize new elements (reuse existing ones)
      for (let i = oldLength; i < segCount; i++) {
        this.segmentDataArray[i] = {
          source: [0, 0],
          target: [0, 0],
          color: [0, 0, 0, 255]
        };
      }
    }

    // Populate segment data from typed arrays (efficient conversion)
    // Optimized: Direct array access, minimal function calls
    if (this.ringBufferTail < this.ringBufferHead) {
      // No wrap: single contiguous segment
      for (let i = 0; i < segCount; i++) {
        const segIdx = this.ringBufferTail + i;
        const targetIdx = segIdx + 1; // Next point (no wrap in contiguous case)
        const data = this.segmentDataArray[i];
        // Direct typed array access (faster than function calls)
        data.source[0] = this.sourcePositions[segIdx * 2];
        data.source[1] = this.sourcePositions[segIdx * 2 + 1];
        data.target[0] = this.targetPositions[targetIdx * 2];
        data.target[1] = this.targetPositions[targetIdx * 2 + 1];
        data.color[0] = this.segmentColors[segIdx * 4];
        data.color[1] = this.segmentColors[segIdx * 4 + 1];
        data.color[2] = this.segmentColors[segIdx * 4 + 2];
        data.color[3] = this.segmentColors[segIdx * 4 + 3];
      }

      layers.push(new LineLayer({
        id: 'track-line',
        data: this.segmentDataArray.slice(0, segCount),
        getSourcePosition: (d: any) => d.source,
        getTargetPosition: (d: any) => d.target,
        getColor: (d: any) => d.color,
        getWidth: this.LINE_WIDTH_PX,
        widthUnits: 'pixels',
        pickable: false,
        parameters: { depthTest: false }
      }));
    } else {
      // Wrap-around: two segments (before and after wrap)
      const partALength = this.MAX_POINTS - this.ringBufferTail;
      const partBLength = this.ringBufferHead;

      // Part A: from tail to end of array
      if (partALength > 1) {
        const segCountA = partALength - 1;
        for (let i = 0; i < segCountA; i++) {
          const segIdx = this.ringBufferTail + i;
          const targetIdx = segIdx + 1; // Target is next point (no wrap in part A)
          const data = this.segmentDataArray[i];
          data.source[0] = this.sourcePositions[segIdx * 2];
          data.source[1] = this.sourcePositions[segIdx * 2 + 1];
          data.target[0] = this.targetPositions[targetIdx * 2];
          data.target[1] = this.targetPositions[targetIdx * 2 + 1];
          data.color[0] = this.segmentColors[segIdx * 4];
          data.color[1] = this.segmentColors[segIdx * 4 + 1];
          data.color[2] = this.segmentColors[segIdx * 4 + 2];
          data.color[3] = this.segmentColors[segIdx * 4 + 3];
        }

        layers.push(new LineLayer({
          id: 'track-line-a',
          data: this.segmentDataArray.slice(0, segCountA),
          getSourcePosition: (d: any) => d.source,
          getTargetPosition: (d: any) => d.target,
          getColor: (d: any) => d.color,
          getWidth: this.LINE_WIDTH_PX,
          widthUnits: 'pixels',
          pickable: false,
          parameters: { depthTest: false }
        }));
      }

      // Part B: from start of array to head
      if (partBLength > 1) {
        const segCountB = partBLength - 1;
        const segCountA = partALength > 1 ? partALength - 1 : 0;
        const offsetB = segCountA; // Offset for part B in segmentDataArray
        for (let i = 0; i < segCountB; i++) {
          const segIdx = i;
          const targetIdx = i + 1; // Target is next point (no wrap in part B)
          const data = this.segmentDataArray[offsetB + i];
          data.source[0] = this.sourcePositions[segIdx * 2];
          data.source[1] = this.sourcePositions[segIdx * 2 + 1];
          data.target[0] = this.targetPositions[targetIdx * 2];
          data.target[1] = this.targetPositions[targetIdx * 2 + 1];
          data.color[0] = this.segmentColors[segIdx * 4];
          data.color[1] = this.segmentColors[segIdx * 4 + 1];
          data.color[2] = this.segmentColors[segIdx * 4 + 2];
          data.color[3] = this.segmentColors[segIdx * 4 + 3];
        }

        layers.push(new LineLayer({
          id: 'track-line-b',
          data: this.segmentDataArray.slice(offsetB, offsetB + segCountB),
          getSourcePosition: (d: any) => d.source,
          getTargetPosition: (d: any) => d.target,
          getColor: (d: any) => d.color,
          getWidth: this.LINE_WIDTH_PX,
          widthUnits: 'pixels',
          pickable: false,
          parameters: { depthTest: false }
        }));
      }
    }

    // Add marker for latest position
    if (this.latestMarkerLngLat) {
      layers.push(new ScatterplotLayer({
        id: 'track-marker',
        data: [{ position: this.latestMarkerLngLat }],
        getPosition: (d: any) => d.position,
        getRadius: this.MARKER_RADIUS_PX,
        radiusUnits: 'pixels',
        getFillColor: [255, 59, 48, 255], // #FF3B30
        stroked: true,
        getLineColor: [255, 255, 255, 255], // ขาว
        lineWidthMinPixels: 2,
        pickable: false,
        parameters: { depthTest: false }
      }));
    }

    // Update overlay layers (single setProps call, batched for performance)
    this.deckOverlay.setProps({ layers });
    this.deckDirty = false;
  }

  /**
   * Initialize MapLibre map with deck.gl overlay or canvas (if no circuit match)
   */
  private initializeDeckMap(): void {
    // Get center for current circuit
    const center = getMapCenterForCircuit(this.circuitName);

    // If no circuit match, use canvas mode (empty area for drawing lines)
    if (!center) {
      this.useCanvasMode = true;
      this.initializeCanvasMap();
      return;
    }

    // Use deck.gl map mode
    this.useCanvasMode = false;

    if (!this.raceMapDeckRef?.nativeElement) {
      console.warn('[deck.gl] Map container not found, retrying...');
      setTimeout(() => this.initializeDeckMap(), 100);
      return;
    }

    const mapApiKey = APP_CONFIG.MAP.API_KEY;

    try {
      // Initialize MapLibre map
      this.deckMap = new MapLibreMap({
        container: this.raceMapDeckRef.nativeElement,
        style: `https://api.maptiler.com/maps/satellite/style.json?key=${mapApiKey}`,
        center: [center.lng, center.lat], // [lng, lat]
        zoom: 15.3,
        pitch: 0,
        bearing: 0
      });

      // Initialize deck.gl overlay with interleaved mode (WebGL2)
      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: []
      });

      this.deckMap.addControl(this.deckOverlay);

      // Start render loop
      this.scheduleDeckRender();

      console.log(`[deck.gl] Map initialized successfully for circuit: ${this.circuitName}`);
    } catch (error) {
      console.error('[deck.gl] Failed to initialize map:', error);
      // Fallback to canvas mode on error
      this.useCanvasMode = true;
      this.initializeCanvasMap();
    }
  }

  /**
   * Initialize canvas for drawing lines (when no circuit match)
   */
  private initializeCanvasMap(): void {
    if (!this.raceMapCanvasRef?.nativeElement) {
      console.warn('[Canvas Map] Canvas element not found, retrying...');
      setTimeout(() => this.initializeCanvasMap(), 100);
      return;
    }

    const canvas = this.raceMapCanvasRef.nativeElement;
    this.raceMapCanvasCtx = canvas.getContext('2d', { alpha: false });

    if (!this.raceMapCanvasCtx) {
      console.error('[Canvas Map] Failed to get canvas context');
      return;
    }

    // Set canvas size to match container
    const container = canvas.parentElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    // Clear canvas with background color
    if (this.raceMapCanvasCtx) {
      this.raceMapCanvasCtx.fillStyle = '#0e1113';
      this.raceMapCanvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Reset canvas drawing state
    this.canvasLastPoint = null;

    console.log('[Canvas Map] Canvas initialized for drawing lines (no circuit match)');
  }

  // Canvas drawing state (for non-map mode)
  private canvasLastPoint: { x: number; y: number; color: string } | null = null;

  /**
   * Draw point on canvas (for non-map mode)
   */
  private drawPointOnCanvas(point: TelemetryPoint): void {
    if (!this.raceMapCanvasCtx || !this.raceMapCanvasRef?.nativeElement) return;

    const canvas = this.raceMapCanvasRef.nativeElement;
    const afr = point.afr ?? 14.0;

    // Convert lat/lon to canvas coordinates (simple scaling - adjust as needed)
    // Note: This is a simple mapping, you may need to adjust based on your data range
    const scaleX = canvas.width / 360; // Assuming full longitude range
    const scaleY = canvas.height / 180; // Assuming full latitude range

    // Center at canvas middle (adjust offset as needed)
    const offsetX = canvas.width / 2;
    const offsetY = canvas.height / 2;

    const x = offsetX + (point.y * scaleX); // y is longitude
    const y = offsetY - (point.x * scaleY); // x is latitude (inverted)

    // Get color based on AFR
    const color = this.afrToColorHex(afr);

    // Draw line from last point to current point
    if (this.canvasLastPoint) {
      this.raceMapCanvasCtx.beginPath();
      this.raceMapCanvasCtx.moveTo(this.canvasLastPoint.x, this.canvasLastPoint.y);
      this.raceMapCanvasCtx.lineTo(x, y);
      this.raceMapCanvasCtx.strokeStyle = color;
      this.raceMapCanvasCtx.lineWidth = 2;
      this.raceMapCanvasCtx.stroke();
    }

    // Draw current point marker
    this.raceMapCanvasCtx.beginPath();
    this.raceMapCanvasCtx.arc(x, y, 4, 0, Math.PI * 2);
    this.raceMapCanvasCtx.fillStyle = '#00FFA3'; // Latest position color
    this.raceMapCanvasCtx.fill();

    // Update last point
    this.canvasLastPoint = { x, y, color };
  }

  /**
   * Convert AFR to hex color (for canvas)
   */
  private afrToColorHex(afr: number): string {
    const AFR_LIMIT = 13.5;
    const AFR_MIN = 10;
    const AFR_MAX = 20;

    if (afr < AFR_LIMIT) {
      return '#FF0000'; // Red for low AFR
    }

    // Green scale for normal AFR
    const t = Math.max(0, Math.min(1, (afr - AFR_MIN) / (AFR_MAX - AFR_MIN)));
    const hue = 120 * (1 - t); // 120 (green) to 0 (red)
    return this.hslToHex(hue, 1, 0.5);
  }

  /**
   * Convert HSL to hex (for canvas)
   */
  private hslToHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;

    if (hp < 1) { r = c; g = x; b = 0; }
    else if (hp < 2) { r = x; g = c; b = 0; }
    else if (hp < 3) { r = 0; g = c; b = x; }
    else if (hp < 4) { r = 0; g = x; b = c; }
    else if (hp < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const m = l - c / 2;
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private ro?: ResizeObserver;
  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initializeCanvas();
      this.calculateSvgScale();
      if (!this.circuitName) {
        this.initializeSvgTransformForCircuit();
      } else {
        this.initializeSvgTransformForCircuit();
      }
      // Initialize deck.gl map
      this.initializeDeckMap();
    }, 0);

    const ro = new ResizeObserver(() => {
      this.calculateSvgScale();
      if (this.trackCanvas?.nativeElement) {
        const canvas = this.trackCanvas.nativeElement;
        const container = canvas.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
          this.scheduleRender();
        }
      }
      // Resize deck.gl map
      if (this.deckMap) {
        this.deckMap.resize();
      }
      // Resize canvas map
      if (this.useCanvasMode && this.raceMapCanvasRef?.nativeElement) {
        const canvas = this.raceMapCanvasRef.nativeElement;
        const container = canvas.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
          // Redraw canvas
          if (this.raceMapCanvasCtx) {
            this.raceMapCanvasCtx.fillStyle = '#0e1113';
            this.raceMapCanvasCtx.fillRect(0, 0, canvas.width, canvas.height);
          }
          this.canvasLastPoint = null; // Reset to redraw path
        }
      }
    });
    if (this.mapSvgEl?.nativeElement) {
      ro.observe(this.mapSvgEl.nativeElement);
    }
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.wsSubscriptions.forEach(sub => sub.unsubscribe());
    this.rtBatchSubscription?.unsubscribe();
    this.rtBatch$.complete();

    // Close realtime WebSocket connection
    if (this.realtimeWS) {
      this.realtimeWS.close();
      this.realtimeWS = null;
    }
    this.ro?.disconnect();
    this.map?.remove();

    // Cleanup deck.gl
    if (this.deckRafId !== null) {
      cancelAnimationFrame(this.deckRafId);
      this.deckRafId = null;
    }
    if (this.deckOverlay) {
      this.deckOverlay.finalize();
      this.deckOverlay = null;
    }
    if (this.deckMap) {
      this.deckMap.remove();
      this.deckMap = null;
    }
    // Cleanup canvas
    this.raceMapCanvasCtx = null;
    this.canvasLastPoint = null;

    // Cancel animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Close WebSockets
    this.webSocketService.disconnectRealtime();
    this.webSocketService.disconnectHistory();
    this.webSocketService.disconnectStatus();
    this.disconnectWebSocket();
    this.clearStatusTimeout();

    // Clear buffers
    // Reset ring buffers (don't recreate arrays, just reset indices)
    this.telemetryBufferHead = 0;
    this.telemetryBufferTail = 0;
    this.telemetryBufferCount = 0;
    this.chartDisplayHead = 0;
    this.chartDisplayTail = 0;
    this.chartDisplayCount = 0;
    this.currentBucket = null;
    this.historyPoints = [];
    this.historyDownsampled = [];
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

  // ====== ฟังก์ชันสำหรับควบคุมการหมุนและกลับด้าน SVG ======

  /**
   * คำนวณ transform string สำหรับ SVG (ใช้กับ SVG transform attribute)
   * สำหรับการสะท้อนแบบภาพในกระจก (ซ้าย-ขวา)
   */
  getSvgTransformAttribute(): string {
    const viewBoxWidth = 800;
    const viewBoxHeight = 660;
    const centerX = viewBoxWidth / 2;
    const centerY = viewBoxHeight / 2;

    const transforms: string[] = [];

    // ย้ายไปที่จุดกึ่งกลางก่อน
    transforms.push(`translate(${centerX}, ${centerY})`);

    // การหมุน (รอบจุดกึ่งกลาง)
    if (this.svgRotation !== 0) {
      transforms.push(`rotate(${this.svgRotation})`);
    }

    // สะท้อนซ้าย-ขวา (แบบภาพในกระจก) - ใช้ scale(-1, 1)
    if (this.svgFlipHorizontal) {
      transforms.push(`scale(-1, 1)`);
    }

    // สะท้อนบน-ล่าง - ใช้ scale(1, -1)
    if (this.svgFlipVertical) {
      transforms.push(`scale(1, -1)`);
    }

    // ย้ายกลับ
    transforms.push(`translate(${-centerX}, ${-centerY})`);

    return transforms.join(' ') || '';
  }

  /**
   * คำนวณ transform string สำหรับ SVG (เก่า - ใช้กับ CSS)
   */
  get svgTransform(): string {
    return this.getSvgTransformAttribute();
  }

  // ====== ฟังก์ชันการหมุนและกลับด้าน ======

  /**
   * หมุน SVG ตามองศาที่กำหนด
   */
  rotateSvg(degrees: number): void {
    this.svgRotation = (this.svgRotation + degrees) % 360;
    if (this.svgRotation < 0) {
      this.svgRotation += 360;
    }
    this.applySvgTransform();
  }

  /**
   * ตั้งค่าการหมุน SVG โดยตรง
   */
  setSvgRotation(degrees: number): void {
    this.svgRotation = degrees % 360;
    if (this.svgRotation < 0) {
      this.svgRotation += 360;
    }
    this.applySvgTransform();
  }

  /**
   * กลับด้านแนวนอน
   */
  flipHorizontal(): void {
    this.svgFlipHorizontal = !this.svgFlipHorizontal;
    this.applySvgTransform();
  }

  /**
   * กลับด้านแนวตั้ง
   */
  flipVertical(): void {
    this.svgFlipVertical = !this.svgFlipVertical;
    this.applySvgTransform();
  }

  /**
   * รีเซ็ตการหมุนและกลับด้านทั้งหมด - กลับไปยังค่า default ตาม circuitName
   */
  resetSvgTransform(): void {
    this.initializeSvgTransformForCircuit();
  }

  /**
   * ตั้งค่าเริ่มต้นของการหมุนและกลับด้านตาม circuitName
   */
  private initializeSvgTransformForCircuit(): void {
    this.svgRotation = 0;
    this.svgFlipHorizontal = false;
    this.routeFlipHorizontal = true;
    this.svgFlipVertical = false;
    this.applySvgTransform();
  }

  /**
   * นำ transform ไปใช้กับ SVG element
   * ตอนนี้ใช้ SVG transform attribute ผ่าน getSvgTransformAttribute() ใน template แล้ว
   * Method นี้เหลือไว้สำหรับความเข้ากันได้
   */
  private applySvgTransform(): void {
    // ไม่ต้องทำอะไร เพราะตอนนี้ใช้ [attr.transform] ใน template แทน
    // แต่ยังคงเรียกใช้เพื่อให้แน่ใจว่า Angular detect changes
    this.cdr.detectChanges();
  }

  /**
   * ตั้งค่า preset bounds สำหรับ realtime mode
   * ใช้เพื่อป้องกันการขยับไปมาของแผนที่เมื่อมีข้อมูลใหม่เข้ามา
   * @param bounds - Bounds ที่ต้องการตั้งค่า (ถ้าเป็น null จะล้าง preset)
   */
  setPresetBoundsForRealtime(bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null): void {
    this.presetBoundsForRealtime = bounds;
    // อัปเดตแผนที่ทันทีถ้ามีข้อมูลอยู่แล้ว
    if (this.selectedRaceKey) {
      const selection = [this.selectedRaceKey];
      this.updateMapFromSelection(selection);
    }
  }

  /**
   * ตั้งค่า preset bounds สำหรับ realtime mode จาก raw data
   * จะคำนวณด้วยสูตรเดียวกับ initializeFixedBoundsForBric (เพิ่ม padding 10%)
   * @param rawMinLat - ค่า latitude ต่ำสุดจาก raw data
   * @param rawMaxLat - ค่า latitude สูงสุดจาก raw data
   * @param rawMinLon - ค่า longitude ต่ำสุดจาก raw data
   * @param rawMaxLon - ค่า longitude สูงสุดจาก raw data
   */
  setPresetBoundsFromRawData(
    rawMinLat: number,
    rawMaxLat: number,
    rawMinLon: number,
    rawMaxLon: number
  ): void {
    this.presetBoundsForRealtime = this.calculatePresetBoundsForRealtime(
      rawMinLat,
      rawMaxLat,
      rawMinLon,
      rawMaxLon
    );
    console.log('Preset bounds for realtime calculated from raw data:', this.presetBoundsForRealtime);
    // อัปเดตแผนที่ทันทีถ้ามีข้อมูลอยู่แล้ว
    if (this.selectedRaceKey) {
      const selection = [this.selectedRaceKey];
      this.updateMapFromSelection(selection);
    }
  }

  /**
   * จัดรูปแบบวันที่เป็น dd/mm/YYYY HH:MM:SS โดย mm เป็นตัวย่อเดือนภาษาอังกฤษ
   * @param date - Date object ที่ต้องการจัดรูปแบบ
   * @returns สตริงที่จัดรูปแบบแล้ว เช่น "15/Jan/2024 14:30:45"
   */
  private formatDateTime(date: Date): string {
    if (!date || isNaN(date.getTime())) {
      return '';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day} ${month}, ${year} ${hours}:${minutes}:${seconds}`;
  }
}

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
import { WebSocketMessage, WebSocketService } from '../../../service/websocket.service';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { EventService } from '../../../service/event.service';
import { ResetWarningLoggerComponent } from '../dashboard/reset-warning-logger/reset-warning-logger.component';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { APP_CONFIG, getApiWebSocket } from '../../../app.config';
import { DataProcessingService } from '../../../service/data-processing.service';
import { convertTelemetryToSvgPolyline, TelemetryPoint, TelemetryToSvgInput } from '../../../utility/gps-to-svg.util';



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
  // ลบ private ออก (การไม่ระบุ access modifier จะถือว่าเป็น public โดยอัตโนมัติ)

  // ตัวแปรสำหรับควบคุมการแสดงผลของจุดและ tooltip บนแผนที่
  hoverPoint = {
    visible: false,
    x: 0,
    y: 0,
    afr: 0
  };

  // ตัวแปรสำหรับเก็บ state ของจุดที่ถูกคลิก
  clickedPointState: {
    seriesIndex: number;
    dataPointIndex: number;
    timestamp: number;
  } | null = null;

  // ตรวจสอบว่าเป็น touch device หรือไม่ (สำหรับ iPad/Tablet)
  get isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

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
  @ViewChild('hoverCircle') hoverCircleEl?: ElementRef<SVGCircleElement>;

  private scaleX = 1;
  private scaleY = 1;

  // การหมุนและกลับด้าน SVG
  svgRotation = 0; // องศาการหมุน (0-360) - จะตั้งค่าเริ่มต้นตาม circuitName
  svgFlipHorizontal = false; // กลับด้านแนวนอน - จะตั้งค่าเริ่มต้นตาม circuitName
  svgFlipVertical = false; // กลับด้านแนวตั้ง

  tooltipStyle = {
    left: '0px',
    top: '0px',
    visibility: 'hidden' as 'hidden' | 'visible'
  };

  // สำหรับเก็บ fixed bounds สำหรับ bric (เพื่อไม่ให้แผนที่ปรับ scale ตลอดเวลา)
  private fixedBoundsForBric: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null = null;

  // ฟังก์ชันสำหรับตั้งค่า fixed bounds จากข้อมูลเริ่มต้น
  private initializeFixedBoundsForBric(all: Array<{lat: number; lon: number}>) {
    if (this.fixedBoundsForBric) return; // ถ้ามี bounds แล้ว ไม่ต้องตั้งใหม่

    if (all.length < 2) return;

    const lats = all.map(p => p.lat);
    const lons = all.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    // ใช้ padding 10% เพื่อให้มีพื้นที่เพียงพอสำหรับการเดินทางต่อเนื่อง
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
            this.hoverPoint.visible = false;
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
                  this.hoverPoint.visible = false;
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
          // สร้าง custom tooltip ที่แสดงพิกัดที่ถูก transform แล้ว
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

          // ดึงค่า AFR จากค่า y ของ series (ตรงกับค่าที่แสดงในกราฟ)
          const afrFromSeries = pointOnChart.y !== null && pointOnChart.y !== undefined
            ? pointOnChart.y
            : null;

          // สร้าง HTML สำหรับ tooltip
          const seriesName = seriesCfg?.name || `Series ${seriesIndex + 1}`;
          const value = series[seriesIndex]?.[dataPointIndex];
          const timeStr = new Date(timestamp).toLocaleTimeString();

          let tooltipHTML = `
            <div style="padding: 8px 12px;">
              <div style="font-weight: 600; margin-bottom: 4px;">${seriesName}: <span style="color: ${seriesCfg.color || '#fff'};">${value !== undefined ? value.toFixed(2) : 'N/A'}</span></div>
              <div style="font-size: 11px; color: #aaa; margin-bottom: 2px;">Time: ${timeStr}</div>
          `;

          if (closestMapPoint && (closestMapPoint.x !== 0 || closestMapPoint.y !== 0)) {
            // แปลงพิกัดให้สอดคล้องกับ transform
            const transformedPoint = this.applyTransform({ x: closestMapPoint.x, y: closestMapPoint.y });

            tooltipHTML += `
              <div style="font-size: 11px; color: #aaa; margin-bottom: 2px;">Original: (${closestMapPoint.x.toFixed(1)}, ${closestMapPoint.y.toFixed(1)})</div>
              <div style="font-size: 11px; color: #4FC3F7;">Transformed: (${transformedPoint.x.toFixed(1)}, ${transformedPoint.y.toFixed(1)})</div>
            `;

            // ใช้ค่า AFR จาก series (ตรงกับค่าที่แสดงในกราฟ)
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

  // สำหรับเก็บ SVG polyline ที่สร้างจาก telemetry points (first point centered)
  telemetrySvgPolyline: string = '';

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

  // ฟังก์ชันสำหรับอัปเดตแผนที่ให้แสดงเฉพาะ lap ที่เลือก
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
      // แสดงเฉพาะ lap ที่เลือก
      const selectedLap = this.raceLab[this.selectedLapIndex];
      console.log(`Displaying lap ${this.selectedLapIndex + 1} with ${selectedLap.length} points`);

      // สร้างแผนที่จาก lap เดียว
      this.buildMapFromSingleLap(selectedLap, this.selectedRaceKey!);

      // อัปเดตกราฟให้ใช้ข้อมูล lap เดียวกัน
      this.buildChartFromSingleLap(selectedLap);
    } else {
      console.log('Displaying all laps');
      // แสดงทุก lap
      this.buildMapFromLaps(this.raceLab, this.selectedRaceKey!);

      // อัปเดตกราฟให้ใช้ข้อมูลทุก lap
      this.buildChartsFromLaps(this.raceLab);
    }
  }

  // เก็บ reference ไปยัง lap data ที่ใช้สร้าง chart เพื่อให้การ hover ตรงกัน
  private currentLapDataForChart: MapPoint[] | null = null;
  private currentLapsDataForChart: MapPoint[][] | null = null;

  // ฟังก์ชันสำหรับสร้างแผนที่จาก lap เดียว
  private buildMapFromSingleLap(lap: MapPoint[], key: string) {
    // เก็บ reference ไปยัง lap data
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


  constructor(private router: Router, private route: ActivatedRoute, private cdr: ChangeDetectorRef
    , private toastr: ToastrService
    // , private loggerData: LoggerDataService
    , private http: HttpClient
    , private eventService: EventService
    , private webSocketService: WebSocketService
    ,private dataProcessingService: DataProcessingService

  ) {
    // Mock start point for lap counting
    // this.setStartPoint(798.479,-6054.195);
    this.setstartLatLongPoint(798.451662,-6054.358584);
    this.loadAndApplyConfig();
    // this.setCurrentPoints(this.buildMock(180));
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
      this.subscribeWebSocketMessages();
    }

  private subscribeWebSocketMessages() {
    this.webSocketService.message$.subscribe((message) => {
      let msgObj;
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
          // ตั้งค่าเริ่มต้นของการหมุนและกลับด้านตาม circuitName
          this.initializeSvgTransformForCircuit();

          // ใหม่
          this.countDetect  = detail.countDetect;
          this.afr          = detail.afr;
          this.afrAverage   = detail.afrAverage;
          this.loggerStatus       = detail.status || 'Offline';

          // เริ่มโหลดข้อมูลหลังจากได้ข้อมูลจาก API แล้วเท่านั้น
          this.initializeDataLoading();
        },
        error: (err) => console.error('getDetailLoggerInRace error:', err),
      });

  }

  private initializeDataLoading(): void {

    const cls = this.parameterClass ?? '';
    if (this.circuitName === 'bsc') {

      this.loadCsvAndDraw(`models/mock-data/practice_section_${cls}_test.csv`);
      this.loadCsvAndDraw(`models/mock-data/qualifying_section_${cls}.csv`);
      this.loadCsvAndDraw(`models/mock-data/race1_section_${cls}.csv`);
      this.loadCsvAndDraw(`models/mock-data/race2_section_${cls}.csv`);
      this.disconnectWebSocket();
      this.clearWebSocketData(); // clear ข้อมูลที่เกี่ยวข้อง
    } else if (this.circuitName === 'bric') {
      // ถ้าเป็น bric และ loggerId = 118 ให้โหลด CSV และวาดเส้นเหมือน bsc
      if (this.loggerID === 118) {
        this.loadCsvAndDraw(`models/mock-data/practice_section_ab_test_bric.csv`);
        this.disconnectWebSocket();
        this.clearWebSocketData(); // clear ข้อมูลที่เกี่ยวข้อง
      } else {
        // ถ้าเป็น bric แต่ loggerId != 118 ให้รอรับค่าจาก webSocketService
        this.initializeWebSocket(this.parameterLoggerID);
      }
    } else if (this.circuitName === 'sic'){
      this.loadCsvAndDraw(`models/mock-data/practice_section_ab_test_bric.csv`);
      // this.initializeWebSocket(this.parameterLoggerID);
    } else {
        this.initializeWebSocket(this.parameterLoggerID);

    }
  }

    clearWebSocketData(): void {
    this.webSocketService.clearLoggerData();
    this.wsLoggerData = [];
    this.allLogger = [];
    console.log('Cleared all WebSocket data');
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

          // สร้าง SVG polyline จาก telemetry points (first point centered)
          // this.generateTelemetrySvgFromDataKey(key, 800, 660, 40);

          // เลือก key ปัจจุบันเพื่อเรนเดอร์ทันที
          const selection = [key];
          this.updateChartsFromSelection(selection);
          this.updateMapFromSelection(selection);
          // console.log('Updated SVG points & charts (realtime)');
        }
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
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
    points: TelemetryPoint[],
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
      points
    };

    const svgString = convertTelemetryToSvgPolyline(input);
    this.telemetrySvgPolyline = svgString;
    return svgString;
  }

  /**
   * แปลงข้อมูลจาก allDataLogger หรือ allLogger เป็น TelemetryPoint[]
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

    // แปลง MapPoint[] เป็น TelemetryPoint[]
    const telemetryPoints: TelemetryPoint[] = dataPoints.map((p: MapPoint) => ({
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

    // ---- bounds สำหรับ normalize (เพิ่ม padding เพื่อไม่ให้ชิดขอบ)
    const lats = all.map(p => p.lat);
    const lons = all.map(p => p.lon);

    let minLat: number, maxLat: number, minLon: number, maxLon: number;
    let padding: number;

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
      minLat = Math.min(...lats);
      maxLat = Math.max(...lats);
      minLon = Math.min(...lons);
      maxLon = Math.max(...lons);

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
    const afrVals = all.map(p => p.afrValue).filter((v): v is number => Number.isFinite(v));
    const afrMin = afrVals.length ? Math.min(...afrVals) : AFR_DEFAULT_MIN;
    const afrMax = afrVals.length ? Math.max(...afrVals) : AFR_DEFAULT_MAX;

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

      // สำหรับ realtime: คำนวณจุดกึ่งกลางจากข้อมูลทั้งหมดเสมอ
      let centerPoint: { lat: number; lon: number } | null = null;

      // สำหรับ realtime: คำนวณ bounds จากข้อมูลของ key นี้เท่านั้น และขยายแบบไดนามิก
      let realtimeMinLat: number, realtimeMaxLat: number, realtimeMinLon: number, realtimeMaxLon: number;
      let realtimeSpanLat: number, realtimeSpanLon: number;
      let realtimePaddedMinLat: number, realtimePaddedMinLon: number;
      let realtimePaddedSpanLat: number, realtimePaddedSpanLon: number;

      if (isRealtimeMode && arr.length > 0) {
        // คำนวณ bounds จากข้อมูลทั้งหมด
        const lats = arr.map(p => p.lat);
        const lons = arr.map(p => p.lon);
        
        realtimeMinLat = Math.min(...lats);
        realtimeMaxLat = Math.max(...lats);
        realtimeMinLon = Math.min(...lons);
        realtimeMaxLon = Math.max(...lons);

        // คำนวณจุดกึ่งกลางจาก bounds (จะอัปเดตเมื่อมีข้อมูลมากขึ้น)
        centerPoint = {
          lat: (realtimeMinLat + realtimeMaxLat) / 2,
          lon: (realtimeMinLon + realtimeMaxLon) / 2
        };

        // คำนวณ span จาก bounds
        realtimeSpanLat = realtimeMaxLat - realtimeMinLat;
        realtimeSpanLon = realtimeMaxLon - realtimeMinLon;

        // กำหนด minimum span เพื่อไม่ให้ภาพเล็กลงเกินไปเมื่อข้อมูลยังน้อย
        // ใช้ค่า minimum span ที่เหมาะสม (เช่น 0.001 องศา หรือประมาณ 111 เมตร)
        const MIN_SPAN_LAT = 0.001; // ประมาณ 111 เมตร
        const MIN_SPAN_LON = 0.001; // ประมาณ 111 เมตร (ที่ละติจูดประเทศไทย)

        // ใช้ค่าที่มากกว่าจาก span จริงหรือ minimum span
        const effectiveSpanLat = Math.max(MIN_SPAN_LAT, realtimeSpanLat);
        const effectiveSpanLon = Math.max(MIN_SPAN_LON, realtimeSpanLon);

        // เพิ่ม padding เพื่อให้จุดไม่อยู่ขอบ SVG (ใช้ padding 15% เพื่อให้มีพื้นที่ว่างรอบๆ)
        const realtimePadding = 0.15;
        realtimePaddedSpanLat = effectiveSpanLat * (1 + 2 * realtimePadding);
        realtimePaddedSpanLon = effectiveSpanLon * (1 + 2 * realtimePadding);

        // ไม่ใช้ paddedMinLat/Lon เพราะจุดกึ่งกลางอยู่กึ่งกลาง SVG เสมอ
        realtimePaddedMinLat = 0;
        realtimePaddedMinLon = 0;
      }

      const SVG_CENTER_X = SVG_W / 2; // 400
      const SVG_CENTER_Y = SVG_H / 2; // 330

      // map เป็นพิกัด SVG (คำนวณให้อยู่ภายใน 0-800 และ 0-660)
      const pts = arr.map((r, i) => {
        let x: number, y: number;

        if (isRealtimeMode && centerPoint && realtimePaddedSpanLat > 0 && realtimePaddedSpanLon > 0) {
          // สำหรับ realtime: คำนวณความแตกต่างจากจุดกึ่งกลาง (ซึ่งจะอัปเดตเมื่อมีข้อมูลมากขึ้น)
          const deltaLat = r.lat - centerPoint.lat;
          const deltaLon = r.lon - centerPoint.lon;

          // คำนวณ normalized position ตาม bounds ที่ขยายแล้ว (จุดกึ่งกลาง = 0, 0)
          // realtimePaddedSpanLat/Lon ใช้เพื่อ normalize ให้จุดไม่อยู่ขอบ
          const normalizedX = deltaLon / realtimePaddedSpanLon;
          const normalizedY = deltaLat / realtimePaddedSpanLat;

          // คำนวณพิกัดโดยให้จุดกึ่งกลางอยู่กึ่งกลาง SVG เสมอ (normalized = 0, 0 -> SVG = center)
          // ใช้ 90% ของขนาด SVG เพื่อให้มี padding รอบๆ (5% ด้านละข้าง)
          const usableWidth = SVG_W * 0.9;
          const usableHeight = SVG_H * 0.9;

          x = SVG_CENTER_X + (normalizedX * usableWidth);
          y = SVG_CENTER_Y - (normalizedY * usableHeight); // ลบเพราะ Y แกนกลับกัน

          // Clamp ให้อยู่ในขอบเขต SVG (แต่ควรจะไม่เกินเพราะมี padding แล้ว)
          x = Math.max(0, Math.min(SVG_W, x));
          y = Math.max(0, Math.min(SVG_H, y));
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
        // ใช้ค่า AFR จาก series (ตรงกับค่าที่แสดงในกราฟ) แทนค่า AFR จาก closestMapPoint
        this.hoverPoint = {
          visible: true,
          x: closestMapPoint.x,
          y: closestMapPoint.y,
          afr: afrFromSeries !== null && !isNaN(afrFromSeries) ? afrFromSeries : closestMapPoint.afr
        };

        // ใช้ updateTooltipPosition เพื่อคำนวณตำแหน่งโดยคำนึงถึง transform
        this.updateTooltipPosition(this.hoverPoint.x, this.hoverPoint.y);
      }
    }
  }

  // Method นี้จะถูกเรียกเมื่อเมาส์เข้าสู่พื้นที่ของจุดบนแผนที่
  onMapPointEnter(point: { x: number; y: number; afr: number }) {
    this.hoverPoint = { visible: true, x: point.x, y: point.y, afr: point.afr };
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
      // หาจุดบนเส้นที่ใกล้ที่สุดเพื่อแสดง circle indicator
      const closestPoint = this.closestPointOnSegment(local, seg);

      this.hoverPoint = {
        visible: true,
        x: closestPoint.x, // ใช้จุดบนเส้นที่ใกล้ที่สุดสำหรับแสดง circle
        y: closestPoint.y,
        afr: seg.afr || 0
      };

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
    this.hoverPoint.visible = false;
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

    setTimeout(() => {
      this.calculateSvgScale();
      // ตั้งค่า transform เริ่มต้นตาม circuitName (ถ้ายังไม่ตั้งค่า)
      if (!this.circuitName) {
        // ถ้ายังไม่มี circuitName ให้ใช้ค่าเริ่มต้นเป็น bsc
        this.initializeSvgTransformForCircuit();
      } else {
        this.initializeSvgTransformForCircuit();
      }
    }, 0);

    const ro = new ResizeObserver(() => this.calculateSvgScale());
    ro.observe(this.mapSvgEl.nativeElement);

    // this.addRedDotSeries();
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.wsSubscriptions.forEach(sub => sub.unsubscribe());
    this.ro?.disconnect();
    this.map?.remove();
    // ปิด WebSocket ที่เปิดไว้ (ถ้ามี)
    this.webSocketService.disconnectRealtime();
    this.webSocketService.disconnectHistory();
    this.webSocketService.disconnectStatus();
    this.disconnectWebSocket();
    // ล้าง status timeout
    this.clearStatusTimeout();

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
    if (this.circuitName === 'bsc') {
      // bsc: หมุน 45° และสลับซ้ายขวา
      this.svgRotation = 45;
      this.svgFlipHorizontal = true;
      this.svgFlipVertical = false;
    } else {
      // bric และ sic: ไม่หมุนและไม่สลับด้าน
      this.svgRotation = 0;
      this.svgFlipHorizontal = false;
      this.svgFlipVertical = false;
    }
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
}

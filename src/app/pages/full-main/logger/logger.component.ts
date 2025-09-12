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
  @ViewChild('selectButton', { read: ElementRef }) selectButtonEl!: ElementRef<HTMLElement>;
  @ViewChild('select') select!: MatSelect;
  @ViewChild('chart') chart!: ChartComponent;

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
// 3) type guard ช่วยกรอง 'all'
private isChartKey = (k: SelectKey): k is ChartKey => k !== 'all';
  showRoutePath: boolean = true;


  svgPoints = '';
  startPoint = { x: 0, y: 0, lat: 0, long: 0 };
  // endPoint = { x: 0, y: 0, lat: 0, long: 0 };
  hasRouteData = false;
  trackImage: string | null = null;
  pageSize = 10; // จำนวนแถวต่อหน้า
  currentPage = 1; // หน้าปัจจุบัน
  showPageDataOnly = true; // แสดงเฉพาะข้อมูลของหน้าที่เลือก
  private subscriptions: Subscription[] = [];
  allLogger: CarLogger[] = [];

  private fieldMap: Record<ChartKey, keyof LoggerPoint> = {
    avgAfr: 'avgAfr',
    realtimeAfr: 'realtimeAfr',
    warningAfr: 'warningAfr',
    speed: 'speed'
  };



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
    this.chartFilter.valueChanges.pipe(startWith(this.chartFilter.value))
      .subscribe(values => {
        let v = (values ?? []) as SelectKey[];

        // ถ้าเลือก "ทั้งหมด" → ใช้ทุกเส้นจริง แล้ว sync ค่าใน dropdown
        if (v.includes('all')) {
          v = this.options.map(o => o.value); // type = ChartKey[]
          this.chartFilter.setValue(v, { emitEvent: false });
        }

        // กรอง 'all' ออกก่อนส่งเข้า series
        const keys = v.filter(this.isChartKey); // type = ChartKey[]
        this.selectedKeys = keys;
        this.refreshDetail(); // หรือ applySeries()
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
  private refreshDetail() {
    const series: ApexAxisChartSeries = this.selectedKeys.map((k) => {
      const name = this.options.find(o => o.value === k)?.label ?? k;
      const field = this.fieldMap[k];
      // ใช้รูปแบบ {x: timestamp(ms), y: number}
      const data = this.currentPoints.map(p => ({ x: p.ts, y: Number(p[field]) || null }));
      return { name, data };
    }) as ApexAxisChartSeries;

    this.detailOpts = { ...this.detailOpts, series };
  }

  private refreshBrush(): void {
    // ซีรีส์ทั้งหมดตามที่เลือกในกราฟแรก
    const series: ApexAxisChartSeries = this.selectedKeys.map(k => {
      const field = this.fieldMap[k];
      const name  = this.options.find(o => o.value === k)?.label ?? k;
      const data  = this.currentPoints.map(p => ({ x: p.ts, y: Number(p[field]) || null }));
      return { name, data };
    }) as ApexAxisChartSeries;

    // สี/เส้น ของ brush ให้เรียงตาม selectedKeys เช่นเดียวกับกราฟหลัก
    const colors      = this.selectedKeys.map(k => SERIES_COLORS[k]);
    const strokeWidth = this.selectedKeys.map(k => (k === 'warningAfr' ? 2 : 1.5));
    const dashArray   = this.selectedKeys.map(k => (k === 'warningAfr' ? 5 : 0));

    this.brushOpts = {
      ...this.brushOpts,
      series,
      colors,
      stroke: { ...this.brushOpts.stroke, width: strokeWidth, dashArray }
    };
  }
  private keyIndex(k: ChartKey) {
    return ['avgAfr','realtimeAfr','warningAfr','speed'].indexOf(k);
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

  ngAfterViewInit(): void {

  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    // this.wsSubscriptions.forEach(sub => sub.unsubscribe());

    // // ปิด WebSocket connection
    // this.webSocketService.disconnect();
  }

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

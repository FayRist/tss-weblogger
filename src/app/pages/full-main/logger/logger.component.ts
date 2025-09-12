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
  ApexAxisChartSeries, ApexChart, ApexXAxis, ApexStroke,
  ApexTooltip, ApexDataLabels, ChartComponent,
  NgxApexchartsModule,
  ApexOptions
} from 'ngx-apexcharts'; // (ถ้าใช้แพ็กเกจ ng-apexcharts ให้เปลี่ยนเป็น 'ng-apexcharts')

type AreaSmoothConfig = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  stroke: ApexStroke;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
};

interface LoggerPoint {
  time: string;        // ใช้เป็นแกน X (แสดง HH:mm:ss)
  lap: number;         // ถ้าจะใช้ lap เป็น X ก็ทำได้
  avgAfr: number;
  realtimeAfr: number;
  warningAfr: number;  // เช่นค่าขีดเตือน (อาจอยู่ช่วง 12.5-13.5)
  speed: number;       // km/h
}

type ChartKey = 'avgAfr' | 'realtimeAfr' | 'warningAfr' | 'speed' | 'all';
interface Opt { value: ChartKey; label: string; }

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

  options: Opt[] = [
    { value: 'avgAfr',      label: 'Average AFR' },
    { value: 'realtimeAfr', label: 'Realtime AFR' },
    { value: 'warningAfr',  label: 'Warning AFR' },
    { value: 'speed',       label: 'Speed' },
  ];

  selectedKeys: ChartKey[] = ['all', 'avgAfr', 'realtimeAfr'];
  currentPageData: any[] = [];

  areaSmoothChart: {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    stroke: ApexStroke;
    tooltip: ApexTooltip;
    dataLabels: ApexDataLabels;
  } = {
    series: [],
    chart:   { type: 'line', height: 300, animations: { enabled: true } },
    xaxis:   { categories: [] },
    stroke:  { curve: 'smooth', width: 2 },
    tooltip: { enabled: true },
    dataLabels: { enabled: false }
  };

  chartFilter = new FormControl<ChartKey[]>(['avgAfr','realtimeAfr'], { nonNullable: true });

  // chartFilter = new FormControl<ChartFilter[]>(['all'], { nonNullable: true });
  showRoutePath: boolean = true;
 // แผนที่ field ใน data -> ชื่อ key ของเรา
  private fieldMap: Record<Exclude<ChartKey, 'all'>, string> = {
    avgAfr: 'avgAfr',            // ถ้าของจริงเป็นชื่ออื่น เช่น 'AverageAFR' แก้ตรงนี้พอ
    realtimeAfr: 'realtimeAfr',  // เช่น 'RealtimeAFR'
    warningAfr: 'warningAfr',    // เช่น 'WarningAFR'
    speed: 'speed',              // เช่น 'Speed'
  };


  svgPoints = '';
  startPoint = { x: 0, y: 0, lat: 0, long: 0 };
  // endPoint = { x: 0, y: 0, lat: 0, long: 0 };
  hasRouteData = false;
  trackImage: string | null = null;
  pageSize = 10; // จำนวนแถวต่อหน้า
  currentPage = 1; // หน้าปัจจุบัน
  showPageDataOnly = true; // แสดงเฉพาะข้อมูลของหน้าที่เลือก
  private subscriptions: Subscription[] = [];
  areaSmoothChartMaps: Partial<ApexOptions>;
  allLogger: CarLogger[] = [];

  constructor(private router: Router, private route: ActivatedRoute, private cdr: ChangeDetectorRef ) {
    this.areaSmoothChart = {
      series: [
        {
          name: 'series1',
          data: []
        }
      ],
      chart: {
        height: 350,
        type: 'area'
      },
      dataLabels: {
        enabled: false
      },
      stroke: {
        curve: 'smooth'
      },
      xaxis: {
        categories: []
      },
      tooltip: {
        x: {
          format: 'HH:mm:ss'
        }
      }
    };

    this.areaSmoothChartMaps = {
      series: [
        {
          name: 'Route Path',
          data: []
        }
      ],
      chart: {
        type: 'line',
        height: 400,
        zoom: { enabled: true }
      },
      xaxis: {
        type: 'numeric',
        title: { text: 'Longitude' }
      },
      yaxis: {
        title: { text: 'Latitude' }
      },
      stroke: {
        curve: 'smooth',
        width: 3
      }
    };

    this.loadMockData();
  }

  loadMockData(): void {
    of(this.buildMockPoints()).pipe(delay(300)).subscribe(data => {
      this.setCurrentPageData(data);
    });
  }

  setSeries(data: number[]) {
    this.areaSmoothChart.series = [{ name: 'AFR', data }];
  }

  ngOnInit() {
    this.chartFilter.valueChanges.pipe(startWith(this.chartFilter.value))
      .subscribe(values => {
        let v = (values ?? []) as ChartKey[];
        if (v.includes('all')) {
          v = this.options.map(o => o.value) as ChartKey[];
          v = v.filter(k => k !== 'all');
          this.chartFilter.setValue(v, { emitEvent: false }); // sync ค่าใน dropdown
        }
        this.selectedKeys = v;
        this.applySeries();
      });

    // โหลด/อัปเดตข้อมูลครั้งแรก
    this.applySeries();
  }

  setCurrentPageData(data: any[]): void {
    this.currentPageData = Array.isArray(data) ? data : [];
    // สร้างแกน X (เลือกอย่างใดอย่างหนึ่งที่มี เช่น time, lap, index)
    const cats = this.currentPageData.map((d, i) =>
      d?.time ?? d?.lap ?? `${i + 1}`
    );
    this.areaSmoothChart = {
      ...this.areaSmoothChart,
      xaxis: { ...this.areaSmoothChart.xaxis, categories: cats }
    };
    this.applySeries();
  }



  showWarningAfr = true;
  showAverageAfr = true;

  private overlayEl?: HTMLElement;

  ngAfterViewInit(): void {
    // รองรับทั้งคลาสเก่า/ใหม่ของ Angular Material (MDC)
    const el = this.selectButtonEl.nativeElement.querySelector(
      '.mat-button-focus-overlay, .mat-mdc-button-ripple, .mdc-button__ripple'
    ) as HTMLElement | null;
    this.overlayEl = el || undefined;
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


  // navigateToInsertOrUpdate(){
  //   this.router.navigate(['/pages', 'logger/add-logger']);
  // }

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


  updateChartWithData(logs: CarLogger[]): void {
    // ใช้ข้อมูลเฉพาะ 1000 จุดล่าสุดเพื่อไม่ให้กราฟช้า
    const recentLogs = logs.slice(-1000);

    const dataVelocity = recentLogs.map(log => ({
      x: this.formatGpsTimeToText(log.time),
      y: parseFloat(log.velocity.toString())
    }));

    const dataHeight = recentLogs.map(log => ({
      x: this.formatGpsTimeToText(log.time),
      y: parseFloat(log.height)
    }));

    this.areaSmoothChart.series = [
      {
        name: 'velocity',
        data: dataVelocity
      },
      {
        name: 'height',
        data: dataHeight
      }
    ];


    this.areaSmoothChart.xaxis = {
      categories: recentLogs.map(log => this.formatToTimeLabel(log.time))
    };

    if (this.chart) {
      this.chart.updateOptions({
        series: this.areaSmoothChart.series,
        xaxis: this.areaSmoothChart.xaxis
      });
    }

    // อัพเดทแผนที่ด้วยข้อมูลทั้งหมด
    this.updateMapWithAllData();
  }
    // ฟังก์ชันสำหรับสลับโหมดการแสดงกราฟ
  onToggleChartMode(): void {
    console.log('Toggle chart mode:', this.showPageDataOnly);

    if (this.showPageDataOnly) {
      // แสดงเฉพาะข้อมูลของหน้าที่เลือก
      this.updateChartWithPageData(this.currentPageData);
    } else {
      // แสดงข้อมูลทั้งหมด (1000 จุดล่าสุด)
      if (this.allLogger.length > 0) {
        this.updateChartWithData(this.allLogger);
      }
    }
  }

    // ฟังก์ชันใหม่สำหรับอัพเดทกราฟด้วยข้อมูลของหน้าที่เลือก
  updateChartWithPageData(pageData: CarLogger[]): void {
    if (!pageData || pageData.length === 0) {
      // ถ้าไม่มีข้อมูล ให้ล้างกราฟ
      this.areaSmoothChart.series = [
        { name: 'velocity', data: [] },
        { name: 'height', data: [] }
      ];
      this.areaSmoothChart.xaxis = { categories: [] };

      if (this.chart) {
        this.chart.updateOptions({
          series: this.areaSmoothChart.series,
          xaxis: this.areaSmoothChart.xaxis
        });
      }
      return;
    }

    const dataVelocity = pageData.map(log => ({
      x: this.formatGpsTimeToText(log.time),
      y: parseFloat(log.velocity.toString())
    }));

    const dataHeight = pageData.map(log => ({
      x: this.formatGpsTimeToText(log.time),
      y: parseFloat(log.height)
    }));

    this.areaSmoothChart.series = [
      {
        name: 'velocity',
        data: dataVelocity
      },
      {
        name: 'height',
        data: dataHeight
      }
    ];

    this.areaSmoothChart.xaxis = {
      categories: pageData.map(log => this.formatToTimeLabel(log.time))
    };

    if (this.chart) {
      this.chart.updateOptions({
        series: this.areaSmoothChart.series,
        xaxis: this.areaSmoothChart.xaxis
      });
    }

    // อัพเดทแผนที่ด้วยข้อมูลของหน้าที่เลือก
    this.updateMapWithPageData(pageData);
  }

  // ฟังก์ชันใหม่สำหรับอัพเดทแผนที่ด้วยข้อมูลของหน้าที่เลือก
  updateMapWithPageData(pageData: CarLogger[]): void {
    if (!pageData || pageData.length === 0) {
      // ล้างแผนที่
      this.areaSmoothChartMaps.series = [
        { name: 'Route Path', data: [] }
      ];
      return;
    }

    // สร้างเส้นทางจากข้อมูล GPS
    const pathData = pageData
      .filter(log => log.lat && log.long) // กรองเฉพาะข้อมูลที่มี lat, long
      .map(log => ({
        x: parseFloat(log.long), // longitude
        y: parseFloat(log.lat)   // latitude
      }))
      .filter(point => !isNaN(point.x) && !isNaN(point.y)); // กรองข้อมูลที่ไม่ถูกต้อง

    console.log('GPS Path Data:', pathData);

    this.areaSmoothChartMaps = {
      series: [
        {
          name: 'Route Path',
          data: pathData
        }
      ],
      chart: {
        type: 'line',
        height: 400,
        zoom: { enabled: true }
      },
      xaxis: {
        type: 'numeric',
        title: { text: 'Longitude' }
      },
      yaxis: {
        title: { text: 'Latitude' }
      },
      stroke: {
        curve: 'smooth',
        width: 3,
        colors: ['#007bff']
      },
      markers: {
        size: 4,
        colors: ['#007bff'],
        strokeColors: '#fff',
        strokeWidth: 2
      },
      tooltip: {
        x: {
          formatter: function(val) {
            return 'Longitude: ' + val.toFixed(6);
          }
        },
        y: {
          formatter: function(val) {
            return 'Latitude: ' + val.toFixed(6);
          }
        }
      }
    };
  }

  // ฟังก์ชันสำหรับอัพเดทแผนที่ด้วยข้อมูลทั้งหมด
  updateMapWithAllData(): void {
    if (!this.allLogger || this.allLogger.length === 0) {
      return;
    }

    // ใช้ข้อมูลทั้งหมดหรือ 1000 จุดล่าสุด
    const mapData = this.allLogger.slice(-1000);
    this.updateMapWithPageData(mapData);
  }

  onMouseEnterZoom() {
    document.body.style.overflow = 'hidden';
  }

  onMouseLeaveZoom() {
    document.body.style.overflow = 'auto';
  }


  get triggerText(): string {
    const v = this.chartFilter.value;
    if (!v || v.length === 0 || v.includes('all')) return 'ทั้งหมด';
    if (v.length === 1) return this.options.find(o => o.value === v[0])?.label ?? 'เลือกตัวกรอง';
    return `เลือกแล้ว ${v.length}`;
  }

  onMultiSelectChange(e: MatSelectChange): void {
    const values = (e.value ?? []) as ChartKey[];
    // กันกรณีมี 'all' ปนกับค่าอื่น -> ถ้าเลือก all ให้เป็นทุกเส้น, ถ้า unselect all ให้คงของเดิม
    if (values.includes('all')) {
      const allKeys = this.options.map(o => o.value);
      this.selectedKeys = allKeys as ChartKey[];
      // ลบ 'all' ออกถ้าไม่อยากให้ถือเป็น series
      this.selectedKeys = this.selectedKeys.filter(k => k !== 'all');
    } else {
      this.selectedKeys = values;
    }
    this.applySeries();
  }

  applySeries(): void {
    // ให้ผลลัพธ์เป็น ApexAxisChartSeries (array ของ series objects)
    const series: ApexAxisChartSeries = this.selectedKeys.map((k) => {
      const label = this.options.find(o => o.value === k)?.label ?? k;
      const field = this.fieldMap[k as Exclude<ChartKey, 'all'>];

      const data = this.currentPageData.map(d => {
        const v = Number(d?.[field]);
        // ApexCharts รองรับ null เพื่อทำช่องว่างในกราฟได้
        return Number.isFinite(v) ? v : null;
      });

      // ชนิดของ element ใน ApexAxisChartSeries ต้องมีอย่างน้อย name/data
      return { name: label, data };
    }) as ApexAxisChartSeries;

    // อัปเดตแบบ immutable เพื่อกระตุ้นการเรนเดอร์ (รองรับ OnPush)
    this.areaSmoothChart = {
      ...this.areaSmoothChart,
      series
    };
    this.cdr.markForCheck();
  }


  // ใช้ flag ที่คำนวณไว้กับกราฟของคุณ
  updateChartVisibility() {
    // ตัวอย่าง (คอมเมนต์ไว้ตามไลบรารีที่คุณใช้)
    // this.chart?.toggleSeries('Warning AFR', this.showWarningAfr);
    // this.chart?.toggleSeries('Average AFR', this.showAverageAfr);
  }

  buildMockPoints(): LoggerPoint[] {
    const out: LoggerPoint[] = [];
    let afr = 13.2;         // ค่ากลาง AFR
    let rt = 13.2;          // realtime AFR เริ่มต้น
    let speed = 80;         // km/h เริ่ม
    const start = new Date('2025-06-15T10:00:00');

    for (let i = 0; i < 30; i++) {
      const t = new Date(start.getTime() + i * 1000); // ทุก 1 วินาที
      // จำลองการแกว่ง
      afr += (Math.random() - 0.5) * 0.05;
      rt += (Math.random() - 0.5) * 0.15;
      speed += (Math.random() - 0.5) * 2;

      out.push({
        time: t.toTimeString().slice(0, 8),
        lap: 1 + Math.floor(i / 5),      // ทุก 5 วิ = 1 lap (ตัวอย่าง)
        avgAfr: Number(afr.toFixed(2)),
        realtimeAfr: Number(rt.toFixed(2)),
        warningAfr: 13.0,                // เส้นเตือนคงที่ (จะเห็นเป็นเส้นตรง)
        speed: Math.max(0, Number(speed.toFixed(0))),
      });
    }
    return out;
  }
}

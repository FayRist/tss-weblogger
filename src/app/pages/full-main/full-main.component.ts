import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, ActivatedRoute, NavigationExtras } from '@angular/router';
import { distinctUntilChanged, filter, map, startWith } from 'rxjs/operators';
import { combineLatest, interval, Observable, Subscription, firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { AddEventComponent } from './add-event/add-event.component';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIcon } from '@angular/material/icon';
import { MatActionList } from '@angular/material/list';
import { MatDrawer, MatDrawerContainer } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { AsyncPipe, DatePipe } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { AuthService, Role } from '../../core/auth/auth.service';
import { EventService } from '../../service/event.service';
import { TimeService } from '../../service/time.service';
import { ToastrService } from 'ngx-toastr';
import { ConfigAfrModalComponent } from './config-afr-modal/config-afr-modal.component';

function insideParen(text: any): string | null {
  const s = String(text ?? '');               // บังคับเป็น primitive string
  const m = s.match(/\(([^)]*)\)/);
  return m ? m[1].trim() : null;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    // ถ้าไม่มี timezone ให้สมมติเป็นเวลาไทย (+07:00) และเปลี่ยน ' ' เป็น 'T'
    const iso = v.includes('T') || /Z|[+-]\d\d:?\d\d$/.test(v)
      ? v
      : v.replace(' ', 'T') + '+07:00';
    return new Date(iso);
  }
  // number (ms) หรืออย่างอื่น
  return new Date(v as any);
}


type OptionEvent = { value: number | string; name: String;  c_name: String;  active : String; };
type Option = { value: number | string; name: String };

type UrlParams = {
  eventId: number | null;
  raceId:  number | null;
  klass:   String | null;
  segment:    String | null;
};
const KEY = 'dashboard.lastParams';

@Component({
  selector: 'app-full-main',
  standalone: true,
  templateUrl: './full-main.component.html',
  styleUrl: './full-main.component.scss',
  imports: [
    MatToolbarModule, MatIcon, MatDrawerContainer, MatDrawer, MatActionList, MaterialModule,
    RouterOutlet, MatButtonModule,    AsyncPipe, DatePipe
  ],
})
export class FullMainComponent implements OnInit, OnDestroy {
  role$!: Observable<Role | null>;
  userName$!: Observable<String | null>;

  // currentTime: Date = new Date();
  private time = inject(TimeService);
  currentTime = this.time.now;                        // ใช้ใน template ได้เลย
  startOfDay = computed(() => new Date(this.time.now().setHours(0,0,0,0)));

  eventNameSelect:String = '';
  SessionNameSelect:String = '';
  SegmentNameSelect:String = '';

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  readonly dialog = inject(MatDialog);

  private subscriptions: Subscription[] = [];
  private sub!: Subscription;

  eventList: OptionEvent[] = [];
  SegmentList: Option[] = [];
  SessionList: Option[] = [];

  selectedEventId: number | null = null;   // เก็บค่าจาก URL
  selectedEvent?: Option;                  // ใช้โชว์ชื่อบน chip/dropdown

  selectedSession?: Option;                  // ใช้โชว์ชื่อบน chip/dropdown
  selectedSegment?: Option;                  // ใช้โชว์ชื่อบน chip/dropdown

  // จะถูกกำหนดใน ngOnInit
  urlParams$!: ReturnType<FullMainComponent['buildUrlParams$']>;

  /** true เฉพาะเมื่อ URL เริ่มด้วย /pages/dashboard */
  isDashboard$: Observable<boolean>;
  isRace$: Observable<boolean>;
  isSettingLogger$: Observable<boolean>;

  constructor(private router: Router
    , private auth: AuthService
    , private route: ActivatedRoute
    , private eventService: EventService
    , private toastr: ToastrService) {
    this.isDashboard$ = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith({ url: this.router.url } as NavigationEnd),        // ให้มีค่าเริ่มต้นตอนโหลดครั้งแรก
      map(() => this.router.url.startsWith('/pages/dashboard'))    // หรือจะใช้ regex ก็ได้
    );

    this.isRace$ = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith({ url: this.router.url } as NavigationEnd),        // ให้มีค่าเริ่มต้นตอนโหลดครั้งแรก
      map(() => this.router.url.startsWith('/pages/race'))    // หรือจะใช้ regex ก็ได้
    );

    this.isSettingLogger$ = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith({ url: this.router.url } as NavigationEnd),        // ให้มีค่าเริ่มต้นตอนโหลดครั้งแรก
      map(() => this.router.url.startsWith('/pages/setting-logger'))    // หรือจะใช้ regex ก็ได้
    );
  }


  ngOnInit(): void {
    // this.sub = interval(1000).subscribe(() => {
    //   this.currentTime = new Date(); // อัพเดททุกวินาที
    // });

    this.role$ = this.auth.user$.pipe(map(u => u?.role ?? null));
    this.userName$ = this.auth.user$.pipe(map(u => u?.username ?? null));

    this.urlParams$ = this.buildUrlParams$();
    const sub = this.urlParams$.subscribe(({ eventId, raceId, klass, segment }) => {

      const currentPath = this.router.url;
      const isDashboardPage = currentPath.includes('/pages/dashboard');
      if(!eventId && !raceId && !klass && !segment && isDashboardPage){
        // ส่งเป็น UTC เสมอ
        const now = toDate(this.time.now());
        this.eventService.getLoggerByDate(now).subscribe({
          next: ({ items, count }) => {
            if (items.length <= 0){
              return;
            }

            this.eventNameSelect = items[0].eventName || 'BANGSAEN';
            this.SegmentNameSelect = items[0].segmentValue;
            this.SessionNameSelect = items[0].sessionValue + " ( "+items[0].classValue +" ) ";

            if(isDashboardPage){
              this.router.navigate(['/pages', 'dashboard'], {
                queryParams: { eventId: items[0].eventId, raceId: items[0].idList, segment: items[0].segmentValue, class: items[0].classValue, circuitName: items[0].circuitName, statusRace: 'live'},
                onSameUrlNavigation: 'reload'
              });
            }
          },
          error: (e) => console.error(e),
        });
      }else{
        if(eventId){
          this.selectedEventId = eventId;
          this.loadDropDownEvent(eventId ?? undefined);
        }

        if(eventId && raceId){
          this.loadDropDownOptionSession(eventId ?? undefined, klass ?? undefined, segment ?? undefined, raceId);
          this.loadDropDownOptionSegment(eventId ?? undefined, klass ?? undefined, segment ?? undefined, raceId);
        }
      }

    });
    this.subscriptions.push(sub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    if (this.sub) {
      this.sub.unsubscribe();
    }


    // 1) ฟังการเปลี่ยน query params แล้วบันทึกลง localStorage
    this.route.queryParamMap.subscribe(pm => {
      const now = this.readParamsFromParamMap(pm);
      if (this.hasAnyParam(now)) {
        localStorage.setItem(KEY, JSON.stringify(now));
      }
    });

    // 2) ถ้าโหลดมาหน้านี้แล้ว "ไม่มี" params ใน URL -> เติมจาก localStorage
    const snap = this.route.snapshot.queryParamMap;
    const current = this.readParamsFromParamMap(snap);

    if (!this.hasAnyParam(current)) {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const last: UrlParams = JSON.parse(raw);
        const qp = this.toQueryParams(last);
        if (Object.keys(qp).length) {
          const extras: NavigationExtras = {
            queryParams: qp,
            queryParamsHandling: 'merge',
            // fragment: this.route.snapshot.fragment // ถ้าต้องการเก็บ hash fragment เพิ่ม
          };
          this.router.navigate([], extras);
        }
      }
    }

  }

    /** สร้าง observable อ่านค่าจาก URL (รองรับทั้ง path params และ query params) */
  private buildUrlParams$() {
    return combineLatest([
      this.route.paramMap.pipe(startWith(this.route.snapshot.paramMap)),
      this.route.queryParamMap.pipe(startWith(this.route.snapshot.queryParamMap)),
      this.router.events.pipe(
        filter(e => e instanceof NavigationEnd),
        startWith(null) // ให้ยิงครั้งแรกตอน init
      )
    ]).pipe(
      map(([params, query]) => {
        const qp = query; // alias
        const num = (v: String | null) => (+v! || null);

        const eventId = num(params.get('eventId') ?? qp.get('eventId'));
        const raceId  = num(params.get('raceId')  ?? qp.get('raceId'));
        const klass   = (params.get('class')     ?? qp.get('class'));
        const segment    = (params.get('segment')      ?? qp.get('segment'));

        const out: UrlParams = { eventId, raceId, klass, segment };
        return out;
      })
    );
  }

  navigateToDashboard(race: any = 0) {
    const selectedSession: string = String(this.SessionList.find(e => String(e.value) === String(race))?.name ?? '');
    const classSub = insideParen(selectedSession); // string | null
    const qp: any ={}
    if(race != 0){
      qp.raceId = race ;
    }
    if (classSub) {
      qp.class = classSub;
    }

      const currentPath = this.router.url;
      const isDashboardPage = currentPath.includes('/pages/dashboard');
        const now = toDate(this.time.now());
        this.eventService.getLoggerByDate(now).subscribe({
          next: ({ items, count }) => {
            if (items.length <= 0){
              return
            }

            this.eventNameSelect = items[0].eventName;
            this.SegmentNameSelect = items[0].segmentValue;
            this.SessionNameSelect = items[0].sessionValue + " ( "+items[0].classValue +" ) ";
              this.router.navigate(['/pages', 'dashboard'], {
                queryParams: { eventId: items[0].eventId, raceId: items[0].idList, segment: items[0].segmentValue, class: items[0].classValue, statusRace: 'live'},
              });
          },
          error: (e) => console.error(e),
        });
  }

  // navigateToListAllSeason() { this.router.navigate(['/pages', 'season']); }
  navigateToListAllSeason() { this.router.navigate(['/pages', 'event']); }
  navigateToListSettingLogger() {
    const now = toDate(this.time.now());
    this.eventService.getLoggerByDate(now).subscribe({
      next: ({ items, count }) => {
        if (items.length <= 0){
          return
        }
        this.eventNameSelect = items[0].eventName;
        this.router.navigate(['/pages', 'setting-logger'], {
          queryParams: { eventId: items[0].eventId, circuitName: items[0].circuitName},
          onSameUrlNavigation: 'reload'
        });
      },
      error: (e) => console.error(e),
    });
  }

  navigateToListConfigAFR2() { this.router.navigate(['/pages', 'admin-config']); }
  navigateToListConfigAFR(enterAnimationDuration: string, exitAnimationDuration: string) {
    // this.router.navigate(['/pages', 'setting-config-afr']);
    const dialogRef = this.dialog.open(ConfigAfrModalComponent, {
      width: "100vw",
      maxWidth: "450px",
      enterAnimationDuration,
      exitAnimationDuration,
      // data: {
      //   mode: modeName,
      //   loggerId: this.parameterLoggerID,
      //   raceId: this.parameterRaceId
      // }
    });

  }
  navigateToLogout() { this.router.navigate(['/login']); }

  async navigateToRace(eventId: any, eventName: String, activeRace: any, circuitName: String) {
    this.eventNameSelect = eventName;
    let statusRace = 'live'
    if(activeRace == 0){
      statusRace = 'history'
    }

    const isDashboard = await firstValueFrom(this.isDashboard$);
    const isSettingLogger = await firstValueFrom(this.isSettingLogger$);

    if(isDashboard) {
      this.router.navigate(['/pages', 'race'], {
        queryParams: { eventId, statusRace, circuitName },
        onSameUrlNavigation: 'reload'
      });
    }else if(isSettingLogger){
      this.router.navigate(['/pages', 'setting-logger'], {
        queryParams: { eventId: eventId, circuitName: circuitName},
        onSameUrlNavigation: 'reload'
      });
    }
  }

  navigateToAddSeason(enterAnimationDuration: string, exitAnimationDuration: string): void {
       const dialogRef = this.dialog.open(AddEventComponent, {
      width: '100vw', maxWidth: '750px',
      enterAnimationDuration, exitAnimationDuration,
    });
  }

  loadDropDownEvent(eventId?: number) {
    const s = this.eventService.getDropDownEvent().subscribe({
      next: (eventRes: OptionEvent[]) => {
        this.eventList = eventRes ?? [];

        // ถ้ามี eventId จาก URL ให้เลือกไว้เลย
        if (eventId != null) {
          this.selectedEvent =
            this.eventList.find(e => +e.value === +eventId) ?? undefined;
            this.eventNameSelect = this.eventList.find(e => +e.value === +eventId)?.name ?? '';
        } else {
          this.selectedEvent = undefined;
          this.eventNameSelect = '';
        }
      },
      error: (err) => console.error('Error loading events:', err)
    });
    this.subscriptions.push(s);
  }

  loadDropDownOptionSegment(eventId?: number, klass?: any, segment?: String, raceId?: any) {
    const s = this.eventService.getDropDownSegment(eventId, raceId).subscribe({
      next: (eventRes: Option[]) => {
        this.SegmentList = eventRes ?? [];

        // ถ้ามี eventId จาก URL ให้เลือกไว้เลย
        if (eventId != null) {
          if (segment) {
            let Text = segment + klass;
            const found = this.SegmentList.find(o =>
              (o.name ?? '').toLowerCase() === Text.toLowerCase()
            );
            this.selectedSegment = found ?? undefined;
            this.SegmentNameSelect = segment ?? '';
            // this.SegmentNameSelect = found?.name ?? '';
            return;
          }
        } else {
          this.selectedSegment = undefined;
          this.SegmentNameSelect = '';
        }
      },
      error: (err) => console.error('Error loading events:', err)
    });
    this.subscriptions.push(s);
  }

  loadDropDownOptionSession(eventId?: number, klass?: String, segment?: String, raceId?: any) {
    const s = this.eventService.getDropDownSession(eventId, raceId).subscribe({
      next: (eventRes: Option[]) => {
        this.SessionList = eventRes ?? [];

        // ถ้ามี eventId จาก URL ให้เลือกไว้เลย
        if (eventId != null) {
          this.selectedSession =
            this.SessionList.find(e => +e.value === raceId) ?? undefined;
            this.SessionNameSelect = this.SessionList.find(e => +e.value === raceId)?.name ?? '';
        } else {
          this.selectedSession = undefined;
          this.SessionNameSelect = '';
        }
      },
      error: (err) => console.error('Error loading events:', err)
    });
    this.subscriptions.push(s);
  }




  // ===== helpers =====

  private readParamsFromParamMap(pm: import('@angular/router').ParamMap): UrlParams {
    // รองรับทั้ง ?klass= และ ?class= (map class -> klass)
    const klassRaw = pm.get('klass') ?? pm.get('class');

    return {
      eventId: this.toNum(pm.get('eventId')),
      raceId:  this.toNum(pm.get('raceId')),
      klass:   (klassRaw && klassRaw.trim() !== '') ? klassRaw : null,
      segment: (pm.get('segment') && pm.get('segment')!.trim() !== '') ? pm.get('segment') : null,
    };
  }

  private toNum(v: string | null): number | null {
    if (v == null || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private hasAnyParam(p: UrlParams): boolean {
    return p.eventId !== null || p.raceId !== null || p.klass !== null || p.segment !== null;
  }

  /** แปลง UrlParams -> query params object (เฉพาะ key ที่มีค่า) */
  private toQueryParams(p: UrlParams): Record<string, string> {
    const qp: Record<string, string> = {};
    if (p.eventId !== null) qp['eventId'] = String(p.eventId);
    if (p.raceId  !== null) qp['raceId']  = String(p.raceId);
    if (p.segment !== null) qp['segment'] = String(p.segment);
    if (p.klass   !== null) qp['klass']   = String(p.klass);   // ใช้ชื่อ 'klass' เป็นหลัก
    return qp;
  }
}

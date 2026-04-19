import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, filter, map, startWith } from 'rxjs/operators';
import { combineLatest, interval, Observable, Subscription, firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { AddEventComponent } from './add-event/add-event.component';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIcon } from '@angular/material/icon';
import { MatActionList } from '@angular/material/list';
import { MatDrawer, MatDrawerContainer } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { AsyncPipe, DatePipe, Location } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { AuthService, Role } from '../../core/auth/auth.service';
import { EventService } from '../../service/event.service';
import { TimeService } from '../../service/time.service';
import { ToastrService } from 'ngx-toastr';
import { ConfigAfrModalComponent } from './config-afr-modal/config-afr-modal.component';
import { APP_CONFIG } from '../../app.config';
import { NavigationContextService } from '../../core/navigation/navigation-context.service';

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
  circuitName:    String | null;
  statusRace :    String | null;
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
  readonly menuVisibility = APP_CONFIG.AUTH.MENU_VISIBILITY;

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
  isLogger$: Observable<boolean>;

  constructor(private router: Router
    , private auth: AuthService
    , private route: ActivatedRoute
    , private eventService: EventService
    , private toastr: ToastrService
    , private location: Location
    , private navContext: NavigationContextService) {
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

    this.isLogger$ = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith({ url: this.router.url } as NavigationEnd),        // ให้มีค่าเริ่มต้นตอนโหลดครั้งแรก
      map(() => this.router.url.startsWith('/pages/logger'))    // หรือจะใช้ regex ก็ได้
    );
  }


  ngOnInit(): void {
    // this.sub = interval(1000).subscribe(() => {
    //   this.currentTime = new Date(); // อัพเดททุกวินาที
    // });

    this.role$ = this.auth.user$.pipe(map(u => u?.role ?? null));
    this.userName$ = this.auth.user$.pipe(map(u => u?.username ?? null));

    const sub = this.navContext.context$.subscribe(({ eventId, raceId, classCode, segment }) => {

      const currentPath = this.router.url;
      const isDashboardPage = currentPath.includes('/pages/dashboard');
      if(!eventId && !raceId && !classCode && !segment && isDashboardPage){
        // ส่งเป็น UTC เสมอ
        const now = toDate(this.time.now());
        this.eventService.getLoggerByDate(now).subscribe({
          next: ({ items, count }) => {
            if (items.length <= 0){
              this.navigateToHistoryEventFallback();
              return;
            }

            this.eventNameSelect = items[0].eventName || 'BANGSAEN';
            this.SegmentNameSelect = items[0].segmentValue;
            this.SessionNameSelect = items[0].sessionValue + " ( "+items[0].classValue +" ) ";

            if(isDashboardPage){
              this.navContext.replaceContext({
                eventId: Number(items[0].eventId),
                raceId: Number(items[0].idList),
                segment: items[0].segmentValue,
                classCode: items[0].classValue,
                circuit: items[0].circuitName,
                raceMode: 'live',
                loggerId: null,
              });
              this.router.navigate(['/pages', 'dashboard']);
            }
          },
          error: (e) => {
            console.error(e);
            this.navigateToHistoryEventFallback();
          },
        });
      }else{
        if(eventId){
          this.selectedEventId = eventId;
          this.loadDropDownEvent(eventId ?? undefined);
        }

        if(eventId && raceId){
          this.loadDropDownOptionSession(eventId ?? undefined, classCode ?? undefined, segment ?? undefined, raceId);
          this.loadDropDownOptionSegment(eventId ?? undefined, classCode ?? undefined, segment ?? undefined, raceId);
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
  }

  canShowMenu(menuKey: keyof typeof APP_CONFIG.AUTH.MENU_VISIBILITY): boolean {
    const role = this.auth.current?.role;
    if (!role) {
      return false;
    }
    const allowed = this.menuVisibility[menuKey] as readonly string[];
    return allowed.includes(role);
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
        const circuitName    = (params.get('circuitName')      ?? qp.get('circuitName'));
        const statusRace    = (params.get('statusRace')      ?? qp.get('statusRace'));

        const out: UrlParams = { eventId, raceId, klass, segment, circuitName, statusRace };
        return out;
      })
    );
  }


  async navigateToDashboard(race: any = 0) {
    const selectedSession: string = String(this.SessionList.find(e => String(e.value) === String(race))?.name ?? '');
    const classSub = insideParen(selectedSession); // string | null

    const isDashboard = await firstValueFrom(this.isDashboard$);
    if (!isDashboard) {
      return;
    }

    const currentParams = this.navContext.snapshot;
    const { eventId, segment, circuit, raceMode } = currentParams;

    // อัปเดต UI state
    if (segment) {
      this.SegmentNameSelect = segment;
    }
    if (selectedSession) {
      this.SessionNameSelect = selectedSession;
    }

    // Navigate และ reload หน้า
    this.navContext.patchContext({
      eventId,
      raceId: race != 0 ? Number(race) : currentParams.raceId,
      segment: segment ?? null,
      classCode: classSub,
      circuit: circuit ?? null,
      raceMode,
      loggerId: null,
    });

    this.router.navigate(['/pages', 'dashboard']);
  }

  navigateToDashboardOnDate() {
      const now = toDate(this.time.now());
      this.eventService.getLoggerByDate(now).subscribe({
        next: ({ items, count }) => {
          if (items.length <= 0){
            this.navigateToHistoryEventFallback();
            return
          }
            this.eventNameSelect = items[0].eventName;
            this.SegmentNameSelect = items[0].segmentValue;
            this.SessionNameSelect = items[0].sessionValue + " ( "+items[0].classValue +" ) ";
            this.navContext.replaceContext({
              eventId: Number(items[0].eventId),
              raceId: Number(items[0].idList),
              segment: items[0].segmentValue,
              classCode: items[0].classValue,
              circuit: items[0].circuitName,
              raceMode: 'live',
              loggerId: null,
            });
            this.router.navigate(['/pages', 'dashboard']);

        },
        error: (e) => {
          console.error(e);
          this.navigateToHistoryEventFallback();
        },
      });
  }

  private navigateToHistoryEventFallback(): void {
    this.navContext.replaceContext({ raceMode: 'history' });
    this.router.navigate(['/pages', 'event']);
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
        this.navContext.replaceContext({
          eventId: Number(items[0].eventId),
          circuit: items[0].circuitName,
          raceMode: 'live',
          raceId: null,
          loggerId: null,
          classCode: null,
          segment: null,
        });
        this.router.navigate(['/pages', 'setting-logger']);
      },
      error: (e) => console.error(e),
    });
  }

  navigateToListConfigAFR2() { this.router.navigate(['/pages', 'admin-config']); }
  navigateToUserManagement() { this.router.navigate(['/pages', 'user-management']); }
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

  navigateBack(): void {
    this.location.back();
  }

  async navigateToRace(eventId: any, eventName: String, activeRace: any, circuitName: String) {
    this.eventNameSelect = eventName;
    let statusRace = 'live'
    if(activeRace == 0){
      statusRace = 'history'
    }

    const isDashboard = await firstValueFrom(this.isDashboard$);
    const isSettingLogger = await firstValueFrom(this.isSettingLogger$);
    const isRace = await firstValueFrom(this.isRace$);

    if(isDashboard || isRace) {
      this.navContext.replaceContext({
        eventId: Number(eventId),
        raceMode: statusRace === 'history' ? 'history' : 'live',
        circuit: String(circuitName ?? ''),
        raceId: null,
        loggerId: null,
        classCode: null,
        segment: null,
      });
      this.router.navigate(['/pages', 'race']);
    }else if(isSettingLogger){
      this.navContext.replaceContext({
        eventId: Number(eventId),
        circuit: String(circuitName ?? ''),
        raceMode: statusRace === 'history' ? 'history' : 'live',
        raceId: null,
        loggerId: null,
        classCode: null,
        segment: null,
      });
      this.router.navigate(['/pages', 'setting-logger']);
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
      circuitName: (pm.get('circuitName') && pm.get('circuitName')!.trim() !== '') ? pm.get('circuitName') : null,
      statusRace: (pm.get('statusRace') && pm.get('statusRace')!.trim() !== '') ? pm.get('statusRace') : null,
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

import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, ActivatedRoute } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { combineLatest, interval, Observable, Subscription } from 'rxjs';
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
type Option = { value: number | string; name: string };

type UrlParams = {
  eventId: number | null;
  raceId:  number | null;
  klass:   string | null;
  segment:    string | null;
};

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
  userName$!: Observable<string | null>;

  currentTime: Date = new Date();

  eventNameSelect:string = '';
  SessionNameSelect:string = '';
  SegmentNameSelect:string = '';

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  readonly dialog = inject(MatDialog);

  private subscriptions: Subscription[] = [];
  private sub!: Subscription;

  eventList: Option[] = [];
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
    , private eventService: EventService) {
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
    this.sub = interval(1000).subscribe(() => {
      this.currentTime = new Date(); // อัพเดททุกวินาที
    });

    this.role$ = this.auth.user$.pipe(map(u => u?.role ?? null));
    this.userName$ = this.auth.user$.pipe(map(u => u?.username ?? null));

    this.urlParams$ = this.buildUrlParams$();
    const sub = this.urlParams$.subscribe(({ eventId, raceId, klass, segment }) => {
      if(eventId){
        this.selectedEventId = eventId;
        this.loadDropDownEvent(eventId ?? undefined);
      }

      if(eventId && raceId){
        this.loadDropDownOptionSession(eventId ?? undefined, klass ?? undefined, segment ?? undefined, raceId);
        this.loadDropDownOptionSegment(eventId ?? undefined, klass ?? undefined, segment ?? undefined, raceId);
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
        const num = (v: string | null) => (+v! || null);

        const eventId = num(params.get('eventId') ?? qp.get('eventId'));
        const raceId  = num(params.get('raceId')  ?? qp.get('raceId'));
        const klass   = (params.get('class')     ?? qp.get('class'));
        const segment    = (params.get('segment')      ?? qp.get('segment'));

        const out: UrlParams = { eventId, raceId, klass, segment };
        return out;
      })
    );
  }


  navigateToDashboard(eventId:any) { this.router.navigate(['/pages', 'dashboard']); }
  // navigateToListAllSeason() { this.router.navigate(['/pages', 'season']); }
  navigateToListAllSeason() { this.router.navigate(['/pages', 'event']); }
  navigateToListSettingLogger() { this.router.navigate(['/pages', 'setting-logger']); }
  navigateToLogout() { this.router.navigate(['/login']); }

  navigateToRace(eventId: any, eventName: string) {
    this.eventNameSelect = eventName;
    this.router.navigate(['/pages', 'race'], {
      queryParams: { eventId }
    });
  }

  navigateToAddSeason(enterAnimationDuration: string, exitAnimationDuration: string): void {
       const dialogRef = this.dialog.open(AddEventComponent, {
      width: '100vw', maxWidth: '750px',
      enterAnimationDuration, exitAnimationDuration,
    });
  }

  loadDropDownEvent(eventId?: number) {
    const s = this.eventService.getDropDownEvent().subscribe({
      next: (eventRes: Option[]) => {
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
            this.SegmentNameSelect = found?.name ?? '';
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
            this.SessionList.find(e => +e.value === +eventId) ?? undefined;
            this.SessionNameSelect = this.SessionList.find(e => +e.value === +eventId)?.name ?? '';
        } else {
          this.selectedSession = undefined;
          this.SessionNameSelect = '';
        }
      },
      error: (err) => console.error('Error loading events:', err)
    });
    this.subscriptions.push(s);
  }
}

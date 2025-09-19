import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, ActivatedRoute } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { combineLatest, Observable, Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { AddEventComponent } from './add-event/add-event.component';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIcon } from '@angular/material/icon';
import { MatActionList } from '@angular/material/list';
import { MatDrawer, MatDrawerContainer } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { AsyncPipe } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { AuthService, Role } from '../../core/auth/auth.service';
import { EventService } from '../../service/event.service';
type Option = { value: number | string; name: string };

type UrlParams = {
  eventId: number | null;
  raceId:  number | null;
  klass:   string | null;
  date:    string | null;
};

@Component({
  selector: 'app-full-main',
  standalone: true,
  templateUrl: './full-main.component.html',
  styleUrl: './full-main.component.scss',
  imports: [
    MatToolbarModule, MatIcon, MatDrawerContainer, MatDrawer, MatActionList, MaterialModule,
    RouterOutlet, MatButtonModule,    AsyncPipe
  ],
})
export class FullMainComponent implements OnInit, OnDestroy {
  role$!: Observable<Role | null>;
  userName$!: Observable<string | null>;


  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  readonly dialog = inject(MatDialog);

  private subscriptions: Subscription[] = [];

  eventList: Option[] = [];
  selectedEventId: number | null = null;   // เก็บค่าจาก URL
  selectedEvent?: Option;                  // ใช้โชว์ชื่อบน chip/dropdown
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
    this.role$ = this.auth.user$.pipe(map(u => u?.role ?? null));
    this.userName$ = this.auth.user$.pipe(map(u => u?.username ?? null));

    this.urlParams$ = this.buildUrlParams$();
    const sub = this.urlParams$.subscribe(({ eventId }) => {
      this.selectedEventId = eventId;
      this.loadDropDownEvent(eventId ?? undefined);
    });
    this.subscriptions.push(sub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
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
        const raceId  = num(params.get('eventId')  ?? qp.get('raceId'));
        const klass   = (params.get('class')     ?? qp.get('class')) || null;
        const date    = (params.get('date')      ?? qp.get('date'))  || null;

        const out: UrlParams = { eventId, raceId, klass, date };
        return out;
      })
    );
  }


  navigateToDashboard() { this.router.navigate(['/pages', 'dashboard']); }
  // navigateToListAllSeason() { this.router.navigate(['/pages', 'season']); }
  navigateToListAllSeason() { this.router.navigate(['/pages', 'event']); }
  navigateToListSettingLogger() { this.router.navigate(['/pages', 'setting-logger']); }
  navigateToLogout() { this.router.navigate(['/login']); }

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
        } else {
          this.selectedEvent = undefined;
        }
      },
      error: (err) => console.error('Error loading events:', err)
    });
    this.subscriptions.push(s);
  }

}

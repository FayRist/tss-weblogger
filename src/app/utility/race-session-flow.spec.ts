import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { FlatpickrDefaults } from 'angularx-flatpickr';
import { AddRaceComponent } from '../pages/full-main/add-race/add-race.component';
import { DialogAnimationsModalEdit, RaceComponent } from '../pages/full-main/race/race.component';
import { EventService } from '../service/event.service';
import { APP_CONFIG, getApiUrl } from '../app.config';

// Real component submit/load methods and EventService, with HTTP isolated from production.
describe('Numbered Race create / GET / display / edit / save flow (mock HTTP)', () => {
  let http: HttpTestingController;
  let service: EventService;
  const endpoints = APP_CONFIG.API.ENDPOINTS;
  let dialogData: any;

  beforeEach(() => {
    dialogData = { event_id: 42, race_data: [] };
    TestBed.configureTestingModule({
      imports: [AddRaceComponent, DialogAnimationsModalEdit],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations(), EventService, FlatpickrDefaults,
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy() } },
        { provide: ToastrService, useValue: { error: jasmine.createSpy(), success: jasmine.createSpy() } }
      ]
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EventService);
  });

  afterEach(() => http.verify());

  for (const name of ['Race 7', 'Race 10']) {
    it(`displays and accepts ${name} in both actual form templates`, async () => {
      const addFixture = TestBed.createComponent(AddRaceComponent);
      const add = addFixture.componentInstance;
      spyOn(add, 'loadDropDownEvent').and.stub(); // No unrelated dropdown/config requests.
      addFixture.detectChanges();
      addFixture.nativeElement.querySelector('button.btn-primary').click();
      await addFixture.whenStable();
      addFixture.detectChanges();
      const input: HTMLInputElement = addFixture.nativeElement.querySelector('input[placeholder="เลือกหรือพิมพ์ Race 7"]');
      input.value = name;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await addFixture.whenStable();
      expect(add.selectedSessions[0].label).toBe(name);

      dialogData.race_data = [{ id_list: 107, event_id: 42, class_value: 'a', session_value: name,
        session_start: '2026-10-28T03:00:00Z', session_end: '2026-10-28T04:00:00Z' }];
      service.eventOption = [{ name: 'Event', value: '42' }] as any;
      const editFixture = TestBed.createComponent(DialogAnimationsModalEdit);
      editFixture.detectChanges();
      await editFixture.whenStable();
      const editInput: HTMLInputElement = editFixture.nativeElement.querySelector('input[placeholder="เลือกหรือพิมพ์ Race 7"]');
      expect(editInput.value).toBe(name);
      editInput.value = name.toLowerCase();
      editInput.dispatchEvent(new Event('input'));
      editInput.dispatchEvent(new Event('blur'));
      await editFixture.whenStable();
      expect(editFixture.componentInstance.sessionValue).toBe(name);
      addFixture.destroy();
      editFixture.destroy();
    });

    it(`round-trips ${name} and retains its ID when edited and saved`, () => {
      const start = new Date('2026-10-28T03:00:00Z');
      const end = new Date('2026-10-28T04:00:00Z');
      const toast = { error: jasmine.createSpy(), success: jasmine.createSpy() };
      const add: any = Object.create(AddRaceComponent.prototype);
      Object.assign(add, {
        eventService: service, toastr: toast, dialogRef: { close: jasmine.createSpy() },
        eventId: '42', seasonId: 1, classValue: ['a'], segmentValue: 'pickup',
        selectedSessions: [{ key: 'one', label: name.toLowerCase(), start, end }]
      });
      add.onSessionLabelBlur(add.selectedSessions[0]);
      add.submitRace();
      const create = http.expectOne(getApiUrl(endpoints.ADD_RACE));
      expect(create.request.method).toBe('POST');
      expect(create.request.body[0].session_value).toBe(name);
      const stored = JSON.parse(JSON.stringify({ ...create.request.body[0], id_list: 107 }));
      create.flush({ success: true });

      const page: any = Object.create(RaceComponent.prototype);
      Object.assign(page, { eventService: service, subscriptions: [], allRace: [] });
      page.loadRace(42, '');
      const get = http.expectOne(request => request.url === getApiUrl(endpoints.GET_RACE));
      expect(get.request.params.get('eventId')).toBe('42');
      get.flush({ data: [stored] });
      expect(page.allRace[0].session_value).toBe(name);

      const edit: any = Object.create(DialogAnimationsModalEdit.prototype);
      Object.assign(edit, {
        eventService: service, toastr: toast, dialogRef: { close: jasmine.createSpy() },
        data: { race_data: page.allRace }, subscriptions: [],
        eventList: [{ name: 'Event', value: '42' }],
        _adapter: { setLocale: () => {} },
        range: new FormGroup({ start: new FormControl<Date | null>(null), end: new FormControl<Date | null>(null) })
      });
      // ngOnInit reads both locale.set(...) and locale().
      edit._locale = Object.assign(() => 'en', { set: () => {} });
      edit.ngOnInit();
      expect(edit.sessionValue).toBe(name);
      expect(edit.filteredSessionOptions).toContain(name);
      edit.range.controls.end.setValue(new Date('2026-10-28T04:30:00Z'));
      edit.onSubmit();
      const update = http.expectOne(getApiUrl(endpoints.UPDATE_RACE));
      expect(update.request.body.id_list).toBe(107);
      expect(update.request.body.session_value).toBe(name);
      expect(update.request.body.session_end.toISOString()).toBe('2026-10-28T04:30:00.000Z');
      const saved = JSON.parse(JSON.stringify({ ...stored, ...update.request.body }));
      update.flush({ success: true });

      page.loadRace(42, '');
      http.expectOne(request => request.url === getApiUrl(endpoints.GET_RACE)).flush({ data: [saved] });
      expect(page.allRace[0].session_value).toBe(name);
      expect(new Date(page.allRace[0].session_end).toISOString()).toBe('2026-10-28T04:30:00.000Z');
      expect(toast.error).not.toHaveBeenCalled();
    });
  }

  it('uses natural Race order only after start/end time ordering', () => {
    const page: any = Object.create(RaceComponent.prototype);
    Object.assign(page, { eventService: service, subscriptions: [], allRace: [] });
    page.loadRace(42, '');
    const row = (name: string, start = '2026-10-28T03:00:00Z') => ({
      session_value: name, session_start: start, session_end: '2026-10-28T04:00:00Z'
    });
    http.expectOne(request => request.url === getApiUrl(endpoints.GET_RACE)).flush({ data: [
      row('Race 10'), row('Race 7'), row('Race 2'), row('Race 25', '2026-10-28T02:00:00Z')
    ] });
    expect(page.allRace.map((race: any) => race.session_value)).toEqual(['Race 25', 'Race 2', 'Race 7', 'Race 10']);
  });

  it('naturally sorts Session dropdown labels without changing their IDs', () => {
    let options: any[] = [];
    service.getDropDownSession(42, 1).subscribe(result => options = result);
    http.expectOne(getApiUrl(endpoints.EVENT_SESSION_DROPDOWN)).flush({ data: [
      { name: 'Race 10 ( a )', value: '110' }, { name: 'Race 7 ( a )', value: '107' }
    ] });
    expect(options.map(option => option.value)).toEqual(['107', '110']);
  });
});

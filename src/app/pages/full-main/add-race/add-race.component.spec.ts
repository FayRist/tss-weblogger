import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddRaceComponent } from './add-race.component';

describe('AddRaceComponent', () => {
  let component: AddRaceComponent;
  let fixture: ComponentFixture<AddRaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddRaceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddRaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('AddRaceComponent custom race numbers', () => {
  let component: any;

  beforeEach(() => {
    component = Object.create(AddRaceComponent.prototype);
    component.sessionNameOptions = ['Race 1', 'Race 6', 'Practice 1', 'Test Session', 'Qualifying'];
    component.selectedSessions = [];
  });

  it('accepts race numbers beyond the preset list and preserves existing sessions', () => {
    for (const label of ['Race 7', 'Race 10', 'Race 25', 'race 100', 'Practice 1', 'Test Session', 'Qualifying']) {
      expect(component.isValidSessionName(label)).withContext(label).toBeTrue();
    }
  });

  it('rejects invalid race numbers', () => {
    for (const label of ['', 'Race 0', 'Race -1', 'Race 1.5', 'Race 01', 'Race abc', 'Race 7 extra']) {
      expect(component.isValidSessionName(label)).withContext(label).toBeFalse();
    }
  });

  it('keeps a typed custom race on blur', () => {
    const row = { label: ' Race 25 ' };
    component.onSessionLabelBlur(row);
    expect(row.label).toBe('Race 25');
  });

  it('offers the typed race as an autocomplete option without duplicating presets', () => {
    expect(component.getFilteredSessionOptions({ label: 'race 25' })).toEqual(['Race 25']);
    expect(component.getFilteredSessionOptions({ label: 'Race 6' })).toEqual(['Race 6']);
  });

  it('accepts a custom race in timeline validation and still rejects duplicate names', () => {
    const row = { label: 'Race 25', start: new Date('2026-10-28T03:00:00Z'), end: new Date('2026-10-28T04:00:00Z') };
    component.selectedSessions = [row];
    expect(component.validateSessionTimeline(false, true)).toBeTrue();
    component.selectedSessions.push({ ...row });
    expect(component.validateSessionTimeline(false, true)).toBeFalse();
  });
});

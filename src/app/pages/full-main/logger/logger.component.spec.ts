import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoggerComponent } from './logger.component';

describe('LoggerComponent', () => {
  let component: LoggerComponent;
  let fixture: ComponentFixture<LoggerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoggerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoggerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses the configured AFR direction for map colors', () => {
    component.afrLimit = 10.4;
    component.afrWarningHigh = 14.65;

    expect(component.getAfrColor(9.99)).toBe('#22c55e');
    expect(component.getAfrColor(10)).toBe('#ef4444');
    expect(component.getAfrColor(10.4)).toBe('#ef4444');
    expect(component.getAfrColor(12.5)).not.toBe('#ef4444');
    expect(component.getAfrColor(12.5)).not.toBe('#22c55e');
    expect(component.getAfrColor(14.65)).toBe('#22c55e');
    expect(component.getAfrColor(20)).toBe('#22c55e');
  });

  it('keeps missing AFR values neutral instead of treating them as high AFR', () => {
    expect(component.getAfrColor(undefined)).toBe('#808080');
    expect((component as any).normalizeHistoryAfr(undefined)).toBeUndefined();
    expect((component as any).normalizeHistoryAfr(30)).toBe(30);
  });
});

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

// Exercise the history/chart bridge without starting sockets or a WebGL map.
describe('LoggerComponent history chart location', () => {
  let component: any;
  const start = 1_780_000_000_000;
  const sample = (offset: number, lat = 13.8, lon = 100.5) => ({
    ts: start + offset, lat, lon, afrValue: 14
  });
  const chart = (timestamp: number) => ({ config: { series: [{ data: [{ x: timestamp, y: 14 }] }] } });

  beforeEach(() => {
    component = Object.create(LoggerComponent.prototype);
    component.isHistoryMode = true;
    component.useCanvasMode = true;
    component.historyCanvasBounds = { minLng: 100, minLat: 13, lngSpan: 2, latSpan: 2 };
    component.prepareHistoryHover([[sample(0), sample(100), sample(200)]]);
  });

  it('uses the chart timestamp rather than its downsampled point index', () => {
    component.showHoverForDataPoint(0, 0, { w: chart(start + 200) });
    expect(component.findHistoryHoverPoint(0, start + 200).ts).toBe(start + 200);
    expect(parseFloat(component.historyCanvasHover.left)).toBeCloseTo(25);
    expect(parseFloat(component.historyCanvasHover.top)).toBeCloseTo(60);
  });

  it('matches only points in the hovered lap', () => {
    component.prepareHistoryHover([[sample(0)], [sample(0, 14, 101)]]);
    expect(component.findHistoryHoverPoint(1, start).lon).toBe(101);
    expect(component.findHistoryHoverPoint(2, start)).toBeNull();
  });

  it('sorts samples and finds the nearest timestamp', () => {
    component.prepareHistoryHover([[sample(200), sample(0), sample(100)]]);
    expect(component.findHistoryHoverPoint(0, start + 180).ts).toBe(start + 200);
  });

  it('does not reuse a stale location across a telemetry gap', () => {
    component.showHistoryHover(0, 0, chart(start));
    component.showHistoryHover(0, 0, chart(start + 5000));
    expect(component.historyCanvasHover).toBeNull();
  });

  it('does not replace invalid or default GPS with a nearby valid sample', () => {
    for (const bad of [sample(100, 0, 0), sample(100, 91), { ...sample(100), isDefaultGps: true }]) {
      component.prepareHistoryHover([[sample(0), bad, sample(200)]]);
      expect(component.findHistoryHoverPoint(0, start + 100)).toBeNull();
    }
    expect(component.findHistoryHoverPoint(0, NaN)).toBeNull();
  });

  it('moves the map marker without rebuilding layers or moving the camera', () => {
    component.useCanvasMode = false;
    component.deckMap = { setCenter: jasmine.createSpy(), setZoom: jasmine.createSpy() };
    component.deckOverlay = { setProps: jasmine.createSpy() };
    component.historyHoverMarker = { setLngLat: jasmine.createSpy() };
    component.showHistoryHover(0, 0, chart(start));
    expect(component.historyHoverMarker.setLngLat).toHaveBeenCalledWith([100.5, 13.8]);
    expect(component.deckOverlay.setProps).not.toHaveBeenCalled();
    expect(component.deckMap.setCenter).not.toHaveBeenCalled();
    expect(component.deckMap.setZoom).not.toHaveBeenCalled();
  });

  it('removes the highlight and pinned selection when replacing lap data', () => {
    const remove = jasmine.createSpy();
    component.historyHoverMarker = { remove };
    component.clickedPointState = { seriesIndex: 0, dataPointIndex: 0, timestamp: start };
    component.historyCanvasHover = { left: '25%', top: '50%' };
    component.prepareHistoryHover([]);
    expect(remove).toHaveBeenCalled();
    expect(component.historyHoverMarker).toBeNull();
    expect(component.historyCanvasHover).toBeNull();
    expect(component.clickedPointState).toBeNull();
    expect(component.findHistoryHoverPoint(0, start)).toBeNull();
  });
});

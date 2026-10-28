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

  it('shows the hovered chart AFR rather than the raw GPS sample AFR', () => {
    const w = chart(start);
    w.config.series[0].data[0].y = 13.3;
    component.showHistoryHover(0, 0, w);
    expect(component.historyCanvasHover.afrLabel).toBe('AFR: 13.30');
  });

  it('updates the map label when the hovered AFR changes', () => {
    component.useCanvasMode = false;
    component.deckMap = {};
    component.historyHoverMarker = { setLngLat: jasmine.createSpy(), remove: jasmine.createSpy() };
    const label = document.createElement('span');
    component.historyHoverLabel = label;
    const w = chart(start);
    component.showHistoryHover(0, 0, w);
    expect(label.textContent).toBe('AFR: 14.00');
    w.config.series[0].data[0].y = 13.3;
    component.showHistoryHover(0, 0, w);
    expect(label.textContent).toBe('AFR: 13.30');
    component.clearHistoryHover();
    expect(component.historyHoverLabel).toBeNull();
  });

  it('shows N/A for missing AFR without substituting the GPS sample AFR', () => {
    for (const value of [null, undefined, NaN, Infinity]) {
      const w: any = chart(start);
      w.config.series[0].data[0].y = value;
      component.showHistoryHover(0, 0, w);
      expect(component.historyCanvasHover.afrLabel).toBe('AFR: N/A');
    }
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

  it('picks nearby map samples but ignores the background', () => {
    expect(component.findHistoryMapHit(250, 600, 1000, 1000)?.point.ts).toBe(start);
    expect(component.findHistoryMapHit(280, 600, 1000, 1000)).toBeNull();
  });

  it('prefers the selected lap where paths overlap and invalidates the lap cache', () => {
    component.prepareHistoryHover([[sample(0)], [sample(1000)]]);
    component.selectedLapIndex = 0;
    expect(component.findHistoryMapHit(250, 600, 1000, 1000)?.seriesIndex).toBe(0);
    component.selectedLapIndex = 1;
    expect(component.findHistoryMapHit(250, 600, 1000, 1000)?.seriesIndex).toBe(1);
  });

  it('uses the map projection for hit testing after camera changes', () => {
    component.useCanvasMode = false;
    component.deckMap = { project: jasmine.createSpy().and.returnValue({ x: 50, y: 70 }) };
    expect(component.findHistoryMapHit(50, 70, 1000, 1000)).not.toBeNull();
    component.deckMap.project.and.returnValue({ x: 100, y: 150 });
    component.historyMapHitGrid = null;
    expect(component.findHistoryMapHit(50, 70, 1000, 1000)).toBeNull();
    expect(component.findHistoryMapHit(100, 150, 1000, 1000)).not.toBeNull();
  });

  it('highlights the raw timestamp and AFR on the graph without replacing its series', () => {
    component.chart = {
      addXaxisAnnotation: jasmine.createSpy(), addPointAnnotation: jasmine.createSpy(),
      removeAnnotation: jasmine.createSpy(), updateSeries: jasmine.createSpy()
    };
    component.updateHistoryMapHover(250, 600, 1000, 1000);
    expect(component.chart.addXaxisAnnotation).toHaveBeenCalledWith(jasmine.objectContaining({ x: start }), false);
    expect(component.chart.addPointAnnotation).toHaveBeenCalledWith(jasmine.objectContaining({ x: start, y: 14, seriesIndex: 0 }), false);
    expect(component.historyCanvasHover.afrLabel).toBe('AFR: 14.00');
    component.updateHistoryMapHover(250, 600, 1000, 1000);
    expect(component.chart.addPointAnnotation).toHaveBeenCalledTimes(1);
    expect(component.chart.updateSeries).not.toHaveBeenCalled();
    component.updateHistoryMapHover(0, 0, 1000, 1000);
    expect(component.historyCanvasHover).toBeNull();
    expect(component.chart.removeAnnotation).toHaveBeenCalledWith('history-map-hover-point');
    expect(component.chart.removeAnnotation).toHaveBeenCalledWith('history-map-hover-time');
  });

  it('does not let map hover override a pinned chart point or realtime mode', () => {
    spyOn(window, 'requestAnimationFrame');
    component.clickedPointState = { seriesIndex: 0, dataPointIndex: 0, timestamp: start };
    component.onHistoryMapMove({} as MouseEvent);
    component.clickedPointState = null;
    component.isHistoryMode = false;
    component.onHistoryMapMove({} as MouseEvent);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('clears only map-driven highlights when leaving the map', () => {
    component.showHistoryHover(0, 0, chart(start));
    component.onHistoryMapLeave();
    expect(component.historyCanvasHover).not.toBeNull();
    component.updateHistoryMapHover(250, 600, 1000, 1000);
    component.onHistoryMapLeave();
    expect(component.historyCanvasHover).toBeNull();
  });

  it('ignores invalid GPS in map hit testing', () => {
    component.prepareHistoryHover([[{ ...sample(0), isDefaultGps: true }, sample(100, 91)]]);
    expect(component.findHistoryMapHit(250, 600, 1000, 1000)).toBeNull();
  });
});

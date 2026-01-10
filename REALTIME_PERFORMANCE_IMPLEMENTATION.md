# Realtime Performance Implementation Summary

## Changes Made

### 1. Mode Detection from URL
- Added `statusRace` query parameter detection in `ngOnInit()`
- `statusRace=history` → History mode (loads and replays historical data)
- `statusRace=realtime` (or anything else) → Realtime mode (live WebSocket stream)
- Example URL: `logger?raceId=39&segment=pickup&class=ab&loggerId=102&statusRace=history`

### 2. Unified Telemetry Data Model
- Created `TelemetryPoint` type:
  ```typescript
  type TelemetryPoint = {
    loggerId: string;
    ts: number;        // epoch ms
    x: number; y: number;
    afr?: number;
    rpm?: number;
    velocity?: number;
    raw?: any;
  };
  ```

### 3. Canvas Rendering (Replaces SVG Lines)
- Added `<canvas #trackCanvas>` element in HTML template
- Removed expensive SVG `<line>` rendering (commented out)
- Canvas renders track path with color gradient based on AFR
- Rendering runs on `requestAnimationFrame` outside Angular zone
- Proper coordinate transformation from data space to canvas space

### 4. Realtime Pipeline
- **WebSocket Connection**: Connects to `/ws/logger-realtime?logger=client_{id}&tail_ms=120000`
- **Buffering**: Ring buffer with max 10,000 points or 2 minutes of data
- **Rendering**: Throttled via `requestAnimationFrame` (outside Angular zone)
- **Chart Updates**: Throttled to 200ms intervals, incremental append (not full rebuild)
- **Message Handling**: Supports:
  - Single JSON object
  - Snapshot with `{type: "snapshot", items: [...]}`
  - Tick with `{type: "tick", item: {...}}`
  - Batch array

### 5. History Pipeline
- **WebSocket Connection**: Connects to `/ws/logger?logger=client_{id}&startIndex=0`
- **Downsampling**: 
  - Track: 5k-20k points max
  - Chart: 2k-5k points max
- **Text Parser**: `parseHistoryText()` method supports format:
  ```
  [columnnames]
  sats,time,FixType,lat,long,velocity,afr,...
  [data]
  123,13.4,38,775.264344,-6060.391692,19.64,016,...
  ```

### 6. Late Join / 2-Minute Backlog
- When connecting in realtime mode, automatically requests 2-minute backlog via `tail_ms=120000`
- Backend sends snapshot messages first, then continues with live ticks
- If backend doesn't support `tail_ms`, fallback to history request for last 2 minutes

## Performance Optimizations

1. **Canvas vs SVG**: Replaced thousands of DOM `<line>` elements with single canvas draw
2. **Outside Angular Zone**: Track rendering runs outside Angular change detection
3. **Throttling**: Chart updates limited to 200ms intervals
4. **Incremental Updates**: Chart appends new points instead of rebuilding entire series
5. **Ring Buffer**: Automatic trimming of old data (by size and time)
6. **Downsampling**: History data automatically downsampled for display

## Test Checklist

### Mode Detection
- [ ] Test URL with `statusRace=history` → Should load history mode
- [ ] Test URL with `statusRace=realtime` → Should load realtime mode
- [ ] Test URL without `statusRace` → Should default to realtime mode

### Realtime Mode
- [ ] Connect with valid loggerId → Should connect to WebSocket
- [ ] Receive realtime messages → Should update canvas track smoothly
- [ ] Receive realtime messages → Should update chart incrementally (throttled)
- [ ] With 20 cars at 10-20Hz → UI should remain responsive (<1s delay)
- [ ] Canvas should render path with AFR color gradient
- [ ] Hover over canvas → Should show tooltip with AFR value
- [ ] Disconnect → Should clean up WebSocket and timers

### History Mode
- [ ] Load history data → Should connect to history WebSocket
- [ ] Load 100k rows → Should not freeze browser tab
- [ ] History data → Should downsample for track (5k-20k points)
- [ ] History data → Should downsample for chart (2k-5k points)
- [ ] Canvas should render full path smoothly
- [ ] Chart should display all data without lag

### Late Join
- [ ] Connect realtime mode → Should request 2-minute backlog
- [ ] Receive snapshot → Should display backlog points immediately
- [ ] After snapshot → Should continue with live updates

### Canvas Rendering
- [ ] Track path should render with correct colors (AFR gradient)
- [ ] Current position marker (red circle) should be visible
- [ ] Hover point indicator should appear on mouse move
- [ ] Canvas should resize properly on window resize
- [ ] Canvas should overlay correctly on SVG background image

### Performance
- [ ] With 20 cars, 10-20Hz each → UI remains responsive
- [ ] Chart updates should be smooth (no stuttering)
- [ ] Canvas rendering should be smooth (60fps)
- [ ] Memory usage should be stable (no leaks)
- [ ] Switching modes should not leak WebSockets or timers

### Cleanup
- [ ] Component destroy → Should cancel animation frames
- [ ] Component destroy → Should close all WebSocket connections
- [ ] Component destroy → Should clear all buffers
- [ ] Component destroy → Should unsubscribe all subscriptions

## Known Limitations

1. Canvas coordinate transformation assumes data is in XY space (not lat/lon)
2. History text parser requires specific format with `[columnnames]` and `[data]` sections
3. Canvas hover detection uses 50-unit threshold (may need tuning)
4. Chart downsampling uses simple decimation (could use better algorithm)

## Future Improvements

1. Add replay controls for history mode (play/pause/speed)
2. Implement better downsampling algorithm (Douglas-Peucker)
3. Add WebSocket reconnection logic with exponential backoff
4. Add error handling for WebSocket failures
5. Add loading indicators for history mode
6. Add performance metrics display













# All Logger Implementation Guide

This document explains the design, implementation, and rollout strategy for the new `All Logger` feature.

## 1) Purpose

`All Logger` is a dedicated pre-race monitoring page for checking logger readiness at any time, including when there is no active race.

Primary goals:

- Always visible monitor page for operational checks
- Live-only monitoring (no history mode)
- No export or race-history actions from this page
- Reliable online/offline status updates from real data flow
- Safe separation from existing race-driven dashboard/logger flow

## 2) Scope and Rules

### Functional scope

- Show logger list continuously (online/offline, key info, AFR/count if available)
- Allow drill-down to logger detail monitor page
- Work even when no race is active

### Out of scope

- No history playback
- No export
- No race/event state mutation from All Logger page

### Access policy

- Allowed: `super_admin`, `admin`, `mechanic_user`, `scruitineer`
- Not allowed: `race_team_user`

## 3) High-Level Architecture

The feature is intentionally separated from existing race-dependent pages.

- Existing race flow remains unchanged:
  - `dashboard` (race-context driven)
  - `logger` (race-context guard)
- New monitor flow:
  - `all-logger` (list)
  - `logger-monitor` (detail)

This avoids regression risk in production race operations.

## 4) Frontend Implementation

### 4.1 New page: All Logger

Created new standalone component:

- `src/app/pages/full-main/all-logger/all-logger.component.ts`
- `src/app/pages/full-main/all-logger/all-logger.component.html`

Design choices:

- Reuse dashboard CSS (`styleUrl: '../dashboard/dashboard.component.scss'`) to reduce duplication
- Keep familiar table/search/filter interaction
- Live status from WebSocket (`connectStatus`) with API bootstrap data

Behavior:

- Filter options: `All Logger`, `Online`, `Offline`
- Search by table text filter
- Click row opens logger monitor detail (not race logger page)

### 4.2 New page: Logger Monitor (detail)

Created new standalone component:

- `src/app/pages/full-main/logger-monitor/logger-monitor.component.ts`
- `src/app/pages/full-main/logger-monitor/logger-monitor.component.html`
- `src/app/pages/full-main/logger-monitor/logger-monitor.component.scss`

Behavior:

- Live monitor only
- Shows profile + status + online/disconnect time + AFR + count
- Back button returns to `All Logger`
- Supports missing DB times (renders `-`)

### 4.3 Routing and guard

Updated routing:

- `src/app/pages/full-main/full-main-routing.module.ts`
  - Added `all-logger` route (role-restricted)
  - Added `logger-monitor` route with dedicated guard

Added guard:

- `src/app/core/navigation/navigation-context.guard.ts`
  - `requireLoggerMonitorContextGuard`: requires only `loggerId`
  - Does not require `raceId/segment/classCode`

### 4.4 Side menu integration

Updated menu and toolbar behavior:

- `src/app/pages/full-main/full-main.component.html`
  - `All Logger` menu button now navigates to `/pages/all-logger`
  - Toolbar chip visibility includes all-logger context
- `src/app/pages/full-main/full-main.component.ts`
  - Added `isAllLogger$`
  - Added `navigateToAllLogger()`

### 4.5 Role visibility config

Updated app config:

- `src/app/app.config.ts`
  - Added `AUTH.MENU_VISIBILITY.ALL_LOGGER`
  - Added endpoint key `GET_DETAIL_LOGGER_MONITOR`

## 5) Backend Implementation

### 5.1 New monitor detail endpoint

Added endpoint:

- `POST /api/logger/getDetailLoggerMonitor`

Files:

- `tss-race-backend/controllers/logger_controller.go`
- `tss-race-backend/server.go`

Request:

```json
{
  "logger_id": "137",
  "event_id": 4,
  "car_number": "58"
}
```

`event_id` and `car_number` are optional filters. `logger_id` is required.

Response strategy:

- Logger profile from `logger` table
- Latest monitor state from `countdetect_afr` by `logger_id` (latest row)
- If timing values do not exist, return null/empty and let UI show `-`

### 5.2 Permission mapping

Updated permission mapping:

- `tss-race-backend/controllers/auth_middleware.go`
- Mapped `/api/logger/getDetailLoggerMonitor` to `view_logger`

### 5.3 Status timing robustness (no active race case)

Updated server status update flow:

- `tss-race-backend/server.go`
  - `updateLoggerStatusInDB(...)` now includes fallback update when `currentEventID/currentRaceID` are missing
  - fallback updates latest row by `logger_id` in `countdetect_afr`
  - WebSocket status payload also falls back to latest DB times by `logger_id` when no active race context

This supports operational monitoring outside scheduled race windows.

## 6) API Service Layer Changes (Frontend)

Updated `EventService`:

- `src/app/service/event.service.ts`
  - Added `getDetailLoggerMonitor(...)`
  - Keeps existing `getDetailLoggerInRace(...)` unchanged

This keeps monitor flow separate from race flow.

## 7) Why We Created New Components (Risk Control)

Key reason: avoid breaking existing race logic.

- Old pages remain race-context strict
- New pages are monitor-context tolerant
- Shared styling reused, not shared stateful logic

This reduces regression risk for urgent production fixes.

## 8) Current Verification Results

Executed checks:

- Backend: `go test ./...` passed
- Frontend: `npm run build` passed

Known existing warnings remain unchanged (style budget/CommonJS/bootstrap path), not introduced by All Logger changes.

## 9) UAT Checklist

### Core behavior

- [ ] Open `All Logger` when no race is active
- [ ] Logger list renders normally
- [ ] Clicking a row opens `logger-monitor`
- [ ] `logger-monitor` shows profile/status
- [ ] Missing online/disconnect values display `-`

### Status timing behavior

- [ ] Plug power -> logger turns `online`
- [ ] Unplug power -> turns `offline` within threshold (~5s + tick)
- [ ] `disconnect_time` updates promptly
- [ ] Two devices show consistent status/timestamps

### Access control

- [ ] `race_team_user` cannot access `all-logger`
- [ ] `race_team_user` cannot access `logger-monitor`
- [ ] Allowed roles can access both pages

## 10) Branch Strategy for Your Next Step

Since you want to deploy critical bug fixes first, use this split strategy:

### Branch A: Hotfix deploy first

- Keep only critical bug fixes
- Exclude All Logger feature commits
- Validate and deploy quickly

### Branch B: All Logger continuation

- Continue feature hardening and enhancements
- Add deeper monitor UI (map/graph parity if needed)
- Add more resilience tests and cleanup

Recommended workflow:

1. Create hotfix branch from current stable base
2. Cherry-pick only urgent bug commits
3. Deploy hotfix
4. Continue All Logger on separate feature branch

## 11) Suggested Next Improvements (Feature Branch)

- Add lightweight live map panel in `logger-monitor` (monitor-only)
- Add reconnect trend indicator (flapping detection)
- Add configurable offline threshold via env (default 5s)
- Add backend metrics for status transition latency
- Add e2e test for unplug/replug scenario

## 12) File Change Summary (All Logger work)

Frontend:

- `src/app/pages/full-main/all-logger/all-logger.component.ts`
- `src/app/pages/full-main/all-logger/all-logger.component.html`
- `src/app/pages/full-main/logger-monitor/logger-monitor.component.ts`
- `src/app/pages/full-main/logger-monitor/logger-monitor.component.html`
- `src/app/pages/full-main/logger-monitor/logger-monitor.component.scss`
- `src/app/pages/full-main/full-main-routing.module.ts`
- `src/app/pages/full-main/full-main.component.ts`
- `src/app/pages/full-main/full-main.component.html`
- `src/app/core/navigation/navigation-context.guard.ts`
- `src/app/service/event.service.ts`
- `src/app/app.config.ts`

Backend:

- `tss-race-backend/controllers/logger_controller.go`
- `tss-race-backend/controllers/auth_middleware.go`
- `tss-race-backend/server.go`

import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import ExcelJS from 'exceljs';
import { firstValueFrom } from 'rxjs';
import { TssWeighingActiveEventResponse, TssWeighingCacheResponse, TssWeighingConfigResponse, TssWeighingService, TssWeighingUpdateMessage } from './tss-weighing.service';

type UserRole = 'admin' | 'keyin' | 'viewer';
type WeightField = 'fuel_w1' | 'fuel_w2' | 'dry_w1' | 'dry_w2';

interface UserAccount {
  password: string;
  role: UserRole;
  label: string;
}

interface CarRow {
  sub: string;
  num: string;
  target: number | null;
  driver1Name: string;
  driver1Weight: number | null;
  driver2Name: string;
  driver2Weight: number | null;
}

interface WeightRecord {
  fuel_w1?: number;
  fuel_w2?: number;
  dry_w1?: number;
  dry_w2?: number;
}

interface FieldVersionInfo {
  version: number;
  updatedBy: string;
  updatedAt: string;
}

interface WeightStats {
  w1: number;
  w2: number;
  has: boolean;
  total: number | null;
  diff: number | null;
  pct: number | null;
}

interface WeighingCarPayload {
  'รุ่น': string;
  'เบอร์รถ': string;
  'Target Weight (kg)': number | null;
  'ชื่อนักแข่ง1': string;
  'น้ำหนักนักแข่ง1': number | null;
  'ชื่อนักแข่ง2': string;
  'น้ำหนักนักแข่ง2': number | null;
  'INCLUDING FUEL': Record<string, number | string | null>;
  'DRY WEIGHT': Record<string, number | string | null>;
}

interface WeighingExcelRow {
  index: number;
  sub: string;
  carNumber: string;
  targetWeight: number | null;
  driver1Name: string;
  driver1Weight: number | null;
  driver2Name: string;
  driver2Weight: number | null;
  fuelW1: number | string | null;
  fuelW2: number | string | null;
  fuelTotal: number | string | null;
  fuelDiff: number | null;
  fuelPct: number | null;
  dryW1: number | string | null;
  dryW2: number | string | null;
  dryTotal: number | string | null;
  dryDiff: number | null;
  dryPct: number | null;
}

interface ExcelGroupValues {
  w1: number | string | null;
  w2: number | string | null;
  total: number | string | null;
  diff: number | null;
  pct: number | null;
}

interface ImportClassMapping {
  className: string;
  sub: string;
}

interface ImportHeaderColumns {
  classCol: number;
  subCol: number;
  carCol: number;
  targetCol: number;
  raceCol: number;
  driver1NameCol: number;
  driver1WeightCol: number;
  driver2NameCol: number;
  driver2WeightCol: number;
}

interface ImportWorksheetContext {
  header: ImportHeaderColumns;
  firstDataRow: number;
  defaultClassName: string;
  defaultSessionName: string;
}

interface ImportDriverValues {
  driver1Name: string;
  driver1Weight: number | null;
  driver2Name: string;
  driver2Weight: number | null;
}

interface ConfigRaceDraftSlot {
  enabled: boolean;
  raceNo: string;
  locked: boolean;
}

interface EventPreviewState {
  eventName: string;
  eventDraftName: string;
  classSessions: Record<string, string[]>;
  lockedSessions: Record<string, string[]>;
  data: Record<string, Record<string, CarRow[]>>;
  weights: Record<string, WeightRecord>;
  fieldVersions: Record<string, FieldVersionInfo>;
  selectedClass: string;
  selectedSession: string;
  lastCacheUpdatedAt: string;
  lastConfigUpdatedAt: string;
}

declare global {
  interface Window {
    TSS_WEIGHING_CONFIG?: { token?: string };
  }
}

const USERS: Record<string, UserAccount> = {
  admin: { password: 'admin123', role: 'admin', label: 'แก้ไข + Key in' },
  keyin: { password: 'keyin123', role: 'keyin', label: 'Key in' },
  viewer: { password: 'viewer123', role: 'viewer', label: 'ดูอย่างเดียว' },
};

const STORAGE_KEYS = {
  user: 'tss.activeUser',
  event: 'tss.eventName.v1',
  data: 'tss.masterData.v2',
  weights: 'tss.weights.v3',
};

const MASTER_CLASS_SESSIONS: Record<string, string[]> = {
  ECO: ['Qualify'],
  Touring: ['Qualify'],
  'PICKUP C': ['Qualify'],
  'PICKUP AB': ['Qualify'],
  GR86: ['Qualify'],
  'GT4 GTC': ['Qualify'],
  'GT3 GTM': ['Qualify'],
};

const CONFIG_RACE_SLOT_COUNT = 3;

const CLASS_SUB_OPTIONS: Record<string, string[]> = {
  'GT4 GTC': ['GT4', 'GTC'],
  'GT3 GTM': ['GT3', 'GTM'],
  'PICKUP AB': ['PICKUP A', 'PICKUP B'],
};

const IMPORT_CLASS_MAP: Record<string, ImportClassMapping> = {
  ECO: { className: 'ECO', sub: 'ECO' },
  TOURING: { className: 'Touring', sub: 'Touring' },
  'PICKUP AB': { className: 'PICKUP AB', sub: 'PICKUP A' },
  'PICKUP A': { className: 'PICKUP AB', sub: 'PICKUP A' },
  PICKUPA: { className: 'PICKUP AB', sub: 'PICKUP A' },
  'PICKUP B': { className: 'PICKUP AB', sub: 'PICKUP B' },
  PICKUPB: { className: 'PICKUP AB', sub: 'PICKUP B' },
  'PICKUP C': { className: 'PICKUP C', sub: 'PICKUP C' },
  PICKUPC: { className: 'PICKUP C', sub: 'PICKUP C' },
  GT3: { className: 'GT3 GTM', sub: 'GT3' },
  GTM: { className: 'GT3 GTM', sub: 'GTM' },
  'GT3 GTM': { className: 'GT3 GTM', sub: 'GT3' },
  GT4: { className: 'GT4 GTC', sub: 'GT4' },
  GTC: { className: 'GT4 GTC', sub: 'GTC' },
  'GT4 GTC': { className: 'GT4 GTC', sub: 'GT4' },
  GR86: { className: 'GR86', sub: 'GR86' },
};

function emptyWeighingData(): Record<string, Record<string, CarRow[]>> {
  return {};
}

@Component({
  selector: 'app-tss-weighing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tss-weighing.component.html',
  styleUrl: './tss-weighing.component.scss',
})
export class TssWeighingComponent implements OnInit, OnDestroy {
  classSessions: Record<string, string[]> = {};
  lockedSessions: Record<string, string[]> = {};
  configDraft: Record<string, Record<string, boolean>> = {};
  configLockDraft: Record<string, Record<string, boolean>> = {};
  configRaceDraft: Record<string, ConfigRaceDraftSlot[]> = {};

  data: Record<string, Record<string, CarRow[]>> = emptyWeighingData();
  weights: Record<string, WeightRecord> = {};
  fieldVersions: Record<string, FieldVersionInfo> = {};

  selectedClass = '';
  selectedSession = '';

  loginUser = '';
  loginPass = '';
  loginError = '';
  activeUsername = '';
  activeUser: UserAccount | null = null;

  eventName = 'BRIC1';
  eventDraftName = 'BRIC1';
  isEditingEvent = false;
  isConfigModalOpen = false;

  newNum = '';
  newSub = '';
  newTarget: number | null = null;
  adminError = '';
  syncStatus = '';
  syncError = false;

  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private saveInFlight = false;
  private loadInFlight = false;
  private activeEventInFlight = false;
  private configInFlight = false;
  private configRequestGeneration = 0;
  private lastCacheUpdatedAt = '';
  private lastActiveEventUpdatedAt = '';
  private lastConfigUpdatedAt = '';
  private pendingAutoSaveClass = '';
  private pendingAutoSaveSession = '';
  private previewLoadTimer: ReturnType<typeof setTimeout> | null = null;
  private fieldSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  private readonly dirtyFields = new Set<string>();
  private rowSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  private weighingWs: WebSocket | null = null;
  private weighingWsScope = '';
  private weighingWsGeneration = 0;
  private weighingWsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionLoadGeneration = 0;
  private previewRequestId = 0;
  private previewOriginalState: EventPreviewState | null = null;
  private readonly autoSaveDelayMs = 800;
  private readonly pollIntervalMs = 5000;
  private readonly previewLoadDelayMs = 400;

  constructor(private weighingService: TssWeighingService) {}

  ngOnInit(): void {
    this.eventName = this.getStoredEventName();
    this.data = this.loadData();
    this.weights = this.loadWeights();
    this.restoreUser();
    this.ensureSelection();
    this.updateTitle();
    if (this.activeUser) {
      this.syncActiveEvent(false, true);
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.clearAutoSaveTimer();
    this.clearFieldSaveTimers();
    this.clearRowSaveTimers();
    this.disconnectWeighingUpdates();
    this.clearPreviewLoadTimer();
    this.stopPolling();
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }

  get eventLabel(): string {
    return `${this.eventName} · ${this.currentYear}`;
  }

  get sessions(): string[] {
    return this.classSessions[this.selectedClass] ?? [];
  }

  get classOptions(): string[] {
    return Object.keys(this.classSessions);
  }

  get masterClassOptions(): string[] {
    return Object.keys(MASTER_CLASS_SESSIONS);
  }

  get cars(): CarRow[] {
    return this.ensureSessionData(this.selectedClass, this.selectedSession);
  }

  get canEditMaster(): boolean {
    return this.activeUser?.role === 'admin';
  }

  get canKeyIn(): boolean {
    return this.activeUser?.role === 'admin' || this.activeUser?.role === 'keyin';
  }

  get isCurrentSessionLocked(): boolean {
    return this.isSessionLocked(this.selectedClass, this.selectedSession);
  }

  get canKeyInCurrentSession(): boolean {
    return this.canKeyIn && (this.canEditMaster || !this.isCurrentSessionLocked);
  }

  get subOptions(): string[] {
    return CLASS_SUB_OPTIONS[this.selectedClass] ?? [];
  }

  get hasSubOptions(): boolean {
    return this.subOptions.length > 0;
  }

  get tableColspan(): number {
    return (this.hasSubOptions ? 16 : 15) + (this.canEditMaster ? 1 : 0);
  }

  get summary(): { total: number; counted: number; pass: number; fail: number } {
    let counted = 0;
    let pass = 0;
    let fail = 0;

    this.cars.forEach((car) => {
      const fuel = this.calcWeightGroup(car, 'fuel');
      const dry = this.calcWeightGroup(car, 'dry');
      const stats = fuel.has ? fuel : dry;
      if (fuel.has || dry.has) {
        counted++;
        if (stats.diff !== null && stats.diff >= 0) pass++;
        else fail++;
      }
    });

    return { total: this.cars.length, counted, pass, fail };
  }

  login(): void {
    const username = this.loginUser.trim();
    const user = USERS[username];
    if (!user || user.password !== this.loginPass) {
      this.loginError = 'Username หรือ Password ไม่ถูกต้อง';
      return;
    }
    sessionStorage.setItem(STORAGE_KEYS.user, username);
    this.loginPass = '';
    this.loginError = '';
    this.restoreUser();
    this.syncActiveEvent(false, true);
    this.startPolling();
  }

  logout(): void {
    sessionStorage.removeItem(STORAGE_KEYS.user);
    this.activeUsername = '';
    this.activeUser = null;
    this.loginError = '';
    this.clearAutoSaveTimer();
    this.clearFieldSaveTimers();
    this.clearRowSaveTimers();
    this.disconnectWeighingUpdates();
    this.stopPolling();
  }

  toggleEventEdit(): void {
    if (!this.canEditMaster) return;
    if (!this.isEditingEvent) {
      this.eventDraftName = this.eventName;
      this.isEditingEvent = true;
      return;
    }
    if (this.autoSaveTimer || this.hasPendingFieldSaves() || this.saveInFlight) {
      this.setSyncStatus('กรุณารอ auto save ก่อนเปลี่ยน event', true);
      return;
    }
    this.eventName = this.sanitizeEventName(this.eventDraftName);
    this.isEditingEvent = false;
    this.saveActiveEvent();
  }

  openConfigModal(): void {
    if (!this.canEditMaster) return;
    this.configRequestGeneration++;
    this.previewOriginalState = this.captureEventPreviewState();
    this.eventDraftName = this.eventName;
    this.isEditingEvent = true;
    this.rebuildConfigDraftFromCurrent();
    this.isConfigModalOpen = true;
  }

  closeConfigModal(): void {
    this.configRequestGeneration++;
    this.clearPreviewLoadTimer();
    this.restoreEventPreviewState();
    this.isConfigModalOpen = false;
    this.isEditingEvent = false;
  }

  onEventDraftNameChange(value: string): void {
    this.eventDraftName = value;
    if (!this.canEditMaster || !this.isConfigModalOpen) return;
    this.clearPreviewLoadTimer();
    this.previewLoadTimer = setTimeout(() => {
      this.previewLoadTimer = null;
      void this.loadDraftEventPreview();
    }, this.previewLoadDelayMs);
  }

  private rebuildConfigDraftFromCurrent(): void {
    this.rebuildConfigDraft(this.classSessions, this.lockedSessions);
  }

  private rebuildConfigDraft(classSessions: Record<string, string[]>, lockedSessions: Record<string, string[]>): void {
    this.configDraft = {};
    this.configLockDraft = {};
    this.configRaceDraft = {};
    Object.entries(MASTER_CLASS_SESSIONS).forEach(([className, sessions]) => {
      const enabled = new Set(classSessions[className] ?? []);
      const locked = new Set(lockedSessions[className] ?? []);
      this.configDraft[className] = {};
      this.configLockDraft[className] = {};
      sessions.forEach((sessionName) => {
        this.configDraft[className][sessionName] = enabled.has(sessionName);
        this.configLockDraft[className][sessionName] = enabled.has(sessionName) && locked.has(sessionName);
      });
      const raceSessions = (classSessions[className] ?? []).filter((sessionName) => this.isRaceSessionName(sessionName)).slice(0, CONFIG_RACE_SLOT_COUNT);
      this.configRaceDraft[className] = Array.from({ length: CONFIG_RACE_SLOT_COUNT }, (_, index) => {
        const sessionName = raceSessions[index] ?? '';
        return {
          enabled: !!sessionName,
          raceNo: sessionName.replace(/^Race/i, ''),
          locked: !!sessionName && locked.has(sessionName),
        };
      });
    });
  }

  isConfigClassEnabled(className: string): boolean {
    return Object.values(this.configDraft[className] ?? {}).some(Boolean) || (this.configRaceDraft[className] ?? []).some((slot) => slot.enabled);
  }

  isConfigSessionEnabled(className: string, sessionName: string): boolean {
    return !!this.configDraft[className]?.[sessionName];
  }

  isConfigSessionLocked(className: string, sessionName: string): boolean {
    return !!this.configLockDraft[className]?.[sessionName];
  }

  onConfigClassChange(className: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.configDraft[className] = this.configDraft[className] ?? {};
    this.configLockDraft[className] = this.configLockDraft[className] ?? {};
    (MASTER_CLASS_SESSIONS[className] ?? []).forEach((sessionName) => {
      this.configDraft[className][sessionName] = checked;
      if (!checked) this.configLockDraft[className][sessionName] = false;
    });
    this.configRaceDraft[className] = this.configRaceDraft[className] ?? this.emptyRaceDraftSlots();
    if (!checked) {
      this.configRaceDraft[className].forEach((slot) => {
        slot.enabled = false;
        slot.locked = false;
      });
    }
  }

  onConfigSessionChange(className: string, sessionName: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.configDraft[className] = this.configDraft[className] ?? {};
    this.configDraft[className][sessionName] = checked;
    if (!checked && this.configLockDraft[className]) this.configLockDraft[className][sessionName] = false;
  }

  onConfigSessionLockChange(className: string, sessionName: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (!this.isConfigSessionEnabled(className, sessionName)) return;
    this.configLockDraft[className] = this.configLockDraft[className] ?? {};
    this.configLockDraft[className][sessionName] = checked;
  }

  onConfigRaceEnabledChange(className: string, index: number, event: Event): void {
    const slot = this.configRaceDraft[className]?.[index];
    if (!slot) return;
    slot.enabled = (event.target as HTMLInputElement).checked;
    if (!slot.enabled) slot.locked = false;
  }

  onConfigRaceNoChange(className: string, index: number, value: string | number): void {
    const slot = this.configRaceDraft[className]?.[index];
    if (!slot) return;
    slot.raceNo = String(value ?? '').replace(/[^0-9]/g, '');
  }

  onConfigRaceLockChange(className: string, index: number, event: Event): void {
    const slot = this.configRaceDraft[className]?.[index];
    if (!slot || !slot.enabled) return;
    slot.locked = (event.target as HTMLInputElement).checked;
  }

  async saveConfigModal(): Promise<void> {
    if (!this.canEditMaster) return;
    if (this.autoSaveTimer || this.hasPendingFieldSaves() || this.saveInFlight) {
      this.setSyncStatus('กรุณารอ auto save ก่อนบันทึก event config', true);
      return;
    }
    const classSessions: Record<string, string[]> = {};
    const lockedSessions: Record<string, string[]> = {};
    for (const [className, sessions] of Object.entries(this.configDraft)) {
      const selectedSessions = Object.entries(sessions).filter(([, enabled]) => enabled).map(([sessionName]) => sessionName);
      const selectedLocks = selectedSessions.filter((sessionName) => !!this.configLockDraft[className]?.[sessionName]);
      for (const slot of this.configRaceDraft[className] ?? []) {
        if (!slot.enabled) continue;
        const raceNo = String(slot.raceNo ?? '').trim();
        if (!raceNo) {
          this.setSyncStatus(`กรุณากรอกเลข Race ของ ${className}`, true);
          return;
        }
        if (!/^\d+$/.test(raceNo) || Number(raceNo) <= 0) {
          this.setSyncStatus(`เลข Race ของ ${className} ต้องเป็นตัวเลขมากกว่า 0`, true);
          return;
        }
        selectedSessions.push(`Race${Number(raceNo)}`);
        if (slot.locked) selectedLocks.push(`Race${Number(raceNo)}`);
      }
      const uniqueSessions = selectedSessions.filter((sessionName, index, all) => all.indexOf(sessionName) === index);
      if (uniqueSessions.length !== selectedSessions.length) {
        this.setSyncStatus(`Race ของ ${className} ซ้ำกัน`, true);
        return;
      }
      if (uniqueSessions.length > 0) classSessions[className] = uniqueSessions;
      const uniqueLocks = selectedLocks.filter((sessionName, index, all) => uniqueSessions.includes(sessionName) && all.indexOf(sessionName) === index);
      if (uniqueLocks.length > 0) lockedSessions[className] = uniqueLocks;
    }
    const nextEventName = this.sanitizeEventName(this.eventDraftName);
    if (!nextEventName) {
      this.setSyncStatus('กรุณากรอกชื่อ event', true);
      return;
    }

    const token = this.getWeighingToken();
    if (!token) return;
    this.configRequestGeneration++;
    this.setSyncStatus('กำลังบันทึก event config...');
    try {
      // Persist the config before switching the active event, so a failed config save
      // cannot leave the server pointing at an event with default sessions.
      const config = await firstValueFrom(this.weighingService.setConfig(nextEventName, this.currentYear, classSessions, lockedSessions, token));
      const activeEvent = await firstValueFrom(this.weighingService.setActiveEvent(nextEventName, this.currentYear, token));
      this.applyActiveEvent(activeEvent, true);
      this.applyEventConfig(config, true);
      this.clearPreviewLoadTimer();
      this.previewOriginalState = null;
      this.isConfigModalOpen = false;
      this.isEditingEvent = false;
      this.setSyncStatus('บันทึก event config แล้ว: ' + this.eventName);
       this.loadSelectedSessionAndConnect(false, true);
    } catch (err) {
      this.setSyncStatus(this.errorMessage(err, 'บันทึก event config ไม่สำเร็จ'), true);
    }
  }

  onClassChange(): void {
    this.disconnectWeighingUpdates();
    this.selectedSession = this.sessions[0] ?? '';
    this.ensureSessionData(this.selectedClass, this.selectedSession);
    this.newSub = this.defaultSubForClass(this.selectedClass);
    this.loadSelectedSessionAndConnect();
  }

  onSessionChange(): void {
    this.disconnectWeighingUpdates();
    this.ensureSessionData(this.selectedClass, this.selectedSession);
    this.loadSelectedSessionAndConnect();
  }

  setWeight(car: CarRow, field: WeightField, value: string | number): void {
    if (!this.canKeyInCurrentSession) return;
    const k = this.key(this.selectedClass, this.selectedSession, car.num);
    this.weights[k] = this.weights[k] ?? {};
    const parsed = Number(value);
    this.weights[k][field] = Number.isFinite(parsed) ? parsed : 0;
    this.saveWeights();
    this.queueFieldAutoSave(car, field, this.weights[k][field] ?? 0);
  }

  setCarField(car: CarRow, field: 'num' | 'sub' | 'target' | 'driver1Name' | 'driver1Weight' | 'driver2Name' | 'driver2Weight', value: string | number | null): void {
    if (!this.canEditMaster) return;
    const oldNum = car.num;
    if (field === 'target' || field === 'driver1Weight' || field === 'driver2Weight') {
      const raw = String(value ?? '').trim();
      const parsed = Number(raw);
      car[field] = raw === '' || !Number.isFinite(parsed) ? null : parsed;
    } else if (field === 'sub') {
      car.sub = this.normalizeSubForClass(this.selectedClass, String(value ?? ''));
    } else if (field === 'driver1Name' || field === 'driver2Name') {
      car[field] = String(value ?? '').trim();
    } else {
      car[field] = String(value ?? '').trim();
    }
    if (field === 'num') {
      const oldKey = this.key(this.selectedClass, this.selectedSession, oldNum);
      const newKey = this.key(this.selectedClass, this.selectedSession, car.num);
      if (oldNum !== car.num) {
        if (this.weights[oldKey] && !this.weights[newKey]) this.weights[newKey] = this.weights[oldKey];
        delete this.weights[oldKey];
        this.saveWeights();
      }
      this.saveData();
      this.queueRowSave(car, oldNum);
      return;
    }
    this.saveData();
    this.queueFieldAutoSave(car, field, car[field]);
  }

  addCar(): void {
    if (!this.canEditMaster) return;
    const num = this.newNum.trim();
    if (!num) {
      this.adminError = 'กรุณากรอกเบอร์รถ';
      return;
    }
    if (this.newTarget !== null && !Number.isFinite(Number(this.newTarget))) {
      this.adminError = 'Target ต้องเป็นตัวเลข';
      return;
    }
    const cars = this.ensureSessionData(this.selectedClass, this.selectedSession);
    if (cars.some((car) => car.num.trim().toLowerCase() === num.toLowerCase())) {
      this.adminError = 'มีเบอร์รถนี้แล้วในรอบนี้';
      return;
    }
    const sub = this.normalizeSubForClass(this.selectedClass, this.newSub);
    cars.push({ sub, num, target: this.newTarget === null ? null : Number(this.newTarget), driver1Name: '', driver1Weight: null, driver2Name: '', driver2Weight: null });
    const addedCar = cars[cars.length - 1];
    this.newNum = '';
    this.newSub = this.defaultSubForClass(this.selectedClass);
    this.newTarget = null;
    this.adminError = '';
    this.saveData();
    void this.saveCarRowToRedis(this.selectedClass, this.selectedSession, addedCar);
  }

  deleteCar(index: number): void {
    if (!this.canEditMaster) return;
    const car = this.cars[index];
    if (!car || !confirm('ลบรถเบอร์ ' + car.num + ' ?')) return;
    const className = this.selectedClass;
    const sessionName = this.selectedSession;
    const carNumber = car.num;
    const token = this.getWeighingToken();
    if (!token) return;
    this.setSyncStatus(`กำลังลบรถ ${carNumber}...`);
    this.weighingService.deleteRow(this.eventName, this.currentYear, className, sessionName, carNumber, token).subscribe({
      next: () => {
        this.clearDirtyForCar(className, sessionName, carNumber);
        const currentCars = this.ensureSessionData(className, sessionName);
        const rowIndex = currentCars.findIndex((item) => item.num === carNumber);
        if (rowIndex >= 0) currentCars.splice(rowIndex, 1);
        delete this.weights[this.key(className, sessionName, carNumber)];
        this.saveData();
        this.saveWeights();
        this.setSyncStatus(`ลบรถ ${carNumber} แล้ว`);
      },
      error: (err) => this.setSyncStatus(this.errorMessage(err, `ลบรถ ${carNumber} ไม่สำเร็จ`), true),
    });
  }

  saveRedisCache(isAutoSave = false): void {
    if (!this.canKeyInCurrentSession) return;
    this.saveCurrentSessionToRedis(isAutoSave);
  }

  loadRedisCache(showStatus = true, force = false): void {
    this.loadSelectedSessionAndConnect(showStatus, force);
  }

  private saveActiveEvent(): void {
    const token = this.getWeighingToken();
    if (!token) return;
    this.setSyncStatus('กำลังบันทึก event...');
    this.weighingService.setActiveEvent(this.eventName, this.currentYear, token).subscribe({
      next: (activeEvent) => {
        this.applyActiveEvent(activeEvent, true);
        this.setSyncStatus('บันทึก event แล้ว: ' + this.eventName);
         this.loadSelectedSessionAndConnect(false, true);
      },
      error: (err) => this.setSyncStatus(this.errorMessage(err, 'บันทึก event ไม่สำเร็จ'), true),
    });
  }

  private syncActiveEvent(showStatus = false, forceLoad = false): void {
    const token = this.getWeighingToken(showStatus);
    if (!token || this.activeEventInFlight) return;
    if (this.isEditingEvent) return;
    if (this.autoSaveTimer || this.hasPendingFieldSaves() || this.saveInFlight) return;
    this.activeEventInFlight = true;
    this.weighingService.getActiveEvent(token).subscribe({
      next: (activeEvent) => {
        if (this.isEditingEvent) {
          this.activeEventInFlight = false;
          return;
        }
        const changed = this.applyActiveEvent(activeEvent, forceLoad);
        this.activeEventInFlight = false;
        this.loadEventConfig(showStatus, changed || forceLoad);
      },
      error: (err) => {
        this.activeEventInFlight = false;
        if (showStatus) this.setSyncStatus(this.errorMessage(err, 'โหลด event ไม่สำเร็จ'), true);
        if (forceLoad) this.loadEventConfig(showStatus, true);
      },
    });
  }

  private loadEventConfig(showStatus = false, forceLoad = false): void {
    const token = this.getWeighingToken(showStatus);
    if (!token || this.configInFlight) return;
    if (this.isConfigModalOpen || this.isEditingEvent) return;
    if (this.autoSaveTimer || this.hasPendingFieldSaves() || this.saveInFlight) return;
    const requestGeneration = ++this.configRequestGeneration;
    this.configInFlight = true;
    this.weighingService.getConfig(this.eventName, this.currentYear, token).subscribe({
      next: (config) => {
        if (requestGeneration !== this.configRequestGeneration || this.isConfigModalOpen || this.isEditingEvent) {
          this.configInFlight = false;
          return;
        }
        const changed = this.applyEventConfig(config, forceLoad);
        this.configInFlight = false;
        if (changed || forceLoad) this.loadSelectedSessionAndConnect(showStatus, true);
        else this.loadSelectedSessionAndConnect(false);
      },
      error: (err) => {
        this.configInFlight = false;
        if (showStatus) this.setSyncStatus(this.errorMessage(err, 'โหลด config ไม่สำเร็จ'), true);
        if (forceLoad) this.loadSelectedSessionAndConnect(showStatus, true);
      },
    });
  }

  private applyActiveEvent(activeEvent: TssWeighingActiveEventResponse, force = false): boolean {
    const nextEventName = this.sanitizeEventName(activeEvent.event);
    const nextUpdatedAt = activeEvent.updated_at ?? '';
    const changed = force || nextEventName !== this.eventName || (!!nextUpdatedAt && nextUpdatedAt !== this.lastActiveEventUpdatedAt);
    if (!changed) return false;
    this.eventName = nextEventName;
    this.eventDraftName = nextEventName;
    this.lastActiveEventUpdatedAt = nextUpdatedAt;
    this.lastCacheUpdatedAt = '';
    localStorage.setItem(STORAGE_KEYS.event, this.eventName);
    this.updateTitle();
    return true;
  }

  private applyEventConfig(config: TssWeighingConfigResponse, force = false): boolean {
    const nextUpdatedAt = config.updated_at ?? '';
    const nextClassSessions = this.normalizeEventClassSessions(config.class_sessions);
    const nextLockedSessions = this.normalizeEventLockedSessions(config.locked_sessions, nextClassSessions);
    const changed = force || (!!nextUpdatedAt && nextUpdatedAt !== this.lastConfigUpdatedAt) || JSON.stringify(nextClassSessions) !== JSON.stringify(this.classSessions) || JSON.stringify(nextLockedSessions) !== JSON.stringify(this.lockedSessions);
    if (!changed) return false;
    this.classSessions = nextClassSessions;
    this.lockedSessions = nextLockedSessions;
    this.lastConfigUpdatedAt = nextUpdatedAt;
    this.ensureSelection();
    return true;
  }

  private loadSelectedSessionAndConnect(showStatus = false, force = false): void {
    const token = this.getWeighingToken(showStatus);
    if (!token || !this.activeUser || !this.selectedClass || !this.selectedSession) return;
    if (this.loadInFlight) return;
    if (this.autoSaveTimer || this.hasPendingFieldSaves() || this.saveInFlight) return;
    const className = this.selectedClass;
    const sessionName = this.selectedSession;
    const generation = ++this.sessionLoadGeneration;
    this.loadInFlight = true;
    if (showStatus) this.setSyncStatus(`กำลังโหลด ${className} / ${sessionName}...`);
    this.weighingService.getSessionCache(this.eventName, this.currentYear, className, sessionName, token).subscribe({
      next: (cache) => {
        if (generation !== this.sessionLoadGeneration || className !== this.selectedClass || sessionName !== this.selectedSession) {
          this.loadInFlight = false;
          this.loadSelectedSessionAndConnect(showStatus, force);
          return;
        }
        this.applySessionCache(cache, className, sessionName, force);
        this.lastCacheUpdatedAt = cache.updated_at ?? this.lastCacheUpdatedAt;
        this.loadInFlight = false;
        this.connectWeighingUpdates();
        if (showStatus) this.setSyncStatus(`โหลด ${className} / ${sessionName} แล้ว`);
      },
      error: (err) => {
        this.loadInFlight = false;
        if (showStatus) this.setSyncStatus(this.errorMessage(err, 'โหลด weighing session ไม่สำเร็จ'), true);
        this.connectWeighingUpdates();
      },
    });
  }

  private async saveCurrentSessionToRedis(isAutoSave: boolean): Promise<void> {
    const token = this.getWeighingToken(!isAutoSave);
    if (!token || this.saveInFlight) return;
    const className = isAutoSave && this.pendingAutoSaveClass ? this.pendingAutoSaveClass : this.selectedClass;
    const sessionName = isAutoSave && this.pendingAutoSaveSession ? this.pendingAutoSaveSession : this.selectedSession;
    this.saveInFlight = true;
    this.setSyncStatus(isAutoSave ? 'กำลัง auto save Redis...' : 'กำลังบันทึก Redis...');
    try {
      for (const car of this.data[className]?.[sessionName] ?? []) {
        const response = await firstValueFrom(this.weighingService.saveRow({
          event: this.eventName,
          year: this.currentYear,
          class_name: className,
          session_name: sessionName,
          car_number: car.num,
          car: this.buildCarMetadata(car),
          expected_versions: this.metadataExpectedVersions(className, sessionName, car.num),
          updated_by: this.activeUsername || this.activeUser?.role || 'unknown',
        }, token));
        this.applyCarFieldVersions(className, sessionName, car.num, response.car);
      }
      this.pendingAutoSaveClass = '';
      this.pendingAutoSaveSession = '';
      this.saveInFlight = false;
      this.setSyncStatus(`${isAutoSave ? 'Auto saved' : 'บันทึก Redis แล้ว'}: ${className} / ${sessionName}`);
    } catch (err) {
      this.saveInFlight = false;
      this.setSyncStatus(this.errorMessage(err, 'บันทึก Redis ไม่สำเร็จ'), true);
    }
  }

  resetCurrentClass(): void {
    if (!this.canEditMaster) return;
    if (!this.selectedClass || !confirm(`Reset class ${this.selectedClass} และลบ Redis cache ของ class นี้?`)) return;
    const token = this.getWeighingToken();
    if (!token) return;
    const className = this.selectedClass;
    this.setSyncStatus('กำลังลบ Redis class ' + className + '...');
    this.weighingService.deleteClass(this.eventName, this.currentYear, className, token).subscribe({
      next: () => {
        this.lastCacheUpdatedAt = '';
        this.clearLocalCurrentClass(className);
        this.ensureSelection();
        this.setSyncStatus('Reset current class แล้ว: ' + className);
      },
      error: (err) => this.setSyncStatus(this.errorMessage(err, 'Reset current class ไม่สำเร็จ'), true),
    });
  }

  async importExcel(event: Event): Promise<void> {
    if (!this.canEditMaster) return;
    if (this.saveInFlight || this.autoSaveTimer || this.hasPendingFieldSaves() || this.hasPendingRowSaves()) {
      this.setSyncStatus('กรุณารอการบันทึกก่อน import', true);
      return;
    }

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      this.clearAutoSaveTimer();
      this.setSyncStatus('กำลัง import Excel...');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
       if (workbook.worksheets.length === 0) {
         this.setSyncStatus('ไม่พบ sheet ในไฟล์ Excel', true);
         return;
       }

       const worksheets = workbook.worksheets
         .map((worksheet) => ({ worksheet, context: this.importWorksheetContext(worksheet) }))
         .filter((item): item is { worksheet: ExcelJS.Worksheet; context: ImportWorksheetContext } => !!item.context);
       if (worksheets.length === 0) {
         this.setSyncStatus('Excel ต้องมี column CLASS, เบอร์รถ, น้ำหนักที่ต้องการ', true);
         return;
       }

      let importedRows = 0;
      let addedRows = 0;
      let updatedRows = 0;
      let skippedRows = 0;
      const changedPairs = new Set<string>();

       worksheets.forEach(({ worksheet, context }) => {
         worksheet.eachRow((row, rowNumber) => {
           if (rowNumber < context.firstDataRow) return;
           const classValue = context.header.classCol
             ? this.cellText(row.getCell(context.header.classCol))
             : context.defaultClassName;
           const mapping = this.importClassMappingForRow(row, context.header, classValue);
           const carNumber = this.cellText(row.getCell(context.header.carCol));
           const target = this.importTarget(row.getCell(context.header.targetCol));
           const raceValue = context.header.raceCol ? this.cellText(row.getCell(context.header.raceCol)) : context.defaultSessionName;
           const sessionName = this.importSessionName(raceValue, mapping?.className ?? '', context.defaultSessionName);
           const driverValues = this.importDriverValues(row, context.header);
           if (!mapping || !carNumber || target.invalid) {
             skippedRows++;
             return;
           }
           if (!sessionName) {
             skippedRows++;
             return;
           }

           const cars = this.ensureSessionData(mapping.className, sessionName);
           if (this.mergeImportedCar(cars, mapping.sub, carNumber, target.value, driverValues)) updatedRows++;
           else addedRows++;
           changedPairs.add(`${mapping.className}|${sessionName}`);
           importedRows++;
         });
       });

      this.saveData();
      if (changedPairs.size === 0) {
        this.setSyncStatus(`Import Excel ไม่พบข้อมูลที่ใช้ได้, skipped ${skippedRows}`, true);
        return;
      }
      await this.saveImportedSessionsToRedis(changedPairs, importedRows, addedRows, updatedRows, skippedRows);
    } catch (err) {
      this.setSyncStatus(this.errorMessage(err, 'Import Excel ไม่สำเร็จ'), true);
    }
  }

  async importExcelForSelectedClass(event: Event): Promise<void> {
    if (!this.canEditMaster) return;
    if (this.saveInFlight || this.autoSaveTimer || this.hasPendingFieldSaves() || this.hasPendingRowSaves()) {
      this.setSyncStatus('กรุณารอการบันทึกก่อน import', true);
      return;
    }

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const className = this.selectedClass;
    const sessionName = this.selectedSession;
    try {
      this.clearAutoSaveTimer();
      this.setSyncStatus(`กำลัง import Excel เฉพาะ ${className} / ${sessionName}...`);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
       if (workbook.worksheets.length === 0) {
         this.setSyncStatus('ไม่พบ sheet ในไฟล์ Excel', true);
         return;
       }

       const worksheets = workbook.worksheets
         .map((worksheet) => ({ worksheet, context: this.importWorksheetContext(worksheet) }))
         .filter((item): item is { worksheet: ExcelJS.Worksheet; context: ImportWorksheetContext } => !!item.context);
       if (worksheets.length === 0) {
         this.setSyncStatus('Excel ต้องมี column CLASS, เบอร์รถ, น้ำหนักที่ต้องการ', true);
         return;
       }

      let matchedRows = 0;
      let addedRows = 0;
      let updatedRows = 0;
      let skippedRows = 0;
      const changedPairs = new Set<string>();
       const cars = this.ensureSessionData(className, sessionName);

       worksheets.forEach(({ worksheet, context }) => {
         worksheet.eachRow((row, rowNumber) => {
           if (rowNumber < context.firstDataRow) return;
           const classValue = context.header.classCol
             ? this.cellText(row.getCell(context.header.classCol))
             : context.defaultClassName;
           const mapping = this.importClassMappingForRow(row, context.header, classValue);
           if (!mapping || mapping.className !== className) return;

           const carNumber = this.cellText(row.getCell(context.header.carCol));
           const target = this.importTarget(row.getCell(context.header.targetCol));
           const raceValue = context.header.raceCol ? this.cellText(row.getCell(context.header.raceCol)) : context.defaultSessionName;
           const sessionForRow = this.importSessionName(raceValue, className, context.defaultSessionName);
           const driverValues = this.importDriverValues(row, context.header);
           if (!carNumber || target.invalid) {
             skippedRows++;
             return;
           }
           if (!sessionForRow) {
             skippedRows++;
             return;
           }

           const targetCars = sessionForRow === sessionName ? cars : this.ensureSessionData(className, sessionForRow);
           if (this.mergeImportedCar(targetCars, mapping.sub, carNumber, target.value, driverValues)) {
             updatedRows++;
           } else {
             addedRows++;
           }
           changedPairs.add(`${className}|${sessionForRow}`);
           matchedRows++;
         });
       });

      this.saveData();
      if (matchedRows === 0) {
        this.setSyncStatus(`ไม่พบข้อมูลสำหรับ ${className} ในไฟล์ Excel, skipped ${skippedRows}`, true);
        return;
      }
      await this.saveImportedSessionsToRedis(changedPairs, matchedRows, addedRows, updatedRows, skippedRows);
    } catch (err) {
      this.setSyncStatus(this.errorMessage(err, 'Import with class ไม่สำเร็จ'), true);
    }
  }

  async exportAllExcel(): Promise<void> {
    const workbook = this.buildWorkbookForClasses(this.classOptions);
    await this.downloadWorkbook(workbook, `TSS_Weighing_Sheet_${this.currentYear}_${this.safeFilePart(this.eventName)}_ALL.xlsx`);
    this.setSyncStatus('Export ALL แล้ว');
  }

  async exportSelectedClassExcel(): Promise<void> {
    const className = this.selectedClass;
    const workbook = this.buildWorkbookForClasses([className]);
    await this.downloadWorkbook(workbook, `TSS_Weighing_Sheet_${this.currentYear}_${this.safeFilePart(this.eventName)}_${this.safeFilePart(className)}.xlsx`);
    this.setSyncStatus('Export Class แล้ว: ' + className);
  }

  calcWeightGroup(car: CarRow, prefix: 'fuel' | 'dry'): WeightStats {
    const record = this.weights[this.key(this.selectedClass, this.selectedSession, car.num)] ?? {};
    const w1 = Number(record[`${prefix}_w1` as WeightField] ?? 0);
    const w2 = Number(record[`${prefix}_w2` as WeightField] ?? 0);
    const has = w1 > 0 || w2 > 0;
    const total = has ? w1 + w2 : null;
    const diff = total !== null && car.target !== null ? total - car.target : null;
    const pct = diff !== null && car.target ? diff / car.target : null;
    return { w1, w2, has, total, diff, pct };
  }

  pillClass(stats: WeightStats): string {
    if (!stats.has || stats.diff === null) return 'empty';
    if (stats.diff < 0) return 'over';
    if (stats.pct !== null && Math.abs(stats.pct) <= 0.05) return 'ok';
    return 'warn';
  }

  diffText(stats: WeightStats): string {
    if (stats.diff === null) return '—';
    return `${stats.diff >= 0 ? '+' : ''}${stats.diff.toFixed(1)} kg`;
  }

  pctText(stats: WeightStats): string {
    return stats.pct === null ? '—' : `${(stats.pct * 100).toFixed(2)}%`;
  }

  fmtWeight(value: number): string {
    return value ? String(value) : '';
  }

  targetText(value: number | null): string {
    return value !== null ? Number(value).toFixed(2) : '—';
  }

  private restoreUser(): void {
    const username = sessionStorage.getItem(STORAGE_KEYS.user) ?? '';
    this.activeUsername = username;
    this.activeUser = username && USERS[username] ? USERS[username] : null;
  }

  private loadData(): Record<string, Record<string, CarRow[]>> {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.data);
      return this.ensureDataShape(saved ? JSON.parse(saved) as Record<string, Record<string, CarRow[]>> : emptyWeighingData());
    } catch {
      return emptyWeighingData();
    }
  }

  private loadWeights(): Record<string, WeightRecord> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.weights) ?? '{}') as Record<string, WeightRecord>;
    } catch {
      return {};
    }
  }

  private saveData(): void {
    localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(this.data));
  }

  private saveWeights(): void {
    localStorage.setItem(STORAGE_KEYS.weights, JSON.stringify(this.weights));
  }

  private queueAutoSave(): void {
    if (!this.canKeyInCurrentSession) return;
    this.pendingAutoSaveClass = this.selectedClass;
    this.pendingAutoSaveSession = this.selectedSession;
    this.clearAutoSaveTimer();
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.saveCurrentSessionToRedis(true);
    }, this.autoSaveDelayMs);
  }

  private queueFieldAutoSave(car: CarRow, field: WeightField | 'sub' | 'target' | 'driver1Name' | 'driver1Weight' | 'driver2Name' | 'driver2Weight', value: unknown): void {
    if (!this.canKeyInCurrentSession) return;
    const className = this.selectedClass;
    const sessionName = this.selectedSession;
    const carNumber = car.num;
    const timerKey = this.fieldKey(className, sessionName, carNumber, field);
    this.dirtyFields.add(timerKey);
    if (this.fieldSaveTimers[timerKey]) clearTimeout(this.fieldSaveTimers[timerKey]);
    this.fieldSaveTimers[timerKey] = setTimeout(() => {
      delete this.fieldSaveTimers[timerKey];
      this.saveFieldToRedis(className, sessionName, carNumber, field, value);
    }, this.autoSaveDelayMs);
  }

  private saveFieldToRedis(className: string, sessionName: string, carNumber: string, field: string, value: unknown): void {
    const token = this.getWeighingToken(false);
    if (!token) {
      this.setSyncStatus('ไม่พบ token จึงยังไม่ sync Redis', true);
      return;
    }
    const versionKey = this.fieldKey(className, sessionName, carNumber, field);
    const expectedVersion = this.fieldVersions[versionKey]?.version ?? 0;
    this.setSyncStatus(`กำลัง auto save ${className} / ${sessionName} / ${carNumber}...`);
    this.weighingService.updateField({
      event: this.eventName,
      year: this.currentYear,
      class_name: className,
      session_name: sessionName,
      car_number: carNumber,
      field,
      value,
      expected_version: expectedVersion,
      updated_by: this.activeUsername || this.activeUser?.role || 'unknown',
    }, token).subscribe({
      next: (response) => {
        this.lastCacheUpdatedAt = response.cache?.updated_at ?? this.lastCacheUpdatedAt;
        this.dirtyFields.delete(versionKey);
        this.applyCarFieldVersions(className, sessionName, carNumber, response.car);
        this.setSyncStatus(`Auto saved: ${className} / ${sessionName} / ${carNumber}`);
      },
      error: (err) => {
        this.handleFieldSaveError(err, className, sessionName, carNumber, field);
        if (err?.status !== 409) this.dirtyFields.delete(versionKey);
      },
    });
  }

  private clearAutoSaveTimer(): void {
    if (!this.autoSaveTimer) return;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = null;
  }

  private clearFieldSaveTimers(): void {
    Object.values(this.fieldSaveTimers).forEach((timer) => clearTimeout(timer));
    this.fieldSaveTimers = {};
  }

  private clearRowSaveTimers(): void {
    Object.values(this.rowSaveTimers).forEach((timer) => clearTimeout(timer));
    this.rowSaveTimers = {};
  }

  private hasPendingFieldSaves(): boolean {
    return Object.keys(this.fieldSaveTimers).length > 0;
  }

  private hasPendingRowSaves(): boolean {
    return Object.keys(this.rowSaveTimers).length > 0;
  }

  private hasDirtyField(className: string, sessionName: string, carNumber: string, field: string): boolean {
    return this.dirtyFields.has(this.fieldKey(className, sessionName, carNumber, field));
  }

  private carHasDirtyField(className: string, sessionName: string, carNumber: string): boolean {
    const prefix = `${this.key(className, sessionName, carNumber)}|`;
    return Array.from(this.dirtyFields).some((fieldKey) => fieldKey.startsWith(prefix));
  }

  private clearDirtyForCar(className: string, sessionName: string, carNumber: string): void {
    const prefix = `${this.key(className, sessionName, carNumber)}|`;
    Array.from(this.dirtyFields).forEach((fieldKey) => {
      if (fieldKey.startsWith(prefix)) this.dirtyFields.delete(fieldKey);
    });
  }

  private queueRowSave(car: CarRow, oldCarNumber = ''): void {
    const className = this.selectedClass;
    const sessionName = this.selectedSession;
    const timerKey = `${className}|${sessionName}|${car.num}`;
    if (this.rowSaveTimers[timerKey]) clearTimeout(this.rowSaveTimers[timerKey]);
    this.rowSaveTimers[timerKey] = setTimeout(() => {
      delete this.rowSaveTimers[timerKey];
      void this.saveCarRowToRedis(className, sessionName, car, oldCarNumber);
    }, this.autoSaveDelayMs);
  }

  private async saveCarRowToRedis(className: string, sessionName: string, car: CarRow, oldCarNumber = ''): Promise<void> {
    const token = this.getWeighingToken(false);
    if (!token) {
      this.setSyncStatus('ไม่พบ token จึงยังไม่ sync รถ', true);
      return;
    }
    try {
      if (oldCarNumber && oldCarNumber !== car.num) {
        await firstValueFrom(this.weighingService.moveRow({
          event: this.eventName,
          year: this.currentYear,
          class_name: className,
          session_name: sessionName,
          old_car_number: oldCarNumber,
          new_car_number: car.num,
          updated_by: this.activeUsername || this.activeUser?.role || 'unknown',
        }, token));
        delete this.weights[this.key(className, sessionName, oldCarNumber)];
        this.saveWeights();
      }
      const response = await firstValueFrom(this.weighingService.saveRow({
        event: this.eventName,
        year: this.currentYear,
        class_name: className,
        session_name: sessionName,
        car_number: car.num,
        car: this.buildCarMetadata(car),
        expected_versions: oldCarNumber && oldCarNumber !== car.num
          ? undefined
          : this.metadataExpectedVersions(className, sessionName, car.num),
        updated_by: this.activeUsername || this.activeUser?.role || 'unknown',
      }, token));
      this.applyCarFieldVersions(className, sessionName, car.num, response.car);
      this.setSyncStatus(`บันทึกรถ ${car.num} แล้ว`);
    } catch (err) {
      this.setSyncStatus(this.errorMessage(err, `บันทึกรถ ${car.num} ไม่สำเร็จ`), true);
    }
  }

  private buildCarMetadata(car: CarRow): Record<string, unknown> {
    return {
      'รุ่น': car.sub,
      'เบอร์รถ': car.num,
      'Target Weight (kg)': car.target,
      'ชื่อนักแข่ง1': car.driver1Name,
      'น้ำหนักนักแข่ง1': car.driver1Weight,
      'ชื่อนักแข่ง2': car.driver2Name,
      'น้ำหนักนักแข่ง2': car.driver2Weight,
    };
  }

  private metadataExpectedVersions(className: string, sessionName: string, carNumber: string): Record<string, number> {
    const fields = ['sub', 'target', 'driver1Name', 'driver1Weight', 'driver2Name', 'driver2Weight'];
    return fields.reduce<Record<string, number>>((versions, field) => {
      versions[field] = this.fieldVersions[this.fieldKey(className, sessionName, carNumber, field)]?.version ?? 0;
      return versions;
    }, {});
  }

  private clearPreviewLoadTimer(): void {
    if (!this.previewLoadTimer) return;
    clearTimeout(this.previewLoadTimer);
    this.previewLoadTimer = null;
  }

  private captureEventPreviewState(): EventPreviewState {
    return {
      eventName: this.eventName,
      eventDraftName: this.eventDraftName,
      classSessions: this.deepClone(this.classSessions),
      lockedSessions: this.deepClone(this.lockedSessions),
      data: this.deepClone(this.data),
      weights: this.deepClone(this.weights),
      fieldVersions: this.deepClone(this.fieldVersions),
      selectedClass: this.selectedClass,
      selectedSession: this.selectedSession,
      lastCacheUpdatedAt: this.lastCacheUpdatedAt,
      lastConfigUpdatedAt: this.lastConfigUpdatedAt,
    };
  }

  private restoreEventPreviewState(): void {
    const state = this.previewOriginalState;
    if (!state) return;
    this.eventName = state.eventName;
    this.eventDraftName = state.eventName;
    this.classSessions = this.deepClone(state.classSessions);
    this.lockedSessions = this.deepClone(state.lockedSessions);
    this.data = this.deepClone(state.data);
    this.weights = this.deepClone(state.weights);
    this.fieldVersions = this.deepClone(state.fieldVersions);
    this.selectedClass = state.selectedClass;
    this.selectedSession = state.selectedSession;
    this.lastCacheUpdatedAt = state.lastCacheUpdatedAt;
    this.lastConfigUpdatedAt = state.lastConfigUpdatedAt;
    this.previewOriginalState = null;
    this.ensureSelection();
    this.rebuildConfigDraftFromCurrent();
    this.saveData();
    this.saveWeights();
    localStorage.setItem(STORAGE_KEYS.event, this.eventName);
    this.updateTitle();
  }

  private async loadDraftEventPreview(): Promise<void> {
    const token = this.getWeighingToken(false);
    const previewEventName = this.sanitizeEventName(this.eventDraftName);
    if (!token || !previewEventName || !this.previewOriginalState) return;

    const requestId = ++this.previewRequestId;
    if (previewEventName === this.previewOriginalState.eventName) {
      this.restoreEventPreviewStateToDraft();
      return;
    }

    try {
      this.setSyncStatus('กำลังโหลด config event: ' + previewEventName + '...');
      const config = await firstValueFrom(this.weighingService.getConfig(previewEventName, this.currentYear, token));
      if (requestId !== this.previewRequestId) return;
      const previewClassSessions = this.normalizeEventClassSessions(config.class_sessions);
      const previewLockedSessions = this.normalizeEventLockedSessions(config.locked_sessions, previewClassSessions);
      this.rebuildConfigDraft(previewClassSessions, previewLockedSessions);
      this.setSyncStatus('โหลด config event แล้ว: ' + previewEventName);
    } catch (err) {
      if (requestId === this.previewRequestId) this.setSyncStatus(this.errorMessage(err, 'โหลด config event ไม่สำเร็จ'), true);
    }
  }

  private restoreEventPreviewStateToDraft(): void {
    const state = this.previewOriginalState;
    if (!state) return;
    const draftName = this.eventDraftName;
    this.eventDraftName = draftName;
    this.rebuildConfigDraft(state.classSessions, state.lockedSessions);
  }

  private deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private startPolling(): void {
    this.stopPolling();
    if (!this.activeUser) return;
    this.pollTimer = setInterval(() => this.syncActiveEvent(false), this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

   private importHeaderColumns(row: ExcelJS.Row): ImportHeaderColumns | null {
     let classCol = 0;
     let subCol = 0;
    let carCol = 0;
    let targetCol = 0;
    let raceCol = 0;
    let driver1NameCol = 0;
    let driver1WeightCol = 0;
    let driver2NameCol = 0;
    let driver2WeightCol = 0;
    row.eachCell((cell, colNumber) => {
       const header = this.cellText(cell).replace(/\s+/g, ' ').trim().toUpperCase();
       if (header === 'CLASS') classCol = colNumber;
       if (header === 'RACE') raceCol = colNumber;
       if (header === 'รุ่น' || header === 'SUB' || header === 'MODEL') subCol = colNumber;
       if (header === 'เบอร์รถ') carCol = colNumber;
       if (header === 'CAR NUMBER') carCol = colNumber;
       if (header === 'น้ำหนักที่ต้องการ') targetCol = colNumber;
       if (header === 'TARGET WEIGHT (KG)' || header === 'TARGET WEIGHT') targetCol = colNumber;
       if (header === 'ชื่อนักแข่ง1') driver1NameCol = colNumber;
       if (header === 'น้ำหนักนักแข่ง1') driver1WeightCol = colNumber;
       if (header === 'ชื่อนักแข่ง2') driver2NameCol = colNumber;
       if (header === 'น้ำหนักนักแข่ง2') driver2WeightCol = colNumber;
     });
     return carCol && targetCol ? { classCol, subCol, carCol, targetCol, raceCol, driver1NameCol, driver1WeightCol, driver2NameCol, driver2WeightCol } : null;
   }

   private importWorksheetContext(worksheet: ExcelJS.Worksheet): ImportWorksheetContext | null {
     const maxHeaderRow = Math.min(worksheet.rowCount, 10);
     for (let rowNumber = 1; rowNumber <= maxHeaderRow; rowNumber++) {
       const header = this.importHeaderColumns(worksheet.getRow(rowNumber));
       if (!header) continue;

       const defaultClassName = this.importClassMapping(this.firstNonEmptyRowValue(worksheet.getRow(1)))?.className ?? '';
       const defaultSessionName = rowNumber >= 3
         ? this.firstNonEmptyRowValue(worksheet.getRow(2)) || this.selectedSession
         : this.selectedSession;
       return {
         header,
         firstDataRow: rowNumber + 1,
         defaultClassName,
         defaultSessionName,
       };
     }
     return null;
   }

   private firstNonEmptyRowValue(row: ExcelJS.Row): string {
     let result = '';
     row.eachCell((cell) => {
       if (!result) result = this.cellText(cell);
     });
     return result;
   }

   private importClassMappingForRow(row: ExcelJS.Row, header: ImportHeaderColumns, classValue: string): ImportClassMapping | null {
     const mapping = this.importClassMapping(classValue);
     if (!mapping || !header.subCol) return mapping;

     const subValue = this.cellText(row.getCell(header.subCol)).replace(/\s+/g, ' ').trim().toUpperCase();
     if (!subValue) return mapping;
     if (mapping.className === 'PICKUP AB' && (subValue === 'A' || subValue === 'B')) {
       return { className: mapping.className, sub: `PICKUP ${subValue}` };
     }
     const subMapping = this.importClassMapping(subValue);
     return subMapping?.className === mapping.className ? subMapping : mapping;
   }

  private cellText(cell: ExcelJS.Cell): string {
    const value: any = cell.value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      if (value.text !== undefined) return String(value.text).trim();
      if (value.result !== undefined) return String(value.result).trim();
      if (Array.isArray(value.richText)) return value.richText.map((item: any) => item?.text ?? '').join('').trim();
    }
    return String(value).trim();
  }

  private importClassMapping(value: string): ImportClassMapping | null {
    const key = value.replace(/\s+/g, ' ').trim().toUpperCase();
    return IMPORT_CLASS_MAP[key] ?? IMPORT_CLASS_MAP[key.replace(/\s+/g, '')] ?? null;
  }

  private importTarget(cell: ExcelJS.Cell): { value: number | null; invalid: boolean } {
    const value = this.cellText(cell);
    if (!value) return { value: null, invalid: false };
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? { value: parsed, invalid: false } : { value: null, invalid: true };
  }

   private importSessionName(value: string, className: string, defaultSessionName = this.selectedSession): string {
     const raw = String(value ?? '').trim();
     const sessionName = raw ? this.normalizeImportRaceSession(raw) : defaultSessionName;
     const sessionKey = sessionName.replace(/\s+/g, '').toLowerCase();
     return (this.classSessions[className] ?? []).find((item) => item.replace(/\s+/g, '').toLowerCase() === sessionKey) ?? '';
   }

  private normalizeImportRaceSession(value: string): string {
    const normalized = String(value ?? '').replace(/\s+/g, '').trim();
    if (/^\d+$/.test(normalized)) return `Race${Number(normalized)}`;
    const raceMatch = normalized.match(/^race(\d+)$/i);
    if (raceMatch) return `Race${Number(raceMatch[1])}`;
    return String(value ?? '').trim();
  }

  private importDriverValues(row: ExcelJS.Row, header: ImportHeaderColumns): ImportDriverValues {
    return {
      driver1Name: header.driver1NameCol ? this.cellText(row.getCell(header.driver1NameCol)) : '',
      driver1Weight: header.driver1WeightCol ? this.numberOrNull(this.cellText(row.getCell(header.driver1WeightCol)).replace(/,/g, '')) : null,
      driver2Name: header.driver2NameCol ? this.cellText(row.getCell(header.driver2NameCol)) : '',
      driver2Weight: header.driver2WeightCol ? this.numberOrNull(this.cellText(row.getCell(header.driver2WeightCol)).replace(/,/g, '')) : null,
    };
  }

  private mergeImportedCar(cars: CarRow[], sub: string, carNumber: string, target: number | null, drivers: ImportDriverValues): boolean {
    const existing = cars.find((car) => car.num.trim().toLowerCase() === carNumber.toLowerCase());
    if (existing) {
      existing.sub = sub;
      existing.target = target;
      existing.driver1Name = drivers.driver1Name;
      existing.driver1Weight = drivers.driver1Weight;
      existing.driver2Name = drivers.driver2Name;
      existing.driver2Weight = drivers.driver2Weight;
      return true;
    }
    cars.push({ sub, num: carNumber, target, ...drivers });
    return false;
  }

  private async saveImportedSessionsToRedis(changedPairs: Set<string>, importedRows: number, addedRows: number, updatedRows: number, skippedRows: number): Promise<void> {
    const token = this.getWeighingToken(false);
    if (!token) {
      this.setSyncStatus(`Import Excel แล้ว ${importedRows} รายการ: เพิ่ม ${addedRows}, อัปเดต ${updatedRows}, skipped ${skippedRows} แต่ยังไม่ sync Redis เพราะไม่พบ token`, true);
      return;
    }

    const pairs = Array.from(changedPairs);
    this.saveInFlight = true;
    try {
      for (let index = 0; index < pairs.length; index++) {
        const [className, sessionName] = pairs[index].split('|');
        this.setSyncStatus(`Import Excel แล้ว ${importedRows} รายการ: เพิ่ม ${addedRows}, อัปเดต ${updatedRows} กำลัง sync Redis ${index + 1}/${pairs.length} sessions...`);
        for (const car of this.data[className]?.[sessionName] ?? []) {
          const response = await firstValueFrom(this.weighingService.saveRow({
            event: this.eventName,
            year: this.currentYear,
            class_name: className,
            session_name: sessionName,
            car_number: car.num,
            car: this.buildCarMetadata(car),
            expected_versions: this.metadataExpectedVersions(className, sessionName, car.num),
            updated_by: this.activeUsername || this.activeUser?.role || 'unknown',
          }, token));
          this.applyCarFieldVersions(className, sessionName, car.num, response.car);
        }
      }
      this.saveInFlight = false;
      this.setSyncStatus(`Import Excel แล้ว ${importedRows} รายการ: เพิ่ม ${addedRows}, อัปเดต ${updatedRows}, skipped ${skippedRows}, sync Redis ${pairs.length} sessions`);
    } catch (err) {
      this.saveInFlight = false;
      this.setSyncStatus(this.errorMessage(err, `Import Excel แล้ว ${importedRows} รายการ: เพิ่ม ${addedRows}, อัปเดต ${updatedRows} แต่ sync Redis ไม่สำเร็จ`), true);
    }
  }

  private ensureDataShape(data: Record<string, Record<string, CarRow[]>>): Record<string, Record<string, CarRow[]>> {
    const shaped = data && typeof data === 'object' ? data : emptyWeighingData();
    Object.entries(shaped).forEach(([className, rawSessions]) => {
      if (!MASTER_CLASS_SESSIONS[className] || !rawSessions || typeof rawSessions !== 'object' || Array.isArray(rawSessions)) {
        delete shaped[className];
        return;
      }
      Object.entries(rawSessions).forEach(([sessionName, cars]) => {
        if (!this.isAllowedConfigSession(sessionName) || !Array.isArray(cars)) {
          delete shaped[className][sessionName];
          return;
        }
        shaped[className][sessionName] = cars.map((car) => this.normalizeCarRow(className, car)).filter((car) => car.num);
      });
    });
    return shaped;
  }

  private normalizeEventClassSessions(classSessions: Record<string, string[]> | undefined): Record<string, string[]> {
    const normalized: Record<string, string[]> = {};
    Object.keys(MASTER_CLASS_SESSIONS).forEach((className) => {
      const sessions = classSessions?.[className] ?? [];
      const selectedSessions = (sessions ?? []).filter((sessionName, index, all) => this.isAllowedConfigSession(sessionName) && all.indexOf(sessionName) === index);
      if (selectedSessions.length > 0) normalized[className] = selectedSessions;
    });
    // Do not silently restore every class when the server returns an empty or
    // malformed configuration. The backend owns first-time defaults.
    return normalized;
  }

  private normalizeEventLockedSessions(lockedSessions: Record<string, string[]> | undefined, classSessions: Record<string, string[]>): Record<string, string[]> {
    const normalized: Record<string, string[]> = {};
    Object.entries(lockedSessions ?? {}).forEach(([className, sessions]) => {
      const enabledSessions = classSessions[className] ?? [];
      if (enabledSessions.length === 0) return;
      const selectedLocks = (sessions ?? []).filter((sessionName, index, all) => enabledSessions.includes(sessionName) && all.indexOf(sessionName) === index);
      if (selectedLocks.length > 0) normalized[className] = selectedLocks;
    });
    return normalized;
  }

  private isSessionLocked(className: string, sessionName: string): boolean {
    return !!className && !!sessionName && (this.lockedSessions[className] ?? []).includes(sessionName);
  }

  private isAllowedConfigSession(sessionName: string): boolean {
    return sessionName === 'Qualify' || this.isRaceSessionName(sessionName);
  }

  private isRaceSessionName(sessionName: string): boolean {
    return /^Race[1-9]\d*$/.test(String(sessionName ?? '').trim());
  }

  private emptyRaceDraftSlots(): ConfigRaceDraftSlot[] {
    return Array.from({ length: CONFIG_RACE_SLOT_COUNT }, () => ({ enabled: false, raceNo: '', locked: false }));
  }

  private normalizeCarRow(className: string, car: Partial<CarRow>): CarRow {
    return {
      sub: this.normalizeSubForClass(className, String(car?.sub ?? '')),
      num: String(car?.num ?? '').trim(),
      target: this.numberOrNull(car?.target),
      driver1Name: String(car?.driver1Name ?? '').trim(),
      driver1Weight: this.numberOrNull(car?.driver1Weight),
      driver2Name: String(car?.driver2Name ?? '').trim(),
      driver2Weight: this.numberOrNull(car?.driver2Weight),
    };
  }

  private ensureSessionData(cls: string, sess: string): CarRow[] {
    if (!cls || !sess) return [];
    if (!this.data[cls]) this.data[cls] = {};
    if (!Array.isArray(this.data[cls][sess])) this.data[cls][sess] = [];
    return this.data[cls][sess];
  }

  private ensureSelection(): void {
    if (this.classOptions.length === 0) {
      this.selectedClass = '';
      this.selectedSession = '';
      return;
    }
    if (!this.classSessions[this.selectedClass]) this.selectedClass = this.classOptions[0] ?? '';
    if (!this.sessions.includes(this.selectedSession)) this.selectedSession = this.sessions[0] ?? '';
    if (!this.selectedClass || !this.selectedSession) return;
    this.ensureSessionData(this.selectedClass, this.selectedSession);
    this.newSub = this.normalizeSubForClass(this.selectedClass, this.newSub);
  }

  private defaultSubForClass(className: string): string {
    return CLASS_SUB_OPTIONS[className]?.[0] ?? className;
  }

  private normalizeSubForClass(className: string, sub: string): string {
    const value = String(sub ?? '').trim();
    const options = CLASS_SUB_OPTIONS[className] ?? [];
    if (options.length === 0) return className;
    return options.includes(value) ? value : options[0];
  }

  private key(cls: string, sess: string, num: string): string {
    return `${cls}|${sess}|${num}`;
  }

  private fieldKey(cls: string, sess: string, num: string, field: string): string {
    return `${this.key(cls, sess, num)}|${field}`;
  }

  private weightBlock(car: CarRow, prefix: 'fuel' | 'dry'): Record<string, number | string | null> {
    const stats = this.calcWeightGroup(car, prefix);
    return {
      'เครื่องชั่ง 1': stats.has ? Number(stats.w1) : null,
      'เครื่องชั่ง 2': stats.has ? Number(stats.w2) : null,
      Total: stats.total !== null ? Number(stats.total.toFixed(2)) : null,
      'Diff Cal (KG)': stats.diff !== null ? Number(stats.diff.toFixed(2)) : null,
      '%': stats.pct !== null ? `${(stats.pct * 100).toFixed(2)}%` : null,
    };
  }

  private weightBlockFor(className: string, sessionName: string, car: CarRow, prefix: 'fuel' | 'dry'): Record<string, number | string | null> {
    const stats = this.calcGroupFor(className, sessionName, car, prefix);
    return {
      'เครื่องชั่ง 1': stats.has ? Number(stats.w1) : null,
      'เครื่องชั่ง 2': stats.has ? Number(stats.w2) : null,
      Total: stats.total !== null ? Number(stats.total.toFixed(2)) : null,
      'Diff Cal (KG)': stats.diff !== null ? Number(stats.diff.toFixed(2)) : null,
      '%': stats.pct !== null ? `${(stats.pct * 100).toFixed(2)}%` : null,
    };
  }

  private buildCarReport(car: CarRow): WeighingCarPayload {
    return {
      รุ่น: this.normalizeSubForClass(this.selectedClass, car.sub),
      เบอร์รถ: String(car.num),
      'Target Weight (kg)': car.target,
      ชื่อนักแข่ง1: car.driver1Name,
      น้ำหนักนักแข่ง1: car.driver1Weight,
      ชื่อนักแข่ง2: car.driver2Name,
      น้ำหนักนักแข่ง2: car.driver2Weight,
      'INCLUDING FUEL': this.weightBlock(car, 'fuel'),
      'DRY WEIGHT': this.weightBlock(car, 'dry'),
    };
  }

  private buildCarReportFor(className: string, sessionName: string, car: CarRow): WeighingCarPayload {
    return {
      รุ่น: this.normalizeSubForClass(className, car.sub),
      เบอร์รถ: String(car.num),
      'Target Weight (kg)': car.target,
      ชื่อนักแข่ง1: car.driver1Name,
      น้ำหนักนักแข่ง1: car.driver1Weight,
      ชื่อนักแข่ง2: car.driver2Name,
      น้ำหนักนักแข่ง2: car.driver2Weight,
      'INCLUDING FUEL': this.weightBlockFor(className, sessionName, car, 'fuel'),
      'DRY WEIGHT': this.weightBlockFor(className, sessionName, car, 'dry'),
    };
  }

  private buildSessionCars(className: string, sessionName: string): Record<string, WeighingCarPayload> {
    return (this.data[className]?.[sessionName] ?? []).reduce<Record<string, WeighingCarPayload>>((acc, car) => {
      acc[String(car.num)] = this.buildCarReportFor(className, sessionName, car);
      return acc;
    }, {});
  }

  private applyCache(cache: TssWeighingCacheResponse): void {
    const nextData = emptyWeighingData();
    const nextWeights: Record<string, WeightRecord> = {};
    const nextFieldVersions: Record<string, FieldVersionInfo> = {};
    Object.entries(cache.classes ?? {}).forEach(([cls, classData]) => {
      if (!MASTER_CLASS_SESSIONS[cls]) return;
      nextData[cls] = nextData[cls] ?? {};
      Object.entries(classData.sessions ?? {}).forEach(([sess, sessionData]) => {
        if (!this.isAllowedConfigSession(sess)) return;
        const cars = Object.values(sessionData.cars ?? {}).map((item: any) => {
          const carNumber = String(item?.['เบอร์รถ'] ?? '').trim();
          return {
            sub: this.normalizeSubForClass(cls, String(item?.['รุ่น'] ?? '')),
            num: carNumber,
            target: this.numberOrNull(item?.['Target Weight (kg)']),
            driver1Name: String(item?.['ชื่อนักแข่ง1'] ?? '').trim(),
            driver1Weight: this.numberOrNull(item?.['น้ำหนักนักแข่ง1']),
            driver2Name: String(item?.['ชื่อนักแข่ง2'] ?? '').trim(),
            driver2Weight: this.numberOrNull(item?.['น้ำหนักนักแข่ง2']),
          };
        }).filter((car) => car.num);
        nextData[cls][sess] = cars;
        Object.values(sessionData.cars ?? {}).forEach((item: any) => {
          const num = String(item?.['เบอร์รถ'] ?? '').trim();
          if (!num) return;
          const record: WeightRecord = {};
          const fuel = item?.['INCLUDING FUEL'] ?? {};
          const dry = item?.['DRY WEIGHT'] ?? {};
          record.fuel_w1 = this.numberOrZero(fuel['เครื่องชั่ง 1']);
          record.fuel_w2 = this.numberOrZero(fuel['เครื่องชั่ง 2']);
          record.dry_w1 = this.numberOrZero(dry['เครื่องชั่ง 1']);
          record.dry_w2 = this.numberOrZero(dry['เครื่องชั่ง 2']);
          nextWeights[this.key(cls, sess, num)] = record;
          this.extractFieldVersions(item, cls, sess, num, nextFieldVersions);
        });
      });
    });
    this.data = nextData;
    this.weights = nextWeights;
    this.fieldVersions = nextFieldVersions;
    this.ensureSelection();
    this.saveData();
    this.saveWeights();
  }

  private applySessionCache(cache: TssWeighingCacheResponse, className: string, sessionName: string, force = false): void {
    const session = cache.classes?.[className]?.sessions?.[sessionName];
    const remoteCars = session?.cars ?? {};
    const currentCars = this.ensureSessionData(className, sessionName);
    const currentByNumber = new Map(currentCars.map((car) => [car.num, car]));
    const nextCars: CarRow[] = [];
    const nextWeights = { ...this.weights };

    Object.values(remoteCars).forEach((item: any) => {
      const carNumber = String(item?.['เบอร์รถ'] ?? '').trim();
      if (!carNumber) return;
      const current = currentByNumber.get(carNumber);
      const remoteCar = this.normalizeCarRow(className, {
        sub: item?.['รุ่น'],
        num: carNumber,
        target: item?.['Target Weight (kg)'],
        driver1Name: item?.['ชื่อนักแข่ง1'],
        driver1Weight: item?.['น้ำหนักนักแข่ง1'],
        driver2Name: item?.['ชื่อนักแข่ง2'],
        driver2Weight: item?.['น้ำหนักนักแข่ง2'],
      });
      if (!current) {
        nextCars.push(remoteCar);
      } else {
        const merged = { ...current, ...remoteCar };
        ['sub', 'target', 'driver1Name', 'driver1Weight', 'driver2Name', 'driver2Weight'].forEach((field) => {
          if (this.hasDirtyField(className, sessionName, carNumber, field)) {
            (merged as any)[field] = (current as any)[field];
          }
        });
        nextCars.push(merged);
      }

      const fuel = item?.['INCLUDING FUEL'] ?? {};
      const dry = item?.['DRY WEIGHT'] ?? {};
      const weightKey = this.key(className, sessionName, carNumber);
      const remoteWeights: WeightRecord = {
        fuel_w1: this.numberOrZero(fuel['เครื่องชั่ง 1']),
        fuel_w2: this.numberOrZero(fuel['เครื่องชั่ง 2']),
        dry_w1: this.numberOrZero(dry['เครื่องชั่ง 1']),
        dry_w2: this.numberOrZero(dry['เครื่องชั่ง 2']),
      };
      const mergedWeights = { ...(nextWeights[weightKey] ?? {}), ...remoteWeights };
      (['fuel_w1', 'fuel_w2', 'dry_w1', 'dry_w2'] as WeightField[]).forEach((field) => {
        if (this.hasDirtyField(className, sessionName, carNumber, field)) {
          mergedWeights[field] = nextWeights[weightKey]?.[field] ?? 0;
        }
      });
      nextWeights[weightKey] = mergedWeights;
      this.extractFieldVersions(item, className, sessionName, carNumber, this.fieldVersions, true);
    });

    currentCars.forEach((car) => {
      if (!nextCars.some((item) => item.num === car.num) && this.carHasDirtyField(className, sessionName, car.num)) {
        nextCars.push(car);
      }
    });
    this.data[className][sessionName] = nextCars;
    this.weights = nextWeights;
    this.saveData();
    this.saveWeights();
    this.ensureSelection();
  }

  private connectWeighingUpdates(): void {
    const token = this.getWeighingToken(false);
    if (!token || !this.activeUser || !this.selectedClass || !this.selectedSession) return;
    const scope = `${this.eventName}|${this.currentYear}|${this.selectedClass}|${this.selectedSession}`;
    if (this.weighingWsScope === scope && this.weighingWs && (this.weighingWs.readyState === WebSocket.OPEN || this.weighingWs.readyState === WebSocket.CONNECTING)) return;
    this.disconnectWeighingUpdates(false);
    const generation = ++this.weighingWsGeneration;
    this.weighingWsScope = scope;
    const url = this.weighingService.weighingUpdatesUrl(this.eventName, this.currentYear, this.selectedClass, this.selectedSession, token);
    try {
      const ws = new WebSocket(url);
      this.weighingWs = ws;
      ws.onopen = () => {
        if (generation === this.weighingWsGeneration) this.setSyncStatus(`Realtime connected: ${this.selectedClass} / ${this.selectedSession}`);
      };
      ws.onmessage = (event) => {
        if (generation !== this.weighingWsGeneration) return;
        try {
          this.applyRemoteUpdate(JSON.parse(event.data) as TssWeighingUpdateMessage);
        } catch {
          // Ignore malformed realtime messages and rely on the next reconciliation load.
        }
      };
      ws.onclose = () => {
        if (generation !== this.weighingWsGeneration || !this.activeUser) return;
        this.weighingWs = null;
        if (this.weighingWsReconnectTimer) clearTimeout(this.weighingWsReconnectTimer);
        this.weighingWsReconnectTimer = setTimeout(() => {
          this.weighingWsReconnectTimer = null;
          this.connectWeighingUpdates();
        }, 3000);
      };
      ws.onerror = () => {
        if (generation === this.weighingWsGeneration) this.setSyncStatus('Realtime weighing disconnected', true);
      };
    } catch {
      this.setSyncStatus('Realtime weighing connection failed', true);
    }
  }

  private disconnectWeighingUpdates(scheduleReconnect = false): void {
    this.weighingWsGeneration++;
    if (this.weighingWsReconnectTimer) {
      clearTimeout(this.weighingWsReconnectTimer);
      this.weighingWsReconnectTimer = null;
    }
    if (this.weighingWs) {
      this.weighingWs.onopen = null;
      this.weighingWs.onmessage = null;
      this.weighingWs.onclose = null;
      this.weighingWs.onerror = null;
      this.weighingWs.close();
      this.weighingWs = null;
    }
    this.weighingWsScope = '';
    if (scheduleReconnect && this.activeUser) this.connectWeighingUpdates();
  }

  private applyRemoteUpdate(message: TssWeighingUpdateMessage): void {
    if (!message || message.event !== this.eventName || Number(message.year) !== this.currentYear) return;
    if (message.class_name !== this.selectedClass || message.session_name !== this.selectedSession) return;
    const carNumber = String(message.car_number ?? '').trim();
    if (!carNumber) return;
    if (message.type === 'weighing_class_reset') {
      this.loadSelectedSessionAndConnect(true, true);
      return;
    }
    const cars = this.ensureSessionData(this.selectedClass, this.selectedSession);
    const car = cars.find((item) => item.num === carNumber);
    if (message.type === 'weighing_row_updated') {
      if (message.deleted) {
        const index = cars.findIndex((item) => item.num === carNumber);
        if (index >= 0 && !this.carHasDirtyField(this.selectedClass, this.selectedSession, carNumber)) {
          cars.splice(index, 1);
          delete this.weights[this.key(this.selectedClass, this.selectedSession, carNumber)];
          this.clearDirtyForCar(this.selectedClass, this.selectedSession, carNumber);
        }
      } else if (message.car) {
        this.applyRemoteCar(carNumber, message.car);
      }
      this.saveData();
      this.saveWeights();
      return;
    }
    if (message.type !== 'weighing_field_updated' || !message.field) return;
    const field = message.field;
    const fieldKey = this.fieldKey(this.selectedClass, this.selectedSession, carNumber, field);
    const incomingVersion = Number(message.version ?? 0);
    const knownVersion = this.fieldVersions[fieldKey]?.version ?? 0;
    if (incomingVersion <= knownVersion) return;
    if (this.hasDirtyField(this.selectedClass, this.selectedSession, carNumber, field)) {
      this.setSyncStatus(`มีข้อมูลใหม่จาก ${message.updated_by || 'ผู้ใช้อื่น'} ในรถ ${carNumber} ช่อง ${field} กรุณาตรวจสอบ`, true);
      return;
    }
    this.fieldVersions[fieldKey] = {
      version: incomingVersion,
      updatedBy: String(message.updated_by ?? ''),
      updatedAt: String(message.updated_at ?? ''),
    };
    if (!car) {
      this.loadSelectedSessionAndConnect(true, true);
      return;
    }
    this.applyLocalFieldValue(car, field, message.value);
    this.saveData();
    this.saveWeights();
  }

  private applyRemoteCar(carNumber: string, remote: Record<string, unknown>): void {
    const cars = this.ensureSessionData(this.selectedClass, this.selectedSession);
    const current = cars.find((item) => item.num === carNumber);
    const normalized = this.normalizeCarRow(this.selectedClass, {
      sub: String(remote['รุ่น'] ?? ''), num: carNumber, target: this.numberOrNull(remote['Target Weight (kg)']),
      driver1Name: String(remote['ชื่อนักแข่ง1'] ?? ''), driver1Weight: this.numberOrNull(remote['น้ำหนักนักแข่ง1']),
      driver2Name: String(remote['ชื่อนักแข่ง2'] ?? ''), driver2Weight: this.numberOrNull(remote['น้ำหนักนักแข่ง2']),
    });
    if (!current) {
      cars.push(normalized);
    } else {
      (['sub', 'target', 'driver1Name', 'driver1Weight', 'driver2Name', 'driver2Weight'] as const).forEach((field) => {
        if (!this.hasDirtyField(this.selectedClass, this.selectedSession, carNumber, field)) {
          (current as any)[field] = (normalized as any)[field];
        }
      });
    }
    const fuel = remote['INCLUDING FUEL'] as any ?? {};
    const dry = remote['DRY WEIGHT'] as any ?? {};
    const weightKey = this.key(this.selectedClass, this.selectedSession, carNumber);
    const currentWeights = this.weights[weightKey] ?? {};
    const remoteWeights: WeightRecord = {
      fuel_w1: this.numberOrZero(fuel['เครื่องชั่ง 1']), fuel_w2: this.numberOrZero(fuel['เครื่องชั่ง 2']),
      dry_w1: this.numberOrZero(dry['เครื่องชั่ง 1']), dry_w2: this.numberOrZero(dry['เครื่องชั่ง 2']),
    };
    this.weights[weightKey] = { ...currentWeights, ...remoteWeights };
    (['fuel_w1', 'fuel_w2', 'dry_w1', 'dry_w2'] as WeightField[]).forEach((field) => {
      if (this.hasDirtyField(this.selectedClass, this.selectedSession, carNumber, field)) {
        this.weights[weightKey][field] = currentWeights[field] ?? 0;
      }
    });
    this.extractFieldVersions(remote, this.selectedClass, this.selectedSession, carNumber, this.fieldVersions, true);
  }

  private applyLocalFieldValue(car: CarRow, field: string, value: unknown): void {
    if (field === 'fuel_w1' || field === 'fuel_w2' || field === 'dry_w1' || field === 'dry_w2') {
      const weightKey = this.key(this.selectedClass, this.selectedSession, car.num);
      this.weights[weightKey] = this.weights[weightKey] ?? {};
      this.weights[weightKey][field] = this.numberOrZero(value);
      return;
    }
    if (field === 'target' || field === 'driver1Weight' || field === 'driver2Weight') {
      (car as any)[field] = this.numberOrNull(value);
      return;
    }
    if (field === 'sub' || field === 'driver1Name' || field === 'driver2Name') {
      (car as any)[field] = String(value ?? '').trim();
    }
  }

  private extractFieldVersions(item: any, className: string, sessionName: string, carNumber: string, target: Record<string, FieldVersionInfo>, preserveDirty = false): void {
    const versions = item?._field_versions ?? {};
    Object.entries(versions).forEach(([field, raw]: [string, any]) => {
      if (preserveDirty && this.hasDirtyField(className, sessionName, carNumber, field)) return;
      target[this.fieldKey(className, sessionName, carNumber, field)] = {
        version: this.numberOrZero(raw?.version),
        updatedBy: String(raw?.updated_by ?? ''),
        updatedAt: String(raw?.updated_at ?? ''),
      };
    });
  }

  private applyCarFieldVersions(className: string, sessionName: string, carNumber: string, car: Record<string, unknown> | undefined): void {
    if (!car) return;
    this.extractFieldVersions(car, className, sessionName, carNumber, this.fieldVersions, true);
  }

  private handleFieldSaveError(err: any, className: string, sessionName: string, carNumber: string, field: string): void {
    if (err?.status === 409 || err?.error?.error === 'conflict') {
      const body = err.error ?? {};
      const currentVersion = this.numberOrZero(body.current_version);
      this.fieldVersions[this.fieldKey(className, sessionName, carNumber, field)] = {
        version: currentVersion,
        updatedBy: String(body.current_updated_by ?? ''),
        updatedAt: String(body.current_updated_at ?? ''),
      };
      this.setSyncStatus(
        `บันทึกไม่ได้: ${className} / ${sessionName} รถ ${carNumber} ช่อง ${field} มีข้อมูลใหม่แล้ว ` +
        `(ล่าสุด: ${body.current_value ?? '-'} โดย ${body.current_updated_by || 'unknown'}) กรุณา Load/Refresh ก่อนบันทึกซ้ำ`,
        true
      );
      return;
    }
    this.setSyncStatus(this.errorMessage(err, 'บันทึก Redis ไม่สำเร็จ'), true);
  }

  private clearLocalCurrentClass(cls: string): void {
    this.data[cls] = {};
    (this.classSessions[cls] ?? []).forEach((sess) => this.data[cls][sess] = []);
    Object.keys(this.weights).forEach((k) => {
      if (k.startsWith(`${cls}|`)) delete this.weights[k];
    });
    Object.keys(this.fieldVersions).forEach((k) => {
      if (k.startsWith(`${cls}|`)) delete this.fieldVersions[k];
    });
    this.saveData();
    this.saveWeights();
  }

  private buildWorkbookForClasses(classNames: string[]): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TSS Weighing Sheet';
    workbook.created = new Date();
    classNames.forEach((className) => {
      (this.classSessions[className] ?? []).forEach((sessionName) => {
        const sheet = workbook.addWorksheet(this.uniqueSheetName(workbook, sessionName, className));
        this.buildWeighingSheet(sheet, className, sessionName);
      });
    });
    return workbook;
  }

  private buildWeighingSheet(sheet: ExcelJS.Worksheet, className: string, sessionName: string): void {
    this.configureSheetColumns(sheet);
    this.applyHeader(sheet, className, sessionName);
    this.getExcelRows(className, sessionName).forEach((row, index) => this.addExcelDataRow(sheet, row, 4 + index));
  }

  private configureSheetColumns(sheet: ExcelJS.Worksheet): void {
    const widths = [6, 12, 16, 18, 18, 16, 18, 16, 12, 12, 12, 14, 10, 3, 12, 12, 12, 14, 10];
    widths.forEach((width, index) => sheet.getColumn(index + 1).width = width);
  }

  private applyHeader(sheet: ExcelJS.Worksheet, className: string, sessionName: string): void {
    sheet.mergeCells('A1:C1');
    sheet.mergeCells('A2:C2');
    sheet.mergeCells('I2:M2');
    sheet.mergeCells('O2:S2');

    sheet.getCell('A1').value = className;
    sheet.getCell('A2').value = sessionName.toUpperCase();
    sheet.getCell('I2').value = 'ชั่งปรกติรวมน้ำมัน\n(INCLUDING FUEL)';
    sheet.getCell('O2').value = 'ชั่งปรกติไม่รวมน้ำมัน\n( DRY WEIGHT)';
    sheet.getRow(3).values = [
      '#', 'รุ่น', 'เบอร์รถ', 'Target Weight\n(kg)', 'ชื่อนักแข่ง1', 'น้ำหนักนักแข่ง1', 'ชื่อนักแข่ง2', 'น้ำหนักนักแข่ง2',
      'เครื่องชั่ง 1', 'เครื่องชั่ง 2', 'รวม', 'Diff Cal\n(KG)', '%', '',
      'เครื่องชั่ง 1', 'เครื่องชั่ง 2', 'รวม', 'Diff Cal\n(KG)', '%',
    ];

    sheet.getRow(1).height = 34;
    sheet.getRow(2).height = 58;
    sheet.getRow(3).height = 45;

    this.styleRange(sheet, 1, 1, 1, 3, { fill: 'F4B183', fontColor: '000000', bold: true, size: 22 });
    this.styleRange(sheet, 2, 1, 2, 3, { fill: 'FFF2CC', fontColor: '000000', bold: true, size: 22 });
    this.styleRange(sheet, 2, 9, 2, 13, { fill: '4472C4', fontColor: 'FFFFFF', bold: true, size: 12 });
    this.styleRange(sheet, 2, 15, 2, 19, { fill: '4472C4', fontColor: 'FFFFFF', bold: true, size: 12 });
    this.styleRange(sheet, 3, 1, 3, 19, { fill: 'B4C6E7', fontColor: '000000', bold: true, size: 12 });
  }

  private styleRange(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    opts: { fill: string; fontColor: string; bold: boolean; size: number }
  ): void {
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = sheet.getCell(row, col);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
        cell.font = { bold: opts.bold, size: opts.size, color: { argb: opts.fontColor }, name: 'Prompt' };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = this.thinBorder();
      }
    }
  }

  private addExcelDataRow(sheet: ExcelJS.Worksheet, row: WeighingExcelRow, rowNumber: number): void {
    const excelRow = sheet.getRow(rowNumber);
    excelRow.height = 28;
    excelRow.values = [
      row.index, row.sub, row.carNumber, row.targetWeight, row.driver1Name, row.driver1Weight, row.driver2Name, row.driver2Weight,
      row.fuelW1, row.fuelW2, row.fuelTotal, row.fuelDiff, row.fuelPct, '',
      row.dryW1, row.dryW2, row.dryTotal, row.dryDiff, row.dryPct,
    ];

    for (let col = 1; col <= 19; col++) {
      const cell = sheet.getCell(rowNumber, col);
      cell.border = this.thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: [2, 5, 7].includes(col) ? 'center' : 'right' };
      cell.font = { name: 'Prompt', size: 12 };
    }

    [1, 2, 3].forEach((col) => sheet.getCell(rowNumber, col).alignment = { vertical: 'middle', horizontal: 'center' });
    [9, 10, 15, 16].forEach((col) => sheet.getCell(rowNumber, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } });
    [11, 17].forEach((col) => {
      sheet.getCell(rowNumber, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EDEDED' } };
      sheet.getCell(rowNumber, col).font = { name: 'Prompt', size: 12, bold: true };
    });
    [4, 6, 8, 9, 10, 11, 12, 15, 16, 17, 18].forEach((col) => sheet.getCell(rowNumber, col).numFmt = '#,##0.00;[Red](#,##0.00);-');
    [13, 19].forEach((col) => sheet.getCell(rowNumber, col).numFmt = '0%;[Red]-0%;-');
    [12, 18].forEach((col) => {
      const cell = sheet.getCell(rowNumber, col);
      if (typeof cell.value === 'number' && cell.value < 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } };
        cell.font = { name: 'Prompt', size: 12, color: { argb: 'C00000' } };
      }
    });
  }

  private getExcelRows(className: string, sessionName: string): WeighingExcelRow[] {
    return (this.data[className]?.[sessionName] ?? []).map((car, index) => {
      const fuel = this.calcGroupFor(className, sessionName, car, 'fuel');
      const dry = this.calcGroupFor(className, sessionName, car, 'dry');
      const fuelValues = this.excelGroupValues(fuel, car.target);
      const dryValues = this.excelGroupValues(dry, car.target);
      return {
        index: index + 1,
        sub: this.excelSubText(className, car.sub),
        carNumber: String(car.num),
        targetWeight: car.target,
        driver1Name: car.driver1Name,
        driver1Weight: car.driver1Weight,
        driver2Name: car.driver2Name,
        driver2Weight: car.driver2Weight,
        fuelW1: fuelValues.w1,
        fuelW2: fuelValues.w2,
        fuelTotal: fuelValues.total,
        fuelDiff: fuelValues.diff,
        fuelPct: fuelValues.pct,
        dryW1: dryValues.w1,
        dryW2: dryValues.w2,
        dryTotal: dryValues.total,
        dryDiff: dryValues.diff,
        dryPct: dryValues.pct,
      };
    });
  }

  private excelGroupValues(stats: WeightStats, target: number | null): ExcelGroupValues {
    const diff = stats.diff !== null ? stats.diff : (target !== null ? -target : null);
    const pct = stats.pct !== null ? stats.pct : (target ? -1 : null);
    return {
      w1: stats.has ? stats.w1 : '-',
      w2: stats.has ? stats.w2 : '-',
      total: stats.total ?? '-',
      diff,
      pct,
    };
  }

  private excelSubText(className: string, sub: string): string {
    const normalized = this.normalizeSubForClass(className, sub);
    if (className === 'PICKUP AB') {
      if (normalized === 'PICKUP A') return 'A';
      if (normalized === 'PICKUP B') return 'B';
    }
    return normalized;
  }

  private thinBorder(): Partial<ExcelJS.Borders> {
    return {
      top: { style: 'thin', color: { argb: '000000' } },
      left: { style: 'thin', color: { argb: '000000' } },
      bottom: { style: 'thin', color: { argb: '000000' } },
      right: { style: 'thin', color: { argb: '000000' } },
    };
  }

  private uniqueSheetName(workbook: ExcelJS.Workbook, sessionName: string, className: string): string {
    const base = this.sheetName(sessionName, className);
    let name = base;
    let index = 2;
    while (workbook.getWorksheet(name)) {
      const suffix = '_' + index++;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    return name;
  }

  private async downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string): Promise<void> {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private calcGroupFor(cls: string, sess: string, car: CarRow, prefix: 'fuel' | 'dry'): WeightStats {
    const record = this.weights[this.key(cls, sess, car.num)] ?? {};
    const w1 = Number(record[`${prefix}_w1` as WeightField] ?? 0);
    const w2 = Number(record[`${prefix}_w2` as WeightField] ?? 0);
    const has = w1 > 0 || w2 > 0;
    const total = has ? w1 + w2 : null;
    const diff = total !== null && car.target !== null ? total - car.target : null;
    const pct = diff !== null && car.target ? diff / car.target : null;
    return { w1, w2, has, total, diff, pct };
  }

  private getWeighingToken(showStatus = true): string {
    const token = String(window.TSS_WEIGHING_CONFIG?.token ?? '').trim();
    if (!token && showStatus) this.setSyncStatus('ไม่พบ TSS weighing token จาก config.js', true);
    return token;
  }

  private setSyncStatus(message: string, isError = false): void {
    this.syncStatus = message;
    this.syncError = isError;
  }

  private errorMessage(err: any, fallback: string): string {
    return err?.error?.error || err?.message || fallback;
  }

  private getStoredEventName(): string {
    return this.sanitizeEventName(localStorage.getItem(STORAGE_KEYS.event) ?? 'BRIC1');
  }

  private sanitizeEventName(value: string): string {
    return String(value || '').trim() || 'BRIC1';
  }

  private safeFilePart(value: string): string {
    return this.sanitizeEventName(value).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'BRIC1';
  }

  private sheetName(sessionName: string, className: string): string {
    const name = `${sessionName}_${className}`.replace(/[\\/?*\[\]:]/g, ' ').trim() || 'Sheet';
    return name.slice(0, 31);
  }

  private numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private numberOrZero(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private updateTitle(): void {
    document.title = `TSS Weighing Sheet — ${this.eventName} ${this.currentYear}`;
  }
}

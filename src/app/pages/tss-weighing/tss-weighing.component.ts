import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import ExcelJS from 'exceljs';
import { firstValueFrom } from 'rxjs';
import { TssWeighingActiveEventResponse, TssWeighingCacheResponse, TssWeighingService } from './tss-weighing.service';

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
}

interface WeightRecord {
  fuel_w1?: number;
  fuel_w2?: number;
  dry_w1?: number;
  dry_w2?: number;
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
  'INCLUDING FUEL': Record<string, number | string | null>;
  'DRY WEIGHT': Record<string, number | string | null>;
}

interface WeighingExcelRow {
  index: number;
  sub: string;
  carNumber: string;
  targetWeight: number | null;
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

const CLASS_SESSIONS: Record<string, string[]> = {
  ECO: ['Qualify', 'Race4', 'Race5'],
  Touring: ['Qualify', 'Race3', 'Race4'],
  'PICKUP C': ['Qualify', 'Race4', 'Race5'],
  'PICKUP AB': ['Qualify', 'Race4', 'Race5'],
  GR86: ['Qualify', 'Race3', 'Race4'],
  'GT4 GTC': ['Qualify', 'Race3', 'Race4'],
  'GT3 GTM': ['Qualify', 'Race3', 'Race4'],
};

const CLASS_SUB_OPTIONS: Record<string, string[]> = {
  'GT4 GTC': ['GT4', 'GTC'],
  'GT3 GTM': ['GT3', 'GTM'],
  'PICKUP AB': ['PICKUP A', 'PICKUP B'],
};

const IMPORT_CLASS_MAP: Record<string, ImportClassMapping> = {
  ECO: { className: 'ECO', sub: 'ECO' },
  TOURING: { className: 'Touring', sub: 'Touring' },
  'PICKUP A': { className: 'PICKUP AB', sub: 'PICKUP A' },
  PICKUPA: { className: 'PICKUP AB', sub: 'PICKUP A' },
  'PICKUP B': { className: 'PICKUP AB', sub: 'PICKUP B' },
  PICKUPB: { className: 'PICKUP AB', sub: 'PICKUP B' },
  'PICKUP C': { className: 'PICKUP C', sub: 'PICKUP C' },
  PICKUPC: { className: 'PICKUP C', sub: 'PICKUP C' },
  GT3: { className: 'GT3 GTM', sub: 'GT3' },
  GTM: { className: 'GT3 GTM', sub: 'GTM' },
  GT4: { className: 'GT4 GTC', sub: 'GT4' },
  GTC: { className: 'GT4 GTC', sub: 'GTC' },
  GR86: { className: 'GR86', sub: 'GR86' },
};

function emptyDefaultData(): Record<string, Record<string, CarRow[]>> {
  const data: Record<string, Record<string, CarRow[]>> = {};
  Object.keys(CLASS_SESSIONS).forEach((cls) => {
    data[cls] = {};
    CLASS_SESSIONS[cls]?.forEach((sess) => data[cls][sess] = []);
  });
  return data;
}

@Component({
  selector: 'app-tss-weighing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tss-weighing.component.html',
  styleUrl: './tss-weighing.component.scss',
})
export class TssWeighingComponent implements OnInit, OnDestroy {
  readonly classSessions = CLASS_SESSIONS;
  readonly classOptions = Object.keys(CLASS_SESSIONS);

  data: Record<string, Record<string, CarRow[]>> = emptyDefaultData();
  weights: Record<string, WeightRecord> = {};

  selectedClass = this.classOptions[0] ?? '';
  selectedSession = CLASS_SESSIONS[this.selectedClass]?.[0] ?? '';

  loginUser = '';
  loginPass = '';
  loginError = '';
  activeUsername = '';
  activeUser: UserAccount | null = null;

  eventName = 'BRIC1';
  eventDraftName = 'BRIC1';
  isEditingEvent = false;

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
  private lastCacheUpdatedAt = '';
  private lastActiveEventUpdatedAt = '';
  private pendingAutoSaveClass = '';
  private pendingAutoSaveSession = '';
  private readonly autoSaveDelayMs = 800;
  private readonly pollIntervalMs = 5000;

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
    this.stopPolling();
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }

  get eventLabel(): string {
    return `${this.eventName} · ${this.currentYear}`;
  }

  get sessions(): string[] {
    return CLASS_SESSIONS[this.selectedClass] ?? [];
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

  get subOptions(): string[] {
    return CLASS_SUB_OPTIONS[this.selectedClass] ?? [];
  }

  get hasSubOptions(): boolean {
    return this.subOptions.length > 0;
  }

  get tableColspan(): number {
    return (this.hasSubOptions ? 14 : 13) + (this.canEditMaster ? 1 : 0);
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
    this.stopPolling();
  }

  toggleEventEdit(): void {
    if (!this.canEditMaster) return;
    if (!this.isEditingEvent) {
      this.eventDraftName = this.eventName;
      this.isEditingEvent = true;
      return;
    }
    if (this.autoSaveTimer || this.saveInFlight) {
      this.setSyncStatus('กรุณารอ auto save ก่อนเปลี่ยน event', true);
      return;
    }
    this.eventName = this.sanitizeEventName(this.eventDraftName);
    this.isEditingEvent = false;
    this.saveActiveEvent();
  }

  onClassChange(): void {
    this.selectedSession = this.sessions[0] ?? '';
    this.ensureSessionData(this.selectedClass, this.selectedSession);
    this.newSub = this.defaultSubForClass(this.selectedClass);
  }

  onSessionChange(): void {
    this.ensureSessionData(this.selectedClass, this.selectedSession);
  }

  setWeight(car: CarRow, field: WeightField, value: string | number): void {
    if (!this.canKeyIn) return;
    const k = this.key(this.selectedClass, this.selectedSession, car.num);
    this.weights[k] = this.weights[k] ?? {};
    const parsed = Number(value);
    this.weights[k][field] = Number.isFinite(parsed) ? parsed : 0;
    this.saveWeights();
    this.queueAutoSave();
  }

  setCarField(car: CarRow, field: 'num' | 'sub' | 'target', value: string | number | null): void {
    if (!this.canEditMaster) return;
    const oldNum = car.num;
    if (field === 'target') {
      const raw = String(value ?? '').trim();
      const parsed = Number(raw);
      car.target = raw === '' || !Number.isFinite(parsed) ? null : parsed;
    } else if (field === 'sub') {
      car.sub = this.normalizeSubForClass(this.selectedClass, String(value ?? ''));
    } else {
      car[field] = String(value ?? '').trim();
    }
    if (field === 'num' && oldNum !== car.num) {
      const oldKey = this.key(this.selectedClass, this.selectedSession, oldNum);
      const newKey = this.key(this.selectedClass, this.selectedSession, car.num);
      if (this.weights[oldKey] && !this.weights[newKey]) this.weights[newKey] = this.weights[oldKey];
      delete this.weights[oldKey];
      this.saveWeights();
    }
    this.saveData();
    this.queueAutoSave();
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
    cars.push({ sub, num, target: this.newTarget === null ? null : Number(this.newTarget) });
    this.newNum = '';
    this.newSub = this.defaultSubForClass(this.selectedClass);
    this.newTarget = null;
    this.adminError = '';
    this.saveData();
    this.queueAutoSave();
  }

  deleteCar(index: number): void {
    if (!this.canEditMaster) return;
    const car = this.cars[index];
    if (!car || !confirm('ลบรถเบอร์ ' + car.num + ' ?')) return;
    this.cars.splice(index, 1);
    delete this.weights[this.key(this.selectedClass, this.selectedSession, car.num)];
    this.saveData();
    this.saveWeights();
    this.queueAutoSave();
  }

  saveRedisCache(isAutoSave = false): void {
    if (!this.canKeyIn) return;
    this.saveCurrentSessionToRedis(isAutoSave);
  }

  loadRedisCache(showStatus = true, force = false): void {
    const token = this.getWeighingToken(showStatus);
    if (!token || this.loadInFlight) return;
    if (this.autoSaveTimer || this.saveInFlight) return;
    this.loadInFlight = true;
    if (showStatus) this.setSyncStatus('กำลังโหลด Redis...');
    this.weighingService.getCache(this.eventName, this.currentYear, token).subscribe({
      next: (cache) => {
        const remoteUpdatedAt = cache.updated_at ?? '';
        if (force || !remoteUpdatedAt || remoteUpdatedAt !== this.lastCacheUpdatedAt) {
          this.applyCache(cache);
          this.lastCacheUpdatedAt = remoteUpdatedAt;
          if (showStatus) this.setSyncStatus('โหลด Redis แล้ว');
        }
        this.loadInFlight = false;
      },
      error: (err) => {
        if (showStatus) this.setSyncStatus(this.errorMessage(err, 'โหลด Redis ไม่สำเร็จ'), true);
        this.loadInFlight = false;
      },
    });
  }

  private saveActiveEvent(): void {
    const token = this.getWeighingToken();
    if (!token) return;
    this.setSyncStatus('กำลังบันทึก event...');
    this.weighingService.setActiveEvent(this.eventName, this.currentYear, token).subscribe({
      next: (activeEvent) => {
        this.applyActiveEvent(activeEvent, true);
        this.setSyncStatus('บันทึก event แล้ว: ' + this.eventName);
        this.loadRedisCache(false, true);
      },
      error: (err) => this.setSyncStatus(this.errorMessage(err, 'บันทึก event ไม่สำเร็จ'), true),
    });
  }

  private syncActiveEvent(showStatus = false, forceLoad = false): void {
    const token = this.getWeighingToken(showStatus);
    if (!token || this.activeEventInFlight) return;
    if (this.isEditingEvent) return;
    if (this.autoSaveTimer || this.saveInFlight) return;
    this.activeEventInFlight = true;
    this.weighingService.getActiveEvent(token).subscribe({
      next: (activeEvent) => {
        const changed = this.applyActiveEvent(activeEvent, forceLoad);
        this.activeEventInFlight = false;
        if (changed || forceLoad) this.loadRedisCache(showStatus, true);
        else this.loadRedisCache(false);
      },
      error: (err) => {
        this.activeEventInFlight = false;
        if (showStatus) this.setSyncStatus(this.errorMessage(err, 'โหลด event ไม่สำเร็จ'), true);
        if (forceLoad) this.loadRedisCache(showStatus, true);
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

  private saveCurrentSessionToRedis(isAutoSave: boolean): void {
    const token = this.getWeighingToken(!isAutoSave);
    if (!token || this.saveInFlight) return;
    const className = isAutoSave && this.pendingAutoSaveClass ? this.pendingAutoSaveClass : this.selectedClass;
    const sessionName = isAutoSave && this.pendingAutoSaveSession ? this.pendingAutoSaveSession : this.selectedSession;
    this.saveInFlight = true;
    this.setSyncStatus(isAutoSave ? 'กำลัง auto save Redis...' : 'กำลังบันทึก Redis...');
    this.weighingService.saveSession({
      event: this.eventName,
      year: this.currentYear,
      class_name: className,
      session_name: sessionName,
      cars: this.buildSessionCars(className, sessionName),
    }, token).subscribe({
      next: (cache) => {
        this.lastCacheUpdatedAt = cache.updated_at ?? this.lastCacheUpdatedAt;
        this.pendingAutoSaveClass = '';
        this.pendingAutoSaveSession = '';
        this.saveInFlight = false;
        this.setSyncStatus(`${isAutoSave ? 'Auto saved' : 'บันทึก Redis แล้ว'}: ${className} / ${sessionName}`);
      },
      error: (err) => {
        this.saveInFlight = false;
        this.setSyncStatus(this.errorMessage(err, 'บันทึก Redis ไม่สำเร็จ'), true);
      },
    });
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
    if (this.saveInFlight) {
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
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        this.setSyncStatus('ไม่พบ sheet ในไฟล์ Excel', true);
        return;
      }

      const header = this.importHeaderColumns(worksheet.getRow(1));
      if (!header) {
        this.setSyncStatus('Excel ต้องมี column CLASS, เบอร์รถ, น้ำหนักที่ต้องการ', true);
        return;
      }

      let importedRows = 0;
      let addedRows = 0;
      let updatedRows = 0;
      let skippedRows = 0;
      const changedPairs = new Set<string>();

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const mapping = this.importClassMapping(this.cellText(row.getCell(header.classCol)));
        const carNumber = this.cellText(row.getCell(header.carCol));
        const target = this.importTarget(row.getCell(header.targetCol));
        if (!mapping || !carNumber || target.invalid) {
          skippedRows++;
          return;
        }

        (CLASS_SESSIONS[mapping.className] ?? []).forEach((sessionName) => {
          const cars = this.ensureSessionData(mapping.className, sessionName);
          const existing = cars.find((car) => car.num.trim().toLowerCase() === carNumber.toLowerCase());
          if (existing) {
            existing.sub = mapping.sub;
            existing.target = target.value;
            updatedRows++;
          } else {
            cars.push({ sub: mapping.sub, num: carNumber, target: target.value });
            addedRows++;
          }
          changedPairs.add(`${mapping.className}|${sessionName}`);
        });
        importedRows++;
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
    if (this.saveInFlight) {
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
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        this.setSyncStatus('ไม่พบ sheet ในไฟล์ Excel', true);
        return;
      }

      const header = this.importHeaderColumns(worksheet.getRow(1));
      if (!header) {
        this.setSyncStatus('Excel ต้องมี column CLASS, เบอร์รถ, น้ำหนักที่ต้องการ', true);
        return;
      }

      let matchedRows = 0;
      let addedRows = 0;
      let updatedRows = 0;
      let skippedRows = 0;
      const cars = this.ensureSessionData(className, sessionName);

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const mapping = this.importClassMapping(this.cellText(row.getCell(header.classCol)));
        if (!mapping || mapping.className !== className) return;

        const carNumber = this.cellText(row.getCell(header.carCol));
        const target = this.importTarget(row.getCell(header.targetCol));
        if (!carNumber || target.invalid) {
          skippedRows++;
          return;
        }

        const existing = cars.find((car) => car.num.trim().toLowerCase() === carNumber.toLowerCase());
        if (existing) {
          existing.sub = mapping.sub;
          existing.target = target.value;
          updatedRows++;
        } else {
          cars.push({ sub: mapping.sub, num: carNumber, target: target.value });
          addedRows++;
        }
        matchedRows++;
      });

      this.saveData();
      if (matchedRows === 0) {
        this.setSyncStatus(`ไม่พบข้อมูลสำหรับ ${className} ในไฟล์ Excel, skipped ${skippedRows}`, true);
        return;
      }
      await this.saveImportedCurrentSessionToRedis(className, sessionName, matchedRows, addedRows, updatedRows, skippedRows);
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
      return this.ensureDataShape(saved ? JSON.parse(saved) as Record<string, Record<string, CarRow[]>> : emptyDefaultData());
    } catch {
      return emptyDefaultData();
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
    if (!this.canKeyIn) return;
    this.pendingAutoSaveClass = this.selectedClass;
    this.pendingAutoSaveSession = this.selectedSession;
    this.clearAutoSaveTimer();
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.saveCurrentSessionToRedis(true);
    }, this.autoSaveDelayMs);
  }

  private clearAutoSaveTimer(): void {
    if (!this.autoSaveTimer) return;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = null;
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

  private importHeaderColumns(row: ExcelJS.Row): { classCol: number; carCol: number; targetCol: number } | null {
    let classCol = 0;
    let carCol = 0;
    let targetCol = 0;
    row.eachCell((cell, colNumber) => {
      const header = this.cellText(cell).replace(/\s+/g, ' ').trim().toUpperCase();
      if (header === 'CLASS') classCol = colNumber;
      if (header === 'เบอร์รถ') carCol = colNumber;
      if (header === 'น้ำหนักที่ต้องการ') targetCol = colNumber;
    });
    return classCol && carCol && targetCol ? { classCol, carCol, targetCol } : null;
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
        const cache = await firstValueFrom(this.weighingService.saveSession({
          event: this.eventName,
          year: this.currentYear,
          class_name: className,
          session_name: sessionName,
          cars: this.buildSessionCars(className, sessionName),
        }, token));
        this.lastCacheUpdatedAt = cache.updated_at ?? this.lastCacheUpdatedAt;
      }
      this.saveInFlight = false;
      this.setSyncStatus(`Import Excel แล้ว ${importedRows} รายการ: เพิ่ม ${addedRows}, อัปเดต ${updatedRows}, skipped ${skippedRows}, sync Redis ${pairs.length} sessions`);
    } catch (err) {
      this.saveInFlight = false;
      this.setSyncStatus(this.errorMessage(err, `Import Excel แล้ว ${importedRows} รายการ: เพิ่ม ${addedRows}, อัปเดต ${updatedRows} แต่ sync Redis ไม่สำเร็จ`), true);
    }
  }

  private async saveImportedCurrentSessionToRedis(className: string, sessionName: string, matchedRows: number, addedRows: number, updatedRows: number, skippedRows: number): Promise<void> {
    const token = this.getWeighingToken(false);
    if (!token) {
      this.setSyncStatus(`Import with class ${className} / ${sessionName} แล้ว ${matchedRows} รายการ: เพิ่ม ${addedRows}, อัปเดต ${updatedRows}, skipped ${skippedRows} แต่ยังไม่ sync Redis เพราะไม่พบ token`, true);
      return;
    }

    this.saveInFlight = true;
    this.setSyncStatus(`Import with class ${className} / ${sessionName} แล้ว ${matchedRows} รายการ กำลัง sync Redis...`);
    try {
      const cache = await firstValueFrom(this.weighingService.saveSession({
        event: this.eventName,
        year: this.currentYear,
        class_name: className,
        session_name: sessionName,
        cars: this.buildSessionCars(className, sessionName),
      }, token));
      this.lastCacheUpdatedAt = cache.updated_at ?? this.lastCacheUpdatedAt;
      this.saveInFlight = false;
      this.setSyncStatus(`Import with class ${className} / ${sessionName} แล้ว ${matchedRows} รายการ: เพิ่ม ${addedRows}, อัปเดต ${updatedRows}, skipped ${skippedRows}, sync Redis แล้ว`);
    } catch (err) {
      this.saveInFlight = false;
      this.setSyncStatus(this.errorMessage(err, `Import with class ${className} / ${sessionName} แล้ว แต่ sync Redis ไม่สำเร็จ`), true);
    }
  }

  private ensureDataShape(data: Record<string, Record<string, CarRow[]>>): Record<string, Record<string, CarRow[]>> {
    const shaped = data && typeof data === 'object' ? data : emptyDefaultData();
    Object.keys(CLASS_SESSIONS).forEach((cls) => {
      shaped[cls] = shaped[cls] && typeof shaped[cls] === 'object' && !Array.isArray(shaped[cls]) ? shaped[cls] : {};
      CLASS_SESSIONS[cls]?.forEach((sess) => {
        if (!Array.isArray(shaped[cls][sess])) shaped[cls][sess] = [];
        shaped[cls][sess] = shaped[cls][sess].map((car) => this.normalizeCarRow(cls, car)).filter((car) => car.num);
      });
    });
    return shaped;
  }

  private normalizeCarRow(className: string, car: Partial<CarRow>): CarRow {
    return {
      sub: this.normalizeSubForClass(className, String(car?.sub ?? '')),
      num: String(car?.num ?? '').trim(),
      target: this.numberOrNull(car?.target),
    };
  }

  private ensureSessionData(cls: string, sess: string): CarRow[] {
    if (!this.data[cls]) this.data[cls] = {};
    if (!Array.isArray(this.data[cls][sess])) this.data[cls][sess] = [];
    return this.data[cls][sess];
  }

  private ensureSelection(): void {
    if (!this.classSessions[this.selectedClass]) this.selectedClass = this.classOptions[0] ?? '';
    if (!this.sessions.includes(this.selectedSession)) this.selectedSession = this.sessions[0] ?? '';
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
      'INCLUDING FUEL': this.weightBlock(car, 'fuel'),
      'DRY WEIGHT': this.weightBlock(car, 'dry'),
    };
  }

  private buildCarReportFor(className: string, sessionName: string, car: CarRow): WeighingCarPayload {
    return {
      รุ่น: this.normalizeSubForClass(className, car.sub),
      เบอร์รถ: String(car.num),
      'Target Weight (kg)': car.target,
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
    const nextData = emptyDefaultData();
    const nextWeights: Record<string, WeightRecord> = {};
    Object.entries(cache.classes ?? {}).forEach(([cls, classData]) => {
      if (!CLASS_SESSIONS[cls]) return;
      Object.entries(classData.sessions ?? {}).forEach(([sess, sessionData]) => {
        if (!CLASS_SESSIONS[cls]?.includes(sess)) return;
        const cars = Object.values(sessionData.cars ?? {}).map((item: any) => {
          const carNumber = String(item?.['เบอร์รถ'] ?? '').trim();
          return {
            sub: this.normalizeSubForClass(cls, String(item?.['รุ่น'] ?? '')),
            num: carNumber,
            target: this.numberOrNull(item?.['Target Weight (kg)']),
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
        });
      });
    });
    this.data = nextData;
    this.weights = nextWeights;
    this.ensureSelection();
    this.saveData();
    this.saveWeights();
  }

  private clearLocalCurrentClass(cls: string): void {
    this.data[cls] = {};
    (CLASS_SESSIONS[cls] ?? []).forEach((sess) => this.data[cls][sess] = []);
    Object.keys(this.weights).forEach((k) => {
      if (k.startsWith(`${cls}|`)) delete this.weights[k];
    });
    this.saveData();
    this.saveWeights();
  }

  private buildWorkbookForClasses(classNames: string[]): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TSS Weighing Sheet';
    workbook.created = new Date();
    classNames.forEach((className) => {
      (CLASS_SESSIONS[className] ?? []).forEach((sessionName) => {
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
    const widths = [6, 12, 16, 18, 12, 12, 12, 14, 10, 3, 12, 12, 12, 14, 10];
    widths.forEach((width, index) => sheet.getColumn(index + 1).width = width);
  }

  private applyHeader(sheet: ExcelJS.Worksheet, className: string, sessionName: string): void {
    sheet.mergeCells('A1:C1');
    sheet.mergeCells('A2:C2');
    sheet.mergeCells('E2:I2');
    sheet.mergeCells('K2:O2');

    sheet.getCell('A1').value = className;
    sheet.getCell('A2').value = sessionName.toUpperCase();
    sheet.getCell('E2').value = 'ชั่งปรกติรวมน้ำมัน\n(INCLUDING FUEL)';
    sheet.getCell('K2').value = 'ชั่งปรกติไม่รวมน้ำมัน\n( DRY WEIGHT)';
    sheet.getRow(3).values = [
      '#', 'รุ่น', 'เบอร์รถ', 'Target Weight\n(kg)',
      'เครื่องชั่ง 1', 'เครื่องชั่ง 2', 'รวม', 'Diff Cal\n(KG)', '%', '',
      'เครื่องชั่ง 1', 'เครื่องชั่ง 2', 'รวม', 'Diff Cal\n(KG)', '%',
    ];

    sheet.getRow(1).height = 34;
    sheet.getRow(2).height = 58;
    sheet.getRow(3).height = 45;

    this.styleRange(sheet, 1, 1, 1, 3, { fill: 'F4B183', fontColor: '000000', bold: true, size: 22 });
    this.styleRange(sheet, 2, 1, 2, 3, { fill: 'FFF2CC', fontColor: '000000', bold: true, size: 22 });
    this.styleRange(sheet, 2, 5, 2, 9, { fill: '4472C4', fontColor: 'FFFFFF', bold: true, size: 12 });
    this.styleRange(sheet, 2, 11, 2, 15, { fill: '4472C4', fontColor: 'FFFFFF', bold: true, size: 12 });
    this.styleRange(sheet, 3, 1, 3, 15, { fill: 'B4C6E7', fontColor: '000000', bold: true, size: 12 });
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
      row.index, row.sub, row.carNumber, row.targetWeight,
      row.fuelW1, row.fuelW2, row.fuelTotal, row.fuelDiff, row.fuelPct, '',
      row.dryW1, row.dryW2, row.dryTotal, row.dryDiff, row.dryPct,
    ];

    for (let col = 1; col <= 15; col++) {
      const cell = sheet.getCell(rowNumber, col);
      cell.border = this.thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'center' : 'right' };
      cell.font = { name: 'Prompt', size: 12 };
    }

    [1, 2, 3].forEach((col) => sheet.getCell(rowNumber, col).alignment = { vertical: 'middle', horizontal: 'center' });
    [5, 6, 11, 12].forEach((col) => sheet.getCell(rowNumber, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } });
    [7, 13].forEach((col) => {
      sheet.getCell(rowNumber, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EDEDED' } };
      sheet.getCell(rowNumber, col).font = { name: 'Prompt', size: 12, bold: true };
    });
    [4, 5, 6, 7, 8, 11, 12, 13, 14].forEach((col) => sheet.getCell(rowNumber, col).numFmt = '#,##0.00;[Red](#,##0.00);-');
    [9, 15].forEach((col) => sheet.getCell(rowNumber, col).numFmt = '0%;[Red]-0%;-');
    [8, 14].forEach((col) => {
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

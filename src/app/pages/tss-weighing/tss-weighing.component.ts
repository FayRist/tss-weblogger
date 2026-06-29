import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import ExcelJS from 'exceljs';
import { TssWeighingCacheResponse, TssWeighingService } from './tss-weighing.service';

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
export class TssWeighingComponent implements OnInit {
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
  isEditingEvent = false;

  newNum = '';
  newSub = '';
  newTarget: number | null = null;
  adminError = '';
  syncStatus = '';
  syncError = false;

  constructor(private weighingService: TssWeighingService) {}

  ngOnInit(): void {
    this.eventName = this.getStoredEventName();
    this.data = this.loadData();
    this.weights = this.loadWeights();
    this.restoreUser();
    this.ensureSelection();
    this.updateTitle();
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

  get summary(): { total: number; counted: number; ok: number; warn: number; under: number } {
    let counted = 0;
    let ok = 0;
    let warn = 0;
    let under = 0;

    this.cars.forEach((car) => {
      const fuel = this.calcWeightGroup(car, 'fuel');
      const dry = this.calcWeightGroup(car, 'dry');
      const stats = fuel.has ? fuel : dry;
      if (fuel.has || dry.has) counted++;
      if (stats.has && stats.diff !== null) {
        if (stats.diff < 0) under++;
        else if (stats.pct !== null && Math.abs(stats.pct) <= 0.05) ok++;
        else warn++;
      }
    });

    return { total: this.cars.length, counted, ok, warn, under };
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
  }

  logout(): void {
    sessionStorage.removeItem(STORAGE_KEYS.user);
    this.activeUsername = '';
    this.activeUser = null;
    this.loginError = '';
  }

  toggleEventEdit(): void {
    if (!this.isEditingEvent) {
      this.isEditingEvent = true;
      return;
    }
    this.eventName = this.sanitizeEventName(this.eventName);
    localStorage.setItem(STORAGE_KEYS.event, this.eventName);
    this.isEditingEvent = false;
    this.updateTitle();
  }

  onClassChange(): void {
    this.selectedSession = this.sessions[0] ?? '';
    this.ensureSessionData(this.selectedClass, this.selectedSession);
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
  }

  setCarField(car: CarRow, field: 'num' | 'sub' | 'target', value: string | number | null): void {
    if (!this.canEditMaster) return;
    const oldNum = car.num;
    if (field === 'target') {
      const raw = String(value ?? '').trim();
      const parsed = Number(raw);
      car.target = raw === '' || !Number.isFinite(parsed) ? null : parsed;
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
  }

  addCar(): void {
    if (!this.canEditMaster) return;
    const num = this.newNum.trim();
    const sub = this.newSub.trim();
    if (!num) {
      this.adminError = 'กรุณากรอกเบอร์รถ';
      return;
    }
    if (!sub) {
      this.adminError = 'กรุณากรอกรุ่น';
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
    cars.push({ sub, num, target: this.newTarget === null ? null : Number(this.newTarget) });
    this.newNum = '';
    this.newSub = '';
    this.newTarget = null;
    this.adminError = '';
    this.saveData();
  }

  deleteCar(index: number): void {
    if (!this.canEditMaster) return;
    const car = this.cars[index];
    if (!car || !confirm('ลบรถเบอร์ ' + car.num + ' ?')) return;
    this.cars.splice(index, 1);
    delete this.weights[this.key(this.selectedClass, this.selectedSession, car.num)];
    this.saveData();
    this.saveWeights();
  }

  saveRedisCache(): void {
    if (!this.canKeyIn) return;
    const token = this.getWeighingToken();
    if (!token) return;
    this.setSyncStatus('กำลังบันทึก Redis...');
    this.weighingService.saveSession({
      event: this.eventName,
      year: this.currentYear,
      class_name: this.selectedClass,
      session_name: this.selectedSession,
      cars: this.buildCurrentSessionCars(),
    }, token).subscribe({
      next: () => this.setSyncStatus(`บันทึก Redis แล้ว: ${this.selectedClass} / ${this.selectedSession}`),
      error: (err) => this.setSyncStatus(this.errorMessage(err, 'บันทึก Redis ไม่สำเร็จ'), true),
    });
  }

  loadRedisCache(): void {
    if (!this.canKeyIn) return;
    const token = this.getWeighingToken();
    if (!token) return;
    this.setSyncStatus('กำลังโหลด Redis...');
    this.weighingService.getCache(this.eventName, this.currentYear, token).subscribe({
      next: (cache) => {
        this.applyCache(cache);
        this.setSyncStatus('โหลด Redis แล้ว');
      },
      error: (err) => this.setSyncStatus(this.errorMessage(err, 'โหลด Redis ไม่สำเร็จ'), true),
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
        this.clearLocalCurrentClass(className);
        this.ensureSelection();
        this.setSyncStatus('Reset current class แล้ว: ' + className);
      },
      error: (err) => this.setSyncStatus(this.errorMessage(err, 'Reset current class ไม่สำเร็จ'), true),
    });
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

  private ensureDataShape(data: Record<string, Record<string, CarRow[]>>): Record<string, Record<string, CarRow[]>> {
    const shaped = data && typeof data === 'object' ? data : emptyDefaultData();
    Object.keys(CLASS_SESSIONS).forEach((cls) => {
      shaped[cls] = shaped[cls] && typeof shaped[cls] === 'object' && !Array.isArray(shaped[cls]) ? shaped[cls] : {};
      CLASS_SESSIONS[cls]?.forEach((sess) => {
        if (!Array.isArray(shaped[cls][sess])) shaped[cls][sess] = [];
      });
    });
    return shaped;
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

  private buildCarReport(car: CarRow): WeighingCarPayload {
    return {
      รุ่น: car.sub,
      เบอร์รถ: String(car.num),
      'Target Weight (kg)': car.target,
      'INCLUDING FUEL': this.weightBlock(car, 'fuel'),
      'DRY WEIGHT': this.weightBlock(car, 'dry'),
    };
  }

  private buildCurrentSessionCars(): Record<string, WeighingCarPayload> {
    return this.cars.reduce<Record<string, WeighingCarPayload>>((acc, car) => {
      acc[String(car.num)] = this.buildCarReport(car);
      return acc;
    }, {});
  }

  private applyCache(cache: TssWeighingCacheResponse): void {
    Object.entries(cache.classes ?? {}).forEach(([cls, classData]) => {
      if (!CLASS_SESSIONS[cls]) return;
      Object.entries(classData.sessions ?? {}).forEach(([sess, sessionData]) => {
        if (!CLASS_SESSIONS[cls]?.includes(sess)) return;
        const cars = Object.values(sessionData.cars ?? {}).map((item: any) => {
          const carNumber = String(item?.['เบอร์รถ'] ?? '').trim();
          return {
            sub: String(item?.['รุ่น'] ?? '').trim(),
            num: carNumber,
            target: this.numberOrNull(item?.['Target Weight (kg)']),
          };
        }).filter((car) => car.num && car.sub);
        this.data[cls][sess] = cars;
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
          this.weights[this.key(cls, sess, num)] = record;
        });
      });
    });
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
        sub: car.sub,
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

  private getWeighingToken(): string {
    const token = String(window.TSS_WEIGHING_CONFIG?.token ?? '').trim();
    if (!token) this.setSyncStatus('ไม่พบ TSS weighing token จาก config.js', true);
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

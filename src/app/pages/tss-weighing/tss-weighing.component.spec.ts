import { TssWeighingComponent } from './tss-weighing.component';
import { TssWeighingService } from './tss-weighing.service';

describe('TssWeighingComponent weight calculation', () => {
  let component: TssWeighingComponent;

  beforeEach(() => {
    component = new TssWeighingComponent({} as TssWeighingService);
  });

  it('averages two drivers and applies zero compensation at 75 kg', () => {
    const car = carWith({ driver1Weight: 70, driver2Weight: 80 });

    expect(component.driverWeightStats(car)).toEqual({ avg: 75, diffFrom75: 0, compensation: 0 });
  });

  it('uses one driver and clamps positive compensation to 15 kg', () => {
    const car = carWith({ driver1Weight: 40, driver2Weight: null });

    expect(component.driverWeightStats(car)).toEqual({ avg: 40, diffFrom75: 35, compensation: 15 });
  });

  it('uses the event average and symmetric compensation limit', () => {
    component.driverAverage = 80;
    component.driverCompensationLimit = 10;
    const car = carWith({ driver1Weight: 50 });

    expect(component.driverWeightStats(car)).toEqual({ avg: 50, diffFrom75: 30, compensation: 10 });
  });

  it('calculates final weight from Target plus compensation', () => {
    const car = carWith({ target: 1450, bopWeight: 1000, ballastWeight: 450, driver1Weight: 67 });

    expect(component.finalWeight(car)).toBe(1458);
  });

  it('uses Final Weight only for FUEL diff when enabled', () => {
    component.selectedClass = 'GT3 GTM';
    component.selectedSession = 'Qualify';
    const car = carWith({ target: 1020, driver1Weight: 60 });
    component.weights['GT3 GTM|Qualify|7'] = { fuel_w1: 500, fuel_w2: 520, dry_w1: 500, dry_w2: 520 };

    expect(component.calcWeightGroup(car, 'fuel').diff).toBe(0);
    expect(component.calcWeightGroup(car, 'dry').diff).toBe(0);

    component.showFinalWeight = true;

    expect(component.calcWeightGroup(car, 'fuel').diff).toBe(-15);
    expect(component.calcWeightGroup(car, 'dry').diff).toBe(0);
  });

  it('formats compensation like weighing diff text', () => {
    expect(component.compensationText(8)).toBe('+8.0 kg');
    expect(component.compensationText(-5)).toBe('-5.0 kg');
    expect(component.compensationPillClass(0)).toBe('ok');
    expect(component.compensationPillClass(8)).toBe('warn');
  });

  it('falls back to default event compensation config when response fields are absent', () => {
    const applyEventConfig = (component as any).applyEventConfig.bind(component);

    applyEventConfig({ event: 'BRIC1', year: 2026, class_sessions: {} }, true);

    expect(component.driverAverage).toBe(75);
    expect(component.driverCompensationLimit).toBe(15);
    expect(component.showFinalWeight).toBe(false);
  });

  it('clamps negative compensation to -15 kg', () => {
    const car = carWith({ driver1Weight: 100, driver2Weight: null });

    expect(component.driverWeightStats(car)).toEqual({ avg: 100, diffFrom75: -25, compensation: -15 });
  });

  it('uses zero compensation and no driver average when no driver weight exists', () => {
    const car = carWith({ driver1Weight: null, driver2Weight: null });

    expect(component.driverWeightStats(car)).toEqual({ avg: null, diffFrom75: null, compensation: 0 });
  });

  it('uses Target for FUEL diff when Final Weight is disabled', () => {
    component.selectedClass = 'GT3 GTM';
    component.selectedSession = 'Qualify';
    const car = carWith({ target: 1020, bopWeight: 1000, ballastWeight: 20, driver1Weight: 40 });
    component.weights['GT3 GTM|Qualify|7'] = { fuel_w1: 500, fuel_w2: 520 };

    expect(component.calcWeightGroup(car, 'fuel').diff).toBe(0);
  });

  it('treats exported dash placeholders as empty import values', () => {
    const importTarget = (component as any).importTarget.bind(component);

    expect(importTarget({ value: '-' })).toEqual({ value: null, invalid: false });
    expect(importTarget({ value: '—' })).toEqual({ value: null, invalid: false });
  });

  it('exports compensation and Final Weight when enabled', () => {
    component.eventName = 'SEPANG2026';
    component.showFinalWeight = true;
    component.classSessions = { 'GT3 GTM': ['Qualify'] };
    component.data = {
      'GT3 GTM': {
        Qualify: [carWith({ sub: 'GT3', target: 1300 })],
      },
    };
    const workbook = (component as any).buildWorkbookForClasses(['GT3 GTM']);
    const sheet = workbook.getWorksheet('Qualify_GT3 GTM');

    expect(sheet.getCell('A1').value).toBe('GT3 GTM');
    expect(sheet.getCell('A2').value).toBe('QUALIFY');
    expect(sheet.getCell('H4').value).toBe(0);
    expect(sheet.getCell('I4').value).toBe(1300);
    expect(sheet.getCell('J4').value).toBe(1300);
    expect(sheet.getCell('B4').value).toBe('GT3');
    expect(sheet.getCell('C4').value).toBe('7');
    expect(sheet.model.merges).toContain('K2:O2');
    expect(sheet.model.merges).toContain('Q2:U2');
  });

  it('omits Final Weight from Excel when disabled', () => {
    component.eventName = 'SEPANG2026';
    component.classSessions = { 'GT3 GTM': ['Qualify'] };
    component.data = {
      'GT3 GTM': {
        Qualify: [carWith({ sub: 'GT3', target: 1300 })],
      },
    };

    const workbook = (component as any).buildWorkbookForClasses(['GT3 GTM']);
    const sheet = workbook.getWorksheet('Qualify_GT3 GTM');

    expect(sheet.getCell('I3').value).toBe('Target Weight\n(kg)');
    expect(sheet.getCell('J3').value).toBe('เครื่องชั่ง 1');
    expect(sheet.getCell('J4').value).toBe('-');
    expect(sheet.model.merges).toContain('J2:N2');
    expect(sheet.model.merges).toContain('P2:T2');
  });
});

function carWith(overrides: Partial<Record<string, unknown>> = {}): any {
  return {
    sub: 'GT3',
    num: '7',
    target: null,
    bopWeight: null,
    ballastWeight: null,
    driver1Name: '',
    driver1Weight: null,
    driver2Name: '',
    driver2Weight: null,
    ...overrides,
  };
}

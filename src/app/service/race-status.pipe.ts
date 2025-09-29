// race-status.ts

export enum RaceStatus {
  Upcoming = 'ยังไม่ถึงเวลาแข่งขัน',
  Live     = 'กำลังแข่งขัน',
  Finished = 'จบการแข่งขัน',
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    // ถ้าไม่มี timezone ให้สมมติเป็นเวลาไทย (+07:00) และเปลี่ยน ' ' เป็น 'T'
    const iso = v.includes('T') || /Z|[+-]\d\d:?\d\d$/.test(v)
      ? v
      : v.replace(' ', 'T') + '+07:00';
    return new Date(iso);
  }
  // number (ms) หรืออย่างอื่น
  return new Date(v as any);
}

export function getRaceStatus(nowIn: unknown, startIn: unknown, endIn: unknown): RaceStatus {
  const now = toDate(nowIn);
  const start = toDate(startIn);
  const end = toDate(endIn);

  if (now >= end) return RaceStatus.Finished;
  if (now >= start && now < end) return RaceStatus.Live;
  return RaceStatus.Upcoming;
}

export function num(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export function toMillis(ts: number): number {
  return ts < 2_000_000_000 ? ts * 1000 : ts;
}

export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000; // m
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const la1 = rad(a.lat);
  const la2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** หา element ที่เวลาใกล้กับ target มากที่สุด (เชื่อม mapPoint ↔ currentMapPoint) */
export function nearestByTime<T extends { ts: number }>(
  arr: T[],
  targetTsMs: number
): T | null {
  let best: T | null = null;
  let bestDt = Number.POSITIVE_INFINITY;
  for (const it of arr || []) {
    const dt = Math.abs(toMillis(it.ts) - targetTsMs);
    if (dt < bestDt) { bestDt = dt; best = it; }
  }
  return best;
}

/** push key ลงอาเรย์แบบไม่ซ้ำ */
export function uniquePush<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr : [...arr, item];
}

/** clamp ค่าไว้ในช่วง [min, max] */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

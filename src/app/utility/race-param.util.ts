// src/app/shared/utils/race-param.util.ts

import { RACE_SEGMENT } from "../constants/race-data";

const norm = (s: string) => s?.toString().trim().toLowerCase();
const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSegmentRegex = () => {
  const alts = RACE_SEGMENT.map(s => escapeReg(norm(s.value))).join('|');
  return new RegExp(`^(${alts})\\s*(?:-|_)?\\s*([a-z0-9,]+)?$`, 'i');
};

export function splitSegmentPrefix(key: string): { segment?: string; rest: string } {
  const rx = buildSegmentRegex();
  const m = key?.match(rx);
  if (!m) return { segment: undefined, rest: norm(key) };
  const segment = norm(m[1] ?? '');
  const rest    = norm(m[2] ?? '');
  return { segment: segment || undefined, rest };
}

export function expandCompactClass(input: string | string[] | null | undefined): string[] {
  if (!input) return [];
  const toTokens = (s: string) => (s.includes(',') ? s.split(',') : s.split(''));
  const raw = Array.isArray(input) ? input : [input];
  const flat = raw.flatMap(v => toTokens(norm(v))).map(x => x.trim()).filter(Boolean);

  const allowed = new Set(['a','b','c','overall']);
  const out: string[] = [];
  for (const t of flat) {
    if (t === 'ab') { if (!out.includes('a')) out.push('a'); if (!out.includes('b')) out.push('b'); continue; }
    if (allowed.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** ใช้กับ label เช่น 'PickupA' -> { segment:'pickup', classType:'a' } */
export function parseTableClassLabel(label: string): { segment?: string; classType?: string } {
  if (!label) return {};
  const low = norm(label);
  const seg = RACE_SEGMENT.find(r => low.startsWith(norm(r.value)));
  if (!seg) return {};
  const cls = low.slice(norm(seg.value).length).trim();
  return { segment: seg.value.toLowerCase(), classType: cls || undefined };
}

/** ใหม่: สร้างโทเคน class_type ที่ Go ต้องการ เช่น ['pickupa','pickupb']
 * input:
 *   - classParam: 'ab' | 'a,b' | ['a','b'] | 'pickupa,pickupb' | ['pickupa','pickupb']
 *   - defaultSegment: 'pickup' (ถ้า class ไม่ได้พรีฟิกซ์ segment มา)
 * behavior:
 *   - ถ้ารายการมี segment ติดมาแล้ว (pickupa) => ใช้ตามนั้น
 *   - ถ้าเป็น a/b/ab และมี defaultSegment => ต่อเป็น pickupa/pickupb
 */
export function buildClassTypeTokens(
  classParam: string | string[] | null | undefined,
  defaultSegment?: string
): string[] {
  if (!classParam) return [];
  const items = Array.isArray(classParam) ? classParam : classParam.split(',');
  const tokens: string[] = [];

  for (const raw of items) {
    const val = raw?.toString().trim();
    if (!val) continue;

    const { segment, rest } = splitSegmentPrefix(val);

    if (segment) {
      // มี segment ติดมาแล้ว เช่น 'pickupa' หรือ 'pickupb'
      const classes = expandCompactClass(rest || ''); // บางกรณี rest อาจเป็น '' (แค่ 'pickup')
      if (!classes.length) {
        // 'pickup' เฉย ๆ → ข้าม หรือจะตัดสินใจ map เองก็ได้
        continue;
      }
      classes.forEach(c => tokens.push(`${segment}${c}`));
    } else {
      // ไม่มี segment ติดมา → ใช้ defaultSegment ถ้ามี
      const classes = expandCompactClass(val);
      if (defaultSegment) {
        classes.forEach(c => tokens.push(`${defaultSegment.toLowerCase()}${c}`));
      } else {
        // ไม่มี defaultSegment → ข้าม (หรือจะผลักดัน classes เดี่ยว ๆ ก็ได้ถ้าอยาก)
      }
    }
  }

  // unique
  return Array.from(new Set(tokens.map(norm)));
}

/** (ช้อยส์เสริม) parse จาก query แล้วคืนทั้ง classTypes (pickupa..), segment */
export function parseClassQueryToCombined(
  input: string | string[] | null | undefined,
  fallbackSegment?: string
): { classTypes: string[]; segment?: string } {
  if (!input) return { classTypes: [] };

  const arr = Array.isArray(input) ? input : input.split(',');
  let segFromKey: string | undefined;
  const candidates: string[] = [];

  for (const item of arr) {
    const { segment, rest } = splitSegmentPrefix(item);
    if (segment && !segFromKey) segFromKey = segment;
    candidates.push(item);
  }

  const classTypes = buildClassTypeTokens(candidates, segFromKey || fallbackSegment);
  return { classTypes, segment: segFromKey || fallbackSegment };
}

import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeRange', standalone: true })
export class TimeRangePipe implements PipeTransform {
  transform(start: Date | string | number | null | undefined, end: Date | string | number | null | undefined): string {
    if (!start) return '';
    const s = new Date(start);
    const e = end ? new Date(end) : s;

    if (isNaN(+s) || isNaN(+e)) return '';

    const hhmm = (d: Date) =>
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); // HH:mm

    return `${hhmm(s)} - ${hhmm(e)}`;
  }
}

export function parseBangkok(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  if (s instanceof Date) return s;
  // แปลง "2025-05-20 12:00:00" => "2025-05-20T12:00:00+07:00"
  return new Date(String(s).replace(' ', 'T') + '+07:00');
}

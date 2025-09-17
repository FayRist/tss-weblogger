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

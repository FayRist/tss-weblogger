import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'dateRange', standalone: true })
export class DateRangePipe implements PipeTransform {
  transform(start: Date | string | number | null | undefined, end: Date | string | number | null | undefined): string {
    if (!start) return '';
    const s = new Date(start);
    const e = end ? new Date(end) : s;

    if (isNaN(+s) || isNaN(+e)) return '';

    const dd = (d: Date) => d.getDate();
    const mon = (d: Date) => d.toLocaleString('en-GB', { month: 'short' }).toUpperCase(); // MAR, APR
    const yyyy = (d: Date) => d.getFullYear();

    const sameDay   = s.toDateString() === e.toDateString();
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    const sameYear  = s.getFullYear() === e.getFullYear();

    if (sameDay) {
      return `${dd(s)} ${mon(s)} ${yyyy(s)}`;
    }

    if (sameMonth) {
      // 21–22 MAR 2025
      return `${dd(s)}–${dd(e)} ${mon(s)} ${yyyy(s)}`;
    }

    if (sameYear) {
      // 21 MAR – 02 APR 2025
      return `${dd(s)} ${mon(s)} – ${dd(e)} ${mon(e)} ${yyyy(s)}`;
    }

    // คนละปี
    return `${dd(s)} ${mon(s)} ${yyyy(s)} – ${dd(e)} ${mon(e)} ${yyyy(e)}`;
  }
}

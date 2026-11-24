import { DateTime } from 'luxon';
import type { Period, TimePoint } from '@dashboard/shared';

export function range(period: Period, timezone: string, now = DateTime.now()) {
  const end = now.setZone(timezone);
  const start = period === 'today' ? end.startOf('day') : end.minus({ days: period === '7d' ? 7 : 30 });
  return { startAt: start.toMillis(), endAt: end.toMillis(), unit: period === 'today' ? 'hour' as const : 'day' as const, timezone };
}
export type AnalyticsRange = ReturnType<typeof range>;
export function comparisonRange(current: AnalyticsRange, period: Period): AnalyticsRange {
  const start = DateTime.fromMillis(current.startAt, { zone: current.timezone });
  const end = DateTime.fromMillis(current.endAt, { zone: current.timezone });
  if (period === 'today') return { ...current, startAt: start.minus({ days: 1 }).toMillis(), endAt: end.minus({ days: 1 }).toMillis() };
  return { ...current, startAt: start.minus({ days: period === '7d' ? 7 : 30 }).toMillis(), endAt: current.startAt - 1 };
}

// Umami groups in the requested timezone. Its SQL buckets can contain a literal
// Z even though the fields describe local wall time; do not shift those twice.
function bucketKey(value: string, unit: AnalyticsRange['unit'], timezone: string): string {
  const local = DateTime.fromISO(value.replace(' ', 'T').replace(/Z$/, ''), { zone: timezone });
  if (!local.isValid) throw new Error('Ongeldig tijdstip in Umami-tijdreeks');
  return local.startOf(unit).toFormat(unit === 'hour' ? 'yyyy-MM-dd HH' : 'yyyy-MM-dd');
}
export function timeline(rows: { x: string; y: number | null }[], bounds: AnalyticsRange): TimePoint[] {
  const values = new Map<string, number | null>();
  for (const row of rows) {
    const key = bucketKey(row.x, bounds.unit, bounds.timezone);
    if (values.has(key)) throw new Error('Dubbelzinnige tijdstippen in Umami-tijdreeks');
    values.set(key, row.y);
  }
  const buckets: { start: DateTime; end: DateTime; key: string }[] = [];
  let start = DateTime.fromMillis(bounds.startAt, { zone: bounds.timezone }).startOf(bounds.unit);
  while (start.toMillis() <= bounds.endAt) {
    const end = bounds.unit === 'hour' ? start.plus({ hours: 1 }) : start.plus({ days: 1 });
    buckets.push({ start, end, key: start.toFormat(bounds.unit === 'hour' ? 'yyyy-MM-dd HH' : 'yyyy-MM-dd') });
    start = end;
  }
  const occurrences = new Map<string, number>();
  for (const bucket of buckets) occurrences.set(bucket.key, (occurrences.get(bucket.key) ?? 0) + 1);
  return buckets.map(({ start, end, key }) => ({
    at: Math.max(start.toMillis(), bounds.startAt),
    endAt: Math.min(end.toMillis() - 1, bounds.endAt),
    label: start.setLocale('nl').toFormat(bounds.unit === 'hour' ? 'dd LLL HH:mm (ZZ)' : 'dd LLL yyyy'),
    // A successful sparse response omits empty buckets: those are zero. An
    // explicit null or an ambiguous repeated DST hour remains unknown.
    y: (occurrences.get(key) ?? 0) > 1 && values.has(key) ? null : values.has(key) ? values.get(key)! : 0,
  }));
}

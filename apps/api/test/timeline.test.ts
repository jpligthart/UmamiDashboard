import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { range, comparisonRange, timeline } from '../src/timeline.js';

test('today compares yesterday at the same local clock time, including DST', () => {
  const current = range('today', 'Europe/Amsterdam', DateTime.fromISO('2026-03-29T14:23:00+02:00'));
  const previous = comparisonRange(current, 'today');
  assert.equal(DateTime.fromMillis(previous.startAt, { zone: current.timezone }).toISO(), '2026-03-28T00:00:00.000+01:00');
  assert.equal(DateTime.fromMillis(previous.endAt, { zone: current.timezone }).toISO(), '2026-03-28T14:23:00.000+01:00');
});
test('rolling comparisons cover the preceding calendar window without overlapping endpoints', () => {
  for (const period of ['7d', '30d'] as const) {
    const current = range(period, 'Europe/Amsterdam', DateTime.fromISO('2026-04-02T14:23:00+02:00'));
    const previous = comparisonRange(current, period);
    assert.equal(previous.endAt, current.startAt - 1);
    const expected = DateTime.fromMillis(current.startAt, { zone: current.timezone }).minus({ days: period === '7d' ? 7 : 30 });
    assert.equal(previous.startAt, expected.toMillis());
  }
});
test('sparse series preserve elapsed hours, explicit zero and unknown, including fake Z buckets', () => {
  const bounds = range('today', 'Europe/Amsterdam', DateTime.fromISO('2026-11-24T04:30:00+01:00'));
  const points = timeline([{ x: '2026-11-24 00:00:00', y: 4 }, { x: '2026-11-24T02:00:00Z', y: null }, { x: '2026-11-24T04:00:00Z', y: 0 }], bounds);
  assert.equal(points.length, 5);
  assert.deepEqual(points.map(p => p.y), [4, 0, null, 0, 0]);
  assert.equal(points[2].at, DateTime.fromISO('2026-11-24T02:00:00+01:00').toMillis());
  assert.equal(points[4].endAt, bounds.endAt);
  assert(points.every((p, i) => !i || p.at === points[i - 1].endAt + 1));
});
test('empty successful series have a zero in every elapsed bucket', () => {
  const bounds = range('today', 'Europe/Amsterdam', DateTime.fromISO('2026-11-24T02:30:00+01:00'));
  assert.deepEqual(timeline([], bounds).map(p => p.y), [0, 0, 0]);
});
test('daily bins preserve short DST days and partial boundary days', () => {
  const bounds = range('7d', 'Europe/Amsterdam', DateTime.fromISO('2026-04-02T14:23:00+02:00'));
  const points = timeline([], bounds);
  assert.equal(points.length, 8);
  assert.equal(points[0].at, bounds.startAt);
  assert.equal(points.at(-1)!.endAt, bounds.endAt);
  const shortDay = points.find(p => p.label.startsWith('29 mrt'))!;
  assert.equal(shortDay.endAt - shortDay.at + 1, 23 * 3600000);
});
test('ambiguous repeated autumn hour is not counted twice', () => {
  const bounds = range('today', 'Europe/Amsterdam', DateTime.fromISO('2026-10-25T04:00:00+01:00'));
  const points = timeline([{ x: '2026-10-25 02:00:00', y: 12 }], bounds);
  const repeated = points.filter(p => / 02:00 \(/.test(p.label));
  assert.equal(repeated.length, 2);
  assert.deepEqual(repeated.map(p => p.y), [null, null]);
  assert.notEqual(repeated[0].at, repeated[1].at);
});
test('unparseable bucket timestamps do not silently become zero activity', () => {
  const bounds = range('today', 'Europe/Amsterdam');
  assert.throws(() => timeline([{ x: 'invalid', y: 5 }], bounds));
});

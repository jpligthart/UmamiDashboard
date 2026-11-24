import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SiteRow, TimePoint } from '@dashboard/shared';
import { timePosition, sparkPaths } from '../src/chart-model';
import { Chart, Sparkline } from '../src/Charts';
import { App, Comparison } from '../src/App';

const points: TimePoint[] = [
  { at: 0, endAt: 999, y: 8, label: 'Eerste tijdvak' },
  { at: 1000, endAt: 3999, y: null, label: 'Onbekend tijdvak' },
  { at: 4000, endAt: 4999, y: 0, label: 'Leeg tijdvak' },
];
test('chart positions reflect elapsed time and do not bridge unknown intervals', () => {
  assert.equal(timePosition(1000, points, 100), 20);
  assert.equal(timePosition(4000, points, 100), 80);
  assert.equal(sparkPaths(points, 100, 30).length, 2);
});
test('chart exposes axes, exact zero values and unknown values separately', () => {
  const site = { id: 'test', name: 'Testapp', trend: points, color: '#87b9ff' } as SiteRow;
  const markup = renderToStaticMarkup(createElement(Chart, { site, timezone: 'Europe/Amsterdam', period: 'today' }));
  assert.match(markup, /Onbekend tijdvak: onbekend/);
  assert.match(markup, /Leeg tijdvak: 0 pageviews/);
  assert.match(markup, /Exacte waarden bekijken/);
  assert.match(markup, /class="axis-label"/);
  assert.doesNotMatch(markup, /NaN|Infinity/);
});
test('a single time bucket remains visible in a sparkline', () => {
  const markup = renderToStaticMarkup(createElement(Sparkline, { points: [points[0]], color: '#87b9ff' }));
  assert.match(markup, /<circle/);
  assert.match(markup, /eigen schaal/);
});
test('comparison label uses the configured timezone rather than browser timezone', () => {
  const endAt = Date.parse('2026-11-24T13:23:00Z');
  const markup = renderToStaticMarkup(createElement(Comparison, {
    current: { startAt: Date.parse('2026-11-23T23:00:00Z'), endAt },
    previous: { startAt: Date.parse('2026-11-22T23:00:00Z'), endAt: endAt - 86400000 }, timezone: 'Europe/Amsterdam',
  }));
  assert.match(markup, /24 nov/); assert.match(markup, /23 nov/); assert.match(markup, /14:23/);
});
test('overview starts compact with the details closed', () => {
  const markup = renderToStaticMarkup(createElement(App));
  assert.match(markup, /summary-strip/);
  assert.doesNotMatch(markup, /id="application-details"/);
});

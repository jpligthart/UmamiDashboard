import test from 'node:test';
import assert from 'node:assert/strict';
import type { SiteRow } from '@dashboard/shared';
import { hashForSite, parsePreferences, refreshIntervals, siteFromHash, sortedSites } from '../src/view-model';

const site = (id: string, visitors: number | null, previous = 5): SiteRow => ({
  id, name: id, domain: 'example.nl', color: '#87b9ff', group: 'Apps', active: 0, trend: [], warnings: [],
  stats: visitors === null ? null : { visitors, pageviews: visitors * 2, visits: visitors, bounces: 0, totaltime: 0 },
  previous: { visitors: previous, pageviews: previous * 2, visits: previous, bounces: 0, totaltime: 0 },
});
test('pins precede numeric sorting; unavailable stats remain last in both directions', () => {
  const sites = [site('Low', 2), site('Unknown', null), site('High', 20), site('Pinned', 1)];
  assert.deepEqual(sortedSites(sites, { sort: 'visitors', direction: 'desc', pinned: ['Pinned'] }).map(s => s.id), ['Pinned', 'High', 'Low', 'Unknown']);
  assert.deepEqual(sortedSites(sites, { sort: 'visitors', direction: 'asc' }).map(s => s.id), ['Pinned', 'Low', 'High', 'Unknown']);
  assert.equal(sites[0].id, 'Low');
});
test('default order preserves server preferences and stable ties', () => {
  const sites = [site('Z', 10), site('A', 10), site('B', 20)];
  assert.deepEqual(sortedSites(sites, { sort: 'default' }).map(s => s.id), ['Z', 'A', 'B']);
  assert.deepEqual(sortedSites(sites, { sort: 'visitors', direction: 'desc' }).map(s => s.id), ['B', 'Z', 'A']);
});
test('change sorting handles new visitors and unavailable comparisons', () => {
  const sites = [site('Decline', 2, 10), site('New', 4, 0), site('Growing', 20, 10), site('Missing', null)];
  assert.deepEqual(sortedSites(sites, { sort: 'change', direction: 'desc' }).map(s => s.id), ['New', 'Growing', 'Decline', 'Missing']);
});
test('invalid saved preferences cannot add arbitrary columns or sort keys', () => {
  assert.deepEqual(parsePreferences('null'), {});
  const prefs = parsePreferences('{"columns":["visits","visits","bad"],"pinned":["a","a",1],"sort":"__proto__","direction":"bad"}');
  assert.deepEqual(prefs.columns, ['visits']); assert.deepEqual(prefs.pinned, ['a']);
  assert.equal(prefs.sort, 'default'); assert.equal(prefs.direction, 'desc');
});
test('historical overview updates less often than live activity without shortening configured intervals', () => {
  assert.deepEqual(refreshIntervals('today', 60), { overview: 60, active: 60 });
  assert.deepEqual(refreshIntervals('7d', 60), { overview: 300, active: 60 });
  assert.deepEqual(refreshIntervals('30d', 600), { overview: 600, active: 600 });
});
test('detail route round-trips application ids and ignores other hashes', () => {
  for (const id of ['abc-123', 'met spatie', 'a/b']) assert.equal(siteFromHash(hashForSite(id)), id);
  assert.equal(siteFromHash(''), '');
  assert.equal(siteFromHash('#/app/'), '');
  assert.equal(siteFromHash('#/app/%E0%A4%A'), '');
  assert.equal(siteFromHash('#metric-help'), '');
});

import type { Column, Period, SiteRow } from '@dashboard/shared';

export const columnNames: Record<Column, string> = { active: 'Nu actief', visitors: 'Bezoekers', pageviews: 'Pageviews', visits: 'Bezoeken', bounce: 'Bouncepercentage', trend: 'Pageviews · trend' };
export const metricHelp: Record<Column | 'duration', string> = {
  active: 'Bezoekers die volgens Umami actief waren in de laatste vijf minuten. Dit tijdvenster staat los van de gekozen periode.',
  visitors: 'Unieke bezoekers volgens Umami’s anonieme sessie-ID. Dit is geen gegarandeerd aantal unieke personen. Totalen over applicaties zijn niet ontdubbeld.',
  pageviews: 'Het aantal geregistreerde paginaweergaven in de gekozen periode.',
  visits: 'Een bezoek is een activiteitvenster binnen een Umami-sessie. Eén sessie kan meerdere bezoeken bevatten.',
  bounce: 'Het aandeel bezoeken met slechts één event, berekend als bounces gedeeld door bezoeken. Bij nul bezoeken is dit percentage niet van toepassing.',
  trend: 'Pageviews per tijdvak. Elke kleine trend heeft een eigen schaal; vergelijk de aantallen in de cijferkolommen.',
  duration: 'De som van tijd tussen het eerste en laatste event per bezoek, gedeeld door alle bezoeken. Bezoeken met maar één pagina leveren geen meetbare duur op. Dit is geen volledige leestijd.',
};
export const sortNames = { default: 'Voorkeursvolgorde', name: 'Applicatienaam', active: 'Nu actief', visitors: 'Bezoekers', pageviews: 'Pageviews', visits: 'Bezoeken', bounce: 'Bouncepercentage', change: 'Verandering bezoekers (%)' };
export type SortKey = keyof typeof sortNames;
export interface Preferences { columns?: Column[]; compact?: boolean; pinned?: string[]; sort?: SortKey; direction?: 'asc' | 'desc' }
export function parsePreferences(raw: string): Preferences {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return {};
    const columns = Object.keys(columnNames);
    return {
      compact: value.compact === true,
      columns: Array.isArray(value.columns) ? [...new Set(value.columns.filter((c: unknown) => typeof c === 'string' && columns.includes(c)))] as Column[] : undefined,
      pinned: Array.isArray(value.pinned) ? [...new Set(value.pinned.filter((id: unknown) => typeof id === 'string'))] as string[] : [],
      sort: Object.hasOwn(sortNames, value.sort) ? value.sort : 'default',
      direction: value.direction === 'asc' ? 'asc' : 'desc',
    };
  } catch { return {}; }
}
export function sortedSites(sites: SiteRow[], prefs: Preferences): SiteRow[] {
  const pinned = new Set(prefs.pinned);
  const key = prefs.sort ?? 'default';
  const direction = prefs.direction === 'asc' ? 1 : -1;
  const numeric = (site: SiteRow): number | null => {
    if (key === 'active') return site.active;
    if (key === 'bounce') return site.stats?.visits ? site.stats.bounces / site.stats.visits : null;
    if (key === 'change') {
      if (!site.stats || !site.previous) return null;
      return site.previous.visitors ? (site.stats.visitors - site.previous.visitors) / site.previous.visitors : site.stats.visitors ? Infinity : 0;
    }
    return key === 'visitors' || key === 'pageviews' || key === 'visits' ? site.stats?.[key] ?? null : null;
  };
  return sites.map((site, index) => ({ site, index })).sort((a, b) => {
    const pinDifference = Number(pinned.has(b.site.id)) - Number(pinned.has(a.site.id));
    if (pinDifference) return pinDifference;
    if (key === 'default') return a.index - b.index;
    if (key === 'name') return a.site.name.localeCompare(b.site.name, 'nl', { numeric: true }) * direction || a.index - b.index;
    const left = numeric(a.site), right = numeric(b.site);
    if (left === null) return right === null ? a.index - b.index : 1;
    if (right === null) return -1;
    return left === right ? a.index - b.index : (left < right ? -1 : 1) * direction;
  }).map(row => row.site);
}
export function refreshIntervals(period: Period, seconds: number) {
  return { overview: period === 'today' ? seconds : Math.max(300, seconds), active: seconds };
}
/** Detail route: `#/app/<id>` opens one application; anything else is the overview. */
export function siteFromHash(hash: string): string {
  const match = /^#\/app\/([^/?#]+)$/.exec(hash);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return ''; }
}
export const hashForSite = (id: string) => `#/app/${encodeURIComponent(id)}`;

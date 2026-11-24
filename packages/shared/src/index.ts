export type Period = 'today' | '7d' | '30d';
export type Column = 'active' | 'visitors' | 'pageviews' | 'visits' | 'bounce' | 'trend';
export interface Site { id: string; name: string; domain: string; color: string; group: string }
export interface Counts { visitors: number; pageviews: number; visits: number; bounces: number; totaltime: number }
export interface Point { x: string; y: number }
export interface TimePoint { at: number; endAt: number; label: string; y: number | null }
export interface TimeRange { startAt: number; endAt: number }
export interface SiteRow extends Site {
  stats: Counts | null;
  previous: Counts | null;
  active: number | null;
  trend: TimePoint[] | null;
  warnings: string[];
}
export interface Dashboard {
  title: string;
  demo: boolean;
  timezone: string;
  refreshSeconds: number;
  columns: Column[];
  period: Period;
  startAt: number;
  endAt: number;
  comparison: TimeRange;
  generatedAt: string;
  sites: SiteRow[];
}
export interface Details {
  siteId: string;
  period: Period;
  lists: { type: 'path' | 'referrer' | 'event' | 'country'; label: string; rows: Point[] | null; error?: string }[];
}
export interface ActiveSnapshot {
  generatedAt: string;
  sites: { id: string; active: number | null; error?: string }[];
}

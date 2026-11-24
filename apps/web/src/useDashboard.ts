import { useEffect, useRef, useState } from 'react';
import type { ActiveSnapshot, Dashboard, Period } from '@dashboard/shared';
import { refreshIntervals } from './view-model';

export async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' });
  if (!response.ok) {
    let error = 'Het dashboard is tijdelijk niet bereikbaar.';
    try { const body = await response.json(); if (typeof body.error === 'string') error = body.error; } catch { /* proxy returned HTML */ }
    throw new Error(error);
  }
  return response.json() as Promise<T>;
}
export function useDashboard(period: Period) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [active, setActive] = useState<ActiveSnapshot | null>(null);
  const [error, setError] = useState('');
  const [activeError, setActiveError] = useState('');
  const [busy, setBusy] = useState(true);
  const [paused, setPaused] = useState(false);
  const [request, setRequest] = useState({ serial: 0, manual: 0, fresh: false });
  const pausedRef = useRef(paused);
  const busyRef = useRef(busy);
  const previousPeriod = useRef(period);
  pausedRef.current = paused;
  busyRef.current = busy;
  const intervals = refreshIntervals(period, data?.refreshSeconds ?? 60);
  const snapshot = data?.period === period ? data : null;
  useEffect(() => {
    const controller = new AbortController();
    const intentional = request.fresh || previousPeriod.current !== period;
    previousPeriod.current = period;
    setBusy(true);
    get<Dashboard>(`/api/dashboard?period=${period}${request.fresh ? '&refresh=1' : ''}`, controller.signal)
      .then(value => {
        if (controller.signal.aborted || pausedRef.current && !intentional) return;
        setData(value); setError(''); setActiveError(''); document.title = `${value.title} · Umami`;
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [period, request]);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      if (!document.hidden && !busyRef.current) setRequest(r => ({ ...r, serial: r.serial + 1, fresh: false }));
    }, intervals.overview * 1000);
    return () => clearInterval(timer);
  }, [paused, intervals.overview, period]);
  useEffect(() => {
    if (paused || period === 'today' || busy) return;
    let controller: AbortController | null = null;
    let fetching = false;
    const poll = async () => {
      if (document.hidden || fetching || busyRef.current) return;
      fetching = true; controller = new AbortController();
      try {
        const value = await get<ActiveSnapshot>('/api/active', controller.signal);
        if (!controller.signal.aborted && !pausedRef.current) { setActive(value); setActiveError(''); }
      } catch (e) {
        if (!controller.signal.aborted) setActiveError(e instanceof Error ? e.message : 'Actieve bezoekers konden niet worden ververst.');
      } finally { fetching = false; }
    };
    // A historical response can come from the longer overview cache. Refresh
    // its live count immediately when that response is already old.
    if (snapshot && Date.now() - Date.parse(snapshot.generatedAt) >= intervals.active * 1000) void poll();
    const timer = setInterval(poll, intervals.active * 1000);
    return () => { clearInterval(timer); controller?.abort(); };
  }, [paused, period, intervals.active, busy, snapshot?.generatedAt]);
  const newerActive = snapshot && active && active.generatedAt > snapshot.generatedAt ? active : null;
  const current = snapshot && newerActive ? { ...snapshot, sites: snapshot.sites.map(site => {
    const update = newerActive.sites.find(row => row.id === site.id);
    if (!update) return site;
    return { ...site, active: update.active, warnings: [...site.warnings.filter(w => w !== 'Actieve bezoekers konden niet worden opgehaald.'), ...(update.error ? [update.error] : [])] };
  }) } : snapshot;
  return { current, error, activeError, busy, paused, setPaused, intervals,
    activeAt: newerActive?.generatedAt ?? snapshot?.generatedAt,
    refresh: () => setRequest(r => ({ serial: r.serial + 1, manual: r.manual + 1, fresh: true })),
    refreshSerial: request.manual,
  };
}

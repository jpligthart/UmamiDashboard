import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Column, Dashboard, Details, Period, Point, SiteRow } from '@dashboard/shared';

const number = new Intl.NumberFormat('nl-NL');
const format = (n: number | null | undefined) => n == null ? '—' : number.format(n);
const columnNames: Record<Column, string> = { active: 'Nu actief', visitors: 'Bezoekers', pageviews: 'Pageviews', visits: 'Sessies', bounce: 'Bounce', trend: 'Pageviews · trend' };
const allColumns = Object.keys(columnNames) as Column[];
function readPreferences(): { columns?: Column[]; compact?: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem('dashboard-view') ?? '{}');
    return { compact: value.compact === true, columns: Array.isArray(value.columns) ? value.columns.filter((c: Column) => allColumns.includes(c)) : undefined };
  } catch { return {}; }
}
async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' });
  if (!response.ok) {
    let error = 'Het dashboard is tijdelijk niet bereikbaar.';
    try { const body = await response.json(); if (typeof body.error === 'string') error = body.error; } catch { /* proxy returned HTML */ }
    throw new Error(error);
  }
  return response.json() as Promise<T>;
}
function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="delta neutral">{current ? 'nieuw' : '0%'}</span>;
  const change = (current - previous) / previous * 100;
  return <span className={`delta ${change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral'}`}>{change > 0 ? '+' : ''}{change.toFixed(1).replace('.', ',')}%</span>;
}
function Sparkline({ points, color }: { points: Point[] | null; color: string }) {
  if (!points) return <span className="muted">Niet beschikbaar</span>;
  if (!points.length) return <span className="muted">Geen pageviews</span>;
  const max = Math.max(1, ...points.map(p => p.y));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${points.length === 1 ? 60 : i / (points.length - 1) * 120},${28 - p.y / max * 24}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 120 32" role="img" aria-label="Pageviews over de gekozen periode"><path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"/>{points.length === 1 && <circle cx="60" cy={28 - points[0].y / max * 24} r="2" fill={color}/>}</svg>;
}
function Chart({ site }: { site: SiteRow }) {
  const points = site.trend;
  if (!points) return <div className="chart-empty">De trend is niet beschikbaar.</div>;
  if (!points.length) return <div className="chart-empty">Nog geen pageviews in deze periode.</div>;
  const max = Math.max(1, ...points.map(p => p.y));
  const width = 700 / points.length;
  return <div className="chart-wrap"><svg className="chart" viewBox="0 0 720 140" role="img" aria-label={`Pageviews voor ${site.name}`}>
    {[30, 70, 110].map(y => <line key={y} x1="0" y1={y} x2="720" y2={y} stroke="var(--border)" strokeDasharray="3 5"/>)}
    {points.map((p, i) => <rect key={`${p.x}-${i}`} x={10 + i * width} y={125 - p.y / max * 110} width={Math.max(1, width - 3)} height={Math.max(p.y > 0 ? 2 : 0, p.y / max * 110)} rx="2" fill={site.color} opacity=".85"><title>{p.x}: {format(p.y)} pageviews</title></rect>)}
  </svg><div className="chart-labels"><span>{points[0].x}</span><span>{points.at(-1)?.x}</span></div></div>;
}
function MetricCell({ site, column }: { site: SiteRow; column: Column }) {
  if (column === 'trend') return <Sparkline points={site.trend} color={site.color}/>;
  if (column === 'active') return <span className={site.active ? 'active-count' : 'muted'}>{site.active ? <i className="live-dot"/> : null}{format(site.active)}</span>;
  if (column === 'bounce') return <>{site.stats ? `${(site.stats.visits ? site.stats.bounces / site.stats.visits * 100 : 0).toFixed(0)}%` : '—'}</>;
  return <div className="metric-cell"><strong>{format(site.stats?.[column])}</strong>{site.stats && site.previous && <Delta current={site.stats[column]} previous={site.previous[column]}/>}</div>;
}
export function App() {
  const [period, setPeriod] = useState<Period>('today');
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [selected, setSelected] = useState('');
  const [details, setDetails] = useState<Details | null>(null);
  const [detailError, setDetailError] = useState('');
  const [settings, setSettings] = useState(false);
  const [prefs, setPrefs] = useState(readPreferences);
  const current = data?.period === period ? data : null;
  const refreshSeconds = data?.refreshSeconds ?? 60;
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError('');
    get<Dashboard>(`/api/dashboard?period=${period}`, controller.signal)
      .then(value => { setData(value); document.title = `${value.title} · Umami`; })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [period, nonce]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setNonce(n => n + 1); }, refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [refreshSeconds]);
  useEffect(() => { try { localStorage.setItem('dashboard-view', JSON.stringify(prefs)); } catch { /* private browser */ } }, [prefs]);
  const visible = current?.sites.filter(s => (!group || s.group === group) && `${s.name} ${s.domain}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const focused = visible.find(s => s.id === selected) ?? visible[0];
  const focusedId = focused?.id;
  useEffect(() => {
    setDetails(null); setDetailError('');
    if (!focusedId) return;
    const controller = new AbortController();
    get<Details>(`/api/sites/${focusedId}/details?period=${period}`, controller.signal).then(setDetails)
      .catch(e => { if (!controller.signal.aborted) setDetailError(e.message); });
    return () => controller.abort();
  }, [focusedId, period, data?.generatedAt]);
  const columns = prefs.columns?.length ? prefs.columns : current?.columns ?? allColumns;
  const partial = visible.some(s => !s.stats);
  const activePartial = visible.some(s => s.active === null);
  const total = (key: 'visitors' | 'pageviews') => visible.reduce((sum, s) => sum + (s.stats?.[key] ?? 0), 0);
  const noStats = visible.length > 0 && visible.every(s => !s.stats);
  const lastUpdate = current ? new Intl.DateTimeFormat('nl-NL', { timeZone: current.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(current.generatedAt)) : null;
  function toggleColumn(column: Column) {
    const next = columns.includes(column) ? columns.filter(c => c !== column) : allColumns.filter(c => c === column || columns.includes(c));
    if (next.length) setPrefs(p => ({ ...p, columns: next }));
  }
  return <div className={`app ${prefs.compact ? 'compact' : ''}`}>
    <header className="header"><div className="brand"><span className="brand-icon" aria-hidden="true">u<span>.</span></span><div><div className="eyebrow">UMAMI / ANALYTICS</div><h1>{current?.title ?? 'Mijn overzicht'}</h1></div></div>
      <div className="header-actions"><span className="update" role="status">{busy ? 'Ophalen…' : lastUpdate ? `Bijgewerkt ${lastUpdate}` : 'Niet verbonden'}</span><button className="icon-button" disabled={busy} onClick={() => setNonce(n => n + 1)} aria-label="Gegevens verversen"><span aria-hidden="true">↻</span></button><button className={settings ? 'selected' : ''} aria-expanded={settings} onClick={() => setSettings(!settings)}>Weergave</button></div>
    </header>
    {current?.demo && <div className="demo-banner"><strong>Demomodus</strong><span>Voorbeeldgegevens · er is geen verbinding met jouw Umami.</span></div>}
    {error && <div className="error-banner" role="alert"><strong>Gegevens niet ververst</strong><span>{error} {current ? 'De laatst opgehaalde gegevens staan hieronder.' : ''}</span><button onClick={() => setNonce(n => n + 1)}>Opnieuw proberen</button></div>}
    {settings && <section className="settings" aria-label="Weergave aanpassen"><fieldset><legend>Zichtbare kolommen</legend>{allColumns.map(c => <label key={c}><input type="checkbox" checked={columns.includes(c)} disabled={columns.includes(c) && columns.length === 1} onChange={() => toggleColumn(c)}/>{columnNames[c]}</label>)}</fieldset><label><input type="checkbox" checked={prefs.compact ?? false} onChange={e => setPrefs(p => ({ ...p, compact: e.target.checked }))}/> Extra compact</label><button onClick={() => setPrefs({})}>Standaard herstellen</button></section>}
    <main>
      <div className="toolbar"><div className="periods" role="group" aria-label="Periode">{([['today', 'Vandaag'], ['7d', '7 dagen'], ['30d', '30 dagen']] as const).map(([id, label]) => <button key={id} className={period === id ? 'selected' : ''} aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}</div>
        <div className="filters"><label className="sr-only" htmlFor="group">Groep</label><select id="group" value={group} onChange={e => setGroup(e.target.value)}><option value="">Alle groepen</option>{[...new Set(current?.sites.map(s => s.group))].map(g => <option key={g}>{g}</option>)}</select><label className="sr-only" htmlFor="search">Applicaties zoeken</label><input id="search" type="search" placeholder="Zoek een applicatie…" value={search} onChange={e => setSearch(e.target.value)}/></div>
      </div>
      <section className="totals" aria-label="Samenvatting">
        <div className="total"><span>Nu actief <i className="live-dot"/></span><strong>{current && !visible.every(s => s.active === null) ? format(visible.reduce((sum, s) => sum + (s.active ?? 0), 0)) : '—'}</strong><small>{activePartial ? 'Gedeeltelijk beschikbaar' : 'Laatste 5 minuten'}</small></div>
        <div className="total"><span>Bezoekers</span><strong>{current && !noStats ? format(total('visitors')) : '—'}</strong><small>{partial ? 'Gedeeltelijk · ' : ''}Opgeteld per applicatie</small></div>
        <div className="total"><span>Pageviews</span><strong>{current && !noStats ? format(total('pageviews')) : '—'}</strong><small>{partial ? 'Gedeeltelijk · ' : ''}{visible.length} {visible.length === 1 ? 'applicatie' : 'applicaties'} in dit overzicht</small></div>
      </section>
      <section className="panel overview" aria-label="Applicatieoverzicht"><div className="panel-heading"><h2>Alle applicaties <span className="count">{visible.length}</span></h2><span className="muted comparison-label">% ten opzichte van vorige periode</span></div>
        {!current ? <div className="empty">{busy ? 'Applicaties en statistieken ophalen…' : 'Verbind je Umami-omgeving om het overzicht te laden.'}</div> : !visible.length ? <div className="empty">{current.sites.length ? 'Geen applicaties gevonden met deze filters.' : 'Geen applicaties beschikbaar. Controleer de rechten van de API-key en je applicatieselectie.'}</div> :
          <div className="table-scroll"><table><thead><tr><th>Applicatie</th>{columns.map(c => <th key={c}>{columnNames[c]}</th>)}</tr></thead><tbody>{visible.map(site => <tr key={site.id} className={focusedId === site.id ? 'focused-row' : ''}>
            <td><button className="site-button" onClick={() => setSelected(site.id)} aria-pressed={focusedId === site.id}><span className="site-icon" style={{ '--site-color': site.color } as CSSProperties}>{site.name.charAt(0).toUpperCase()}</span><span className="site-name"><strong>{site.name}</strong><small>{site.domain}</small></span></button>{site.warnings.length > 0 && <span className="row-warning" title={site.warnings.join(' ')}>⚠ <span className="sr-only">{site.warnings.join(' ')}</span></span>}</td>
            {columns.map(c => <td key={c}><MetricCell site={site} column={c}/></td>)}</tr>)}</tbody></table></div>}
      </section>
      {focused && <section className="detail-section" aria-label={`Details van ${focused.name}`}>
        <div className="detail-title"><h2>{focused.name} <span className="muted">/ details</span></h2><span className="muted">Selecteer een applicatie voor details</span></div>
        <div className="detail-grid"><section className="panel trend-panel"><div className="panel-heading"><h3>Pageviews</h3><span className="muted">{period === 'today' ? 'Per uur' : 'Per dag'}</span></div><Chart site={focused}/></section>
          <section className="panel insights-panel"><div className="panel-heading"><h3>Inzicht</h3><span className="muted">Gekozen periode</span></div><div className="insight-values"><div><strong>{focused.stats ? (focused.stats.visits ? Math.round(focused.stats.totaltime / focused.stats.visits) : 0) + 's' : '—'}</strong><span>Gem. sessieduur</span></div><div><strong>{focused.stats ? (focused.stats.visits ? (focused.stats.pageviews / focused.stats.visits).toFixed(1).replace('.', ',') : '0') : '—'}</strong><span>Pagina’s / sessie</span></div></div>{focused.warnings.length ? <p className="warning-text">{focused.warnings.join(' ')}</p> : <p className="insight-note">{focused.domain}</p>}</section></div>
        {detailError && <p className="error-banner" role="alert">{detailError}</p>}
        <div className="breakdowns">{details ? details.lists.map(list => <section className="panel breakdown" key={list.type}><div className="panel-heading"><h3>{list.label}</h3><span className="muted">{list.type === 'country' ? 'Bezoekers' : list.type === 'event' ? 'Aantal' : 'Pageviews'}</span></div>{list.error ? <p className="warning-text">{list.error}</p> : !list.rows?.length ? <p className="list-empty">Geen gegevens in deze periode.</p> : <ol>{list.rows.map((row, i) => <li key={`${row.x}-${i}`}><span className="bar" style={{ width: `${Math.max(2, row.y / Math.max(1, ...list.rows!.map(r => r.y)) * 100)}%` }}/><span className="list-label" title={row.x}>{row.x || (list.type === 'referrer' ? 'Direct / onbekend' : 'Onbekend')}</span><strong>{format(row.y)}</strong></li>)}</ol>}</section>) : !detailError && <div className="panel loading-details">Details ophalen…</div>}</div>
      </section>}
    </main>
    <footer><span>{current?.demo ? 'Voorbeeldgegevens' : 'Gegevens uit Umami'} · {current?.timezone ?? 'Europe/Amsterdam'}</span><span>Bezoekersaantallen van verschillende applicaties zijn niet ontdubbeld.</span><span>Verversing elke {refreshSeconds}s</span></footer>
  </div>;
}

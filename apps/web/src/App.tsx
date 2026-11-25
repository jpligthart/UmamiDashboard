import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Column, Details, Period, SiteRow, TimeRange } from '@dashboard/shared';
import { Chart, Sparkline } from './Charts';
import { columnNames, hashForSite, metricHelp, parsePreferences, siteFromHash, sortedSites, sortNames, type Preferences, type SortKey } from './view-model';
import { get, useDashboard } from './useDashboard';

const number = new Intl.NumberFormat('nl-NL');
const format = (n: number | null | undefined) => n == null ? '—' : number.format(n);
const allColumns = Object.keys(columnNames) as Column[];
function readPreferences(): Preferences {
  if (typeof window === 'undefined') return {};
  try {
    return parsePreferences(localStorage.getItem('dashboard-view') ?? '{}');
  } catch { return {}; }
}
function Delta({ current, previous }: { current: number; previous: number }) {
  const difference = current - previous;
  const absolute = `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${format(Math.abs(difference))}`;
  const changeClass = difference > 0 ? 'positive' : difference < 0 ? 'negative' : 'neutral';
  const percentage = !previous ? current ? 'nieuw' : '0%' : `${difference > 0 ? '+' : ''}${((current - previous) / previous * 100).toFixed(1).replace('.', ',')}%`;
  return <span className={`delta ${changeClass}`} title={`${format(current)} tegenover ${format(previous)}; verschil ${absolute}`}><span>{percentage}</span><span className="absolute-delta">{absolute}</span></span>;
}
export function Comparison({ current, previous, timezone }: { current: TimeRange; previous: TimeRange; timezone: string }) {
  const date = new Intl.DateTimeFormat('nl-NL', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' });
  const time = new Intl.DateTimeFormat('nl-NL', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const window = (bounds: TimeRange) => date.format(bounds.startAt) === date.format(bounds.endAt)
    ? `${date.format(bounds.startAt)}, ${time.format(bounds.startAt)}–${time.format(bounds.endAt)}`
    : `${date.format(bounds.startAt)} ${time.format(bounds.startAt)} – ${date.format(bounds.endAt)} ${time.format(bounds.endAt)}`;
  return <div className="comparison-window"><span><strong>Periode</strong> {window(current)}</span><span><strong>Vergelijking</strong> {window(previous)}</span><span className="muted">{timezone}</span></div>;
}
function MetricCell({ site, column }: { site: SiteRow; column: Column }) {
  if (column === 'trend') return <Sparkline points={site.trend} color={site.color}/>;
  if (column === 'active') return <span className={site.active ? 'active-count' : 'muted'}>{site.active ? <i className="live-dot"/> : null}{format(site.active)}</span>;
  if (column === 'bounce') return <>{site.stats?.visits ? `${(site.stats.bounces / site.stats.visits * 100).toFixed(0)}%` : <span title="Niet van toepassing zonder bezoeken">—</span>}</>;
  return <div className="metric-cell"><strong>{format(site.stats?.[column])}</strong>{site.stats && site.previous && <Delta current={site.stats[column]} previous={site.previous[column]}/>}</div>;
}
const SiteIcon = ({ site }: { site: SiteRow }) => <span className="site-icon" style={{ '--site-color': site.color } as CSSProperties} aria-hidden="true">{site.name.charAt(0).toUpperCase()}</span>;
const currentHash = () => typeof window === 'undefined' ? '' : siteFromHash(window.location.hash);
const periodNames = [['today', 'Vandaag'], ['7d', '7 dagen'], ['30d', '30 dagen']] as const;

export function SiteDetail({ site, timezone, period, details, detailError }: { site: SiteRow; timezone: string; period: Period; details: Details | null; detailError: string }) {
  const stats = site.stats, previous = site.previous;
  const withDelta = (key: 'visitors' | 'pageviews') => stats && previous ? <><Delta current={stats[key]} previous={previous[key]}/> t.o.v. vorige periode</> : stats ? 'Geen vergelijking beschikbaar' : 'Niet beschikbaar';
  return <section id="application-details" className="detail-view" aria-labelledby="detail-heading">
    <div className="detail-heading"><SiteIcon site={site}/><div><h2 id="detail-heading">{site.name}</h2><span className="muted">{site.domain}{site.group ? ` · ${site.group}` : ''}</span></div></div>
    {site.warnings.length > 0 && <p className="demo-banner detail-warning" role="status">⚠ {site.warnings.join(' ')}</p>}
    <section className="summary-strip site-summary" aria-label={`Kerncijfers van ${site.name}`}>
      <div className="total"><span>Nu actief <i className="live-dot"/></span><strong>{format(site.active)}</strong><small>Laatste 5 minuten</small></div>
      <div className="total"><span>Bezoekers</span><strong>{format(stats?.visitors)}</strong><small>{withDelta('visitors')}</small></div>
      <div className="total"><span>Pageviews</span><strong>{format(stats?.pageviews)}</strong><small>{withDelta('pageviews')}</small></div>
      <div className="total"><span title={metricHelp.bounce}>Bouncepercentage</span><strong>{stats?.visits ? `${(stats.bounces / stats.visits * 100).toFixed(0)}%` : '—'}</strong><small>{stats ? `${format(stats.visits)} bezoeken` : 'Niet beschikbaar'}</small></div>
    </section>
    <div className="detail-grid"><section className="panel trend-panel"><div className="panel-heading"><h3>Pageviews</h3><span className="muted">{period === 'today' ? 'Per uur' : 'Per dag'}</span></div><Chart site={site} timezone={timezone} period={period}/></section>
      <section className="panel insights-panel"><div className="panel-heading"><h3>Inzicht</h3><span className="muted">Gekozen periode</span></div><div className="insight-values"><div><strong>{stats?.visits ? Math.round(stats.totaltime / stats.visits) + 's' : '—'}</strong><span title={metricHelp.duration}>Gem. bezoekduur</span></div><div><strong>{stats?.visits ? (stats.pageviews / stats.visits).toFixed(1).replace('.', ',') : '—'}</strong><span>Pagina’s / bezoek</span></div></div><p className="insight-note">{site.domain}</p></section></div>
    {detailError && <p className="error-banner" role="alert">{detailError}{details ? ' De laatst opgehaalde details blijven zichtbaar.' : ''}</p>}
    <div className="breakdowns">{details ? details.lists.map(list => <section className="panel breakdown" key={list.type}><div className="panel-heading"><h3>{list.label}</h3><span className="muted">{list.type === 'country' ? 'Bezoekers' : list.type === 'event' ? 'Aantal' : 'Pageviews'}</span></div>{list.error ? <p className="warning-text">{list.error}</p> : !list.rows?.length ? <p className="list-empty">Geen gegevens in deze periode.</p> : <ol>{list.rows.map((row, i) => <li key={`${row.x}-${i}`}><span className="bar" style={{ width: `${Math.max(2, row.y / Math.max(1, ...list.rows!.map(r => r.y)) * 100)}%` }}/><span className="list-label" title={row.x}>{row.x || (list.type === 'referrer' ? 'Direct / onbekend' : 'Onbekend')}</span><strong>{format(row.y)}</strong></li>)}</ol>}</section>) : !detailError && <div className="panel loading-details">Details ophalen…</div>}</div>
  </section>;
}

export function App() {
  const [period, setPeriod] = useState<Period>('today');
  const { current, error, activeError, busy, paused, setPaused, refresh, intervals, activeAt, refreshSerial } = useDashboard(period);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [selected, setSelected] = useState(currentHash);
  const [lastViewed, setLastViewed] = useState('');
  const [details, setDetails] = useState<Details | null>(null);
  const [detailError, setDetailError] = useState('');
  const [settings, setSettings] = useState(false);
  const [prefs, setPrefs] = useState(readPreferences);
  const previousManualRefresh = useRef(refreshSerial);
  const listScroll = useRef(0);
  useEffect(() => { try { localStorage.setItem('dashboard-view', JSON.stringify(prefs)); } catch { /* private browser */ } }, [prefs]);
  useEffect(() => {
    history.scrollRestoration = 'manual';
    const onPop = () => setSelected(currentHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const visible = sortedSites(current?.sites.filter(s => (!group || s.group === group) && `${s.name} ${s.domain}`.toLowerCase().includes(search.toLowerCase())) ?? [], prefs);
  const focused = selected ? current?.sites.find(s => s.id === selected) : undefined;
  const focusedId = focused?.id;
  // Switching between applications follows the list as filtered; a direct link to a filtered-out site falls back to all sites.
  const siblings = focused && !visible.some(s => s.id === focused.id) ? sortedSites(current?.sites ?? [], prefs) : visible;
  useLayoutEffect(() => {
    if (selected) { window.scrollTo(0, 0); return; }
    window.scrollTo(0, listScroll.current);
    if (lastViewed) document.querySelector<HTMLElement>(`[data-site="${CSS.escape(lastViewed)}"]`)?.focus({ preventScroll: true });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const base = current?.title ?? 'Overzicht';
    document.title = focused ? `${focused.name} · ${base}` : `Umami · ${base}`;
  }, [focused?.name, current?.title]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input,select,textarea')) closeDetails(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDetailError('');
    if (!focusedId) return;
    const controller = new AbortController();
    const fresh = previousManualRefresh.current !== refreshSerial;
    previousManualRefresh.current = refreshSerial;
    get<Details>(`/api/sites/${focusedId}/details?period=${period}${fresh ? '&refresh=1' : ''}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDetails(value); })
      .catch(e => { if (!controller.signal.aborted) setDetailError(e.message); });
    return () => controller.abort();
  }, [focusedId, period, current?.generatedAt, refreshSerial]);
  const visibleDetails = details && details.siteId === focusedId && details.period === period ? details : null;
  function openSite(id: string) {
    listScroll.current = window.scrollY;
    history.pushState({ fromOverview: true }, '', hashForSite(id));
    setSelected(id); setLastViewed(id);
  }
  function switchSite(id: string) {
    history.replaceState(history.state, '', hashForSite(id));
    setSelected(id); setLastViewed(id);
  }
  function closeDetails() {
    if (history.state?.fromOverview) { history.back(); return; }
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setSelected('');
  }
  const columns = prefs.columns?.length ? prefs.columns : current?.columns ?? allColumns;
  const partial = visible.some(s => !s.stats);
  const activePartial = visible.some(s => s.active === null);
  const total = (key: 'visitors' | 'pageviews') => visible.reduce((sum, s) => sum + (s.stats?.[key] ?? 0), 0);
  const noStats = visible.length > 0 && visible.every(s => !s.stats);
  const lastUpdate = current ? new Intl.DateTimeFormat('nl-NL', { timeZone: current.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(current.generatedAt)) : null;
  const activeUpdate = current && activeAt ? new Intl.DateTimeFormat('nl-NL', { timeZone: current.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(activeAt)) : null;
  function sortBy(key: SortKey) {
    setPrefs(p => ({ ...p, sort: key, direction: p.sort === key ? p.direction === 'asc' ? 'desc' : 'asc' : key === 'name' ? 'asc' : 'desc' }));
  }
  function togglePin(id: string) { setPrefs(p => ({ ...p, pinned: p.pinned?.includes(id) ? p.pinned.filter(pin => pin !== id) : [...p.pinned ?? [], id] })); }
  const sortHeader = (key: SortKey, label: string, help?: string) => <th scope="col" aria-sort={prefs.sort === key ? prefs.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="sort-header" onClick={() => sortBy(key)} title={`${help ? help + ' ' : ''}Klik om te sorteren.`}>{label}</button></th>;
  function toggleColumn(column: Column) {
    const next = columns.includes(column) ? columns.filter(c => c !== column) : allColumns.filter(c => c === column || columns.includes(c));
    if (next.length) setPrefs(p => ({ ...p, columns: next }));
  }
  const periods = <div className="periods" role="group" aria-label="Periode">{periodNames.map(([id, label]) => <button key={id} className={period === id ? 'selected' : ''} aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}</div>;
  const position = focused ? siblings.findIndex(s => s.id === focused.id) : -1;
  const step = (offset: number) => siblings[(position + offset + siblings.length) % siblings.length];
  return <div className={`app ${prefs.compact ? 'compact' : ''}`}>
    <header className="header"><div className="brand"><img className="brand-icon" src="/favicon.svg" alt="" width="48" height="48"/><div><div className="eyebrow">UMAMI / ANALYTICS</div><h1>{current?.title ?? 'Mijn overzicht'}</h1></div></div>
      <div className="header-actions"><span className="update" role="status">{busy ? 'Ophalen…' : paused ? `Gepauzeerd · ${lastUpdate ?? ''}` : lastUpdate ? `Bijgewerkt ${lastUpdate}` : 'Niet verbonden'}</span><button disabled={!current} aria-pressed={paused} onClick={() => { setPaused(!paused); if (paused) refresh(); }}>{paused ? 'Hervatten' : 'Pauzeren'}</button><button className="icon-button" disabled={busy} onClick={refresh} aria-label="Gegevens verversen" title="Ververs nu; maximaal één nieuwe opvraag per vijf seconden"><span aria-hidden="true">↻</span></button>{!selected && <button className={settings ? 'selected' : ''} aria-expanded={settings} onClick={() => setSettings(!settings)}>Weergave</button>}</div>
    </header>
    {current?.demo && <div className="demo-banner"><strong>Demomodus</strong><span>Voorbeeldgegevens · er is geen verbinding met jouw Umami.</span></div>}
    {error && <div className="error-banner" role="alert"><strong>Gegevens niet ververst</strong><span>{error} {current ? 'De laatst opgehaalde gegevens staan hieronder.' : ''}</span><button onClick={refresh} disabled={busy}>Opnieuw proberen</button></div>}
    {activeError && <div className="error-banner" role="alert"><strong>Actieve bezoekers niet ververst</strong><span>{activeError} Laatste opvraag: {activeUpdate ?? 'onbekend'}.</span></div>}
    {settings && !selected && <section className="settings" aria-label="Weergave aanpassen"><fieldset><legend>Zichtbare kolommen</legend>{allColumns.map(c => <label key={c}><input type="checkbox" checked={columns.includes(c)} disabled={columns.includes(c) && columns.length === 1} onChange={() => toggleColumn(c)}/>{columnNames[c]}</label>)}</fieldset><label><input type="checkbox" checked={prefs.compact ?? false} onChange={e => setPrefs(p => ({ ...p, compact: e.target.checked }))}/> Extra compact</label><button onClick={() => setPrefs({})}>Standaard herstellen</button></section>}
    {selected ? <main>
      <nav className="toolbar detail-toolbar" aria-label="Applicatienavigatie"><div className="detail-nav"><button className="back-button" onClick={closeDetails} title="Terug naar het overzicht (Esc)"><span aria-hidden="true">←</span> Alle applicaties</button>
        {focused && <div className="site-switch"><button className="icon-button" disabled={siblings.length < 2} onClick={() => switchSite(step(-1).id)} aria-label={`Vorige applicatie: ${step(-1).name}`} title={step(-1).name}><span aria-hidden="true">‹</span></button><label className="sr-only" htmlFor="site-switch">Applicatie</label><select id="site-switch" value={focused.id} onChange={e => switchSite(e.target.value)}>{siblings.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="icon-button" disabled={siblings.length < 2} onClick={() => switchSite(step(1).id)} aria-label={`Volgende applicatie: ${step(1).name}`} title={step(1).name}><span aria-hidden="true">›</span></button></div>}</div>
        {periods}</nav>
      {current && <Comparison current={current} previous={current.comparison} timezone={current.timezone}/>}
      {focused && current ? <SiteDetail site={focused} timezone={current.timezone} period={period} details={visibleDetails} detailError={detailError}/>
        : <div className="panel empty">{current ? 'Deze applicatie staat niet (meer) in dit overzicht.' : busy ? 'Applicatie ophalen…' : 'Verbind je Umami-omgeving om de details te laden.'}</div>}
    </main> : <main>
      <div className="toolbar">{periods}
        <div className="toolbar-tools"><div className="filters"><label className="sr-only" htmlFor="group">Groep</label><select id="group" value={group} onChange={e => setGroup(e.target.value)}><option value="">Alle groepen</option>{[...new Set(current?.sites.map(s => s.group))].map(g => <option key={g}>{g}</option>)}</select><label className="sr-only" htmlFor="search">Applicaties zoeken</label><input id="search" type="search" placeholder="Zoek een applicatie…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="sort-control" role="group" aria-label="Sortering"><label htmlFor="sort">Sorteren op</label><select id="sort" value={prefs.sort ?? 'default'} onChange={e => { const sort = e.target.value as SortKey; setPrefs(p => ({ ...p, sort, direction: sort === 'name' ? 'asc' : 'desc' })); }}>{Object.entries(sortNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button className="sort-direction" disabled={!prefs.sort || prefs.sort === 'default'} onClick={() => setPrefs(p => ({ ...p, direction: p.direction === 'asc' ? 'desc' : 'asc' }))} aria-label={prefs.direction === 'asc' ? 'Oplopend, klik voor aflopend' : 'Aflopend, klik voor oplopend'} title={prefs.sort && prefs.sort !== 'default' ? (prefs.direction === 'asc' ? 'Oplopend' : 'Aflopend') : 'Voorkeursvolgorde heeft geen richting'}><span aria-hidden="true">{prefs.direction === 'asc' ? '↑' : '↓'}</span></button></div></div>
      </div>
      <section className="summary-strip" aria-label="Samenvatting">
        <div className="total"><span>Nu actief <i className="live-dot"/></span><strong>{current && !visible.every(s => s.active === null) ? format(visible.reduce((sum, s) => sum + (s.active ?? 0), 0)) : '—'}</strong><small>{activePartial ? 'Gedeeltelijk beschikbaar' : 'Laatste 5 minuten'}</small></div>
        <div className="total"><span>Bezoekers</span><strong>{current && !noStats ? format(total('visitors')) : '—'}</strong><small>{partial ? 'Gedeeltelijk · ' : ''}Opgeteld per applicatie</small></div>
        <div className="total"><span>Pageviews</span><strong>{current && !noStats ? format(total('pageviews')) : '—'}</strong><small>{partial ? 'Gedeeltelijk · ' : ''}{visible.length} {visible.length === 1 ? 'applicatie' : 'applicaties'} in dit overzicht</small></div>
      </section>
      {current && <Comparison current={current} previous={current.comparison} timezone={current.timezone}/>}
      <section className="panel overview" aria-label="Applicatieoverzicht"><div className="panel-heading"><h2>Alle applicaties <span className="count">{visible.length}</span></h2><span className="muted">Klik op een applicatie voor details</span></div>
        {!current ? <div className="empty">{busy ? 'Applicaties en statistieken ophalen…' : 'Verbind je Umami-omgeving om het overzicht te laden.'}</div> : !visible.length ? <div className="empty">{current.sites.length ? 'Geen applicaties gevonden met deze filters.' : 'Geen applicaties beschikbaar. Controleer de rechten van de API-key en je applicatieselectie.'}</div> :
          <div className="table-scroll"><table><thead><tr>{sortHeader('name', 'Applicatie')}{columns.map(c => <React.Fragment key={c}>{c === 'trend' ? <th scope="col" title={metricHelp.trend}>{columnNames[c]}</th> : sortHeader(c, columnNames[c], metricHelp[c])}</React.Fragment>)}</tr></thead><tbody>{visible.map(site => <tr key={site.id} className={lastViewed === site.id ? 'focused-row' : ''}>
            <td><div className="application-cell"><button className={`pin-button ${prefs.pinned?.includes(site.id) ? 'pinned' : ''}`} aria-pressed={prefs.pinned?.includes(site.id) ?? false} aria-label={`${site.name} ${prefs.pinned?.includes(site.id) ? 'losmaken' : 'vastzetten'}`} onClick={() => togglePin(site.id)} title={prefs.pinned?.includes(site.id) ? 'Losmaken' : 'Vastzetten'}>★</button><a className="site-button" href={hashForSite(site.id)} data-site={site.id} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); openSite(site.id); }}><SiteIcon site={site}/><span className="site-name"><strong>{site.name}</strong><small>{site.domain}</small></span></a>{site.warnings.length > 0 && <span className="row-warning" title={site.warnings.join(' ')}>⚠ <span className="sr-only">{site.warnings.join(' ')}</span></span>}</div></td>
            {columns.map(c => <td key={c}><MetricCell site={site} column={c}/></td>)}</tr>)}</tbody></table></div>}
      </section>
      <details className="metric-help"><summary>Wat betekenen deze cijfers?</summary><dl>{([...allColumns, 'duration'] as const).map(key => <React.Fragment key={key}><dt>{key === 'duration' ? 'Gemiddelde bezoekduur' : columnNames[key]}</dt><dd>{metricHelp[key]}</dd></React.Fragment>)}</dl></details>
    </main>}
    <footer><span>{current?.demo ? 'Voorbeeldgegevens' : 'Gegevens uit Umami'} · {current?.timezone ?? 'Europe/Amsterdam'}</span><span>Bezoekersaantallen van verschillende applicaties zijn niet ontdubbeld.</span><span>{paused ? 'Automatische verversing gepauzeerd' : `Overzicht elke ${intervals.overview}s${period !== 'today' ? ` · actief elke ${intervals.active}s` : ''}`}{activeUpdate ? ` · actief bijgewerkt ${activeUpdate}` : ''}</span></footer>
  </div>;
}

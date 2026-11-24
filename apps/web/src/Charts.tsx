import React, { useId } from 'react';
import type { SiteRow, TimePoint } from '@dashboard/shared';
import { chartScale, sparkPaths, timePosition } from './chart-model';

const number = new Intl.NumberFormat('nl-NL');
export function Sparkline({ points, color }: { points: TimePoint[] | null; color: string }) {
  if (!points) return <span className="muted">Niet beschikbaar</span>;
  if (!points.length) return <span className="muted">Geen gegevens</span>;
  const unknown = points.some(p => p.y === null);
  const max = chartScale(points);
  return <svg className="sparkline" viewBox="-2 -2 124 32" role="img" aria-label={`Pageviews over de gekozen periode; eigen schaal 0–${number.format(max)}${unknown ? '; bevat onbekende tijdvakken' : ''}`}>
    <title>{`Eigen schaal: 0–${number.format(max)} pageviews. Onderbrekingen zijn onbekende tijdvakken.`}</title>
    {points.filter(p => p.y === null).map(p => <rect key={p.at} x={timePosition(p.at, points, 120)} y="0" width={Math.max(1, timePosition(p.endAt + 1, points, 120) - timePosition(p.at, points, 120))} height="28" fill="currentColor" opacity=".15"/>)}
    {sparkPaths(points, 120, 26).map((path, i) => <path key={i} d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>)}
    {points.filter(p => p.y !== null).map(p => <circle key={p.at} cx={timePosition((p.at + p.endAt + 1) / 2, points, 120)} cy={26 - p.y! / max * 26} r="1" fill={color}/>)}
  </svg>;
}
export function Chart({ site, timezone, period }: { site: SiteRow; timezone: string; period: 'today' | '7d' | '30d' }) {
  const patternId = useId().replace(/:/g, '');
  const points = site.trend;
  if (!points) return <div className="chart-empty">De trend is niet beschikbaar.</div>;
  if (!points.length) return <div className="chart-empty">Geen gegevens in deze periode.</div>;
  const max = chartScale(points);
  const height = 120;
  const width = 650;
  const left = 50;
  const top = 12;
  const unknown = points.filter(p => p.y === null).length;
  const timeFormat = new Intl.DateTimeFormat('nl-NL', { timeZone: timezone,
    ...(period === 'today' ? { hour: '2-digit', minute: '2-digit' } as const : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } as const) });
  const startAt = points[0].at;
  const endAt = points.at(-1)!.endAt;
  return <div className="chart-wrap"><svg className="chart" viewBox="0 0 720 175" role="img" aria-label={`Pageviews voor ${site.name}, schaal 0–${number.format(max)}${unknown ? `, ${unknown} onbekende tijdvakken` : ''}`}>
    <defs><pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5" stroke="var(--muted)" strokeWidth="1"/></pattern></defs>
    {[0, .5, 1].map(fraction => <g key={fraction}>
      <line x1={left} y1={top + height * (1 - fraction)} x2={left + width} y2={top + height * (1 - fraction)} stroke="var(--border)" strokeDasharray={fraction ? '3 5' : undefined}/>
      <text x={left - 9} y={top + height * (1 - fraction) + 4} textAnchor="end" className="axis-label">{number.format(max * fraction)}</text>
    </g>)}
    {points.map(p => {
      const x = left + timePosition(p.at, points, width);
      const barWidth = Math.max(.5, timePosition(p.endAt + 1, points, width) - timePosition(p.at, points, width) - 2);
      const label = `${p.label}: ${p.y === null ? 'onbekend' : `${number.format(p.y)} pageviews`}`;
      return <rect key={p.at} x={x} y={p.y === null ? top : top + height - p.y / max * height}
        width={barWidth} height={p.y === null ? height : p.y === 0 ? 1 : p.y / max * height}
        rx="1" fill={p.y === null ? `url(#${patternId})` : site.color} opacity={p.y === 0 ? .45 : .85}
        tabIndex={0} role="img" aria-label={label}><title>{label}</title></rect>;
    })}
    {[startAt, (startAt + endAt) / 2, endAt].map((at, i) => <text key={i} x={left + i * width / 2} y="158" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="axis-label">{timeFormat.format(at)}</text>)}
  </svg><p className="chart-note">{timezone} · 0 = geen pageviews · gearceerd = onbekend{period !== 'today' ? ' · eerste en laatste dag kunnen gedeeltelijk zijn' : ' · het laatste uur loopt nog'}</p>
    <details className="chart-data"><summary>Exacte waarden bekijken</summary><div className="chart-data-scroll"><table><caption className="sr-only">Pageviews per tijdvak voor {site.name}</caption><thead><tr><th scope="col">Tijdvak ({timezone})</th><th scope="col">Pageviews</th></tr></thead><tbody>{points.map(p => <tr key={p.at}><th scope="row">{p.label}</th><td>{p.y === null ? 'Onbekend' : number.format(p.y)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

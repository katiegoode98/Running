import { useState } from 'react';
import { Card } from './ui';
import { useStore } from '../store';
import { formatDate, today } from '../lib/dates';
import { fmtDist, fmtMinutes } from '../lib/format';
import { KIND_LABEL, recentWeeks, type WeekSummary } from '../lib/training';
import type { ClassCategory } from '../types';

const WEEKS = 8;
const CHART_H = 120;
const BAR_W = 22; // ≤ 24px marks, leftover band width is air
const GAP = 2; // surface gap between stacked segments

function sessionsText(w: WeekSummary): string {
  const parts = (Object.entries(w.sessions) as [ClassCategory, number][]).map(([k, n]) => `${n} ${KIND_LABEL[k].toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'no classes';
}

/** Stacked weekly training time (running vs gym/classes) for the last 8 weeks, plus this week's totals. */
export function TrainingSummary({ compact = false }: { compact?: boolean }) {
  const { state } = useStore();
  const units = state.profile?.units ?? 'km';
  const weeks = recentWeeks(today(), WEEKS, state.logs, state.activities);
  const current = weeks[weeks.length - 1];
  const [active, setActive] = useState<number | null>(null);
  const shown = weeks[active ?? weeks.length - 1];

  const thisWeek = (
    <div className="paces stats">
      <div><span className="muted small">Runs</span><strong>{current.runs} · {fmtDist(current.runKm, units)}</strong></div>
      <div><span className="muted small">Gym & classes</span><strong>{current.sessionCount}</strong></div>
      <div><span className="muted small">Training time</span><strong>{current.totalMin ? fmtMinutes(current.totalMin) : '—'}</strong></div>
      <div><span className="muted small">Load (min × effort)</span><strong>{current.load || '—'}</strong></div>
    </div>
  );
  if (compact) return <Card title="This week so far">{thisWeek}</Card>;

  const max = Math.max(60, ...weeks.map((w) => w.totalMin));
  const band = 300 / WEEKS;
  const y = (min: number) => (min / max) * CHART_H;

  return (
    <Card title="Weekly training">
      {thisWeek}
      <div className="legend small">
        <span><i className="swatch run" /> Running</span>
        <span><i className="swatch other" /> Gym & classes</span>
      </div>
      <p className="small chart-readout" aria-live="polite">
        <strong>{active === null ? 'This week' : `Week of ${formatDate(shown.weekStart, { day: 'numeric', month: 'short' })}`}:</strong>{' '}
        {fmtMinutes(shown.runMin || 0)} running ({fmtDist(shown.runKm, units)}) · {fmtMinutes(shown.otherMin || 0)} gym & classes ({sessionsText(shown)}) · load {shown.load}
      </p>
      <svg viewBox={`0 0 300 ${CHART_H + 18}`} className="load-chart" role="img" aria-label="Weekly training minutes for the last 8 weeks, running and gym/classes stacked">
        <line x1="0" x2="300" y1={CHART_H} y2={CHART_H} className="baseline" />
        {weeks.map((w, i) => {
          const x = i * band + (band - BAR_W) / 2;
          const runH = y(w.runMin);
          const otherH = y(w.otherMin);
          const hasBoth = runH > 0 && otherH > 0;
          const topOfRun = CHART_H - runH;
          const otherBottom = topOfRun - (hasBoth ? GAP : 0);
          // Only the topmost segment gets the 4px rounded data-end; the baseline stays square.
          const roundRun = otherH === 0;
          return (
            <g key={w.weekStart} className={active === i ? 'bar active' : 'bar'}>
              {runH > 0 && <path d={barPath(x, topOfRun, BAR_W, runH, roundRun ? 4 : 0)} className="seg run" />}
              {otherH > 0 && <path d={barPath(x, otherBottom - otherH, BAR_W, otherH, 4)} className="seg other" />}
              <text x={x + BAR_W / 2} y={CHART_H + 13} className="axis" textAnchor="middle">{formatDate(w.weekStart, { day: 'numeric', month: 'numeric' })}</text>
              {/* Hit target larger than the mark: the full band height and width. */}
              <rect
                x={i * band}
                y={0}
                width={band}
                height={CHART_H + 18}
                className="hit"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive(active === i ? null : i)}
              />
            </g>
          );
        })}
      </svg>
      <details className="small">
        <summary className="muted">Table view</summary>
        <table>
          <thead><tr><th>Week of</th><th>Runs</th><th>Gym & classes</th><th>Time</th><th>Load</th></tr></thead>
          <tbody>
            {[...weeks].reverse().map((w) => (
              <tr key={w.weekStart}>
                <td>{formatDate(w.weekStart, { day: 'numeric', month: 'short' })}</td>
                <td>{w.runs} · {fmtDist(w.runKm, units)}</td>
                <td>{sessionsText(w)}</td>
                <td>{w.totalMin ? fmtMinutes(w.totalMin) : '—'}</td>
                <td>{w.load}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

/** A bar with optional rounded top corners and a square base. */
function barPath(x: number, top: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  const bottom = top + h;
  return `M${x},${bottom} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + w - rr} Q${x + w},${top} ${x + w},${top + rr} V${bottom} Z`;
}

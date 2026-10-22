import { useState } from 'react';
import { Card, Empty } from '../components/ui';
import { useStore } from '../store';
import { formatDate, mondayOf, addDays, today } from '../lib/dates';
import { fmtDist } from '../lib/format';
import { fitToDistance, gettingThere, kmFromHome, NYC_ROUTES, type NycRoute, type Terrain } from '../lib/nycRoutes';
import { activitiesOf, dayFor, isDone, isRun } from '../lib/schedule';

const M_PER_FT = 0.3048;

function fmtGain(m: number, units: 'km' | 'mi'): string {
  return units === 'mi' ? `${Math.round(m / M_PER_FT)} ft` : `${Math.round(m)} m`;
}

const TERRAIN_LABEL: Record<Terrain, string> = { flat: 'Flat', rolling: 'Rolling', hilly: 'Hills' };
const SHAPE_LABEL = { loop: 'Loop', 'out-and-back': 'Out & back', 'one-way': 'One way' } as const;

export function RoutesView() {
  const { state } = useStore();
  const units = state.profile?.units ?? 'km';
  const home = state.geo.home;
  const [terrain, setTerrain] = useState<Terrain | 'all'>('all');
  const [area, setArea] = useState<NycRoute['area'] | 'all'>('all');
  const [runId, setRunId] = useState('');

  // Upcoming runs this week and next, to size routes to a planned distance.
  const from = mondayOf(today());
  const upcoming = (state.plan?.weeks ?? [])
    .filter((w) => w.startDate >= from && w.startDate < addDays(from, 14))
    .flatMap(activitiesOf)
    .filter((w) => isRun(w) && w.distanceKm < 40 && !isDone(w, state.logs, state.activities));
  const run = upcoming.find((w) => w.id === runId);

  const routes = NYC_ROUTES
    .filter((r) => terrain === 'all' || r.terrain === terrain)
    .filter((r) => area === 'all' || r.area === area)
    .filter((r) => !run || (run.type === 'long' ? r.uses.includes('long') : /hill/i.test(run.title) ? r.uses.includes('hills') : run.type === 'easy' || run.type === 'recovery' ? r.uses.some((u) => u === 'easy' || u === 'recovery') : r.uses.includes('tempo') || r.terrain === 'flat'))
    .sort((a, b) => (kmFromHome(a, home) ?? 0) - (kmFromHome(b, home) ?? 0));

  const chip = <T extends string>(value: T, current: T, set: (v: T) => void, label: string) => (
    <button key={value} className={`chip ${current === value ? 'active' : ''}`} onClick={() => set(value)}>{label}</button>
  );

  return (
    <div className="stack">
      <Card title="NYC running routes">
        <p className="muted small">
          Distances and elevation gain from park and route guides. Elevation varies between GPS sources, so where they disagree the range is shown.
          {home ? ' Sorted by distance from home.' : ' Add your home address in Profile to sort by distance and see how to get there.'}
        </p>
        {upcoming.length > 0 && (
          <label className="field">
            <span>Size routes for a planned run</span>
            <select value={runId} onChange={(e) => setRunId(e.target.value)}>
              <option value="">Any run</option>
              {upcoming.map((w) => (
                <option key={w.id} value={w.id}>{w.title} · {fmtDist(w.distanceKm, units)}{dayFor(w) ? ` · ${formatDate(dayFor(w)!)}` : ''}</option>
              ))}
            </select>
          </label>
        )}
        <div className="row">
          {chip('all', terrain, setTerrain, 'All terrain')}
          {chip('flat', terrain, setTerrain, 'Flat')}
          {chip('rolling', terrain, setTerrain, 'Rolling')}
          {chip('hilly', terrain, setTerrain, 'Hills')}
        </div>
        <div className="row">
          {chip('all', area, setArea, 'Everywhere')}
          {chip('Manhattan', area, setArea, 'Manhattan')}
          {chip('Brooklyn', area, setArea, 'Brooklyn')}
          {chip('Islands', area, setArea, 'Islands')}
        </div>
      </Card>

      {routes.length === 0 && <Empty>No routes match those filters{run ? ` for your ${run.title.toLowerCase()}` : ''} — try “All terrain” or “Everywhere”.</Empty>}
      {routes.map((r) => {
        const there = gettingThere(r, home);
        const origin = state.profile?.homeAddress?.trim();
        const maps = `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', ...(origin ? { origin } : {}), destination: r.start, travelmode: 'walking' })}`;
        return (
          <Card key={r.id} title={r.name} actions={<span className={`pill terrain-${r.terrain}`}>{TERRAIN_LABEL[r.terrain]}</span>}>
            <div className="route-stats">
              <div><span className="muted small">{SHAPE_LABEL[r.shape]}</span><strong>{fmtDist(r.km, units)}</strong></div>
              <div>
                <span className="muted small">Elevation gain</span>
                <strong>+{fmtGain(r.gainM, units)}</strong>
                {r.gainRange && <span className="muted small">sources: {fmtGain(r.gainRange[0], units)}–{fmtGain(r.gainRange[1], units)}</span>}
              </div>
              <div><span className="muted small">Area</span><strong>{r.area}</strong></div>
            </div>
            <p className="small">{r.summary}</p>
            {run && <p className="note small">For your {run.title.toLowerCase()} ({fmtDist(run.distanceKm, units)}): {fitToDistance(r, run.distanceKm, home, (k) => fmtDist(k, units))}</p>}
            {there && <p className="small muted">📍 {there}</p>}
            <p className="small muted">💡 {r.tips}</p>
            <p className="small muted">Surface: {r.surface}</p>
            <div className="row small">
              <a href={maps} target="_blank" rel="noreferrer">Directions to start ↗</a>
              <a href={r.source.url} target="_blank" rel="noreferrer">{r.source.label} ↗</a>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

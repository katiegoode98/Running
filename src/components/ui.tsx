import { useState, type ReactNode } from 'react';
import type { Workout, WorkoutType } from '../types';
import { formatDate } from '../lib/dates';
import { fmtDist, fmtMinutes, fmtPace } from '../lib/format';
import { runMinutes } from '../lib/plan';
import { isLowerManhattan, routeOptions, WATER_NOTE } from '../lib/routes';
import { NYC_2027 } from '../lib/presets';
import { useStore } from '../store';

export function Card({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

const TYPE_LABEL: Record<WorkoutType, string> = {
  easy: 'Easy',
  recovery: 'Recovery',
  long: 'Long',
  tempo: 'Tempo',
  intervals: 'Intervals',
  'marathon-pace': 'MP',
  race: 'Race',
  rest: 'Rest',
};

export function TypeBadge({ type }: { type: WorkoutType }) {
  return <span className={`badge t-${type}`}>{TYPE_LABEL[type]}</span>;
}

export function WorkoutLine({ w, done }: { w: Workout; done?: number }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const units = state.profile?.units ?? 'km';
  const tappable = w.type !== 'rest' && w.type !== 'race' && w.distanceKm > 0;
  const toggle = () => tappable && setOpen((o) => !o);
  return (
    <>
      <div
        className={`workout ${w.type === 'rest' ? 'rest' : ''} ${tappable ? 'tappable' : ''} ${open ? 'open' : ''}`}
        role={tappable ? 'button' : undefined}
        tabIndex={tappable ? 0 : undefined}
        aria-expanded={tappable ? open : undefined}
        onClick={toggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
      >
        <div className="workout-date">{formatDate(w.date)}</div>
        <TypeBadge type={w.type} />
        <div className="workout-body">
          <strong>{w.title}</strong>
          {w.distanceKm > 0 && (
            <span className="muted">
              {' '}· {fmtDist(w.distanceKm, units)}{w.paceSecPerKm ? ` @ ${fmtPace(w.paceSecPerKm, units)}` : ''}
              {state.plan && <> · <span className="duration">~{fmtMinutes(runMinutes(w, state.plan.paces))}</span></>}
            </span>
          )}
          {w.movedFrom && <span className="pill">moved from {formatDate(w.movedFrom)}</span>}
          {done !== undefined && done > 0 && <span className="pill ok">✓ {fmtDist(done, units)}</span>}
          <div className="muted small">{w.description}</div>
          {tappable && <div className="route-hint small">{open ? '▴ Hide routes' : '▾ Route options'}</div>}
        </div>
      </div>
      {open && <RouteOptions w={w} />}
    </>
  );
}

function RouteOptions({ w }: { w: Workout }) {
  const { state } = useStore();
  const profile = state.profile;
  const home = state.geo.home;
  const units = profile?.units ?? 'km';
  // Lower-Manhattan routes for a home there, or for an NYC runner whose address couldn't be mapped yet.
  const nyc = isLowerManhattan(home) || (!home && profile?.raceDate === NYC_2027.raceDate);
  const options = routeOptions(w, { home, homeAddress: profile?.homeAddress ?? '', nyc });
  return (
    <div className="route-options">
      {options.map((r) => (
        <div key={r.title} className="route-option">
          <div className="row spread">
            <strong>{r.title}</strong>
            <span className="muted small">≈ {fmtDist(r.km, units)}</span>
          </div>
          <div className="row">{r.tags.map((t) => <span key={t} className="pill tag">{t}</span>)}</div>
          <p className="small muted">{r.detail}</p>
          <a className="small" href={r.mapsUrl} target="_blank" rel="noreferrer">Open in Maps ↗</a>
        </div>
      ))}
      {nyc && w.distanceKm >= 12 && <p className="small muted">💧 {WATER_NOTE}</p>}
      <p className="small muted">Distances are estimates — Maps shows the exact route{profile?.homeAddress ? ' from your home' : ''}.</p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

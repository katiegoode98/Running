import type { ReactNode } from 'react';
import type { Workout, WorkoutType } from '../types';
import { fmtDist } from '../lib/format';
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
  strength: 'Gym',
  rest: 'Rest',
};

export function TypeBadge({ type }: { type: WorkoutType }) {
  return <span className={`badge t-${type}`}>{TYPE_LABEL[type]}</span>;
}

export function StrengthDetails({ w }: { w: Workout }) {
  const { state } = useStore();
  const s = w.strength!;
  // Suggest where: a Life Time club if they have one, otherwise their first gym.
  const gym = state.gyms.find((g) => /life ?time/i.test(g.name)) ?? state.gyms[0];
  return (
    <div className="route-options strength">
      {gym && <p className="small"><strong>Where:</strong> {gym.name} (gym floor)</p>}
      <p className="small"><strong>Warm-up:</strong> {s.warmUp}</p>
      <ol className="exercises">
        {s.exercises.map((e) => (
          <li key={e.name}>
            <div className="row spread"><strong>{e.name}</strong><span className="sets">{e.sets} × {e.reps}</span></div>
            {e.load && <div className="small">{e.load}</div>}
            {e.cue && <div className="small muted">{e.cue}</div>}
          </li>
        ))}
      </ol>
      <p className="small muted">{s.notes}</p>
      <p className="small muted">RPE = effort out of 10. RPE 7 means you could do 2–3 more reps. Rest 90 s between sets (2–3 min for heavy sets of 5).</p>
    </div>
  );
}

export function RouteOptions({ w }: { w: Workout }) {
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

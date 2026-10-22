import type { ReactNode } from 'react';
import type { Workout, WorkoutType } from '../types';
import { formatDate } from '../lib/dates';
import { fmtDist, fmtMinutes, fmtPace } from '../lib/format';
import { runMinutes } from '../lib/plan';
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
  const units = state.profile?.units ?? 'km';
  return (
    <div className={`workout ${w.type === 'rest' ? 'rest' : ''}`}>
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
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

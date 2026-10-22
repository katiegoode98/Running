import { useState } from 'react';
import type { PlanWeek, Workout } from '../types';
import { useStore, type AppState } from '../store';
import { addDays, DAY_SHORT, dayOfWeek, formatDate, today } from '../lib/dates';
import { fmtDist, fmtMinutes, fmtPace, uid } from '../lib/format';
import { runMinutes } from '../lib/plan';
import { activitiesOf, dayFor, defaultRpe, isDone, isRun, scheduleWarnings } from '../lib/schedule';
import { RouteOptions, StrengthDetails, TypeBadge } from './ui';

/** Updates one workout in the plan. */
function patchWorkout(s: AppState, id: string, patch: Partial<Workout>): Partial<AppState> {
  if (!s.plan) return {};
  return { plan: { ...s.plan, weeks: s.plan.weeks.map((w) => ({ ...w, workouts: w.workouts.map((x) => (x.id === id ? { ...x, ...patch } : x)) })) } };
}

/** Tick / untick and day assignment for planned activities. */
export function useChecklist() {
  const { state, update } = useStore();

  const assign = (w: Workout, date: string | undefined) => update((s) => patchWorkout(s, w.id, { scheduled: date }));

  function tick(w: Workout, weekStart: string) {
    const t = today();
    const inWeek = t >= weekStart && t < addDays(weekStart, 7);
    const date = dayFor(w) ?? (inWeek ? t : w.date);
    update((s) => {
      const planPatch = patchWorkout(s, w.id, { scheduled: w.type === 'race' ? undefined : date, done: w.type === 'race' ? true : undefined });
      const paces = s.plan!.paces;
      if (w.type === 'strength') {
        const gym = s.gyms.find((g) => /life ?time/i.test(g.name)) ?? s.gyms[0];
        const log = { id: uid(), date, kind: 'strength' as const, name: w.strength?.title ?? w.title, gymId: gym?.id, plannedId: w.id, durationMin: w.strength?.durationMin ?? 45, rpe: defaultRpe(w), notes: '', source: 'tick' as const };
        return { ...planPatch, activities: [...s.activities, log] };
      }
      if (isRun(w) && w.type !== 'race') {
        const log = { id: uid(), date, workoutId: w.id, distanceKm: w.distanceKm, durationSec: Math.round(runMinutes(w, paces) * 60), rpe: defaultRpe(w), notes: '', source: 'tick' as const };
        return { ...planPatch, logs: [...s.logs, log] };
      }
      return planPatch;
    });
  }

  function untick(w: Workout) {
    const real = w.type === 'strength'
      ? state.activities.filter((a) => a.plannedId === w.id && a.source !== 'tick')
      : state.logs.filter((l) => l.workoutId === w.id && l.source !== 'tick');
    if (real.length && !confirm('This has a logged activity (from the Log tab or your Garmin). Untick it and delete that log too?')) return;
    update((s) => ({
      ...patchWorkout(s, w.id, { done: undefined }),
      logs: s.logs.filter((l) => l.workoutId !== w.id),
      activities: s.activities.filter((a) => a.plannedId !== w.id),
    }));
  }

  return { assign, tick, untick };
}

export function ChecklistItem({ w, week, warnings = [], showDoToday = false }: { w: Workout; week: PlanWeek; warnings?: string[]; showDoToday?: boolean }) {
  const { state } = useStore();
  const { assign, tick, untick } = useChecklist();
  const [open, setOpen] = useState(false);
  const units = state.profile?.units ?? 'km';
  const done = isDone(w, state.logs, state.activities);
  const day = dayFor(w);
  const isGym = w.type === 'strength' && !!w.strength;
  const expandable = isGym || (isRun(w) && w.type !== 'race');
  const minutes = state.plan ? runMinutes(w, state.plan.paces) : 0;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.startDate, i));
  const t = today();

  return (
    <div className={`check-item ${done ? 'done' : ''}`}>
      <div className="check-row">
        <input
          type="checkbox"
          className="tick"
          checked={done}
          aria-label={`${done ? 'Untick' : 'Tick off'} ${w.title}`}
          onChange={() => (done ? untick(w) : tick(w, week.startDate))}
        />
        <div className="check-body" onClick={() => expandable && setOpen(!open)} role={expandable ? 'button' : undefined}>
          <div className="row"><TypeBadge type={w.type} /><strong>{w.title}</strong></div>
          <div className="small muted">
            {isRun(w) && <>{fmtDist(w.distanceKm, units)}{w.paceSecPerKm ? ` @ ${fmtPace(w.paceSecPerKm, units)}` : ''} · </>}
            <span className="duration">~{fmtMinutes(minutes)}</span>
          </div>
        </div>
        <select
          className={`day-select ${day ? 'set' : ''}`}
          value={day ?? ''}
          disabled={w.type === 'race'}
          aria-label={`Day for ${w.title}`}
          onChange={(e) => assign(w, e.target.value || undefined)}
        >
          <option value="">Pick a day</option>
          {days.map((d) => (
            <option key={d} value={d}>{DAY_SHORT[dayOfWeek(d)]} {formatDate(d, { day: 'numeric' })}{d === w.date ? ' ★' : ''}{d === t ? ' (today)' : ''}</option>
          ))}
        </select>
      </div>
      <div className="check-detail small muted">{w.description}</div>
      {!day && !done && <div className="check-detail small muted">★ Suggested: {DAY_SHORT[dayOfWeek(w.date)]}</div>}
      {warnings.map((m) => <div key={m} className="check-detail small warn">⚠ {m}</div>)}
      <div className="row check-detail">
        {expandable && <button className="link small" onClick={() => setOpen(!open)}>{open ? '▴ Hide' : isGym ? '▾ Show exercises' : '▾ Route options'}</button>}
        {showDoToday && !done && day !== t && w.type !== 'race' && <button className="link small" onClick={() => assign(w, t)}>Do today</button>}
      </div>
      {open && (isGym ? <StrengthDetails w={w} /> : <RouteOptions w={w} />)}
    </div>
  );
}

/** A week as a checklist: every activity to do, with a day picker and a tick box. */
export function WeekChecklist({ week, filter, showDoToday = false }: { week: PlanWeek; filter?: (w: Workout) => boolean; showDoToday?: boolean }) {
  const warnings = scheduleWarnings(week);
  const items = activitiesOf(week).filter(filter ?? (() => true));
  return (
    <div className="checklist">
      {items.map((w) => <ChecklistItem key={w.id} w={w} week={week} warnings={warnings.get(w.id)} showDoToday={showDoToday} />)}
    </div>
  );
}

export function weekProgress(week: PlanWeek, state: Pick<AppState, 'logs' | 'activities'>): { done: number; total: number } {
  const items = activitiesOf(week);
  return { done: items.filter((w) => isDone(w, state.logs, state.activities)).length, total: items.length };
}

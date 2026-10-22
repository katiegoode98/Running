import { useState } from 'react';
import { Card, Empty } from '../components/ui';
import { WeekChecklist, weekProgress } from '../components/WeekChecklist';
import { useBusyEvents } from './CalendarView';
import { useStore } from '../store';
import { addDays, formatDate, mondayOf, today } from '../lib/dates';
import { fmtDist, fmtMinutes, fmtPace } from '../lib/format';
import { runMinutes, weekActualKm, weekLabel } from '../lib/plan';
import { StarterWeekOffer } from '../components/StarterWeekOffer';
import { workoutsToIcs } from '../lib/calendar';
import { googleConnected, pushWorkoutsToGoogle } from '../lib/google';
import type { Paces, Phase, Plan, PlanWeek, Workout } from '../types';
import { activitiesOf, dayFor, isDone, suggestDays } from '../lib/schedule';

const PHASE_INFO: Record<Phase, string> = {
  foundation: 'Foundation: steady volume, strength work and tune-up races. Long runs stay at half-marathon distance until the marathon block starts.',
  base: 'Base: build aerobic volume and consistency, hills for strength.',
  build: 'Build: threshold and VO₂max sessions raise your ceiling.',
  peak: 'Peak: marathon-specific work and the longest long runs.',
  taper: 'Taper: volume drops so you arrive fresh — trust the training.',
};

export function workoutLabel(w: Workout, units: 'km' | 'mi', paces?: Paces): string {
  if (w.type === 'strength') return `🏋️ ${w.title}${w.strength ? ` (~${w.strength.durationMin} min)` : ''}`;
  if (w.distanceKm <= 0) return `🏃 ${w.title}`;
  const time = paces ? ` (~${fmtMinutes(runMinutes(w, paces))})` : '';
  return `🏃 ${w.title} – ${fmtDist(w.distanceKm, units)}${time}`;
}

/** Assigned activities on or after a date, dated to the day the runner chose (for calendar exports). */
function assignedWorkouts(plan: Plan, from: string): Workout[] {
  return plan.weeks.flatMap((w) => w.workouts).flatMap((w) => {
    const d = dayFor(w);
    return d && d >= from ? [{ ...w, date: d }] : [];
  });
}

export function PlanView() {
  const { state, update } = useStore();
  const busy = useBusyEvents();
  const { plan, profile, logs } = state;
  const [showPast, setShowPast] = useState(false);
  const [msg, setMsg] = useState('');
  if (!plan || !profile) return <Empty>Create your profile to generate a plan.</Empty>;

  const thisMonday = mondayOf(today());
  const weeks = plan.weeks.filter((w) => showPast || w.startDate >= thisMonday);
  const u = profile.units;

  // Fills unassigned activities with the plan's suggested days, moved around calendar clashes.
  function applySuggested(week: PlanWeek) {
    const next = suggestDays(week, busy, plan!.paces).week;
    update((s) => ({ plan: s.plan && { ...s.plan, weeks: s.plan.weeks.map((x) => (x.startDate === week.startDate ? next : x)) } }));
  }
  function clearDays(week: PlanWeek) {
    update((s) => ({ plan: s.plan && { ...s.plan, weeks: s.plan.weeks.map((x) => (x.startDate === week.startDate ? { ...x, workouts: x.workouts.map((y) => ({ ...y, scheduled: undefined })) } : x)) } }));
  }

  function downloadIcs() {
    const workouts = assignedWorkouts(plan!, today());
    const blob = new Blob([workoutsToIcs(workouts, (w) => workoutLabel(w, u, plan!.paces))], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'marathon-training.ics';
    a.click();
  }

  async function pushGoogle() {
    if (!googleConnected()) return setMsg('Connect Google Calendar on the Calendar tab first.');
    const until = addDays(today(), 28);
    const workouts = assignedWorkouts(plan!, today()).filter((w) => w.date < until);
    if (!confirm(`Add ${workouts.filter((w) => w.type !== 'rest').length} workouts (next 4 weeks) to your Google Calendar?`)) return;
    try {
      const n = await pushWorkoutsToGoogle(workouts, (w) => workoutLabel(w, u, plan!.paces));
      setMsg(`Added ${n} workouts to Google Calendar.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="stack">
      <StarterWeekOffer />
      <Card
        title="Training paces"
        actions={
          <>
            <button onClick={downloadIcs} title="Import into Apple Calendar, Outlook or Google">Export .ics</button>
            <button onClick={pushGoogle}>Add next 4 weeks to Google</button>
          </>
        }
      >
        <div className="paces">
          {(['recovery', 'easy', 'long', 'marathon', 'tempo', 'interval'] as const).map((k) => (
            <div key={k}><span className="muted small">{k}</span><strong>{fmtPace(plan.paces[k], u)}</strong></div>
          ))}
        </div>
        {msg && <p className="muted">{msg}</p>}
      </Card>
      <label className="check"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past weeks</label>
      {weeks.map((w) => {
        const actual = weekActualKm(w, logs);
        const progress = weekProgress(w, state);
        const items = activitiesOf(w).filter((x) => x.type !== 'race');
        const unassigned = items.filter((x) => !x.scheduled && !isDone(x, logs, state.activities)).length;
        const assigned = items.filter((x) => x.scheduled).length;
        return (
          <Card
            key={w.startDate}
            title={<>{weekLabel(plan, w)} · {formatDate(w.startDate, { day: 'numeric', month: 'short' })} {!w.intro && <span className={`phase p-${w.phase}`}>{w.phase}</span>}{w.cutback && !w.intro && <span className="pill">cutback</span>}</>}
            actions={<span className={`pill ${progress.done === progress.total ? 'ok' : ''}`}>{progress.done}/{progress.total} done</span>}
          >
            <p className="muted small week-totals">
              {w.startDate <= today() ? `${fmtDist(actual, u, 0)} of ` : ''}{fmtDist(w.targetKm, u, 0)} · ~{fmtMinutes(w.workouts.reduce((s, x) => s + runMinutes(x, plan.paces), 0))}
            </p>
            {plan.weeks.find((x) => x.phase === w.phase && !x.intro) === w && <p className="muted small">{PHASE_INFO[w.phase]}</p>}
            {w.adaptationNote && <p className="note">↻ {w.adaptationNote}</p>}
            <WeekChecklist week={w} />
            <div className="row">
              {unassigned > 0 && <button className="small" onClick={() => applySuggested(w)}>Use suggested days ({unassigned})</button>}
              {assigned > 0 && <button className="link small" onClick={() => clearDays(w)}>Clear days</button>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

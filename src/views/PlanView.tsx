import { Fragment, useState } from 'react';
import { Card, Empty, WorkoutLine } from '../components/ui';
import { useStore } from '../store';
import { addDays, formatDate, mondayOf, today } from '../lib/dates';
import { fmtDist, fmtMinutes, fmtPace } from '../lib/format';
import { runMinutes, weekActualKm } from '../lib/plan';
import { workoutsToIcs } from '../lib/calendar';
import { googleConnected, pushWorkoutsToGoogle } from '../lib/google';
import type { Paces, Phase, Workout } from '../types';

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

export function PlanView() {
  const { state } = useStore();
  const { plan, profile, logs } = state;
  const [showPast, setShowPast] = useState(false);
  const [msg, setMsg] = useState('');
  if (!plan || !profile) return <Empty>Create your profile to generate a plan.</Empty>;

  const thisMonday = mondayOf(today());
  const weeks = plan.weeks.filter((w) => showPast || w.startDate >= thisMonday);
  const u = profile.units;
  const doneOn = (date: string) => logs.filter((l) => l.date === date).reduce((s, l) => s + l.distanceKm, 0);

  function downloadIcs() {
    const workouts = plan!.weeks.flatMap((w) => w.workouts).filter((w) => w.date >= today());
    const blob = new Blob([workoutsToIcs(workouts, (w) => workoutLabel(w, u, plan!.paces))], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'marathon-training.ics';
    a.click();
  }

  async function pushGoogle() {
    if (!googleConnected()) return setMsg('Connect Google Calendar on the Calendar tab first.');
    const until = addDays(today(), 28);
    const workouts = plan!.weeks.flatMap((w) => w.workouts).filter((w) => w.date >= today() && w.date < until);
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
        return (
          <Card
            key={w.startDate}
            title={<>Week {w.index + 1} · {formatDate(w.startDate, { day: 'numeric', month: 'short' })} <span className={`phase p-${w.phase}`}>{w.phase}</span>{w.cutback && <span className="pill">cutback</span>}</>}
            actions={
              <span className="muted">
                {w.startDate <= today() ? `${fmtDist(actual, u, 0)} / ` : ''}{fmtDist(w.targetKm, u, 0)}
                {' '}· ~{fmtMinutes(w.workouts.reduce((s, x) => s + runMinutes(x, plan.paces), 0))}
              </span>
            }
          >
            {w.index === plan.weeks.findIndex((x) => x.phase === w.phase) && <p className="muted small">{PHASE_INFO[w.phase]}</p>}
            {w.adaptationNote && <p className="note">↻ {w.adaptationNote}</p>}
            {w.workouts.map((x) => (
              <Fragment key={x.id}>
                <WorkoutLine w={x} done={doneOn(x.date)} />
              </Fragment>
            ))}
          </Card>
        );
      })}
    </div>
  );
}

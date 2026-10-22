import { Card, Empty, WorkoutLine } from '../components/ui';
import { useStore } from '../store';
import { daysBetween, mondayOf, today } from '../lib/dates';
import { fmtDist } from '../lib/format';
import { runMinutes, weekActualKm, workoutOn } from '../lib/plan';
import { dailyTargets } from '../lib/nutrition';
import { nextAction } from '../lib/races';
import { audioAdvice } from '../lib/media';
import { AdaptCard, classLog } from './LogView';
import { TrainingSummary } from '../components/TrainingSummary';

export function TodayView({ onLog }: { onLog?: () => void }) {
  const { state, update } = useStore();
  const { plan, profile, logs } = state;
  if (!plan || !profile) return <Empty>Create your profile to get started.</Empty>;
  const t = today();
  const daysToRace = daysBetween(t, profile.raceDate);
  const week = plan.weeks.find((w) => w.startDate === mondayOf(t));
  const todays = workoutOn(plan, t);
  const minutes = todays ? runMinutes(todays, plan.paces) : 0;
  const gymDone = !!todays && todays.type === 'strength' && state.activities.some((a) => a.plannedId === todays.id || (a.date === t && a.kind === 'strength'));
  const logGym = () => {
    if (!todays?.strength) return;
    const gym = state.gyms.find((g) => /life ?time/i.test(g.name)) ?? state.gyms[0];
    update((s) => ({ activities: [...s.activities, classLog({ date: t, kind: 'strength', name: todays.strength!.title, gymId: gym?.id, plannedId: todays.id, durationMin: todays.strength!.durationMin })] }));
  };
  const targets = dailyTargets(profile, todays, minutes, daysToRace);
  const actions = state.races.map((r) => nextAction(r, t)).filter((a) => a.urgency === 'urgent' || a.urgency === 'overdue' || a.urgency === 'soon');
  const u = profile.units;

  return (
    <div className="stack">
      <div className="hero">
        <div>
          <div className="muted">{profile.raceName || 'Marathon'}</div>
          <div className="big">{daysToRace} days to go</div>
        </div>
        {week && <div className="muted">Week {week.index + 1} of {plan.weeks.length} · {week.phase} · {fmtDist(weekActualKm(week, logs), u, 0)} of {fmtDist(week.targetKm, u, 0)}</div>}
      </div>

      <Card title="Today">
        {todays ? (
          <>
            <WorkoutLine w={todays} defaultOpen={todays.type === 'strength'} />
            {onLog && todays.distanceKm > 0 && <button className="primary block" onClick={onLog}>Log this run</button>}
            {todays.type === 'strength' && (gymDone
              ? <p className="ok-text">✓ Gym session logged — nice work.</p>
              : <button className="primary block" onClick={logGym}>Mark gym session done</button>)}
            <p className="muted small">🎧 {audioAdvice(todays.type)}</p>
          </>
        ) : <p>Rest day — mobility, a gym class, or nothing at all.</p>}
        <p className="muted small">🍽 {targets.note} Target ≈ {targets.carbsG} g carbs · {targets.proteinG} g protein · {targets.kcal} kcal.</p>
      </Card>

      {actions.length > 0 && (
        <Card title="Race entries needing attention">
          {actions.map((a) => <p key={a.race.id} className={`u-${a.urgency}`}><strong>{a.race.name}</strong> — {a.text}</p>)}
        </Card>
      )}

      {week && (
        <Card title="This week">
          {week.adaptationNote && <p className="note">↻ {week.adaptationNote}</p>}
          {week.workouts.map((w) => <WorkoutLine key={w.id} w={w} done={logs.filter((l) => l.date === w.date).reduce((s, l) => s + l.distanceKm, 0)} />)}
        </Card>
      )}
      <TrainingSummary compact />
      <AdaptCard />
    </div>
  );
}

import { Card, Empty, WorkoutLine } from '../components/ui';
import { useStore } from '../store';
import { daysBetween, mondayOf, today } from '../lib/dates';
import { fmtDist } from '../lib/format';
import { weekActualKm, workoutOn } from '../lib/plan';
import { minutesNeeded } from '../lib/calendar';
import { dailyTargets } from '../lib/nutrition';
import { nextAction } from '../lib/races';
import { audioAdvice } from '../lib/media';
import { AdaptCard } from './LogView';
import { routeIdeas } from '../lib/routes';
import { NYC_2027 } from '../lib/presets';

export function TodayView({ onLog }: { onLog?: () => void }) {
  const { state } = useStore();
  const { plan, profile, logs } = state;
  if (!plan || !profile) return <Empty>Create your profile to get started.</Empty>;
  const t = today();
  const daysToRace = daysBetween(t, profile.raceDate);
  const week = plan.weeks.find((w) => w.startDate === mondayOf(t));
  const todays = workoutOn(plan, t);
  const minutes = todays ? minutesNeeded(todays, plan.paces) - 30 : 0;
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
            <WorkoutLine w={todays} />
            {onLog && <button className="primary block" onClick={onLog}>Log this run</button>}
            <p className="muted small">🎧 {audioAdvice(todays.type)}</p>
            {profile.raceDate === NYC_2027.raceDate && <RouteIdeas ideas={routeIdeas(todays, state.geo.home)} />}
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
      <AdaptCard />
    </div>
  );
}

export function RouteIdeas({ ideas }: { ideas: ReturnType<typeof routeIdeas> }) {
  if (!ideas.length) return null;
  return (
    <details className="routes">
      <summary className="small">🗺 Route ideas from home</summary>
      {ideas.map((r) => (
        <p key={r.title} className="small">
          <strong>{r.title}</strong>{r.mapsUrl && <> · <a href={r.mapsUrl} target="_blank" rel="noreferrer">map</a></>}
          <br /><span className="muted">{r.detail}</span>
        </p>
      ))}
    </details>
  );
}

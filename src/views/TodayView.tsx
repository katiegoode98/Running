import { Card, Empty } from '../components/ui';
import { useStore } from '../store';
import { daysBetween, mondayOf, today } from '../lib/dates';
import { fmtDist } from '../lib/format';
import { planWeekCount, runMinutes, weekActualKm, weekLabel } from '../lib/plan';
import { StarterWeekOffer } from '../components/StarterWeekOffer';
import { dailyTargets } from '../lib/nutrition';
import { nextAction } from '../lib/races';
import { audioAdvice } from '../lib/media';
import { dayFor, isDone, workoutsOn } from '../lib/schedule';
import { AdaptCard } from './LogView';
import { TrainingSummary } from '../components/TrainingSummary';
import { WeekChecklist, weekProgress } from '../components/WeekChecklist';

export function TodayView({ onLog }: { onLog?: () => void }) {
  const { state } = useStore();
  const { plan, profile, logs } = state;
  if (!plan || !profile) return <Empty>Create your profile to get started.</Empty>;
  const t = today();
  const daysToRace = daysBetween(t, profile.raceDate);
  const week = plan.weeks.find((w) => w.startDate === mondayOf(t));
  const todays = workoutsOn(plan, t);
  const main = todays[0];
  const minutes = todays.reduce((s, w) => s + runMinutes(w, plan.paces), 0);
  const targets = dailyTargets(profile, main, minutes, daysToRace);
  const actions = state.races.map((r) => nextAction(r, t)).filter((a) => a.urgency === 'urgent' || a.urgency === 'overdue' || a.urgency === 'soon');
  const u = profile.units;
  const progress = week ? weekProgress(week, state) : null;
  const remaining = week ? week.workouts.filter((w) => w.type !== 'rest' && dayFor(w) !== t && !isDone(w, logs, state.activities)) : [];
  const runToday = todays.some((w) => w.distanceKm > 0 && !isDone(w, logs, state.activities));

  return (
    <div className="stack">
      <div className="hero">
        <div>
          <div className="muted">{profile.raceName || 'Marathon'}</div>
          <div className="big">{daysToRace} days to go</div>
        </div>
        {week && <div className="muted">{week.intro ? 'Starter week' : `${weekLabel(plan, week)} of ${planWeekCount(plan)} · ${week.phase}`} · {fmtDist(weekActualKm(week, logs), u, 0)} of {fmtDist(week.targetKm, u, 0)}</div>}
      </div>

      <StarterWeekOffer />

      <Card title="Today">
        {week && todays.length > 0 ? (
          <>
            <WeekChecklist week={week} filter={(w) => dayFor(w) === t} />
            {onLog && runToday && <button className="primary block" onClick={onLog}>Log run details (time, heart rate)</button>}
            <p className="muted small">🎧 {audioAdvice(main.type)}</p>
          </>
        ) : (
          <p>Nothing assigned to today.{remaining.length > 0 ? ' Pick something below with “Do today”, or enjoy a rest day.' : ' Rest day — mobility, a gym class, or nothing at all.'}</p>
        )}
        <p className="muted small">🍽 {targets.note} Target ≈ {targets.carbsG} g carbs · {targets.proteinG} g protein · {targets.kcal} kcal.</p>
      </Card>

      {week && remaining.length > 0 && (
        <Card title="Still to do this week" actions={progress && <span className="pill">{progress.done}/{progress.total} done</span>}>
          {week.adaptationNote && <p className="note">↻ {week.adaptationNote}</p>}
          <WeekChecklist week={week} filter={(w) => remaining.includes(w)} showDoToday />
        </Card>
      )}
      {week && remaining.length === 0 && progress && progress.done === progress.total && (
        <Card title="This week"><p className="ok-text">✓ Everything done this week — great work.</p></Card>
      )}

      {actions.length > 0 && (
        <Card title="Race entries needing attention">
          {actions.map((a) => <p key={a.race.id} className={`u-${a.urgency}`}><strong>{a.race.name}</strong> — {a.text}</p>)}
        </Card>
      )}
      <TrainingSummary compact />
      <AdaptCard />
    </div>
  );
}

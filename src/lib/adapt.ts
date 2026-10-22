import type { Paces, Plan, Profile, RunLog } from '../types';
import { addDays, mondayOf } from './dates';
import { computePaces, MARATHON_KM, riegel } from './paces';
import { generatePlan, weekActualKm } from './plan';

export interface Performance {
  date: string;
  distanceKm: number;
  timeSec: number;
  source: string;
}

export interface Assessment {
  complianceRecent: number | null; // actual / planned over the last two completed weeks
  avgRpe: number | null;
  easyRpe: number | null;
  painFlag: boolean;
  fitnessMarathonSec: number | null;
  recommendation: 'none' | 'reduce' | 'cutback' | 'injury' | 'faster-paces';
  notes: string[];
}

/** Summarises recent training and decides whether the remaining plan should change. */
export function assess(plan: Plan, logs: RunLog[], performances: Performance[], todayIso: string): Assessment {
  const thisMonday = mondayOf(todayIso);
  const completed = plan.weeks.filter((w) => w.startDate < thisMonday).slice(-2);
  const planned = completed.reduce((s, w) => s + w.workouts.reduce((a, x) => a + x.distanceKm, 0), 0);
  const actual = completed.reduce((s, w) => s + weekActualKm(w, logs), 0);
  const complianceRecent = completed.length && planned > 0 ? actual / planned : null;

  const since = addDays(todayIso, -14);
  const recent = logs.filter((l) => l.date >= since && l.date <= todayIso);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgRpe = avg(recent.map((l) => l.rpe));
  const workoutTypes = new Map(plan.weeks.flatMap((w) => w.workouts).map((w) => [w.id, w.type]));
  const easyRpe = avg(recent.filter((l) => ['easy', 'recovery'].includes(workoutTypes.get(l.workoutId ?? '') ?? '')).map((l) => l.rpe));
  const painFlag = logs.some((l) => l.pain && l.date >= addDays(todayIso, -7) && l.date <= todayIso);

  const fitnessMarathonSec = bestRecentMarathonEstimate(performances, logs, todayIso);

  const notes: string[] = [];
  let recommendation: Assessment['recommendation'] = 'none';

  if (painFlag) {
    recommendation = 'injury';
    notes.push('You flagged pain in the last 7 days. Next week drops to ~70% volume with all quality sessions swapped for easy running. If pain persists or alters your gait, see a physio before resuming workouts.');
  } else if (complianceRecent !== null && complianceRecent < 0.75) {
    recommendation = 'reduce';
    notes.push(`You completed ${Math.round(complianceRecent * 100)}% of planned volume over the last two weeks. Rather than jumping back to the plan, the ramp is rebuilt from what you actually ran so the increase stays under 10% a week.`);
  } else if ((easyRpe !== null && easyRpe >= 6.5) || (avgRpe !== null && avgRpe >= 7.5)) {
    recommendation = 'cutback';
    notes.push('Your effort ratings are high — easy runs should feel 3–4/10. Next week becomes a cutback week (≈80% volume) to absorb the training.');
  } else if (fitnessMarathonSec !== null && fitnessMarathonSec < plan.paces.marathon * MARATHON_KM * 1.04 && paceGainSec(plan.paces, fitnessMarathonSec) > 3) {
    recommendation = 'faster-paces';
    notes.push(`Recent performances suggest ~${Math.round(fitnessMarathonSec / 60)} min marathon fitness. Training paces can be sharpened.`);
  }

  if (complianceRecent !== null && complianceRecent > 1.15 && recommendation === 'none') {
    notes.push('You are running more than planned. That is fine if it feels easy, but volume beyond plan raises injury risk — consider holding back.');
  }
  if (!notes.length) notes.push('Training is on track — no changes needed.');

  return { complianceRecent, avgRpe, easyRpe, painFlag, fitnessMarathonSec, recommendation, notes };
}

function paceGainSec(paces: Paces, marathonSec: number): number {
  const fitnessMp = marathonSec / MARATHON_KM;
  // Current easy pace was derived from fitness MP × 1.2.
  return paces.easy / 1.2 - fitnessMp;
}

function bestRecentMarathonEstimate(performances: Performance[], logs: RunLog[], todayIso: string): number | null {
  const since = addDays(todayIso, -56);
  const efforts: { distanceKm: number; timeSec: number }[] = [
    ...performances.filter((p) => p.date >= since),
    // Hard efforts (RPE ≥ 9) of 5 km+ are treated as race-like time trials.
    ...logs.filter((l) => l.date >= since && l.rpe >= 9 && l.distanceKm >= 5).map((l) => ({ distanceKm: l.distanceKm, timeSec: l.durationSec })),
  ].filter((e) => e.timeSec > 0 && e.distanceKm > 0);
  if (!efforts.length) return null;
  return Math.min(...efforts.map((e) => riegel(e.timeSec, e.distanceKm, MARATHON_KM)));
}

/**
 * Applies an assessment: past and current weeks are kept as logged history, and
 * every week from next Monday is regenerated from the runner's actual state.
 */
export function adaptPlan(plan: Plan, profile: Profile, logs: RunLog[], a: Assessment, todayIso: string): Plan {
  const nextMonday = addDays(mondayOf(todayIso), 7);
  const kept = plan.weeks.filter((w) => w.startDate < nextMonday);
  if (nextMonday > profile.raceDate) return plan;

  const lastTwo = kept.slice(-2);
  const recentKm = lastTwo.length ? lastTwo.reduce((s, w) => s + weekActualKm(w, logs), 0) / lastTwo.length : profile.currentWeeklyKm;
  const longest = Math.max(0, ...logs.filter((l) => l.date >= addDays(todayIso, -21)).map((l) => l.distanceKm));
  const plannedNext = plan.weeks.find((w) => w.startDate === nextMonday);

  let paces = plan.paces;
  if (a.recommendation === 'faster-paces' && a.fitnessMarathonSec) {
    const fresh = computePaces(profile.goalTimeSec, { distanceKm: MARATHON_KM, timeSec: a.fitnessMarathonSec });
    paces = { ...fresh, marathon: Math.min(fresh.marathon, plan.paces.marathon) };
  }

  let startKm: number | undefined;
  let startLong: number | undefined;
  if (a.recommendation === 'reduce') {
    startKm = Math.max(15, recentKm);
    startLong = Math.max(8, longest);
  }

  const regenerated = generatePlan(profile, { startDate: nextMonday, startKm, startLongKm: startLong ?? lastLongPlanned(plan, nextMonday), paces, firstIndex: kept.length });
  const future = regenerated.weeks;

  if (future.length && (a.recommendation === 'cutback' || a.recommendation === 'injury')) {
    const factor = a.recommendation === 'injury' ? 0.7 : 0.8;
    const base = plannedNext?.targetKm ?? future[0].targetKm;
    const w = future[0];
    w.workouts = w.workouts.map((x) => {
      if (x.type === 'rest' || x.type === 'race' || x.type === 'strength') return x;
      const distanceKm = Math.round(x.distanceKm * factor * 2) / 2;
      if (a.recommendation === 'injury' && x.type !== 'easy' && x.type !== 'recovery') {
        return { ...x, type: 'easy', distanceKm: Math.min(distanceKm, 8), title: 'Easy run (adapted)', description: 'Quality session replaced with easy running while you recover. Stop if pain returns.', paceSecPerKm: paces.easy };
      }
      return { ...x, distanceKm };
    });
    w.cutback = true;
    w.targetKm = Math.round(w.workouts.reduce((s, x) => s + x.distanceKm, 0));
    w.adaptationNote = `${a.recommendation === 'injury' ? 'Injury caution' : 'Cutback'}: reduced from ~${base} to ${w.targetKm} km.`;
  } else if (future.length && a.recommendation !== 'none') {
    future[0].adaptationNote = a.notes[0];
  }

  return { createdAt: plan.createdAt, paces, weeks: [...kept, ...future] };
}

function lastLongPlanned(plan: Plan, before: string): number | undefined {
  const longs = plan.weeks.filter((w) => w.startDate < before).flatMap((w) => w.workouts).filter((x) => x.type === 'long');
  return longs.length ? longs[longs.length - 1].distanceKm : undefined;
}

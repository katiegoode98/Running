import type { Paces, Phase, Plan, PlanWeek, Profile, Units, Workout, WorkoutType } from '../types';
import { addDays, daysBetween, mondayOf } from './dates';
import { fmtDist, fmtPace } from './format';
import { computePaces, MARATHON_KM } from './paces';

/*
 * Plan generator.
 *
 * The structure blends widely used marathon methodologies:
 *  - Periodisation into base → build → peak → taper (Pfitzinger, Daniels).
 *  - Weekly volume rises ≤10% week on week with a cutback every 4th week.
 *  - Long run ≈ 30–35% of weekly volume (up to ~46% in the build/peak phases
 *    for moderate-volume runners), capped at 32 km (~20 mi) — beyond
 *    that the injury risk outweighs the aerobic benefit for most amateurs.
 *  - One or two quality sessions per week (threshold, VO2max intervals,
 *    marathon-pace work) separated by easy days; never back-to-back hard days.
 *  - Three-week taper at roughly 75% → 55% → race week.
 *  - When the race is more than 18 weeks away, a foundation phase comes first:
 *    volume climbs to ~75% of peak and holds there, with long runs capped at
 *    half-marathon distance, so the 18-week marathon block starts from a
 *    durable base instead of peaking months too early.
 */

export const BLOCK_WEEKS = 18;
const FOUNDATION_LONG_CAP = 22;
export const LONG_RUN_MAX_MIN = 210;

export interface GenerateOptions {
  startDate: string; // any date; the plan starts on that week's Monday
  startKm?: number;
  startLongKm?: number;
  paces?: Paces;
  firstIndex?: number;
}

// Day offsets from the long-run day, by number of run days per week.
// Offset 2 and 4 hold the quality sessions so they're never adjacent to the long run.
const RUN_OFFSETS: Record<number, number[]> = {
  3: [0, 2, 4],
  4: [0, 2, 4, 6],
  5: [0, 2, 3, 4, 6],
  6: [0, 1, 2, 3, 4, 6],
};

export function peakVolumeKm(profile: Profile): number {
  const g = profile.goalTimeSec;
  let peak = g <= 3 * 3600 ? 95 : g <= 3.25 * 3600 ? 85 : g <= 3.5 * 3600 ? 75 : g <= 3.75 * 3600 ? 65 : g <= 4 * 3600 ? 58 : g <= 4.5 * 3600 ? 52 : 48;
  if (profile.experience === 'beginner') peak *= 0.85;
  if (profile.experience === 'advanced') peak *= 1.1;
  peak = Math.min(peak, profile.runDaysPerWeek * 17);
  return Math.round(Math.max(peak, profile.currentWeeklyKm));
}

function phaseFor(weekIdx: number, total: number): Phase {
  const fromEnd = total - 1 - weekIdx;
  if (fromEnd < 3) return 'taper';
  if (fromEnd < 6) return 'peak';
  if (fromEnd < 14) return 'build';
  if (fromEnd < BLOCK_WEEKS) return 'base';
  return 'foundation';
}

export function generatePlan(profile: Profile, opts: GenerateOptions): Plan {
  const paces = opts.paces ?? computePaces(profile.goalTimeSec, profile.recentRace);
  const start = mondayOf(opts.startDate);
  const raceMonday = mondayOf(profile.raceDate);
  const total = Math.max(1, Math.floor(daysBetween(start, raceMonday) / 7) + 1);
  const peakKm = peakVolumeKm(profile);
  // Cap long runs at 32 km (30 for beginners) or ~3.5 hours, whichever comes first:
  // beyond that, slower runners pile up fatigue and injury risk for little extra benefit.
  const longCap = Math.min(profile.experience === 'beginner' ? 30 : 32, Math.floor((LONG_RUN_MAX_MIN * 60) / paces.long));
  const firstIndex = opts.firstIndex ?? 0;

  const peakStart = Math.max(0, total - 6);
  const foundationKm = Math.max(Math.min(opts.startKm ?? profile.currentWeeklyKm, peakKm), peakKm * 0.75);
  let prevKm = Math.max(opts.startKm ?? profile.currentWeeklyKm, 15);
  let prevLong = Math.max(opts.startLongKm ?? profile.longestRecentRunKm, 8);
  const weeks: PlanWeek[] = [];

  for (let i = 0; i < total; i++) {
    const phase = phaseFor(i, total);
    const weekStart = addDays(start, i * 7);
    let target: number;
    let cutback = false;
    let longKm: number;

    if (phase === 'taper') {
      const fromEnd = total - 1 - i;
      const factor = fromEnd === 2 ? 0.75 : fromEnd === 1 ? 0.55 : 0.35;
      target = peakKm * factor;
      longKm = fromEnd === 2 ? Math.min(prevLong * 0.8, 24) : fromEnd === 1 ? Math.min(prevLong * 0.6, 16) : 0;
    } else {
      cutback = i > 0 && i % 4 === 3 && phase !== 'peak';
      const ramp = phase === 'foundation'
        ? foundationKm
        : peakStart === 0 ? peakKm : prevKm + (peakKm - prevKm) / Math.max(1, peakStart - i);
      const progressed = Math.min(prevKm * 1.1, Math.max(ramp, prevKm));
      if (cutback) {
        target = prevKm * 0.8;
        longKm = prevLong * 0.75;
      } else {
        target = phase === 'peak' ? Math.min(prevKm * 1.1, peakKm) : progressed;
        prevKm = target;
        // Marathon-specific phases let the long run grow toward 29–32 km even on moderate weekly volume.
        const specific = phase === 'build' || phase === 'peak';
        // Foundation long runs build toward half-marathon distance so spring tune-up races are covered.
        // Lower-volume plans (<55 km/week) lean more on the long run, as most novice plans do.
        const specificShare = target < 55 ? 0.55 : profile.runDaysPerWeek <= 4 ? 0.48 : 0.46;
        const share = specific ? specificShare : phase === 'foundation' ? 0.48 : profile.runDaysPerWeek <= 4 ? 0.36 : 0.32;
        const cap = phase === 'foundation' ? Math.min(longCap, Math.max(FOUNDATION_LONG_CAP, prevLong)) : longCap;
        longKm = Math.min(cap, Math.max(prevLong, target * share), prevLong + 2.5);
        prevLong = longKm;
      }
    }

    const week = buildWeek({
      profile,
      paces,
      index: firstIndex + i,
      weekStart,
      phase,
      targetKm: target,
      longKm,
      cutback,
      isRaceWeek: i === total - 1,
      peakWeekNumber: phase === 'peak' ? i - peakStart : -1,
    });
    weeks.push(week);
  }

  return { createdAt: new Date().toISOString(), weeks, paces };
}

interface WeekInput {
  profile: Profile;
  paces: Paces;
  index: number;
  weekStart: string;
  phase: Phase;
  targetKm: number;
  longKm: number;
  cutback: boolean;
  isRaceWeek: boolean;
  peakWeekNumber: number;
}

function dateForDow(weekStart: string, dow: number): string {
  return addDays(weekStart, (dow + 6) % 7);
}

const round1 = (n: number) => Math.round(n * 2) / 2; // nearest 0.5 km

function buildWeek(w: WeekInput): PlanWeek {
  const { profile, paces } = w;
  const u = profile.units;
  const L = profile.longRunDay;
  const offsets = RUN_OFFSETS[profile.runDaysPerWeek];
  const qualityCount = profile.runDaysPerWeek === 3 || w.phase === 'base' || w.phase === 'foundation' ? 1 : 2;
  const workouts: Workout[] = [];

  const longKm = round1(w.longKm);
  const qualityKm = round1(Math.min(16, Math.max(6, w.targetKm * 0.17)));
  const easyDays = offsets.length - 1 - qualityCount;
  const remaining = w.targetKm - longKm - qualityKm * qualityCount;
  const easyKm = round1(Math.max(4, easyDays > 0 ? remaining / easyDays : 0));

  for (let off = 0; off < 7; off++) {
    const dow = (L + off) % 7;
    const date = dateForDow(w.weekStart, dow);
    const id = `${date}`;
    if (!offsets.includes(off)) {
      workouts.push(rest(id, date));
      continue;
    }
    let wk: Workout;
    if (off === 0) {
      wk = longRun(id, date, longKm, w, u, paces);
    } else if (off === 2) {
      wk = quality(1, id, date, qualityKm, w, u, paces);
    } else if (off === 4 && qualityCount === 2) {
      wk = quality(2, id, date, qualityKm, w, u, paces);
    } else if (off === 1) {
      wk = mk(id, date, 'recovery', Math.min(easyKm, 6), 'Recovery run', `Very relaxed — shake out the long run. Keep it conversational at ${fmtPace(paces.recovery, u)} or slower.`, paces.recovery);
    } else {
      const strides = w.phase !== 'taper' && off === 6 ? ' Finish with 6 × 20 s strides.' : '';
      wk = mk(id, date, 'easy', easyKm, 'Easy run', `Easy aerobic running at ~${fmtPace(paces.easy, u)}.${strides}`, paces.easy);
    }
    workouts.push(wk);
  }

  if (w.isRaceWeek) applyRaceWeek(workouts, profile, paces);

  workouts.sort((a, b) => a.date.localeCompare(b.date));
  const targetKm = Math.round(workouts.reduce((s, x) => s + x.distanceKm, 0));
  return { index: w.index, startDate: w.weekStart, phase: w.phase, targetKm, cutback: w.cutback, workouts };
}

function mk(id: string, date: string, type: WorkoutType, distanceKm: number, title: string, description: string, paceSecPerKm?: number): Workout {
  return { id: `${id}-${type}`, date, type, distanceKm: round1(distanceKm), title, description, paceSecPerKm };
}

function rest(id: string, date: string): Workout {
  return mk(id, date, 'rest', 0, 'Rest / cross-train', 'Rest day. Optional mobility, yoga or a strength class.');
}

function longRun(id: string, date: string, km: number, w: WeekInput, u: Units, p: Paces): Workout {
  if (km <= 0) return rest(id, date);
  if (w.phase === 'peak' && w.peakWeekNumber % 2 === 0 && km >= 20) {
    const mpKm = round1(Math.min(16, km * 0.4));
    return mk(id, date, 'long', km, 'Long run with marathon-pace finish',
      `${fmtDist(km, u)} total: run the first ${fmtDist(km - mpKm, u)} easy (${fmtPace(p.long, u)}) then ${fmtDist(mpKm, u)} at goal marathon pace (${fmtPace(p.marathon, u)}). Practise race-day fuelling.`, p.long);
  }
  return mk(id, date, 'long', km, w.cutback ? 'Long run (cutback week)' : 'Long run',
    `Steady ${fmtDist(km, u)} at ${fmtPace(p.long, u)}. Take on 30–60 g carbs per hour if over 75 minutes.`, p.long);
}

function quality(n: 1 | 2, id: string, date: string, km: number, w: WeekInput, u: Units, p: Paces): Workout {
  const wucd = Math.min(4, km * 0.35);
  const main = round1(km - wucd);
  const warm = `${fmtDist(wucd / 2, u)} warm-up and ${fmtDist(wucd / 2, u)} cool-down.`;
  if (w.phase === 'foundation' && w.index % 2 === 1) {
    return mk(id, date, 'tempo', km, 'Threshold run', `${fmtDist(main * 0.6, u)} at threshold (${fmtPace(p.tempo, u)}) — builds speed for tune-up races. ${warm}`, p.tempo);
  }
  if (w.phase === 'base' || w.phase === 'foundation') {
    return mk(id, date, 'tempo', km, 'Hills / fartlek',
      `${fmtDist(km, u)} with 8–10 × 60–90 s hill or fartlek surges at a strong effort, jog recoveries. ${warm}`, p.easy);
  }
  if (w.phase === 'taper') {
    return n === 1
      ? mk(id, date, 'marathon-pace', km, 'Marathon-pace sharpener', `${fmtDist(Math.min(main, 6), u)} at goal pace (${fmtPace(p.marathon, u)}). ${warm}`, p.marathon)
      : mk(id, date, 'intervals', km * 0.8, 'Short intervals', `5 × 1 km at ${fmtPace(p.interval, u)}, 2 min jog. Stay sharp, don't strain. ${warm}`, p.interval);
  }
  if (n === 1 && w.phase === 'peak') {
    return mk(id, date, 'marathon-pace', km, 'Marathon-pace run', `${fmtDist(main, u)} continuous at goal marathon pace (${fmtPace(p.marathon, u)}). ${warm}`, p.marathon);
  }
  if (n === 1) {
    return mk(id, date, 'tempo', km, 'Threshold run', `${fmtDist(main * 0.7, u)} at threshold (${fmtPace(p.tempo, u)}) — comfortably hard, could speak a few words. ${warm}`, p.tempo);
  }
  const reps = Math.max(4, Math.min(8, Math.round(main * 0.6)));
  return mk(id, date, 'intervals', km, 'VO₂max intervals', `${reps} × 1 km at ${fmtPace(p.interval, u)} with 2–3 min jog recovery. ${warm}`, p.interval);
}

function applyRaceWeek(workouts: Workout[], profile: Profile, paces: Paces): void {
  const raceDate = profile.raceDate;
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i];
    if (w.date > raceDate) workouts[i] = rest(w.date, w.date);
    else if (w.type === 'long') workouts[i] = rest(w.date, w.date);
    else if (w.type === 'intervals' || (isHard(w.type) && w.date >= addDays(raceDate, -3))) {
      workouts[i] = mk(w.date, w.date, 'easy', 5, 'Easy run', `Short and easy with 4 × 20 s strides at race pace.`, paces.easy);
    }
  }
  const idx = workouts.findIndex((w) => w.date === raceDate);
  const race = mk(raceDate, raceDate, 'race', MARATHON_KM, profile.raceName || 'Race day!',
    `Goal ${fmtPace(paces.marathon, profile.units)}. Start conservatively, fuel every 20–30 min, and save something for the final 10 km.`, paces.marathon);
  if (idx >= 0) workouts[idx] = race;
  else workouts.push(race);
  const eve = workouts.findIndex((w) => w.date === addDays(raceDate, -1));
  if (eve >= 0) workouts[eve] = mk(workouts[eve].date, workouts[eve].date, 'recovery', 3, 'Shakeout', 'Optional 15–20 min shakeout with a few strides. Lay out kit, carb-load, sleep.', paces.recovery);
}

/** Planned week totals vs actual logs. */
export function weekActualKm(week: PlanWeek, logs: { date: string; distanceKm: number }[]): number {
  const end = addDays(week.startDate, 7);
  return logs.filter((l) => l.date >= week.startDate && l.date < end).reduce((s, l) => s + l.distanceKm, 0);
}

export function isHard(type: WorkoutType): boolean {
  return type === 'long' || type === 'tempo' || type === 'intervals' || type === 'marathon-pace' || type === 'race';
}

export function workoutOn(plan: Plan | null, date: string): Workout | undefined {
  if (!plan) return undefined;
  const monday = mondayOf(date);
  return plan.weeks.find((w) => w.startDate === monday)?.workouts.find((x) => x.date === date && x.type !== 'rest');
}

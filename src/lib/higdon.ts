import type { Paces, Phase, PlanWeek, Profile, Workout } from '../types';
import { addDays, daysBetween, mondayOf } from './dates';
import { fmtDist, fmtPace, KM_PER_MI } from './format';

/*
 * Hal Higdon's Novice 1 marathon programme (free at halhigdon.com), laid out
 * around the runner's long-run day:
 *
 *   long run · cross-train · rest · short run · sorta-long run · short run · rest
 *
 * With a Saturday long run that's exactly Higdon's week (Sat long, Sun cross,
 * Mon rest, Tue/Thu short runs, Wed "sorta-long", Fri rest). All running is at a
 * comfortable, conversational pace; there is no speedwork. Long runs build from
 * 6 to 20 miles in week 15 with step-backs, a half marathon in week 8, then a
 * three-week taper. Distances are in miles, as Higdon publishes them.
 *
 * Before the 18-week block, base weeks follow the same shape at the 15–25
 * miles a week Higdon asks runners to have before starting.
 */

export const HIGDON_URL = 'https://www.halhigdon.com/training-programs/marathon-training/novice-1-marathon/';

const N1 = {
  short1: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 4, 3],
  sortaLong: [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 8, 6, 4],
  short2: [3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 4, 3, 2],
  // 0 = no long run: week 8 has a half marathon instead, week 18 the marathon.
  long: [6, 7, 5, 9, 10, 7, 12, 0, 10, 15, 16, 12, 18, 14, 20, 12, 8, 0],
};

export const BLOCK = N1.long.length; // 18 weeks
const HALF_WEEK = 7; // 0-based index of week 8

const mi = (n: number) => Math.round(n * KM_PER_MI * 10) / 10;

function blockPhase(i: number): Phase {
  return i < 6 ? 'base' : i < 12 ? 'build' : i < 15 ? 'peak' : 'taper';
}

interface Ctx {
  profile: Profile;
  paces: Paces;
}

function run(date: string, type: Workout['type'], miles: number, title: string, note: string, pace: number, ctx: Ctx): Workout {
  const u = ctx.profile.units;
  const km = mi(miles);
  const higdon = u === 'km' ? ` (${miles} mi in Higdon's plan)` : '';
  return {
    id: `${date}-${type}${title.startsWith('Sorta') ? '-sl' : ''}`,
    date,
    type,
    distanceKm: km,
    title,
    description: `${fmtDist(km, u)}${higdon} ${note} ~${fmtPace(pace, u)}.`,
    paceSecPerKm: pace,
  };
}

function cross(date: string): Workout {
  return {
    id: `${date}-cross`,
    date,
    type: 'cross',
    distanceKm: 0,
    durationMin: 60,
    title: 'Cross-train (60 min)',
    description: 'Higdon\'s cross-training day: an hour of easy, non-running aerobic work — cycling, swimming, an easy spin class or yoga. Keep it gentle the day after your long run.',
  };
}

function rest(date: string): Workout {
  return { id: `${date}-rest`, date, type: 'rest', distanceKm: 0, title: 'Rest', description: 'Rest day — Higdon schedules two a week.' };
}

/** One week in Higdon's shape, positioned around the runner's long-run day. */
function higdonWeek(weekStart: string, ctx: Ctx, m: { short1: number; sortaLong: number; short2: number; long: number }, opts: { half?: boolean; raceDate?: string }): Workout[] {
  const L = ctx.profile.longRunDay;
  const dateAt = (offset: number) => addDays(weekStart, (((L + offset) % 7) + 6) % 7);
  const p = ctx.paces;
  const out: Workout[] = [];

  // Long-run day, then cross-training. In week 8 a half marathon replaces the long run.
  if (opts.half) {
    out.push({
      ...run(dateAt(0), 'race', 13.1, 'Half marathon (race or time trial)', 'Higdon\'s week-8 test: race a half marathon, or run it as a time trial at a controlled effort —', p.marathon, ctx),
      id: `${dateAt(0)}-half`,
    });
    out.push(rest(dateAt(1)));
  } else if (m.long > 0) {
    out.push(run(dateAt(0), 'long', m.long, 'Long run', 'at a comfortable pace — Higdon suggests 30–90 s per mile slower than marathon pace —', p.long, ctx));
    out.push(cross(dateAt(1)));
  } else {
    out.push(rest(dateAt(0)));
    out.push(rest(dateAt(1)));
  }
  out.push(rest(dateAt(2)));
  out.push(run(dateAt(3), 'easy', m.short1, 'Short run', 'easy, at a conversational pace,', p.easy, ctx));
  out.push(run(dateAt(4), 'easy', m.sortaLong, 'Sorta-long run', 'easy — Higdon\'s midweek "sorta-long" run that builds through the plan —', p.easy, ctx));
  out.push(run(dateAt(5), 'easy', m.short2, 'Short run', 'easy, at a conversational pace,', p.easy, ctx));
  out.push(rest(dateAt(6)));

  // Race week: everything after race day (and the day before it) becomes rest.
  if (opts.raceDate) {
    return out.map((w) => (w.date >= addDays(opts.raceDate!, -1) ? rest(w.date) : w));
  }
  return out;
}

function week(index: number, weekStart: string, phase: Phase, cutback: boolean, workouts: Workout[]): PlanWeek {
  workouts.sort((a, b) => a.date.localeCompare(b.date));
  return { index, startDate: weekStart, phase, cutback, workouts, targetKm: Math.round(workouts.reduce((s, w) => s + w.distanceKm, 0)) };
}

/**
 * Base weeks before the 18-week block: Higdon's weekly shape with long runs
 * building slowly to 10 miles (enough for a spring half marathon) and a
 * step-back every third week.
 */
function baseMiles(j: number, startLongMi: number): { short1: number; sortaLong: number; short2: number; long: number } {
  const build = Math.min(10, Math.max(6, Math.round(startLongMi + j / 3)));
  const long = (j + 1) % 3 === 0 ? Math.max(5, build - 2) : build;
  return { short1: 3, sortaLong: Math.max(3, Math.round(long / 2)), short2: 3, long };
}

export function generateHigdonWeeks(profile: Profile, paces: Paces, startDate: string, firstIndex: number): PlanWeek[] {
  const ctx: Ctx = { profile, paces };
  const start = mondayOf(startDate);
  const raceMonday = mondayOf(profile.raceDate);
  const total = Math.max(1, Math.floor(daysBetween(start, raceMonday) / 7) + 1);
  const baseWeeks = Math.max(0, total - BLOCK);
  const startLongMi = Math.max(6, Math.round(profile.longestRecentRunKm / KM_PER_MI));
  const weeks: PlanWeek[] = [];

  for (let i = 0; i < total; i++) {
    const weekStart = addDays(start, i * 7);
    if (i < baseWeeks) {
      const m = baseMiles(i, startLongMi);
      weeks.push(week(firstIndex + i, weekStart, 'foundation', (i + 1) % 3 === 0, higdonWeek(weekStart, ctx, m, {})));
      continue;
    }
    // Plans shorter than 18 weeks join Higdon's schedule part-way through.
    const b = i - baseWeeks + Math.max(0, BLOCK - total);
    const m = { short1: N1.short1[b], sortaLong: N1.sortaLong[b], short2: N1.short2[b], long: N1.long[b] };
    const isRaceWeek = i === total - 1;
    const workouts = higdonWeek(weekStart, ctx, m, { half: b === HALF_WEEK, raceDate: isRaceWeek ? profile.raceDate : undefined });
    if (isRaceWeek) {
      const idx = workouts.findIndex((w) => w.date === profile.raceDate);
      const race: Workout = {
        id: `${profile.raceDate}-race`,
        date: profile.raceDate,
        type: 'race',
        distanceKm: 42.195,
        title: profile.raceName || 'Race day!',
        description: `Goal ${fmtPace(paces.marathon, profile.units)}. Higdon's advice: start slower than you think you should, drink at every station, and enjoy it.`,
        paceSecPerKm: paces.marathon,
      };
      if (idx >= 0) workouts[idx] = race;
      else workouts.push(race);
    }
    const prevLong = b > 0 ? N1.long[b - 1] : 0;
    const stepBack = m.long > 0 && m.long < prevLong && b < 15;
    weeks.push(week(firstIndex + i, weekStart, blockPhase(b), stepBack, workouts));
  }
  return weeks;
}

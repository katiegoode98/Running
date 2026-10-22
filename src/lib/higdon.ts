import type { Paces, Phase, PlanWeek, Profile, Workout } from '../types';
import { addDays, daysBetween, mondayOf } from './dates';
import { fmtDist, fmtPace, KM_PER_MI } from './format';

/*
 * Higdon-style plan: the structure and mileage of Hal Higdon's Novice 1
 * marathon programme (free at halhigdon.com), generated from the runner's
 * own starting point rather than copied week for week.
 *
 * Each week is laid out around the long-run day:
 *
 *   long run · cross-train · rest · short run · sorta-long run · short run · rest
 *
 * (with a Saturday long run that's Higdon's week). All running is easy and
 * conversational — no speedwork. Over the final 18 weeks the long run builds
 * to 20 miles three weeks before the race with a step-back roughly every third
 * week, the midweek "sorta-long" run builds from 3 to 10 miles, short runs
 * from 3 to 5, there's a half marathon in week 8 and a three-week taper.
 * Before that, base weeks use the same shape at 15–25 miles a week.
 */

export const HIGDON_URL = 'https://www.halhigdon.com/training-programs/marathon-training/novice-1-marathon/';

export const BLOCK = 18;
const HALF_WEEK = 7; // 0-based: week 8
const PEAK_WEEK = 14; // 0-based: the 20-miler, three weeks before race week
const PEAK_LONG = 20;
// Build weeks climb toward the peak; the others are step-backs (or the half).
const UP_WEEKS = [0, 1, 3, 4, 6, 9, 10, 12, PEAK_WEEK];
const STEP_WEEKS = [2, 5, 8, 11, 13];

type Miles = { short1: number; sortaLong: number; short2: number; long: number };

/** Miles for block week `b` (0–17), starting the long run at `startLong`. */
export function blockMiles(b: number, startLong: number): Miles {
  const upIdx = UP_WEEKS.indexOf(b);
  const upLong = (k: number) => Math.round(startLong + ((PEAK_LONG - startLong) * k) / (UP_WEEKS.length - 1));
  let long: number;
  if (upIdx >= 0) long = upLong(upIdx);
  else if (STEP_WEEKS.includes(b)) {
    const prevUp = UP_WEEKS.filter((u) => u < b).length - 1;
    long = Math.max(5, Math.round(upLong(prevUp) * 0.7));
  } else if (b === HALF_WEEK) long = 0;
  else long = b === 15 ? 12 : b === 16 ? 8 : 0; // taper; race week has no long run

  // Builds 3 → 10 miles, but never below where base training left it (about half the starting long run).
  const sortaLong = b <= PEAK_WEEK ? Math.max(3 + Math.floor(b / 2), Math.min(10, Math.round(startLong / 2))) : [8, 6, 4][b - 15];
  const short = b < 10 ? 3 : b < 14 ? 4 : b < 16 ? 5 : b === 16 ? 4 : 3;
  // The second short run eases off a week earlier in the taper.
  const short2 = b === 17 ? 2 : b === 15 ? 4 : short;
  return { short1: short, sortaLong, short2, long };
}

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
  const label = u === 'km' ? ` (${miles} mi)` : '';
  return {
    id: `${date}-${type}${title.startsWith('Sorta') ? '-sl' : ''}`,
    date,
    type,
    distanceKm: km,
    title,
    description: `${fmtDist(km, u)}${label} ${note} ~${fmtPace(pace, u)}.`,
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
function baseMiles(j: number, startLongMi: number): Miles {
  const build = Math.min(10, Math.max(6, Math.round(startLongMi + j / 3)));
  const long = (j + 1) % 3 === 0 ? Math.max(5, build - 2) : build;
  return { short1: 3, sortaLong: Math.max(3, Math.round(long / 2)), short2: 3, long };
}

export function generateHigdonWeeks(profile: Profile, paces: Paces, startDate: string, firstIndex: number, startLongKm?: number): PlanWeek[] {
  const ctx: Ctx = { profile, paces };
  const start = mondayOf(startDate);
  const raceMonday = mondayOf(profile.raceDate);
  const total = Math.max(1, Math.floor(daysBetween(start, raceMonday) / 7) + 1);
  const baseWeeks = Math.max(0, total - BLOCK);
  const startLongMi = Math.max(6, Math.round((startLongKm ?? profile.longestRecentRunKm) / KM_PER_MI));
  // The block's first long run continues from where base training left off (6–10 miles).
  const lastBuildWeek = Array.from({ length: baseWeeks }, (_, j) => j).reverse().find((j) => (j + 1) % 3 !== 0);
  const blockStartLong = Math.min(10, lastBuildWeek !== undefined ? baseMiles(lastBuildWeek, startLongMi).long : startLongMi);
  const weeks: PlanWeek[] = [];

  for (let i = 0; i < total; i++) {
    const weekStart = addDays(start, i * 7);
    if (i < baseWeeks) {
      const m = baseMiles(i, startLongMi);
      weeks.push(week(firstIndex + i, weekStart, 'foundation', (i + 1) % 3 === 0, higdonWeek(weekStart, ctx, m, {})));
      continue;
    }
    // Plans shorter than 18 weeks join the block part-way through.
    const b = i - baseWeeks + Math.max(0, BLOCK - total);
    const m = blockMiles(b, Math.max(6, blockStartLong));
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
        description: `Goal ${fmtPace(paces.marathon, profile.units)}. Start slower than you think you should, drink at every station, and enjoy it.`,
        paceSecPerKm: paces.marathon,
      };
      if (idx >= 0) workouts[idx] = race;
      else workouts.push(race);
    }
    const stepBack = STEP_WEEKS.includes(b);
    weeks.push(week(firstIndex + i, weekStart, blockPhase(b), stepBack, workouts));
  }
  return weeks;
}

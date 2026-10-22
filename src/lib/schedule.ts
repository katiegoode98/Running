import type { ActivityLog, CalendarEvent, Paces, Plan, PlanWeek, RunLog, Workout } from '../types';
import { addDays, DAY_SHORT, dayOfWeek, mondayOf } from './dates';
import { isHard } from './plan';
import { rescheduleWeek, type Move } from './calendar';

/*
 * Weekly checklist model. The plan suggests a day for every activity (`date`),
 * but the runner chooses when to do it (`scheduled`) and ticks it off. Races
 * are fixed to their date. An activity counts as done when a log is linked to
 * it (a run with its workoutId, a gym session with its plannedId) or it was
 * ticked without one.
 */

export const isRun = (w: Workout) => w.distanceKm > 0 && w.type !== 'rest' && w.type !== 'strength';

/** The day an activity will happen: races are fixed, everything else is the runner's choice. */
export function dayFor(w: Workout): string | undefined {
  return w.type === 'race' ? w.date : w.scheduled;
}

const PRIORITY: Record<string, number> = { race: 0, long: 1, 'marathon-pace': 2, tempo: 2, intervals: 2, easy: 3, recovery: 4, strength: 5 };

/** The week's to-do list: everything except rest days, most important first. */
export function activitiesOf(week: PlanWeek): Workout[] {
  return week.workouts
    .filter((w) => w.type !== 'rest')
    .sort((a, b) => (PRIORITY[a.type] ?? 9) - (PRIORITY[b.type] ?? 9) || a.date.localeCompare(b.date));
}

export function isDone(w: Workout, logs: RunLog[], activities: ActivityLog[]): boolean {
  if (w.done) return true;
  if (w.type === 'strength') return activities.some((a) => a.plannedId === w.id);
  return logs.some((l) => l.workoutId === w.id);
}

export function weekOf(plan: Plan | null, date: string): PlanWeek | undefined {
  return plan?.weeks.find((w) => w.startDate === mondayOf(date));
}

/** Activities assigned to a date (races included). */
export function workoutsOn(plan: Plan | null, date: string): Workout[] {
  const week = weekOf(plan, date);
  return week ? activitiesOf(week).filter((w) => dayFor(w) === date) : [];
}

/** The main activity on a date (most demanding first), e.g. for nutrition targets. */
export function workoutOn(plan: Plan | null, date: string): Workout | undefined {
  return workoutsOn(plan, date)[0];
}

/**
 * Which planned run a logged run belongs to: the run assigned to that day,
 * otherwise the unassigned, not-yet-done run that week closest in distance.
 */
export function matchRun(plan: Plan | null, logs: RunLog[], date: string, km: number): Workout | undefined {
  const week = weekOf(plan, date);
  if (!week) return undefined;
  // A run ticked off by hand is still open: a real log replaces the placeholder.
  const open = activitiesOf(week).filter((w) => isRun(w) && !logs.some((l) => l.workoutId === w.id && l.source !== 'tick') && !w.done);
  return open.find((w) => dayFor(w) === date)
    ?? open.filter((w) => !dayFor(w)).sort((a, b) => Math.abs(a.distanceKm - km) - Math.abs(b.distanceKm - km))[0];
}

/** The gym session a logged strength session completes. */
export function matchGym(plan: Plan | null, activities: ActivityLog[], date: string): Workout | undefined {
  const week = weekOf(plan, date);
  if (!week) return undefined;
  const open = activitiesOf(week).filter((w) => w.type === 'strength' && !activities.some((a) => a.plannedId === w.id && a.source !== 'tick') && !w.done);
  return open.find((w) => dayFor(w) === date) ?? open.find((w) => !dayFor(w));
}

/** Training-rule warnings for the days the runner has chosen, keyed by workout id. */
export function scheduleWarnings(week: PlanWeek): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (w: Workout, msg: string) => out.set(w.id, [...(out.get(w.id) ?? []), msg]);
  const assigned = activitiesOf(week).filter((w) => dayFor(w));
  const on = (d: string) => assigned.filter((w) => dayFor(w) === d);
  for (const w of assigned) {
    const d = dayFor(w)!;
    const same = on(d).filter((x) => x.id !== w.id);
    if (isRun(w) && same.some(isRun)) add(w, `Two runs on ${DAY_SHORT[dayOfWeek(d)]} — move one to another day`);
    const prev = on(addDays(d, -1));
    const next = on(addDays(d, 1));
    if (isHard(w.type) && w.type !== 'race' && prev.some((x) => isHard(x.type))) add(w, 'Hard session the day after another hard one — leave an easy day between');
    if (w.type === 'strength' && next.some((x) => x.type === 'long' || x.type === 'race')) add(w, 'Gym the day before your long run — tired legs; move it earlier in the week');
    if (w.type === 'long' && prev.some((x) => x.type === 'strength')) add(w, 'Day after a gym session — legs may be heavy');
  }
  return out;
}

/**
 * Suggests days for activities the runner hasn't assigned: the plan's
 * suggested day, moved around calendar clashes, skipping days already taken
 * by something they assigned.
 */
export function suggestDays(week: PlanWeek, events: CalendarEvent[], paces: Paces): { week: PlanWeek; moves: Move[] } {
  const { week: arranged, moves } = rescheduleWeek(week, events, paces);
  const suggested = new Map(arranged.workouts.map((w) => [w.id, w.date]));
  const taken = new Set(activitiesOf(week).map(dayFor).filter(Boolean));
  const workouts = week.workouts.map((w) => {
    if (w.type === 'rest' || w.type === 'race' || w.scheduled) return w;
    const d = suggested.get(w.id) ?? w.date;
    if (taken.has(d) && isRun(w)) return w; // keep unassigned rather than double-book a run day
    taken.add(d);
    return { ...w, scheduled: d };
  });
  return { week: { ...week, workouts }, moves: moves.filter((m) => !m.workout.scheduled) };
}

/** Keeps the runner's chosen days and ticks when a plan is regenerated (matching by workout id). */
export function carryOver(previous: Plan | null, next: Plan): Plan {
  if (!previous) return next;
  const old = new Map(previous.weeks.flatMap((w) => w.workouts).map((w) => [w.id, w]));
  return {
    ...next,
    weeks: next.weeks.map((week) => ({
      ...week,
      workouts: week.workouts.map((w) => {
        const o = old.get(w.id);
        return o && (o.scheduled || o.done) && o.type === w.type ? { ...w, scheduled: o.scheduled, done: o.done } : w;
      }),
    })),
  };
}

/** Effort to record when an activity is ticked off without a log. */
export function defaultRpe(w: Workout): number {
  switch (w.type) {
    case 'race': return 9;
    case 'tempo': case 'intervals': case 'marathon-pace': return 7;
    case 'long': return 5;
    case 'strength': return 6;
    default: return 3;
  }
}

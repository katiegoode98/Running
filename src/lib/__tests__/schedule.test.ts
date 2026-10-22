import { describe, expect, it } from 'vitest';
import { generatePlan } from '../plan';
import { adaptPlan, assess } from '../adapt';
import { activitiesOf, carryOver, dayFor, isDone, matchGym, matchRun, scheduleWarnings, suggestDays, workoutsOn } from '../schedule';
import { profile as base } from './fixtures';
import type { ActivityLog, CalendarEvent, Plan, PlanWeek, RunLog, Workout } from '../../types';

const profile = { ...base, raceDate: '2027-11-07', runDaysPerWeek: 4 as const };
const plan = generatePlan(profile, { startDate: '2026-10-22' });
const week = plan.weeks[1]; // week of 26 Oct
const items = activitiesOf(week);
const assign = (w: PlanWeek, id: string, date?: string): PlanWeek => ({ ...w, workouts: w.workouts.map((x) => (x.id === id ? { ...x, scheduled: date } : x)) });
const withWeek = (p: Plan, w: PlanWeek): Plan => ({ ...p, weeks: p.weeks.map((x) => (x.startDate === w.startDate ? w : x)) });
const byType = (t: Workout['type']) => items.find((w) => w.type === t)!;

describe('weekly checklist', () => {
  it('lists every activity (no rest days), most important first, unassigned by default', () => {
    expect(items.map((w) => w.type)).toEqual(['long', 'tempo', 'easy', 'easy', 'strength']);
    expect(items.every((w) => dayFor(w) === undefined)).toBe(true);
    expect(workoutsOn(plan, '2026-11-01')).toEqual([]);
  });

  it('shows an activity on the day the runner assigns', () => {
    const p = withWeek(plan, assign(week, byType('long').id, '2026-10-31'));
    expect(workoutsOn(p, '2026-10-31').map((w) => w.type)).toEqual(['long']);
    expect(workoutsOn(p, '2026-11-01')).toEqual([]);
  });

  it('counts an activity done when a log is linked or it was ticked', () => {
    const long = byType('long');
    const gym = byType('strength');
    const run: RunLog = { id: 'r', date: '2026-11-01', workoutId: long.id, distanceKm: 14, durationSec: 6000, rpe: 5, notes: '' };
    const lift: ActivityLog = { id: 'a', date: '2026-10-28', kind: 'strength', name: 'Gym', plannedId: gym.id, durationMin: 50, rpe: 6, notes: '' };
    expect(isDone(long, [run], [])).toBe(true);
    expect(isDone(gym, [], [lift])).toBe(true);
    expect(isDone(byType('tempo'), [run], [lift])).toBe(false);
    expect(isDone({ ...byType('tempo'), done: true }, [], [])).toBe(true);
  });
});

describe('matching logs to the checklist', () => {
  it('prefers the run assigned to that day, then the closest-distance unassigned run', () => {
    const tempo = byType('tempo');
    const p = withWeek(plan, assign(week, tempo.id, '2026-10-27'));
    expect(matchRun(p, [], '2026-10-27', 10)?.id).toBe(tempo.id);
    expect(matchRun(p, [], '2026-10-29', 14)?.type).toBe('long');
    const easy = items.filter((w) => w.type === 'easy');
    expect(easy.map((e) => e.id)).toContain(matchRun(p, [], '2026-10-29', easy[0].distanceKm)?.id);
  });

  it('lets a real log replace a ticked placeholder but not another real log', () => {
    const long = byType('long');
    const ticked: RunLog = { id: 't', date: '2026-11-01', workoutId: long.id, distanceKm: 14, durationSec: 6000, rpe: 5, notes: '', source: 'tick' };
    expect(matchRun(plan, [ticked], '2026-11-01', 14)?.id).toBe(long.id);
    expect(matchRun(plan, [{ ...ticked, source: 'garmin' }], '2026-11-01', 14)?.id).not.toBe(long.id);
    expect(matchGym(plan, [], '2026-10-30')?.type).toBe('strength');
  });
});

describe('schedule warnings', () => {
  it('flags back-to-back hard days, two runs on one day and gym before the long run', () => {
    let w = assign(week, byType('long').id, '2026-11-01');
    w = assign(w, byType('tempo').id, '2026-10-31');
    w = assign(w, byType('strength').id, '2026-10-31');
    const easy = items.filter((x) => x.type === 'easy');
    w = assign(w, easy[0].id, '2026-10-27');
    w = assign(w, easy[1].id, '2026-10-27');
    const warnings = scheduleWarnings(w);
    expect(warnings.get(byType('long').id)!.join()).toMatch(/hard session the day after|after a gym/i);
    expect(warnings.get(byType('strength').id)!.join()).toMatch(/before your long run/);
    expect(warnings.get(easy[0].id)!.join()).toMatch(/Two runs/);
  });
});

describe('suggested days', () => {
  it('assigns unassigned activities to suggested days, keeping the runner’s choices', () => {
    const easy = items.find((w) => w.type === 'easy')!;
    const mine = assign(week, easy.id, '2026-10-30');
    const out = suggestDays(mine, [], plan.paces).week;
    const acts = activitiesOf(out);
    expect(acts.every((w) => dayFor(w))).toBe(true);
    expect(acts.find((w) => w.id === easy.id)!.scheduled).toBe('2026-10-30');
    expect(acts.find((w) => w.type === 'long')!.scheduled).toBe(byType('long').date);
  });

  it('moves suggestions off days blocked in the calendar', () => {
    const long = byType('long');
    const trip: CalendarEvent = { id: 'x', title: 'Wedding', start: `${long.date}T00:00`, end: `${long.date}T00:00`, allDay: true, source: 'ics' };
    const out = suggestDays(week, [trip], plan.paces).week;
    expect(activitiesOf(out).find((w) => w.type === 'long')!.scheduled).not.toBe(long.date);
  });
});

describe('keeping choices when the plan changes', () => {
  it('carries assigned days and ticks into a regenerated plan', () => {
    const long = byType('long');
    const mine = withWeek(plan, assign(week, long.id, '2026-10-31'));
    const regenerated = carryOver(mine, generatePlan(profile, { startDate: '2026-10-22' }));
    expect(regenerated.weeks[1].workouts.find((w) => w.id === long.id)!.scheduled).toBe('2026-10-31');
  });

  it('keeps assigned days through an adaptation', () => {
    const next = plan.weeks.find((w) => w.startDate === '2026-11-23')!;
    const gym = activitiesOf(next).find((w) => w.type === 'strength')!;
    const mine = withWeek(plan, assign(next, gym.id, '2026-11-24'));
    const logs: RunLog[] = [{ id: 'p', date: '2026-11-17', distanceKm: 5, durationSec: 2700, rpe: 5, notes: '', pain: true }];
    const adapted = adaptPlan(mine, profile, logs, assess(mine, logs, [], '2026-11-18'), '2026-11-18');
    expect(adapted.weeks.find((w) => w.startDate === '2026-11-23')!.workouts.find((w) => w.id === gym.id)?.scheduled).toBe('2026-11-24');
  });
});

import { describe, expect, it } from 'vitest';
import { generatePlan } from '../plan';
import { adaptPlan, assess } from '../adapt';
import { daysBetween } from '../dates';
import { pickStrengthDay, strengthSessionFor, strengthText, withStrengthDays } from '../strength';
import { dailyTargets } from '../nutrition';
import { profile as base } from './fixtures';
import type { Plan } from '../../types';

const profile = { ...base, raceDate: '2027-11-07', runDaysPerWeek: 4 as const };
const plan = generatePlan(profile, { startDate: '2026-10-22' });
const strengthDays = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.type === 'strength');

describe('weekly gym strength session', () => {
  it('adds one session every week, with no weights in race week', () => {
    for (const w of plan.weeks) expect(w.workouts.filter((x) => x.type === 'strength'), w.startDate).toHaveLength(1);
    const raceWeekGym = plan.weeks.at(-1)!.workouts.find((x) => x.type === 'strength')!;
    expect(raceWeekGym.strength!.title).toMatch(/Mobility/);
  });

  it('puts it on a rest day at least two days from any long run (Wednesday for a Sunday long run)', () => {
    const longs = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.type === 'long' || w.type === 'race').map((w) => w.date);
    for (const s of strengthDays) {
      expect(Math.min(...longs.map((l) => Math.abs(daysBetween(s.date, l))))).toBeGreaterThanOrEqual(2);
    }
    expect(new Date(`${strengthDays[0].date}T12:00`).getDay()).toBe(3);
  });

  it('periodises the session by phase', () => {
    expect(strengthSessionFor('foundation', false, 30).exercises[0].sets).toBe(3);
    expect(strengthSessionFor('build', false, 10).exercises[0]).toMatchObject({ sets: 4, reps: '5' });
    expect(strengthSessionFor('peak', false, 4).exercises[0].sets).toBe(2);
    expect(strengthSessionFor('taper', false, 2).title).toMatch(/Light/);
    expect(strengthSessionFor('taper', false, 0).title).toMatch(/Mobility/);
    expect(strengthSessionFor('foundation', true, 30).exercises[0].sets).toBe(2); // cutback week
    expect(strengthText(strengthSessionFor('build', false, 10))).toMatch(/Back squat or trap-bar deadlift: 4 × 5/);
  });

  it('uses the only rest day on a 6-day plan, and skips weeks with no rest day far enough from the long run', () => {
    const six = generatePlan({ ...profile, runDaysPerWeek: 6 }, { startDate: '2026-10-22' });
    // 6 run days: the only rest day is Friday, two days before the long run — allowed.
    const gym = six.weeks[3].workouts.find((w) => w.type === 'strength')!;
    expect(new Date(`${gym.date}T12:00`).getDay()).toBe(5);
    const noRest = { ...six.weeks[3], workouts: six.weeks[3].workouts.map((w) => (w.type === 'strength' ? { ...w, type: 'easy' as const, distanceKm: 5 } : w)) };
    expect(pickStrengthDay(noRest, profile.raceDate)).toBeNull();
  });

  it('adds sessions to plans saved before gym days existed, without touching runs', () => {
    const old: Plan = { ...plan, weeks: plan.weeks.map((w) => ({ ...w, workouts: w.workouts.map((x) => (x.type === 'strength' ? { ...x, type: 'rest' as const, strength: undefined } : x)) })) };
    const upgraded = withStrengthDays(old, profile.raceDate);
    expect(upgraded.weeks.flatMap((w) => w.workouts).filter((w) => w.type === 'strength')).toHaveLength(strengthDays.length);
    expect(upgraded.weeks.flatMap((w) => w.workouts).filter((w) => w.distanceKm > 0)).toEqual(old.weeks.flatMap((w) => w.workouts).filter((w) => w.distanceKm > 0));
  });

  it('keeps the gym session through an injury cutback and counts it as a light nutrition day', () => {
    const logs = [{ id: 'p', date: '2026-11-17', distanceKm: 5, durationSec: 2700, rpe: 5, notes: '', pain: true }];
    const a = assess(plan, logs, [], '2026-11-18');
    const next = adaptPlan(plan, profile, logs, a, '2026-11-18').weeks.find((w) => w.startDate === '2026-11-23')!;
    const gym = next.workouts.find((w) => w.type === 'strength')!;
    expect(gym.distanceKm).toBe(0);
    expect(dailyTargets(profile, gym, 50, null).load).toBe('light');
  });
});

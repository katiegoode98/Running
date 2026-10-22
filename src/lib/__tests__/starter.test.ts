import { describe, expect, it } from 'vitest';
import { generatePlan, planWeekCount, weekLabel } from '../plan';
import { adaptPlan, assess } from '../adapt';
import { activitiesOf, carryOver, isDone } from '../schedule';
import { profile as base } from './fixtures';
import type { RunLog } from '../../types';

const profile = { ...base, raceDate: '2027-11-07', runDaysPerWeek: 4 as const, longestRecentRunKm: 12 };
const thursday = generatePlan(profile, { startDate: '2026-10-22' });
const starter = thursday.weeks[0];
const week1 = thursday.weeks[1];

describe('starting mid-week', () => {
  it('makes the rest of this week a lighter starter week and starts week 1 next Monday', () => {
    expect(starter).toMatchObject({ intro: true, startDate: '2026-10-19' });
    expect(week1.startDate).toBe('2026-10-26');
    expect(weekLabel(thursday, starter)).toBe('Starter week');
    expect(weekLabel(thursday, week1)).toBe('Week 1');
    expect(weekLabel(thursday, thursday.weeks[2])).toBe('Week 2');
    expect(planWeekCount(thursday)).toBe(thursday.weeks.length - 1);
  });

  it('is about half a week: easy run, short long run on Sunday, light gym — no speed work', () => {
    const items = activitiesOf(starter);
    expect(items.map((w) => w.type)).toEqual(['long', 'easy', 'strength']);
    expect(items.every((w) => w.date >= '2026-10-22')).toBe(true);
    const long = items.find((w) => w.type === 'long')!;
    expect(long.date).toBe('2026-10-25');
    expect(long.distanceKm).toBeLessThan(activitiesOf(week1).find((w) => w.type === 'long')!.distanceKm);
    expect(starter.targetKm).toBeLessThanOrEqual(Math.round(week1.targetKm * 0.6));
    expect(items.find((w) => w.type === 'strength')!.strength!.title).toMatch(/lighter week/);
    // Gym is at least two days before the long run.
    expect(items.find((w) => w.type === 'strength')!.date).toBe('2026-10-22');
  });

  it('starts the full plan from the runner’s current volume, unaffected by the starter week', () => {
    const fromMonday = generatePlan(profile, { startDate: '2026-10-26' });
    expect(fromMonday.weeks[0].intro).toBeUndefined();
    expect(week1.targetKm).toBe(fromMonday.weeks[0].targetKm);
  });

  it('keeps a full first week when started on Monday or Tuesday', () => {
    expect(generatePlan(profile, { startDate: '2026-10-20' }).weeks[0].intro).toBeUndefined();
  });

  it('shrinks with fewer days left: Sunday gets one short easy run', () => {
    const sunday = activitiesOf(generatePlan(profile, { startDate: '2026-10-25' }).weeks[0]);
    expect(sunday.map((w) => w.type)).toEqual(['easy']);
  });

  it('converts an existing plan, keeping activities already done this week', () => {
    // A plan made before starter weeks existed: week 1 began on Monday 19 Oct.
    const old = generatePlan(profile, { startDate: '2026-10-19' });
    const hills = activitiesOf(old.weeks[0]).find((w) => w.type === 'tempo')!;
    const logs: RunLog[] = [{ id: 'l', date: '2026-10-20', workoutId: hills.id, distanceKm: 6, durationSec: 3200, rpe: 7, notes: '' }];
    const keep = activitiesOf(old.weeks[0]).filter((w) => isDone(w, logs, []));
    const converted = carryOver(old, generatePlan(profile, { startDate: '2026-10-22', paces: old.paces, keep }));
    const items = activitiesOf(converted.weeks[0]);
    expect(converted.weeks[0].intro).toBe(true);
    expect(items.find((w) => w.id === hills.id)).toBeDefined();
    expect(isDone(items.find((w) => w.id === hills.id)!, logs, [])).toBe(true);
    expect(converted.weeks[1].startDate).toBe('2026-10-26');
  });

  it('keeps the starter week and numbering through an adaptation', () => {
    const logs: RunLog[] = [{ id: 'p', date: '2026-11-03', distanceKm: 5, durationSec: 2700, rpe: 5, notes: '', pain: true }];
    const adapted = adaptPlan(thursday, profile, logs, assess(thursday, logs, [], '2026-11-04'), '2026-11-04');
    expect(adapted.weeks[0].intro).toBe(true);
    expect(adapted.weeks.filter((w) => w.intro)).toHaveLength(1);
    const next = adapted.weeks.find((w) => w.startDate === '2026-11-09')!;
    expect(weekLabel(adapted, next)).toBe('Week 3');
  });
});

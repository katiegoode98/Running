import { describe, expect, it } from 'vitest';
import { generatePlan } from '../plan';
import { BLOCK, blockMiles } from '../higdon';
import { KM_PER_MI } from '../format';
import { activitiesOf } from '../schedule';
import { dayOfWeek } from '../dates';
import { profile as base } from './fixtures';
import type { PlanWeek, Profile } from '../../types';

const toMi = (km: number) => Math.round(km / KM_PER_MI);
const profile: Profile = { ...base, planStyle: 'higdon-novice1', raceDate: '2027-11-07', longRunDay: 6, units: 'mi', longestRecentRunKm: 12 };
const plan = generatePlan(profile, { startDate: '2026-10-26' });
const block = plan.weeks.slice(-BLOCK);
const longMi = (w: PlanWeek) => toMi(w.workouts.find((x) => x.type === 'long')?.distanceKm ?? 0);

describe('Higdon-style plan', () => {
  it('starting from 6 miles, tracks Higdon Novice 1 long runs within a mile or two', () => {
    const higdon = [6, 7, 5, 9, 10, 7, 12, 0, 10, 15, 16, 12, 18, 14, 20, 12, 8, 0];
    const ours = Array.from({ length: BLOCK }, (_, b) => blockMiles(b, 6).long);
    ours.forEach((m, b) => expect(Math.abs(m - higdon[b]), `week ${b + 1}`).toBeLessThanOrEqual(2));
    // Midweek sorta-long run 3 → 10 miles, as in Higdon's plan.
    expect(Array.from({ length: 15 }, (_, b) => blockMiles(b, 6).sortaLong)).toEqual([3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10]);
  });

  it('builds the long run to 20 miles three weeks out, with step-backs and a three-week taper', () => {
    const longs = block.map(longMi);
    expect(Math.max(...longs)).toBe(20);
    expect(longs.indexOf(20)).toBe(14);
    expect(block[14].startDate).toBe('2027-10-11');
    expect(longs.slice(15)).toEqual([12, 8, 0]);
    for (const step of [2, 5, 8, 11, 13]) {
      expect(longs[step]).toBeLessThan(longs[step - 1] || longs[step - 2]);
      expect(block[step].cutback).toBe(true);
    }
  });

  it('continues the block from where base training left off', () => {
    // Base long runs reach 10 miles, so the block starts there rather than dropping back to 6.
    expect(longMi(block[0])).toBe(10);
    const fromScratch = generatePlan({ ...profile, raceDate: '2027-03-21', longestRecentRunKm: 9 }, { startDate: '2026-11-16' });
    expect(longMi(fromScratch.weeks.at(-BLOCK)!)).toBe(6);
  });

  it("uses Higdon's week with a Saturday long run: Sat long, Sun cross, Mon rest, Tue/Thu short, Wed sorta-long, Fri rest", () => {
    const week11 = block[10];
    const byDow = new Map(week11.workouts.map((w) => [dayOfWeek(w.date), w]));
    expect(byDow.get(6)).toMatchObject({ type: 'long' });
    expect(byDow.get(0)).toMatchObject({ type: 'cross', durationMin: 60 });
    // Monday is Higdon's rest day; the app's optional gym session sits there.
    expect(['rest', 'strength']).toContain(byDow.get(1)!.type);
    if (byDow.get(1)!.type === 'strength') expect(byDow.get(1)!.title).toMatch(/optional/);
    expect(byDow.get(5)!.type).toBe('rest');
    // Week 11 is like Higdon's 4 / 8 / 4 miles midweek and ~16-mile long run.
    expect([2, 3, 4].map((d) => toMi(byDow.get(d)!.distanceKm))).toEqual([4, 8, 4]);
    expect(Math.abs(toMi(byDow.get(6)!.distanceKm) - 16)).toBeLessThanOrEqual(2);
    expect(byDow.get(3)!.title).toBe('Sorta-long run');
  });

  it('has no speed work: every run is easy, long or a race', () => {
    const types = new Set(block.flatMap((w) => w.workouts).filter((w) => w.distanceKm > 0).map((w) => w.type));
    expect([...types].sort()).toEqual(['easy', 'long', 'race']);
  });

  it('puts a half marathon in week 8 and the marathon on race day', () => {
    expect(block[7].workouts.find((w) => w.type === 'race')).toMatchObject({ title: expect.stringMatching(/Half marathon/) });
    expect(toMi(block[7].workouts.find((w) => w.type === 'race')!.distanceKm)).toBe(13);
    const race = block[17].workouts.find((w) => w.date === '2027-11-07')!;
    expect(race.type).toBe('race');
    expect(block[17].workouts.filter((w) => w.date > '2027-11-07' || w.date === '2027-11-06').every((w) => w.type === 'rest')).toBe(true);
  });

  it('peaks at about 40 miles in week 15', () => {
    expect(toMi(block[14].workouts.reduce((s, w) => s + w.distanceKm, 0))).toBe(40);
  });

  it('builds base weeks beforehand at Higdon’s suggested 15–25 miles a week', () => {
    const baseWeeks = plan.weeks.slice(0, -BLOCK);
    expect(baseWeeks.length).toBeGreaterThan(30);
    for (const w of baseWeeks) {
      const miles = w.workouts.reduce((s, x) => s + x.distanceKm, 0) / KM_PER_MI;
      expect(miles).toBeGreaterThanOrEqual(13);
      expect(miles).toBeLessThanOrEqual(25);
    }
    // Long runs reach 10 miles before the NYC Half on 21 March.
    expect(Math.max(...baseWeeks.filter((w) => w.startDate < '2027-03-15').map(longMi))).toBe(10);
  });

  it('rotates the week around a Sunday long run and keeps the gym session off the day before it', () => {
    const sunday = generatePlan({ ...profile, longRunDay: 0 }, { startDate: '2026-10-26' });
    const wk = sunday.weeks.at(-BLOCK + 10)!;
    const byDow = new Map(wk.workouts.map((w) => [dayOfWeek(w.date), w]));
    expect(byDow.get(0)!.type).toBe('long');
    expect(byDow.get(1)!.type).toBe('cross');
    const gym = activitiesOf(wk).find((w) => w.type === 'strength');
    if (gym) expect(dayOfWeek(gym.date)).not.toBe(6);
  });
});

describe('Higdon-style adaptation', () => {
  it('rebuilds upcoming long runs from what was actually run after missed weeks', async () => {
    const { adaptPlan, assess } = await import('../adapt');
    const p = { ...profile, longRunDay: 0, longestRecentRunKm: 16 };
    const plan = generatePlan(p, { startDate: '2026-10-26' });
    const logs = [{ id: 'a', date: '2026-11-08', distanceKm: 5, durationSec: 2700, rpe: 4, notes: '' }];
    const a = assess(plan, logs, [], '2026-11-12');
    expect(a.recommendation).toBe('reduce');
    const adapted = adaptPlan(plan, p, logs, a, '2026-11-12');
    const next = (pl: typeof plan) => longMi(pl.weeks.find((w) => w.startDate === '2026-11-16')!);
    expect(next(adapted)).toBeLessThan(next(plan));
  });
});

import { describe, expect, it } from 'vitest';
import { generatePlan, isHard } from '../plan';
import { assess, adaptPlan } from '../adapt';
import { profile } from './fixtures';
import type { RunLog } from '../../types';
import { addDays } from '../dates';

const plan = generatePlan(profile, { startDate: '2026-10-22' });

describe('generatePlan', () => {
  it('covers every week up to race week, starting on Mondays', () => {
    expect(plan.weeks[0].startDate).toBe('2026-10-19');
    expect(plan.weeks.at(-1)!.startDate).toBe('2027-04-19');
    expect(plan.weeks.every((w) => w.workouts.length === 7)).toBe(true);
  });

  it('puts the race on race day and tapers the final weeks', () => {
    const last = plan.weeks.at(-1)!;
    expect(last.workouts.find((w) => w.type === 'race')?.date).toBe('2027-04-25');
    expect(plan.weeks.slice(-3).map((w) => w.phase)).toEqual(['taper', 'taper', 'taper']);
    const peak = Math.max(...plan.weeks.map((w) => w.targetKm));
    expect(plan.weeks.at(-2)!.targetKm).toBeLessThan(peak * 0.7);
  });

  it('never increases volume by more than ~10% week on week (excluding rounding)', () => {
    for (let i = 1; i < plan.weeks.length - 3; i++) {
      const prevNonCutback = plan.weeks.slice(0, i).filter((w) => !w.cutback).at(-1)!;
      expect(plan.weeks[i].targetKm).toBeLessThanOrEqual(prevNonCutback.targetKm * 1.1 + 6);
    }
  });

  it('caps long runs at 32 km and places them on the chosen day', () => {
    const longs = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.type === 'long');
    expect(Math.max(...longs.map((l) => l.distanceKm))).toBeLessThanOrEqual(32);
    expect(longs.every((l) => new Date(l.date + 'T12:00').getDay() === 0)).toBe(true);
  });

  it('never schedules hard sessions on consecutive days', () => {
    const all = plan.weeks.flatMap((w) => w.workouts).sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < all.length; i++) {
      if (all[i].type === 'race') continue;
      expect(isHard(all[i].type) && isHard(all[i - 1].type)).toBe(false);
    }
  });
});

describe('adaptation', () => {
  const today = '2026-11-18';
  const log = (date: string, km: number, rpe: number, extra: Partial<RunLog> = {}): RunLog => ({ id: date + km, date, distanceKm: km, durationSec: km * 360, rpe, notes: '', ...extra });

  it('rebuilds the ramp from actual volume when sessions are missed', () => {
    const logs = [log('2026-11-03', 5, 4), log('2026-11-10', 6, 4)];
    const a = assess(plan, logs, [], today);
    expect(a.recommendation).toBe('reduce');
    const adapted = adaptPlan(plan, profile, logs, a, today);
    const next = adapted.weeks.find((w) => w.startDate === '2026-11-23')!;
    const original = plan.weeks.find((w) => w.startDate === '2026-11-23')!;
    expect(next.targetKm).toBeLessThan(original.targetKm);
    expect(adapted.weeks.at(-1)!.workouts.some((w) => w.type === 'race')).toBe(true);
  });

  it('cuts back after a pain flag and removes quality sessions', () => {
    const weeks = plan.weeks.filter((w) => w.startDate < '2026-11-16');
    const logs = weeks.flatMap((w) => w.workouts.filter((x) => x.distanceKm > 0).map((x) => log(x.date, x.distanceKm, 4, { workoutId: x.id })));
    logs.push(log(addDays(today, -1), 5, 5, { pain: true }));
    const a = assess(plan, logs, [], today);
    expect(a.recommendation).toBe('injury');
    const next = adaptPlan(plan, profile, logs, a, today).weeks.find((w) => w.startDate === '2026-11-23')!;
    expect(next.workouts.some((w) => ['tempo', 'intervals', 'marathon-pace'].includes(w.type))).toBe(false);
    expect(next.adaptationNote).toMatch(/Injury/);
  });

  it('leaves the plan alone when training is on track', () => {
    const weeks = plan.weeks.filter((w) => w.startDate < '2026-11-16');
    const logs = weeks.flatMap((w) => w.workouts.filter((x) => x.distanceKm > 0).map((x) => log(x.date, x.distanceKm, 4, { workoutId: x.id })));
    expect(assess(plan, logs, [], today).recommendation).toBe('none');
  });
});

import { describe, expect, it } from 'vitest';
import { BLOCK_WEEKS, generatePlan, peakVolumeKm } from '../plan';
import { nextAction } from '../races';
import { nycEntryRoutes, nycSeedRaces, WELLHUB_GOLD } from '../presets';
import { parseTimetable, pickWeeklyClasses, scoreClasses } from '../gym';
import { profile as base } from './fixtures';

const profile = { ...base, raceName: 'NYC', raceDate: '2027-11-07' };
const plan = generatePlan(profile, { startDate: '2026-10-22' });

describe('NYC 2027 plan (54-week lead time)', () => {
  it('runs a foundation phase before an 18-week marathon block', () => {
    expect(plan.weeks.at(-1)!.workouts.find((w) => w.type === 'race')?.date).toBe('2027-11-07');
    const foundation = plan.weeks.filter((w) => w.phase === 'foundation');
    expect(foundation.length).toBe(plan.weeks.length - BLOCK_WEEKS);
    expect(plan.weeks[plan.weeks.length - BLOCK_WEEKS].phase).toBe('base');
  });

  it('holds foundation volume near 75% of peak and long runs at half-marathon distance', () => {
    const peak = peakVolumeKm(profile);
    const foundation = plan.weeks.filter((w) => w.phase === 'foundation');
    expect(Math.max(...foundation.map((w) => w.targetKm))).toBeLessThanOrEqual(Math.round(peak * 0.75) + 4);
    const longs = foundation.flatMap((w) => w.workouts).filter((w) => w.type === 'long');
    expect(Math.max(...longs.map((l) => l.distanceKm))).toBeLessThanOrEqual(22);
    // Long enough by mid-March to race the NYC Half comfortably.
    expect(longs.filter((l) => l.date < '2027-03-21').at(-1)!.distanceKm).toBeGreaterThanOrEqual(17);
    const blockLongs = plan.weeks.slice(-BLOCK_WEEKS).flatMap((w) => w.workouts).filter((w) => w.type === 'long');
    expect(Math.max(...blockLongs.map((l) => l.distanceKm))).toBeGreaterThanOrEqual(29);
  });
});

describe('NYC entry tracking', () => {
  it('flags the NYC Half drawing as open now and the marathon drawing as upcoming', () => {
    const [marathon, half] = nycSeedRaces(() => Math.random().toString());
    expect(nextAction(half, '2026-10-22')).toMatchObject({ urgency: 'soon', text: 'Enter the lottery — closes in 20 days' });
    expect(nextAction(marathon, '2026-10-22').text).toMatch(/Lottery opens in \d+ days/);
    const routes = nycEntryRoutes('2026-10-22');
    expect(routes.find((r) => r.name === 'Time qualifier')!.status).toBe('open');
    expect(nycEntryRoutes('2027-01-05').find((r) => r.name === 'Time qualifier')!.status).toBe('closed');
  });
});

describe('Wellhub', () => {
  it('limits premium classes to the weekly share of the monthly allowance', () => {
    const classes = parseTimetable("Tue, 18:30, Barry's Bootcamp, 50\nWed, 07:00, Barry's Bootcamp, 50\nThu, 18:00, Strength Lab, 45", 'g', () => Math.random().toString());
    expect(classes.filter((c) => c.premium)).toHaveLength(2);
    const week = plan.weeks[2];
    const scored = scoreClasses(week, classes.map((c) => ({ ...c, category: 'strength' as const })), [{ id: 'g', name: 'Gym', address: '' }], profile, [], null, null);
    const picked = pickWeeklyClasses(scored, week.phase, Math.floor(WELLHUB_GOLD.premiumPerMonth! / 4));
    expect(picked.filter((p) => p.cls.premium)).toHaveLength(1);
  });
});

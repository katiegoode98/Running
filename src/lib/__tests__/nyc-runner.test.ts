import { describe, expect, it } from 'vitest';
import { generatePlan, LONG_RUN_MAX_MIN } from '../plan';
import { computePaces, suggestGoals } from '../paces';
import { nextAction } from '../races';
import { nycSeedRaces } from '../presets';
import { geocodeQueries } from '../gym';
import { accessKm, ordinal, routeOptions } from '../routes';
import { profile as base } from './fixtures';
import type { Profile } from '../../types';

// A 2:20 half-marathon runner aiming at NYC 2027 with a guaranteed entry.
const half = { distanceKm: 21.0975, timeSec: (2 * 60 + 20) * 60 };
const goals = suggestGoals(half);
const profile: Profile = { ...base, raceDate: '2027-11-07', recentRace: half, goalTimeSec: goals[1].timeSec, currentWeeklyKm: 20, longestRecentRunKm: 12, runDaysPerWeek: 4 };
const plan = generatePlan(profile, { startDate: '2026-10-22' });

describe('goals from a 2:20 half', () => {
  it('suggests finish / realistic / stretch times', () => {
    expect(goals.map((g) => g.timeSec / 60)).toEqual([290, 270, 255]); // 4:50, 4:30, 4:15
  });
});

describe('time-capped long runs', () => {
  it('keeps every long run under ~3.5 hours at long-run pace', () => {
    const paces = computePaces(profile.goalTimeSec, half);
    const longs = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.type === 'long');
    const longestMin = Math.max(...longs.map((l) => (l.distanceKm * paces.long) / 60));
    expect(longestMin).toBeLessThanOrEqual(LONG_RUN_MAX_MIN);
    expect(Math.max(...longs.map((l) => l.distanceKm))).toBeGreaterThanOrEqual(24);
  });
});

describe('9+1 guaranteed entry', () => {
  it('tracks the claim window instead of the drawing', () => {
    const [nyc] = nycSeedRaces(() => 'x', true);
    expect(nyc.status).toBe('guaranteed');
    expect(nextAction(nyc, '2026-10-22').text).toMatch(/claim window opens in \d+ days/);
    expect(nextAction(nyc, '2027-02-10')).toMatchObject({ urgency: 'urgent' });
    expect(nextAction(nyc, '2027-02-10').text).toMatch(/forfeited/);
  });
});

describe('home in lower Manhattan', () => {
  it('geocodes cross streets via a fallback query', () => {
    expect(geocodeQueries('Houston St & 6th Ave, New York, NY')).toEqual(['Houston St & 6th Ave, New York, NY', 'Houston St, New York, NY']);
    expect(geocodeQueries('Prince and Mercer')).toEqual(['Prince and Mercer', 'Prince Street, New York, NY']);
  });

  it('offers several route options for a long run from home', () => {
    const home = { lat: 40.7308, lon: -73.9973 }; // Washington Square Park
    expect(accessKm(home)).toBeGreaterThan(0.8);
    expect(accessKm(home)).toBeLessThan(2);
    const long = { id: 'l', date: '2027-09-19', type: 'long' as const, distanceKm: 20, title: 'Long run', description: '' };
    const options = routeOptions(long, { home, homeAddress: 'Houston St & 6th Ave, New York, NY', nyc: true });
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0].title).toMatch(/Greenway/);
    expect(options[0].detail).toMatch(/W 1\d\d(st|nd|rd|th) St/);
    expect(Math.abs(options[0].km - 20)).toBeLessThan(1.5);
    expect(options.some((r) => r.title.startsWith('Central Park'))).toBe(true);
    expect(options[0].mapsUrl).toContain('waypoints=');
    expect(new URL(options[0].mapsUrl).searchParams.get('origin')).toBe('Houston St & 6th Ave, New York, NY');
    expect(ordinal(72)).toBe('72nd');
    expect(ordinal(111)).toBe('111th');
  });
});

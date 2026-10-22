import { describe, expect, it } from 'vitest';
import { fitToDistance, gettingThere, kmFromHome, NYC_ROUTES, routesFor } from '../nycRoutes';

const home = { lat: 40.7308, lon: -73.9973 }; // Washington Square Park
const byId = (id: string) => NYC_ROUTES.find((r) => r.id === id)!;

describe('NYC route catalogue', () => {
  it('has a distance, elevation, source and start for every route, with gain inside any quoted range', () => {
    expect(NYC_ROUTES.length).toBeGreaterThanOrEqual(12);
    for (const r of NYC_ROUTES) {
      expect(r.km).toBeGreaterThan(0);
      expect(r.gainM).toBeGreaterThanOrEqual(0);
      expect(r.source.url).toMatch(/^https:\/\//);
      if (r.gainRange) {
        expect(r.gainM).toBeGreaterThanOrEqual(r.gainRange[0]);
        expect(r.gainM).toBeLessThanOrEqual(r.gainRange[1]);
      }
    }
    expect(new Set(NYC_ROUTES.map((r) => r.id)).size).toBe(NYC_ROUTES.length);
  });

  it('uses the published loop distances', () => {
    expect(byId('cp-loop').km).toBeCloseTo(6.1 * 1.609, 0);
    expect(byId('cp-reservoir').km).toBeCloseTo(1.58 * 1.609, 1);
    expect(byId('prospect').km).toBeCloseTo(3.35 * 1.609, 0);
  });
});

describe('fitting a planned run to a route', () => {
  it('counts Central Park laps when travelling there, and runs-there-and-back for nearby starts', () => {
    expect(fitToDistance(byId('cp-loop'), 20, home)).toMatch(/^2 laps/);
    expect(fitToDistance(byId('cp-loop'), 20, null)).toMatch(/^2 laps/);
    const hudson = fitToDistance(byId('hudson-battery-59'), 10, home);
    expect(hudson).toMatch(/Run ~[\d.]+ km there and back, plus turn around after/);
  });

  it('suggests a one-way run and subway home when the distance exceeds the route', () => {
    expect(fitToDistance(byId('hudson-battery-59'), 30, null)).toMatch(/one way and take the subway home/);
  });

  it('turns hill routes into repeats', () => {
    expect(fitToDistance(byId('harlem-hill'), 8, null)).toMatch(/\d repeats/);
  });

  it('measures distance from home and how to get there', () => {
    expect(kmFromHome(byId('hudson-battery-59'), home)!).toBeLessThan(5);
    expect(gettingThere(byId('prospect'), home)).toMatch(/subway/);
    expect(gettingThere(byId('cp-loop'), null)).toBe('');
  });

  it('picks routes for a run type, nearest first', () => {
    const long = routesFor('long', home);
    expect(long.every((r) => r.uses.includes('long'))).toBe(true);
    expect(routesFor('Hills / fartlek', home).every((r) => r.uses.includes('hills'))).toBe(true);
    const d = long.map((r) => kmFromHome(r, home)!);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });
});

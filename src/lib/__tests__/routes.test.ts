import { describe, expect, it } from 'vitest';
import { centralParkLoops, routeOptions } from '../routes';
import type { Workout } from '../../types';

const home = { lat: 40.7308, lon: -73.9973 };
const ctx = { home, homeAddress: '', nyc: true };
const run = (type: Workout['type'], distanceKm: number, title = 'Run'): Workout => ({ id: 'x', date: '2027-01-10', type, distanceKm, title, description: '' });

describe('route options per run', () => {
  it('gives every running workout at least two options, and none for rest or race days', () => {
    for (const w of [run('recovery', 4), run('easy', 6.5), run('easy', 10), run('long', 13), run('long', 25), run('tempo', 8, 'Threshold run'), run('intervals', 9), run('marathon-pace', 12)]) {
      expect(routeOptions(w, ctx).length, `${w.type} ${w.distanceKm}`).toBeGreaterThanOrEqual(2);
    }
    expect(routeOptions(run('rest', 0), ctx)).toEqual([]);
    expect(routeOptions(run('race', 42.2), ctx)).toEqual([]);
  });

  it('suggests bridge repeats for hill sessions and flat routes for intervals', () => {
    expect(routeOptions(run('tempo', 6, 'Hills / fartlek'), ctx)[0].title).toMatch(/Williamsburg/);
    const intervals = routeOptions(run('intervals', 9), ctx);
    expect(intervals[0].tags).toContain('flat');
    expect(intervals.some((r) => r.title.startsWith('Brooklyn'))).toBe(false);
  });

  it('sizes Central Park loops to the distance', () => {
    expect(centralParkLoops(9.8)).toBe('1 full loop (9.8 km each)');
    expect(centralParkLoops(15)).toMatch(/1 full loop.*1 × the lower loop.*2\.5 km/);
  });

  it('falls back to generic options outside NYC', () => {
    const generic = routeOptions(run('easy', 8), { home: null, homeAddress: '10 Main St, Leeds', nyc: false });
    expect(generic[0].title).toBe('Out-and-back from home');
    expect(generic[0].detail).toMatch(/4 km out/);
  });
});

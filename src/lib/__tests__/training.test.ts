import { describe, expect, it } from 'vitest';
import { recentWeeks, summariseWeek } from '../training';
import { assess } from '../adapt';
import { generatePlan } from '../plan';
import { profile } from './fixtures';
import type { ActivityLog, RunLog } from '../../types';

const run = (date: string, km: number, min: number, rpe: number, extra: Partial<RunLog> = {}): RunLog => ({ id: date + km, date, distanceKm: km, durationSec: min * 60, rpe, notes: '', ...extra });
const cls = (date: string, kind: ActivityLog['kind'], min: number, rpe: number): ActivityLog => ({ id: date + kind, date, kind, name: kind, durationMin: min, rpe, notes: '' });

describe('weekly training summary', () => {
  it('combines runs and classes into time, sessions and load', () => {
    const w = summariseWeek('2026-10-19', [run('2026-10-20', 6, 50, 4), run('2026-10-25', 13, 110, 5), run('2026-10-27', 5, 40, 4)], [cls('2026-10-21', 'strength', 50, 6), cls('2026-10-22', 'spin', 45, 7)]);
    expect(w).toMatchObject({ runs: 2, runKm: 19, runMin: 160, otherMin: 95, sessionCount: 2, totalMin: 255 });
    expect(w.sessions).toEqual({ strength: 1, spin: 1 });
    expect(w.load).toBe(50 * 4 + 110 * 5 + 50 * 6 + 45 * 7);
  });

  it('lists the last 8 weeks oldest first, ending this week', () => {
    const weeks = recentWeeks('2026-10-22', 8, [], []);
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)!.weekStart).toBe('2026-10-19');
    expect(weeks[0].weekStart).toBe('2026-08-31');
  });
});

describe('heart-rate check on easy runs', () => {
  it('flags easy runs done too hard', () => {
    const plan = generatePlan(profile, { startDate: '2026-10-22' });
    const easy = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.type === 'easy' && w.date < '2026-11-18' && w.date >= '2026-11-04');
    const logs = easy.map((w) => run(w.date, w.distanceKm, w.distanceKm * 6.5, 4, { workoutId: w.id, avgHr: 165 }));
    const a = assess(plan, logs, [], '2026-11-18', 190);
    expect(a.notes.join(' ')).toMatch(/easy runs averaged 87% of max heart rate/);
    expect(assess(plan, logs.map((l) => ({ ...l, avgHr: 135 })), [], '2026-11-18', 190).notes.join(' ')).not.toMatch(/max heart rate/);
  });
});

import { describe, expect, it } from 'vitest';
import { isPlausibleTime, parseDuration, parseRaceTime } from '../format';
import { computePaces, MARATHON_KM } from '../paces';

const HALF = 21.0975;

describe('parseDuration', () => {
  it('accepts colons, dots and h/m markers', () => {
    expect(parseDuration('1:50:00')).toBe(6600);
    expect(parseDuration('52:30')).toBe(3150);
    expect(parseDuration('52.30')).toBe(3150);
    expect(parseDuration('2h30')).toBe(150 * 60);
    expect(parseDuration('2h 30m')).toBe(150 * 60);
    expect(parseDuration('45 min')).toBe(2700);
    expect(parseDuration('abc')).toBeNaN();
    expect(parseDuration('')).toBeNaN();
  });
});

describe('parseRaceTime', () => {
  it('reads "2.30" and "2:30" for a half marathon as 2 hours 30 minutes', () => {
    for (const t of ['2.30', '2:30', '2,30', '2h30', '2:30:00']) expect(parseRaceTime(t, HALF)).toBe(9000);
  });

  it('keeps genuine mm:ss times as they are', () => {
    expect(parseRaceTime('52:30', 10)).toBe(3150);
    expect(parseRaceTime('25:10', 5)).toBe(1510);
    expect(parseRaceTime('48', 8)).toBe(2880); // bare minutes
  });

  it('reads short goal formats for a marathon', () => {
    expect(parseRaceTime('4.45', MARATHON_KM)).toBe(4.75 * 3600);
    expect(parseRaceTime('4:45', MARATHON_KM)).toBe(4.75 * 3600);
    expect(parseRaceTime('5', MARATHON_KM)).toBe(5 * 3600);
  });

  it('rejects impossible times', () => {
    expect(parseRaceTime('0:30', HALF)).toBeNaN();
    expect(parseRaceTime('30:00:00', 5)).toBeNaN();
    expect(isPlausibleTime(138, HALF)).toBe(false);
  });

  it('produces sensible paces from a 2.30 half (the original bug)', () => {
    const paces = computePaces(4.75 * 3600, { distanceKm: HALF, timeSec: parseRaceTime('2.30', HALF) });
    expect(paces.easy).toBeGreaterThan(8 * 60); // ~8:54/km, not 0:09/km
    expect(paces.tempo).toBeGreaterThan(6 * 60);
  });
});

describe('workout durations', () => {
  it('formats minutes to the nearest 5', async () => {
    const { fmtMinutes } = await import('../format');
    expect(fmtMinutes(43)).toBe('45 min');
    expect(fmtMinutes(124)).toBe('2 h 05 min');
    expect(fmtMinutes(2)).toBe('5 min');
  });

  it('estimates easy runs at their pace and quality sessions with easy warm-up/recoveries', async () => {
    const { runMinutes } = await import('../plan');
    const paces = { recovery: 578, easy: 534, long: 498, marathon: 427, tempo: 418, interval: 400 };
    const base = { id: 'x', date: '2026-11-01', title: '', description: '' };
    expect(runMinutes({ ...base, type: 'long', distanceKm: 12, paceSecPerKm: 498 }, paces)).toBeCloseTo(99.6, 1);
    const tempo = runMinutes({ ...base, type: 'tempo', distanceKm: 8, paceSecPerKm: 418 }, paces);
    expect(tempo).toBeGreaterThan((8 * 418) / 60);
    expect(tempo).toBeLessThan((8 * 534) / 60);
    expect(runMinutes({ ...base, type: 'rest', distanceKm: 0 }, paces)).toBe(0);
  });
});

import type { Paces } from '../types';

export const MARATHON_KM = 42.195;

/** Riegel's endurance model: T2 = T1 × (D2 / D1)^1.06. */
export function riegel(timeSec: number, fromKm: number, toKm: number): number {
  return timeSec * Math.pow(toKm / fromKm, 1.06);
}

/**
 * Training paces (sec/km). Easy, long and workout paces are anchored on the
 * runner's *current* fitness so sessions stay achievable; marathon-pace work
 * uses the goal pace (capped at ~4% faster than current fitness) so the body
 * learns race rhythm without turning every MP session into a threshold run.
 * Ratios follow the usual Daniels / Pfitzinger relationships between race
 * paces and training zones.
 */
export function computePaces(goalTimeSec: number, recentRace?: { distanceKm: number; timeSec: number }): Paces {
  const goalMp = goalTimeSec / MARATHON_KM;
  const fitnessMp = recentRace
    ? riegel(recentRace.timeSec, recentRace.distanceKm, MARATHON_KM) / MARATHON_KM
    : goalMp * 1.04; // without evidence, assume current fitness is a little short of goal
  return {
    recovery: Math.round(fitnessMp * 1.3),
    easy: Math.round(fitnessMp * 1.2),
    long: Math.round(fitnessMp * 1.12),
    // Never prescribe marathon pace much faster than current fitness supports:
    // it starts between fitness and goal and reaches goal pace as results improve.
    marathon: Math.round(Math.max(goalMp, fitnessMp * 0.96)),
    tempo: Math.round(fitnessMp * 0.94),
    interval: Math.round(fitnessMp * 0.9),
  };
}

export interface GoalOption {
  label: string;
  timeSec: number;
  why: string;
}

/**
 * Goal options from a recent race. Riegel predicts today's marathon fitness;
 * a year of consistent training commonly takes 5–13% off that for runners
 * who haven't done a structured marathon block.
 */
export function suggestGoals(recentRace: { distanceKm: number; timeSec: number }): GoalOption[] {
  const now = predictedMarathonSec(recentRace);
  const r5 = (s: number) => Math.round(s / 300) * 300;
  return [
    { label: 'Finish strong', timeSec: r5(now), why: 'Your current fitness — a confident first marathon' },
    { label: 'Realistic', timeSec: r5(now * 0.92), why: 'Achievable with a year of consistent training' },
    { label: 'Stretch', timeSec: r5(now * 0.87), why: 'Needs everything to go well — revisit after your spring half' },
  ];
}

export function predictedMarathonSec(recentRace: { distanceKm: number; timeSec: number }): number {
  return riegel(recentRace.timeSec, recentRace.distanceKm, MARATHON_KM);
}

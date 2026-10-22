import type { ActivityLog, ClassCategory, RunLog } from '../types';
import { addDays, mondayOf } from './dates';

/*
 * Weekly training summary across runs and cross-training. "Load" is the
 * session-RPE method (Foster 2001): minutes × effort (1–10), summed over the
 * week — a simple way to compare weeks that mix running and gym work.
 */

export interface WeekSummary {
  weekStart: string;
  runs: number;
  runKm: number;
  runMin: number;
  otherMin: number;
  sessions: Partial<Record<ClassCategory, number>>;
  sessionCount: number;
  totalMin: number;
  load: number;
}

export function summariseWeek(weekStart: string, logs: RunLog[], activities: ActivityLog[]): WeekSummary {
  const end = addDays(weekStart, 7);
  const runs = logs.filter((l) => l.date >= weekStart && l.date < end);
  const acts = activities.filter((a) => a.date >= weekStart && a.date < end);
  const runMin = runs.reduce((s, l) => s + l.durationSec / 60, 0);
  const otherMin = acts.reduce((s, a) => s + a.durationMin, 0);
  const sessions: WeekSummary['sessions'] = {};
  for (const a of acts) sessions[a.kind] = (sessions[a.kind] ?? 0) + 1;
  const load = runs.reduce((s, l) => s + (l.durationSec / 60) * l.rpe, 0) + acts.reduce((s, a) => s + a.durationMin * a.rpe, 0);
  return {
    weekStart,
    runs: runs.length,
    runKm: Math.round(runs.reduce((s, l) => s + l.distanceKm, 0) * 10) / 10,
    runMin: Math.round(runMin),
    otherMin: Math.round(otherMin),
    sessions,
    sessionCount: acts.length,
    totalMin: Math.round(runMin + otherMin),
    load: Math.round(load),
  };
}

/** The last `n` weeks, oldest first, ending with the current week. */
export function recentWeeks(todayIso: string, n: number, logs: RunLog[], activities: ActivityLog[]): WeekSummary[] {
  const thisMonday = mondayOf(todayIso);
  return Array.from({ length: n }, (_, i) => summariseWeek(addDays(thisMonday, -7 * (n - 1 - i)), logs, activities));
}

export const KIND_LABEL: Record<ClassCategory, string> = {
  strength: 'Strength', yoga: 'Yoga', pilates: 'Pilates/barre', spin: 'Cycling', hiit: 'HIIT', swim: 'Swim', other: 'Other',
};

import type { Units } from '../types';

export const KM_PER_MI = 1.609344;

export function fmtDist(km: number, units: Units, digits = 1): string {
  const v = units === 'mi' ? km / KM_PER_MI : km;
  return `${v.toFixed(digits)} ${units}`;
}

export function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtPace(secPerKm: number, units: Units): string {
  const s = units === 'mi' ? secPerKm * KM_PER_MI : secPerKm;
  return `${fmtDuration(s)}/${units}`;
}

/** Parses "3:45:00", "45:00" or "45" (minutes) into seconds. Returns NaN when invalid. */
export function parseDuration(text: string): number {
  const parts = text.trim().split(':').map(Number);
  if (parts.length === 0 || parts.some((p) => Number.isNaN(p))) return NaN;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

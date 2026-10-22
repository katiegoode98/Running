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

/** "45 min" or "1 h 05 min", rounded to the nearest 5 minutes. */
export function fmtMinutes(min: number): string {
  const m = Math.max(5, Math.round(min / 5) * 5);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function fmtPace(secPerKm: number, units: Units): string {
  const s = units === 'mi' ? secPerKm * KM_PER_MI : secPerKm;
  return `${fmtDuration(s)}/${units}`;
}

/**
 * Parses "3:45:00", "45:00" or "45" (minutes) into seconds. Dots, commas and
 * h/m markers work as separators too ("2.30", "2h30", "45m"). Returns NaN when invalid.
 */
export function parseDuration(text: string): number {
  const hasHours = /\d\s*(hours?|hrs?|h)\b|\dh/i.test(text);
  const normalised = text
    .trim()
    .toLowerCase()
    .replace(/\s*(hours?|hrs?|h)\s*/g, ':')
    .replace(/\s*(minutes?|mins?|m)\s*/g, ':')
    .replace(/\s*(seconds?|secs?|s)\s*$/, '')
    .replace(/[.,'"]/g, ':')
    .replace(/:+$/, '');
  if (!normalised) return NaN;
  const parts = normalised.split(':').map((p) => (p === '' ? NaN : Number(p)));
  if (parts.length > 3 || parts.some((p) => Number.isNaN(p))) return NaN;
  if (hasHours && parts.length <= 2) return parts[0] * 3600 + (parts[1] ?? 0) * 60;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Elite half/marathon pace is ~2:50/km; walking is ~10–12 min/km.
const FASTEST_SEC_PER_KM = 155;
const SLOWEST_SEC_PER_KM = 1200;

export function isPlausibleTime(sec: number, km: number): boolean {
  if (!(sec > 0) || !(km > 0)) return false;
  const pace = sec / km;
  return pace >= FASTEST_SEC_PER_KM && pace <= SLOWEST_SEC_PER_KM;
}

/**
 * Parses a time for a known distance. "2:30" or "2.30" for a half marathon is
 * read as 2 h 30 min rather than 2 min 30 s, because no one runs that fast.
 * Returns NaN when no reading gives a humanly possible pace.
 */
export function parseRaceTime(text: string, km: number): number {
  const sec = parseDuration(text);
  if (Number.isNaN(sec)) return NaN;
  if (isPlausibleTime(sec, km)) return sec;
  const asHours = sec * 60; // "h:mm" typed where "mm:ss" was assumed, or "h" alone
  if (text.replace(/[^:.,h]/gi, '').length <= 1 && isPlausibleTime(asHours, km)) return asHours;
  return NaN;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

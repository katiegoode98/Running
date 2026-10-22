import type { CalendarEvent, ClassCategory, Geo, Gym, GymClass, PlanWeek, Profile, Workout } from '../types';
import { addDays, minutesOfDay } from './dates';
import { busyIntervals } from './calendar';
import { isHard } from './plan';
import { looksPremium } from './presets';
import { isRunningClass } from './studios';

// ---------- Maps ----------

/** Geocodes an address with OpenStreetMap Nominatim (no API key needed). */
export async function geocode(address: string): Promise<Geo | null> {
  for (const q of geocodeQueries(address)) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { lat: string; lon: string }[];
    if (data[0]) return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
  }
  return null;
}

/**
 * Nominatim can't resolve street intersections ("Houston & 6th Ave"), so
 * fall back to the first street on its own in the same city — close enough for
 * travel-time estimates.
 */
export function geocodeQueries(address: string): string[] {
  const a = address.trim();
  if (!a) return [];
  const m = a.match(/^(?:(?:the )?corner of )?(.+?)\s+(?:&|and|\/|at)\s+(.+?)(,.*)?$/i);
  if (!m) return [a];
  const city = m[3] ?? ', New York, NY';
  const street = /\b(st|street|ave|avenue|pl|place|rd|road|blvd)\.?$/i.test(m[1]) ? m[1] : `${m[1]} Street`;
  return [a, `${street}${city}`];
}

export function haversineKm(a: Geo, b: Geo): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough door-to-door minutes: walk under 2 km, otherwise urban transit/cycle speeds. */
export function travelMinutes(km: number): number {
  const road = km * 1.3;
  return Math.round(road < 2 ? (road / 5) * 60 : (road / 18) * 60 + 8);
}

export function directionsUrl(from: string, to: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`;
}

// ---------- Class recommendations ----------

const BASE_SCORE: Record<ClassCategory, number> = { strength: 5, pilates: 4, yoga: 4, swim: 3, spin: 2, hiit: 1, other: 1 };
const DEMANDING: ClassCategory[] = ['strength', 'hiit', 'spin'];
const RECOVERY: ClassCategory[] = ['yoga', 'pilates', 'swim'];

export interface ClassSuggestion {
  cls: GymClass;
  gym: Gym;
  date: string;
  score: number;
  reasons: string[];
  travelMin: number | null;
  from: 'home' | 'work' | null;
  blocked: boolean;
}

export function guessCategory(name: string): ClassCategory {
  const n = name.toLowerCase();
  if (/yoga|stretch|mobility/.test(n)) return 'yoga';
  if (/pilates|core|barre/.test(n)) return 'pilates';
  if (/spin|cycle|ride|rpm/.test(n)) return 'spin';
  if (/hiit|bootcamp|circuit|tabata|metcon|blaze|grit/.test(n)) return 'hiit';
  if (/swim|aqua/.test(n)) return 'swim';
  if (/strength|weights|pump|lift|kettlebell|conditioning|body ?pump/.test(n)) return 'strength';
  return 'other';
}

export function scoreClasses(
  week: PlanWeek,
  classes: GymClass[],
  gyms: Gym[],
  profile: Profile,
  events: CalendarEvent[],
  home: Geo | null,
  work: Geo | null,
): ClassSuggestion[] {
  const byDate = new Map(week.workouts.map((w) => [w.date, w]));
  const gymById = new Map(gyms.map((g) => [g.id, g]));
  const out: ClassSuggestion[] = [];

  for (const cls of classes) {
    const gym = gymById.get(cls.gymId);
    if (!gym) continue;
    const date = addDays(week.startDate, (cls.dayOfWeek + 6) % 7);
    const today: Workout | undefined = byDate.get(date);
    const tomorrow = byDate.get(addDays(date, 1));
    const yesterday = byDate.get(addDays(date, -1));
    const reasons: string[] = [];
    let score = BASE_SCORE[cls.category];
    const demanding = DEMANDING.includes(cls.category);

    if (cls.category === 'strength') reasons.push('Strength work reduces injury risk and improves running economy');
    if (RECOVERY.includes(cls.category)) reasons.push('Builds mobility/core with low impact');

    if (week.phase === 'taper') {
      if (demanding) { score -= cls.category === 'strength' ? 2 : 4; reasons.push('Taper: keep it light'); }
    } else if (week.phase === 'peak' && cls.category === 'hiit') {
      score -= 2; reasons.push('Peak phase: HIIT competes with key runs');
    }
    if (cls.runningLoad) {
      // Treadmill classes are a hard run: they should replace a quality session, not add one.
      if (today && ['tempo', 'intervals', 'marathon-pace'].includes(today.type)) {
        score += 3; reasons.push(`Treadmill intervals — do this instead of your ${today.title.toLowerCase()}`);
      } else if (today?.type === 'easy' || today?.type === 'recovery') {
        score -= 3; reasons.push('Would turn an easy day into a hard one');
      } else if (today?.type === 'rest') {
        score -= 2; reasons.push('Adds a hard run on a rest day');
      }
      if (week.phase === 'build' || week.phase === 'peak') { score -= 2; reasons.push('Marathon-specific phase: run your own sessions'); }
    }
    if (demanding && tomorrow && (tomorrow.type === 'long' || tomorrow.type === 'race')) {
      score -= 6; reasons.push(`Day before your ${tomorrow.title.toLowerCase()} — arrive with fresh legs`);
    } else if (demanding && tomorrow && isHard(tomorrow.type)) {
      score -= 4; reasons.push(`Day before your ${tomorrow.title.toLowerCase()}`);
    }
    if (today?.type === 'long' || today?.type === 'race') {
      if (RECOVERY.includes(cls.category)) { score += 1; reasons.push('Gentle stretch after the long run'); }
      else { score -= 3; reasons.push('Same day as the long run'); }
    } else if (today && isHard(today.type) && demanding && !cls.runningLoad) {
      score += 1; reasons.push('Stacks on a hard day so easy days stay easy');
    } else if (today?.type === 'rest') {
      score += 1; reasons.push('Fits a non-running day');
    }
    if (yesterday?.type === 'long') {
      if (RECOVERY.includes(cls.category)) { score += 2; reasons.push('Active recovery after the long run'); }
      if (cls.category === 'hiit') score -= 3;
    }

    // Travel from wherever you're likely to be at class time.
    const gymGeo = gym.lat != null && gym.lon != null ? { lat: gym.lat, lon: gym.lon } : null;
    const start = minutesOfDay(cls.startTime);
    const atWork = profile.workDays.includes(cls.dayOfWeek) && start >= 7 * 60 && start <= 19 * 60;
    let travelMin: number | null = null;
    let from: ClassSuggestion['from'] = null;
    if (gymGeo) {
      const options: [('home' | 'work'), Geo | null][] = atWork ? [['work', work], ['home', home]] : [['home', home]];
      for (const [label, geo] of options) {
        if (!geo) continue;
        const t = travelMinutes(haversineKm(geo, gymGeo));
        if (travelMin === null || t < travelMin) { travelMin = t; from = label; }
      }
      if (travelMin !== null) {
        score -= travelMin / 10;
        reasons.push(`~${travelMin} min from ${from}`);
      }
    }

    const t0 = start - (travelMin ?? 15);
    const t1 = start + cls.durationMin + (travelMin ?? 15);
    const clash = busyIntervals(date, events).some(([s, e]) => s < t1 && e > t0);
    if (clash) reasons.push('Clashes with your calendar');
    const raceDay = today?.type === 'race' || tomorrow?.type === 'race';

    out.push({ cls, gym, date, score: Math.round(score * 10) / 10, reasons, travelMin, from, blocked: clash || raceDay });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Picks a sensible weekly selection: strength 1–2×, one mobility class, max one class per day. */
export function pickWeeklyClasses(suggestions: ClassSuggestion[], phase: PlanWeek['phase'], premiumPerWeek = Infinity): ClassSuggestion[] {
  const strengthTarget = phase === 'foundation' || phase === 'base' || phase === 'build' ? 2 : 1;
  const picked: ClassSuggestion[] = [];
  const usedDays = new Set<string>();
  let strength = 0;
  let mobility = 0;
  let running = 0;
  let cardio = 0;
  let premium = 0;
  for (const s of suggestions) {
    // One class per day also matches Wellhub's one-check-in-per-day rule.
    if (s.blocked || s.score <= 0 || usedDays.has(s.date)) continue;
    if (s.cls.premium && premium >= premiumPerWeek) continue;
    const c = s.cls.category;
    if (c === 'strength' && strength < strengthTarget) strength++;
    else if (RECOVERY.includes(c) && mobility < 1) mobility++;
    // Treadmill classes (a run) and cycling/other cardio (cross-training) get one slot each.
    else if (s.cls.runningLoad && running < 1 && phase !== 'taper') running++;
    else if (!s.cls.runningLoad && !['strength', ...RECOVERY].includes(c) && cardio < 1 && phase !== 'taper') cardio++;
    else continue;
    if (s.cls.premium) premium++;
    picked.push(s);
    usedDays.add(s.date);
  }
  return picked.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Parses a pasted timetable, one class per line: "Day, HH:MM, Class name, minutes".
 * e.g. "Tue, 07:00, Body Pump, 45"
 */
export function parseTimetable(text: string, gymId: string, makeId: () => string): GymClass[] {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/[,\t]/).map((x) => x.trim()))
    .filter((p) => p.length >= 3)
    .flatMap((p) => {
      const dow = days.indexOf(p[0].slice(0, 3).toLowerCase());
      if (dow < 0 || !/^\d{1,2}[:.]\d{2}$/.test(p[1])) return [];
      const [h, m] = p[1].split(/[:.]/);
      return [{
        id: makeId(),
        gymId,
        name: p[2],
        category: guessCategory(p[2]),
        dayOfWeek: dow,
        startTime: `${h.padStart(2, '0')}:${m}`,
        durationMin: Number(p[3]) || 45,
        premium: looksPremium(p[2]),
        runningLoad: isRunningClass(p[2]),
      }];
    });
}

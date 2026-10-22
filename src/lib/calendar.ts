import type { CalendarEvent, Paces, PlanWeek, Workout } from '../types';
import { addDays, DAY_NAMES, dayOfWeek, toISODate } from './dates';
import { isHard } from './plan';

// Local-time ISO "YYYY-MM-DDTHH:MM" helpers.
export function toLocalStamp(d: Date): string {
  return `${toISODate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const BLOCKING_ALL_DAY = /(holiday|vacation|trip|travel|flight|wedding|conference|festival|away|offsite|ooo|out of office)/i;

// Window in which a run could realistically happen (05:30–21:30).
export const DAY_START = 330;
export const DAY_END = 1290;

/** Busy intervals (minutes since midnight) for a date. */
export function busyIntervals(date: string, events: CalendarEvent[]): [number, number][] {
  const out: [number, number][] = [];
  for (const e of events) {
    const s = e.start.slice(0, 10);
    const en = e.end.slice(0, 10);
    if (e.allDay) {
      // All-day end dates are exclusive.
      if (date >= s && date < (en > s ? en : addDays(s, 1)) && BLOCKING_ALL_DAY.test(e.title)) out.push([0, 1440]);
      continue;
    }
    if (date < s || date > en) continue;
    const startMin = s === date ? mins(e.start) : 0;
    const endMin = en === date ? mins(e.end) : 1440;
    if (endMin > startMin) out.push([startMin, endMin]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function mins(stamp: string): number {
  const [h, m] = stamp.slice(11, 16).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function freeBlocks(date: string, events: CalendarEvent[], from = DAY_START, to = DAY_END): [number, number][] {
  const busy = busyIntervals(date, events);
  const free: [number, number][] = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s > cursor) free.push([cursor, Math.min(s, to)]);
    cursor = Math.max(cursor, e);
    if (cursor >= to) break;
  }
  if (cursor < to) free.push([cursor, to]);
  return free.filter(([s, e]) => e - s > 0);
}

export function largestFree(date: string, events: CalendarEvent[], from = DAY_START, to = DAY_END): number {
  return Math.max(0, ...freeBlocks(date, events, from, to).map(([s, e]) => e - s));
}

/** Minutes needed for a workout including ~30 min to change, warm up and shower. */
export function minutesNeeded(w: Workout, paces: Paces): number {
  if (w.type === 'rest' || w.distanceKm === 0) return 0;
  const pace = w.paceSecPerKm ?? paces.easy;
  return Math.ceil((w.distanceKm * pace) / 60) + 30;
}

export function fits(w: Workout, date: string, events: CalendarEvent[], paces: Paces): boolean {
  return largestFree(date, events) >= minutesNeeded(w, paces);
}

export interface Move {
  workout: Workout;
  from: string;
  to: string | null;
  reason: string;
}

/**
 * Moves workouts that clash with busy days to other days in the same week,
 * swapping with rest or easy days and never placing two hard sessions back to back.
 */
export function rescheduleWeek(week: PlanWeek, events: CalendarEvent[], paces: Paces): { week: PlanWeek; moves: Move[] } {
  const byDate = new Map(week.workouts.map((w) => [w.date, { ...w }]));
  const dates = [...byDate.keys()].sort();
  const moves: Move[] = [];
  const priority = (w: Workout) => (w.type === 'long' ? 0 : isHard(w.type) ? 1 : 2);
  const order = [...byDate.values()].filter((w) => w.type !== 'rest' && w.type !== 'race').sort((a, b) => priority(a) - priority(b));

  for (const original of order) {
    const current = [...byDate.entries()].find(([, w]) => w.id === original.id);
    if (!current) continue;
    const [date, w] = current;
    if (fits(w, date, events, paces)) continue;

    const hardNeighbour = (d: string, ignoreId: string) =>
      [addDays(d, -1), addDays(d, 1)].some((n) => {
        const x = byDate.get(n);
        return x && x.id !== ignoreId && isHard(x.type);
      });

    const candidates = dates
      .filter((d) => d !== date)
      .map((d) => ({ d, other: byDate.get(d)! }))
      .filter(({ other }) => other.type === 'rest' || other.type === 'easy' || other.type === 'recovery')
      .filter(({ d }) => fits(w, d, events, paces))
      .filter(({ d }) => !isHard(w.type) || !hardNeighbour(d, w.id))
      .filter(({ other }) => other.type === 'rest' || fits(other, date, events, paces))
      .sort((a, b) => {
        const rest = (x: Workout) => (x.type === 'rest' ? 0 : 1);
        const weekendBonus = (d: string) => (w.type === 'long' && [0, 6].includes(dayOfWeek(d)) ? -0.5 : 0);
        return rest(a.other) - rest(b.other) || Math.abs(dist(a.d, date)) + weekendBonus(a.d) - (Math.abs(dist(b.d, date)) + weekendBonus(b.d));
      });

    const pick = candidates[0];
    if (!pick) {
      moves.push({ workout: w, from: date, to: null, reason: `No free ${minutesNeeded(w, paces)}-minute window this week — shorten it or skip.` });
      continue;
    }
    const other = pick.other;
    byDate.set(pick.d, { ...w, date: pick.d, movedFrom: w.movedFrom ?? date, moveReason: 'Calendar clash' });
    byDate.set(date, { ...other, date, movedFrom: other.type === 'rest' ? undefined : other.movedFrom ?? pick.d });
    moves.push({ workout: w, from: date, to: pick.d, reason: `${DAY_NAMES[dayOfWeek(date)]} is busy` });
  }

  const workouts = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { week: { ...week, workouts }, moves };
}

function dist(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

export interface DayScore {
  dow: number;
  avgMorningFreeMin: number;
  avgDayFreeMin: number;
  blockedDays: number;
  score: number;
}

/** Synthetic busy blocks for working hours, so work days rank sensibly even if work isn't in the calendar. */
export function workHourEvents(workDays: number[], fromDate: string, days: number, start = '08:30', end = '18:00'): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, i);
    if (workDays.includes(dayOfWeek(d))) out.push({ id: `work-${d}`, title: 'Work', start: `${d}T${start}`, end: `${d}T${end}`, allDay: false, source: 'ics' });
  }
  return out;
}

/** Ranks weekdays for long runs by how much free time they usually have, especially in the morning. */
export function rankLongRunDays(events: CalendarEvent[], fromDate: string, weeks = 8, workDays: number[] = []): DayScore[] {
  events = [...events, ...workHourEvents(workDays, fromDate, weeks * 7)];
  const scores: DayScore[] = [];
  for (let dow = 0; dow < 7; dow++) {
    let morning = 0;
    let day = 0;
    let blocked = 0;
    let n = 0;
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(fromDate, i);
      if (dayOfWeek(d) !== dow) continue;
      n++;
      const m = largestFree(d, events, 360, 780); // 06:00–13:00
      const f = largestFree(d, events);
      morning += m;
      day += f;
      if (f < 180) blocked++;
    }
    const avgMorningFreeMin = morning / n;
    const avgDayFreeMin = day / n;
    scores.push({ dow, avgMorningFreeMin, avgDayFreeMin, blockedDays: blocked, score: avgMorningFreeMin + 0.3 * avgDayFreeMin - 60 * blocked });
  }
  return scores.sort((a, b) => b.score - a.score);
}

// ---------- ICS import / export ----------

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function parseIcsDate(value: string, params: string): { stamp: string; allDay: boolean } {
  if (params.includes('VALUE=DATE') || /^\d{8}$/.test(value)) {
    return { stamp: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00`, allDay: true };
  }
  const y = +value.slice(0, 4), mo = +value.slice(4, 6) - 1, d = +value.slice(6, 8);
  const h = +value.slice(9, 11), mi = +value.slice(11, 13), s = +value.slice(13, 15) || 0;
  // UTC times convert to local; TZID times are assumed to be in the user's local zone.
  const date = value.endsWith('Z') ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s);
  return { stamp: toLocalStamp(date), allDay: false };
}

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Parses VEVENTs (with basic DAILY/WEEKLY RRULE expansion) within a date window. */
export function parseIcs(text: string, windowStart: string, windowEnd: string): CalendarEvent[] {
  const lines = unfold(text);
  const events: CalendarEvent[] = [];
  let cur: Record<string, { value: string; params: string }> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      events.push(...expand(cur, windowStart, windowEnd));
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const [name, ...params] = line.slice(0, idx).split(';');
      cur[name] = { value: line.slice(idx + 1), params: params.join(';') };
    }
  }
  return events;
}

function expand(raw: Record<string, { value: string; params: string }>, windowStart: string, windowEnd: string): CalendarEvent[] {
  if (!raw.DTSTART) return [];
  const start = parseIcsDate(raw.DTSTART.value, raw.DTSTART.params);
  const end = raw.DTEND ? parseIcsDate(raw.DTEND.value, raw.DTEND.params) : start;
  const title = (raw.SUMMARY?.value ?? 'Busy').replace(/\\,/g, ',').replace(/\\n/g, ' ');
  const uid = raw.UID?.value ?? Math.random().toString(36).slice(2);
  const durationMs = new Date(end.stamp).getTime() - new Date(start.stamp).getTime();
  const make = (s: Date, i: number): CalendarEvent => ({
    id: `${uid}-${i}`,
    title,
    start: toLocalStamp(s),
    end: toLocalStamp(new Date(s.getTime() + durationMs)),
    allDay: start.allDay,
    source: 'ics',
  });

  const first = new Date(start.stamp);
  const inWindow = (d: Date) => toISODate(d) >= windowStart && toISODate(d) <= windowEnd;
  const rrule = raw.RRULE?.value;
  if (!rrule) return inWindow(first) || (start.stamp.slice(0, 10) <= windowEnd && end.stamp.slice(0, 10) >= windowStart) ? [make(first, 0)] : [];

  const rule = Object.fromEntries(rrule.split(';').map((p) => p.split('=')));
  const freq = rule.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return inWindow(first) ? [make(first, 0)] : [];
  const interval = Number(rule.INTERVAL ?? 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL.slice(0, 8), 'VALUE=DATE').stamp.slice(0, 10) : '9999-12-31';
  const days = rule.BYDAY ? rule.BYDAY.split(',').map((d: string) => BYDAY[d.slice(-2)]) : [first.getDay()];
  const exdates = new Set((raw.EXDATE?.value ?? '').split(',').map((v) => v.slice(0, 8)));

  const out: CalendarEvent[] = [];
  let produced = 0;
  for (let i = 0; i < 3660; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    const iso = toISODate(d);
    if (iso > until || iso > windowEnd || produced >= count) break;
    const weekIdx = Math.floor(i / 7);
    const ok = freq === 'DAILY' ? i % interval === 0 : days.includes(d.getDay()) && weekIdx % interval === 0;
    if (!ok) continue;
    produced++;
    if (exdates.has(iso.replace(/-/g, ''))) continue;
    if (iso >= windowStart) out.push(make(d, i));
  }
  return out;
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/** Exports workouts as all-day events — subscribe/import in Apple Calendar, Google or Outlook. */
export function workoutsToIcs(workouts: Workout[], label: (w: Workout) => string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Marathon Coach//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Marathon training'];
  for (const w of workouts) {
    if (w.type === 'rest') continue;
    const d = w.date.replace(/-/g, '');
    const next = addDays(w.date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${w.id}@marathon-coach`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsEscape(label(w))}`, `DESCRIPTION:${icsEscape(w.description)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

import type { Race, RaceDistance } from '../types';
import { daysBetween } from './dates';

export const DISTANCE_KM: Record<RaceDistance, number> = { '5k': 5, '10k': 10, '10mi': 16.09, half: 21.0975, marathon: 42.195, other: 0 };
export const DISTANCE_LABEL: Record<RaceDistance, string> = { '5k': '5K', '10k': '10K', '10mi': '10 mile', half: 'Half marathon', marathon: 'Marathon', other: 'Other' };

export type Urgency = 'overdue' | 'urgent' | 'soon' | 'later' | 'done';

export interface RaceAction {
  race: Race;
  text: string;
  date: string | null;
  urgency: Urgency;
}

/** Works out the next thing to do for a race (enter ballot, check results, pay entry…). */
export function nextAction(race: Race, todayIso: string): RaceAction {
  const until = (d?: string) => (d ? daysBetween(todayIso, d) : null);
  const urgencyFor = (days: number | null): Urgency => (days === null ? 'later' : days < 0 ? 'overdue' : days <= 7 ? 'urgent' : days <= 30 ? 'soon' : 'later');
  const ballot = race.entryType === 'ballot' || race.entryType === 'lottery';
  const word = race.entryType === 'lottery' ? 'lottery' : 'ballot';

  if (['completed', 'skipped', 'ballot-lost'].includes(race.status) || race.date < todayIso) {
    if (race.status === 'ballot-lost') return { race, text: `Missed the ${word} — look for a charity place or another race`, date: null, urgency: 'done' };
    return { race, text: race.status === 'completed' ? 'Completed' : 'Past', date: null, urgency: 'done' };
  }
  if (race.status === 'entered' || race.status === 'ballot-won') {
    const d = until(race.date);
    return { race, text: `Entered — race in ${d} days`, date: race.date, urgency: d !== null && d <= 7 ? 'soon' : 'later' };
  }
  if (race.status === 'guaranteed') {
    const opens = until(race.entryOpens);
    const closes = until(race.entryCloses);
    if (opens !== null && opens > 0) return { race, text: `Guaranteed entry — claim window opens in ${opens} days`, date: race.entryOpens!, urgency: opens <= 7 ? 'urgent' : urgencyFor(opens) };
    if (closes !== null && closes >= 0) return { race, text: `Claim your guaranteed entry now — closes in ${closes} days (unclaimed entries are forfeited)`, date: race.entryCloses!, urgency: 'urgent' };
    if (closes !== null) return { race, text: 'Claim window has passed — check you claimed your entry', date: race.entryCloses!, urgency: 'overdue' };
    return { race, text: 'Guaranteed entry — watch for the claim window', date: null, urgency: 'later' };
  }
  if (race.status === 'ballot-entered') {
    if (race.ballotResult) {
      const d = until(race.ballotResult)!;
      return { race, text: d >= 0 ? `${cap(word)} results in ${d} days` : `${cap(word)} results were due — check your email`, date: race.ballotResult, urgency: d < 0 ? 'urgent' : urgencyFor(d) };
    }
    return { race, text: `${cap(word)} entered — waiting for results`, date: null, urgency: 'later' };
  }
  // Interested: work out the entry window.
  const opens = until(race.entryOpens);
  const closes = until(race.entryCloses);
  if (opens !== null && opens > 0) {
    return { race, text: `${ballot ? cap(word) : 'Entry'} opens in ${opens} days`, date: race.entryOpens!, urgency: opens <= 7 ? 'urgent' : urgencyFor(opens) };
  }
  if (closes !== null) {
    if (closes < 0) return { race, text: `${ballot ? cap(word) : 'Entry'} closed`, date: race.entryCloses!, urgency: 'overdue' };
    return { race, text: `${ballot ? `Enter the ${word}` : 'Enter'} — closes in ${closes} days`, date: race.entryCloses!, urgency: closes <= 7 ? 'urgent' : urgencyFor(closes) };
  }
  if (opens !== null) return { race, text: `${ballot ? cap(word) : 'Entry'} is open — enter now`, date: race.entryOpens!, urgency: 'urgent' };
  return { race, text: 'Add entry dates to get reminders', date: null, urgency: 'later' };
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

/** How a tune-up race fits the marathon block. */
export function raceFit(race: Race, marathonDate: string): { ok: boolean; note: string } {
  if (race.distance === 'marathon' && race.date === marathonDate) return { ok: true, note: 'Goal race' };
  const weeksOut = daysBetween(race.date, marathonDate) / 7;
  if (weeksOut < 0) return { ok: true, note: 'After your marathon — recover for at least 2–3 weeks first' };
  if (weeksOut < 2) return { ok: false, note: 'Too close to the marathon — it will compromise your taper' };
  if (race.distance === 'marathon') return { ok: weeksOut > 12, note: weeksOut > 12 ? 'Fine as a long training run, not an all-out effort' : 'A second marathon this close would hurt your goal race' };
  if (race.distance === 'half' || race.distance === '10mi') {
    return weeksOut >= 3 && weeksOut <= 8
      ? { ok: true, note: 'Ideal tune-up: tests fitness and race-day routine' }
      : { ok: true, note: 'Good fitness check — replaces that week\'s long run or quality session' };
  }
  return { ok: true, note: weeksOut > 8 ? 'Good speed check in the base/build phase' : 'Fine as a quality session — keep the long run that week' };
}

export const RACE_DIRECTORIES = [
  { name: 'NYRR races (NYC)', url: 'https://www.nyrr.org/' },
  { name: 'Running in the USA', url: 'https://runningintheusa.com/' },
  { name: 'ahotu (worldwide)', url: 'https://www.ahotu.com/' },
  { name: 'parkrun (free weekly 5K)', url: 'https://www.parkrun.com/' },
  { name: 'World Marathon Majors', url: 'https://www.worldmarathonmajors.com/' },
  { name: 'Find a Race (UK)', url: 'https://findarace.com/' },
];

export function raceSearchUrl(distance: string, location: string, beforeDate: string): string {
  const year = beforeDate.slice(0, 4);
  return `https://www.google.com/search?q=${encodeURIComponent(`${distance} race ${location} ${Number(year) - 1} ${year} entry`)}`;
}

import { describe, expect, it } from 'vitest';
import { generatePlan } from '../plan';
import { freeBlocks, parseIcs, rankLongRunDays, rescheduleWeek, workoutsToIcs } from '../calendar';
import { nextAction, raceFit } from '../races';
import { parseTimetable, pickWeeklyClasses, scoreClasses } from '../gym';
import { dailyTargets, fuelPlan } from '../nutrition';
import { fillDuration } from '../spotify';
import { profile } from './fixtures';
import type { CalendarEvent, Race } from '../../types';

const plan = generatePlan(profile, { startDate: '2026-10-22' });
const ev = (start: string, end: string, title = 'Busy', allDay = false): CalendarEvent => ({ id: start, title, start, end, allDay, source: 'ics' });

describe('calendar', () => {
  it('computes free blocks around events', () => {
    const blocks = freeBlocks('2026-11-03', [ev('2026-11-03T08:00', '2026-11-03T18:00')]);
    expect(blocks).toEqual([[330, 480], [1080, 1290]]);
  });

  it('moves a long run off a day blocked by a trip, keeping hard days apart', () => {
    const week = plan.weeks[4];
    const long = week.workouts.find((w) => w.type === 'long')!;
    const { week: moved, moves } = rescheduleWeek(week, [ev(`${long.date}T00:00`, `${long.date}T00:00`, 'Wedding', true)], plan.paces);
    expect(moves[0].to).not.toBeNull();
    const newLong = moved.workouts.find((w) => w.type === 'long')!;
    expect(newLong.date).not.toBe(long.date);
    expect(newLong.movedFrom).toBe(long.date);
  });

  it('ranks the day with free mornings first for long runs', () => {
    const events: CalendarEvent[] = [];
    for (let i = 0; i < 8; i++) {
      const sun = new Date(2026, 10, 1 + i * 7);
      const d = sun.toISOString().slice(0, 10);
      events.push(ev(`${d}T07:00`, `${d}T14:00`, 'Football'));
    }
    const ranking = rankLongRunDays(events, '2026-11-01', 8, [1, 2, 3, 4, 5]);
    expect(ranking[0].dow).toBe(6);
    expect(ranking.find((r) => r.dow === 0)!.score).toBeLessThan(ranking[0].score);
  });

  it('parses ICS with weekly recurrence and round-trips export', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Standup', 'DTSTART:20261102T090000', 'DTEND:20261102T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const events = parseIcs(ics, '2026-11-01', '2026-12-31');
    expect(events.map((e) => e.start)).toEqual(['2026-11-02T09:00', '2026-11-04T09:00', '2026-11-09T09:00', '2026-11-11T09:00']);
    const out = workoutsToIcs(plan.weeks[0].workouts, (w) => w.title);
    expect(out).toContain('BEGIN:VEVENT');
  });
});

describe('races', () => {
  const race: Race = { id: '1', name: 'Big City', date: '2027-10-03', distance: 'marathon', location: '', url: '', entryType: 'ballot', entryOpens: '2026-10-25', entryCloses: '2026-11-01', status: 'interested', notes: '' };
  it('flags an opening ballot as urgent', () => {
    expect(nextAction(race, '2026-10-22')).toMatchObject({ urgency: 'urgent', text: 'Ballot opens in 3 days' });
    expect(nextAction(race, '2026-10-28').text).toBe('Enter the ballot — closes in 4 days');
    expect(nextAction({ ...race, status: 'ballot-entered', ballotResult: '2027-02-01' }, '2026-12-01').text).toMatch(/results in/);
  });
  it('judges tune-up timing', () => {
    expect(raceFit({ ...race, distance: 'half', date: '2027-03-21' }, profile.raceDate).note).toMatch(/Ideal/);
    expect(raceFit({ ...race, distance: '10k', date: '2027-04-18' }, profile.raceDate).ok).toBe(false);
  });
});

describe('gym', () => {
  it('parses timetables and avoids hard classes before the long run', () => {
    const classes = parseTimetable('Sat, 09:00, HIIT Blast, 45\nTue, 18:30, Body Pump, 55\nMon, 19:00, Yin Yoga, 60', 'g', () => Math.random().toString());
    expect(classes.map((c) => c.category)).toEqual(['hiit', 'strength', 'yoga']);
    const week = plan.weeks[6];
    const scored = scoreClasses(week, classes, [{ id: 'g', name: 'Gym', address: '' }], profile, [], null, null);
    const hiit = scored.find((s) => s.cls.category === 'hiit')!;
    expect(hiit.reasons.join()).toMatch(/Day before/);
    const picked = pickWeeklyClasses(scored, week.phase);
    expect(picked.map((p) => p.cls.category)).toEqual(expect.arrayContaining(['strength', 'yoga']));
    expect(picked.some((p) => p.cls.category === 'hiit')).toBe(false);
  });
});

describe('nutrition & music', () => {
  it('periodises carbs by load', () => {
    const long = plan.weeks[10].workouts.find((w) => w.type === 'long')!;
    expect(dailyTargets(profile, long, 150, null).carbsG).toBe(8 * 62);
    expect(dailyTargets(profile, undefined, 0, null).carbsG).toBe(Math.round(3.5 * 62));
    expect(dailyTargets(profile, undefined, 0, 2).load).toBe('carb-load');
    expect(fuelPlan(180, 62).during).toMatch(/60–90 g/);
  });
  it('fills a playlist to the workout length', () => {
    const tracks = Array.from({ length: 40 }, (_, i) => ({ uri: `t${i}`, name: '', artist: '', durationMs: 200_000 }));
    expect(fillDuration(tracks, 30)).toHaveLength(9);
  });
});

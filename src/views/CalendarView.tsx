import { useState } from 'react';
import { Card, Empty } from '../components/ui';
import { useStore } from '../store';
import { addDays, DAY_NAMES, daysBetween, formatDate, mondayOf, today } from '../lib/dates';
import { fits, parseIcs, rankLongRunDays, workHourEvents, type Move } from '../lib/calendar';
import { suggestDays } from '../lib/schedule';
import { connectGoogle, fetchGoogleEvents, googleConnected } from '../lib/google';
import { adaptPlan, type Assessment } from '../lib/adapt';
import type { CalendarEvent } from '../types';

const NO_CHANGE: Assessment = { complianceRecent: null, avgRpe: null, easyRpe: null, painFlag: false, fitnessMarathonSec: null, recommendation: 'none', notes: [] };

export function useBusyEvents(): CalendarEvent[] {
  const { state } = useStore();
  const p = state.profile;
  if (!p) return state.events;
  return [...state.events, ...workHourEvents(p.workDays, addDays(today(), -7), daysBetween(today(), p.raceDate) + 14)];
}

export function CalendarView() {
  const { state, update } = useStore();
  const { profile, plan } = state;
  const busy = useBusyEvents();
  const [msg, setMsg] = useState('');
  const [moves, setMoves] = useState<Move[]>([]);
  const [clashes, setClashes] = useState<string[]>([]);
  if (!profile || !plan) return <Empty>Create your profile first.</Empty>;
  const horizon = Math.max(30, daysBetween(today(), profile.raceDate) + 1);

  async function syncGoogle() {
    if (!state.settings.googleClientId) return setMsg('Add your Google OAuth client ID in Settings first.');
    try {
      setMsg('Connecting…');
      if (!googleConnected()) await connectGoogle(state.settings.googleClientId);
      const events = await fetchGoogleEvents(today(), horizon);
      update((s) => ({ events: [...s.events.filter((e) => e.source !== 'google'), ...events] }));
      setMsg(`Synced ${events.length} Google Calendar events.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function importIcs(file: File) {
    const text = await file.text();
    const events = parseIcs(text, today(), addDays(today(), horizon));
    update((s) => ({ events: [...s.events.filter((e) => e.source !== 'ics'), ...events] }));
    setMsg(`Imported ${events.length} events from ${file.name}.`);
  }

  /** Picks days for unassigned activities in the next four weeks and flags clashes on days already chosen. */
  function suggestAround() {
    const from = mondayOf(today());
    const until = addDays(from, 28);
    const all: Move[] = [];
    const clashes: string[] = [];
    let assigned = 0;
    const weeks = plan!.weeks.map((w) => {
      if (w.startDate < from || w.startDate >= until) return w;
      for (const x of w.workouts) {
        if (x.scheduled && x.scheduled >= today() && !fits(x, x.scheduled, busy, plan!.paces)) {
          clashes.push(`${x.title} on ${formatDate(x.scheduled)} clashes with your calendar — pick another day.`);
        }
      }
      const r = suggestDays(w, busy, plan!.paces);
      assigned += r.week.workouts.filter((x, i) => x.scheduled && !w.workouts[i].scheduled).length;
      all.push(...r.moves);
      return r.week;
    });
    update({ plan: { ...plan!, weeks } });
    setMoves(all);
    setClashes(clashes);
    setMsg(`Assigned ${assigned} activit${assigned === 1 ? 'y' : 'ies'} over the next 4 weeks.${all.length ? ` ${all.filter((m) => m.to).length} moved off busy days.` : ''}`);
  }

  function chooseLongRunDay(dow: number) {
    const p = { ...profile!, longRunDay: dow };
    update({ profile: p, plan: adaptPlan(plan!, p, state.logs, NO_CHANGE, today()) });
    setMsg(`Long runs moved to ${DAY_NAMES[dow]} from next week.`);
  }

  const ranking = rankLongRunDays(busy, today(), 8);
  const upcoming = [...state.events].filter((e) => e.start >= today()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12);

  return (
    <div className="stack">
      <Card title="Connect your calendar">
        <p className="muted small">
          Google Calendar syncs directly. For Apple/iCloud or Outlook, export your calendar as an .ics file and import it here.
          Your work days ({profile.workDays.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ') || 'none'}) are treated as busy 08:30–18:00.
        </p>
        <div className="row">
          <button className="primary" onClick={syncGoogle}>{googleConnected() ? 'Re-sync Google Calendar' : 'Connect Google Calendar'}</button>
          <label className="button">Import .ics<input type="file" accept=".ics,text/calendar" hidden onChange={(e) => e.target.files?.[0] && importIcs(e.target.files[0])} /></label>
          {state.events.length > 0 && <button onClick={() => update({ events: [] })}>Clear events</button>}
        </div>
        <p className="muted">{state.events.length} events loaded. {msg}</p>
      </Card>

      <Card title="Best day for long runs" actions={<span className="muted small">Based on the next 8 weeks</span>}>
        <table>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.dow}>
                <td>{i === 0 ? '⭐ ' : ''}{DAY_NAMES[r.dow]}</td>
                <td className="muted small">~{Math.round(r.avgMorningFreeMin / 60 * 10) / 10} h free mornings</td>
                <td className="muted small">{r.blockedDays ? `${r.blockedDays} busy day(s)` : 'clear'}</td>
                <td>{profile.longRunDay === r.dow ? <span className="pill ok">current</span> : <button className="link" onClick={() => chooseLongRunDay(r.dow)}>use</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Fit workouts around events">
        <p className="muted small">Picks days for activities you haven't assigned in the next 4 weeks, avoiding days without a long-enough free window and never putting two hard sessions back to back. Days you've chosen yourself are kept — clashes on them are listed so you can move them.</p>
        <button className="primary" onClick={suggestAround}>Suggest days around my calendar</button>
        {clashes.map((c) => <p key={c} className="u-urgent small">⚠ {c}</p>)}
        {moves.map((m, i) => (
          <p key={i} className={m.to ? '' : 'u-urgent'}>
            {m.workout.title}: {formatDate(m.from)} → {m.to ? formatDate(m.to) : '—'} <span className="muted small">({m.reason})</span>
          </p>
        ))}
      </Card>

      <Card title="Upcoming events">
        {upcoming.length === 0 && <Empty>No events loaded.</Empty>}
        {upcoming.map((e) => <p key={e.id} className="small">{formatDate(e.start.slice(0, 10))} {e.allDay ? 'all day' : e.start.slice(11, 16)} — {e.title}</p>)}
      </Card>
    </div>
  );
}

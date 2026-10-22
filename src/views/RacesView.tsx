import { useState } from 'react';
import { Card, Empty, Field } from '../components/ui';
import { useStore } from '../store';
import { formatDate, mondayOf, today } from '../lib/dates';
import { fmtDuration, parseDuration, uid } from '../lib/format';
import { DISTANCE_KM, DISTANCE_LABEL, nextAction, RACE_DIRECTORIES, raceFit, raceSearchUrl } from '../lib/races';
import { NINE_PLUS_ONE_TODOS, NYC_2027, nycEntryRoutes, nycSeedRaces } from '../lib/presets';
import type { EntryType, Race, RaceDistance, RaceStatus } from '../types';

const BLANK: Omit<Race, 'id'> = { name: '', date: '', distance: 'half', location: '', url: '', entryType: 'open', status: 'interested', notes: '' };
const STATUSES: RaceStatus[] = ['interested', 'guaranteed', 'ballot-entered', 'ballot-won', 'ballot-lost', 'entered', 'completed', 'skipped'];
const ENTRY_TYPES: EntryType[] = ['open', 'ballot', 'lottery', 'qualifier', 'charity'];

export function RacesView() {
  const { state, update } = useStore();
  const { profile, plan } = state;
  const [draft, setDraft] = useState<Omit<Race, 'id'>>(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [searchDist, setSearchDist] = useState('half marathon');
  const [searchLoc, setSearchLoc] = useState('');
  const [resultText, setResultText] = useState<Record<string, string>>({});
  if (!profile) return <Empty>Create your profile first.</Empty>;

  const set = <K extends keyof Race>(k: K, v: Race[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const optDate = (v: string) => v || undefined;

  function save() {
    if (!draft.name || !draft.date) return;
    update((s) => ({ races: editing ? s.races.map((r) => (r.id === editing ? { ...draft, id: editing } : r)) : [...s.races, { ...draft, id: uid() }] }));
    setDraft(BLANK);
    setEditing(null);
  }

  function setStatus(r: Race, status: RaceStatus) {
    update((s) => ({ races: s.races.map((x) => (x.id === r.id ? { ...x, status } : x)) }));
  }

  function saveResult(r: Race) {
    const sec = parseDuration(resultText[r.id] ?? '');
    if (!sec) return;
    update((s) => ({ races: s.races.map((x) => (x.id === r.id ? { ...x, status: 'completed', resultTimeSec: sec } : x)) }));
  }

  /** Swaps the planned workout on race day for the race itself. */
  function addToPlan(r: Race) {
    if (!plan) return;
    const weeks = plan.weeks.map((w) => {
      if (w.startDate !== mondayOf(r.date)) return w;
      const workouts = w.workouts.map((x) => (x.date === r.date
        ? { ...x, id: `${r.date}-race-${r.id}`, type: 'race' as const, distanceKm: DISTANCE_KM[r.distance] || x.distanceKm, title: r.name, description: `${DISTANCE_LABEL[r.distance]} tune-up race. ${raceFit(r, profile!.raceDate).note}.` }
        : x));
      return { ...w, workouts };
    });
    update({ plan: { ...plan, weeks } });
  }

  const t = today();
  const actions = state.races.map((r) => nextAction(r, t)).sort((a, b) => {
    const rank = { overdue: 0, urgent: 1, soon: 2, later: 3, done: 4 };
    return rank[a.urgency] - rank[b.urgency] || a.race.date.localeCompare(b.race.date);
  });

  const isNyc = profile.raceDate === NYC_2027.raceDate;
  const nycRace = state.races.find((r) => r.date === NYC_2027.raceDate && r.distance === 'marathon');
  const missingNyc = isNyc && !nycRace;
  const nycIn = nycRace && ['guaranteed', 'entered', 'ballot-won'].includes(nycRace.status);

  return (
    <div className="stack">
      {isNyc && nycIn && (
        <Card title={nycRace!.status === 'guaranteed' ? "You're in — 9+1 guaranteed entry" : "You're in NYC 2027"} actions={<a href={nycRace!.url || NYC_2027.entryUrl} target="_blank" rel="noreferrer">nyrr.org ↗</a>}>
          {nycRace!.status === 'guaranteed' ? (
            <ol className="small">{NINE_PLUS_ONE_TODOS.map((t) => <li key={t}>{t}</li>)}</ol>
          ) : <p className="muted">Entry confirmed. All that's left is the training.</p>}
          {nycRace!.status === 'guaranteed' && <button onClick={() => setStatus(nycRace!, 'entered')}>I've claimed my entry ✓</button>}
        </Card>
      )}
      {isNyc && !nycIn && (
        <Card title="Getting into NYC 2027" actions={<a href={NYC_2027.entryUrl} target="_blank" rel="noreferrer">nyrr.org ↗</a>}>
          {nycEntryRoutes(t).map((r) => (
            <div key={r.name} className="route">
              <div className="row"><strong>{r.name}</strong><span className={`pill route-${r.status}`}>{r.status === 'check' ? 'check eligibility' : r.status}</span></div>
              <p className="muted small">{r.detail}</p>
            </div>
          ))}
          <p className="note small">The drawing odds are low, so pick a backup autumn 2027 marathon and add it below. The plan works for any race in early November — if you switch, update the date in Profile.</p>
          {missingNyc && <button onClick={() => update((s) => ({ races: [...s.races, ...nycSeedRaces(uid)] }))}>Add NYC Marathon & NYC Half to tracker</button>}
          {nycRace && <button onClick={() => update((s) => ({ races: s.races.map((r) => (r.id === nycRace.id ? nycSeedRaces(() => r.id, true)[0] : r)) }))}>I have guaranteed entry (9+1)</button>}
        </Card>
      )}
      <Card title="Your races & entry deadlines">
        {actions.length === 0 && <Empty>No races yet. Add your goal marathon and some tune-up races below.</Empty>}
        {actions.map(({ race: r, text, urgency }) => {
          const fit = raceFit(r, profile.raceDate);
          const inPlan = plan?.weeks.some((w) => w.workouts.some((x) => x.id === `${r.date}-race-${r.id}`));
          return (
            <div key={r.id} className="race">
              <div className="row spread">
                <div>
                  <strong>{r.name}</strong> <span className="muted">· {DISTANCE_LABEL[r.distance]} · {formatDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}{r.location ? ` · ${r.location}` : ''}</span>
                  {r.entryType !== 'open' && <span className="pill">{r.entryType}</span>}
                </div>
                <select value={r.status} onChange={(e) => setStatus(r, e.target.value as RaceStatus)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <p className={`u-${urgency}`}>{text}</p>
              <p className={`small ${fit.ok ? 'muted' : 'error'}`}>{fit.note}</p>
              <div className="row small">
                {r.url && <a href={r.url} target="_blank" rel="noreferrer">website</a>}
                {r.date >= t && r.date < profile.raceDate && !inPlan && <button className="link" onClick={() => addToPlan(r)}>put in plan</button>}
                {r.date <= t && (
                  <>
                    <input className="short" placeholder="result h:mm:ss" value={resultText[r.id] ?? (r.resultTimeSec ? fmtDuration(r.resultTimeSec) : '')} onChange={(e) => setResultText({ ...resultText, [r.id]: e.target.value })} />
                    <button className="link" onClick={() => saveResult(r)}>save result</button>
                  </>
                )}
                <button className="link" onClick={() => { setDraft(r); setEditing(r.id); }}>edit</button>
                <button className="link" onClick={() => update((s) => ({ races: s.races.filter((x) => x.id !== r.id) }))}>delete</button>
              </div>
            </div>
          );
        })}
        <p className="muted small">Completed race results update your fitness estimate and can sharpen your training paces.</p>
      </Card>

      <Card title={editing ? 'Edit race' : 'Add a race'}>
        <div className="grid">
          <Field label="Name"><input value={draft.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Race date"><input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Distance">
            <select value={draft.distance} onChange={(e) => set('distance', e.target.value as RaceDistance)}>
              {Object.entries(DISTANCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Location"><input value={draft.location} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="Website"><input value={draft.url} onChange={(e) => set('url', e.target.value)} /></Field>
          <Field label="Entry type">
            <select value={draft.entryType} onChange={(e) => set('entryType', e.target.value as EntryType)}>
              {ENTRY_TYPES.map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
          <Field label={draft.entryType === 'ballot' || draft.entryType === 'lottery' ? 'Ballot opens' : 'Entry opens'}><input type="date" value={draft.entryOpens ?? ''} onChange={(e) => set('entryOpens', optDate(e.target.value))} /></Field>
          <Field label={draft.entryType === 'ballot' || draft.entryType === 'lottery' ? 'Ballot closes' : 'Entry closes / sells out'}><input type="date" value={draft.entryCloses ?? ''} onChange={(e) => set('entryCloses', optDate(e.target.value))} /></Field>
          {(draft.entryType === 'ballot' || draft.entryType === 'lottery') && (
            <Field label="Results announced"><input type="date" value={draft.ballotResult ?? ''} onChange={(e) => set('ballotResult', optDate(e.target.value))} /></Field>
          )}
          <Field label="Cost"><input value={draft.cost ?? ''} onChange={(e) => set('cost', e.target.value)} /></Field>
        </div>
        <Field label="Notes"><textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="row">
          <button className="primary" onClick={save}>{editing ? 'Save' : 'Add race'}</button>
          {editing && <button onClick={() => { setDraft(BLANK); setEditing(null); }}>Cancel</button>}
        </div>
      </Card>

      <Card title="Find races">
        <p className="muted small">
          Good tune-ups: a 10K or 10-mile in the build phase and a half marathon 4–8 weeks before {profile.raceName || 'your marathon'}.
          Always confirm dates and entry rules on the official site — big races often use ballots that close many months ahead.
        </p>
        <div className="row">
          <select value={searchDist} onChange={(e) => setSearchDist(e.target.value)}>
            {['5k', '10k', '10 mile', 'half marathon', 'marathon'].map((d) => <option key={d}>{d}</option>)}
          </select>
          <input placeholder="Town or region" value={searchLoc} onChange={(e) => setSearchLoc(e.target.value)} />
          <a className="button" href={raceSearchUrl(searchDist, searchLoc || profile.homeAddress, profile.raceDate)} target="_blank" rel="noreferrer">Search</a>
        </div>
        <ul className="small">
          {RACE_DIRECTORIES.map((d) => <li key={d.name}><a href={d.url} target="_blank" rel="noreferrer">{d.name}</a></li>)}
        </ul>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { Card, Empty, Field } from '../components/ui';
import { useStore } from '../store';
import { DAY_NAMES, DAY_SHORT, formatDate, mondayOf, today } from '../lib/dates';
import { uid } from '../lib/format';
import { directionsUrl, geocode, parseTimetable, pickWeeklyClasses, scoreClasses } from '../lib/gym';
import { useBusyEvents } from './CalendarView';
import type { ClassCategory, GymClass, GymMembership } from '../types';
import { classLog, withLinkedLogs } from './LogView';
import { matchGym } from '../lib/schedule';
import { WELLHUB_GOLD } from '../lib/presets';
import { BRANDS, classFromTemplate, NEARBY_STUDIOS, templatesFor } from '../lib/studios';

const CATEGORIES: ClassCategory[] = ['strength', 'yoga', 'pilates', 'spin', 'hiit', 'swim', 'other'];

export function GymView() {
  const { state, update } = useStore();
  const { profile, plan, gyms, classes, membership } = state;
  const busy = useBusyEvents();
  const [gymName, setGymName] = useState('');
  const [gymAddr, setGymAddr] = useState('');
  const [timetableGym, setTimetableGym] = useState('');
  const [timetable, setTimetable] = useState('');
  const [weekIdx, setWeekIdx] = useState(0);
  const [msg, setMsg] = useState('');
  const [studioMsg, setStudioMsg] = useState('');
  const [qaGym, setQaGym] = useState('');
  const [qaTemplate, setQaTemplate] = useState(0);
  const [qaDay, setQaDay] = useState(2);
  const [qaTime, setQaTime] = useState('07:00');

  const setMembership = <K extends keyof GymMembership>(k: K, v: GymMembership[K]) => update((s) => ({ membership: { ...s.membership, [k]: v } }));
  const isWellhub = /wellhub|gympass/i.test(membership.provider);
  const premiumPerWeek = membership.premiumPerMonth != null ? Math.max(0, Math.floor(membership.premiumPerMonth / 4)) : Infinity;

  async function addGym() {
    if (!gymName) return;
    setMsg('Looking up location…');
    const geo = await geocode(gymAddr).catch(() => null);
    update((s) => ({ gyms: [...s.gyms, { id: uid(), name: gymName, address: gymAddr, lat: geo?.lat, lon: geo?.lon }] }));
    setMsg(geo ? 'Gym added.' : 'Gym added (address not found on the map — travel times unavailable).');
    setGymName(''); setGymAddr('');
  }

  /** Adds the researched Wellhub-brand studios in and around Greenwich Village, geocoding each one. */
  async function addNearbyStudios() {
    const existing = new Set(gyms.map((g) => g.address));
    const todo = NEARBY_STUDIOS.filter((s) => !existing.has(s.address));
    for (const [i, s] of todo.entries()) {
      setStudioMsg(`Mapping ${s.name} (${i + 1}/${todo.length})…`);
      const geo = await geocode(s.address).catch(() => null);
      update((st) => ({ gyms: [...st.gyms, { id: uid(), name: s.name, address: s.address, lat: geo?.lat, lon: geo?.lon, verify: s.verify }] }));
      // Nominatim's usage policy allows one request per second.
      if (i < todo.length - 1) await new Promise((r) => setTimeout(r, 1100));
    }
    setStudioMsg(todo.length ? `Added ${todo.length} studios.` : 'All nearby studios are already added.');
  }

  // Classes logged from the recommendations are matched by name and date.
  const logged = (classId: string, date: string) => {
    const c = classes.find((x) => x.id === classId);
    return !!c && state.activities.some((a) => a.date === date && a.name === c.name);
  };
  function logClass(c: GymClass, date: string) {
    const planned = c.category === 'strength' ? matchGym(plan, state.activities, date) : undefined;
    update((st) => withLinkedLogs(st, [], [classLog({ date, kind: c.category, name: c.name, gymId: c.gymId, durationMin: c.durationMin, rpe: c.runningLoad ? 8 : c.category === 'yoga' ? 3 : 6, plannedId: planned?.id })]));
  }


  const qaGymObj = gyms.find((g) => g.id === (qaGym || gyms[0]?.id));
  const qaTemplates = qaGymObj ? templatesFor(qaGymObj) : [];

  function quickAdd() {
    const t = qaTemplates[Math.min(qaTemplate, qaTemplates.length - 1)];
    if (!qaGymObj || !t) return;
    update((s) => ({ classes: [...s.classes, classFromTemplate(t, qaGymObj.id, qaDay, qaTime, uid())] }));
    setMsg(`Added ${t.name}, ${DAY_SHORT[qaDay]} ${qaTime}.`);
  }

  function importTimetable() {
    const gymId = timetableGym || gyms[0]?.id;
    if (!gymId) return setMsg('Add a gym first.');
    const parsed = parseTimetable(timetable, gymId, uid);
    update((s) => ({ classes: [...s.classes, ...parsed] }));
    setMsg(`Added ${parsed.length} classes.`);
    setTimetable('');
  }

  const upcoming = plan?.weeks.filter((w) => w.startDate >= mondayOf(today())) ?? [];
  const week = upcoming[Math.min(weekIdx, upcoming.length - 1)];
  const scored = week && profile ? scoreClasses(week, classes, gyms, profile, busy, state.geo.home ?? null, state.geo.work ?? null) : [];
  const picks = week ? pickWeeklyClasses(scored, week.phase, premiumPerWeek) : [];
  const originFor = (from: 'home' | 'work' | null) => (from === 'work' ? profile?.workAddress : profile?.homeAddress) ?? '';

  return (
    <div className="stack">
      <Card
        title="Recommended classes"
        actions={
          <select value={weekIdx} onChange={(e) => setWeekIdx(Number(e.target.value))}>
            {upcoming.slice(0, 12).map((w, i) => <option key={w.startDate} value={i}>Week of {formatDate(w.startDate, { day: 'numeric', month: 'short' })} ({w.phase})</option>)}
          </select>
        }
      >
        {!week || classes.length === 0 ? <Empty>Add clubs and classes to get recommendations.</Empty> : (
          <>
            {picks.length === 0 && <Empty>No class fits well this week — your runs come first.</Empty>}
            {picks.map((s) => (
              <div key={s.cls.id} className="workout">
                <div className="workout-date">{formatDate(s.date)}</div>
                <span className="badge">{s.cls.category}{s.cls.premium ? ' ★' : ''}</span>
                <div className="workout-body">
                  <strong>{s.cls.startTime} {s.cls.name}</strong> <span className="muted">@ {s.gym.name}</span>
                  {s.from && originFor(s.from) && <> · <a href={directionsUrl(originFor(s.from), s.gym.address)} target="_blank" rel="noreferrer">directions</a></>}
                  <div className="muted small">{s.reasons.join(' · ')}</div>
                  {s.date <= today() && (logged(s.cls.id, s.date)
                    ? <span className="pill ok">✓ done</span>
                    : <button className="link" onClick={(e) => { e.stopPropagation(); logClass(s.cls, s.date); }}>✓ Log as done</button>)}
                </div>
              </div>
            ))}
            <details>
              <summary className="muted small">All classes scored</summary>
              {scored.map((s) => (
                <p key={s.cls.id} className="small">{s.blocked ? '⛔' : s.score > 0 ? '✓' : '·'} {DAY_NAMES[s.cls.dayOfWeek].slice(0, 3)} {s.cls.startTime} {s.cls.name} — score {s.score} <span className="muted">({s.reasons.join('; ')})</span></p>
              ))}
            </details>
          </>
        )}
      </Card>

      <Card title="Membership" actions={!isWellhub && <button onClick={() => update({ membership: { ...WELLHUB_GOLD, membershipNumber: membership.membershipNumber } })}>Use Wellhub Gold</button>}>
        <div className="grid">
          <Field label="Gym / provider"><input value={membership.provider} onChange={(e) => setMembership('provider', e.target.value)} /></Field>
          <Field label="Membership tier"><input value={membership.tier} placeholder="e.g. Off-peak, multi-club" onChange={(e) => setMembership('tier', e.target.value)} /></Field>
          <Field label="Membership number"><input value={membership.membershipNumber} onChange={(e) => setMembership('membershipNumber', e.target.value)} /></Field>
          <Field label="Premium classes / month" hint="e.g. Barry's on Wellhub Gold">
            <input type="number" value={membership.premiumPerMonth ?? ''} onChange={(e) => setMembership('premiumPerMonth', e.target.value === '' ? undefined : Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Notes" hint="Booking window, check-in rules…"><textarea value={membership.notes} onChange={(e) => setMembership('notes', e.target.value)} /></Field>
        {isWellhub && (
          <p className="muted small">
            Wellhub has no public API, so find partner gyms near home and work in the Wellhub app (filter by your Gold plan), add them below with their timetables, then book the recommended classes in the app.
            Recommendations use at most one class per day, matching Wellhub's one check-in per day.
          </p>
        )}
      </Card>

      <Card title="Clubs you can use">
        <div className="row">
          <input placeholder="Club name" value={gymName} onChange={(e) => setGymName(e.target.value)} />
          <input placeholder="Address or postcode" value={gymAddr} onChange={(e) => setGymAddr(e.target.value)} />
          <button onClick={addGym}>Add club</button>
        </div>
        {isWellhub && (
          <div className="row">
            <button className="primary" onClick={addNearbyStudios}>Add Wellhub studios near home</button>
            <span className="muted small">{studioMsg}</span>
          </div>
        )}
        {gyms.map((g) => (
          <p key={g.id} className="small">
            <strong>{g.name}</strong> — {g.address} {g.lat == null && <span className="pill">not mapped</span>}{g.verify && <span className="pill" title="From an older listing — confirm it's open in the Wellhub app">verify</span>}{' '}
            {profile?.homeAddress && <a href={directionsUrl(profile.homeAddress, g.address)} target="_blank" rel="noreferrer">from home</a>}{' '}
            {profile?.workAddress && <a href={directionsUrl(profile.workAddress, g.address)} target="_blank" rel="noreferrer">from work</a>}{' '}
            <button className="link" onClick={() => update((s) => ({ gyms: s.gyms.filter((x) => x.id !== g.id), classes: s.classes.filter((c) => c.gymId !== g.id) }))}>remove</button>
          </p>
        ))}
        {!state.geo.home && !state.geo.work && <p className="muted small">Add home/work addresses in your profile to rank clubs by travel time.</p>}
      </Card>

      {gyms.length > 0 && (
        <Card title="Quick-add a class">
          <div className="grid">
            <Field label="Studio">
              <select value={qaGymObj?.id ?? ''} onChange={(e) => { setQaGym(e.target.value); setQaTemplate(0); }}>
                {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="Class">
              <select value={qaTemplate} onChange={(e) => setQaTemplate(Number(e.target.value))}>
                {qaTemplates.map((t, i) => <option key={t.name} value={i}>{t.name} · {t.durationMin} min</option>)}
              </select>
            </Field>
            <Field label="Day">
              <select value={qaDay} onChange={(e) => setQaDay(Number(e.target.value))}>
                {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </Field>
            <Field label="Time"><input type="time" value={qaTime} onChange={(e) => setQaTime(e.target.value)} /></Field>
          </div>
          <div className="row"><button onClick={quickAdd}>Add class</button><span className="muted small">Copy times from the Wellhub app's schedule.</span></div>
        </Card>
      )}

      {isWellhub && (
        <Card title="Studio guide for marathon training">
          {BRANDS.map((b) => {
            const inPhase = week ? b.bestPhases.includes(week.phase) : true;
            return (
              <div key={b.id} className="route">
                <div className="row">
                  <strong>{b.name}</strong>
                  {week && <span className={`pill ${inPhase ? 'route-open' : ''}`}>{inPhase ? `good in ${week.phase}` : `skip in ${week.phase}`}</span>}
                </div>
                <p className="muted small">{b.fit}</p>
              </div>
            );
          })}
        </Card>
      )}

      <Card title="Class timetable">
        <p className="muted small">Paste one class per line: <code>Day, HH:MM, Class name, minutes</code> — e.g. <code>Tue, 18:30, Body Pump, 55</code>. Category is guessed from the name; adjust below.</p>
        <div className="row">
          <select value={timetableGym} onChange={(e) => setTimetableGym(e.target.value)}>
            {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <textarea rows={5} value={timetable} onChange={(e) => setTimetable(e.target.value)} />
        <div className="row"><button onClick={importTimetable}>Add classes</button><span className="muted">{msg}</span></div>
        <table>
          <tbody>
            {[...classes].sort((a, b) => (a.dayOfWeek + 6) % 7 - (b.dayOfWeek + 6) % 7 || a.startTime.localeCompare(b.startTime)).map((c) => (
              <tr key={c.id}>
                <td>{DAY_SHORT[c.dayOfWeek]} {c.startTime}</td>
                <td>{c.name}{c.runningLoad && <span className="pill" title="Includes treadmill running">run</span>}</td>
                <td className="muted small">{gyms.find((g) => g.id === c.gymId)?.name}</td>
                <td>
                  <select value={c.category} onChange={(e) => update((s) => ({ classes: s.classes.map((x) => (x.id === c.id ? { ...x, category: e.target.value as ClassCategory } : x)) }))}>
                    {CATEGORIES.map((k) => <option key={k}>{k}</option>)}
                  </select>
                </td>
                <td>
                  <label className="check small" title="Counts against your premium allowance">
                    <input type="checkbox" checked={!!c.premium} onChange={(e) => update((s) => ({ classes: s.classes.map((x) => (x.id === c.id ? { ...x, premium: e.target.checked } : x)) }))} />premium
                  </label>
                </td>
                <td><button className="link" onClick={() => update((s) => ({ classes: s.classes.filter((x) => x.id !== c.id) }))}>remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

    </div>
  );
}

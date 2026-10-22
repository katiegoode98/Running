import { useMemo, useState } from 'react';
import { TrainingSummary } from '../components/TrainingSummary';
import { Card, Empty, Field } from '../components/ui';
import { useStore } from '../store';
import { formatDate, today } from '../lib/dates';
import { fmtDist, fmtDuration, fmtMinutes, fmtPace, KM_PER_MI, parseRaceTime, uid } from '../lib/format';
import { matchCross, matchGym, matchRun } from '../lib/schedule';
import type { AppState } from '../store';
import { adaptPlan, assess, type Performance } from '../lib/adapt';
import { DISTANCE_KM } from '../lib/races';
import { hrZone, maxHeartRate, rpeFromHr } from '../lib/heartrate';
import type { ImportedActivity } from '../lib/importer';
import { KIND_LABEL } from '../lib/training';
import type { ActivityLog, ClassCategory, RunLog } from '../types';

export function usePerformances(): Performance[] {
  const { state } = useStore();
  return useMemo(
    () => state.races.filter((r) => r.status === 'completed' && r.resultTimeSec && DISTANCE_KM[r.distance] > 0)
      .map((r) => ({ date: r.date, distanceKm: DISTANCE_KM[r.distance], timeSec: r.resultTimeSec!, source: r.name })),
    [state.races],
  );
}

export function AdaptCard() {
  const { state, update } = useStore();
  const performances = usePerformances();
  const { plan, profile, logs } = state;
  if (!plan || !profile) return null;
  const a = assess(plan, logs, performances, today(), maxHeartRate(profile.age, profile.maxHr));
  const pct = a.complianceRecent === null ? '—' : `${Math.round(a.complianceRecent * 100)}%`;
  return (
    <Card title="Progress check">
      <div className="paces">
        <div><span className="muted small">2-week completion</span><strong>{pct}</strong></div>
        <div><span className="muted small">Avg effort (RPE)</span><strong>{a.avgRpe?.toFixed(1) ?? '—'}</strong></div>
        <div><span className="muted small">Easy-run effort</span><strong>{a.easyRpe?.toFixed(1) ?? '—'}</strong></div>
        <div><span className="muted small">Marathon fitness</span><strong>{a.fitnessMarathonSec ? fmtDuration(a.fitnessMarathonSec) : '—'}</strong></div>
      </div>
      {a.notes.map((n) => <p key={n} className={a.recommendation === 'none' ? 'muted' : 'note'}>{n}</p>)}
      {a.recommendation !== 'none' && (
        <button className="primary" onClick={() => update({ plan: adaptPlan(plan, profile, logs, a, today()) })}>
          Apply changes to upcoming weeks
        </button>
      )}
    </Card>
  );
}

/**
 * Adds logs and links them to the plan: each one replaces any ticked-off
 * placeholder for its planned activity, and an unassigned activity moves to
 * the day it was actually done.
 */
export function withLinkedLogs(s: AppState, runs: RunLog[], acts: ActivityLog[]): Partial<AppState> {
  const runIds = new Set(runs.map((r) => r.workoutId).filter(Boolean));
  const gymIds = new Set(acts.map((a) => a.plannedId).filter(Boolean));
  const dayById = new Map([...runs.map((r) => [r.workoutId, r.date] as const), ...acts.map((a) => [a.plannedId, a.date] as const)]);
  const plan = s.plan && {
    ...s.plan,
    weeks: s.plan.weeks.map((w) => ({ ...w, workouts: w.workouts.map((x) => (dayById.has(x.id) && !x.scheduled && x.type !== 'race' ? { ...x, scheduled: dayById.get(x.id) } : x)) })),
  };
  return {
    plan,
    logs: [...s.logs.filter((l) => !(l.source === 'tick' && runIds.has(l.workoutId))), ...runs],
    activities: [...s.activities.filter((a) => !(a.source === 'tick' && gymIds.has(a.plannedId))), ...acts],
  };
}

type Mode = 'run' | 'class' | 'import';
const KINDS = Object.keys(KIND_LABEL) as ClassCategory[];

export function LogView() {
  const [mode, setMode] = useState<Mode>('run');
  return (
    <div className="stack">
      <div className="segmented" role="tablist">
        {([['run', 'Run'], ['class', 'Class / gym'], ['import', 'Import from Garmin']] as [Mode, string][]).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>{label}</button>
        ))}
      </div>
      {mode === 'run' && <RunForm />}
      {mode === 'class' && <ClassForm />}
      {mode === 'import' && <GarminImport onDone={() => setMode('run')} />}
      <TrainingSummary />
      <AdaptCard />
      <History />
    </div>
  );
}

function RunForm() {
  const { state, update } = useStore();
  const units = state.profile?.units ?? 'km';
  const f = units === 'mi' ? KM_PER_MI : 1;
  const [date, setDate] = useState(today());
  const [dist, setDist] = useState('');
  const planned = matchRun(state.plan, state.logs, date, Number(dist) * f || 0);
  const [time, setTime] = useState('');
  const [rpe, setRpe] = useState(4);
  const [hr, setHr] = useState('');
  const [notes, setNotes] = useState('');
  const [pain, setPain] = useState(false);
  const [err, setErr] = useState('');

  function add() {
    const km = Number(dist) * f;
    if (!km) return setErr('Enter the distance.');
    const sec = parseRaceTime(time, km);
    if (!sec) return setErr('Enter a time that fits the distance — mm:ss or h:mm:ss, e.g. 52:30 or 1:05:00.');
    const avgHr = Number(hr) || undefined;
    update((s) => withLinkedLogs(s, [{ id: uid(), date, workoutId: planned?.id, distanceKm: km, durationSec: sec, rpe, notes, pain, avgHr, source: 'manual' }], []));
    setDist(''); setTime(''); setHr(''); setNotes(''); setPain(false); setErr('');
  }

  return (
    <Card title="Log a run">
      {planned && <p className="muted">Ticks off: <strong>{planned.title}</strong> · {fmtDist(planned.distanceKm, units)}</p>}
      <div className="grid">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={`Distance (${units})`}><input type="number" step="0.1" value={dist} onChange={(e) => setDist(e.target.value)} /></Field>
        <Field label="Time (h:mm:ss)"><input value={time} placeholder="52:30" onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Avg heart rate (optional)"><input type="number" inputMode="numeric" value={hr} placeholder="bpm" onChange={(e) => setHr(e.target.value)} /></Field>
      </div>
      <Field label={`Effort (RPE) ${rpe}/10`} hint="Easy runs should be 3–4; races 9–10">
        <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
      </Field>
      <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel? Weather, shoes, fuelling…" /></Field>
      <label className="check"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Any pain or niggle (not just tiredness)?</label>
      <div className="row"><button className="primary" onClick={add}>Save run</button><span className="error">{err}</span></div>
    </Card>
  );
}

/** Logs a gym session or class. Exported so Today and Gym can log in one tap. */
export function classLog(partial: Omit<ActivityLog, 'id' | 'notes' | 'rpe'> & { rpe?: number; notes?: string }): ActivityLog {
  return { id: uid(), notes: '', rpe: 6, ...partial };
}

function ClassForm() {
  const { state, update } = useStore();
  const [date, setDate] = useState(today());
  const gymDay = matchGym(state.plan, state.activities, date);
  const [classId, setClassId] = useState('');
  const [kind, setKind] = useState<ClassCategory>('strength');
  const [name, setName] = useState('');
  const [gymId, setGymId] = useState('');
  const [mins, setMins] = useState('45');
  const [rpe, setRpe] = useState(6);
  const [hr, setHr] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');

  function pickClass(id: string) {
    setClassId(id);
    const c = state.classes.find((x) => x.id === id);
    if (c) { setKind(c.category); setName(c.name); setGymId(c.gymId); setMins(String(c.durationMin)); }
  }

  function save() {
    const durationMin = Number(mins);
    const label = name.trim() || (gymDay && kind === 'strength' ? gymDay.title.replace(/^Gym: /, '') : KIND_LABEL[kind]);
    if (!durationMin) return setMsg('Enter how long it lasted.');
    const plannedId = kind === 'strength' ? gymDay?.id : matchCross(state.plan, state.activities, date)?.id;
    update((s) => withLinkedLogs(s, [], [classLog({ date, kind, name: label, gymId: gymId || undefined, plannedId, durationMin, rpe, notes, avgHr: Number(hr) || undefined, source: 'manual' })]));
    setMsg(`Logged ${label}.`);
    setName(''); setNotes(''); setHr(''); setClassId('');
  }

  return (
    <Card title="Log a class or gym session">
      {gymDay && <p className="muted">Logging strength ticks off this week's <strong>{gymDay.title}</strong>.</p>}
      <div className="grid">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {state.classes.length > 0 && (
          <Field label="From your timetable">
            <select value={classId} onChange={(e) => pickClass(e.target.value)}>
              <option value="">— choose a class —</option>
              {state.classes.map((c) => <option key={c.id} value={c.id}>{c.name} · {state.gyms.find((g) => g.id === c.gymId)?.name ?? ''}</option>)}
            </select>
          </Field>
        )}
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as ClassCategory)}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Name"><input value={name} placeholder="e.g. Barry's Full Body" onChange={(e) => setName(e.target.value)} /></Field>
        {state.gyms.length > 0 && (
          <Field label="Where">
            <select value={gymId} onChange={(e) => setGymId(e.target.value)}>
              <option value="">—</option>
              {state.gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Minutes"><input type="number" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} /></Field>
        <Field label="Avg heart rate (optional)"><input type="number" inputMode="numeric" value={hr} placeholder="bpm" onChange={(e) => setHr(e.target.value)} /></Field>
      </div>
      <Field label={`Effort (RPE) ${rpe}/10`} hint="Yoga ~2–3, strength ~6–7, Barry's/HIIT ~8">
        <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
      </Field>
      <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Weights used, how it felt…" /></Field>
      <div className="row"><button className="primary" onClick={save}>Save session</button><span className="muted">{msg}</span></div>
    </Card>
  );
}

// Heart rate reflects effort for cardio, but lifting and yoga keep it low even when hard.
const DEFAULT_RPE: Record<ClassCategory, number> = { strength: 6, yoga: 3, pilates: 5, spin: 6, hiit: 8, swim: 5, other: 5 };

function importedRpe(a: ImportedActivity, kind: ClassCategory, maxHr: number): number {
  if (a.sport === 'run') return rpeFromHr(a.avgHr, maxHr, 4);
  return ['spin', 'hiit', 'swim'].includes(kind) ? rpeFromHr(a.avgHr, maxHr, DEFAULT_RPE[kind]) : DEFAULT_RPE[kind];
}

interface Pending extends ImportedActivity {
  keep: boolean;
  rpe: number;
  kind: ClassCategory;
}

function GarminImport({ onDone }: { onDone: () => void }) {
  const { state, update } = useStore();
  const units = state.profile?.units ?? 'km';
  const maxHr = maxHeartRate(state.profile?.age ?? 30, state.profile?.maxHr);
  const [pending, setPending] = useState<Pending[]>([]);
  const [msg, setMsg] = useState('');
  const known = new Set([...state.logs, ...state.activities].map((x) => x.externalId).filter(Boolean));

  async function read(files: FileList) {
    const found: Pending[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        // The FIT SDK is large, so it's loaded on first import rather than with the app.
        const { parseActivityFile } = await import('../lib/importer');
        const acts = parseActivityFile(file.name, new Uint8Array(await file.arrayBuffer()));
        for (const a of acts) {
          if (known.has(a.externalId) || found.some((p) => p.externalId === a.externalId)) continue;
          const kind: ClassCategory = a.sport === 'run' ? 'other' : a.sport;
          found.push({ ...a, keep: true, kind, rpe: importedRpe(a, kind, maxHr) });
        }
      } catch (e) {
        problems.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    setPending(found.sort((a, b) => a.externalId.localeCompare(b.externalId)));
    setMsg([found.length ? `Found ${found.length} new ${found.length === 1 ? 'activity' : 'activities'}.` : 'No new activities found (already imported?).', ...problems].join(' '));
  }

  function save() {
    const keep = pending.filter((p) => p.keep);
    // Match in date order, counting earlier matches so two runs don't claim the same planned run.
    const matchedLogs: RunLog[] = [...state.logs];
    const runs: RunLog[] = keep.filter((p) => p.sport === 'run' && p.distanceKm > 0).map((p) => {
      const w = matchRun(state.plan, matchedLogs, p.date, p.distanceKm);
      if (w) matchedLogs.push({ id: '', date: p.date, workoutId: w.id, distanceKm: 0, durationSec: 0, rpe: 0, notes: '' });
      return { id: uid(), date: p.date, workoutId: w?.id, distanceKm: p.distanceKm, durationSec: p.durationSec, rpe: p.rpe, notes: p.name === 'Run' ? '' : p.name, avgHr: p.avgHr, maxHr: p.maxHr, source: 'garmin', externalId: p.externalId };
    });
    const matchedActs: ActivityLog[] = [...state.activities];
    const acts: ActivityLog[] = keep.filter((p) => p.sport !== 'run').map((p) => {
      const w = p.kind === 'strength' ? matchGym(state.plan, matchedActs, p.date) : matchCross(state.plan, matchedActs, p.date);
      const log = classLog({ date: p.date, kind: p.kind, name: p.name, durationMin: Math.round(p.durationSec / 60), rpe: p.rpe, avgHr: p.avgHr, source: 'garmin', externalId: p.externalId, plannedId: w?.id });
      matchedActs.push(log);
      return log;
    });
    update((s) => withLinkedLogs(s, runs, acts));
    setPending([]);
    setMsg(`Imported ${runs.length} run${runs.length === 1 ? '' : 's'} and ${acts.length} other session${acts.length === 1 ? '' : 's'}.`);
    onDone();
  }

  const set = (i: number, patch: Partial<Pending>) => setPending((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <Card title="Import from your Garmin">
      <ol className="small steps">
        <li>On your phone, open <a href="https://connect.garmin.com/modern/activities" target="_blank" rel="noreferrer">Garmin Connect in Safari</a> (the website, not the app) and sign in.</li>
        <li>Open an activity, tap the ⚙️ gear icon and choose <strong>Export Original</strong> (or Export TCX / GPX). It saves to your Files app.</li>
        <li>Tap the button below and pick the file(s) — you can choose several at once.</li>
      </ol>
      <label className="button primary">
        Choose Garmin files
        <input type="file" multiple accept=".fit,.tcx,.gpx,.zip" hidden onChange={(e) => e.target.files?.length && read(e.target.files)} />
      </label>
      <p className="muted small">{msg}</p>
      {pending.length > 0 && (
        <>
          {pending.map((p, i) => (
            <div key={p.externalId} className="import-row">
              <label className="check">
                <input type="checkbox" checked={p.keep} onChange={(e) => set(i, { keep: e.target.checked })} />
                <strong>{formatDate(p.date)}</strong> · {p.sport === 'run' ? 'Run' : p.name}
              </label>
              <div className="small muted">
                {p.distanceKm > 0 && <>{fmtDist(p.distanceKm, units)} · </>}{fmtDuration(p.durationSec)}
                {p.sport === 'run' && p.distanceKm > 0 && <> · {fmtPace(p.durationSec / p.distanceKm, units)}</>}
                {p.avgHr && <> · ♥ {p.avgHr} avg (zone {hrZone(p.avgHr, maxHr)}){p.maxHr ? `, ${p.maxHr} max` : ''}</>}
              </div>
              <div className="row small">
                {p.sport !== 'run' && (
                  <select value={p.kind} onChange={(e) => set(i, { kind: e.target.value as ClassCategory })}>
                    {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                )}
                <span>Effort</span>
                <select value={p.rpe} onChange={(e) => set(i, { rpe: Number(e.target.value) })}>
                  {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}/10</option>)}
                </select>
                {p.avgHr && (p.sport === 'run' || ['spin', 'hiit', 'swim'].includes(p.kind)) && <span className="muted">estimated from heart rate</span>}
              </div>
            </div>
          ))}
          <button className="primary" onClick={save}>Save {pending.filter((p) => p.keep).length} activities</button>
        </>
      )}
      <p className="muted small">Why files? Garmin has paused access to its sync API for new apps, so exporting is the reliable way in. Everything is read on your phone — nothing is uploaded.</p>
    </Card>
  );
}

type HistoryItem = { kind: 'run'; log: RunLog } | { kind: 'class'; log: ActivityLog };

function History() {
  const { state, update } = useStore();
  const units = state.profile?.units ?? 'km';
  const maxHr = maxHeartRate(state.profile?.age ?? 30, state.profile?.maxHr);
  const gymName = (id?: string) => state.gyms.find((g) => g.id === id)?.name;
  const items: HistoryItem[] = [
    ...state.logs.map((log) => ({ kind: 'run' as const, log })),
    ...state.activities.map((log) => ({ kind: 'class' as const, log })),
  ].sort((a, b) => b.log.date.localeCompare(a.log.date));
  const hrText = (hr?: number) => (hr ? ` · ♥ ${hr} (Z${hrZone(hr, maxHr)})` : '');

  return (
    <Card title="History">
      {items.length === 0 && <Empty>Nothing logged yet.</Empty>}
      {items.map((it) => (
        <div key={it.log.id} className="history-row">
          <div className="workout-date">{formatDate(it.log.date)}</div>
          {it.kind === 'run' ? (
            <div>
              <strong>🏃 {fmtDist(it.log.distanceKm, units)}</strong> in {fmtDuration(it.log.durationSec)} · {fmtPace(it.log.durationSec / it.log.distanceKm, units)}
              <div className="small muted">RPE {it.log.rpe}{hrText(it.log.avgHr)}{it.log.pain ? ' · ⚠️ pain' : ''}{it.log.source === 'garmin' ? ' · Garmin' : ''}{it.log.notes ? ` · ${it.log.notes}` : ''}</div>
            </div>
          ) : (
            <div>
              <strong>🏋️ {it.log.name}</strong> · {fmtMinutes(it.log.durationMin)}
              <div className="small muted">{KIND_LABEL[it.log.kind]}{gymName(it.log.gymId) ? ` at ${gymName(it.log.gymId)}` : ''} · RPE {it.log.rpe}{hrText(it.log.avgHr)}{it.log.source === 'garmin' ? ' · Garmin' : ''}{it.log.notes ? ` · ${it.log.notes}` : ''}</div>
            </div>
          )}
          <button
            className="link"
            onClick={() => update((s) => (it.kind === 'run' ? { logs: s.logs.filter((x) => x.id !== it.log.id) } : { activities: s.activities.filter((x) => x.id !== it.log.id) }))}
          >
            delete
          </button>
        </div>
      ))}
    </Card>
  );
}

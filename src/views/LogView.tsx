import { useMemo, useState } from 'react';
import { Card, Empty, Field } from '../components/ui';
import { useStore } from '../store';
import { formatDate, today } from '../lib/dates';
import { fmtDist, fmtDuration, fmtPace, KM_PER_MI, parseDuration, uid } from '../lib/format';
import { workoutOn } from '../lib/plan';
import { adaptPlan, assess, type Performance } from '../lib/adapt';
import { DISTANCE_KM } from '../lib/races';

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
  const a = assess(plan, logs, performances, today());
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

export function LogView() {
  const { state, update } = useStore();
  const units = state.profile?.units ?? 'km';
  const f = units === 'mi' ? KM_PER_MI : 1;
  const [date, setDate] = useState(today());
  const planned = workoutOn(state.plan, date);
  const [dist, setDist] = useState('');
  const [time, setTime] = useState('');
  const [rpe, setRpe] = useState(4);
  const [notes, setNotes] = useState('');
  const [pain, setPain] = useState(false);
  const [err, setErr] = useState('');

  function add() {
    const km = Number(dist) * f;
    const sec = parseDuration(time);
    if (!km || !sec) return setErr('Enter distance and time (e.g. 52:30).');
    update((s) => ({ logs: [...s.logs, { id: uid(), date, workoutId: planned?.id, distanceKm: km, durationSec: sec, rpe, notes, pain }] }));
    setDist(''); setTime(''); setNotes(''); setPain(false); setErr('');
  }

  const sorted = [...state.logs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="stack">
      <Card title="Log a run">
        {planned && <p className="muted">Planned: <strong>{planned.title}</strong> · {fmtDist(planned.distanceKm, units)}</p>}
        <div className="grid">
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={`Distance (${units})`}><input type="number" step="0.1" value={dist} onChange={(e) => setDist(e.target.value)} /></Field>
          <Field label="Time (h:mm:ss)"><input value={time} placeholder="52:30" onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label={`Effort (RPE) ${rpe}/10`} hint="Easy runs should be 3–4; races 9–10">
            <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel? Weather, shoes, fuelling…" /></Field>
        <label className="check"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Any pain or niggle (not just tiredness)?</label>
        <div className="row"><button className="primary" onClick={add}>Save run</button><span className="error">{err}</span></div>
      </Card>
      <AdaptCard />
      <Card title="History">
        {sorted.length === 0 && <Empty>No runs logged yet.</Empty>}
        <table>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.id}>
                <td>{formatDate(l.date)}</td>
                <td>{fmtDist(l.distanceKm, units)}</td>
                <td>{fmtDuration(l.durationSec)}</td>
                <td>{fmtPace(l.durationSec / l.distanceKm, units)}</td>
                <td>RPE {l.rpe}{l.pain ? ' ⚠️' : ''}</td>
                <td className="muted small">{l.notes}</td>
                <td><button className="link" onClick={() => update((s) => ({ logs: s.logs.filter((x) => x.id !== l.id) }))}>delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

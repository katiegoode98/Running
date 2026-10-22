import { useState } from 'react';
import type { Experience, Profile, PlanStyle } from '../types';
import { Card, Field } from '../components/ui';
import { useStore } from '../store';
import { DAY_NAMES, today } from '../lib/dates';
import { fmtDuration, isPlausibleTime, KM_PER_MI, parseRaceTime, uid } from '../lib/format';
import { MARATHON_KM } from '../lib/paces';
import { maxHeartRate } from '../lib/heartrate';
import { generatePlan, peakVolumeKm } from '../lib/plan';
import { predictedMarathonSec, suggestGoals } from '../lib/paces';
import { geocode } from '../lib/gym';
import { NYC_2027, nycSeedRaces } from '../lib/presets';
import { carryOver } from '../lib/schedule';
import { HIGDON_URL } from '../lib/higdon';

const DEFAULT: Profile = {
  name: '',
  raceName: NYC_2027.raceName,
  raceDate: NYC_2027.raceDate,
  goalTimeSec: 4 * 3600,
  currentWeeklyKm: 25,
  longestRecentRunKm: 12,
  runDaysPerWeek: 4,
  longRunDay: 0,
  experience: 'intermediate',
  units: 'km',
  weightKg: 65,
  heightCm: 170,
  age: 30,
  sex: 'female',
  homeAddress: '',
  workAddress: '',
  workDays: [1, 2, 3, 4, 5],
};

const RACE_DISTANCES: [string, number][] = [['5K', 5], ['10K', 10], ['Half marathon', 21.0975], ['Marathon', 42.195]];

export function ProfileView({ onDone }: { onDone?: () => void }) {
  const { state, update } = useStore();
  const [p, setP] = useState<Profile>(state.profile ?? DEFAULT);
  // Times saved before input validation existed may be impossible (e.g. "2.30" read as 2.3 minutes);
  // show those fields empty so they get re-entered rather than re-saved.
  const storedRaceOk = !!p.recentRace && isPlausibleTime(p.recentRace.timeSec, p.recentRace.distanceKm);
  const [goalText, setGoalText] = useState(isPlausibleTime(p.goalTimeSec, MARATHON_KM) ? fmtDuration(p.goalTimeSec) : '');
  const [raceDist, setRaceDist] = useState(p.recentRace?.distanceKm ?? 0);
  const [raceTime, setRaceTime] = useState(storedRaceOk ? fmtDuration(p.recentRace!.timeSec) : '');
  const [status, setStatus] = useState('');
  const [guaranteed, setGuaranteed] = useState(false);
  const unitFactor = p.units === 'mi' ? KM_PER_MI : 1;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (v: string) => Number(v) || 0;

  const raceSec = raceDist && raceTime.trim() ? parseRaceTime(raceTime, raceDist) : NaN;
  const raceTimeError = raceDist > 0 && raceTime.trim() !== '' && Number.isNaN(raceSec);
  const recentRace = raceDist && raceSec > 0 ? { distanceKm: raceDist, timeSec: raceSec } : undefined;
  const raceNeedsReentry = !!p.recentRace && !storedRaceOk && !raceTime.trim();
  const predicted = recentRace ? predictedMarathonSec(recentRace) : null;
  const goals = recentRace ? suggestGoals(recentRace) : [];
  const goalSec = goalText.trim() ? parseRaceTime(goalText, MARATHON_KM) : NaN;
  const tooFast = goals.length > 0 && goalSec > 0 && goalSec < goals[2].timeSec * 0.97;
  const nycNotTracked = p.raceDate === NYC_2027.raceDate && !state.races.some((r) => r.date === NYC_2027.raceDate);

  async function save() {
    const goal = goalSec;
    if (!goal || Number.isNaN(goal)) return setStatus('Enter a goal time like 4:45:00');
    if (raceTimeError) return setStatus('Check your recent race time — enter it as h:mm:ss, e.g. 2:30:00');
    if (p.raceDate <= today()) return setStatus('Race date must be in the future');
    const profile: Profile = { ...p, goalTimeSec: goal, recentRace };
    const hadPlan = !!state.plan;
    // A plan built from an impossible race time has broken paces — always rebuild it.
    const brokenPlan = !!state.plan && state.plan.paces.easy < 155;
    const regenerate = !hadPlan || brokenPlan || confirm('Regenerate your training plan from these settings? Logged runs are kept.');
    setStatus('Saving…');
    const geo = { ...state.geo };
    try {
      if (profile.homeAddress && profile.homeAddress !== state.profile?.homeAddress) geo.home = (await geocode(profile.homeAddress)) ?? undefined;
      if (profile.workAddress && profile.workAddress !== state.profile?.workAddress) geo.work = (await geocode(profile.workAddress)) ?? undefined;
    } catch {
      // Geocoding is optional; travel times just won't be shown.
    }
    // First-time NYC setup: seed the NYC Marathon and NYC Half so their entry deadlines are tracked.
    const seedNyc = profile.raceDate === NYC_2027.raceDate && !state.races.some((r) => r.date === NYC_2027.raceDate);
    update((s) => ({
      profile,
      geo,
      ...(regenerate ? { plan: carryOver(s.plan, generatePlan(profile, { startDate: today() })) } : {}),
      ...(seedNyc ? { races: [...s.races, ...nycSeedRaces(uid, guaranteed)] } : {}),
    }));
    setStatus(regenerate ? 'Saved and plan generated.' : 'Saved.');
    onDone?.();
  }

  return (
    <div className="stack">
      <Card title={state.profile ? 'Your profile' : 'Welcome — let\'s build your marathon plan'}>
        <div className="grid">
          <Field label="Your name"><input value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Goal marathon"><input value={p.raceName} placeholder="e.g. TCS New York City Marathon" onChange={(e) => set('raceName', e.target.value)} /></Field>
          <Field label="Race date"><input type="date" value={p.raceDate} onChange={(e) => set('raceDate', e.target.value)} /></Field>
          <Field label="Goal time (h:mm:ss)">
            <input value={goalText} placeholder="e.g. 4:45:00" onChange={(e) => setGoalText(e.target.value)} />
            {goalText.trim() !== '' && Number.isNaN(goalSec) && <small className="error">Enter the goal as h:mm:ss, e.g. 4:45:00.</small>}
            {goalSec > 0 && !/^\d+:\d\d:\d\d$/.test(goalText.trim()) && <small className="muted">Read as {fmtDuration(goalSec)}</small>}
          </Field>
          <Field label="Units">
            <select value={p.units} onChange={(e) => set('units', e.target.value as Profile['units'])}>
              <option value="km">Kilometres</option>
              <option value="mi">Miles</option>
            </select>
          </Field>
          <Field label="Experience">
            <select value={p.experience} onChange={(e) => set('experience', e.target.value as Experience)}>
              <option value="beginner">First marathon</option>
              <option value="intermediate">Done 1–3 marathons</option>
              <option value="advanced">Experienced / chasing a PB</option>
            </select>
          </Field>
          <Field label="Plan style">
            <select value={p.planStyle ?? 'adaptive'} onChange={(e) => set('planStyle', e.target.value as PlanStyle)}>
              <option value="adaptive">Adaptive (speed work, periodised)</option>
              <option value="higdon-novice1">Hal Higdon Novice 1</option>
            </select>
          </Field>
        </div>
        {p.planStyle === 'higdon-novice1' ? (
          <p className="muted small">
            Follows <a href={HIGDON_URL} target="_blank" rel="noreferrer">Hal Higdon's Novice 1</a>: four easy runs a week (two short runs, a midweek
            "sorta-long" run and the weekend long run building to 20 miles), cross-training the day after the long run, a half marathon in week 8
            and a three-week taper. No speed work. Higdon publishes it in miles — switch Units to miles to match his numbers exactly.
          </p>
        ) : (
          <p className="muted small">The adaptive plan adds threshold, interval and marathon-pace sessions and caps long runs at about 3½ hours.</p>
        )}
      </Card>

      <Card title="Current fitness">
        <div className="grid">
          <Field label={`Current weekly distance (${p.units})`}>
            <input type="number" value={Math.round(p.currentWeeklyKm / unitFactor)} onChange={(e) => set('currentWeeklyKm', num(e.target.value) * unitFactor)} />
          </Field>
          <Field label={`Longest run in the last month (${p.units})`}>
            <input type="number" value={Math.round(p.longestRecentRunKm / unitFactor)} onChange={(e) => set('longestRecentRunKm', num(e.target.value) * unitFactor)} />
          </Field>
          <Field label="Recent race distance">
            <select value={raceDist} onChange={(e) => setRaceDist(Number(e.target.value))}>
              <option value={0}>None</option>
              {RACE_DISTANCES.map(([l, d]) => <option key={l} value={d}>{l}</option>)}
            </select>
          </Field>
          <Field label="Recent race time" hint={predicted ? `Equivalent to a ~${fmtDuration(predicted)} marathon on today's fitness` : 'Used to set training paces'}>
            <input value={raceTime} placeholder="h:mm:ss, e.g. 2:30:00" onChange={(e) => setRaceTime(e.target.value)} />
            {raceTimeError && <small className="error">That isn't a possible time for this distance — use h:mm:ss, e.g. 2:30:00.</small>}
            {raceNeedsReentry && <small className="error">Your saved race time was misread — please enter it again.</small>}
            {recentRace && raceTime.trim() && !/^\d+:\d\d:\d\d$/.test(raceTime.trim()) && <small className="muted">Read as {fmtDuration(recentRace.timeSec)}</small>}
          </Field>
          <Field label="Run days per week" hint={p.planStyle === 'higdon-novice1' ? 'Higdon Novice 1 always has 4 runs a week' : undefined}>
            <select value={p.planStyle === 'higdon-novice1' ? 4 : p.runDaysPerWeek} disabled={p.planStyle === 'higdon-novice1'} onChange={(e) => set('runDaysPerWeek', Number(e.target.value) as Profile['runDaysPerWeek'])}>
              {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Long run day" hint="The Calendar tab can suggest the best day">
            <select value={p.longRunDay} onChange={(e) => set('longRunDay', Number(e.target.value))}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
        </div>
        {goals.length > 0 && (
          <div className="goals">
            <span className="small muted">Suggested goals from your {recentRace!.distanceKm > 21 && recentRace!.distanceKm < 22 ? 'half' : 'race'} time:</span>
            <div className="row">
              {goals.map((g) => (
                <button key={g.label} className={fmtDuration(g.timeSec) === fmtDuration(goalSec) ? 'chip active' : 'chip'} onClick={() => setGoalText(fmtDuration(g.timeSec))} title={g.why}>
                  {g.label} · {fmtDuration(g.timeSec).replace(/:00$/, '')}
                </button>
              ))}
            </div>
          </div>
        )}
        {tooFast && <p className="error small">Your goal is much faster than your race times suggest. Marathon-pace sessions use goal pace, so they'd be too hard — consider the Realistic goal and revisit after a spring race.</p>}
        <p className="muted small">Peak week will be about {Math.round(peakVolumeKm({ ...p, goalTimeSec: (goalSec || p.goalTimeSec) }) / unitFactor)} {p.units}.</p>
      </Card>

      <Card title="You & your week">
        <div className="grid">
          <Field label="Weight (kg)"><input type="number" value={p.weightKg} onChange={(e) => set('weightKg', num(e.target.value))} /></Field>
          <Field label="Height (cm)"><input type="number" value={p.heightCm} onChange={(e) => set('heightCm', num(e.target.value))} /></Field>
          <Field label="Age"><input type="number" value={p.age} onChange={(e) => set('age', num(e.target.value))} /></Field>
          <Field label="Max heart rate (optional)" hint={`Leave blank to estimate (${maxHeartRate(p.age)} bpm from your age). From a race or hard hill effort on your Garmin is better.`}>
            <input type="number" inputMode="numeric" value={p.maxHr ?? ''} placeholder={String(maxHeartRate(p.age))} onChange={(e) => set('maxHr', e.target.value ? Number(e.target.value) : undefined)} />
          </Field>
          <Field label="Sex (for energy estimates)">
            <select value={p.sex} onChange={(e) => set('sex', e.target.value as Profile['sex'])}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </Field>
          <Field label="Home address / postcode" hint="A street address or cross streets, e.g. Houston St & 6th Ave, New York"><input value={p.homeAddress} onChange={(e) => set('homeAddress', e.target.value)} /></Field>
          <Field label="Work address / postcode"><input value={p.workAddress} onChange={(e) => set('workAddress', e.target.value)} /></Field>
        </div>
        <Field label="Days at work">
          <div className="row">
            {DAY_NAMES.map((d, i) => (
              <label key={d} className="check">
                <input type="checkbox" checked={p.workDays.includes(i)} onChange={(e) => set('workDays', e.target.checked ? [...p.workDays, i] : p.workDays.filter((x) => x !== i))} />
                {d.slice(0, 3)}
              </label>
            ))}
          </div>
        </Field>
        {nycNotTracked && (
          <label className="check"><input type="checkbox" checked={guaranteed} onChange={(e) => setGuaranteed(e.target.checked)} /> I already have guaranteed entry to NYC 2027 (e.g. 9+1)</label>
        )}
        <div className="row">
          <button className="primary" onClick={save}>{state.plan ? 'Save profile' : 'Create my plan'}</button>
          <span className="muted">{status}</span>
        </div>
      </Card>
    </div>
  );
}

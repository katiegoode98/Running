import { useState } from 'react';
import { Card, Empty, Field } from '../components/ui';
import { useStore } from '../store';
import { addDays, daysBetween, formatDate, today } from '../lib/dates';
import { uid } from '../lib/format';
import { workoutOn } from '../lib/plan';
import { minutesNeeded } from '../lib/calendar';
import { dailyTargets, DIET_APPROACHES, fuelPlan, movingAverage } from '../lib/nutrition';
import type { FoodLog } from '../types';

const MEALS: FoodLog['meal'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'fuel'];

function WeightChart({ points }: { points: { date: string; kg: number }[] }) {
  if (points.length < 2) return <p className="muted small">Log at least two weigh-ins to see a trend.</p>;
  const avg = movingAverage(points);
  const kgs = points.map((p) => p.kg);
  const min = Math.min(...kgs) - 0.5;
  const max = Math.max(...kgs) + 0.5;
  const first = points[0].date;
  const span = Math.max(1, daysBetween(first, points[points.length - 1].date));
  const x = (d: string) => (daysBetween(first, d) / span) * 580 + 10;
  const y = (kg: number) => 150 - ((kg - min) / (max - min)) * 140;
  return (
    <svg viewBox="0 0 600 160" className="chart" role="img" aria-label="Weight trend">
      {points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={3} className="dot" />)}
      <polyline points={avg.map((p) => `${x(p.date)},${y(p.kg)}`).join(' ')} className="trend" />
      <text x={4} y={12} className="axis">{max.toFixed(1)} kg</text>
      <text x={4} y={156} className="axis">{min.toFixed(1)} kg</text>
    </svg>
  );
}

export function NutritionView() {
  const { state, update } = useStore();
  const { profile, plan } = state;
  const [date, setDate] = useState(today());
  const [kg, setKg] = useState('');
  const [food, setFood] = useState<Omit<FoodLog, 'id' | 'date'>>({ meal: 'breakfast', description: '', kcal: 0, carbsG: 0, proteinG: 0, fatG: 0 });
  if (!profile || !plan) return <Empty>Create your profile first.</Empty>;

  const w = workoutOn(plan, date);
  const minutes = w ? minutesNeeded(w, plan.paces) - 30 : 0;
  const targets = dailyTargets(profile, w, minutes, daysBetween(date, profile.raceDate));
  const eaten = state.foods.filter((f) => f.date === date);
  const sum = (k: 'kcal' | 'carbsG' | 'proteinG' | 'fatG') => eaten.reduce((s, f) => s + f[k], 0);
  const nextLong = plan.weeks.flatMap((x) => x.workouts).find((x) => x.date >= today() && (x.type === 'long' || x.type === 'race'));
  const longMin = nextLong ? minutesNeeded(nextLong, plan.paces) - 30 : 0;
  const fuel = fuelPlan(longMin, profile.weightKg);
  const num = (v: string) => Number(v) || 0;

  function addWeight() {
    const v = Number(kg);
    if (!v) return;
    update((s) => ({ weights: [...s.weights.filter((x) => x.date !== date), { id: uid(), date, kg: v }], profile: s.profile && date >= today() ? { ...s.profile, weightKg: v } : s.profile }));
    setKg('');
  }

  function addFood() {
    if (!food.description) return;
    update((s) => ({ foods: [...s.foods, { ...food, id: uid(), date }] }));
    setFood({ ...food, description: '', kcal: 0, carbsG: 0, proteinG: 0, fatG: 0 });
  }

  const bar = (label: string, have: number, want: number, unit: string) => (
    <div className="bar">
      <div className="row spread small"><span>{label}</span><span>{Math.round(have)} / {want} {unit}</span></div>
      <div className="track"><div className="fill" style={{ width: `${Math.min(100, (have / Math.max(1, want)) * 100)}%` }} /></div>
    </div>
  );

  return (
    <div className="stack">
      <Card title="Daily targets" actions={<input type="date" value={date} onChange={(e) => setDate(e.target.value)} />}>
        <p>{w ? <><strong>{w.title}</strong> day</> : 'Rest day'} · <span className="pill">{targets.load}</span></p>
        <p className="muted small">{targets.note}</p>
        {bar('Carbohydrate', sum('carbsG'), targets.carbsG, 'g')}
        {bar('Protein', sum('proteinG'), targets.proteinG, 'g')}
        {bar('Fat', sum('fatG'), targets.fatG, 'g')}
        {bar('Energy', sum('kcal'), targets.kcal, 'kcal')}
        <p className="muted small">Estimated expenditure ≈ {targets.estimatedBurnKcal} kcal. Targets are general guidance, not medical advice — see a sports dietitian for a personal plan.</p>
      </Card>

      <Card title="Log food">
        <div className="grid">
          <Field label="Meal">
            <select value={food.meal} onChange={(e) => setFood({ ...food, meal: e.target.value as FoodLog['meal'] })}>
              {MEALS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="What"><input value={food.description} onChange={(e) => setFood({ ...food, description: e.target.value })} /></Field>
          <Field label="kcal"><input type="number" value={food.kcal || ''} onChange={(e) => setFood({ ...food, kcal: num(e.target.value) })} /></Field>
          <Field label="Carbs g"><input type="number" value={food.carbsG || ''} onChange={(e) => setFood({ ...food, carbsG: num(e.target.value) })} /></Field>
          <Field label="Protein g"><input type="number" value={food.proteinG || ''} onChange={(e) => setFood({ ...food, proteinG: num(e.target.value) })} /></Field>
          <Field label="Fat g"><input type="number" value={food.fatG || ''} onChange={(e) => setFood({ ...food, fatG: num(e.target.value) })} /></Field>
        </div>
        <button onClick={addFood}>Add</button>
        <table>
          <tbody>
            {eaten.map((f) => (
              <tr key={f.id}>
                <td>{f.meal}</td><td>{f.description}</td><td>{f.kcal} kcal</td><td className="muted small">C{f.carbsG} P{f.proteinG} F{f.fatG}</td>
                <td><button className="link" onClick={() => update((s) => ({ foods: s.foods.filter((x) => x.id !== f.id) }))}>delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Weight">
        <div className="row">
          <input type="number" step="0.1" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} />
          <button onClick={addWeight}>Log weight for {formatDate(date)}</button>
        </div>
        <WeightChart points={state.weights.filter((x) => x.date >= addDays(today(), -120)).map((x) => ({ date: x.date, kg: x.kg }))} />
        <p className="muted small">Weigh at the same time each morning; the line is a 7-day average because daily weight swings 1–2 kg with water and glycogen.</p>
      </Card>

      {nextLong && (
        <Card title={`Fuelling: ${nextLong.title} (${formatDate(nextLong.date)})`}>
          <p><strong>Before:</strong> {fuel.preRun}</p>
          <p><strong>During:</strong> {fuel.during}</p>
          <p><strong>Fluids:</strong> {fuel.fluids}</p>
          <p><strong>After:</strong> {fuel.after}</p>
        </Card>
      )}

      <Card title="Diet approaches for marathon training">
        {DIET_APPROACHES.map((d) => <p key={d.name}><strong>{d.name}.</strong> <span className="muted">{d.summary}</span></p>)}
      </Card>
    </div>
  );
}

import type { Profile, Workout } from '../types';

/*
 * Targets follow sports-nutrition consensus guidance (IOC 2018, ACSM/AND/DC
 * 2016 position stand; Burke et al.): carbohydrate periodised to training load,
 * ~1.6 g/kg protein spread across meals, and in-run fuelling scaled to duration.
 * This is general guidance, not medical advice.
 */

export type DayLoad = 'rest' | 'light' | 'moderate' | 'high' | 'carb-load';

export interface DailyTargets {
  load: DayLoad;
  carbsG: number;
  proteinG: number;
  fatG: number;
  kcal: number;
  estimatedBurnKcal: number;
  note: string;
}

const CARBS_G_PER_KG: Record<DayLoad, number> = { rest: 3.5, light: 5, moderate: 6, high: 8, 'carb-load': 10 };

export function loadFor(workout: Workout | undefined, minutes: number, daysToRace: number | null): DayLoad {
  if (daysToRace !== null && daysToRace >= 1 && daysToRace <= 2) return 'carb-load';
  if (!workout || workout.type === 'rest') return 'rest';
  if (workout.type === 'strength' || workout.type === 'cross') return 'light';
  if (workout.type === 'long' || workout.type === 'race' || minutes >= 90) return 'high';
  if (workout.type === 'easy' || workout.type === 'recovery') return minutes > 60 ? 'moderate' : 'light';
  return 'moderate';
}

export function bmr(p: Pick<Profile, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number {
  // Mifflin–St Jeor
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

export function dailyTargets(profile: Profile, workout: Workout | undefined, minutes: number, daysToRace: number | null): DailyTargets {
  const kg = profile.weightKg;
  const load = loadFor(workout, minutes, daysToRace);
  const carbsG = Math.round(CARBS_G_PER_KG[load] * kg);
  const proteinG = Math.round(1.6 * kg);
  const fatG = Math.round((load === 'carb-load' ? 0.8 : 1.0) * kg);
  const kcal = carbsG * 4 + proteinG * 4 + fatG * 9;
  // Running costs roughly 1 kcal per kg per km.
  const estimatedBurnKcal = Math.round(bmr(profile) * 1.4 + (workout?.distanceKm ?? 0) * kg);
  const notes: Record<DayLoad, string> = {
    rest: 'Rest day: lower carbs, keep protein high to support repair.',
    light: 'Light day: normal balanced meals.',
    moderate: 'Training day: carbs at most meals, plus a carb + protein snack after the session.',
    high: 'Big day: carb-rich dinner the night before, breakfast 2–3 h pre-run, and refuel within an hour.',
    'carb-load': 'Carb-load: 8–12 g/kg carbs, lower fibre and fat to avoid gut issues. Expect ~1–2 kg water weight — that\'s fuel.',
  };
  return { load, carbsG, proteinG, fatG, kcal, estimatedBurnKcal, note: notes[load] };
}

export interface FuelPlan {
  preRun: string;
  during: string;
  fluids: string;
  after: string;
}

export function fuelPlan(minutes: number, weightKg: number): FuelPlan {
  const preCarbs = Math.round((minutes >= 90 ? 2 : 1) * weightKg);
  return {
    preRun: minutes >= 75 ? `${preCarbs} g carbs 2–3 h before (e.g. porridge with banana and honey).` : 'Optional small snack 30–60 min before if hungry.',
    during: minutes >= 150
      ? `60–90 g carbs per hour (≈${Math.ceil(minutes / 60) * 2}–${Math.ceil(minutes / 60) * 3} gels). Use glucose+fructose products and practise this gut-training on long runs.`
      : minutes >= 75
        ? `30–60 g carbs per hour from ~45 min (≈1 gel every 30–40 min).`
        : 'Water only is fine.',
    fluids: minutes >= 60 ? 'Drink to thirst, ~400–800 ml/h with 300–600 mg sodium/h in warm weather.' : 'Drink to thirst.',
    after: `Within 1 h: ~${Math.round(weightKg)} g carbs + 20–30 g protein (e.g. chocolate milk, or a recovery meal).`,
  };
}

export const DIET_APPROACHES = [
  {
    name: 'Periodised carbohydrate (recommended)',
    summary: 'Match carbs to the day\'s training: more on long-run and workout days, less on rest days. Best-supported approach for endurance performance and body composition.',
  },
  {
    name: 'Mediterranean-style eating',
    summary: 'Whole grains, legumes, olive oil, fish, vegetables and fruit. Strong evidence for long-term health; easy to scale carbs up for training.',
  },
  {
    name: 'Plant-based',
    summary: 'Works well for marathoners. Watch protein (combine sources, aim 1.6–1.8 g/kg), iron, B12, calcium, vitamin D and omega-3.',
  },
  {
    name: 'Low-carb / keto',
    summary: 'Increases fat burning but impairs high-intensity running economy and performance in studies. Not recommended during a marathon block.',
  },
  {
    name: 'Weight loss while training',
    summary: 'Keep any deficit small (≤300–500 kcal/day), never on key-session days, and avoid it during taper. Big deficits raise injury and RED-S risk.',
  },
];

/** 7-day moving average to smooth daily weight noise. */
export function movingAverage(points: { date: string; kg: number }[], window = 7): { date: string; kg: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
    return { date: p.date, kg: slice.reduce((s, x) => s + x.kg, 0) / slice.length };
  });
}

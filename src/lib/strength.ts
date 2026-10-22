import type { Phase, Plan, PlanWeek, StrengthSession, Workout } from '../types';
import { addDays, daysBetween } from './dates';

/*
 * Weekly gym strength session for runners.
 *
 * Heavy, low-rep lower-body lifting plus calf and core work improves running
 * economy and lowers injury risk without adding bulk (Blagrove et al. 2018
 * review; Beattie et al. 2014). The programme is periodised alongside the
 * running plan:
 *  - foundation: build strength with moderate loads (3 × 8–10)
 *  - base/build: heavier, lower reps plus some plyometrics (4 × 5)
 *  - peak: maintain with fewer sets (2 × 5) so legs stay fresh for long runs
 *  - taper: one light session, then bodyweight mobility only
 * Load is set by effort: pick a weight you could lift 2–3 more times.
 */

const WARM_UP = '5–8 min easy on the bike or rower, then leg swings, glute bridges and 2 light warm-up sets of the first lift.';

const FOUNDATION: StrengthSession = {
  title: 'Strength foundation',
  durationMin: 50,
  focus: 'Build strength in the hips, legs and calves with moderate weights and good form.',
  warmUp: WARM_UP,
  exercises: [
    { name: 'Goblet or back squat', sets: 3, reps: '8–10', load: 'RPE 7 — 2–3 reps left in the tank', cue: 'Sit between your hips, knees track over toes.' },
    { name: 'Romanian deadlift (barbell or dumbbells)', sets: 3, reps: '8–10', load: 'RPE 7', cue: 'Push hips back with a long spine; feel the hamstrings.' },
    { name: 'Bulgarian split squat (dumbbells)', sets: 3, reps: '8 each leg', load: 'RPE 7', cue: 'Front shin roughly vertical; control the way down.' },
    { name: 'Hip thrust (barbell or machine)', sets: 3, reps: '10', load: 'RPE 7', cue: 'Pause one second at the top and squeeze your glutes.' },
    { name: 'Single-leg calf raise (holding a dumbbell)', sets: 3, reps: '12 each leg', load: 'Slow 3-second lowering', cue: 'Full range on a step — protects Achilles and calves.' },
    { name: 'Pallof press + side plank', sets: 3, reps: '10 each side + 30 s', load: 'Light cable/band', cue: 'Resist rotation; keeps your trunk stable when tired.' },
  ],
  notes: 'Add weight when every set feels comfortable at RPE 6. Expect sore legs for the first 2–3 weeks — keep the next day\'s run easy.',
};

const BUILD: StrengthSession = {
  title: 'Heavy strength + power',
  durationMin: 45,
  focus: 'Heavier lifts and a little plyometric work to make each stride more economical.',
  warmUp: WARM_UP,
  exercises: [
    { name: 'Back squat or trap-bar deadlift', sets: 4, reps: '5', load: 'RPE 8 — heavy but with perfect form', cue: 'Drive up fast; rest 2–3 min between sets.' },
    { name: 'Step-ups onto a knee-height box (dumbbells)', sets: 3, reps: '6 each leg', load: 'RPE 7–8', cue: 'Push through the top leg only.' },
    { name: 'Single-leg Romanian deadlift', sets: 3, reps: '6 each leg', load: 'RPE 7', cue: 'Hips square; builds balance for uneven roads.' },
    { name: 'Box jumps or pogo hops', sets: 3, reps: '5 jumps / 15 s hops', load: 'Bodyweight, maximum intent', cue: 'Land softly, step down — quality over fatigue.' },
    { name: 'Seated + standing calf raises', sets: 3, reps: '8–10', load: 'Heavy, slow lowering', cue: 'Seated works the soleus, which takes the most load when running.' },
    { name: 'Dead bug + Copenhagen plank', sets: 2, reps: '8 each side + 20 s', load: 'Bodyweight', cue: 'Copenhagen plank strengthens the inner thigh and groin.' },
  ],
  notes: 'Keep this at least 48 hours before your long run. If a quality run is planned the same day, run first and lift afterwards.',
};

const PEAK: StrengthSession = {
  title: 'Strength maintenance',
  durationMin: 30,
  focus: 'Keep the strength you have built with less volume, so long runs and marathon-pace work stay the priority.',
  warmUp: WARM_UP,
  exercises: [
    { name: 'Back squat or trap-bar deadlift', sets: 2, reps: '5', load: 'RPE 7 — same weight as the build phase, fewer sets', cue: 'Crisp and fast; stop well before failure.' },
    { name: 'Romanian deadlift', sets: 2, reps: '6', load: 'RPE 7', cue: 'Smooth, controlled reps.' },
    { name: 'Single-leg calf raise', sets: 2, reps: '10 each leg', load: 'Moderate', cue: 'Calves take a beating in the longest runs — keep them strong.' },
    { name: 'Side plank + dead bug', sets: 2, reps: '30 s + 8 each side', load: 'Bodyweight', cue: '' },
  ],
  notes: 'Leave at least two easy days before your long run. Skip it entirely in a week when you feel run-down.',
};

const TAPER_LIGHT: StrengthSession = {
  title: 'Light strength (taper)',
  durationMin: 25,
  focus: 'Stay primed without any soreness: light weights, low volume.',
  warmUp: WARM_UP,
  exercises: [
    { name: 'Goblet squat', sets: 2, reps: '5', load: 'About 60% of your usual weight', cue: 'Fast and easy.' },
    { name: 'Glute bridge', sets: 2, reps: '10', load: 'Bodyweight', cue: '' },
    { name: 'Calf raises', sets: 2, reps: '10', load: 'Bodyweight', cue: '' },
    { name: 'Side plank', sets: 2, reps: '30 s each side', load: 'Bodyweight', cue: '' },
  ],
  notes: 'Nothing heavy and nothing new — the work is done.',
};

const TAPER_MOBILITY: StrengthSession = {
  title: 'Mobility (no weights)',
  durationMin: 20,
  focus: 'No lifting in the final days before the race — just keep loose.',
  warmUp: '5 min easy walk or bike.',
  exercises: [
    { name: 'Hip flexor stretch', sets: 2, reps: '45 s each side', load: 'Bodyweight', cue: '' },
    { name: 'World\'s greatest stretch', sets: 2, reps: '5 each side', load: 'Bodyweight', cue: '' },
    { name: 'Glute bridge', sets: 2, reps: '10', load: 'Bodyweight', cue: '' },
    { name: 'Foam roll calves, quads and glutes', sets: 1, reps: '5 min', load: '', cue: 'Gentle pressure only.' },
  ],
  notes: 'Optional. Rest is just as good this close to race day.',
};

function scaleForCutback(s: StrengthSession): StrengthSession {
  return {
    ...s,
    title: `${s.title} (lighter week)`,
    durationMin: Math.round(s.durationMin * 0.7),
    exercises: s.exercises.map((e) => ({ ...e, sets: Math.max(1, e.sets - 1) })),
    notes: `Cutback week: one set fewer per exercise at the same weight. ${s.notes}`,
  };
}

export function strengthSessionFor(phase: Phase, cutback: boolean, weeksToRace: number): StrengthSession {
  const base =
    phase === 'taper' ? (weeksToRace >= 2 ? TAPER_LIGHT : TAPER_MOBILITY)
    : phase === 'peak' ? PEAK
    : phase === 'foundation' ? FOUNDATION
    : BUILD;
  return cutback && phase !== 'taper' ? scaleForCutback(base) : base;
}

/** Days between two dates, ignoring direction. */
const gap = (a: string, b: string) => Math.abs(daysBetween(a, b));

/**
 * Picks the rest day furthest from the long run (and the race), at least two
 * days away from it, so the legs are fresh for the long run.
 */
export function pickStrengthDay(week: PlanWeek, raceDate: string): string | null {
  const longDates = week.workouts.filter((w) => w.type === 'long' || w.type === 'race').map((w) => w.date);
  // Long runs in the neighbouring weeks matter too (e.g. Monday after a Sunday long run).
  const anchors = [...longDates, ...longDates.map((d) => addDays(d, 7)), ...longDates.map((d) => addDays(d, -7)), raceDate];
  let best: string | null = null;
  let bestGap = -1;
  for (const w of week.workouts) {
    if (w.type !== 'rest' || w.date >= raceDate) continue;
    const g = Math.min(...anchors.map((a) => gap(w.date, a)));
    if (g >= 2 && g > bestGap) {
      best = w.date;
      bestGap = g;
    }
  }
  return best;
}

export function strengthWorkout(date: string, session: StrengthSession): Workout {
  return {
    id: `${date}-strength`,
    date,
    type: 'strength',
    distanceKm: 0,
    title: `Gym: ${session.title}`,
    description: `${session.focus} ~${session.durationMin} min with weights.`,
    strength: session,
  };
}

/** Turns one rest day per week into a gym strength session. Weeks that already have one are left alone. */
export function withStrengthDays(plan: Plan, raceDate: string): Plan {
  const weeks = plan.weeks.map((week) => {
    if (week.workouts.some((w) => w.type === 'strength')) return week;
    const day = pickStrengthDay(week, raceDate);
    if (!day) return week;
    const weeksToRace = Math.floor(daysBetween(week.startDate, raceDate) / 7);
    const session = strengthSessionFor(week.phase, week.cutback, weeksToRace);
    return { ...week, workouts: week.workouts.map((w) => (w.date === day ? strengthWorkout(day, session) : w)) };
  });
  return { ...plan, weeks };
}

/** Plain-text version of a session, for calendar event descriptions. */
export function strengthText(s: StrengthSession): string {
  const lines = s.exercises.map((e) => `• ${e.name}: ${e.sets} × ${e.reps}${e.load ? ` (${e.load})` : ''}`);
  return [s.focus, `Warm-up: ${s.warmUp}`, ...lines, s.notes].join('\n');
}

/** A workout's description, with the full exercise list for gym sessions. */
export function fullDescription(w: Workout): string {
  return w.strength ? strengthText(w.strength) : w.description;
}

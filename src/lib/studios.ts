import type { ClassCategory, Gym, GymClass, Phase } from '../types';

/*
 * Studio brands on the user's Wellhub plan, with how each fits marathon
 * training, plus the brand's locations in and around Greenwich Village. Addresses were
 * researched October 2026 from brand sites and listings; those marked
 * `verify` came from older reports, so check them in the Wellhub app.
 */

export interface ClassTemplate {
  name: string;
  category: ClassCategory;
  durationMin: number;
  premium?: boolean;
  runningLoad?: boolean; // includes treadmill running — counts as a run session
}

export interface StudioBrand {
  id: string;
  name: string;
  match: RegExp;
  fit: string;
  bestPhases: Phase[];
  templates: ClassTemplate[];
}

export const BRANDS: StudioBrand[] = [
  {
    id: 'lifetime',
    name: 'Life Time',
    match: /life ?time/i,
    fit: 'Your all-rounder. Lift on the gym floor twice a week (squats, deadlifts, lunges, calf raises, core), use the pool or a yoga class for recovery, and the treadmill if it\'s icy outside.',
    bestPhases: ['foundation', 'base', 'build', 'peak', 'taper'],
    templates: [
      { name: 'Strength session (gym floor)', category: 'strength', durationMin: 45 },
      { name: 'Yoga', category: 'yoga', durationMin: 60 },
      { name: 'Pilates', category: 'pilates', durationMin: 50 },
      { name: 'Cycle class', category: 'spin', durationMin: 45 },
      { name: 'Lap swim', category: 'swim', durationMin: 30 },
    ],
  },
  {
    id: 'barrys',
    name: "Barry's",
    match: /barry/i,
    fit: 'Treadmill sprints + lifting: it IS a hard run. Book it in place of a quality session (never on an easy day or the day before a long run). Great in the foundation phase; drop it in peak and taper. Premium on Wellhub Gold.',
    bestPhases: ['foundation', 'base'],
    templates: [{ name: "Barry's Full Body (Run + Lift)", category: 'hiit', durationMin: 50, premium: true, runningLoad: true }],
  },
  {
    id: 'orangetheory',
    name: 'Orangetheory',
    match: /orange ?theory|\botf\b/i,
    fit: 'Treadmill intervals + rower + weights. Counts as a quality run — swap it for that day\'s workout. In the build phase, take the power-walker option to save your legs.',
    bestPhases: ['foundation', 'base'],
    templates: [{ name: 'Orangetheory 50', category: 'hiit', durationMin: 50, runningLoad: true }],
  },
  {
    id: 'soulcycle',
    name: 'SoulCycle',
    match: /soul ?cycle/i,
    fit: 'Low-impact aerobic cross-training. Adds fitness without pounding — ideal in the foundation phase, as a recovery ride the day after a long run (light resistance!), or to keep fit through a niggle.',
    bestPhases: ['foundation', 'base', 'build'],
    templates: [{ name: 'SoulCycle 45', category: 'spin', durationMin: 45 }],
  },
  {
    id: 'cyclebar',
    name: 'CycleBar',
    match: /cycle ?bar/i,
    fit: 'Like SoulCycle but with power metrics on screen — ride by watts and keep it aerobic on recovery days.',
    bestPhases: ['foundation', 'base', 'build'],
    templates: [{ name: 'CycleBar Classic', category: 'spin', durationMin: 50 }],
  },
  {
    id: 'aarmy',
    name: 'AARMY',
    match: /aarmy/i,
    fit: 'Bootcamp (weights to the beat) works as a strength day; Ride as cross-training. New yoga and Pilates classes are good recovery. No showers on site.',
    bestPhases: ['foundation', 'base', 'build'],
    templates: [
      { name: 'AARMY Bootcamp', category: 'strength', durationMin: 45 },
      { name: 'AARMY Ride', category: 'spin', durationMin: 45 },
      { name: 'AARMY Pilates', category: 'pilates', durationMin: 50 },
    ],
  },
  {
    id: 'barre3',
    name: 'barre3',
    match: /barre ?3/i,
    fit: 'Low-impact strength, balance and core — great for hips and ankles, and safe right up to race week. No Manhattan studio was found; barre3 also streams online workouts.',
    bestPhases: ['foundation', 'base', 'build', 'peak', 'taper'],
    templates: [{ name: 'barre3 Signature', category: 'pilates', durationMin: 60 }],
  },
];

export function brandFor(name: string): StudioBrand | undefined {
  return BRANDS.find((b) => b.match.test(name));
}

export interface StudioLocation {
  name: string;
  address: string;
  verify?: boolean;
}

/** Locations in and around Greenwich Village, roughly nearest-first from Washington Square. */
export const NEARBY_STUDIOS: StudioLocation[] = [
  { name: 'Orangetheory Greenwich Village', address: '391 Avenue of the Americas, New York, NY 10014', verify: true },
  { name: 'AARMY NoHo', address: '636 Broadway, New York, NY 10012' },
  { name: 'SoulCycle West Village', address: '126 Leroy St, New York, NY 10014' },
  { name: "Barry's NoHo", address: '419 Lafayette St, New York, NY 10003' },
  { name: 'SoulCycle NoHo', address: '384 Lafayette St, New York, NY 10003' },
  { name: 'Life Time NoHo', address: '62 Cooper Square, New York, NY 10003' },
  { name: 'CycleBar NoHo', address: '51 Astor Place, New York, NY 10003' },
  { name: 'Orangetheory SoHo', address: '62 Crosby St, New York, NY 10012', verify: true },
  { name: "Barry's Tribeca", address: '1 York St, New York, NY 10013' },
  { name: "Barry's Chelsea", address: '135 W 20th St, New York, NY 10011' },
  { name: 'Life Time 23rd Street', address: '60 W 23rd St, New York, NY 10010', verify: true },
];

export function templatesFor(gym: Gym): ClassTemplate[] {
  return brandFor(gym.name)?.templates ?? [
    { name: 'Strength', category: 'strength', durationMin: 45 },
    { name: 'Yoga', category: 'yoga', durationMin: 60 },
    { name: 'Cycle', category: 'spin', durationMin: 45 },
    { name: 'HIIT', category: 'hiit', durationMin: 45 },
  ];
}

export function classFromTemplate(t: ClassTemplate, gymId: string, dayOfWeek: number, startTime: string, id: string): GymClass {
  return { id, gymId, name: t.name, category: t.category, dayOfWeek, startTime, durationMin: t.durationMin, premium: t.premium, runningLoad: t.runningLoad };
}

/** Treadmill-based classes (Barry's, Orangetheory) load the legs like a run. */
export function isRunningClass(name: string): boolean {
  return /barry|orange ?theory|treadmill|tread\b/i.test(name);
}

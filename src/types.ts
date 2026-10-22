// Shared domain types. All distances are stored in kilometres and all
// durations in seconds; conversion to miles happens only at display time.

export type Units = 'km' | 'mi';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Sex = 'female' | 'male';

export interface Profile {
  name: string;
  raceName: string;
  raceDate: string; // YYYY-MM-DD
  goalTimeSec: number;
  recentRace?: { distanceKm: number; timeSec: number };
  currentWeeklyKm: number;
  longestRecentRunKm: number;
  runDaysPerWeek: 3 | 4 | 5 | 6;
  longRunDay: number; // 0 = Sunday … 6 = Saturday
  experience: Experience;
  units: Units;
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  homeAddress: string;
  workAddress: string;
  workDays: number[]; // days of week spent at work, 0 = Sunday
  maxHr?: number; // measured max heart rate; estimated from age when missing
  planStyle?: PlanStyle;
}

/** 'adaptive' = periodised plan with speed work; 'higdon-novice1' = Higdon-style: Novice 1 structure and similar mileage, all easy running. */
export type PlanStyle = 'adaptive' | 'higdon-novice1';

export type WorkoutType =
  | 'easy'
  | 'recovery'
  | 'long'
  | 'tempo'
  | 'intervals'
  | 'marathon-pace'
  | 'race'
  | 'strength'
  | 'cross'
  | 'rest';

export interface StrengthExercise {
  name: string;
  sets: number;
  reps: string;
  load: string;
  cue: string;
}

export interface StrengthSession {
  title: string;
  durationMin: number;
  focus: string;
  warmUp: string;
  exercises: StrengthExercise[];
  notes: string;
}

export type Phase = 'foundation' | 'base' | 'build' | 'peak' | 'taper';

export interface Workout {
  id: string;
  date: string; // suggested day (YYYY-MM-DD); see `scheduled` for the runner's choice
  type: WorkoutType;
  distanceKm: number;
  title: string;
  description: string;
  paceSecPerKm?: number;
  strength?: StrengthSession;
  durationMin?: number; // for timed, non-running items such as cross-training
  scheduled?: string; // the day the runner assigned it to (YYYY-MM-DD); unset = not assigned yet
  done?: boolean; // ticked off without a matching log (e.g. races)
  movedFrom?: string;
  moveReason?: string;
}

export interface PlanWeek {
  index: number;
  startDate: string; // Monday
  phase: Phase;
  targetKm: number;
  cutback: boolean;
  workouts: Workout[];
  adaptationNote?: string;
  intro?: boolean; // a lighter part-week before the plan proper starts (plan begun mid-week)
}

export interface Plan {
  createdAt: string;
  weeks: PlanWeek[];
  paces: Paces;
  starterDeclined?: boolean; // runner chose to keep a full first week despite starting mid-week
}

export interface Paces {
  easy: number;
  long: number;
  marathon: number;
  tempo: number;
  interval: number;
  recovery: number;
}

export interface RunLog {
  id: string;
  date: string;
  workoutId?: string;
  distanceKm: number;
  durationSec: number;
  rpe: number; // 1–10
  notes: string;
  pain?: boolean;
  avgHr?: number;
  maxHr?: number;
  source?: 'manual' | 'garmin' | 'tick'; // 'tick' = created by ticking off a planned item
  externalId?: string; // start time of an imported activity, used to skip duplicates
}

/** A non-running session: gym strength, a studio class or other cross-training. */
export interface ActivityLog {
  id: string;
  date: string;
  kind: ClassCategory;
  name: string;
  gymId?: string;
  plannedId?: string; // the plan's gym workout this completes
  durationMin: number;
  rpe: number;
  notes: string;
  avgHr?: number;
  source?: 'manual' | 'garmin' | 'tick'; // 'tick' = created by ticking off a planned item
  externalId?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO datetime (local)
  end: string;
  allDay: boolean;
  source: 'google' | 'ics';
}

export type ClassCategory = 'strength' | 'yoga' | 'pilates' | 'spin' | 'hiit' | 'swim' | 'other';

export interface Gym {
  id: string;
  name: string;
  address: string;
  verify?: boolean; // address from an older source — confirm in the Wellhub app
  lat?: number;
  lon?: number;
}

export interface GymClass {
  id: string;
  gymId: string;
  name: string;
  category: ClassCategory;
  dayOfWeek: number;
  startTime: string; // HH:MM
  durationMin: number;
  premium?: boolean; // counts against a premium-class allowance (e.g. Wellhub)
  runningLoad?: boolean; // treadmill running (Barry's, Orangetheory) — loads the legs like a run
}

export interface GymMembership {
  provider: string;
  tier: string;
  membershipNumber: string;
  notes: string;
  premiumPerMonth?: number;
}

export type RaceDistance = '5k' | '10k' | '10mi' | 'half' | 'marathon' | 'other';
export type EntryType = 'open' | 'ballot' | 'lottery' | 'qualifier' | 'charity';
export type RaceStatus =
  | 'interested'
  | 'guaranteed' // e.g. 9+1, time qualifier — entry earned but still to be claimed
  | 'ballot-entered'
  | 'ballot-won'
  | 'ballot-lost'
  | 'entered'
  | 'completed'
  | 'skipped';

export interface Race {
  id: string;
  name: string;
  date: string;
  distance: RaceDistance;
  location: string;
  url: string;
  entryType: EntryType;
  entryOpens?: string;
  entryCloses?: string;
  ballotResult?: string;
  cost?: string;
  status: RaceStatus;
  resultTimeSec?: number;
  notes: string;
}

export interface WeightLog {
  id: string;
  date: string;
  kg: number;
}

export interface FoodLog {
  id: string;
  date: string;
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'fuel';
  description: string;
  kcal: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
}

export type ThemeId = 'hudson' | 'park' | 'dusk' | 'morning';

export interface Settings {
  googleClientId: string;
  spotifyClientId: string;
  theme: ThemeId;
}

export interface Geo {
  lat: number;
  lon: number;
}

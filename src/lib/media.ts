import type { Workout, WorkoutType } from '../types';

export interface SpokenPick {
  title: string;
  by: string;
  kind: 'podcast' | 'audiobook';
  approxHours?: number;
  why: string;
  tags: ('running' | 'story' | 'long-episodes' | 'motivation' | 'science')[];
}

// Hand-picked starting points; use the Spotify search for more.
export const SPOKEN_PICKS: SpokenPick[] = [
  { title: 'Born to Run', by: 'Christopher McDougall', kind: 'audiobook', approxHours: 10, why: 'The classic running adventure story', tags: ['running', 'story'] },
  { title: 'What I Talk About When I Talk About Running', by: 'Haruki Murakami', kind: 'audiobook', approxHours: 5, why: 'Reflective memoir of marathon training — one or two long runs', tags: ['running', 'story'] },
  { title: 'Endure', by: 'Alex Hutchinson', kind: 'audiobook', approxHours: 10, why: 'The science of how far you can push — great for mid-block motivation', tags: ['running', 'science'] },
  { title: 'Let Your Mind Run', by: 'Deena Kastor', kind: 'audiobook', approxHours: 7, why: 'Olympic marathon medallist on mental strength', tags: ['running', 'motivation'] },
  { title: 'Running with the Kenyans', by: 'Adharanand Finn', kind: 'audiobook', approxHours: 9, why: 'A journalist trains in Iten for a marathon', tags: ['running', 'story'] },
  { title: 'Shoe Dog', by: 'Phil Knight', kind: 'audiobook', approxHours: 13, why: 'Nike founder memoir — easy listening for several long runs', tags: ['story'] },
  { title: 'Marathon Training Academy', by: 'Angie & Trevor Spencer', kind: 'podcast', why: 'Practical marathon training and fuelling advice', tags: ['running'] },
  { title: 'Some Work, All Play', by: 'David & Megan Roche', kind: 'podcast', why: 'Coaching science with a light touch', tags: ['running', 'science'] },
  { title: 'Running for Real', by: 'Tina Muir', kind: 'podcast', why: 'Interviews with runners of every level', tags: ['running', 'motivation'] },
  { title: "Dan Carlin's Hardcore History", by: 'Dan Carlin', kind: 'podcast', why: 'Episodes run 3–6 hours — one episode lasts a whole long run', tags: ['story', 'long-episodes'] },
];

/** Recommends spoken-word picks sized to the workout's expected duration. */
export function spokenFor(minutes: number): SpokenPick[] {
  if (minutes >= 120) return SPOKEN_PICKS.filter((p) => p.kind === 'audiobook' || p.tags.includes('long-episodes'));
  if (minutes >= 60) return SPOKEN_PICKS;
  return SPOKEN_PICKS.filter((p) => p.kind === 'podcast');
}

/** Music suits sessions where rhythm and energy matter; spoken word suits easy/long efforts. */
export function audioAdvice(type: WorkoutType): string {
  switch (type) {
    case 'intervals':
    case 'tempo':
      return 'High-energy music helps hard efforts — aim for 165–180 BPM so your stride syncs with the beat.';
    case 'marathon-pace':
    case 'race':
      return 'Steady tempo music near your race cadence. Check whether your race allows headphones.';
    case 'long':
      return 'Mix it up: an audiobook or long podcast for the first two-thirds, then a music playlist to lift the final stretch.';
    default:
      return 'Conversational effort — podcasts are perfect. Keep music relaxed so you don\'t speed up.';
  }
}

export function searchKeywords(type: WorkoutType): string[] {
  switch (type) {
    case 'intervals':
    case 'tempo':
      return ['running 175 bpm', 'workout high energy'];
    case 'marathon-pace':
    case 'race':
      return ['running 170 bpm', 'marathon motivation'];
    case 'long':
      return ['long run', 'running 165 bpm'];
    default:
      return ['easy run chill', 'running 160 bpm'];
  }
}

export function playlistName(w: Workout, distanceLabel: string): string {
  return `🏃 ${w.title} · ${distanceLabel} · ${w.date}`;
}

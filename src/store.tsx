import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ActivityLog, CalendarEvent, FoodLog, Geo, Gym, GymClass, GymMembership, Plan, Profile, Race, RunLog, Settings, WeightLog } from './types';

export interface AppState {
  profile: Profile | null;
  plan: Plan | null;
  logs: RunLog[];
  events: CalendarEvent[];
  gyms: Gym[];
  classes: GymClass[];
  membership: GymMembership;
  races: Race[];
  weights: WeightLog[];
  activities: ActivityLog[];
  foods: FoodLog[];
  settings: Settings;
  geo: { home?: Geo; work?: Geo };
}

const KEY = 'mc.state.v1';

export const initialState: AppState = {
  profile: null,
  plan: null,
  logs: [],
  events: [],
  gyms: [],
  classes: [],
  membership: { provider: '', tier: '', membershipNumber: '', notes: '' },
  races: [],
  weights: [],
  activities: [],
  foods: [],
  settings: {
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
    spotifyClientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
    theme: 'hudson',
  },
  geo: {},
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...initialState, ...parsed, settings: { ...initialState.settings, ...parsed.settings } };
  } catch {
    return initialState;
  }
}

type Updater = Partial<AppState> | ((s: AppState) => Partial<AppState>);

const Ctx = createContext<{ state: AppState; update: (u: Updater) => void; replace: (s: AppState) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable — the app keeps working in memory.
    }
  }, [state]);
  const update = (u: Updater) => setState((s) => ({ ...s, ...(typeof u === 'function' ? u(s) : u) }));
  return <Ctx.Provider value={{ state, update, replace: setState }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside provider');
  return c;
}

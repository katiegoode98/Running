import type { CalendarEvent, Workout } from '../types';
import { addDays } from './dates';
import { toLocalStamp } from './calendar';

// Google Calendar via Google Identity Services (browser-only OAuth token flow).
// Requires an OAuth "Web application" client ID whose authorised JavaScript
// origin matches where this app is served (e.g. http://127.0.0.1:5173).

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3';

interface TokenResponse {
  access_token?: string;
  error?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: { client_id: string; scope: string; callback: (r: TokenResponse) => void }): { requestAccessToken(): void };
        };
      };
    };
  }
}

let token: string | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
}

export async function connectGoogle(clientId: string): Promise<void> {
  await loadGis();
  token = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error ?? 'Google sign-in failed'))),
    });
    client.requestAccessToken();
  });
}

export function googleConnected(): boolean {
  return token !== null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!token) throw new Error('Connect Google Calendar first');
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } });
  if (!res.ok) throw new Error(`Google Calendar error ${res.status}`);
  return res.json() as Promise<T>;
}

interface GEvent {
  id: string;
  summary?: string;
  status?: string;
  transparency?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

/** Fetches events from every calendar the user has selected in Google Calendar. */
export async function fetchGoogleEvents(fromDate: string, days: number): Promise<CalendarEvent[]> {
  const list = await api<{ items: { id: string; selected?: boolean; summary: string }[] }>('/users/me/calendarList');
  const timeMin = new Date(fromDate).toISOString();
  const timeMax = new Date(addDays(fromDate, days)).toISOString();
  const out: CalendarEvent[] = [];
  for (const cal of list.items.filter((c) => c.selected !== false && !/training|marathon coach/i.test(c.summary))) {
    let pageToken = '';
    do {
      const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' });
      if (pageToken) q.set('pageToken', pageToken);
      const page = await api<{ items: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
      for (const e of page.items) {
        // Skip cancelled and "free" (transparent) events — they don't block time.
        if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
        const allDay = !!e.start.date;
        out.push({
          id: `${cal.id}-${e.id}`,
          title: e.summary ?? 'Busy',
          start: allDay ? `${e.start.date}T00:00` : toLocalStamp(new Date(e.start.dateTime!)),
          end: allDay ? `${e.end.date}T00:00` : toLocalStamp(new Date(e.end.dateTime!)),
          allDay,
          source: 'google',
        });
      }
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
  }
  return out;
}

/** Writes workouts to the primary calendar as free, all-day events. */
export async function pushWorkoutsToGoogle(workouts: Workout[], label: (w: Workout) => string): Promise<number> {
  let n = 0;
  for (const w of workouts) {
    if (w.type === 'rest') continue;
    await api('/calendars/primary/events', {
      method: 'POST',
      body: JSON.stringify({
        summary: label(w),
        description: w.description,
        start: { date: w.date },
        end: { date: addDays(w.date, 1) },
        transparency: 'transparent',
      }),
    });
    n++;
  }
  return n;
}

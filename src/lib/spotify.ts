// Spotify Web API with Authorization Code + PKCE (no client secret, so it can
// run entirely in the browser). Create an app at developer.spotify.com and add
// this app's URL (e.g. http://127.0.0.1:5173/) as a Redirect URI.
//
// Note: Spotify removed audio-features (BPM) and recommendations for new apps
// in Nov 2024, so playlists are built from your own top/saved tracks plus
// keyword search, sized to the workout's duration. Endpoints follow the
// February 2026 Development Mode changes (POST /me/playlists,
// /playlists/{id}/items, search capped at 10 results per page).

const SCOPES = ['playlist-modify-private', 'playlist-modify-public', 'user-top-read', 'user-library-read', 'user-read-private'].join(' ');
const API = 'https://api.spotify.com/v1';
const TOKEN_KEY = 'mc.spotifyToken';
const VERIFIER_KEY = 'mc.spotifyVerifier';

interface StoredToken {
  access: string;
  refresh?: string;
  expires: number;
}

function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startSpotifyLogin(clientId: string): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state: 'spotify',
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${q}`);
}

/** Call on app load: completes the login if Spotify redirected back with a code. */
export async function completeSpotifyLogin(clientId: string): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code || params.get('state') !== 'spotify') return false;
  const verifier = sessionStorage.getItem(VERIFIER_KEY) ?? '';
  window.history.replaceState({}, '', redirectUri());
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier }),
  });
  if (!res.ok) throw new Error('Spotify login failed');
  saveToken(await res.json());
  return true;
}

function saveToken(j: { access_token: string; refresh_token?: string; expires_in: number }): void {
  const prev = loadToken();
  const t: StoredToken = { access: j.access_token, refresh: j.refresh_token ?? prev?.refresh, expires: Date.now() + j.expires_in * 1000 - 60_000 };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

function loadToken(): StoredToken | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function spotifyConnected(): boolean {
  return loadToken() !== null;
}

export function disconnectSpotify(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function accessToken(clientId: string): Promise<string> {
  const t = loadToken();
  if (!t) throw new Error('Connect Spotify first');
  if (Date.now() < t.expires) return t.access;
  if (!t.refresh) throw new Error('Spotify session expired — reconnect');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: t.refresh }),
  });
  if (!res.ok) throw new Error('Spotify session expired — reconnect');
  saveToken(await res.json());
  return loadToken()!.access;
}

async function api<T>(clientId: string, path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(clientId);
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Spotify error ${res.status}`);
  return res.json() as Promise<T>;
}

export interface Track {
  uri: string;
  name: string;
  artist: string;
  durationMs: number;
}

interface STrack {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
}

const toTrack = (t: STrack): Track => ({ uri: t.uri, name: t.name, artist: t.artists.map((a) => a.name).join(', '), durationMs: t.duration_ms });

export async function candidateTracks(clientId: string, keywords: string[]): Promise<Track[]> {
  const pools: Track[][] = [];
  const top = await api<{ items: STrack[] }>(clientId, '/me/top/tracks?limit=50&time_range=medium_term');
  pools.push(top.items.map(toTrack));
  const saved = await api<{ items: { track: STrack }[] }>(clientId, '/me/tracks?limit=50');
  pools.push(saved.items.map((i) => toTrack(i.track)));
  for (const k of keywords.filter(Boolean)) {
    const found: Track[] = [];
    for (let offset = 0; offset < 30; offset += 10) {
      const r = await api<{ tracks: { items: STrack[] } }>(clientId, `/search?type=track&limit=10&offset=${offset}&q=${encodeURIComponent(k)}`);
      found.push(...r.tracks.items.filter(Boolean).map(toTrack));
    }
    pools.push(found);
  }
  // Interleave sources so the playlist mixes favourites and discoveries.
  const seen = new Set<string>();
  const out: Track[] = [];
  for (let i = 0; i < 50; i++) {
    for (const p of pools) {
      const t = p[i];
      if (t && !seen.has(t.uri)) { seen.add(t.uri); out.push(t); }
    }
  }
  return out;
}

/** Picks tracks in order until the target duration is covered. */
export function fillDuration(tracks: Track[], targetMin: number): Track[] {
  const out: Track[] = [];
  let total = 0;
  for (const t of tracks) {
    if (total >= targetMin * 60_000) break;
    out.push(t);
    total += t.durationMs;
  }
  return out;
}

export async function createPlaylist(clientId: string, name: string, description: string, uris: string[]): Promise<string> {
  const pl = await api<{ id: string; external_urls: { spotify: string } }>(clientId, '/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  });
  for (let i = 0; i < uris.length; i += 100) {
    await api(clientId, `/playlists/${pl.id}/items`, { method: 'POST', body: JSON.stringify({ uris: uris.slice(i, i + 100) }) });
  }
  return pl.external_urls.spotify;
}

export interface Show {
  name: string;
  publisher: string;
  url: string;
  kind: 'podcast' | 'audiobook';
}

export async function searchSpoken(clientId: string, query: string): Promise<Show[]> {
  const r = await api<{ shows?: { items: ({ name: string; publisher: string; external_urls: { spotify: string } } | null)[] }; audiobooks?: { items: ({ name: string; authors: { name: string }[]; external_urls: { spotify: string } } | null)[] } }>(
    clientId,
    `/search?type=show,audiobook&limit=10&q=${encodeURIComponent(query)}`,
  );
  const shows: Show[] = (r.shows?.items ?? []).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ name: s.name, publisher: s.publisher, url: s.external_urls.spotify, kind: 'podcast' }));
  const books: Show[] = (r.audiobooks?.items ?? []).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ name: s.name, publisher: s.authors.map((a) => a.name).join(', '), url: s.external_urls.spotify, kind: 'audiobook' }));
  return [...books, ...shows];
}

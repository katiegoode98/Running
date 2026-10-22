import { useEffect, useState } from 'react';
import { Card, Empty, Field } from '../components/ui';
import { useStore } from '../store';
import { formatDate, today } from '../lib/dates';
import { fmtDist } from '../lib/format';
import { minutesNeeded } from '../lib/calendar';
import { audioAdvice, playlistName, searchKeywords, spokenFor } from '../lib/media';
import { candidateTracks, createPlaylist, disconnectSpotify, fillDuration, searchSpoken, spotifyConnected, startSpotifyLogin, type Show } from '../lib/spotify';

export function MusicView() {
  const { state } = useStore();
  const { plan, profile, settings } = state;
  const upcoming = plan?.weeks.flatMap((w) => w.workouts).filter((w) => w.date >= today() && w.type !== 'rest').slice(0, 14) ?? [];
  const [workoutId, setWorkoutId] = useState(upcoming.find((w) => w.type === 'long')?.id ?? upcoming[0]?.id ?? '');
  const workout = upcoming.find((w) => w.id === workoutId);
  const [keywords, setKeywords] = useState('');
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  const [query, setQuery] = useState('running');
  const [results, setResults] = useState<Show[]>([]);
  const connected = spotifyConnected();

  useEffect(() => {
    if (workout) setKeywords(searchKeywords(workout.type).join(', '));
  }, [workoutId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan || !profile) return <Empty>Create your profile first.</Empty>;
  const minutes = workout ? minutesNeeded(workout, plan.paces) - 30 : 0;

  async function build() {
    if (!workout) return;
    try {
      setMsg('Finding tracks…');
      const tracks = await candidateTracks(settings.spotifyClientId, keywords.split(',').map((k) => k.trim()));
      const chosen = fillDuration(tracks, minutes + 5);
      setMsg(`Creating playlist with ${chosen.length} tracks…`);
      const url = await createPlaylist(settings.spotifyClientId, playlistName(workout, fmtDist(workout.distanceKm, profile!.units)), `${workout.description} — built by Marathon Coach`, chosen.map((t) => t.uri));
      setLink(url);
      setMsg('Playlist created.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function search() {
    try {
      setResults(await searchSpoken(settings.spotifyClientId, query));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="stack">
      <Card title="Spotify">
        {!settings.spotifyClientId ? (
          <p className="muted">Add your Spotify client ID in Settings to create playlists.</p>
        ) : connected ? (
          <div className="row"><span className="pill ok">Connected</span><button className="link" onClick={() => { disconnectSpotify(); location.reload(); }}>disconnect</button></div>
        ) : (
          <button className="primary" onClick={() => startSpotifyLogin(settings.spotifyClientId)}>Connect Spotify</button>
        )}
      </Card>

      <Card title="Playlist for a workout">
        <Field label="Workout">
          <select value={workoutId} onChange={(e) => setWorkoutId(e.target.value)}>
            {upcoming.map((w) => <option key={w.id} value={w.id}>{formatDate(w.date)} — {w.title} ({fmtDist(w.distanceKm, profile.units)})</option>)}
          </select>
        </Field>
        {workout && (
          <>
            <p className="muted small">≈ {Math.round(minutes)} min. {audioAdvice(workout.type)}</p>
            <Field label="Search keywords (comma-separated)" hint="Mixed with your top and saved tracks">
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </Field>
            <div className="row">
              <button className="primary" disabled={!connected} onClick={build}>Create playlist on Spotify</button>
              <span className="muted">{msg}</span>
              {link && <a href={link} target="_blank" rel="noreferrer">Open playlist ↗</a>}
            </div>
          </>
        )}
      </Card>

      <Card title="Podcasts & audiobooks for long runs">
        {workout && <p className="muted small">Picks sized for a ~{Math.round(minutes)} min run:</p>}
        <ul>
          {spokenFor(minutes).map((p) => (
            <li key={p.title}>
              <strong>{p.title}</strong> <span className="muted">— {p.by} · {p.kind}{p.approxHours ? ` · ~${p.approxHours} h` : ''}</span>
              <div className="muted small">{p.why}</div>
            </li>
          ))}
        </ul>
        <div className="row">
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
          <button disabled={!connected} onClick={search}>Search Spotify</button>
        </div>
        {results.map((r) => <p key={r.url} className="small"><a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> <span className="muted">— {r.publisher} · {r.kind}</span></p>)}
      </Card>
    </div>
  );
}

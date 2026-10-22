import { Card, Field } from '../components/ui';
import { initialState, useStore, type AppState } from '../store';

export function SettingsView() {
  const { state, update, replace } = useStore();
  const origin = `${window.location.origin}${window.location.pathname}`;
  const setKey = (k: keyof AppState['settings'], v: string) => update((s) => ({ settings: { ...s.settings, [k]: v.trim() } }));

  function exportData() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `marathon-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text()) as AppState;
      if (confirm('Replace all current data with this backup?')) replace({ ...initialState, ...data });
    } catch {
      alert('That file is not a valid backup.');
    }
  }

  return (
    <div className="stack">
      <Card title="Integrations">
        <Field label="Google OAuth client ID" hint={`Google Cloud Console → APIs & Services: enable the Calendar API, create an OAuth "Web application" client, and add ${window.location.origin} as an authorised JavaScript origin.`}>
          <input value={state.settings.googleClientId} onChange={(e) => setKey('googleClientId', e.target.value)} />
        </Field>
        <Field label="Spotify client ID" hint={`developer.spotify.com → Dashboard → Create app (Web API). Add ${origin} as a Redirect URI and your Spotify account under User Management.`}>
          <input value={state.settings.spotifyClientId} onChange={(e) => setKey('spotifyClientId', e.target.value)} />
        </Field>
        <p className="muted small">Maps use OpenStreetMap for geocoding (no key needed) and open Google Maps for directions.</p>
      </Card>
      <Card title="Your data">
        <p className="muted small">Everything is stored in this browser only. Back it up regularly, or to move it to another device.</p>
        <div className="row">
          <button onClick={exportData}>Download backup</button>
          <label className="button">Restore backup<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} /></label>
          <button className="danger" onClick={() => confirm('Delete all data?') && replace(initialState)}>Reset everything</button>
        </div>
      </Card>
    </div>
  );
}

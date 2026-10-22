import { useEffect, useState } from 'react';
import { useStore } from './store';
import { completeSpotifyLogin } from './lib/spotify';
import { TodayView } from './views/TodayView';
import { PlanView } from './views/PlanView';
import { LogView } from './views/LogView';
import { CalendarView } from './views/CalendarView';
import { GymView } from './views/GymView';
import { RacesView } from './views/RacesView';
import { MusicView } from './views/MusicView';
import { NutritionView } from './views/NutritionView';
import { ProfileView } from './views/ProfileView';
import { SettingsView } from './views/SettingsView';

const TABS = [
  ['today', 'Today', '🏠'],
  ['plan', 'Plan', '📅'],
  ['log', 'Log', '➕'],
  ['races', 'Races', '🏁'],
  ['calendar', 'Calendar', '🗓'],
  ['gym', 'Gym', '🏋️'],
  ['music', 'Music', '🎧'],
  ['nutrition', 'Nutrition', '🥗'],
  ['profile', 'Profile', '👤'],
  ['settings', 'Settings', '⚙️'],
] as const;

type Tab = (typeof TABS)[number][0];

// On phones the first four tabs live in a bottom bar; the rest sit behind "More".
const PRIMARY = 4;

export function App() {
  const { state } = useStore();
  const [tab, setTabState] = useState<Tab>(() => (new URLSearchParams(location.search).get('state') === 'spotify' ? 'music' : 'today'));
  const [moreOpen, setMoreOpen] = useState(false);
  const setTab = (t: Tab) => {
    setTabState(t);
    setMoreOpen(false);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (state.settings.spotifyClientId) completeSpotifyLogin(state.settings.spotifyClientId).catch((e) => alert(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state.profile) {
    return (
      <main className="app">
        <header className="top"><h1>🏃 Marathon Coach</h1></header>
        <ProfileView onDone={() => setTab('today')} />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="top">
        <h1>🏃 Marathon Coach</h1>
        <nav className="top-nav">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
      </header>
      <nav className="bottom-nav">
        {TABS.slice(0, PRIMARY).map(([id, label, icon]) => (
          <button key={id} className={tab === id && !moreOpen ? 'active' : ''} onClick={() => setTab(id)}>
            <span aria-hidden>{icon}</span>{label}
          </button>
        ))}
        <button className={moreOpen || TABS.slice(PRIMARY).some(([id]) => id === tab) ? 'active' : ''} onClick={() => setMoreOpen(!moreOpen)}>
          <span aria-hidden>☰</span>More
        </button>
      </nav>
      {moreOpen && (
        <div className="more-sheet" onClick={() => setMoreOpen(false)}>
          <div className="more-grid" onClick={(e) => e.stopPropagation()}>
            {TABS.slice(PRIMARY).map(([id, label, icon]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                <span aria-hidden>{icon}</span>{label}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'today' && <TodayView onLog={() => setTab('log')} />}
      {tab === 'plan' && <PlanView />}
      {tab === 'log' && <LogView />}
      {tab === 'calendar' && <CalendarView />}
      {tab === 'gym' && <GymView />}
      {tab === 'races' && <RacesView />}
      {tab === 'music' && <MusicView />}
      {tab === 'nutrition' && <NutritionView />}
      {tab === 'profile' && <ProfileView />}
      {tab === 'settings' && <SettingsView />}
    </main>
  );
}

import type { ThemeId } from '../types';

export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;
  /** Banner gradient (start, end) — also used for the swatch in Settings. */
  brand: [string, string];
  accent: string;
}

export const THEMES: Theme[] = [
  { id: 'dusk', name: 'Brooklyn Dusk', tagline: 'Plum and rose, like a sunset over the bridge', brand: ['#3b1e5f', '#a3306f'], accent: '#6d28d9' },
  { id: 'hudson', name: 'Hudson', tagline: 'Deep navy and river teal', brand: ['#0f2a43', '#155e75'], accent: '#0f766e' },
  { id: 'park', name: 'Central Park', tagline: 'Forest green with a touch of gold', brand: ['#1f4d38', '#3c7a55'], accent: '#2f6b4f' },
  { id: 'morning', name: 'Morning Run', tagline: 'Slate and clear sky blue', brand: ['#1e293b', '#2563eb'], accent: '#2563eb' },
];

export function themeById(id: ThemeId | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0] // Brooklyn Dusk;
}

/** Sets the colour scheme on <html> and the browser/status-bar colour. */
export function applyTheme(id: ThemeId | undefined) {
  const theme = themeById(id);
  document.documentElement.dataset.scheme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.brand[0]);
}

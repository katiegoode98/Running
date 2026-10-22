import type { Geo, Workout } from '../types';
import { haversineKm } from './gym';

/*
 * Route ideas for runners based in lower Manhattan. Distances are approximate:
 * Manhattan's numbered streets are ~20 blocks per mile (~80 m apart), and the
 * Hudson River Greenway runs roughly parallel to them from West Houston St to
 * Dyckman St.
 */

const GREENWAY_ACCESS: Geo = { lat: 40.7286, lon: -74.011 }; // W Houston St & West St
const KM_PER_BLOCK = 0.0805;
const MAX_STREET = 200; // Dyckman St

const LANDMARKS: [number, string][] = [
  [14, 'Little Island / Pier 57'],
  [23, 'Chelsea Piers'],
  [34, 'Hudson Yards'],
  [46, 'the Intrepid'],
  [59, 'Riverside Park South'],
  [72, 'Riverside Park at W 72nd'],
  [96, 'W 96th St'],
  [125, 'Harlem Piers (W 125th)'],
  [145, 'Riverbank State Park'],
  [178, 'the Little Red Lighthouse under the GWB'],
  [200, 'Dyckman St'],
];

export function greenwayKmFromHouston(street: number): number {
  return (street + 2) * KM_PER_BLOCK;
}

/** Distance from home to the greenway at W Houston St; assumes ~1.1 km (around Washington Square) without a location. */
export function accessKm(home: Geo | null | undefined): number {
  if (!home) return 1.1;
  const km = haversineKm(home, GREENWAY_ACCESS) * 1.25;
  return Math.round(km * 10) / 10;
}

export function isLowerManhattan(home: Geo | null | undefined): boolean {
  return !!home && haversineKm(home, GREENWAY_ACCESS) < 4;
}

export interface RouteIdea {
  title: string;
  detail: string;
  mapsUrl: string;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

function nearestLandmark(street: number): string {
  const [s, name] = LANDMARKS.reduce((best, l) => (Math.abs(l[0] - street) < Math.abs(best[0] - street) ? l : best));
  return Math.abs(s - street) <= 6 ? name : `W ${ordinal(street)} St`;
}

const maps = (dest: string) => `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${encodeURIComponent(dest)}`;

export function routeIdeas(w: Workout, home: Geo | null | undefined): RouteIdea[] {
  const access = accessKm(home);
  const ideas: RouteIdea[] = [];
  const oneWay = w.distanceKm / 2;
  const along = oneWay - access;

  if (along > 0.5) {
    const street = Math.round(along / KM_PER_BLOCK - 2);
    if (street <= MAX_STREET) {
      const at = nearestLandmark(street);
      ideas.push({
        title: 'Hudson River Greenway out-and-back',
        detail: `~${access} km to the river at W Houston St, then north to around W ${ordinal(street)} St${at.startsWith('W ') ? '' : ` (${at})`} and back. Flat, car-free, with mile markers.`,
        mapsUrl: maps(`Hudson River Greenway at West ${ordinal(street)} Street, New York`),
      });
    } else {
      const extra = Math.round((w.distanceKm - 2 * (access + greenwayKmFromHouston(MAX_STREET))) * 10) / 10;
      ideas.push({
        title: 'Hudson River Greenway — the full length',
        detail: `Out to Dyckman St and back (~${Math.round(2 * (access + greenwayKmFromHouston(MAX_STREET)))} km), plus ~${extra} km extra — start with a loop south to Battery Park.`,
        mapsUrl: maps('Dyckman Street and Hudson River Greenway, New York'),
      });
    }
  } else if (w.distanceKm > 0) {
    ideas.push({
      title: 'Hudson River Park loop',
      detail: 'Head west to the river, run along the piers, and loop back through Washington Square Park.',
      mapsUrl: maps('Hudson River Park, Pier 45, New York'),
    });
  }

  if (w.type === 'long' && w.distanceKm >= 16) {
    ideas.push({
      title: 'Central Park (race-finish practice)',
      detail: 'Run up the greenway to W 72nd, cut across to Central Park and do the full 6.1-mile (9.8 km) loop. Harlem Hill and the east side rollers match the race\'s last 10 km. Subway home from 72nd St.',
      mapsUrl: maps('Central Park Drive, New York'),
    });
  }
  if (w.type === 'tempo' && /hill/i.test(w.title)) {
    ideas.push({
      title: 'Williamsburg Bridge repeats',
      detail: 'About 2.5 km east via Delancey St. Run up the ramp hard and jog down. The course crosses five bridges (Verrazzano, Pulaski, Queensboro, Willis Ave and Madison Ave), so bridge climbs are perfect practice.',
      mapsUrl: maps('Williamsburg Bridge pedestrian path, Manhattan entrance'),
    });
  }
  if (ideas.length) {
    ideas.push({
      title: 'Water',
      detail: 'Park drinking fountains are usually shut off from late autumn to spring — carry water on longer runs in the colder months.',
      mapsUrl: '',
    });
  }
  return ideas;
}

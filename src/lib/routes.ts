import type { Geo, Workout } from '../types';
import { haversineKm } from './gym';

/*
 * Route options for a planned run. Runners based in lower Manhattan get
 * specific routes (Hudson River Greenway, Central Park, Brooklyn Bridge, …);
 * everyone else gets a sized out-and-back plus links for finding local routes.
 *
 * Distances are approximate. Manhattan's numbered streets are ~20 blocks per
 * mile (~80 m apart), and the Hudson River Greenway runs roughly parallel to
 * them from West Houston St to Dyckman St. Every option links to Google Maps
 * with the route drawn from home, so the real distance can be checked there.
 */

const GREENWAY_ACCESS: Geo = { lat: 40.7286, lon: -74.011 }; // W Houston St & West St
const BROOKLYN_BRIDGE: Geo = { lat: 40.7123, lon: -74.0041 }; // Manhattan entrance, near City Hall
const WILLIAMSBURG_BRIDGE: Geo = { lat: 40.7181, lon: -73.9866 }; // Delancey St entrance
const KM_PER_BLOCK = 0.0805;
const MAX_STREET = 200; // Dyckman St
const GREENWAY_TO_BATTERY_KM = 3.0; // W Houston St south to Battery Park
const BROOKLYN_BRIDGE_SPAN_KM = 1.8;
const ROAD_FACTOR = 1.25;

// Central Park loops (commonly quoted distances).
const CP_FULL_KM = 9.8; // 6.1 mi
const CP_LOWER_KM = 2.7; // 1.7 mi, via the 72nd St transverse
const CP_RESERVOIR_KM = 2.5; // 1.58 mi

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

const round1 = (n: number) => Math.round(n * 10) / 10;

function legKm(home: Geo | null | undefined, to: Geo, fallback: number): number {
  return home ? round1(haversineKm(home, to) * ROAD_FACTOR) : fallback;
}

/** Distance from home to the greenway at W Houston St; assumes ~1.1 km (around Washington Square) without a location. */
export function accessKm(home: Geo | null | undefined): number {
  return legKm(home, GREENWAY_ACCESS, 1.1);
}

export function isLowerManhattan(home: Geo | null | undefined): boolean {
  return !!home && haversineKm(home, GREENWAY_ACCESS) < 4;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

function nearestLandmark(street: number): string | null {
  const [s, name] = LANDMARKS.reduce((best, l) => (Math.abs(l[0] - street) < Math.abs(best[0] - street) ? l : best));
  return Math.abs(s - street) <= 6 ? name : null;
}

export interface RouteOption {
  title: string;
  km: number; // approximate distance of the route as described
  tags: string[];
  detail: string;
  mapsUrl: string;
}

export interface RouteContext {
  home: Geo | null | undefined;
  homeAddress: string;
  nyc: boolean; // offer the lower-Manhattan routes
}

const DEFAULT_START = 'Washington Square Park, New York, NY';

/** Google Maps walking directions from home and back via the given waypoints, so the route and distance can be checked. */
export function loopUrl(homeAddress: string, waypoints: string[]): string {
  const origin = homeAddress.trim() || DEFAULT_START;
  const q = new URLSearchParams({ api: '1', origin, destination: origin, travelmode: 'walking' });
  if (waypoints.length) q.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${q}`;
}

function oneWayUrl(homeAddress: string, destination: string): string {
  const origin = homeAddress.trim() || DEFAULT_START;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin, destination, travelmode: 'walking' })}`;
}

const isQuality = (w: Workout) => w.type === 'tempo' || w.type === 'intervals' || w.type === 'marathon-pace';
const isHills = (w: Workout) => w.type === 'tempo' && /hill/i.test(w.title);

/** Splits a Central Park distance into loops, e.g. "1 full loop + 1 × the lower loop". */
export function centralParkLoops(km: number): string {
  const full = Math.floor(km / CP_FULL_KM);
  let rest = km - full * CP_FULL_KM;
  const parts: string[] = [];
  if (full) parts.push(`${full} full loop${full > 1 ? 's' : ''} (9.8 km each)`);
  const lower = Math.floor(rest / CP_LOWER_KM);
  rest -= lower * CP_LOWER_KM;
  if (lower) parts.push(`${lower} × the lower loop (2.7 km)`);
  if (rest >= 1) parts.push(`~${round1(rest)} km easy around the reservoir path`);
  return parts.join(' + ') || `the reservoir loop (${CP_RESERVOIR_KM} km)`;
}

function nycRoutes(w: Workout, ctx: RouteContext): RouteOption[] {
  const out: RouteOption[] = [];
  const d = w.distanceKm;
  const access = accessKm(ctx.home);

  // Hudson River Greenway north: flat, car-free, ideal for pacing.
  const along = d / 2 - access;
  if (along > 0.5) {
    const street = Math.min(MAX_STREET, Math.round(along / KM_PER_BLOCK - 2));
    const landmark = nearestLandmark(street);
    const full = street === MAX_STREET;
    out.push({
      title: full ? 'Hudson River Greenway — the full length' : 'Hudson River Greenway north',
      km: round1(2 * (access + greenwayKmFromHouston(street))),
      tags: ['flat', 'car-free', 'river views'],
      detail: full
        ? 'Out to Dyckman St and back; add the remaining distance with a loop south to Battery Park at the start.'
        : `~${access} km west to the river at W Houston St, then north to W ${ordinal(street)} St${landmark ? ` (${landmark})` : ''} and back.${isQuality(w) ? ' Long, uninterrupted stretches make it the easiest place in Manhattan to hold a pace.' : ''}`,
      mapsUrl: loopUrl(ctx.homeAddress, [`Hudson River Greenway at West ${ordinal(street)} Street, New York, NY`]),
    });
  } else {
    out.push({
      title: 'Hudson River Park piers',
      km: round1(Math.max(d, 2 * access)),
      tags: ['flat', 'short'],
      detail: 'West to the river, a few hundred metres along the piers, and back through Washington Square Park.',
      mapsUrl: loopUrl(ctx.homeAddress, ['Pier 45, Hudson River Park, New York, NY']),
    });
  }

  // Hill sessions: bridge climbs like the course's five bridges.
  if (isHills(w)) {
    const toWb = legKm(ctx.home, WILLIAMSBURG_BRIDGE, 2.5);
    out.unshift({
      title: 'Williamsburg Bridge repeats',
      km: d,
      tags: ['hills', 'bridge'],
      detail: `~${toWb} km east via Delancey St as your warm-up, then hard efforts up the ramp and easy jogs down. The marathon crosses five bridges (Verrazzano, Pulaski, Queensboro, Willis Ave and Madison Ave).`,
      mapsUrl: oneWayUrl(ctx.homeAddress, 'Williamsburg Bridge pedestrian path, Delancey St, New York, NY'),
    });
  }

  // South to Battery Park: scenic and flat for easy and medium runs.
  const batteryKm = round1(2 * (access + GREENWAY_TO_BATTERY_KM));
  if (d >= 6 && d <= 16 && !isQuality(w)) {
    const extra = round1(d - batteryKm);
    out.push({
      title: 'Battery Park & the harbour',
      km: Math.max(batteryKm, d),
      tags: ['flat', 'scenic'],
      detail: `Down the greenway past Tribeca to Battery Park (Statue of Liberty views) and back — about ${batteryKm} km.${extra >= 1 ? ` Add ~${extra} km with laps of the Battery Park City esplanade.` : ''}`,
      mapsUrl: loopUrl(ctx.homeAddress, ['Battery Park, New York, NY']),
    });
  }

  // Brooklyn Bridge: medium runs, early before the crowds.
  const toBridge = legKm(ctx.home, BROOKLYN_BRIDGE, 2.6);
  const bridgeKm = round1(2 * (toBridge + BROOKLYN_BRIDGE_SPAN_KM));
  if (d >= bridgeKm - 1 && d <= 20 && (w.type === 'easy' || w.type === 'long')) {
    const extra = round1((d - bridgeKm) / 2);
    out.push({
      title: 'Brooklyn Bridge',
      km: Math.max(bridgeKm, d),
      tags: ['bridge climb', 'iconic'],
      detail: `~${toBridge} km to City Hall, over the bridge and back (${bridgeKm} km).${extra >= 0.5 ? ` Run ~${extra} km into Brooklyn Bridge Park before turning round.` : ''} Go early — the walkway gets crowded by mid-morning.`,
      mapsUrl: loopUrl(ctx.homeAddress, ['Brooklyn Bridge Park, Pier 1, Brooklyn, NY']),
    });
  }

  // Central Park: rolling hills like the race's final 10 km.
  if (w.type === 'long' && d >= 16) {
    const toPark = round1(access + greenwayKmFromHouston(72) + 1.0);
    out.push({
      title: 'Central Park via the greenway',
      km: d,
      tags: ['hills', 'race course'],
      detail: `Up the greenway to W 72nd and across to the park (~${toPark} km), then ${centralParkLoops(Math.max(0, d - toPark))}. Subway home from 72nd St. Harlem Hill and the east-side rollers match the marathon's final miles.`,
      mapsUrl: oneWayUrl(ctx.homeAddress, 'Central Park, West 72nd Street entrance, New York, NY'),
    });
  } else if (d >= 4) {
    const note = w.type === 'marathon-pace'
      ? ' The rolling loop is great NYC course practice for marathon-pace work.'
      : w.type === 'tempo' && !isHills(w) ? ' The lower loop is a popular tempo circuit.' : '';
    out.push({
      title: 'Central Park loops',
      km: d,
      tags: ['hills', 'car-free'],
      detail: `Subway to 59th St–Columbus Circle and run ${centralParkLoops(d)}.${note}`,
      mapsUrl: oneWayUrl(ctx.homeAddress, 'Central Park, Columbus Circle entrance, New York, NY'),
    });
  }

  return out.slice(0, 4);
}

function genericRoutes(w: Workout, ctx: RouteContext): RouteOption[] {
  const near = encodeURIComponent(ctx.homeAddress.trim() || 'me');
  return [
    {
      title: 'Out-and-back from home',
      km: w.distanceKm,
      tags: ['simple'],
      detail: `Run ${round1(w.distanceKm / 2)} km out on a quiet road or path and turn round — your watch tells you when.`,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=park+trail+near+${near}`,
    },
    {
      title: isQuality(w) ? 'Running track' : 'Parks and trails nearby',
      km: w.distanceKm,
      tags: isQuality(w) ? ['flat', 'measured'] : ['traffic-free'],
      detail: isQuality(w) ? 'A 400 m track makes interval and tempo pacing easy. Check public access hours.' : 'Find a loop in a nearby park so you can repeat it to make up the distance.',
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${isQuality(w) ? 'running+track' : 'park'}+near+${near}`,
    },
    {
      title: 'Popular local routes (Strava heatmap)',
      km: w.distanceKm,
      tags: ['local favourites'],
      detail: 'The brightest lines on the heatmap are where local runners go — usually well-lit and traffic-free.',
      mapsUrl: 'https://www.strava.com/maps/global-heatmap',
    },
  ];
}

export function routeOptions(w: Workout, ctx: RouteContext): RouteOption[] {
  if (w.type === 'rest' || w.type === 'race' || w.distanceKm <= 0) return [];
  return ctx.nyc ? nycRoutes(w, ctx) : genericRoutes(w, ctx);
}

export const WATER_NOTE = 'Park drinking fountains are usually shut off from late autumn to spring — carry water on longer runs in the colder months.';

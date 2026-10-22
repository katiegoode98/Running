import type { Geo } from '../types';
import { haversineKm } from './gym';

/*
 * Curated New York City running routes with distance and elevation gain.
 * Figures come from the Central Park Conservancy, Randall's Island Park
 * Alliance, Great Runs, AllTrails, Komoot and similar guides (October 2026).
 * Elevation gain varies a lot between GPS/mapping sources, so each route has
 * a typical value plus the spread where sources disagree.
 */

export type Terrain = 'flat' | 'rolling' | 'hilly';
export type RouteShape = 'loop' | 'out-and-back' | 'one-way';
export type RouteUse = 'easy' | 'long' | 'hills' | 'tempo' | 'race-practice' | 'recovery';

export interface NycRoute {
  id: string;
  name: string;
  area: 'Manhattan' | 'Brooklyn' | 'Islands';
  shape: RouteShape;
  km: number; // loop length, out-and-back total, or one-way length
  gainM: number; // typical elevation gain for that distance
  gainRange?: [number, number]; // when sources disagree
  terrain: Terrain;
  surface: string;
  start: string; // Google Maps-searchable start point
  startGeo: Geo;
  access?: Geo[]; // other places to join a linear route (e.g. greenway cross-streets)
  uses: RouteUse[];
  summary: string;
  tips: string;
  source: { label: string; url: string };
}

// Places to join the Hudson River Greenway.
const HUDSON_HOUSTON: Geo = { lat: 40.7286, lon: -74.011 };
const HUDSON_23RD: Geo = { lat: 40.7484, lon: -74.0083 };
const HUDSON_59TH: Geo = { lat: 40.7726, lon: -73.9927 };

export const NYC_ROUTES: NycRoute[] = [
  {
    id: 'cp-loop',
    name: 'Central Park full loop',
    area: 'Manhattan',
    shape: 'loop',
    km: 9.8,
    gainM: 75,
    gainRange: [30, 125],
    terrain: 'rolling',
    surface: 'Paved park drive (car-free)',
    start: 'Columbus Circle, New York, NY',
    startGeo: { lat: 40.7681, lon: -73.9819 },
    uses: ['long', 'hills', 'race-practice', 'easy'],
    summary: 'The classic 6.1-mile loop of Park Drive. Harlem Hill at the north end is the big climb; the east side rolls.',
    tips: 'The marathon finishes here — the last 3 miles of NYC run through the park, so loops are perfect race practice. Runners keep to the inside lane; run counter-clockwise with the traffic flow.',
    source: { label: 'Central Park Conservancy running guide', url: 'https://www.centralparknyc.org/activities/guides/running' },
  },
  {
    id: 'cp-reservoir',
    name: 'Central Park Reservoir track',
    area: 'Manhattan',
    shape: 'loop',
    km: 2.54,
    gainM: 3,
    terrain: 'flat',
    surface: 'Soft cinder track',
    start: 'Jacqueline Kennedy Onassis Reservoir, E 90th St entrance, New York, NY',
    startGeo: { lat: 40.7856, lon: -73.958 },
    uses: ['easy', 'recovery'],
    summary: 'The 1.58-mile soft-surface track around the reservoir, with skyline views.',
    tips: 'One-way, counter-clockwise only. The soft surface is kind to legs on recovery days.',
    source: { label: 'Central Park Conservancy', url: 'https://www.centralparknyc.org/locations/stephanie-and-fred-shuman-running-track' },
  },
  {
    id: 'cp-lower',
    name: 'Central Park lower loop',
    area: 'Manhattan',
    shape: 'loop',
    km: 2.75,
    gainM: 20,
    gainRange: [15, 30],
    terrain: 'rolling',
    surface: 'Paved park drive',
    start: 'Columbus Circle, New York, NY',
    startGeo: { lat: 40.7681, lon: -73.9819 },
    uses: ['tempo', 'easy'],
    summary: 'The southern 1.7-mile loop below Terrace Drive — a popular tempo circuit.',
    tips: 'Repeat it for tempo work; it includes Cat Hill-style rollers on the east side.',
    source: { label: 'Free Tours by Foot: running in Central Park', url: 'https://freetoursbyfoot.com/running-in-central-park/' },
  },
  {
    id: 'harlem-hill',
    name: 'Harlem Hill repeats',
    area: 'Manhattan',
    shape: 'out-and-back',
    km: 1.0,
    gainM: 26,
    terrain: 'hilly',
    surface: 'Paved park drive',
    start: 'Harlem Hill, West Drive, Central Park, New York, NY',
    startGeo: { lat: 40.7985, lon: -73.9587 },
    uses: ['hills'],
    summary: 'Central Park\'s toughest climb: about 0.3 miles and +84 ft (26 m) per repeat at ~3.4%.',
    tips: 'Run up hard, jog down; 4–8 repeats. Mimics the course\'s late climbs up Fifth Avenue and into the park.',
    source: { label: 'Central Park Climbs (LiDAR-measured)', url: 'https://central-park-climbs.ivar.workers.dev/' },
  },
  {
    id: 'hudson-battery-59',
    name: 'Hudson River Park: Battery → W 59th St',
    area: 'Manhattan',
    shape: 'one-way',
    km: 8.4,
    gainM: 5,
    terrain: 'flat',
    surface: 'Paved greenway (separated from traffic)',
    start: 'Battery Park, New York, NY',
    startGeo: { lat: 40.7033, lon: -74.017 },
    access: [HUDSON_HOUSTON, HUDSON_23RD, HUDSON_59TH],
    uses: ['long', 'tempo', 'easy'],
    summary: 'The flat, car-free west-side path along the Hudson — piers, Little Island, Chelsea Piers and river views.',
    tips: 'Joins at any cross-street; from the Village you\'re on it in about 1 km. Busy with cyclists — stay in the runners\' lane.',
    source: { label: 'Great Runs: Hudson River Greenway', url: 'https://greatruns.com/hudson-river-greenway/' },
  },
  {
    id: 'hudson-gwb',
    name: 'Hudson River Greenway to the George Washington Bridge',
    area: 'Manhattan',
    shape: 'one-way',
    km: 18,
    gainM: 50,
    gainRange: [20, 60],
    terrain: 'flat',
    surface: 'Paved greenway',
    start: 'Battery Park, New York, NY',
    startGeo: { lat: 40.7033, lon: -74.017 },
    access: [HUDSON_HOUSTON, HUDSON_23RD, HUDSON_59TH],
    uses: ['long'],
    summary: 'Battery Park to the Little Red Lighthouse under the GWB: 11–11.5 miles, almost all flat.',
    tips: 'The only real climb is near the north end around Fort Washington Park. Take the A train home from 175th St for a long one-way run.',
    source: { label: 'Great Runs: Hudson River Greenway', url: 'https://greatruns.com/hudson-river-greenway/' },
  },
  {
    id: 'two-bridges',
    name: 'Two Bridges loop (Brooklyn + Manhattan)',
    area: 'Manhattan',
    shape: 'loop',
    km: 6.1,
    gainM: 55,
    gainRange: [23, 55],
    terrain: 'hilly',
    surface: 'Bridge walkways (wooden boards on the Brooklyn Bridge)',
    start: 'City Hall Park, New York, NY',
    startGeo: { lat: 40.7128, lon: -74.006 },
    uses: ['hills', 'easy'],
    summary: 'Over the Brooklyn Bridge, along the DUMBO waterfront and back over the Manhattan Bridge — about 3.8 miles.',
    tips: 'Go early: the Brooklyn Bridge promenade is packed with walkers by mid-morning. The Manhattan Bridge climb is longer and steadier.',
    source: { label: 'Great Runs: Two Bridges loop', url: 'https://greatruns.com/two-bridges/' },
  },
  {
    id: 'williamsburg',
    name: 'Williamsburg Bridge out-and-back',
    area: 'Manhattan',
    shape: 'out-and-back',
    km: 4.7,
    gainM: 29,
    gainRange: [29, 60],
    terrain: 'hilly',
    surface: 'Bridge path',
    start: 'Williamsburg Bridge pedestrian entrance, Delancey St & Clinton St, New York, NY',
    startGeo: { lat: 40.7181, lon: -73.9866 },
    uses: ['hills'],
    summary: 'Across to Williamsburg and back: 2.9 miles with a ~100 ft climb on each approach ramp.',
    tips: 'Great for hill repeats on the Manhattan ramp. The marathon has five bridges — this is ideal practice.',
    source: { label: 'AllTrails: Williamsburg Bridge path', url: 'https://www.alltrails.com/trail/us/new-york/williamsburg-bridge-bike-path' },
  },
  {
    id: 'east-river',
    name: 'East River Esplanade: E 63rd → E 125th St',
    area: 'Manhattan',
    shape: 'out-and-back',
    km: 9.7,
    gainM: 10,
    terrain: 'flat',
    surface: 'Paved riverside path',
    start: 'East River Esplanade, E 63rd St & York Ave, New York, NY',
    startGeo: { lat: 40.7596, lon: -73.9566 },
    uses: ['easy', 'tempo', 'long'],
    summary: 'A flat, quiet 6-mile out-and-back along the East River on the Upper East Side.',
    tips: 'Fewer tourists than the west side. Sections can be closed for construction — check before you go.',
    source: { label: 'Great Runs: East River Greenway', url: 'https://greatruns.com/east-river-greenway/' },
  },
  {
    id: 'prospect',
    name: 'Prospect Park loop',
    area: 'Brooklyn',
    shape: 'loop',
    km: 5.4,
    gainM: 40,
    gainRange: [37, 43],
    terrain: 'rolling',
    surface: 'Paved park drive (car-free)',
    start: 'Grand Army Plaza, Brooklyn, NY',
    startGeo: { lat: 40.6741, lon: -73.97 },
    uses: ['long', 'hills', 'easy'],
    summary: 'Brooklyn\'s 3.35-mile park loop with one notable hill on the east side.',
    tips: 'Home of many NYRR races. The 2/3 train to Grand Army Plaza takes about 20 minutes from lower Manhattan.',
    source: { label: 'Fastest Known Time: Prospect Park loop', url: 'https://fastestknowntime.com/route/prospect-park-brooklyn-loop-ny' },
  },
  {
    id: 'roosevelt',
    name: 'Roosevelt Island perimeter',
    area: 'Islands',
    shape: 'loop',
    km: 6.4,
    gainM: 5,
    terrain: 'flat',
    surface: 'Paved waterfront path',
    start: 'Roosevelt Island Tramway station, Roosevelt Island, NY',
    startGeo: { lat: 40.757, lon: -73.9535 },
    uses: ['easy', 'tempo', 'long'],
    summary: 'About 4 miles around the island with views of Midtown and the Queensboro Bridge.',
    tips: 'Take the F train or the tram. Quiet and flat — good for steady runs.',
    source: { label: 'Great Runs: Roosevelt Island', url: 'https://greatruns.com/manhattan-roosevelt-island/' },
  },
  {
    id: 'randalls',
    name: 'Randall\'s Island perimeter',
    area: 'Islands',
    shape: 'loop',
    km: 8.0,
    gainM: 10,
    terrain: 'flat',
    surface: 'Paved paths',
    start: 'Randall\'s Island Park, New York, NY',
    startGeo: { lat: 40.7932, lon: -73.9213 },
    uses: ['long', 'easy'],
    summary: 'A flat 5-mile island loop (3.1-mile northern and 2.1-mile southern loops if you want shorter).',
    tips: 'Reach it on foot over the 103rd St footbridge from the East River Esplanade (check its hours).',
    source: { label: 'Randall\'s Island Park Alliance: Walk, Run, Bike', url: 'https://randallsisland.org/wp-content/uploads/2023/10/Walk-Bike-Run-Guide.pdf' },
  },
  {
    id: 'governors',
    name: 'Governors Island perimeter',
    area: 'Islands',
    shape: 'loop',
    km: 3.4,
    gainM: 5,
    terrain: 'flat',
    surface: 'Car-free paved promenade',
    start: 'Battery Maritime Building, 10 South St, New York, NY',
    startGeo: { lat: 40.7013, lon: -74.0127 },
    uses: ['easy', 'recovery'],
    summary: 'A car-free 2.1-mile loop with Statue of Liberty views, a short ferry ride from lower Manhattan.',
    tips: 'Check ferry times — the first boat sets your start. Lovely for a relaxed weekend run.',
    source: { label: 'Great Runs: Governors Island', url: 'https://greatruns.com/new-york-city-governors-island/' },
  },
];

const ROAD = 1.25;

/** Rough distance from home to a route's start, along streets. */
export function kmFromHome(route: NycRoute, home: Geo | null | undefined): number | null {
  if (!home) return null;
  const nearest = Math.min(...[route.startGeo, ...(route.access ?? [])].map((g) => haversineKm(home, g)));
  return Math.round(nearest * ROAD * 10) / 10;
}

/** Practical way to get to the start: run there if it's close, otherwise walk or take the subway. */
export function gettingThere(route: NycRoute, home: Geo | null | undefined): string {
  const km = kmFromHome(route, home);
  if (km === null) return '';
  if (km <= 2.5) return `~${km} km from home — run there as your warm-up`;
  if (km <= 4) return `~${km} km from home — run there or take the subway`;
  return `~${km} km from home — take the subway or ferry`;
}

/**
 * How to make a planned distance on this route: laps of a loop, a turnaround
 * point on a linear route, or repeats of a hill.
 */
export function fitToDistance(route: NycRoute, targetKm: number, home: Geo | null | undefined, fmt: (km: number) => string = (k) => `${Math.round(k * 10) / 10} km`): string {
  const access = kmFromHome(route, home);
  const runThere = access !== null && access <= 2.5;
  const onRoute = runThere ? targetKm - 2 * access! : targetKm;
  if (onRoute <= 0.5) return `${fmt(targetKm)} is about the run there and back — this one's for a longer day.`;
  const lead = runThere ? `Run ~${fmt(access!)} there and back, plus ` : '';
  if (route.id === 'harlem-hill') {
    const reps = Math.max(3, Math.min(8, Math.round((onRoute - 3) / route.km)));
    return `${lead}a warm-up and cool-down with ${reps} repeats.`;
  }
  if (route.shape === 'loop') {
    const laps = onRoute / route.km;
    if (laps < 0.9) return `${lead}${fmt(onRoute)} — part of one lap.`;
    const whole = Math.floor(laps + 0.15);
    const extra = onRoute - whole * route.km;
    return `${lead}${whole} lap${whole === 1 ? '' : 's'}${extra >= 0.5 ? ` + ${fmt(extra)}` : ''}.`;
  }
  const maxOneWay = route.shape === 'out-and-back' ? route.km / 2 : route.km;
  const half = onRoute / 2;
  if (half > maxOneWay) {
    return route.shape === 'one-way'
      ? `${lead}run ${fmt(Math.min(onRoute, route.km))} one way and take the subway home${onRoute > route.km ? ', or add a loop at the start' : ''}.`
      : `${lead}${Math.round((onRoute / route.km) * 10) / 10} × the out-and-back.`;
  }
  return `${lead}turn around after ${fmt(half)}.`;
}

/** Best routes for a planned run: matching use and terrain, nearer first. */
export function routesFor(type: string, home: Geo | null | undefined): NycRoute[] {
  const use: RouteUse = type === 'long' ? 'long' : type === 'tempo' || type === 'intervals' || type === 'marathon-pace' ? 'tempo' : type === 'recovery' ? 'recovery' : 'easy';
  const hills = /hill/i.test(type);
  return NYC_ROUTES
    .filter((r) => (hills ? r.uses.includes('hills') : r.uses.includes(use)))
    .sort((a, b) => (kmFromHome(a, home) ?? 0) - (kmFromHome(b, home) ?? 0));
}

import { Decoder, Stream } from '@garmin/fitsdk';
import { unzipSync } from 'fflate';
import type { ClassCategory } from '../types';
import { toISODate } from './dates';

/*
 * Imports activities exported from Garmin Connect (or any watch):
 *  - .fit  — Garmin's native format ("Export Original" downloads it inside a .zip)
 *  - .tcx  — Garmin's "Export TCX"
 *  - .gpx  — "Export GPX"; heart rate comes from Garmin's TrackPointExtension
 * Garmin's cloud API is closed to individual developers, so files are the
 * reliable route. Nothing leaves the device: files are parsed in the browser.
 */

export type ImportedSport = 'run' | ClassCategory;

export interface ImportedActivity {
  externalId: string; // ISO start time
  date: string;
  name: string;
  sport: ImportedSport;
  distanceKm: number;
  durationSec: number;
  avgHr?: number;
  maxHr?: number;
}

/** Maps Garmin/FIT/TCX/GPX sport names onto the app's activity kinds. */
export function mapSport(sport: string, subSport = ''): ImportedSport {
  const s = `${sport} ${subSport}`.toLowerCase().replace(/[_-]/g, '');
  if (/run|treadmill|trail/.test(s) && !/hiit/.test(s)) return 'run';
  if (/strength|weight/.test(s)) return 'strength';
  if (/yoga/.test(s)) return 'yoga';
  if (/pilates|barre/.test(s)) return 'pilates';
  if (/cycl|bik|spin|indoorcycling/.test(s)) return 'spin';
  if (/swim/.test(s)) return 'swim';
  if (/hiit|cardio|bootcamp|training/.test(s)) return 'hiit';
  return 'other';
}

const LABEL: Record<ImportedSport, string> = {
  run: 'Run', strength: 'Strength training', yoga: 'Yoga', pilates: 'Pilates', spin: 'Indoor cycling',
  hiit: 'HIIT / cardio', swim: 'Swim', other: 'Workout',
};

function activity(start: Date, sport: ImportedSport, distanceM: number, durationSec: number, avgHr?: number, maxHr?: number, name?: string): ImportedActivity {
  return {
    externalId: start.toISOString(),
    date: toISODate(start),
    name: name || LABEL[sport],
    sport,
    distanceKm: Math.round((distanceM / 1000) * 100) / 100,
    durationSec: Math.round(durationSec),
    avgHr: avgHr ? Math.round(avgHr) : undefined,
    maxHr: maxHr ? Math.round(maxHr) : undefined,
  };
}

// ---------- FIT ----------

interface FitSession {
  startTime?: Date;
  sport?: string;
  subSport?: string;
  totalTimerTime?: number;
  totalElapsedTime?: number;
  totalDistance?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
}

export function parseFit(bytes: Uint8Array): ImportedActivity[] {
  const stream = Stream.fromByteArray(Array.from(bytes));
  if (!Decoder.isFIT(stream)) throw new Error('Not a FIT file');
  const { messages, errors } = new Decoder(stream).read();
  const sessions = (messages.sessionMesgs ?? []) as FitSession[];
  if (!sessions.length && errors.length) throw new Error('Could not read FIT file');
  return sessions
    .filter((s) => s.startTime)
    .map((s) => activity(
      new Date(s.startTime!),
      mapSport(String(s.sport ?? ''), String(s.subSport ?? '')),
      s.totalDistance ?? 0,
      s.totalTimerTime ?? s.totalElapsedTime ?? 0,
      s.avgHeartRate,
      s.maxHeartRate,
    ));
}

// ---------- XML helpers (namespace-agnostic) ----------

// Matches by local name so namespaced tags (gpxtpx:hr, TCX's default namespace) are found.
const localName = (el: Element) => (el.localName || el.tagName).split(':').pop();

function byTag(root: Document | Element, tag: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((el) => localName(el) === tag);
}

function directChild(el: Element, tag: string): Element | undefined {
  return Array.from(el.children).find((c) => localName(c) === tag);
}

const num = (el: Element | undefined | null) => (el?.textContent ? Number(el.textContent.trim()) : NaN);

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XML file');
  return doc;
}

// ---------- TCX ----------

export function parseTcx(text: string): ImportedActivity[] {
  const doc = parseXml(text);
  return byTag(doc, 'Activity').flatMap((act) => {
    const laps = byTag(act, 'Lap');
    if (!laps.length) return [];
    let seconds = 0;
    let metres = 0;
    let hrWeighted = 0;
    let hrSeconds = 0;
    let maxHr = 0;
    for (const lap of laps) {
      // Lap totals are direct children; trackpoints have their own DistanceMeters.
      const t = num(directChild(lap, 'TotalTimeSeconds'));
      const d = num(directChild(lap, 'DistanceMeters'));
      const avg = num(directChild(lap, 'AverageHeartRateBpm')?.firstElementChild);
      const max = num(directChild(lap, 'MaximumHeartRateBpm')?.firstElementChild);
      if (t > 0) seconds += t;
      if (d > 0) metres += d;
      if (avg > 0 && t > 0) { hrWeighted += avg * t; hrSeconds += t; }
      if (max > maxHr) maxHr = max;
    }
    const startAttr = laps[0].getAttribute('StartTime') ?? directChild(act, 'Id')?.textContent ?? '';
    const start = new Date(startAttr);
    if (Number.isNaN(start.getTime())) return [];
    return [activity(start, mapSport(act.getAttribute('Sport') ?? ''), metres, seconds, hrSeconds ? hrWeighted / hrSeconds : undefined, maxHr || undefined)];
  });
}

// ---------- GPX ----------

function haversineM(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function parseGpx(text: string): ImportedActivity[] {
  const doc = parseXml(text);
  return byTag(doc, 'trk').flatMap((trk) => {
    const pts = byTag(trk, 'trkpt');
    if (pts.length < 2) return [];
    let metres = 0;
    let prev: [number, number] | null = null;
    const hrs: number[] = [];
    for (const p of pts) {
      const cur: [number, number] = [Number(p.getAttribute('lat')), Number(p.getAttribute('lon'))];
      if (prev) metres += haversineM(prev, cur);
      prev = cur;
      const hr = num(byTag(p, 'hr')[0]);
      if (hr > 0) hrs.push(hr);
    }
    const times = pts.map((p) => new Date(byTag(p, 'time')[0]?.textContent ?? '')).filter((d) => !Number.isNaN(d.getTime()));
    if (times.length < 2) return [];
    const seconds = (times[times.length - 1].getTime() - times[0].getTime()) / 1000;
    const type = byTag(trk, 'type')[0]?.textContent ?? 'running';
    const name = byTag(trk, 'name')[0]?.textContent?.trim();
    const avg = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : undefined;
    return [activity(times[0], mapSport(type), metres, seconds, avg, hrs.length ? Math.max(...hrs) : undefined, name)];
  });
}

// ---------- Entry point ----------

export function parseActivityFile(name: string, bytes: Uint8Array): ImportedActivity[] {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) {
    const files = unzipSync(bytes);
    return Object.entries(files).flatMap(([inner, data]) => (/\.(fit|tcx|gpx)$/i.test(inner) ? parseActivityFile(inner, data) : []));
  }
  if (lower.endsWith('.fit')) return parseFit(bytes);
  const text = new TextDecoder().decode(bytes);
  if (lower.endsWith('.tcx')) return parseTcx(text);
  if (lower.endsWith('.gpx')) return parseGpx(text);
  throw new Error(`Unsupported file type: ${name}`);
}

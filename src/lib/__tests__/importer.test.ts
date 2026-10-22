// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Encoder, Profile } from '@garmin/fitsdk';
import { zipSync, strToU8 } from 'fflate';
import { mapSport, parseActivityFile } from '../importer';
import { hrZone, maxHeartRate, rpeFromHr } from '../heartrate';

// The SDK's Mesg typing is narrower than what its encoder accepts at runtime.
const mesg = (m: object) => m as Parameters<Encoder['onMesg']>[1];

function fitFile(sessions: { start: Date; sport: string; subSport?: string; seconds: number; metres: number; avgHr?: number; maxHr?: number }[]): Uint8Array {
  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, mesg({ type: 'activity', manufacturer: 'garmin', product: 0, timeCreated: sessions[0].start, serialNumber: 1234 }));
  for (const s of sessions) {
    enc.onMesg(Profile.MesgNum.SESSION, mesg({
      timestamp: new Date(s.start.getTime() + s.seconds * 1000),
      startTime: s.start,
      sport: s.sport,
      subSport: s.subSport ?? 'generic',
      totalElapsedTime: s.seconds,
      totalTimerTime: s.seconds,
      totalDistance: s.metres,
      avgHeartRate: s.avgHr,
      maxHeartRate: s.maxHr,
    }));
  }
  return enc.close();
}

const TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2026-10-20T11:00:00.000Z</Id>
      <Lap StartTime="2026-10-20T11:00:00.000Z">
        <TotalTimeSeconds>1800</TotalTimeSeconds>
        <DistanceMeters>3500</DistanceMeters>
        <AverageHeartRateBpm><Value>140</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>155</Value></MaximumHeartRateBpm>
        <Track><Trackpoint><Time>2026-10-20T11:00:00.000Z</Time><DistanceMeters>0</DistanceMeters></Trackpoint></Track>
      </Lap>
      <Lap StartTime="2026-10-20T11:30:00.000Z">
        <TotalTimeSeconds>1200</TotalTimeSeconds>
        <DistanceMeters>2500</DistanceMeters>
        <AverageHeartRateBpm><Value>160</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>171</Value></MaximumHeartRateBpm>
        <Track><Trackpoint><Time>2026-10-20T11:30:00.000Z</Time><DistanceMeters>3500</DistanceMeters></Trackpoint></Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Hudson River run</name><type>running</type><trkseg>
    <trkpt lat="40.7286" lon="-74.0110"><time>2026-10-18T12:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>130</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="40.7376" lon="-74.0110"><time>2026-10-18T12:06:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="40.7466" lon="-74.0110"><time>2026-10-18T12:12:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  </trkseg></trk>
</gpx>`;

describe('Garmin file import', () => {
  it('reads a FIT run with heart rate', () => {
    const start = new Date('2026-10-21T10:30:00Z');
    const [a] = parseActivityFile('Morning_Run.fit', fitFile([{ start, sport: 'running', seconds: 2700, metres: 6000, avgHr: 142, maxHr: 165 }]));
    expect(a).toMatchObject({ sport: 'run', distanceKm: 6, durationSec: 2700, avgHr: 142, maxHr: 165, externalId: start.toISOString() });
  });

  it('maps FIT strength and cycling sessions to gym activity kinds', () => {
    const start = new Date('2026-10-22T18:00:00Z');
    const acts = parseActivityFile('gym.fit', fitFile([
      { start, sport: 'training', subSport: 'strengthTraining', seconds: 3000, metres: 0, avgHr: 110 },
      { start: new Date(start.getTime() + 3_600_000), sport: 'cycling', subSport: 'indoorCycling', seconds: 2700, metres: 0, avgHr: 150 },
    ]));
    expect(acts.map((a) => a.sport)).toEqual(['strength', 'spin']);
  });

  it('unzips Garmin "Export Original" archives', () => {
    const fit = fitFile([{ start: new Date('2026-10-19T09:00:00Z'), sport: 'running', seconds: 5400, metres: 13000 }]);
    const [a] = parseActivityFile('12345.zip', zipSync({ '12345_ACTIVITY.fit': fit }));
    expect(a).toMatchObject({ sport: 'run', distanceKm: 13, durationSec: 5400 });
  });

  it('reads TCX laps with time-weighted heart rate, ignoring trackpoint distances', () => {
    const [a] = parseActivityFile('run.tcx', strToU8(TCX));
    expect(a).toMatchObject({ sport: 'run', distanceKm: 6, durationSec: 3000, avgHr: 148, maxHr: 171, date: '2026-10-20' });
  });

  it('reads GPX tracks with Garmin heart-rate extensions', () => {
    const [a] = parseActivityFile('run.gpx', strToU8(GPX));
    expect(a.sport).toBe('run');
    expect(a.name).toBe('Hudson River run');
    expect(a.durationSec).toBe(720);
    expect(a.distanceKm).toBeCloseTo(2.0, 1);
    expect(a).toMatchObject({ avgHr: 140, maxHr: 150 });
  });

  it('rejects unsupported files', () => {
    expect(() => parseActivityFile('notes.txt', strToU8('hi'))).toThrow(/Unsupported/);
  });
});

describe('heart rate helpers', () => {
  it('maps sports, zones and effort', () => {
    expect(mapSport('Running')).toBe('run');
    expect(mapSport('training', 'strength_training')).toBe('strength');
    expect(mapSport('training', 'yoga')).toBe('yoga');
    expect(mapSport('hiit')).toBe('hiit');
    expect(maxHeartRate(30)).toBe(187);
    expect(maxHeartRate(30, 195)).toBe(195);
    expect(hrZone(140, 190)).toBe(3);
    expect(rpeFromHr(125, 190)).toBe(3);
    expect(rpeFromHr(175, 190)).toBe(8);
    expect(rpeFromHr(undefined, 190, 6)).toBe(6);
  });
});

// Heart-rate helpers, kept apart from the importer so the Garmin FIT SDK is only
// loaded when a file is actually imported.

/** Measured max HR, or the Tanaka estimate (208 − 0.7 × age). */
export function maxHeartRate(age: number, measured?: number): number {
  return measured && measured > 120 ? measured : Math.round(208 - 0.7 * age);
}

/** Five-zone model as % of max HR (Z1 <60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90+). */
export function hrZone(avgHr: number, maxHr: number): number {
  const pct = avgHr / maxHr;
  return pct < 0.6 ? 1 : pct < 0.7 ? 2 : pct < 0.8 ? 3 : pct < 0.9 ? 4 : 5;
}

/** Rough effort (RPE) from average heart rate, used to prefill imported sessions. */
export function rpeFromHr(avgHr: number | undefined, maxHr: number, fallback = 5): number {
  if (!avgHr) return fallback;
  const pct = avgHr / maxHr;
  if (pct < 0.65) return 2;
  if (pct < 0.72) return 3;
  if (pct < 0.78) return 4;
  if (pct < 0.83) return 5;
  if (pct < 0.87) return 6;
  if (pct < 0.9) return 7;
  if (pct < 0.93) return 8;
  return 9;
}

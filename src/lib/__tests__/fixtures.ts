import type { Profile } from '../../types';

export const profile: Profile = {
  name: 'Test',
  raceName: 'Spring Marathon',
  raceDate: '2027-04-25', // a Sunday
  goalTimeSec: 3.75 * 3600,
  recentRace: { distanceKm: 21.0975, timeSec: 1 * 3600 + 50 * 60 },
  currentWeeklyKm: 30,
  longestRecentRunKm: 14,
  runDaysPerWeek: 5,
  longRunDay: 0,
  experience: 'intermediate',
  units: 'km',
  weightKg: 62,
  heightCm: 168,
  age: 32,
  sex: 'female',
  homeAddress: '',
  workAddress: '',
  workDays: [1, 2, 3, 4, 5],
};

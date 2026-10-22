import type { GymMembership, Profile, Race } from '../types';

/*
 * TCS New York City Marathon 2027 and NYRR entry information, researched
 * October 2026. Dates marked "estimated" follow the previous year's cycle —
 * NYRR had not published them yet. Always confirm on nyrr.org.
 */

export const NYC_2027 = {
  raceName: 'TCS New York City Marathon 2027',
  raceDate: '2027-11-07', // first Sunday in November
  infoUrl: 'https://www.tcsnycmarathon.org/',
  timeQualifierUrl: 'https://www.nyrr.org/tcsnycmarathon/runners/marathon-time-qualifiers',
  entryUrl: 'https://www.nyrr.org/tcsnycmarathon/runners/entry/2027',
};

export interface EntryRoute {
  name: string;
  status: 'open' | 'upcoming' | 'closed' | 'check';
  detail: string;
}

export function nycEntryRoutes(todayIso: string): EntryRoute[] {
  const inQualifyingWindow = todayIso <= '2026-12-31';
  return [
    {
      name: 'General drawing (lottery)',
      status: todayIso < '2027-02-01' ? 'upcoming' : 'check',
      detail: 'Expected to open in early February 2027 for ~3 weeks, with results in early March (estimated from the 2026 cycle). Only about 1–3% of applicants are selected, so plan a backup race too.',
    },
    {
      name: 'Time qualifier',
      status: inQualifyingWindow ? 'open' : 'closed',
      detail: 'Qualifying window is 1 Jan – 31 Dec 2026, chip time, with age taken on race day. Ages 18–34 need 3:13:00 (women and non-binary) or 2:53:00 (men) in a marathon, or 1:32:00 / 1:21:00 in an NYRR half marathon. Times from non-NYRR marathons only let you apply for limited places, filled fastest first. See NYRR for every age group.',
    },
    {
      name: '9+1 program',
      status: 'closed',
      detail: 'Entry to 2027 needed nine NYRR races plus one volunteer shift during 2026. 9+1 completed in 2027 earns entry to the 2028 race; it now starts with a members-only eligibility drawing.',
    },
    {
      name: 'Charity entry',
      status: 'open',
      detail: 'Official charity partners offer guaranteed places in return for a fundraising commitment. Spots often go months ahead, so apply early.',
    },
    {
      name: 'International Tour Operator',
      status: 'check',
      detail: 'Travel packages that include entry. Only for runners who are not full-time US residents.',
    },
  ];
}

/** To-dos for a runner who earned guaranteed entry through 9+1 in 2026. */
export const NINE_PLUS_ONE_TODOS = [
  'Keep your NYRR membership active through 31 December 2026 — it is a condition of the guaranteed entry.',
  'Claim your entry in the guaranteed-entry claim window. NYRR hasn\'t announced 2027 dates; for the 2025 race the window was 5–25 February. Entries not claimed in the window are forfeited.',
  'Pay the entry fee when claiming — 9+1 entry is guaranteed but not complimentary.',
  'Want 2028 too? 9+1 now starts with a members-only eligibility drawing, so check nyrr.org for the 2027 program.',
];

/** Races to seed the tracker with. The NYC Half 2027 drawing dates are NYRR-published. */
export function nycSeedRaces(makeId: () => string, guaranteed = false): Race[] {
  const marathon: Race = guaranteed
    ? {
        id: makeId(),
        name: 'TCS New York City Marathon',
        date: NYC_2027.raceDate,
        distance: 'marathon',
        location: 'New York, NY',
        url: 'https://www.nyrr.org/run/guaranteed-entry/tcs-new-york-city-marathon-9plus1-program',
        entryType: 'qualifier',
        entryOpens: '2027-02-04',
        entryCloses: '2027-02-25',
        status: 'guaranteed',
        notes: 'Guaranteed via 9+1. Claim window dates are ESTIMATED from previous cycles (5–25 Feb for 2025) — update them when NYRR announces. Unclaimed entries are forfeited.',
      }
    : {
        id: makeId(),
        name: 'TCS New York City Marathon',
        date: NYC_2027.raceDate,
        distance: 'marathon',
        location: 'New York, NY',
        url: NYC_2027.entryUrl,
        entryType: 'lottery',
        entryOpens: '2027-02-04',
        entryCloses: '2027-02-25',
        ballotResult: '2027-03-04',
        status: 'interested',
        notes: 'Drawing dates are ESTIMATED from the 2026 cycle — confirm on nyrr.org in January. See the entry routes card for alternatives.',
      };
  return [
    marathon,
    {
      id: makeId(),
      name: 'United Airlines NYC Half',
      date: '2027-03-21',
      distance: 'half',
      location: 'New York, NY',
      url: 'https://www.nyrr.org/races-and-events/2027/2027-united-airlines-nyc-half',
      entryType: 'lottery',
      entryOpens: '2026-10-21',
      entryCloses: '2026-11-11',
      ballotResult: '2026-11-18',
      status: 'interested',
      notes: 'Drawing window and date published by NYRR. Falls in your foundation phase — a great fitness check.',
    },
  ];
}

export const WELLHUB_GOLD: GymMembership = {
  provider: 'Wellhub',
  tier: 'Gold',
  membershipNumber: '',
  notes: 'One standard check-in per day (unused check-ins expire at midnight). Premium classes such as Barry\'s count against a separate monthly allowance. Barry\'s is 4 check-ins/month on Gold per Wellhub\'s help centre — confirm your allowance in the app. Book premium classes up to 7 days ahead.',
  premiumPerMonth: 4,
};

/** Studios Wellhub treats as premium classes; others count as standard check-ins. */
export function looksPremium(name: string): boolean {
  return /barry/i.test(name);
}

export function applyNycDefaults(p: Profile): Profile {
  return { ...p, raceName: NYC_2027.raceName, raceDate: NYC_2027.raceDate };
}

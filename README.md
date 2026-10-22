# Running — Marathon Coach

A browser app that builds an adaptive marathon training plan and organises everything around it: your calendar, gym classes, tune-up races, Spotify playlists, and nutrition.

Everything runs in the browser and it installs on your phone like an app. Your data is stored locally (back it up from **Settings**), and the app talks directly to Google, Spotify and OpenStreetMap.

## Set up for NYC 2027

- **Goal race:** the app defaults to the **TCS New York City Marathon, Sunday 7 November 2027**.
- **Race tracker:** on first setup it adds the NYC Marathon and the **United Airlines NYC Half (21 March 2027)** with their entry dates.
  - The NYC Half drawing window and draw date come from NYRR.
  - The NYC Marathon drawing dates are **estimated** from the 2026 cycle. Confirm them on nyrr.org in January.
- **Entry routes:** the Races tab has a "Getting into NYC 2027" card covering each way in (drawing, time qualifier, 9+1, charity, tour operator) and whether it's still open.
- **Foundation phase:** with ~54 weeks to go, the plan starts with a foundation phase. Volume holds at about 70% of peak, and long runs build to half-marathon distance. The 18-week marathon block then starts in early July 2027.
- **9+1 guaranteed entry:** tick the box at setup (or tap "I have guaranteed entry" on Races). The app swaps the drawing for your 9+1 to-dos. It also tracks the claim window, estimated as early to late February from previous cycles. Unclaimed entries are forfeited.
- **Goal suggestions:** after you enter a recent race, the app suggests Finish strong, Realistic and Stretch goals.
  - Marathon-pace sessions start no more than ~4% faster than your current fitness, then move toward goal pace as your results improve.
  - Long runs are capped at ~3.5 hours, so slower paces never mean 4-hour training runs.
- **Routes from home (lower Manhattan):** each run gets a Hudson River Greenway out-and-back with a turnaround street. Long runs also get a Central Park option for practising the race's final 10 km. Hill sessions get Williamsburg Bridge repeats.
- **Wellhub Gold:** tap **Use Wellhub Gold** on the Gym tab. Recommendations stick to one class a day, matching Wellhub's one check-in per day. Premium classes (e.g. Barry's) are limited to your monthly allowance.
- **Wellhub studios:** tap **Add Wellhub studios near home** to add 11 studios in and around Greenwich Village: Life Time, Barry's, SoulCycle, CycleBar, Orangetheory and AARMY. Addresses marked *verify* came from older listings.
  - **Quick-add:** pick a studio, a class template, a day and a time.
  - **Studio guide:** explains how each brand fits each training phase.
  - **Treadmill classes:** Barry's and Orangetheory count as a hard run. They're suggested in place of a quality session, never on easy days, and dropped in the build and peak phases.
  - **Strength before long runs:** strength classes the day before a long run are avoided.
- **Wellhub partner gyms:** Wellhub has no public API. Find partner gyms near home and work in the Wellhub app, then add them and their timetables here.

## Install on your phone

The app is an installable web app. It works offline, opens full-screen from your home screen, and uses a bottom tab bar on phones.

1. Deploy it to an HTTPS URL. The free options below all work from a private repo:
   - **Netlify / Vercel / Cloudflare Pages:** import the GitHub repo, set the build command to `npm run build` and the output directory to `dist`.
   - **GitHub Pages** (free for public repos): in the repo's **Settings → Pages**, set *Source* to **GitHub Actions**. Every push to `main` then deploys to `https://<user>.github.io/Running/`.
2. On iPhone, open the URL in **Safari** and tap **Share → Add to Home Screen**. On Android, use Chrome's **Install app**.
3. Add the deployed URL to the Google OAuth origins and Spotify redirect URIs (see below).

Data lives on the device you use. Use the home-screen app, not a Safari tab: iOS keeps their storage separate. Download a backup from Settings now and then.

## Quick start

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm test         # plan, adaptation, calendar, gym, race & nutrition logic
npm run build    # static site in dist/ (deploy anywhere, e.g. GitHub Pages)
```

On first launch, fill in your goal race, goal time, current fitness and a recent race result. The app then generates your plan.

## Features

| Tab | What it does |
| --- | --- |
| **Today** | Countdown, today's session, this week, race-entry alerts, today's fuelling target |
| **Plan** | Week-by-week plan in base → build → peak → taper phases, with training paces. You can export it as `.ics` (Apple/Outlook) or push it to Google Calendar |
| **Log** | Log runs with effort (RPE) and pain flags. The **Progress check** suggests changes to upcoming weeks, and you choose whether to apply them |
| **Calendar** | Google Calendar sync or `.ics` import (iCloud/Outlook). Ranks the best day for long runs and moves workouts around clashes |
| **Gym** | Your membership details, clubs (mapped via OpenStreetMap) and class timetables. Suggests classes for each training week based on your phase, the runs either side, calendar clashes and travel time from home or work |
| **Races** | Tracks tune-up races, entry windows, ballots and lotteries, with reminders for the next thing to do. Shows how well each race fits your block, and can put a race into your plan. Race results feed back into your fitness estimate |
| **Music** | Builds a Spotify playlist sized to a workout's duration and suggests podcasts and audiobooks for long runs |
| **Nutrition** | Daily carb, protein and fat targets that change with each day's training (carb-load before the race), a food log, a weight log with a 7-day trend, long-run fuelling advice, and an overview of diet approaches |

## How the plan adapts

The plan generator (`src/lib/plan.ts`) follows widely used marathon principles:

- weekly volume rises by no more than about 10%, with a cutback every 4th week
- the long run is about 30–35% of weekly volume, capped at 32 km
- hard days are never back to back
- the taper lasts three weeks

Training paces come from your recent race using Riegel's formula. Marathon-pace sessions use your goal pace.

The **Progress check** (`src/lib/adapt.ts`) looks at the last two weeks and recommends one of these:

- **Missed volume (<75%)**: rebuilds the ramp from what you actually ran.
- **High effort (easy runs RPE ≥ 6.5)**: inserts a cutback week.
- **Pain flagged**: next week drops to 70% volume with no quality sessions.
- **Faster recent performances** (races, or runs logged at RPE ≥ 9): sharpens your training paces.

Past weeks are never rewritten.

## Integration setup

Enter the keys in **Settings**, or put them in `.env.local` (see `.env.example`).

**Google Calendar**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Enable the *Google Calendar API*.
3. Configure the OAuth consent screen and add yourself as a test user.
4. Create an *OAuth client ID* of type *Web application*. Add `http://127.0.0.1:5173` (and your deployed URL) as an authorised JavaScript origin.

**Spotify**
1. Go to the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app (Web API).
2. Add `http://127.0.0.1:5173/` (and your deployed URL) as a Redirect URI.
3. Under User Management, add your Spotify account.

Development-mode apps need the owner to have Spotify Premium (Spotify's 2026 rules). Spotify no longer exposes track BPM to new apps, so playlists mix your top and saved tracks with keyword searches such as "running 170 bpm".

**Apple / iCloud Calendar**: iCloud has no public API. Instead:
- To get your events in: in Calendar.app, choose *File → Export* and import the `.ics` file on the Calendar tab.
- To get your plan out: export the plan as `.ics` and import it into Calendar.app.

**Maps**: addresses are geocoded with OpenStreetMap Nominatim (no key needed). Travel times are estimates, and directions open in Google Maps.

## Project layout

```
src/
  lib/        pure logic (plan, adapt, calendar, gym, races, nutrition, media) + API clients (google, spotify)
  views/      one component per tab
  store.tsx   app state persisted to localStorage
```

Nutrition guidance is general information based on sports-nutrition consensus statements. It is not medical advice.

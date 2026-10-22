import { useStore } from '../store';
import { daysBetween, formatDate, today } from '../lib/dates';

/** Manhattan-ish skyline: One WTC on the left, Empire State and Chrysler mid-town. */
const SKYLINE =
  'M0 80V62h14v-8h10v12h8V50h12v16h6V56h10v24' +
  'M60 80V40l8-4V14l2-6 2 6v22l8 4v40' + // One World Trade
  'M80 80V58h12v-6h10v28' +
  'M102 80V48h14v32' +
  'M116 80V60h10v-8h8v28' +
  'M134 80V44h6v-6h12v6h6v36' +
  'M158 80V56h14v24' +
  'M172 80V36h4v-6h4v-8h3V8h2v14h3v8h4v6h4v44' + // Empire State
  'M196 80V52h10v-6h12v34' +
  'M218 80V40l6-10 3-12 3 12 6 10v40' + // Chrysler
  'M236 80V58h12v-10h10v32' +
  'M258 80V46h16v34' +
  'M274 80V62h10v-6h12v24' +
  'M296 80V42h6l4-6 4 6h6v38' +
  'M316 80V56h14v-8h10v32' +
  'M340 80V64h12v-6h12v22' +
  'M364 80V50h14v30' +
  'M378 80V60h22v20Z';

export function Banner() {
  const { state } = useStore();
  const p = state.profile;
  const days = p ? daysBetween(today(), p.raceDate) : null;

  return (
    <div className="banner">
      <svg className="skyline" viewBox="0 0 400 80" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <path d={SKYLINE} />
      </svg>
      <div className="banner-text">
        <div className="banner-brand">Marathon Coach</div>
        <div className="banner-race">{p ? p.raceName || 'Marathon' : 'Your road to 26.2'}</div>
        {p && <div className="banner-date">{formatDate(p.raceDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>}
      </div>
      {days !== null && days >= 0 && (
        <div className="banner-count">
          <strong>{days}</strong>
          <span>{days === 1 ? 'day to go' : 'days to go'}</span>
        </div>
      )}
    </div>
  );
}

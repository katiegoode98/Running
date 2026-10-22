import { Card } from './ui';
import { useStore } from '../store';
import { addDays, dayOfWeek, formatDate, mondayOf, today } from '../lib/dates';
import { generatePlan } from '../lib/plan';
import { activitiesOf, carryOver, isDone } from '../lib/schedule';

/**
 * For plans whose first week began before the runner did (created Wednesday–Sunday
 * before starter weeks existed): offers to make the rest of this week a lighter
 * half week and start the plan proper next Monday.
 */
export function StarterWeekOffer() {
  const { state, update } = useStore();
  const { plan, profile } = state;
  const t = today();
  const first = plan?.weeks[0];
  const dow = dayOfWeek(t);
  if (!plan || !profile || !first || first.intro || plan.starterDeclined) return null;
  if (first.startDate !== mondayOf(t) || !(dow === 0 || dow >= 3)) return null;

  const nextMonday = addDays(mondayOf(t), 7);

  function convert() {
    const keep = activitiesOf(first!).filter((w) => isDone(w, state.logs, state.activities));
    const next = generatePlan(profile!, { startDate: t, paces: plan!.paces, keep });
    update({ plan: carryOver(plan, next) });
  }

  return (
    <Card title="Started mid-week?">
      <p className="small">
        Turn the rest of this week into a lighter <strong>starter week</strong> (an easy run, a short long run and an intro gym session),
        and begin Week 1 of the plan properly on <strong>{formatDate(nextMonday)}</strong>. Anything you've already ticked off is kept.
      </p>
      <div className="row">
        <button className="primary" onClick={convert}>Ease in with a half week</button>
        <button className="link small" onClick={() => update({ plan: { ...plan, starterDeclined: true } })}>No thanks, keep the full week</button>
      </div>
    </Card>
  );
}

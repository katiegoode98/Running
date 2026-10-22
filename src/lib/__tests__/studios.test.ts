import { describe, expect, it } from 'vitest';
import { generatePlan } from '../plan';
import { parseTimetable, pickWeeklyClasses, scoreClasses } from '../gym';
import { BRANDS, brandFor, classFromTemplate, NEARBY_STUDIOS, templatesFor } from '../studios';
import { profile as base } from './fixtures';
import type { Gym } from '../../types';

const profile = { ...base, raceDate: '2027-11-07', runDaysPerWeek: 4 as const };
const plan = generatePlan(profile, { startDate: '2026-10-22' });
const foundationWeek = plan.weeks[2];
const buildWeek = plan.weeks.find((w) => w.phase === 'build')!;
const gym: Gym = { id: 'b', name: "Barry's NoHo", address: '419 Lafayette St' };
const dow = (iso: string) => new Date(`${iso}T12:00`).getDay();

describe('studio brands', () => {
  it('recognises every Wellhub brand from a studio name', () => {
    const names = ['Life Time NoHo', "Barry's Tribeca", 'Orangetheory SoHo', 'SoulCycle West Village', 'CycleBar NoHo', 'AARMY NoHo', 'barre3 LIC'];
    expect(names.map((n) => brandFor(n)?.id)).toEqual(['lifetime', 'barrys', 'orangetheory', 'soulcycle', 'cyclebar', 'aarmy', 'barre3']);
    expect(BRANDS).toHaveLength(7);
    expect(NEARBY_STUDIOS.every((s) => brandFor(s.name))).toBe(true);
  });

  it("marks Barry's as a premium treadmill class", () => {
    const [t] = templatesFor(gym);
    expect(t).toMatchObject({ premium: true, runningLoad: true });
    expect(parseTimetable("Tue, 18:30, Barry's Full Body, 50", 'b', () => 'x')[0]).toMatchObject({ premium: true, runningLoad: true });
  });
});

describe('treadmill classes replace quality runs', () => {
  const quality = foundationWeek.workouts.find((w) => w.type === 'tempo')!;
  const easy = foundationWeek.workouts.find((w) => w.type === 'easy')!;
  const t = templatesFor(gym)[0];
  const onQuality = classFromTemplate(t, 'b', dow(quality.date), '18:30', 'q');
  const onEasy = classFromTemplate(t, 'b', dow(easy.date), '18:30', 'e');

  it('prefers the quality-session day and penalises easy days', () => {
    const scored = scoreClasses(foundationWeek, [onQuality, onEasy], [gym], profile, [], null, null);
    const q = scored.find((s) => s.cls.id === 'q')!;
    const e = scored.find((s) => s.cls.id === 'e')!;
    expect(q.score).toBeGreaterThan(e.score);
    expect(q.reasons.join()).toMatch(/instead of your/);
    expect(e.reasons.join()).toMatch(/easy day into a hard one/);
    expect(pickWeeklyClasses(scored, foundationWeek.phase).map((p) => p.cls.id)).toEqual(['q']);
  });

  it('drops treadmill classes in the marathon-specific phases', () => {
    const q = buildWeek.workouts.find((w) => w.type === 'tempo' || w.type === 'intervals')!;
    const cls = classFromTemplate(t, 'b', dow(q.date), '18:30', 'q');
    const scored = scoreClasses(buildWeek, [cls], [gym], profile, [], null, null);
    expect(scored[0].reasons.join()).toMatch(/Marathon-specific phase/);
  });
});

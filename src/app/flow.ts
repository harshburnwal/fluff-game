import { CARDS } from '../content/cards';
import { levelFor } from '../content/levels';
import { hashSeed } from '../rules/rng';
import { useProfile, utcDay } from '../store/profile';
import { loadRun } from '../store/runSave';
import { startRun, useNav } from './nav';

/** Starts a Journey level with the saved loadout (only cards the level allows). */
export function playLevel(id: number): void {
  const level = levelFor(id);
  const { loadout } = useProfile.getState();
  startRun({ mode: 'journey', level, seed: level.seed, cards: level.cardsAllowed ? loadout : [] });
}

export function playEndless(): void {
  const { loadout } = useProfile.getState();
  startRun({ mode: 'endless', seed: (Date.now() % 2147483647) >>> 0, cards: loadout });
}

/** The Daily Jar: one shared piece queue per UTC day (file 05). */
export function playDaily(): void {
  const { loadout } = useProfile.getState();
  startRun({ mode: 'daily', seed: hashSeed(`daily:${utcDay()}`), cards: loadout });
}

/**
 * Launch rule (file 07 section 8): an unfinished run opens directly; a brand-new player
 * lands straight in Level 1 (the game is the first screen); everyone else sees the map.
 */
export async function routeAtLaunch(): Promise<void> {
  const run = await loadRun();
  if (run) {
    const level = run.levelId ? levelFor(run.levelId) : undefined;
    const cards = run.cards.filter((c) => c in CARDS);
    startRun({ mode: run.mode, level, seed: run.seed, cards, save: run.save });
    return;
  }
  const p = useProfile.getState();
  if (Object.keys(p.journey.stars).length === 0) {
    playLevel(1);
    return;
  }
  useNav.getState().go({ name: 'map' });
}

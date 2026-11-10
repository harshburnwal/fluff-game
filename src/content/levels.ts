import { CARDS, type CardId } from './cards';
import { ghost } from './ghosts';

export type Goal =
  | { kind: 'reach'; tier: number }
  | { kind: 'score'; target: number }
  | { kind: 'hugs'; count: number }
  | { kind: 'bigHugs'; count: number }
  | { kind: 'merges'; count: number }
  | { kind: 'chain'; length: number };

export interface StartGhost {
  tier: number;
  x: number;
}

export interface LevelDef {
  id: number;
  region: number;
  goal: Goal;
  hugsOn: boolean;
  /** Fixed Hug Number for the level; otherwise it follows the drop pool. */
  hugNumber?: number;
  cardsAllowed: boolean;
  /** Drops at or under these earn 3 and 2 stars; finishing the goal always earns 1. */
  par3: number;
  par2: number;
  seed: number;
  script?: number[];
  start?: StartGhost[];
  isBoss: boolean;
  gems: number;
  bossBonusGems: number;
  cardGift?: CardId;
  /** One-time tutorial hint shown at the start. */
  tip?: 'drag' | 'hug' | 'danger';
}

export const REGION_NAMES = ['Moonlit Meadow', 'Lantern Woods', 'Crystal Hollow', 'Starlit Lake', 'Aurora Peaks', 'Cosmic Garden', 'Halo Palace'];

export function regionName(region: number): string {
  const base = REGION_NAMES[region % REGION_NAMES.length];
  const lap = Math.floor(region / REGION_NAMES.length);
  return lap === 0 ? base : `${base} ${lap + 1}`;
}

/** Average value of a drop in the opening pool (2 x 45%, 4 x 30%, 8 x 18%, 16 x 7%). */
const AVG_DROP = 4.66;

/** Rough drop counts a tidy player needs; stars reward efficiency, never luck. */
function dropsFor(goal: Goal): number {
  switch (goal.kind) {
    case 'reach':
      return 2 ** goal.tier / (goal.tier >= 8 ? 6.5 : AVG_DROP);
    case 'score':
      return goal.target / 9;
    case 'hugs':
      return goal.count * 4;
    case 'bigHugs':
      return goal.count * 9;
    case 'merges':
      return goal.count * 1.3;
    case 'chain':
      return 14 + goal.length * 6;
  }
}

function pars(goal: Goal): { par3: number; par2: number } {
  const d = dropsFor(goal);
  return { par3: Math.ceil(d * 1.35) + 3, par2: Math.ceil(d * 2) + 8 };
}

const TUTORIAL: Record<number, Omit<LevelDef, 'par3' | 'par2' | 'region' | 'isBoss' | 'gems' | 'bossBonusGems' | 'cardGift'>> = {
  1: { id: 1, goal: { kind: 'reach', tier: 4 }, hugsOn: false, cardsAllowed: false, seed: 101, script: [1, 1, 1, 1, 2, 1, 1, 2, 3, 1, 2], tip: 'drag' },
  2: { id: 2, goal: { kind: 'reach', tier: 5 }, hugsOn: false, cardsAllowed: false, seed: 202, script: [1, 2, 1, 1, 3] },
  3: {
    id: 3,
    goal: { kind: 'hugs', count: 3 },
    hugsOn: true,
    hugNumber: 10,
    cardsAllowed: false,
    seed: 303,
    start: [{ tier: 1, x: 40 }, { tier: 3, x: 50.5 }],
    script: [2, 3, 1, 2, 1, 3],
    tip: 'hug',
  },
  4: { id: 4, goal: { kind: 'reach', tier: 6 }, hugsOn: true, cardsAllowed: false, seed: 404, tip: 'danger' },
};

/**
 * Deterministic, endless level list. Regions of 20; inside a region a 5-level wave
 * (easy, easy, medium, hard, breather) and a boss on the 20th.
 */
export function levelFor(id: number): LevelDef {
  const region = Math.floor((id - 1) / 20);
  const pos = ((id - 1) % 20) + 1;
  const isBoss = pos === 20;
  const gems = isBoss ? 5 : pos % 5 === 0 ? 2 : 0;
  const bossBonusGems = isBoss ? 3 : 0;
  const cardGift = (Object.values(CARDS).find((c) => c.giftLevel === id) ?? undefined)?.id;
  const shared = { region, isBoss, gems, bossBonusGems, cardGift };

  const tutorial = TUTORIAL[id];
  if (tutorial) return { ...tutorial, ...shared, ...pars(tutorial.goal) };

  const wave = [0, 0, 1, 2, -1][(id - 1) % 5];
  const d = Math.max(0, region * 2 + Math.floor(pos / 5) + wave);
  let goal: Goal;
  if (isBoss) {
    goal = { kind: 'reach', tier: Math.min(12, 8 + region) };
  } else {
    switch (id % 6) {
      case 0:
        goal = { kind: 'hugs', count: 5 + d * 2 };
        break;
      case 1:
        goal = { kind: 'score', target: Math.round((500 * 1.45 ** d) / 50) * 50 };
        break;
      case 2:
        goal = { kind: 'reach', tier: Math.min(11, 6 + Math.floor(d / 2)) };
        break;
      case 3:
        goal = { kind: 'merges', count: 15 + d * 4 };
        break;
      case 4:
        goal = d >= 2 ? { kind: 'bigHugs', count: 1 + Math.floor(d / 3) } : { kind: 'chain', length: 3 };
        break;
      default:
        goal = { kind: 'reach', tier: Math.min(11, 7 + Math.floor(d / 3)) };
    }
  }
  return { id, goal, hugsOn: true, cardsAllowed: true, seed: id * 7919 + 17, ...shared, ...pars(goal) };
}

export function goalText(goal: Goal): string {
  switch (goal.kind) {
    case 'reach': {
      const g = ghost(goal.tier);
      return `Make ${g.name} (${g.value})`;
    }
    case 'score':
      return `Score ${goal.target.toLocaleString('en-US')}`;
    case 'hugs':
      return `Hug ${goal.count} times`;
    case 'bigHugs':
      return `Make ${goal.count} Big Hug${goal.count > 1 ? 's' : ''}`;
    case 'merges':
      return `Merge ${goal.count} times`;
    case 'chain':
      return `Make a chain of ${goal.length}`;
  }
}

export function goalTarget(goal: Goal): number {
  switch (goal.kind) {
    case 'reach':
      return goal.tier;
    case 'score':
      return goal.target;
    case 'hugs':
    case 'bigHugs':
    case 'merges':
      return goal.count;
    case 'chain':
      return goal.length;
  }
}

export function starsFor(level: LevelDef, drops: number): 1 | 2 | 3 {
  if (drops <= level.par3) return 3;
  if (drops <= level.par2) return 2;
  return 1;
}

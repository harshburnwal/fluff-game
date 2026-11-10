import { DROP_POOLS, RULES } from '../config/tuning';
import { Rng } from './rng';

export interface QueueState {
  rng: number;
  /** Scripted pieces still to come (tutorial levels), served before random ones. */
  script: number[];
  recent: number[];
}

export function poolFor(highestTier: number): ReadonlyArray<[number, number]> {
  for (const p of DROP_POOLS) if (highestTier >= p.minHighest) return p.weights;
  return DROP_POOLS[DROP_POOLS.length - 1].weights;
}

export function smallestDrop(highestTier: number): number {
  return Math.min(...poolFor(highestTier).map(([t]) => t));
}

/** Hug Number = 5 x the smallest value that can drop (10, 20, 40). */
export function hugNumberFor(highestTier: number): number {
  return 5 * 2 ** smallestDrop(highestTier);
}

/**
 * The honest piece queue: seeded, never reads the jar. The only input is how far the run
 * has progressed (highest tier), which shifts the pool so tiny pieces visit less late on.
 */
export class PieceQueue {
  private readonly rng: Rng;
  private script: number[];
  private recent: number[];

  constructor(state: QueueState) {
    this.rng = new Rng(state.rng);
    this.script = [...state.script];
    this.recent = [...state.recent];
  }

  static fresh(seed: number, script: number[] = []): PieceQueue {
    return new PieceQueue({ rng: seed, script, recent: [] });
  }

  next(highestTier: number): number {
    const scripted = this.script.shift();
    const tier = scripted ?? this.draw(highestTier);
    this.recent.push(tier);
    if (this.recent.length > RULES.maxSameInRow) this.recent.shift();
    return tier;
  }

  serialize(): QueueState {
    return { rng: this.rng.state, script: [...this.script], recent: [...this.recent] };
  }

  private draw(highestTier: number): number {
    const pool = poolFor(highestTier);
    const total = pool.reduce((s, [, w]) => s + w, 0);
    const blocked =
      this.recent.length >= RULES.maxSameInRow && this.recent.every((t) => t === this.recent[0]) ? this.recent[0] : -1;
    for (;;) {
      let roll = this.rng.next() * total;
      let pick = pool[pool.length - 1][0];
      for (const [tier, w] of pool) {
        roll -= w;
        if (roll < 0) {
          pick = tier;
          break;
        }
      }
      if (pick !== blocked) return pick;
    }
  }
}

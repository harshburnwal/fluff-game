/**
 * Effect layer state. Effects are plain data with a start time and duration; the scene
 * renderer draws them and drops expired ones. Everything is in screen pixels and seconds
 * on the animation clock. Physics never waits for an effect (file 03, rule 9).
 */
export type Fx =
  | { k: 'spark'; x: number; y: number; size: number; t0: number; dur: number; spin: number }
  | { k: 'ring'; x: number; y: number; size: number; t0: number; dur: number; alpha: number; grow: number }
  | { k: 'text'; x: number; y: number; text: string; t0: number; dur: number; color: string; size: number; rise: number }
  | { k: 'badge'; x: number; y: number; text: string; t0: number; dur: number; color: string }
  | { k: 'hearts'; x: number; y: number; t0: number; dur: number; seed: number; count: number }
  | { k: 'sparkles'; x: number; y: number; t0: number; dur: number; seed: number; count: number; spread: number }
  | { k: 'ghostOut'; tier: number; x: number; y: number; size: number; t0: number; dur: number; style: 'hug' | 'sleep' | 'hop'; toX: number; toY: number }
  | { k: 'fly'; what: 'coin' | 'gem'; x: number; y: number; toX: number; toY: number; t0: number; dur: number; landed: boolean }
  | { k: 'crystal'; which: 'magni' | 'hush'; x: number; y: number; size: number; t0: number; dur: number }
  | { k: 'jarGlow'; t0: number; dur: number; strength: number };

export interface BodyVis {
  /** Animation clock time the body appeared (merge pop-in). */
  bornAt: number;
  merged: boolean;
  squishAt: number;
  squish: number;
  /** Gentle "no" rock for a hug tap that cannot join (file 03, #42). */
  wobbleAt: number;
}

export interface FxState {
  list: Fx[];
  bodies: Map<number, BodyVis>;
  shakeAt: number;
  handReadyAt: number;
  dropAt: number;
  hugTagAt: number;
  overflowAt: number;
  lighter: boolean;
}

export function createFx(): FxState {
  return { list: [], bodies: new Map(), shakeAt: -10, handReadyAt: 0, dropAt: -10, hugTagAt: -10, overflowAt: -10, lighter: false };
}

/** Heavy effects (sprites with blending) are capped so a chain never floods the frame. */
const HEAVY: ReadonlySet<Fx['k']> = new Set(['spark', 'ring', 'hearts', 'sparkles', 'crystal', 'ghostOut']);
export const MAX_HEAVY = 10;

export function addFx(fx: FxState, e: Fx): void {
  if (HEAVY.has(e.k)) {
    const heavy = fx.list.reduce((n, f) => n + (HEAVY.has(f.k) ? 1 : 0), 0);
    if (heavy >= (fx.lighter ? 5 : MAX_HEAVY)) {
      const i = fx.list.findIndex((f) => HEAVY.has(f.k));
      if (i >= 0) fx.list.splice(i, 1);
    }
  }
  fx.list.push(e);
}

/** Deterministic pseudo-random in [0, 1) for particle layouts (no Math.random in drawing). */
export function hash01(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const EASE = {
  out: (t: number): number => 1 - (1 - t) ** 3,
  inOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** Overshoot to 1.12 then settle, for pop-ins (never from scale 0). */
  pop: (t: number): number => (t < 0.5 ? 0.7 + 0.42 * EASE.out(t / 0.5) * 1.0 : 1.12 - 0.12 * EASE.out((t - 0.5) / 0.5)),
};

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

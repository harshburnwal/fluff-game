import { RULES } from '../config/tuning';

export interface OverflowProbe {
  /** y of the critter's top edge (y grows downward). */
  top: number;
  speed: number;
  placed: boolean;
}

export interface OverflowResult {
  timer: number;
  warning: boolean;
  full: boolean;
}

/**
 * The exact "jar is full" rule (file 01 section 8). Pure, so every case is unit-tested:
 * only placed critters above the line count, and only while nearly resting, except that a
 * placed critter sticking out over the rim (top above y = 0) counts even while jostled,
 * so a jar piled past its rim cannot be kept alive by dropping onto it. Merges near the
 * rim and hugs reset the timer, card animations pause it, and the run ends after 2 s.
 */
export function stepOverflow(
  timer: number,
  probes: Iterable<OverflowProbe>,
  dangerY: number,
  restSpeed: number,
  dt: number,
  opts: { reset?: boolean; paused?: boolean; fullAfter?: number } = {},
): OverflowResult {
  const fullAfter = opts.fullAfter ?? RULES.overflowFull;
  if (opts.paused) return { timer, warning: timer >= RULES.overflowWarn, full: false };
  if (opts.reset) return { timer: 0, warning: false, full: false };
  let over = false;
  for (const p of probes) {
    if (p.placed && p.top < dangerY && (p.speed < restSpeed || p.top < 0)) {
      over = true;
      break;
    }
  }
  const next = over ? timer + dt : 0;
  return { timer: next, warning: next >= RULES.overflowWarn, full: next >= fullAfter };
}

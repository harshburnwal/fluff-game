/**
 * Every tunable number of the game in one place. Values marked (tune) in the design pack
 * (Claude-doing-stuff/Final-Idea) start here and are changed after playtests.
 */
export const JAR = {
  width: 100,
  /** Danger line distance below the rim (y grows downward, the rim is y = 0). */
  dangerY: 10,
  cornerRadius: 12,
  /** Walls extend far above the rim so a ghost can never leave the jar sideways. */
  wallTop: -600,
  /** A merge only resets the overflow timer when it happens this close to the danger line. */
  mergeResetZone: 18,
} as const;

export const PHYSICS = {
  gravity: 620,
  substeps: 6,
  iterations: 2,
  restitution: 0.15,
  /** Below this approach speed collisions are inelastic, which kills resting jitter. */
  restitutionThreshold: 24,
  friction: 0.4,
  wallFriction: 0.25,
  linearDamping: 0.6,
  maxSpeed: 420,
  /** Fraction of the overlap fixed per iteration. */
  correction: 0.75,
  /** A ghost counts as resting under this speed (jar units per second). */
  restSpeed: 20,
  /** Largest speed an overlap may push two bodies apart with (no "explosions"). */
  maxDepenetration: 30,
  contactSlop: 0.05,
  growSeconds: 0.1,
} as const;

export const RULES = {
  step: 1 / 60,
  dropCooldown: 0.45,
  handPopIn: 0.15,
  placedAfter: 1.0,
  mergeContact: 0.03,
  chainWindow: 0.8,
  mergeImpulse: 26,
  overflowWarn: 1.0,
  overflowFull: 2.0,
  maxSameInRow: 3,
  hug: {
    touchTolerance: 1.5,
    hitSlop: 3,
    contactGrace: 0.3,
    idleTimeout: 5,
  },
  resumeHold: 0.4,
  reviveRemoves: 6,
  reviveCoins: 100,
  reviveGems: 3,
} as const;

/** Drop pools by highest tier created in the run (file 01 section 4). */
export const DROP_POOLS: ReadonlyArray<{ minHighest: number; weights: ReadonlyArray<[tier: number, weight: number]> }> = [
  { minHighest: 11, weights: [[3, 30], [4, 30], [5, 25], [6, 15]] },
  { minHighest: 9, weights: [[2, 30], [3, 30], [4, 25], [5, 15]] },
  { minHighest: 7, weights: [[1, 30], [2, 30], [3, 25], [4, 10], [5, 5]] },
  { minHighest: 0, weights: [[1, 45], [2, 30], [3, 18], [4, 7]] },
];

export const ECONOMY = {
  /** Coins paid the first time a tier is created in a run, keyed by tier. */
  tierBonus: { 4: 2, 5: 3, 6: 5, 7: 8, 8: 12, 9: 20, 10: 35, 11: 60, 12: 100, 13: 150, 14: 200, 15: 250, 16: 300 } as Record<number, number>,
  /** One-time album rewards for the first time a tier is ever created (tiers 2 to 16). */
  albumCoins: { 2: 5, 3: 8, 4: 10, 5: 15, 6: 25, 7: 40, 8: 60, 9: 100, 10: 150, 11: 300, 12: 400, 13: 500, 14: 600, 15: 700, 16: 800 } as Record<number, number>,
  albumGems: { 11: 5, 12: 8, 13: 12, 14: 15, 15: 20, 16: 25 } as Record<number, number>,
  levelCoins: [0, 20, 30, 40],
  chainCoin: 1,
  bigHugCoin: 1,
  endlessCoinsPer: 500,
  endlessCoinsMax: 40,
  dailyFirstCoins: 40,
  dailySundayGems: 3,
  eternalPopCoins: 12,
  eternalPopGems: 3,
} as const;

export const EFFECTS = {
  maxEffects: 10,
  maxCoinsPerEvent: 5,
  maxGemsPerEvent: 3,
} as const;

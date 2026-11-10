/** The Ghostly Fluffs ladder (Final-Idea file 12): one ghost per number, the number on its belly. */
export type Rarity = 'common' | 'charmed' | 'mystic' | 'legendary';

export interface GhostDef {
  tier: number;
  value: number;
  id: string;
  name: string;
  title: string;
  rarity: Rarity;
  /** Collision radius in jar units: 4.5 x 1.12^(tier - 1). */
  radius: number;
  /** Signature colour, used for glows and particles. */
  color: string;
}

const ROSTER: ReadonlyArray<[id: string, name: string, title: string, color: string]> = [
  ['wisp', 'Wisp', 'The Baby Ghost', '#dfe8ff'],
  ['boo', 'Boo', 'The Sleepy One', '#9cc8ff'],
  ['puff', 'Puff', 'The Playful Troublemaker', '#c7a8ff'],
  ['momo', 'Momo', 'The Kind Heart', '#ff9cc8'],
  ['choco', 'Choco', 'The Foodie', '#f3cf98'],
  ['dizzy', 'Dizzy', 'The Curious Explorer', '#e6dcff'],
  ['frosti', 'Frosti', 'The Shy One', '#a8e4ff'],
  ['zuzu', 'Zuzu', 'The Mischievous Spirit', '#b47cff'],
  ['nova', 'Nova', 'The Dreamer', '#6f7bff'],
  ['pixel', 'Pixel', 'The Tech-Savvy Ghost', '#d59cff'],
  ['lumi', 'Lumi', 'The Brave Little Leader', '#ffe08a'],
  ['ember', 'Ember', 'The Lantern Keeper', '#ffb070'],
  ['mira', 'Mira', 'The Moon Guardian', '#e0ecff'],
  ['rori', 'Rori', 'The Aurora Dancer', '#7ff0c8'],
  ['cosmo', 'Cosmo', 'The Star Keeper', '#9b6bff'],
  ['halo', 'Halo', 'The Eternal Fluff', '#fff4d6'],
];

function rarityOf(tier: number): Rarity {
  if (tier <= 4) return 'common';
  if (tier <= 8) return 'charmed';
  if (tier <= 11) return 'mystic';
  return 'legendary';
}

export const MAX_TIER = ROSTER.length;

export const GHOSTS: ReadonlyArray<GhostDef> = ROSTER.map(([id, name, title, color], i) => {
  const tier = i + 1;
  return {
    tier,
    value: 2 ** tier,
    id,
    name,
    title,
    rarity: rarityOf(tier),
    radius: Math.round(4.5 * 1.12 ** (tier - 1) * 10) / 10,
    color,
  };
});

export function ghost(tier: number): GhostDef {
  return GHOSTS[Math.min(MAX_TIER, Math.max(1, tier)) - 1];
}

export function valueOf(tier: number): number {
  return 2 ** tier;
}

/** Short form for big numbers: 131072 -> 131K, 1048576 -> 1M. */
export function shortNumber(n: number): string {
  if (n < 100000) return String(n);
  if (n < 1e6) return `${Math.floor(n / 1000)}K`;
  return `${Math.floor(n / 1e6)}M`;
}

export interface CrystalDef {
  id: 'onyx' | 'nox' | 'vanta' | 'magni' | 'astra' | 'hush';
  name: string;
  move: string;
  color: string;
}

export const CRYSTALS: Record<CrystalDef['id'], CrystalDef> = {
  onyx: { id: 'onyx', name: 'Onyx', move: 'Wild Merge', color: '#f0c8ff' },
  nox: { id: 'nox', name: 'Nox', move: 'Night Burst', color: '#5ff0ff' },
  vanta: { id: 'vanta', name: 'Vanta', move: 'Shadow Door', color: '#a070ff' },
  magni: { id: 'magni', name: 'Magni', move: 'Moon Pull', color: '#ff5fc8' },
  astra: { id: 'astra', name: 'Astra', move: 'Star Shower', color: '#ffd060' },
  hush: { id: 'hush', name: 'Hush', move: 'Midnight Hush', color: '#7ff0d8' },
};

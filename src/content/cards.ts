import type { CrystalDef } from './ghosts';

export type CardId = 'shake' | 'swap' | 'moonPull' | 'hush';

export interface CardDef {
  id: CardId;
  name: string;
  /** What the card does, in one short line for the loadout. */
  blurb: string;
  /** Merges or Group Hugs needed to fill the ring. */
  charge: number;
  usesPerRun: number;
  /** Night Crystal that performs the move, when the card has one. */
  crystal?: CrystalDef['id'];
  /** Journey level whose completion gifts the card. */
  giftLevel: number;
}

export const CARDS: Record<CardId, CardDef> = {
  shake: { id: 'shake', name: 'Gentle Shake', blurb: 'The jar wobbles so friends settle.', charge: 8, usesPerRun: 3, giftLevel: 5 },
  swap: { id: 'swap', name: 'Peek and Swap', blurb: 'Swap the ghost in hand for the next one.', charge: 6, usesPerRun: 5, giftLevel: 8 },
  moonPull: { id: 'moonPull', name: 'Moon Pull', blurb: 'For 3 s, equal ghosts drift together.', charge: 16, usesPerRun: 1, crystal: 'magni', giftLevel: 10 },
  hush: { id: 'hush', name: 'Midnight Hush', blurb: 'The 4 smallest ghosts float away to sleep.', charge: 20, usesPerRun: 1, crystal: 'hush', giftLevel: 20 },
};

export const CARD_ORDER: CardId[] = ['shake', 'swap', 'moonPull', 'hush'];

export const MOON_PULL_SECONDS = 3;
export const HUSH_COUNT = 4;

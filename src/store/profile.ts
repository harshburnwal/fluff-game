import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { CARD_ORDER, CARDS, type CardId } from '../content/cards';
import { ECONOMY } from '../config/tuning';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** Extra reduce-motion switch on top of the phone setting. */
  reduceMotion: boolean;
  guide: boolean;
  sumBubble: boolean;
}

export interface LedgerEntry {
  at: number;
  coins: number;
  gems: number;
  why: string;
}

export interface ProfileData {
  version: 1;
  coins: number;
  gems: number;
  /** Counters only appear once the first coin or gem is earned (file 03). */
  seenCoins: boolean;
  seenGems: boolean;
  ledger: LedgerEntry[];
  album: Record<number, { first: number; count: number }>;
  journey: { stars: Record<number, number>; current: number };
  ownedCards: CardId[];
  loadout: CardId[];
  bestEndless: number;
  daily: { day: string; best: number; paid: boolean };
  morningGiftDay: string;
  tips: string[];
  settings: Settings;
}

export interface LevelReward {
  coins: number;
  gems: number;
  card?: CardId;
  firstClear: boolean;
}

const KEY = 'gf.profile.v1';
const BACKUP_KEY = 'gf.profile.v1.backup';

export const DEFAULT_PROFILE: ProfileData = {
  version: 1,
  coins: 0,
  gems: 0,
  seenCoins: false,
  seenGems: false,
  ledger: [],
  album: {},
  journey: { stars: {}, current: 1 },
  ownedCards: [],
  loadout: [],
  bestEndless: 0,
  daily: { day: '', best: 0, paid: false },
  morningGiftDay: '',
  tips: [],
  settings: { sound: true, haptics: true, reduceMotion: false, guide: true, sumBubble: true },
};

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

interface ProfileStore extends ProfileData {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  earn: (coins: number, gems: number, why: string) => void;
  /** Album bookkeeping; returns the one-time reward for a first-ever ghost. */
  meetTier: (tier: number) => { coins: number; gems: number; first: boolean };
  completeLevel: (id: number, stars: number, gems: number, bonusGems: number, cardGift?: CardId) => LevelReward;
  finishEndless: (score: number) => { coins: number; best: boolean };
  finishDaily: (score: number) => { coins: number; gems: number; best: boolean };
  claimMorningGift: () => number;
  setLoadout: (cards: CardId[]) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  markTip: (tip: string) => void;
  reset: () => void;
}

function pick(s: ProfileStore): ProfileData {
  const { hydrated: _h, hydrate: _hy, earn: _e, meetTier: _m, completeLevel: _c, finishEndless: _fe, finishDaily: _fd, claimMorningGift: _g, setLoadout: _l, setSetting: _s, markTip: _t, reset: _r, ...data } = s;
  return data;
}

export const useProfile = create<ProfileStore>()((set, get) => ({
  ...DEFAULT_PROFILE,
  hydrated: false,

  hydrate: async () => {
    const parse = (raw: string | null): ProfileData | null => {
      if (!raw) return null;
      try {
        const p = JSON.parse(raw) as ProfileData;
        return p.version === 1 ? p : null;
      } catch {
        return null;
      }
    };
    const [main, backup] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(BACKUP_KEY)]);
    const data = parse(main) ?? parse(backup);
    set({ ...DEFAULT_PROFILE, ...(data ?? {}), settings: { ...DEFAULT_PROFILE.settings, ...(data?.settings ?? {}) }, hydrated: true });
  },

  earn: (coins, gems, why) => {
    if (!coins && !gems) return;
    const s = get();
    const ledger = [...s.ledger, { at: Date.now(), coins, gems, why }].slice(-200);
    set({
      coins: s.coins + coins,
      gems: s.gems + gems,
      seenCoins: s.seenCoins || coins > 0,
      seenGems: s.seenGems || gems > 0,
      ledger,
    });
  },

  meetTier: (tier) => {
    const s = get();
    const prev = s.album[tier];
    const album = { ...s.album, [tier]: { first: prev?.first ?? Date.now(), count: (prev?.count ?? 0) + 1 } };
    set({ album });
    if (prev) return { coins: 0, gems: 0, first: false };
    const coins = ECONOMY.albumCoins[tier] ?? 0;
    const gems = ECONOMY.albumGems[tier] ?? 0;
    get().earn(coins, gems, `album:${tier}`);
    return { coins, gems, first: true };
  },

  completeLevel: (id, stars, gems, bonusGems, cardGift) => {
    const s = get();
    const before = s.journey.stars[id] ?? 0;
    const firstClear = before === 0;
    const coins = ECONOMY.levelCoins[stars];
    const gemReward = firstClear ? gems + (stars === 3 ? bonusGems : 0) : before < 3 && stars === 3 ? bonusGems : 0;
    const journey = {
      stars: { ...s.journey.stars, [id]: Math.max(before, stars) },
      current: Math.max(s.journey.current, id + 1),
    };
    let card: CardId | undefined;
    let ownedCards = s.ownedCards;
    let loadout = s.loadout;
    if (cardGift && !s.ownedCards.includes(cardGift)) {
      card = cardGift;
      ownedCards = CARD_ORDER.filter((c) => c === cardGift || s.ownedCards.includes(c));
      if (loadout.length < 3) loadout = [...loadout, cardGift];
    }
    set({ journey, ownedCards, loadout });
    get().earn(coins, gemReward, `level:${id}`);
    return { coins, gems: gemReward, card, firstClear };
  },

  finishEndless: (score) => {
    const s = get();
    const coins = Math.min(ECONOMY.endlessCoinsMax, Math.floor(score / ECONOMY.endlessCoinsPer));
    const best = score > s.bestEndless;
    if (best) set({ bestEndless: score });
    get().earn(coins, 0, 'endless');
    return { coins, best };
  },

  finishDaily: (score) => {
    const s = get();
    const day = utcDay();
    const today = s.daily.day === day ? s.daily : { day, best: 0, paid: false };
    const best = score > today.best;
    let coins = 0;
    let gems = 0;
    if (!today.paid) {
      coins = ECONOMY.dailyFirstCoins;
      gems = new Date().getUTCDay() === 0 ? ECONOMY.dailySundayGems : 0;
    }
    set({ daily: { day, best: Math.max(today.best, score), paid: true } });
    get().earn(coins, gems, 'daily');
    return { coins, gems, best };
  },

  claimMorningGift: () => {
    const day = utcDay();
    if (get().morningGiftDay === day || !get().seenCoins) return 0;
    set({ morningGiftDay: day });
    get().earn(20, 0, 'morning');
    return 20;
  },

  setLoadout: (cards) => set({ loadout: cards.filter((c) => get().ownedCards.includes(c)).slice(0, 3) }),
  setSetting: (key, value) => set({ settings: { ...get().settings, [key]: value } }),
  markTip: (tip) => {
    if (!get().tips.includes(tip)) set({ tips: [...get().tips, tip] });
  },
  reset: () => set({ ...DEFAULT_PROFILE, settings: get().settings }),
}));

/** Debounced autosave with a backup slot: every change is on disk within 300 ms. */
let timer: ReturnType<typeof setTimeout> | null = null;
useProfile.subscribe((state) => {
  if (!state.hydrated) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const raw = JSON.stringify(pick(state));
    AsyncStorage.getItem(KEY)
      .then((prev) => (prev ? AsyncStorage.setItem(BACKUP_KEY, prev) : undefined))
      .then(() => AsyncStorage.setItem(KEY, raw))
      .catch(() => undefined);
  }, 300);
});

export function cardsOwnedAtLevel(level: number): CardId[] {
  return CARD_ORDER.filter((c) => CARDS[c].giftLevel < level);
}

export const UNLOCKS = { endless: 10, daily: 12 } as const;

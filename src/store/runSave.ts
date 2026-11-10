import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CardId } from '../content/cards';
import type { Mode, RunSave } from '../rules/game';

export interface StoredRun {
  mode: Mode;
  levelId?: number;
  seed: number;
  cards: CardId[];
  save: RunSave;
  savedAt: number;
}

const KEY = 'gf.run.v1';
const BACKUP_KEY = 'gf.run.v1.backup';

/** Saves the run; the previous good save is kept as a backup slot. */
export async function saveRun(run: StoredRun): Promise<void> {
  try {
    const prev = await AsyncStorage.getItem(KEY);
    if (prev) await AsyncStorage.setItem(BACKUP_KEY, prev);
    await AsyncStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // storage full or unavailable: the game keeps running, the next save retries
  }
}

export async function loadRun(): Promise<StoredRun | null> {
  const parse = (raw: string | null): StoredRun | null => {
    if (!raw) return null;
    try {
      const r = JSON.parse(raw) as StoredRun;
      return r.save?.version === 1 ? r : null;
    } catch {
      return null;
    }
  };
  const [main, backup] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(BACKUP_KEY)]);
  return parse(main) ?? parse(backup);
}

export async function clearRun(): Promise<void> {
  await AsyncStorage.multiRemove([KEY, BACKUP_KEY]).catch(() => undefined);
}

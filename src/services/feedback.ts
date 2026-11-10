import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useProfile } from '../store/profile';

const MERGE = [
  require('../../assets/sfx/merge_01.wav'), require('../../assets/sfx/merge_02.wav'),
  require('../../assets/sfx/merge_03.wav'), require('../../assets/sfx/merge_04.wav'),
  require('../../assets/sfx/merge_05.wav'), require('../../assets/sfx/merge_06.wav'),
  require('../../assets/sfx/merge_07.wav'), require('../../assets/sfx/merge_08.wav'),
  require('../../assets/sfx/merge_09.wav'), require('../../assets/sfx/merge_10.wav'),
  require('../../assets/sfx/merge_11.wav'), require('../../assets/sfx/merge_12.wav'),
  require('../../assets/sfx/merge_13.wav'), require('../../assets/sfx/merge_14.wav'),
  require('../../assets/sfx/merge_15.wav'), require('../../assets/sfx/merge_16.wav'),
];

const SFX = {
  drop: require('../../assets/sfx/drop.wav'),
  impact: require('../../assets/sfx/impact.wav'),
  hugSelect: require('../../assets/sfx/hug_select.wav'),
  hugLink: require('../../assets/sfx/hug_link.wav'),
  hugNo: require('../../assets/sfx/hug_no.wav'),
  hug: require('../../assets/sfx/hug.wav'),
  bigHug: require('../../assets/sfx/big_hug.wav'),
  hugTag: require('../../assets/sfx/hug_tag.wav'),
  coin: require('../../assets/sfx/coin.wav'),
  gem: require('../../assets/sfx/gem.wav'),
  tierUp: require('../../assets/sfx/tier_up.wav'),
  legendary: require('../../assets/sfx/legendary.wav'),
  levelComplete: require('../../assets/sfx/level_complete.wav'),
  star1: require('../../assets/sfx/star_1.wav'),
  star2: require('../../assets/sfx/star_2.wav'),
  star3: require('../../assets/sfx/star_3.wav'),
  door: require('../../assets/sfx/door.wav'),
  cardReady: require('../../assets/sfx/card_ready.wav'),
  cardUse: require('../../assets/sfx/card_use.wav'),
  warn: require('../../assets/sfx/warn.wav'),
  jarFull: require('../../assets/sfx/jar_full.wav'),
  tap: require('../../assets/sfx/tap.wav'),
  revive: require('../../assets/sfx/revive.wav'),
} as const;

export type SoundName = keyof typeof SFX | `merge${number}`;

/** Sounds heard many times a minute get two voices so overlaps do not cut each other off. */
const VOICES: Partial<Record<SoundName, number>> = { drop: 2, impact: 2, coin: 2, hugSelect: 2 };

const players = new Map<SoundName, AudioPlayer[]>();
const nextVoice = new Map<SoundName, number>();
const lastAt = new Map<SoundName, number>();
let recent: number[] = [];
let ready = false;

function sourceOf(name: SoundName): number {
  if (name.startsWith('merge')) return MERGE[Math.min(16, Math.max(1, Number(name.slice(5)))) - 1];
  return SFX[name as keyof typeof SFX];
}

function voicesFor(name: SoundName): AudioPlayer[] {
  let list = players.get(name);
  if (!list) {
    list = Array.from({ length: VOICES[name] ?? 1 }, () => createAudioPlayer(sourceOf(name)));
    players.set(name, list);
  }
  return list;
}

/** Prepares the audio session (silent switch respected) and preloads the frequent sounds. */
export async function initSound(): Promise<void> {
  if (ready) return;
  ready = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
  } catch {
    // web and some devices do not support audio modes
  }
  for (const n of ['drop', 'impact', 'hugSelect', 'hug', 'coin', 'merge1', 'merge2', 'merge3', 'merge4'] as SoundName[]) voicesFor(n);
}

/**
 * Plays a named effect. Rules from file 08: the same effect never retriggers within 30 ms,
 * at most 3 effects start within 120 ms, and settings are read on every call.
 */
export function play(name: SoundName, volume = 1): void {
  if (!ready || !useProfile.getState().settings.sound) return;
  const now = Date.now();
  if (now - (lastAt.get(name) ?? 0) < 30) return;
  recent = recent.filter((t) => now - t < 120);
  if (recent.length >= 3 && !name.startsWith('merge') && name !== 'hug' && name !== 'bigHug') return;
  recent.push(now);
  lastAt.set(name, now);
  try {
    const voices = voicesFor(name);
    const i = nextVoice.get(name) ?? 0;
    nextVoice.set(name, (i + 1) % voices.length);
    const p = voices[i];
    p.volume = volume;
    p.seekTo(0).catch(() => undefined);
    p.play();
  } catch {
    // a missing or failed sound is skipped silently; the game runs without audio
  }
}

export function mergeSound(tier: number): SoundName {
  return `merge${tier}`;
}

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'select';
let hapticTimes: number[] = [];

/** One haptic per meaningful event, never more than 4 a second, never on web. */
export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web' || !useProfile.getState().settings.haptics) return;
  const now = Date.now();
  hapticTimes = hapticTimes.filter((t) => now - t < 1000);
  if (hapticTimes.length >= 4) return;
  hapticTimes.push(now);
  const run = (): Promise<void> => {
    switch (kind) {
      case 'light':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'medium':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'heavy':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      case 'success':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'select':
        return Haptics.selectionAsync();
    }
  };
  run().catch(() => undefined);
}

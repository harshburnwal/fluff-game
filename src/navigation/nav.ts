import { create } from 'zustand';

import type { RunSpec } from '../game/controller';

export type Screen =
  | { name: 'map' }
  | { name: 'game'; spec: RunSpec; key: number }
  | { name: 'album' }
  | { name: 'settings' };

interface NavState {
  screen: Screen;
  go: (screen: Screen) => void;
}

let gameKey = 1;

export const useNav = create<NavState>()((set) => ({
  screen: { name: 'map' },
  go: (screen) => set({ screen }),
}));

export function startRun(spec: RunSpec): void {
  useNav.getState().go({ name: 'game', spec, key: gameKey++ });
}

import { cubicBezier } from 'react-native-reanimated';

export const COLORS = {
  night: '#120a2e',
  nightDeep: '#0a0620',
  panel: '#22165a',
  panelEdge: '#8f7bff',
  lilac: '#c9b8ff',
  pink: '#ff9ed8',
  hotPink: '#ff6fb5',
  gold: '#ffd76a',
  amber: '#ffb347',
  text: '#ffffff',
  textDim: '#bdb2e8',
  mint: '#7ff0c8',
  scrim: 'rgba(8, 4, 24, 0.72)',
} as const;

export const FONT = {
  bold: 'Fredoka_700Bold',
  semi: 'Fredoka_600SemiBold',
  regular: 'Fredoka_500Medium',
} as const;

/** The motion curves of the design pack (file 03) and the animate-expo skill. */
export const CURVE = {
  out: cubicBezier(0.23, 1, 0.32, 1),
  inOut: cubicBezier(0.77, 0, 0.175, 1),
  drawer: cubicBezier(0.32, 0.72, 0, 1),
} as const;

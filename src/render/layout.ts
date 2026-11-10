import { assetMetrics } from '../content/generated/assetMetrics';

const J = assetMetrics.jar;
/** Jar image pixels per jar unit (the inner cavity is 100 units wide). */
const IMG_PER_UNIT = (J.innerRight - J.innerLeft) / 100;

/** Physics jar height in units, measured from the jar art so the floor matches the glass. */
export const JAR_HEIGHT = Math.round(((J.innerBottom - J.innerTop) / IMG_PER_UNIT) * 10) / 10;

/** Jar image extents in jar units, relative to the inner cavity (rim = y 0, left wall = x 0). */
export const JAR_IMAGE = {
  left: -J.innerLeft / IMG_PER_UNIT,
  top: -J.innerTop / IMG_PER_UNIT,
  width: J.imageW / IMG_PER_UNIT,
  height: J.imageH / IMG_PER_UNIT,
} as const;

/** Distance from the rim up to the bottom of the ghost in hand. */
export const HAND_GAP = Math.ceil(-JAR_IMAGE.top) + 4;

/** Vertical units the scene needs: the biggest droppable ghost in hand down to the jar foot. */
const SCENE_TOP = -(HAND_GAP + 2 * 8 + 4);
const SCENE_BOTTOM = JAR_IMAGE.top + JAR_IMAGE.height;

export const TOP_BAR = 64;
export const CARD_ROW = 92;
export const MAX_COLUMN = 520;

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Layout {
  width: number;
  height: number;
  /** The phone-shaped column the game lives in (centred on wide screens). */
  colX: number;
  colW: number;
  insets: Insets;
  /** Screen pixels per jar unit. */
  s: number;
  /** Screen position of jar unit (0, 0): the inner left wall at the rim. */
  ox: number;
  oy: number;
  sceneTop: number;
  sceneBottom: number;
  coinTarget: { x: number; y: number };
  gemTarget: { x: number; y: number };
}

export function computeLayout(width: number, height: number, insets: Insets): Layout {
  const colW = Math.min(width, MAX_COLUMN);
  const colX = (width - colW) / 2;
  const sceneTop = insets.top + TOP_BAR;
  const sceneBottom = height - insets.bottom - CARD_ROW;
  const availH = Math.max(100, sceneBottom - sceneTop);
  const spanY = SCENE_BOTTOM - SCENE_TOP;
  const spanX = JAR_IMAGE.width + 6;
  const s = Math.min(availH / spanY, (colW - 8) / spanX);
  const ox = colX + colW / 2 - 50 * s;
  const oy = sceneTop + (availH - spanY * s) / 2 - SCENE_TOP * s;
  const pillY = insets.top + 30;
  return {
    width,
    height,
    colX,
    colW,
    insets,
    s,
    ox,
    oy,
    sceneTop,
    sceneBottom,
    coinTarget: { x: colX + colW - 150, y: pillY },
    gemTarget: { x: colX + colW - 62, y: pillY },
  };
}

export function toScreen(l: Layout, x: number, y: number): { x: number; y: number } {
  return { x: l.ox + x * l.s, y: l.oy + y * l.s };
}

export function toUnits(l: Layout, px: number, py: number): { x: number; y: number } {
  return { x: (px - l.ox) / l.s, y: (py - l.oy) / l.s };
}

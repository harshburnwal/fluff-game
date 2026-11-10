import { PaintStyle, Skia, type SkCanvas, type SkFont, type SkImage, type SkPaint, type SkPicture } from '@shopify/react-native-skia';

import { assetMetrics } from '../content/generated/assetMetrics';
import { ghost, valueOf } from '../content/ghosts';
import { JAR } from '../config/tuning';
import { landingY, type Body } from '../physics/world';
import type { Game } from '../rules/game';
import type { SceneImages } from './assets';
import { clamp01, EASE, hash01, type BodyVis, type Fx, type FxState } from './fx';
import { JAR_IMAGE, type Layout } from './layout';

export interface AimState {
  active: boolean;
  /** Finger x in jar units (already clamped by the game when dropping). */
  x: number;
  inZone: boolean;
}

export interface SceneFonts {
  small: SkFont;
  mid: SkFont;
  big: SkFont;
}

export interface SceneInput {
  game: Game;
  layout: Layout;
  img: SceneImages;
  fonts: SceneFonts;
  fx: FxState;
  now: number;
  aim: AimState;
  reduced: boolean;
  guide: boolean;
  sumBubble: boolean;
}

interface Paints {
  img: SkPaint;
  line: SkPaint;
  dash: SkPaint;
  fill: SkPaint;
  text: SkPaint;
  shadow: SkPaint;
}

let paints: Paints | null = null;

function getPaints(): Paints {
  if (paints) return paints;
  const img = Skia.Paint();
  img.setAntiAlias(true);
  const line = Skia.Paint();
  line.setAntiAlias(true);
  line.setStyle(PaintStyle.Stroke);
  line.setStrokeWidth(3);
  const dash = Skia.Paint();
  dash.setAntiAlias(true);
  dash.setStyle(PaintStyle.Stroke);
  dash.setStrokeWidth(2);
  dash.setPathEffect(Skia.PathEffect.MakeDash([6, 6], 0));
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  const text = Skia.Paint();
  text.setAntiAlias(true);
  const shadow = Skia.Paint();
  shadow.setAntiAlias(true);
  paints = { img, line, dash, fill, text, shadow };
  return paints;
}

const SRC_CACHE = new Map<SkImage, ReturnType<typeof Skia.XYWHRect>>();
function srcOf(image: SkImage): ReturnType<typeof Skia.XYWHRect> {
  let r = SRC_CACHE.get(image);
  if (!r) {
    r = Skia.XYWHRect(0, 0, image.width(), image.height());
    SRC_CACHE.set(image, r);
  }
  return r;
}

/** Draws an image centred at (x, y) with a size in pixels, rotation in degrees, scale and alpha. */
function sprite(c: SkCanvas, p: SkPaint, image: SkImage, x: number, y: number, w: number, h: number, alpha = 1, rot = 0, sx = 1, sy = 1): void {
  if (alpha <= 0.004) return;
  p.setAlphaf(Math.min(1, alpha));
  const transformed = rot !== 0 || sx !== 1 || sy !== 1;
  if (transformed) {
    c.save();
    c.translate(x, y);
    if (rot !== 0) c.rotate(rot, 0, 0);
    if (sx !== 1 || sy !== 1) c.scale(sx, sy);
    c.drawImageRect(image, srcOf(image), Skia.XYWHRect(-w / 2, -h / 2, w, h), p);
    c.restore();
  } else {
    c.drawImageRect(image, srcOf(image), Skia.XYWHRect(x - w / 2, y - h / 2, w, h), p);
  }
}

function centredText(c: SkCanvas, font: SkFont, p: SkPaint, text: string, x: number, y: number, color: string, alpha = 1): void {
  const w = font.getTextWidth(text);
  p.setColor(Skia.Color('#1a1036'));
  p.setAlphaf(alpha * 0.55);
  c.drawText(text, x - w / 2 + 1.5, y + 2, p, font);
  p.setColor(Skia.Color(color));
  p.setAlphaf(alpha);
  c.drawText(text, x - w / 2, y, p, font);
}

const drawScale = assetMetrics.ghostDrawScale as Record<string, number>;

function ghostSize(tier: number, r: number, s: number): number {
  return 2 * r * s * (drawScale[String(tier)] ?? 1.33);
}

export function recordScene(input: SceneInput): SkPicture {
  const L = input.layout;
  const p = getPaints();
  const rec = Skia.PictureRecorder();
  const c = rec.beginRecording(Skia.XYWHRect(0, 0, L.width, L.height));
  // the jar art itself is two static native images (behind and in front of this canvas),
  // so the GPU composites it instead of the canvas redrawing a full-screen image each frame
  drawAmbient(c, p, input);
  drawJarGlow(c, p, input);
  drawDangerLine(c, p, input);
  drawBodies(c, p, input);
  drawHugLinks(c, p, input);
  drawHugTag(c, p, input);
  drawAimAndHand(c, p, input);
  drawEffects(c, p, input);
  return rec.finishRecordingAsPicture();
}

function drawAmbient(c: SkCanvas, p: Paints, { layout: L, img, now, reduced, fx }: SceneInput): void {
  const n = fx.lighter ? 3 : 6;
  for (let i = 0; i < n; i++) {
    const bx = L.colX + hash01(3, i) * L.colW;
    const by = L.sceneTop + hash01(5, i) * (L.sceneBottom - L.sceneTop);
    const t = reduced ? 0 : now;
    const x = bx + Math.sin(t * 0.21 + i * 1.7) * 18;
    const y = by + Math.cos(t * 0.17 + i * 2.3) * 22 - ((t * 6 + i * 40) % 60);
    const size = 26 + hash01(7, i) * 34;
    const a = 0.18 + 0.14 * Math.sin(t * 0.9 + i);
    sprite(c, p.img, img.lightOrb, x, y, size, size, a);
  }
  for (let i = 0; i < (fx.lighter ? 0 : 5); i++) {
    const x = L.colX + hash01(11, i) * L.colW;
    const y = L.sceneTop + hash01(13, i) * (L.sceneBottom - L.sceneTop) * 0.7;
    const tw = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now * 2.2 + i * 1.3);
    const size = 8 + 10 * tw;
    sprite(c, p.img, img.sparkle, x, y, size, size, 0.25 + 0.5 * tw);
  }
}

function jarRect(L: Layout): { x: number; y: number; w: number; h: number } {
  return { x: L.ox + JAR_IMAGE.left * L.s, y: L.oy + JAR_IMAGE.top * L.s, w: JAR_IMAGE.width * L.s, h: JAR_IMAGE.height * L.s };
}

function drawJarGlow(c: SkCanvas, p: Paints, { layout: L, img, now, fx }: SceneInput): void {
  const r = jarRect(L);
  for (const f of fx.list) {
    if (f.k !== 'jarGlow') continue;
    const t = clamp01((now - f.t0) / f.dur);
    const a = f.strength * Math.sin(t * Math.PI);
    sprite(c, p.img, img.glowRing, r.x + r.w / 2, r.y + r.h * 0.58, r.w * 1.5, r.w * 1.5, a);
  }
}

function drawDangerLine(c: SkCanvas, p: Paints, { game, layout: L, now, fx, reduced }: SceneInput): void {
  let topMost = Infinity;
  for (const b of game.world.bodies) topMost = Math.min(topMost, b.y - b.r);
  const near = 1 - clamp01((topMost - JAR.dangerY) / 30);
  const warn = game.overflowWarning;
  if (near <= 0 && !warn) return;
  const y = L.oy + JAR.dangerY * L.s;
  const paint = p.dash;
  if (warn) {
    const pulse = reduced ? 1 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((now - fx.overflowAt) * Math.PI * 2));
    paint.setColor(Skia.Color('#ffb347'));
    paint.setAlphaf(pulse);
    paint.setStrokeWidth(3);
  } else {
    paint.setColor(Skia.Color('#ffffff'));
    paint.setAlphaf(0.15 + 0.35 * near);
    paint.setStrokeWidth(2);
  }
  c.drawLine(L.ox + 4, y, L.ox + 100 * L.s - 4, y, paint);
}

function drawBodies(c: SkCanvas, p: Paints, input: SceneInput): void {
  const { game, layout: L, img, now, fx, reduced } = input;
  const selected = new Set(game.selection?.ids ?? []);
  let biggest: Body | null = null;
  for (const b of game.world.bodies) if (!biggest || b.tier > biggest.tier) biggest = b;
  const pulling = game.time < game.moonPullUntil;
  for (const b of game.world.bodies) {
    const vis: BodyVis | undefined = fx.bodies.get(b.id);
    const x = L.ox + b.x * L.s;
    const y = L.oy + b.y * L.s;
    const size = ghostSize(b.tier, b.r, L.s);
    let scale = 1;
    let sx = 1;
    let sy = 1;
    let face: SkImage = img.ghosts[b.tier - 1];
    if (vis) {
      const age = now - vis.bornAt;
      if (vis.merged && age < 0.16 && !reduced) scale *= EASE.pop(age / 0.16);
      if (vis.merged && age < 0.25 && img.pops[b.tier]) face = img.pops[b.tier];
      const st = now - vis.squishAt;
      if (st < 0.09 && !reduced) {
        const q = vis.squish * (1 - st / 0.09);
        sx = 1 + q;
        sy = 1 - q;
      }
    }
    if (b === biggest && !reduced && game.world.bodies.length > 1) scale *= 1 + 0.02 * Math.sin((now / 2.4) * Math.PI * 2);
    const isSel = selected.has(b.id);
    if (isSel) {
      sprite(c, p.img, img.glowRing, x, y, b.r * L.s * 3.1, b.r * L.s * 3.1, 0.95);
      if (!reduced) scale *= 1.08;
    }
    if (pulling && !reduced) {
      const a = 0.25 + 0.2 * Math.sin(now * 8 + b.tier);
      sprite(c, p.img, img.glowRing, x, y, b.r * L.s * 2.6, b.r * L.s * 2.6, a);
    }
    const wob = vis ? now - vis.wobbleAt : 1;
    const wobble = wob < 0.18 ? 4 * Math.sin((wob / 0.18) * Math.PI * 2) * (1 - wob / 0.18) : 0;
    const tilt = reduced ? 0 : Math.max(-12, Math.min(12, b.vx * 0.06)) + Math.sin(now * 1.6 + b.id) * 2.2 + wobble;
    sprite(c, p.img, face, x, y, size * scale, size * scale, 1, tilt, sx, sy);
  }
}

function drawHugLinks(c: SkCanvas, p: Paints, { game, layout: L, fonts, sumBubble }: SceneInput): void {
  const sel = game.selection;
  if (!sel) return;
  const line = p.line;
  line.setColor(Skia.Color('#ff9ed8'));
  line.setAlphaf(0.9);
  line.setStrokeWidth(3);
  for (const [a, b] of sel.links) {
    const A = game.world.get(a);
    const B = game.world.get(b);
    if (!A || !B) continue;
    c.drawLine(L.ox + A.x * L.s, L.oy + A.y * L.s, L.ox + B.x * L.s, L.oy + B.y * L.s, line);
  }
  if (!sumBubble) return;
  let top = Infinity;
  let cx = 0;
  const bodies = sel.ids.map((id) => game.world.get(id)).filter((b): b is Body => !!b);
  for (const b of bodies) {
    top = Math.min(top, b.y - b.r);
    cx += b.x;
  }
  if (!bodies.length) return;
  cx = L.ox + (cx / bodies.length) * L.s;
  const ty = L.oy + top * L.s - 14;
  const label = `${bodies.map((b) => valueOf(b.tier)).join(' + ')} = ${sel.sum}`;
  const goal = ` / ${game.hugNumber}`;
  const w = fonts.small.getTextWidth(label + goal) + 22;
  const fill = p.fill;
  fill.setColor(Skia.Color('#2a1c5c'));
  fill.setAlphaf(0.92);
  c.drawRRect(Skia.RRectXY(Skia.XYWHRect(cx - w / 2, ty - 22, w, 28), 14, 14), fill);
  fill.setColor(Skia.Color('#ff9ed8'));
  fill.setAlphaf(1);
  const ring = p.line;
  ring.setStrokeWidth(1.5);
  c.drawRRect(Skia.RRectXY(Skia.XYWHRect(cx - w / 2, ty - 22, w, 28), 14, 14), ring);
  const lw = fonts.small.getTextWidth(label);
  const x0 = cx - w / 2 + 11;
  p.text.setColor(Skia.Color('#ffffff'));
  p.text.setAlphaf(1);
  c.drawText(label, x0, ty - 2, p.text, fonts.small);
  p.text.setColor(Skia.Color('#c9b8ff'));
  c.drawText(goal, x0 + lw, ty - 2, p.text, fonts.small);
}

function drawHugTag(c: SkCanvas, p: Paints, { game, layout: L, img, fonts, now, fx, reduced }: SceneInput): void {
  if (!game.hugsOn) return;
  const x = L.ox + (100 + 7) * L.s;
  const y = L.oy + 6 * L.s;
  const w = 15 * L.s;
  const sway = reduced ? 0 : Math.sin(now * 1.3) * 4;
  const t = now - fx.hugTagAt;
  let scale = 1;
  if (t >= 0 && t < 0.22 && !reduced) scale = EASE.pop(t / 0.22);
  sprite(c, p.img, img.hugTag, x, y, w * 0.75, w, 1, sway, scale, scale);
  c.save();
  c.translate(x, y);
  c.rotate(sway, 0, 0);
  c.scale(scale, scale);
  centredText(c, game.hugNumber >= 100 ? fonts.small : fonts.mid, p.text, String(game.hugNumber), 0, w * 0.2, '#ffffff');
  c.restore();
}

function drawAimAndHand(c: SkCanvas, p: Paints, input: SceneInput): void {
  const { game, layout: L, img, now, fx, aim, guide, reduced } = input;
  if (game.status !== 'playing') return;
  const tier = game.hand;
  const g = ghost(tier);
  const hx = game.clampX(aim.x, tier);
  const hy = game.handY(tier);
  const px = L.ox + hx * L.s;
  const py = L.oy + hy * L.s;
  const size = ghostSize(tier, g.radius, L.s);
  if (!game.canDrop) return;
  if (aim.active && guide) {
    const land = landingY(game.world, hx, g.radius, hy);
    const ly = L.oy + land * L.s;
    const d = p.dash;
    d.setColor(Skia.Color('#ffffff'));
    d.setAlphaf(aim.inZone ? 0.45 : 0.15);
    d.setStrokeWidth(2);
    c.drawLine(px, py + g.radius * L.s, px, ly, d);
    sprite(c, p.img, img.ghosts[tier - 1], px, ly, size, size, aim.inZone ? 0.22 : 0.08);
  }
  const t = now - fx.handReadyAt;
  let scale = 1;
  let alpha = 1;
  if (t < 0.15) {
    const k = EASE.out(clamp01(t / 0.15));
    scale = reduced ? 1 : 0.6 + 0.4 * k;
    alpha = k;
  }
  const bob = reduced ? 0 : Math.sin(now * 2.4) * 1.5;
  sprite(c, p.img, img.ghosts[tier - 1], px, py + bob, size * scale, size * scale, alpha);
}

function drawEffects(c: SkCanvas, p: Paints, input: SceneInput): void {
  const { img, now, fonts, reduced } = input;
  for (const f of input.fx.list) {
    const t = (now - f.t0) / f.dur;
    if (t < 0 || t > 1) continue;
    drawFx(c, p, f, t, img, fonts, reduced);
  }
}

function drawFx(c: SkCanvas, p: Paints, f: Fx, t: number, img: SceneImages, fonts: SceneFonts, reduced: boolean): void {
  switch (f.k) {
    case 'spark': {
      const k = EASE.out(t);
      const s = f.size * (0.6 + 0.7 * k);
      sprite(c, p.img, img.mergeSpark, f.x, f.y, s, s, 1 - t, reduced ? 0 : f.spin * t);
      break;
    }
    case 'ring': {
      const s = f.size * (1 + (f.grow - 1) * EASE.out(t));
      sprite(c, p.img, img.glowRing, f.x, f.y, s, s, f.alpha * (1 - t));
      break;
    }
    case 'text': {
      const y = f.y - (reduced ? 0 : f.rise * EASE.out(t));
      const a = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      const font = f.size >= 30 ? fonts.big : f.size >= 20 ? fonts.mid : fonts.small;
      centredText(c, font, p.text, f.text, f.x, y, f.color, a);
      break;
    }
    case 'badge': {
      const s = t < 0.25 ? 0.8 + 0.2 * EASE.out(t / 0.25) : 1;
      const a = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      c.save();
      c.translate(f.x, f.y);
      c.scale(s, s);
      const w = fonts.mid.getTextWidth(f.text) + 24;
      p.fill.setColor(Skia.Color(f.color));
      p.fill.setAlphaf(0.92 * a);
      c.drawRRect(Skia.RRectXY(Skia.XYWHRect(-w / 2, -20, w, 34), 17, 17), p.fill);
      centredText(c, fonts.mid, p.text, f.text, 0, 6, '#ffffff', a);
      c.restore();
      break;
    }
    case 'hearts': {
      if (reduced) break;
      for (let i = 0; i < f.count; i++) {
        const ang = -Math.PI / 2 + (hash01(f.seed, i) - 0.5) * 2.4;
        const dist = (30 + hash01(f.seed, i + 9) * 40) * EASE.out(t);
        const x = f.x + Math.cos(ang) * dist;
        const y = f.y + Math.sin(ang) * dist - 20 * t;
        const size = 14 + hash01(f.seed, i + 3) * 10;
        sprite(c, p.img, img.heart, x, y, size, size, 1 - t * t);
      }
      break;
    }
    case 'sparkles': {
      if (reduced) break;
      for (let i = 0; i < f.count; i++) {
        const ang = hash01(f.seed, i) * Math.PI * 2;
        const dist = f.spread * (0.3 + 0.7 * hash01(f.seed, i + 5)) * EASE.out(t);
        const size = (10 + hash01(f.seed, i + 7) * 14) * (1 - t * 0.5);
        sprite(c, p.img, img.sparkle, f.x + Math.cos(ang) * dist, f.y + Math.sin(ang) * dist, size, size, 1 - t, t * 90);
      }
      break;
    }
    case 'ghostOut': {
      const face = img.ghosts[Math.min(16, f.tier) - 1];
      if (reduced) {
        sprite(c, p.img, face, f.x, f.y, f.size, f.size, 1 - t);
        break;
      }
      if (f.style === 'hug') {
        const squeeze = clamp01(t / 0.29);
        const float = clamp01((t - 0.29) / 0.71);
        const x = f.x + (f.toX - f.x) * 0.35 * EASE.out(squeeze);
        const y = f.y + (f.toY - f.y) * 0.35 * EASE.out(squeeze) - 70 * EASE.inOut(float);
        const s = 1 - 0.08 * squeeze;
        sprite(c, p.img, face, x, y, f.size * s, f.size * s, 1 - float, Math.sin(t * 12) * 6);
      } else if (f.style === 'sleep') {
        const s = 1 - 0.15 * EASE.out(t);
        sprite(c, p.img, face, f.x, f.y - 30 * t, f.size * s, f.size * s, 1 - t);
        centredText(c, fonts.small, p.text, 'z z', f.x + f.size * 0.35, f.y - f.size * 0.4 - 30 * t, '#bfe8ff', 1 - t);
      } else {
        const x = f.x + (f.toX - f.x) * EASE.inOut(t);
        const y = f.y + (f.toY - f.y) * t - Math.sin(t * Math.PI) * 80;
        sprite(c, p.img, face, x, y, f.size, f.size, 1 - t * t, t * 40);
      }
      break;
    }
    case 'fly': {
      const isCoin = f.what === 'coin';
      const popDur = isCoin ? 0.12 / 0.54 : 0.2 / 0.8;
      const size = isCoin ? 24 : 28;
      const image = isCoin ? img.coin : img.gem;
      if (t < popDur) {
        const k = EASE.out(t / popDur);
        sprite(c, p.img, image, f.x, f.y - (isCoin ? 20 : 30) * k, size, size, 0.4 + 0.6 * k);
      } else {
        const k = EASE.inOut((t - popDur) / (1 - popDur));
        const sx = f.x;
        const sy = f.y - (isCoin ? 20 : 30);
        const cx = (sx + f.toX) / 2 + (f.toX < sx ? -60 : 60);
        const cy = Math.min(sy, f.toY) - 80;
        const x = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * cx + k * k * f.toX;
        const y = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * cy + k * k * f.toY;
        if (!isCoin && !reduced) {
          for (let i = 1; i <= 3; i++) {
            const kk = Math.max(0, k - i * 0.06);
            const tx = (1 - kk) * (1 - kk) * sx + 2 * (1 - kk) * kk * cx + kk * kk * f.toX;
            const ty = (1 - kk) * (1 - kk) * sy + 2 * (1 - kk) * kk * cy + kk * kk * f.toY;
            sprite(c, p.img, img.sparkle, tx, ty, 12 - i * 2, 12 - i * 2, 0.6 - i * 0.15);
          }
        }
        sprite(c, p.img, image, x, y, size * (1 - 0.2 * k), size * (1 - 0.2 * k), 1);
      }
      break;
    }
    case 'crystal': {
      const image = f.which === 'magni' ? img.magni : img.hush;
      const inT = clamp01(t / 0.33);
      const s = reduced ? 1 : t < 0.33 ? 0.8 + 0.3 * EASE.out(inT) : 1.1 - 0.1 * clamp01((t - 0.33) / 0.2);
      const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      sprite(c, p.img, img.glowRing, f.x, f.y, f.size * 1.6 * s, f.size * 1.6 * s, 0.6 * a);
      sprite(c, p.img, image, f.x, f.y - (reduced ? 0 : 10 * Math.sin(t * Math.PI)), f.size * s, f.size * s, a);
      break;
    }
    case 'jarGlow':
      break;
  }
}

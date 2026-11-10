import { create } from 'zustand';

import { CARDS, type CardId } from '../content/cards';
import { ghost } from '../content/ghosts';
import { goalTarget, goalText, starsFor, type LevelDef } from '../content/levels';
import { EFFECTS, RULES } from '../config/tuning';
import { Game, type GameEvent, type Mode, type RunSave } from '../rules/game';
import { haptic, mergeSound, play } from '../services/feedback';
import { useProfile, type LevelReward } from '../store/profile';
import { saveRun, clearRun } from '../store/runSave';
import { addFx, createFx, type FxState } from '../render/fx';
import { HAND_GAP, JAR_HEIGHT, toScreen, type Layout } from '../render/layout';
import type { AimState } from '../render/drawScene';

export type RunStatus = 'playing' | 'won' | 'lost' | 'over';

export interface CardHud {
  id: CardId;
  charge: number;
  need: number;
  uses: number;
  max: number;
}

export interface Banner {
  id: number;
  text: string;
  sub?: string;
  tier?: number;
}

export interface RunResult {
  mode: Mode;
  score: number;
  stars?: number;
  reward?: LevelReward;
  best?: boolean;
  coins: number;
  gems: number;
  levelId?: number;
}

export interface HudState {
  score: number;
  progress: number;
  target: number;
  goal: string;
  hugNumber: number;
  hugsOn: boolean;
  hand: number;
  next: number;
  cards: CardHud[];
  pendingCoins: number;
  pendingGems: number;
  coinBump: number;
  gemBump: number;
  warn: boolean;
  status: RunStatus;
  paused: boolean;
  banner: Banner | null;
  tip: string | null;
  result: RunResult | null;
  reviveUsed: boolean;
}

export const useHud = create<HudState>()(() => ({
  score: 0,
  progress: 0,
  target: 0,
  goal: '',
  hugNumber: 10,
  hugsOn: true,
  hand: 1,
  next: 1,
  cards: [],
  pendingCoins: 0,
  pendingGems: 0,
  coinBump: 0,
  gemBump: 0,
  warn: false,
  status: 'playing',
  paused: false,
  banner: null,
  tip: null,
  result: null,
  reviveUsed: false,
}));

export interface RunSpec {
  mode: Mode;
  level?: LevelDef;
  seed: number;
  cards: CardId[];
  save?: RunSave;
}

let bannerId = 1;

/**
 * Glue between the rules engine and the screen: owns the Game, turns rule events into
 * effects, sounds, haptics, wallet updates and HUD state, and autosaves. Drawing and React
 * stay outside; the screen calls frame() once per display frame.
 */
export class GameController {
  readonly game: Game;
  readonly fx: FxState = createFx();
  readonly aim: AimState = { active: false, x: 50, inZone: false };
  layout: Layout;
  now = 0;
  private lastSave = 0;
  private slowFrames = 0;
  private lastFrame = 0;
  private finished = false;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private lastImpactSound = 0;
  private flyPending: Array<{ what: 'coin' | 'gem'; left: number; amount: number }> = [];

  constructor(readonly spec: RunSpec, layout: Layout) {
    this.layout = layout;
    this.game = new Game(
      { mode: spec.mode, level: spec.level, seed: spec.seed, cards: spec.level?.cardsAllowed === false ? [] : spec.cards, jarHeight: JAR_HEIGHT, handGap: HAND_GAP },
      spec.save,
    );
    const g = this.game;
    useHud.setState({
      score: g.score,
      progress: g.goalProgress(),
      target: g.goal ? goalTarget(g.goal) : 0,
      goal: g.goal ? goalText(g.goal) : spec.mode === 'daily' ? 'Daily Jar' : 'Endless Jar',
      hugNumber: g.hugNumber,
      hugsOn: g.hugsOn,
      hand: g.hand,
      next: g.next,
      cards: this.cardHud(),
      pendingCoins: 0,
      pendingGems: 0,
      warn: false,
      status: 'playing',
      paused: false,
      banner: null,
      tip: null,
      result: null,
      reviveUsed: g.reviveUsed,
    });
    for (const b of g.world.bodies) this.fx.bodies.set(b.id, { bornAt: -10, merged: false, squishAt: -10, squish: 0, wobbleAt: -10 });
    const tip = spec.level?.tip;
    const profile = useProfile.getState();
    if (tip && !spec.save && !profile.tips.includes(tip)) {
      profile.markTip(tip);
      useHud.setState({ tip });
      if (tip === 'danger') setTimeout(() => useHud.getState().tip === 'danger' && useHud.setState({ tip: null }), 3500);
    }
  }

  // ----------------------------------------------------------------- per frame

  frame(nowSec: number): void {
    const dt = this.lastFrame ? Math.min(0.1, nowSec - this.lastFrame) : 1 / 60;
    this.lastFrame = nowSec;
    this.now = nowSec;
    this.watchFrameTime(dt);
    const hud = useHud.getState();
    // physics keeps settling after a win (rules are frozen inside Game); a full jar stops
    if (!hud.paused && this.game.status !== 'lost') this.game.tick(dt);
    for (const e of this.game.drainEvents()) this.handle(e);
    this.landFlyers();
    this.pruneFx();
    if (this.game.status === 'playing' && nowSec - this.lastSave > 1.5) this.save();
  }

  /** Lighter Effects turns on by itself when frames run long (file 03, section 9). */
  private watchFrameTime(dt: number): void {
    this.slowFrames = dt > 0.02 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 30) this.fx.lighter = true;
  }

  // ----------------------------------------------------------------- input

  aimAt(unitX: number, inZone: boolean): void {
    this.aim.active = true;
    this.aim.x = unitX;
    this.aim.inZone = inZone;
  }

  release(unitX: number, inZone: boolean): void {
    this.aim.active = false;
    this.aim.x = unitX;
    if (inZone && this.game.drop(unitX)) this.markTip('drag');
  }

  cancelAim(): void {
    this.aim.active = false;
  }

  tapJar(unitX: number, unitY: number): void {
    this.game.hugTap(unitX, unitY);
  }

  useCard(index: number): void {
    if (this.game.useCard(index)) {
      for (const e of this.game.drainEvents()) this.handle(e);
    }
  }

  setPaused(paused: boolean): void {
    useHud.setState({ paused });
    if (paused) this.save();
  }

  /** Fluff Save paid with coins or gems; false when the wallet is short. */
  revive(pay: 'coins' | 'gems'): boolean {
    const p = useProfile.getState();
    if (pay === 'coins' && p.coins < RULES.reviveCoins) return false;
    if (pay === 'gems' && p.gems < RULES.reviveGems) return false;
    if (!this.game.revive()) return false;
    p.earn(pay === 'coins' ? -RULES.reviveCoins : 0, pay === 'gems' ? -RULES.reviveGems : 0, 'revive');
    useHud.setState({ status: 'playing', reviveUsed: true, warn: false });
    for (const e of this.game.drainEvents()) this.handle(e);
    this.save();
    return true;
  }

  /** The player declines the revive: settle the run and show the result. */
  giveUp(): void {
    if (this.finished) return;
    this.finished = true;
    const g = this.game;
    const p = useProfile.getState();
    let result: RunResult = { mode: this.spec.mode, score: g.score, coins: 0, gems: 0, levelId: this.spec.level?.id };
    if (this.spec.mode === 'endless') {
      const r = p.finishEndless(g.score);
      result = { ...result, coins: r.coins, best: r.best };
      this.flyFromJar('coin', r.coins);
    } else if (this.spec.mode === 'daily') {
      const r = p.finishDaily(g.score);
      result = { ...result, coins: r.coins, gems: r.gems, best: r.best };
      this.flyFromJar('coin', r.coins);
      this.flyFromJar('gem', r.gems);
    }
    clearRun();
    useHud.setState({ status: 'over', result });
  }

  save(): void {
    if (this.game.status !== 'playing' || this.finished) return;
    this.lastSave = this.now;
    saveRun({ mode: this.spec.mode, levelId: this.spec.level?.id, seed: this.spec.seed, cards: this.spec.cards, save: this.game.serialize(), savedAt: Date.now() });
  }

  dispose(): void {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.save();
  }

  // ----------------------------------------------------------------- events

  private px(x: number, y: number): { x: number; y: number } {
    return toScreen(this.layout, x, y);
  }

  private handle(e: GameEvent): void {
    const now = this.now;
    const fx = this.fx;
    const s = this.layout.s;
    switch (e.type) {
      case 'drop': {
        fx.dropAt = now;
        const at = this.px(e.x, e.y);
        this.meet(e.tier, at.x, at.y);
        play('drop');
        haptic('light');
        useHud.setState({ hand: this.game.hand, next: this.game.next });
        this.save();
        break;
      }
      case 'handReady':
        fx.handReadyAt = now;
        useHud.setState({ hand: this.game.hand, next: this.game.next });
        break;
      case 'impact': {
        const vis = fx.bodies.get(e.id) ?? this.newVis(e.id, false);
        vis.squishAt = now;
        vis.squish = Math.min(0.08, e.speed / 2500);
        if (now - this.lastImpactSound > 0.33 && e.speed > 90) {
          this.lastImpactSound = now;
          play('impact', Math.min(1, e.speed / 400));
        }
        break;
      }
      case 'merge': {
        fx.bodies.delete(e.a.id);
        fx.bodies.delete(e.b.id);
        this.newVis(e.id, true);
        const p = this.px(e.x, e.y);
        const r = ghost(e.tier).radius * s;
        addFx(fx, { k: 'spark', x: p.x, y: p.y, size: r * 3.2, t0: now, dur: 0.32, spin: 40 });
        addFx(fx, { k: 'ring', x: p.x, y: p.y, size: r * 2.4, t0: now, dur: 0.22, alpha: 0.6, grow: 1.5 });
        addFx(fx, { k: 'text', x: p.x, y: p.y - r, text: `+${e.score}`, t0: now, dur: 0.45, color: '#fff6c8', size: 20, rise: 24 });
        play(mergeSound(e.tier));
        haptic(e.tier >= 10 ? 'heavy' : e.tier >= 6 ? 'medium' : 'light');
        this.meet(e.tier, p.x, p.y);
        this.refreshGoal();
        this.markTip('merge');
        this.save();
        break;
      }
      case 'chain': {
        const p = this.px(e.x, e.y);
        addFx(fx, { k: 'badge', x: p.x, y: p.y - 30, text: `x${e.count}`, t0: now, dur: 0.6, color: '#ff6fb5' });
        break;
      }
      case 'tierUp': {
        const p = this.px(e.x, e.y);
        const r = ghost(e.tier).radius * s;
        addFx(fx, { k: 'ring', x: p.x, y: p.y, size: r * 2.6, t0: now, dur: 0.28, alpha: 0.7, grow: 1.6 });
        addFx(fx, { k: 'sparkles', x: p.x, y: p.y, t0: now, dur: 0.6, seed: e.tier * 13, count: 8, spread: r * 2.2 });
        if (e.tier >= 11) {
          addFx(fx, { k: 'jarGlow', t0: now, dur: 0.6, strength: 0.35 });
          play('legendary');
          haptic('success');
        } else if (e.tier >= 4) {
          play('tierUp');
        }
        break;
      }
      case 'eternalPop': {
        const p = this.px(e.x, e.y);
        addFx(fx, { k: 'sparkles', x: p.x, y: p.y, t0: now, dur: 0.9, seed: 99, count: 16, spread: 140 });
        addFx(fx, { k: 'jarGlow', t0: now, dur: 0.9, strength: 0.4 });
        fx.bodies.delete(e.a.id);
        fx.bodies.delete(e.b.id);
        play('legendary');
        haptic('heavy');
        break;
      }
      case 'coins': {
        const p = this.px(e.x, e.y);
        useProfile.getState().earn(e.amount, 0, e.reason);
        this.fly('coin', e.amount, p.x, p.y);
        break;
      }
      case 'gems': {
        const p = this.px(e.x, e.y);
        useProfile.getState().earn(0, e.amount, e.reason);
        this.fly('gem', e.amount, p.x, p.y);
        break;
      }
      case 'hugSelect':
        play('hugSelect');
        haptic('select');
        break;
      case 'hugLink':
        play('hugLink');
        break;
      case 'hugNo': {
        const vis = fx.bodies.get(e.id) ?? this.newVis(e.id, false);
        vis.wobbleAt = now;
        play('hugNo', 0.6);
        break;
      }
      case 'hugClear':
        break;
      case 'hug': {
        const c = this.px(e.x, e.y);
        for (const g of e.ghosts) {
          const p = this.px(g.x, g.y);
          fx.bodies.delete(g.id);
          addFx(fx, { k: 'ghostOut', tier: g.tier, x: p.x, y: p.y, size: 2 * g.r * s * 1.33, t0: now, dur: 0.42, style: 'hug', toX: c.x, toY: c.y });
        }
        addFx(fx, { k: 'hearts', x: c.x, y: c.y, t0: now, dur: 0.7, seed: Math.floor(now * 1000) % 997, count: 6 });
        addFx(fx, { k: 'text', x: c.x, y: c.y - 20, text: `+${e.score}`, t0: now, dur: 0.45, color: '#ffd1ec', size: 20, rise: 24 });
        if (e.big) addFx(fx, { k: 'badge', x: c.x, y: c.y - 48, text: 'Big Hug!', t0: now, dur: 0.6, color: '#ff6fb5' });
        play(e.big ? 'bigHug' : 'hug');
        haptic(e.big ? 'success' : 'medium');
        this.refreshGoal();
        this.markTip('hug');
        this.save();
        break;
      }
      case 'hugNumber':
        fx.hugTagAt = now;
        useHud.setState({ hugNumber: e.value });
        this.banner(`Now make ${e.value}!`, 'Tap touching friends that add up to it');
        play('hugTag');
        haptic('light');
        break;
      case 'overflowWarn':
        fx.overflowAt = now;
        useHud.setState({ warn: true });
        play('warn', 0.7);
        break;
      case 'overflowSafe':
        useHud.setState({ warn: false });
        break;
      case 'score':
        useHud.setState({ score: e.value });
        this.refreshGoal();
        break;
      case 'goal':
        break;
      case 'won':
        this.onWon(e.drops);
        break;
      case 'lost':
        play('jarFull');
        useHud.setState({ status: 'lost', warn: false });
        this.save();
        break;
      case 'cardCharge':
        useHud.setState({ cards: this.cardHud() });
        break;
      case 'cardReady':
        useHud.setState({ cards: this.cardHud() });
        play('cardReady');
        haptic('light');
        break;
      case 'cardUse':
        this.onCardUse(e.card, e.ghosts);
        useHud.setState({ cards: this.cardHud(), hand: this.game.hand, next: this.game.next });
        break;
      case 'revive':
        for (const g of e.ghosts) {
          const p = this.px(g.x, g.y);
          fx.bodies.delete(g.id);
          addFx(fx, { k: 'ghostOut', tier: g.tier, x: p.x, y: p.y, size: 2 * g.r * s * 1.33, t0: now, dur: 0.5, style: 'hop', toX: p.x < this.layout.width / 2 ? -40 : this.layout.width + 40, toY: p.y - 120 });
        }
        play('revive');
        haptic('success');
        break;
    }
  }

  private onCardUse(card: CardId, gone: { id: number; tier: number; x: number; y: number; r: number }[]): void {
    const fx = this.fx;
    const now = this.now;
    const centre = this.px(50, JAR_HEIGHT * 0.45);
    play('cardUse');
    haptic('medium');
    switch (card) {
      case 'shake':
        fx.shakeAt = now;
        break;
      case 'swap':
        fx.handReadyAt = now;
        break;
      case 'moonPull':
        addFx(fx, { k: 'crystal', which: 'magni', x: centre.x, y: centre.y, size: 90, t0: now, dur: 0.6 });
        addFx(fx, { k: 'sparkles', x: centre.x, y: centre.y, t0: now + 0.4, dur: 0.6, seed: 31, count: 10, spread: 90 });
        break;
      case 'hush':
        addFx(fx, { k: 'crystal', which: 'hush', x: centre.x, y: centre.y, size: 90, t0: now, dur: 0.6 });
        gone.forEach((g, i) => {
          const p = this.px(g.x, g.y);
          fx.bodies.delete(g.id);
          addFx(fx, { k: 'ghostOut', tier: g.tier, x: p.x, y: p.y, size: 2 * g.r * this.layout.s * 1.33, t0: now + i * 0.06, dur: 0.5, style: 'sleep', toX: p.x, toY: p.y });
        });
        break;
    }
  }

  private onWon(drops: number): void {
    const level = this.spec.level;
    this.finished = true;
    clearRun();
    play('levelComplete');
    haptic('success');
    addFx(this.fx, { k: 'jarGlow', t0: this.now, dur: 0.8, strength: 0.3 });
    if (!level) return;
    const stars = starsFor(level, drops);
    const reward = useProfile.getState().completeLevel(level.id, stars, level.gems, level.bossBonusGems, level.cardGift);
    this.flyFromJar('coin', reward.coins);
    this.flyFromJar('gem', reward.gems);
    useHud.setState({
      status: 'won',
      result: { mode: 'journey', score: this.game.score, stars, reward, coins: reward.coins, gems: reward.gems, levelId: level.id },
    });
  }

  private meet(tier: number, x: number, y: number): void {
    const first = useProfile.getState().meetTier(tier);
    const g = ghost(tier);
    if (first.first && tier >= 2) {
      this.banner(`New friend! ${g.name}`, `${g.title} - ${g.value}`, tier);
      if (first.coins) this.fly('coin', first.coins, x, y);
      if (first.gems) this.fly('gem', first.gems, x, y);
    }
  }

  private newVis(id: number, merged: boolean): { bornAt: number; merged: boolean; squishAt: number; squish: number; wobbleAt: number } {
    const vis = { bornAt: this.now, merged, squishAt: -10, squish: 0, wobbleAt: -10 };
    this.fx.bodies.set(id, vis);
    return vis;
  }

  private refreshGoal(): void {
    useHud.setState({ progress: this.game.goalProgress() });
  }

  private cardHud(): CardHud[] {
    return this.game.cards.map((c) => ({ id: c.id, charge: c.charge, need: CARDS[c.id].charge, uses: c.uses, max: CARDS[c.id].usesPerRun }));
  }

  private banner(text: string, sub?: string, tier?: number): void {
    useHud.setState({ banner: { id: bannerId++, text, sub, tier } });
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => useHud.setState({ banner: null }), 1600);
  }

  private markTip(event: 'drag' | 'merge' | 'hug'): void {
    const tip = useHud.getState().tip;
    if (event === 'drag' && tip === 'drag') useHud.setState({ tip: null });
    if (event === 'merge' && this.spec.level?.tip === 'drag' && !useProfile.getState().tips.includes('merge')) {
      useProfile.getState().markTip('merge');
      useHud.setState({ tip: 'merge' });
      setTimeout(() => useHud.getState().tip === 'merge' && useHud.setState({ tip: null }), 2200);
    }
    if (event === 'hug' && tip === 'hug') useHud.setState({ tip: null });
  }

  // ----------------------------------------------------------------- coins and gems in flight

  private flyFromJar(what: 'coin' | 'gem', amount: number): void {
    if (amount <= 0) return;
    const c = this.px(50, JAR_HEIGHT * 0.5);
    this.fly(what, amount, c.x, c.y);
  }

  /** At most 5 coins or 3 gems fly per event; the label shows the real total (file 03). */
  private fly(what: 'coin' | 'gem', amount: number, x: number, y: number): void {
    if (amount <= 0) return;
    const isCoin = what === 'coin';
    const icons = Math.min(isCoin ? EFFECTS.maxCoinsPerEvent : EFFECTS.maxGemsPerEvent, amount);
    const target = isCoin ? this.layout.coinTarget : this.layout.gemTarget;
    const stagger = isCoin ? 0.04 : 0.12;
    const dur = isCoin ? 0.54 : 0.8;
    // flights already in the air finish instantly, so events never pile up
    for (const f of this.fx.list) if (f.k === 'fly' && f.what === what && !f.landed) f.t0 = this.now - f.dur;
    for (let i = 0; i < icons; i++) {
      this.fx.list.push({ k: 'fly', what, x: x + (i - icons / 2) * 6, y, toX: target.x, toY: target.y, t0: this.now + i * stagger, dur, landed: false });
    }
    addFx(this.fx, { k: 'text', x, y: y - 26, text: `+${amount}`, t0: this.now, dur: 0.6, color: isCoin ? '#ffe28a' : '#c8b6ff', size: 18, rise: 20 });
    const h = useHud.getState();
    useHud.setState(isCoin ? { pendingCoins: h.pendingCoins + amount } : { pendingGems: h.pendingGems + amount });
    this.flyPending.push({ what, left: icons, amount });
  }

  private landFlyers(): void {
    let coinLand = 0;
    let gemLand = 0;
    for (const f of this.fx.list) {
      if (f.k !== 'fly' || f.landed || this.now < f.t0 + f.dur) continue;
      f.landed = true;
      const batch = this.flyPending.find((b) => b.what === f.what && b.left > 0);
      if (!batch) continue;
      const share = batch.left === 1 ? batch.amount : Math.floor(batch.amount / batch.left);
      batch.amount -= share;
      batch.left--;
      if (f.what === 'coin') coinLand += share;
      else gemLand += share;
    }
    this.flyPending = this.flyPending.filter((b) => b.left > 0);
    if (!coinLand && !gemLand) return;
    const h = useHud.getState();
    useHud.setState({
      pendingCoins: Math.max(0, h.pendingCoins - coinLand),
      pendingGems: Math.max(0, h.pendingGems - gemLand),
      coinBump: coinLand ? h.coinBump + 1 : h.coinBump,
      gemBump: gemLand ? h.gemBump + 1 : h.gemBump,
    });
    if (coinLand) play('coin', 0.7);
    if (gemLand) play('gem', 0.7);
  }

  private pruneFx(): void {
    const now = this.now;
    this.fx.list = this.fx.list.filter((f) => now < f.t0 + f.dur || (f.k === 'fly' && !f.landed));
    if (this.fx.bodies.size > this.game.world.bodies.length + 20) {
      const live = new Set(this.game.world.bodies.map((b) => b.id));
      for (const id of this.fx.bodies.keys()) if (!live.has(id)) this.fx.bodies.delete(id);
    }
  }
}

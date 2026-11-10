import { CARDS, HUSH_COUNT, MOON_PULL_SECONDS, type CardId } from '../content/cards';
import { ghost, MAX_TIER, valueOf } from '../content/ghosts';
import { goalTarget, type Goal, type LevelDef } from '../content/levels';
import { ECONOMY, JAR, PHYSICS, RULES } from '../config/tuning';
import { speedOf, touching, World, type Body, type Contact } from '../physics/world';
import { stepOverflow } from './overflow';
import { hugNumberFor, PieceQueue, type QueueState } from './queue';

export type Mode = 'journey' | 'endless' | 'daily';
export type Status = 'playing' | 'won' | 'lost';

export interface RunConfig {
  mode: Mode;
  level?: LevelDef;
  seed: number;
  cards: CardId[];
  jarHeight: number;
  /** Gap between the rim and the bottom of the ghost in hand (jar units). */
  handGap?: number;
}

export interface CardState {
  id: CardId;
  charge: number;
  uses: number;
}

export interface GhostSnapshot {
  id: number;
  tier: number;
  x: number;
  y: number;
  r: number;
}

export type GameEvent =
  | { type: 'drop'; tier: number; x: number; y: number }
  | { type: 'impact'; id: number; speed: number }
  | { type: 'merge'; a: GhostSnapshot; b: GhostSnapshot; id: number; tier: number; x: number; y: number; score: number; chain: number }
  | { type: 'chain'; count: number; x: number; y: number }
  | { type: 'tierUp'; tier: number; x: number; y: number }
  | { type: 'eternalPop'; x: number; y: number; a: GhostSnapshot; b: GhostSnapshot }
  | { type: 'coins'; amount: number; x: number; y: number; reason: string }
  | { type: 'gems'; amount: number; x: number; y: number; reason: string }
  | { type: 'hugSelect'; id: number; sum: number }
  | { type: 'hugLink'; from: number; id: number; sum: number }
  | { type: 'hugNo'; id: number }
  | { type: 'hugClear' }
  | { type: 'hug'; ghosts: GhostSnapshot[]; sum: number; big: boolean; score: number; x: number; y: number }
  | { type: 'hugNumber'; value: number }
  | { type: 'overflowWarn' }
  | { type: 'overflowSafe' }
  | { type: 'score'; value: number }
  | { type: 'goal'; progress: number; target: number }
  | { type: 'won'; drops: number }
  | { type: 'lost' }
  | { type: 'handReady'; tier: number }
  | { type: 'cardCharge'; index: number; charge: number }
  | { type: 'cardReady'; index: number }
  | { type: 'cardUse'; index: number; card: CardId; ghosts: GhostSnapshot[] }
  | { type: 'revive'; ghosts: GhostSnapshot[] };

export interface Selection {
  ids: number[];
  links: Array<[number, number]>;
  sum: number;
  lastTapAt: number;
}

export interface SavedBody {
  id: number;
  tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  touched: boolean;
  bornAt: number;
}

export interface RunSave {
  version: 1;
  mode: Mode;
  levelId?: number;
  seed: number;
  time: number;
  queue: QueueState;
  hand: number;
  next: number;
  nextId: number;
  score: number;
  drops: number;
  merges: number;
  hugs: number;
  bigHugs: number;
  highestTier: number;
  bestChain: number;
  tierBonusPaid: number[];
  cards: CardState[];
  reviveUsed: boolean;
  bodies: SavedBody[];
}

const DEFAULT_HAND_GAP = 18;

/**
 * The rules engine. Owns the physics world and the piece queue, decides merges, hugs,
 * overflow, cards, goals and scoring, and reports everything as events. It never draws,
 * never plays sounds and never touches storage, so it runs headless in tests and bots.
 */
export class Game {
  readonly world: World;
  readonly cfg: RunConfig;
  readonly events: GameEvent[] = [];
  status: Status = 'playing';
  hand: number;
  next: number;
  handReadyAt = 0;
  score = 0;
  drops = 0;
  merges = 0;
  hugs = 0;
  bigHugs = 0;
  highestTier = 1;
  bestChain = 0;
  hugNumber: number;
  overflowTimer = 0;
  overflowWarning = false;
  selection: Selection | null = null;
  cards: CardState[];
  reviveUsed = false;
  moonPullUntil = -1;
  private queue: PieceQueue;
  private nextId = 1;
  private acc = 0;
  private holdUntil = 0;
  private overflowPauseUntil = -1;
  private chainCount = 0;
  private chainAt = -10;
  private tierBonusPaid = new Set<number>();
  private contactSince = new Map<number, number>();
  private lostSince = new Map<number, number>();
  private resetOverflow = false;

  constructor(cfg: RunConfig, save?: RunSave) {
    this.cfg = cfg;
    this.world = new World(cfg.jarHeight);
    this.cards = cfg.cards.map((id) => ({ id, charge: 0, uses: 0 }));
    if (save) {
      this.queue = new PieceQueue(save.queue);
      this.hand = save.hand;
      this.next = save.next;
      this.restore(save);
    } else {
      this.queue = PieceQueue.fresh(cfg.seed, cfg.level?.script ?? []);
      this.hand = this.queue.next(this.highestTier);
      this.next = this.queue.next(this.highestTier);
      this.placeStartGhosts();
    }
    this.hugNumber = cfg.level?.hugNumber ?? hugNumberFor(this.highestTier);
  }

  get time(): number {
    return this.world.time;
  }

  get hugsOn(): boolean {
    return this.cfg.level?.hugsOn ?? true;
  }

  get goal(): Goal | undefined {
    return this.cfg.level?.goal;
  }

  get canDrop(): boolean {
    return this.status === 'playing' && this.time >= this.handReadyAt && this.time >= this.holdUntil;
  }

  /** Hover height of the ghost in hand (above the rim). */
  handY(tier = this.hand): number {
    return -(this.cfg.handGap ?? DEFAULT_HAND_GAP) - ghost(tier).radius;
  }

  clampX(x: number, tier = this.hand): number {
    const r = ghost(tier).radius;
    return Math.min(JAR.width - r, Math.max(r, x));
  }

  goalProgress(): number {
    const g = this.goal;
    if (!g) return 0;
    switch (g.kind) {
      case 'reach':
        return this.highestTier;
      case 'score':
        return this.score;
      case 'hugs':
        return this.hugs;
      case 'bigHugs':
        return this.bigHugs;
      case 'merges':
        return this.merges;
      case 'chain':
        return this.bestChain;
    }
  }

  /** Advance by real frame time using fixed 1/60 s steps (at most 4 per frame). */
  tick(frameDt: number): void {
    this.acc = Math.min(this.acc + frameDt, RULES.step * 4);
    while (this.acc >= RULES.step) {
      this.acc -= RULES.step;
      this.fixedStep(RULES.step);
    }
  }

  fixedStep(dt: number): void {
    if (this.status === 'lost') return;
    if (this.time < this.holdUntil) {
      this.world.time += dt;
      return;
    }
    const wasReady = this.canDrop;
    const contacts = this.world.step(dt, this.time < this.moonPullUntil ? this.moonPull : undefined);
    if (this.status !== 'playing') return;
    for (const b of this.world.bodies) {
      if (b.impact > 45) this.emit({ type: 'impact', id: b.id, speed: b.impact });
    }
    this.resolveMerges(contacts);
    this.maintainSelection();
    this.applyPendingHugNumber();
    this.updateOverflow(dt);
    this.checkGoal();
    if (!wasReady && this.canDrop) this.emit({ type: 'handReady', tier: this.hand });
  }

  drop(x: number): boolean {
    if (!this.canDrop) return false;
    const tier = this.hand;
    const g = ghost(tier);
    const cx = this.clampX(x, tier);
    const y = this.handY(tier);
    this.world.add({ id: this.nextId++, kind: 'ghost', tier, x: cx, y, vy: 40, r: g.radius, bornAt: this.time });
    this.drops++;
    this.hand = this.next;
    this.next = this.queue.next(this.highestTier);
    this.handReadyAt = this.time + RULES.dropCooldown;
    this.emit({ type: 'drop', tier, x: cx, y });
    return true;
  }

  /** A tap inside the jar: select, extend, complete or reject a Group Hug. */
  hugTap(x: number, y: number): void {
    if (!this.hugsOn || this.status !== 'playing') return;
    const target = this.hitTest(x, y);
    const sel = this.selection;
    if (!target) {
      if (sel) this.clearSelection();
      return;
    }
    if (sel?.ids.includes(target.id)) {
      this.clearSelection();
      return;
    }
    const value = valueOf(target.tier);
    if (!sel) {
      this.selection = { ids: [target.id], links: [], sum: value, lastTapAt: this.time };
      this.emit({ type: 'hugSelect', id: target.id, sum: value });
      return;
    }
    const tol = RULES.hug.touchTolerance;
    let anchor: Body | undefined;
    let bestD = Infinity;
    for (const id of sel.ids) {
      const b = this.world.get(id);
      if (!b || !touching(b, target, tol)) continue;
      const d = Math.hypot(b.x - target.x, b.y - target.y) - b.r - target.r;
      if (d < bestD) {
        bestD = d;
        anchor = b;
      }
    }
    const sum = sel.sum + value;
    if (!anchor || sum > this.hugNumber) {
      this.emit({ type: 'hugNo', id: target.id });
      return;
    }
    sel.ids.push(target.id);
    sel.links.push([anchor.id, target.id]);
    sel.sum = sum;
    sel.lastTapAt = this.time;
    if (sum === this.hugNumber) {
      if (this.groupConnected(sel.ids)) this.completeHug(sel);
      else {
        this.emit({ type: 'hugNo', id: target.id });
        this.clearSelection();
      }
      return;
    }
    this.emit({ type: 'hugLink', from: anchor.id, id: target.id, sum });
  }

  /** The ghost a tap would pick: nearest centre within its radius plus the hit slop. */
  hitTest(x: number, y: number): Body | undefined {
    let best: Body | undefined;
    let bestD = Infinity;
    for (const b of this.world.bodies) {
      if (!this.selectable(b)) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d <= b.r + RULES.hug.hitSlop && d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Matchmaker-style search: one valid hug group in the jar, or null. */
  findHug(): number[] | null {
    const candidates = this.world.bodies.filter((b) => this.selectable(b));
    const tol = RULES.hug.touchTolerance;
    const search = (group: Body[], sum: number): number[] | null => {
      if (sum === this.hugNumber) return group.map((b) => b.id);
      for (const c of candidates) {
        if (group.includes(c) || c.id < group[0].id) continue;
        const s = sum + valueOf(c.tier);
        if (s > this.hugNumber) continue;
        if (!group.some((g) => touching(g, c, tol))) continue;
        const found = search([...group, c], s);
        if (found) return found;
      }
      return null;
    };
    for (const c of candidates) {
      const found = search([c], valueOf(c.tier));
      if (found && found.length > 1) return found;
    }
    return null;
  }

  useCard(index: number): boolean {
    const card = this.cards[index];
    if (!card || this.status !== 'playing') return false;
    const def = CARDS[card.id];
    if (card.charge < def.charge || card.uses >= def.usesPerRun) return false;
    let gone: GhostSnapshot[] = [];
    switch (card.id) {
      case 'shake':
        for (const b of this.world.bodies) {
          b.vx += (b.id % 2 === 0 ? 1 : -1) * 18;
          b.vy -= 38;
        }
        this.overflowPauseUntil = this.time + 0.5;
        break;
      case 'swap':
        [this.hand, this.next] = [this.next, this.hand];
        break;
      case 'moonPull':
        this.moonPullUntil = this.time + MOON_PULL_SECONDS;
        this.overflowPauseUntil = this.time + 0.9;
        break;
      case 'hush':
        gone = this.removeSmallest(HUSH_COUNT);
        this.overflowPauseUntil = this.time + 0.9;
        this.resetOverflow = true;
        break;
    }
    card.charge = 0;
    card.uses++;
    this.emit({ type: 'cardUse', index, card: card.id, ghosts: gone });
    return true;
  }

  /** Fluff Save: the 6 smallest ghosts hop out once per run. Payment is checked by the caller. */
  revive(): boolean {
    if (this.status !== 'lost' || this.reviveUsed) return false;
    this.reviveUsed = true;
    const gone = this.removeSmallest(RULES.reviveRemoves);
    this.status = 'playing';
    this.overflowTimer = 0;
    this.overflowWarning = false;
    this.holdUntil = this.time + RULES.resumeHold;
    this.emit({ type: 'revive', ghosts: gone });
    return true;
  }

  serialize(): RunSave {
    return {
      version: 1,
      mode: this.cfg.mode,
      levelId: this.cfg.level?.id,
      seed: this.cfg.seed,
      time: this.time,
      queue: this.queue.serialize(),
      hand: this.hand,
      next: this.next,
      nextId: this.nextId,
      score: this.score,
      drops: this.drops,
      merges: this.merges,
      hugs: this.hugs,
      bigHugs: this.bigHugs,
      highestTier: this.highestTier,
      bestChain: this.bestChain,
      tierBonusPaid: [...this.tierBonusPaid],
      cards: this.cards.map((c) => ({ ...c })),
      reviveUsed: this.reviveUsed,
      bodies: this.world.bodies
        .filter((b) => b.kind === 'ghost')
        .map((b) => ({ id: b.id, tier: b.tier, x: b.x, y: b.y, vx: b.vx, vy: b.vy, touched: b.touched, bornAt: b.bornAt })),
    };
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  // ---------------------------------------------------------------- internals

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private restore(s: RunSave): void {
    this.world.time = s.time;
    this.nextId = s.nextId;
    this.score = s.score;
    this.drops = s.drops;
    this.merges = s.merges;
    this.hugs = s.hugs;
    this.bigHugs = s.bigHugs;
    this.highestTier = s.highestTier;
    this.bestChain = s.bestChain;
    this.tierBonusPaid = new Set(s.tierBonusPaid);
    this.reviveUsed = s.reviveUsed;
    s.cards.forEach((c, i) => {
      if (this.cards[i]?.id === c.id) this.cards[i] = { ...c };
    });
    for (const b of s.bodies) {
      this.world.add({ ...b, kind: 'ghost', r: ghost(b.tier).radius });
    }
    this.holdUntil = this.time + RULES.resumeHold;
  }

  private placeStartGhosts(): void {
    const start = this.cfg.level?.start;
    if (!start?.length) return;
    for (const s of start) {
      const g = ghost(s.tier);
      this.world.add({ id: this.nextId++, kind: 'ghost', tier: s.tier, x: s.x, y: this.world.jarHeight - g.radius, r: g.radius, bornAt: -5, touched: true });
    }
    for (let i = 0; i < 60; i++) this.world.step(RULES.step);
    this.world.time = 0;
  }

  private selectable(b: Body): boolean {
    return b.kind === 'ghost' && this.isPlaced(b) && valueOf(b.tier) < this.hugNumber;
  }

  private isPlaced(b: Body): boolean {
    return b.touched || this.time - b.bornAt >= RULES.placedAfter;
  }

  private moonPull = (b: Body, h: number): void => {
    for (const o of this.world.bodies) {
      if (o === b || o.tier !== b.tier || o.kind !== 'ghost') continue;
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-3 || d > 45) continue;
      const a = 260 * h;
      b.vx += (dx / d) * a;
      b.vy += (dy / d) * a;
    }
  };

  private resolveMerges(contacts: Contact[]): void {
    const now = this.time;
    const live = new Set<number>();
    let best: Contact | null = null;
    let bestDepth = -Infinity;
    for (const c of contacts) {
      const { a, b } = c;
      if (a.kind !== 'ghost' || b.kind !== 'ghost' || a.tier !== b.tier) continue;
      const key = pairKey(a.id, b.id);
      live.add(key);
      const since = this.contactSince.get(key);
      if (since === undefined) {
        this.contactSince.set(key, now);
        continue;
      }
      if (now - since + 1e-9 < RULES.mergeContact) continue;
      const depth = a.r + b.r - c.distance;
      if (
        depth > bestDepth + 1e-9 ||
        (Math.abs(depth - bestDepth) <= 1e-9 && best && Math.min(a.id, b.id) < Math.min(best.a.id, best.b.id))
      ) {
        best = c;
        bestDepth = depth;
      }
    }
    for (const key of this.contactSince.keys()) if (!live.has(key)) this.contactSince.delete(key);
    if (best) this.merge(best.a, best.b);
  }

  private merge(a: Body, b: Body): void {
    const snapA = snap(a);
    const snapB = snap(b);
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    this.contactSince.delete(pairKey(a.id, b.id));
    this.world.remove([a.id, b.id]);
    // A merge near the rim (a chain at the top) gets a fresh grace period; merges deep in
    // the jar do not, otherwise fast dropping could keep an overfull jar alive forever.
    if (Math.min(a.y - a.r, b.y - b.r) < JAR.dangerY + JAR.mergeResetZone) this.resetOverflow = true;
    if (this.selection && (this.selection.ids.includes(a.id) || this.selection.ids.includes(b.id))) this.clearSelection();

    if (a.tier >= MAX_TIER) {
      this.score += valueOf(MAX_TIER + 1);
      this.emit({ type: 'eternalPop', x, y, a: snapA, b: snapB });
      this.emit({ type: 'coins', amount: ECONOMY.eternalPopCoins, x, y, reason: 'eternal' });
      this.emit({ type: 'gems', amount: ECONOMY.eternalPopGems, x, y, reason: 'eternal' });
      this.emit({ type: 'score', value: this.score });
      return;
    }

    const tier = a.tier + 1;
    const g = ghost(tier);
    const id = this.nextId++;
    this.world.add({
      id,
      kind: 'ghost',
      tier,
      x,
      y,
      vx: (a.vx + b.vx) / 2,
      vy: (a.vy + b.vy) / 2,
      r: g.radius,
      startR: Math.max(a.r, b.r),
      bornAt: this.time,
      touched: true,
    });
    this.world.pushFrom(x, y, g.radius + 6, RULES.mergeImpulse, id);

    const gained = valueOf(tier);
    this.score += gained;
    this.merges++;
    this.chainCount = this.time - this.chainAt <= RULES.chainWindow ? this.chainCount + 1 : 1;
    this.chainAt = this.time;
    this.bestChain = Math.max(this.bestChain, this.chainCount);
    this.emit({ type: 'merge', a: snapA, b: snapB, id, tier, x, y, score: gained, chain: this.chainCount });
    this.emit({ type: 'score', value: this.score });
    if (this.chainCount >= 3) {
      this.emit({ type: 'chain', count: this.chainCount, x, y });
      if (this.chainCount === 3) this.emit({ type: 'coins', amount: ECONOMY.chainCoin, x, y, reason: 'chain' });
    }
    if (tier > this.highestTier) {
      this.highestTier = tier;
      this.emit({ type: 'tierUp', tier, x, y });
    }
    const bonus = ECONOMY.tierBonus[tier];
    if (bonus && !this.tierBonusPaid.has(tier)) {
      this.tierBonusPaid.add(tier);
      this.emit({ type: 'coins', amount: bonus, x, y, reason: 'tier' });
    }
    this.chargeCards();
  }

  private completeHug(sel: Selection): void {
    const bodies = sel.ids.map((id) => this.world.get(id)).filter((b): b is Body => !!b);
    const ghosts = bodies.map(snap);
    const big = bodies.length >= 3;
    const gained = this.hugNumber * (big ? 2 : 1);
    const cx = ghosts.reduce((s, g) => s + g.x, 0) / ghosts.length;
    const cy = ghosts.reduce((s, g) => s + g.y, 0) / ghosts.length;
    this.world.remove(sel.ids);
    this.selection = null;
    this.lostSince.clear();
    this.score += gained;
    this.hugs++;
    if (big) this.bigHugs++;
    this.resetOverflow = true;
    this.chainCount = 1;
    this.chainAt = this.time;
    this.emit({ type: 'hug', ghosts, sum: sel.sum, big, score: gained, x: cx, y: cy });
    this.emit({ type: 'score', value: this.score });
    if (big) this.emit({ type: 'coins', amount: ECONOMY.bigHugCoin, x: cx, y: cy, reason: 'bigHug' });
    this.chargeCards();
  }

  private chargeCards(): void {
    this.cards.forEach((c, index) => {
      const def = CARDS[c.id];
      if (c.uses >= def.usesPerRun || c.charge >= def.charge) return;
      c.charge++;
      this.emit({ type: 'cardCharge', index, charge: c.charge });
      if (c.charge === def.charge) this.emit({ type: 'cardReady', index });
    });
  }

  private clearSelection(): void {
    if (!this.selection) return;
    this.selection = null;
    this.lostSince.clear();
    this.emit({ type: 'hugClear' });
  }

  private maintainSelection(): void {
    const sel = this.selection;
    if (!sel) return;
    if (sel.ids.some((id) => !this.world.get(id)) || this.time - sel.lastTapAt > RULES.hug.idleTimeout) {
      this.clearSelection();
      return;
    }
    if (sel.ids.length < 2) return;
    const tol = RULES.hug.touchTolerance;
    for (const id of sel.ids) {
      const b = this.world.get(id)!;
      const ok = sel.ids.some((o) => o !== id && touching(b, this.world.get(o)!, tol));
      if (ok) {
        this.lostSince.delete(id);
        continue;
      }
      const since = this.lostSince.get(id) ?? this.time;
      this.lostSince.set(id, since);
      if (this.time - since > RULES.hug.contactGrace) {
        this.clearSelection();
        return;
      }
    }
  }

  private groupConnected(ids: number[]): boolean {
    const tol = RULES.hug.touchTolerance;
    const bodies = ids.map((id) => this.world.get(id)).filter((b): b is Body => !!b);
    if (bodies.length !== ids.length) return false;
    const seen = new Set([bodies[0]]);
    const stack = [bodies[0]];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const b of bodies) {
        if (!seen.has(b) && touching(cur, b, tol)) {
          seen.add(b);
          stack.push(b);
        }
      }
    }
    return seen.size === bodies.length;
  }

  private applyPendingHugNumber(): void {
    if (this.selection || this.cfg.level?.hugNumber) return;
    const target = hugNumberFor(this.highestTier);
    if (target !== this.hugNumber) {
      this.hugNumber = target;
      if (this.hugsOn) this.emit({ type: 'hugNumber', value: target });
    }
  }

  private updateOverflow(dt: number): void {
    const probes = this.world.bodies
      .filter((b) => b.kind === 'ghost')
      .map((b) => ({ top: b.y - b.r, speed: speedOf(b), placed: this.isPlaced(b) }));
    const res = stepOverflow(this.overflowTimer, probes, JAR.dangerY, PHYSICS.restSpeed, dt, {
      reset: this.resetOverflow,
      paused: this.time < this.overflowPauseUntil,
    });
    this.resetOverflow = false;
    this.overflowTimer = res.timer;
    if (res.warning !== this.overflowWarning) {
      this.overflowWarning = res.warning;
      this.emit({ type: res.warning ? 'overflowWarn' : 'overflowSafe' });
    }
    if (res.full) {
      this.status = 'lost';
      this.clearSelection();
      this.emit({ type: 'lost' });
    }
  }

  private checkGoal(): void {
    const g = this.goal;
    if (!g || this.status !== 'playing') return;
    if (this.goalProgress() >= goalTarget(g)) {
      this.status = 'won';
      this.clearSelection();
      this.emit({ type: 'won', drops: this.drops });
    }
  }

  private removeSmallest(count: number): GhostSnapshot[] {
    const picked = this.world.bodies
      .filter((b) => b.kind === 'ghost')
      .sort((p, q) => p.tier - q.tier || p.id - q.id)
      .slice(0, count);
    if (this.selection && picked.some((b) => this.selection!.ids.includes(b.id))) this.clearSelection();
    const snaps = picked.map(snap);
    this.world.remove(picked.map((b) => b.id));
    return snaps;
  }
}

function pairKey(a: number, b: number): number {
  return a < b ? a * 100000 + b : b * 100000 + a;
}

function snap(b: Body): GhostSnapshot {
  return { id: b.id, tier: b.tier, x: b.x, y: b.y, r: b.r };
}

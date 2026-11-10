import { ghost } from '../src/content/ghosts';
import { levelFor } from '../src/content/levels';
import { Game, type GameEvent } from '../src/rules/game';

const JAR_H = 140;

function endless(seed = 1): Game {
  return new Game({ mode: 'endless', seed, cards: ['shake', 'swap', 'moonPull'], jarHeight: JAR_H });
}

function settle(g: Game, seconds = 2): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    g.fixedStep(1 / 60);
    out.push(...g.drainEvents());
  }
  return out;
}

/** Puts a resting ghost on the floor without going through the queue. */
function place(g: Game, tier: number, x: number): number {
  const id = 1000 + g.world.bodies.length;
  g.world.add({ id, kind: 'ghost', tier, x, y: JAR_H - ghost(tier).radius, r: ghost(tier).radius, bornAt: -5, touched: true });
  return id;
}

describe('physics world', () => {
  it('keeps every ghost inside the jar and without deep overlaps', () => {
    const g = endless(3);
    for (let i = 0; i < 40; i++) {
      g.drop(10 + ((i * 37) % 80));
      settle(g, 0.6);
      if (g.status !== 'playing') break;
    }
    settle(g, 2);
    for (const b of g.world.bodies) {
      expect(b.x).toBeGreaterThanOrEqual(b.r - 0.6);
      expect(b.x).toBeLessThanOrEqual(100 - b.r + 0.6);
      expect(b.y).toBeLessThanOrEqual(JAR_H - b.r + 0.6);
    }
    const list = g.world.bodies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
        expect(d).toBeGreaterThan((list[i].r + list[j].r) * 0.85);
      }
    }
  });

  it('lets a lone ghost come to rest on the floor', () => {
    const g = endless();
    g.world.add({ id: 1, kind: 'ghost', tier: 3, x: 50, y: 20, r: ghost(3).radius, bornAt: 0 });
    settle(g, 3);
    const b = g.world.get(1)!;
    expect(Math.abs(b.y - (JAR_H - b.r))).toBeLessThan(0.5);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(2);
  });
});

describe('merging', () => {
  it('merges two equal ghosts into the next tier and scores its value', () => {
    const g = endless();
    place(g, 2, 40);
    place(g, 2, 50);
    const events = settle(g, 1);
    const merge = events.find((e) => e.type === 'merge');
    expect(merge).toBeDefined();
    expect(g.world.bodies.map((b) => b.tier)).toEqual([3]);
    expect(g.score).toBe(8);
    expect(g.merges).toBe(1);
  });

  it('does not merge different tiers', () => {
    const g = endless();
    place(g, 2, 40);
    place(g, 3, 50);
    settle(g, 1);
    expect(g.world.bodies).toHaveLength(2);
    expect(g.merges).toBe(0);
  });

  it('chains merges and pays the tier bonus once', () => {
    const g = endless();
    place(g, 3, 44);
    place(g, 3, 44 + 2 * ghost(3).radius);
    // a 16 resting in the groove above lands on the new 16 straight after the merge
    g.world.add({ id: 900, kind: 'ghost', tier: 4, x: 49.4, y: JAR_H - 24, r: ghost(4).radius, bornAt: -5, touched: true });
    const events = settle(g, 2);
    expect(g.world.bodies.map((b) => b.tier)).toEqual([5]);
    const coins = events.filter((e) => e.type === 'coins' && e.reason === 'tier');
    expect(coins.map((c) => (c as { amount: number }).amount)).toEqual([2, 3]);
    expect(g.bestChain).toBe(2);
  });

  it('pops two Eternal Halos into coins and gems', () => {
    const g = endless();
    place(g, 16, 25);
    place(g, 16, 25 + 2 * ghost(16).radius);
    const events = settle(g, 2);
    expect(events.some((e) => e.type === 'eternalPop')).toBe(true);
    expect(g.world.bodies).toHaveLength(0);
  });
});

describe('Group Hug', () => {
  function hugJar(): { g: Game; two: number; eight: number } {
    const g = endless();
    const two = place(g, 1, 40);
    const eight = place(g, 3, 40 + ghost(1).radius + ghost(3).radius + 0.2);
    settle(g, 1);
    return { g, two, eight };
  }

  it('hugs touching ghosts that add up to exactly 10 and removes them at once', () => {
    const { g, two, eight } = hugJar();
    const a = g.world.get(two)!;
    const b = g.world.get(eight)!;
    g.hugTap(a.x, a.y);
    g.hugTap(b.x, b.y);
    const ev = g.drainEvents();
    expect(ev.some((e) => e.type === 'hug')).toBe(true);
    expect(g.world.bodies).toHaveLength(0);
    expect(g.hugs).toBe(1);
    expect(g.score).toBe(10);
  });

  it('wobbles and costs nothing when a tap goes over the sum', () => {
    const g = endless();
    const eight = place(g, 3, 40);
    const four = place(g, 2, 40 + ghost(3).radius + ghost(2).radius + 0.2);
    settle(g, 1);
    const a = g.world.get(eight)!;
    const b = g.world.get(four)!;
    g.hugTap(a.x, a.y);
    g.hugTap(b.x, b.y);
    const ev = g.drainEvents();
    expect(ev.some((e) => e.type === 'hugNo')).toBe(true);
    expect(g.world.bodies).toHaveLength(2);
    expect(g.selection?.ids).toEqual([eight]);
    expect(g.score).toBe(0);
  });

  it('ignores a ghost that does not touch the group', () => {
    const g = endless();
    const two = place(g, 1, 15);
    const eight = place(g, 3, 80);
    settle(g, 1);
    g.hugTap(g.world.get(two)!.x, g.world.get(two)!.y);
    g.hugTap(g.world.get(eight)!.x, g.world.get(eight)!.y);
    expect(g.drainEvents().some((e) => e.type === 'hugNo')).toBe(true);
    expect(g.hugs).toBe(0);
  });

  it('clears the selection after 5 s without a tap', () => {
    const { g, two } = hugJar();
    g.hugTap(g.world.get(two)!.x, g.world.get(two)!.y);
    settle(g, 5.2);
    expect(g.selection).toBeNull();
  });

  it('does nothing on levels with hugs off', () => {
    const g = new Game({ mode: 'journey', level: levelFor(1), seed: 1, cards: [], jarHeight: JAR_H });
    const two = place(g, 1, 40);
    settle(g, 1);
    g.hugTap(g.world.get(two)!.x, g.world.get(two)!.y);
    expect(g.selection).toBeNull();
  });

  it('finds a valid hug for the Matchmaker hint', () => {
    const { g, two, eight } = hugJar();
    expect(g.findHug()?.sort()).toEqual([two, eight].sort());
  });
});

describe('dropping and the run', () => {
  it('respects the drop cooldown', () => {
    const g = endless();
    expect(g.drop(50)).toBe(true);
    expect(g.drop(50)).toBe(false);
    settle(g, 0.5);
    expect(g.drop(50)).toBe(true);
  });

  it('clamps drops so a ghost never overlaps a wall', () => {
    const g = endless();
    g.drop(-50);
    const b = g.world.bodies[0];
    expect(b.x).toBeCloseTo(b.r);
  });

  it('ends the run only when the jar is really full', () => {
    const g = endless(11);
    let drops = 0;
    while (g.status === 'playing' && drops < 400) {
      if (g.drop(50)) drops++;
      g.fixedStep(1 / 60);
      g.drainEvents();
    }
    expect(g.status).toBe('lost');
    const top = Math.min(...g.world.bodies.map((b) => b.y - b.r));
    expect(top).toBeLessThan(10);
  });

  it('revives once by removing the 6 smallest ghosts', () => {
    const g = endless(11);
    while (g.status === 'playing') {
      g.drop(50);
      g.fixedStep(1 / 60);
    }
    const before = g.world.bodies.length;
    expect(g.revive()).toBe(true);
    expect(g.world.bodies.length).toBe(before - 6);
    expect(g.status).toBe('playing');
    expect(g.revive()).toBe(false);
  });

  it('wins a Journey level when the goal is reached', () => {
    const g = new Game({ mode: 'journey', level: levelFor(1), seed: 1, cards: [], jarHeight: JAR_H });
    let guard = 0;
    while (g.status === 'playing' && guard++ < 6000) {
      g.drop(50);
      g.fixedStep(1 / 60);
    }
    expect(g.status).toBe('won');
    expect(g.highestTier).toBeGreaterThanOrEqual(4);
  });
});

describe('cards', () => {
  it('charges from merges, then Peek and Swap swaps hand and next', () => {
    const g = endless();
    g.cards[1].charge = 6;
    const [hand, next] = [g.hand, g.next];
    expect(g.useCard(1)).toBe(true);
    expect([g.hand, g.next]).toEqual([next, hand]);
    expect(g.useCard(1)).toBe(false);
  });

  it('Midnight Hush removes the 4 smallest ghosts', () => {
    const g = new Game({ mode: 'endless', seed: 1, cards: ['hush'], jarHeight: JAR_H });
    [1, 2, 3, 4, 5, 6].forEach((t, i) => place(g, t, 10 + i * 15));
    settle(g, 0.2);
    g.cards[0].charge = 20;
    g.useCard(0);
    expect(g.world.bodies.map((b) => b.tier).sort()).toEqual([5, 6]);
  });
});

describe('save and resume', () => {
  it('restores the jar, score and queue exactly', () => {
    const g = endless(21);
    for (let i = 0; i < 12; i++) {
      g.drop(20 + i * 5);
      settle(g, 0.5);
    }
    const save = JSON.parse(JSON.stringify(g.serialize()));
    const r = new Game({ mode: 'endless', seed: 21, cards: ['shake', 'swap', 'moonPull'], jarHeight: JAR_H }, save);
    expect(r.score).toBe(g.score);
    expect(r.world.bodies.map((b) => b.tier)).toEqual(g.world.bodies.map((b) => b.tier));
    expect([r.hand, r.next]).toEqual([g.hand, g.next]);
    expect(r.canDrop).toBe(false);
  });
});

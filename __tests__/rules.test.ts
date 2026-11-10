import { stepOverflow } from '../src/rules/overflow';
import { hugNumberFor, PieceQueue, poolFor } from '../src/rules/queue';

const DANGER = 10;
const REST = 7;

describe('piece queue', () => {
  it('gives the same sequence for the same seed', () => {
    const a = PieceQueue.fresh(42);
    const b = PieceQueue.fresh(42);
    const sa = Array.from({ length: 200 }, () => a.next(1));
    const sb = Array.from({ length: 200 }, () => b.next(1));
    expect(sa).toEqual(sb);
  });

  it('never gives more than 3 identical pieces in a row', () => {
    const q = PieceQueue.fresh(7);
    const seq = Array.from({ length: 5000 }, () => q.next(1));
    for (let i = 3; i < seq.length; i++) {
      expect(seq[i - 3] === seq[i - 2] && seq[i - 2] === seq[i - 1] && seq[i - 1] === seq[i]).toBe(false);
    }
  });

  it('only draws from the pool for the run progress', () => {
    const q = PieceQueue.fresh(9);
    for (const highest of [1, 7, 9, 11]) {
      const allowed = new Set(poolFor(highest).map(([t]) => t));
      for (let i = 0; i < 500; i++) expect(allowed.has(q.next(highest))).toBe(true);
    }
  });

  it('serves scripted pieces first and resumes identically after save', () => {
    const q = PieceQueue.fresh(5, [1, 1, 2]);
    expect([q.next(1), q.next(1), q.next(1)]).toEqual([1, 1, 2]);
    const copy = new PieceQueue(q.serialize());
    expect(Array.from({ length: 50 }, () => q.next(1))).toEqual(Array.from({ length: 50 }, () => copy.next(1)));
  });

  it('raises the Hug Number with the smallest drop', () => {
    expect(hugNumberFor(1)).toBe(10);
    expect(hugNumberFor(8)).toBe(10);
    expect(hugNumberFor(9)).toBe(20);
    expect(hugNumberFor(11)).toBe(40);
  });
});

describe('overflow rule', () => {
  const dt = 1 / 60;
  const run = (seconds: number, probe: { top: number; speed: number; placed: boolean }) => {
    let r = { timer: 0, warning: false, full: false };
    for (let t = 0; t < seconds; t += dt) {
      r = stepOverflow(r.timer, [probe], DANGER, REST, dt);
      if (r.full) break;
    }
    return r;
  };

  it('never counts a fresh drop passing the line', () => {
    expect(run(3, { top: 2, speed: 0, placed: false }).full).toBe(false);
  });

  it('never counts a moving critter below the rim', () => {
    expect(run(3, { top: 2, speed: 50, placed: true }).full).toBe(false);
  });

  it('counts a placed critter sticking out over the rim even while jostled', () => {
    expect(run(2.1, { top: -4, speed: 50, placed: true }).full).toBe(true);
  });

  it('warns at 1 s and ends the run at 2 s for a resting placed critter', () => {
    const at1 = run(1.05, { top: 2, speed: 0, placed: true });
    expect(at1.warning).toBe(true);
    expect(at1.full).toBe(false);
    expect(run(2.1, { top: 2, speed: 0, placed: true }).full).toBe(true);
  });

  it('resets on a merge or hug and holds while paused', () => {
    let r = stepOverflow(1.5, [{ top: 2, speed: 0, placed: true }], DANGER, REST, dt, { reset: true });
    expect(r.timer).toBe(0);
    r = stepOverflow(1.9, [{ top: 2, speed: 0, placed: true }], DANGER, REST, 1, { paused: true });
    expect(r.full).toBe(false);
    expect(r.timer).toBe(1.9);
  });

  it('resets when the critter moves back below the line', () => {
    const r = stepOverflow(1.5, [{ top: 20, speed: 0, placed: true }], DANGER, REST, dt);
    expect(r.timer).toBe(0);
  });
});

import { JAR, PHYSICS } from '../config/tuning';

export type BodyKind = 'ghost' | 'crystal';

export interface Body {
  id: number;
  kind: BodyKind;
  tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Current collision radius (grows toward targetR after a merge). */
  r: number;
  targetR: number;
  invMass: number;
  /** Simulation time the body entered the world. */
  bornAt: number;
  /** True once it has touched the jar or another body. */
  touched: boolean;
  /** Strongest impact speed during the last step, for squish and sound. */
  impact: number;
  /** Position at the start of the current sub-step (solver scratch). */
  px: number;
  py: number;
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface Contact {
  a: Body;
  b: Body;
  distance: number;
}

export interface BodySpec {
  id: number;
  kind: BodyKind;
  tier: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  r: number;
  startR?: number;
  bornAt: number;
  touched?: boolean;
}

/** Contact recorded during position solving, replayed in the velocity pass. */
interface SolverContact {
  a: Body;
  /** Null for a wall contact. */
  b: Body | null;
  nx: number;
  ny: number;
  /** Positional correction applied, used to bound friction (Coulomb). */
  depth: number;
  /** Normal velocity before solving; negative means approaching. */
  vnPre: number;
}

/** Jar outline: straight walls and a floor joined by rounded corners, as line segments. */
export function jarSegments(height: number): Segment[] {
  const w = JAR.width;
  const cr = JAR.cornerRadius;
  const points: Array<[number, number]> = [[0, JAR.wallTop], [0, height - cr]];
  const arc = (cx: number, cy: number, from: number, to: number): void => {
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const t = from + ((to - from) * i) / n;
      points.push([cx + Math.cos(t) * cr, cy + Math.sin(t) * cr]);
    }
  };
  arc(cr, height - cr, Math.PI, Math.PI / 2);
  points.push([w - cr, height]);
  arc(w - cr, height - cr, Math.PI / 2, 0);
  points.push([w, JAR.wallTop]);
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    segments.push({ ax, ay, bx, by });
  }
  return segments;
}

/**
 * A small deterministic circle world (design option A), solved with sub-stepped
 * position-based dynamics: many small steps, one constraint pass each, velocities
 * derived from positions, then a velocity pass for restitution and friction.
 * This keeps tall stacks calm without sleeping. No rendering and no timers, so it runs
 * the same in the app, in tests and in the level bot.
 */
export class World {
  readonly bodies: Body[] = [];
  readonly segments: Segment[];
  time = 0;
  private readonly byId = new Map<number, Body>();
  private readonly solverContacts: SolverContact[] = [];
  private contactCount = 0;

  constructor(readonly jarHeight: number) {
    this.segments = jarSegments(jarHeight);
  }

  get(id: number): Body | undefined {
    return this.byId.get(id);
  }

  add(spec: BodySpec): Body {
    const r0 = spec.startR ?? spec.r;
    const body: Body = {
      id: spec.id,
      kind: spec.kind,
      tier: spec.tier,
      x: spec.x,
      y: spec.y,
      vx: spec.vx ?? 0,
      vy: spec.vy ?? 0,
      r: r0,
      targetR: spec.r,
      invMass: 1 / (spec.r * spec.r),
      bornAt: spec.bornAt,
      touched: spec.touched ?? false,
      impact: 0,
      px: spec.x,
      py: spec.y,
    };
    this.bodies.push(body);
    this.byId.set(body.id, body);
    return body;
  }

  remove(ids: Iterable<number>): void {
    const gone = new Set(ids);
    if (gone.size === 0) return;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      if (gone.has(this.bodies[i].id)) {
        this.byId.delete(this.bodies[i].id);
        this.bodies.splice(i, 1);
      }
    }
  }

  /** Bodies whose centre distance to `id` is at most r1 + r2 + tolerance. */
  neighboursWithin(id: number, tolerance: number): Body[] {
    const a = this.byId.get(id);
    if (!a) return [];
    return this.bodies.filter((b) => b !== a && touching(a, b, tolerance));
  }

  /** Push bodies away from a point; used by merges and card moves. */
  pushFrom(x: number, y: number, radius: number, speed: number, skipId = -1): void {
    for (const b of this.bodies) {
      if (b.id === skipId) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d > radius + b.r || d < 1e-6) continue;
      const falloff = 1 - Math.min(1, d / (radius + b.r));
      b.vx += (dx / d) * speed * falloff;
      b.vy += (dy / d) * speed * falloff;
    }
  }

  /** Advance one fixed step; returns the bodies touching at the end of the step. */
  step(dt: number, extraForce?: (b: Body, h: number) => void): Contact[] {
    const h = dt / PHYSICS.substeps;
    for (const b of this.bodies) {
      b.impact = 0;
      if (b.r < b.targetR) {
        b.r = Math.min(b.targetR, b.r + ((b.targetR - b.r) * dt) / PHYSICS.growSeconds + 0.02);
      }
    }
    for (let s = 0; s < PHYSICS.substeps; s++) {
      // sort by x so the pair loop can stop early (sweep and prune); insertion sort is
      // near O(n) because the order barely changes between sub-steps
      insertionSortByX(this.bodies);
      this.contactCount = 0;
      this.integrate(h, extraForce);
      for (let it = 0; it < PHYSICS.iterations; it++) {
        this.solvePairs(it === 0);
        this.solveWalls(it === 0);
      }
      this.deriveVelocities(h);
      this.velocityPass(h);
    }
    this.time += dt;
    return this.contacts();
  }

  private integrate(h: number, extraForce?: (b: Body, h: number) => void): void {
    const damp = Math.max(0, 1 - PHYSICS.linearDamping * h);
    for (const b of this.bodies) {
      b.vy += PHYSICS.gravity * h;
      extraForce?.(b, h);
      b.vx *= damp;
      b.vy *= damp;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > PHYSICS.maxSpeed) {
        b.vx *= PHYSICS.maxSpeed / sp;
        b.vy *= PHYSICS.maxSpeed / sp;
      }
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
  }

  private record(a: Body, b: Body | null, nx: number, ny: number, depth: number, vnPre: number): void {
    const c = this.solverContacts[this.contactCount];
    if (c) {
      c.a = a;
      c.b = b;
      c.nx = nx;
      c.ny = ny;
      c.depth = depth;
      c.vnPre = vnPre;
    } else {
      this.solverContacts.push({ a, b, nx, ny, depth, vnPre });
    }
    this.contactCount++;
  }

  private solvePairs(first: boolean): void {
    const list = this.bodies;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        const rs = a.r + b.r;
        const dx = b.x - a.x;
        if (dx > rs + 2) {
          // list is sorted by x at sub-step start; stop once nothing further can touch a
          if (b.px - a.px > MAX_REACH) break;
          continue;
        }
        if (dx < -rs) continue;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 0;
        const ny = d > 1e-6 ? dy / d : -1;
        const w = a.invMass + b.invMass;
        const pen = rs - d;
        const k = (pen * PHYSICS.correction) / w;
        a.x -= nx * k * a.invMass;
        a.y -= ny * k * a.invMass;
        b.x += nx * k * b.invMass;
        b.y += ny * k * b.invMass;
        a.touched = true;
        b.touched = true;
        if (first) this.record(a, b, nx, ny, pen * PHYSICS.correction, (b.vx - a.vx) * nx + (b.vy - a.vy) * ny);
      }
    }
  }

  private solveWalls(first: boolean): void {
    for (const b of this.bodies) {
      for (const s of this.segments) {
        const ex = s.bx - s.ax;
        const ey = s.by - s.ay;
        const len2 = ex * ex + ey * ey;
        let t = ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s.ax + ex * t;
        const qy = s.ay + ey * t;
        const dx = b.x - qx;
        const dy = b.y - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= b.r * b.r) continue;
        const d = Math.sqrt(d2);
        let nx: number;
        let ny: number;
        if (d > 1e-6) {
          nx = dx / d;
          ny = dy / d;
        } else {
          // the jar interior is on the left-hand side of every segment
          const l = Math.sqrt(len2);
          nx = -ey / l;
          ny = ex / l;
        }
        const pen = b.r - d;
        b.x += nx * pen;
        b.y += ny * pen;
        b.touched = true;
        if (first) this.record(b, null, nx, ny, pen, b.vx * nx + b.vy * ny);
      }
    }
  }

  private deriveVelocities(h: number): void {
    for (const b of this.bodies) {
      b.vx = (b.x - b.px) / h;
      b.vy = (b.y - b.py) / h;
    }
  }

  /** Restitution for real impacts, and Coulomb friction bounded by the contact correction. */
  private velocityPass(h: number): void {
    for (let i = 0; i < this.contactCount; i++) {
      const c = this.solverContacts[i];
      const { a, b, nx, ny } = c;
      const approach = b ? -c.vnPre : c.vnPre < 0 ? -c.vnPre : 0;
      if (approach > 0) {
        a.impact = Math.max(a.impact, approach);
        if (b) b.impact = Math.max(b.impact, approach);
      }
      if (b) {
        const w = a.invMass + b.invMass;
        const sa = a.invMass / w;
        const sb = b.invMass / w;
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        const bounce = approach > PHYSICS.restitutionThreshold ? PHYSICS.restitution * approach : 0;
        if (bounce > 0) {
          const dvn = bounce - vn;
          if (dvn > 0) {
            a.vx -= nx * dvn * sa;
            a.vy -= ny * dvn * sa;
            b.vx += nx * dvn * sb;
            b.vy += ny * dvn * sb;
          }
        } else if (vn > PHYSICS.maxDepenetration) {
          // an overlap (spawn, growth after a merge) is fixed by position, not flung apart
          const dvn = vn - PHYSICS.maxDepenetration;
          a.vx += nx * dvn * sa;
          a.vy += ny * dvn * sa;
          b.vx -= nx * dvn * sb;
          b.vy -= ny * dvn * sb;
        }
        const vt = -rvy * nx + rvx * ny;
        const maxDv = (PHYSICS.friction * c.depth) / h;
        const dvt = Math.abs(vt) < maxDv ? -vt : -Math.sign(vt) * maxDv;
        a.vx -= ny * dvt * sa;
        a.vy += nx * dvt * sa;
        b.vx += ny * dvt * sb;
        b.vy -= nx * dvt * sb;
      } else {
        // wall: n points into the jar; vnPre < 0 means the body was moving into the wall
        const vn = a.vx * nx + a.vy * ny;
        if (approach > PHYSICS.restitutionThreshold) {
          const dvn = PHYSICS.restitution * approach - vn;
          if (dvn > 0) {
            a.vx += nx * dvn;
            a.vy += ny * dvn;
          }
        }
        const vt = -a.vx * ny + a.vy * nx;
        const maxDv = (PHYSICS.wallFriction * c.depth) / h;
        const dvt = Math.abs(vt) < maxDv ? -vt : -Math.sign(vt) * maxDv;
        a.vx -= ny * dvt;
        a.vy += nx * dvt;
      }
    }
  }

  private contacts(): Contact[] {
    const out: Contact[] = [];
    const list = this.bodies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const rs = a.r + b.r + PHYSICS.contactSlop;
        const dx = b.x - a.x;
        if (dx > rs) {
          if (dx > MAX_REACH) break;
          continue;
        }
        const d = Math.hypot(dx, b.y - a.y);
        if (d <= rs) out.push({ a, b, distance: d });
      }
    }
    return out;
  }
}

/** Twice the largest radius plus slack: no two bodies further apart in x can touch. */
const MAX_REACH = 54;

function insertionSortByX(list: Body[]): void {
  for (let i = 1; i < list.length; i++) {
    const cur = list[i];
    let j = i - 1;
    while (j >= 0 && list[j].x > cur.x) {
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = cur;
  }
}

export function touching(a: Body, b: Body, tolerance: number): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) <= a.r + b.r + tolerance;
}

export function speedOf(b: Body): number {
  return Math.hypot(b.vx, b.vy);
}

/**
 * Where a circle dropped straight down at x would first rest (the landing ghost).
 * A hint only: physics may roll it afterwards.
 */
export function landingY(world: World, x: number, r: number, fromY: number): number {
  let best = world.jarHeight - r;
  const cr = JAR.cornerRadius;
  const reach = cr - r;
  if (reach > 0) {
    for (const cx of [cr, JAR.width - cr]) {
      const outside = cx < JAR.width / 2 ? x < cx : x > cx;
      if (!outside) continue;
      const dx = Math.min(Math.abs(x - cx), reach);
      best = Math.min(best, world.jarHeight - cr + Math.sqrt(reach * reach - dx * dx));
    }
  }
  for (const b of world.bodies) {
    const rs = r + b.r;
    const dx = Math.abs(b.x - x);
    if (dx >= rs) continue;
    const y = b.y - Math.sqrt(rs * rs - dx * dx);
    if (y > fromY && y < best) best = y;
  }
  return best;
}

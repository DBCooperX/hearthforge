// Hit and spell effects on the battle map: sparks, slashes, bolts and bursts. Particles live in
// world space (map pixels plus a height) and are projected every frame, so the same effects work in
// the flat view and the 2.5D view. With reduced motion only a short flash remains.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

export interface P3 { x: number; y: number; h: number }
export type Project = (x: number, y: number, h: number) => { x: number; y: number; s: number };

const PHYSICAL = new Set(['slashing', 'piercing', 'bludgeoning']);
const COLORS: Record<string, number> = {
  fire: 0xff7a2a, cold: 0x8fd8ff, lightning: 0xc4dcff, thunder: 0xc9b8ff, acid: 0x9be25a, poison: 0x86d460,
  necrotic: 0xa070e0, radiant: 0xffe08a, force: 0xd08bff, psychic: 0xff8ad8,
};
/** The colour of a damage type's sparks; weapons give pale steel sparks. */
export function damageColor(type: string | undefined): number {
  return COLORS[(type ?? '').toLowerCase()] ?? 0xfff1d6;
}
export const isPhysical = (type: string | undefined) => !type || PHYSICAL.has(type.toLowerCase());
export const HEAL_COLOR = 0x7be08a;

let dotTex: Texture | null = null;
/** A soft white dot, tinted per particle. */
function dot(): Texture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTex = Texture.from(c);
  return dotTex;
}

interface Particle {
  sprite: Sprite;
  p: P3;
  v: P3;
  life: number;
  max: number;
  size: number;
  /** Pulled down (sparks) or floating up (motes). */
  gravity: number;
  /** Stretched along its motion, like a streak. */
  streak: number;
}

interface Bolt {
  head: Sprite;
  from: P3;
  to: P3;
  t: number;
  dur: number;
  color: number;
  arrow: boolean;
  done: () => void;
}

interface Slash { g: Graphics; at: P3; t: number; color: number; dir: number; size: number }
interface Ring { g: Graphics; at: P3; t: number; color: number; r: number }

export class Effects {
  readonly layer = new Container();
  private parts: Particle[] = [];
  private bolts: Bolt[] = [];
  private slashes: Slash[] = [];
  private rings: Ring[] = [];
  private pool: Sprite[] = [];
  private max: number;

  constructor(private project: Project, private k: () => number, readonly reduced: boolean, lite: boolean) {
    this.max = lite ? 110 : 260;
  }

  setLite(lite: boolean) { this.max = lite ? 110 : 260; }

  get busy() { return this.bolts.length > 0; }

  private sprite(color: number): Sprite {
    const s = this.pool.pop() ?? new Sprite(dot());
    s.anchor.set(0.5);
    s.tint = color;
    s.blendMode = 'add';
    s.alpha = 1;
    s.visible = true;
    s.rotation = 0;
    if (!s.parent) this.layer.addChild(s);
    return s;
  }

  private spawn(p: P3, v: P3, color: number, life: number, size: number, gravity = 0, streak = 0) {
    if (this.reduced || this.parts.length >= this.max) return;
    this.parts.push({ sprite: this.sprite(color), p: { ...p }, v, life, max: life, size, gravity, streak });
  }

  /** Sparks flying out of a point. */
  sparks(at: P3, color: number, n: number, speed = 40) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn(at, { x: Math.cos(a) * sp, y: Math.sin(a) * sp * 0.6, h: (up * 1.2 - 0.2) * sp }, color, 0.35 + Math.random() * 0.35, 2.2 + Math.random() * 1.8, 90, 0.05);
    }
  }

  /** A burst of light and sparks where something hits; bigger on a critical. */
  impact(at: P3, color: number, crit = false) {
    if (this.reduced) return;
    this.spawn(at, { x: 0, y: 0, h: 0 }, color, 0.28, crit ? 22 : 14);
    this.spawn(at, { x: 0, y: 0, h: 0 }, 0xffffff, 0.16, crit ? 10 : 6);
    this.sparks(at, color, crit ? 22 : 12, crit ? 60 : 42);
  }

  /** A blade's arc across the target. */
  slash(at: P3, color: number, size: number) {
    if (this.reduced) return;
    const g = new Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    this.slashes.push({ g, at, t: 0, color, dir: Math.random() < 0.5 ? -1 : 1, size });
  }

  /** A ring spreading over the ground, for spells that force a save. */
  ring(at: P3, color: number, r: number) {
    if (this.reduced) return;
    const g = new Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    this.rings.push({ g, at: { ...at, h: 0 }, t: 0, color, r });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawn({ x: at.x + Math.cos(a) * r * 0.5, y: at.y + Math.sin(a) * r * 0.5, h: 1 }, { x: 0, y: 0, h: 18 + Math.random() * 14 }, color, 0.6, 3, -10);
    }
  }

  /** Green motes rising around a healed creature. */
  motes(at: P3, color: number, r: number) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = r * (0.3 + Math.random() * 0.6);
      this.spawn({ x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, h: Math.random() * 8 }, { x: 0, y: 0, h: 14 + Math.random() * 16 }, color, 0.7 + Math.random() * 0.5, 2.4 + Math.random() * 1.6, -6);
    }
  }

  /** An arrow or a spell flying from one creature to another; done() runs when it lands. */
  bolt(from: P3, to: P3, color: number, arrow: boolean, done: () => void) {
    if (this.reduced) { done(); return; }
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const head = this.sprite(color);
    this.bolts.push({ head, from, to, t: 0, dur: Math.min(0.55, 0.12 + d / (arrow ? 520 : 300)), color, arrow, done });
  }

  tick(dt: number) {
    const k = this.k();
    for (const b of [...this.bolts]) {
      b.t += dt;
      const f = Math.min(1, b.t / b.dur);
      const arc = Math.sin(f * Math.PI) * (b.arrow ? 6 : 3);
      const p = { x: b.from.x + (b.to.x - b.from.x) * f, y: b.from.y + (b.to.y - b.from.y) * f, h: b.from.h + (b.to.h - b.from.h) * f + arc };
      const s = this.project(p.x, p.y, p.h);
      const ahead = this.project(b.to.x, b.to.y, b.to.h);
      b.head.position.set(s.x, s.y);
      if (b.arrow) {
        b.head.rotation = Math.atan2(ahead.y - s.y, ahead.x - s.x);
        b.head.scale.set((16 * k * s.s) / 64, (2.2 * k * s.s) / 64);
      } else {
        b.head.scale.set((9 * k * s.s) / 64);
        this.spawn(p, { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, h: (Math.random() - 0.5) * 8 }, b.color, 0.3, 4);
      }
      if (f >= 1) {
        this.bolts.splice(this.bolts.indexOf(b), 1);
        this.recycle(b.head);
        b.done();
      }
    }
    this.parts = this.parts.filter((q) => {
      q.life -= dt;
      if (q.life <= 0) { this.recycle(q.sprite); return false; }
      q.v.h -= q.gravity * dt;
      q.p.x += q.v.x * dt; q.p.y += q.v.y * dt; q.p.h = Math.max(0, q.p.h + q.v.h * dt);
      const s = this.project(q.p.x, q.p.y, q.p.h);
      const fade = q.life / q.max;
      q.sprite.position.set(s.x, s.y);
      q.sprite.alpha = Math.min(1, fade * 1.6);
      const px = (q.size * k * s.s) / 64;
      if (q.streak) {
        const n = this.project(q.p.x + q.v.x * q.streak, q.p.y + q.v.y * q.streak, q.p.h + q.v.h * q.streak);
        const len = Math.max(q.size, Math.hypot(n.x - s.x, n.y - s.y) / (k * s.s));
        q.sprite.rotation = Math.atan2(n.y - s.y, n.x - s.x);
        q.sprite.scale.set(((len + q.size) * k * s.s) / 64, px * 0.7);
      } else q.sprite.scale.set(px * (0.6 + 0.4 * fade));
      return true;
    });
    this.slashes = this.slashes.filter((sl) => {
      sl.t += dt;
      const f = sl.t / 0.26;
      if (f >= 1) { sl.g.destroy(); return false; }
      const c = this.project(sl.at.x, sl.at.y, sl.at.h);
      const R = sl.size * k * c.s;
      const a0 = -2.4 * sl.dir, sweep = 1.9 * Math.min(1, f * 2.2) * sl.dir;
      sl.g.clear();
      for (let i = 0; i < 3; i++) {
        sl.g.arc(c.x, c.y, R * (1 - i * 0.08), Math.min(a0, a0 + sweep), Math.max(a0, a0 + sweep))
          .stroke({ width: Math.max(1, (3.5 - i) * k * c.s * 0.45), color: i ? sl.color : 0xffffff, alpha: (1 - f) * (i ? 0.6 : 0.95) });
      }
      return true;
    });
    this.rings = this.rings.filter((rg) => {
      rg.t += dt;
      const f = rg.t / 0.6;
      if (f >= 1) { rg.g.destroy(); return false; }
      rg.g.clear();
      const r = rg.r * (0.3 + f * 0.9);
      const pts: number[] = [];
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const p = this.project(rg.at.x + Math.cos(a) * r, rg.at.y + Math.sin(a) * r, 0);
        pts.push(p.x, p.y);
      }
      const c = this.project(rg.at.x, rg.at.y, 0);
      rg.g.poly(pts).fill({ color: rg.color, alpha: 0.18 * (1 - f) }).stroke({ width: Math.max(1, 2.4 * k * c.s * 0.5), color: rg.color, alpha: 0.9 * (1 - f) });
      return true;
    });
  }

  private recycle(s: Sprite) {
    s.visible = false;
    this.pool.push(s);
  }

  destroy() {
    this.layer.destroy({ children: true });
  }
}

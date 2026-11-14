// PixiJS renderer for the battle map: tiles, tokens, movement tweens and
// floating combat numbers. React owns the UI; this class owns the canvas.
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { GameState } from '../../../shared/types';
import { TILE, spriteCanvas } from './sprites';
import { tileAt } from './util';

interface Ent {
  root: Container;
  sprite: Sprite;
  bar: Graphics;
  path: { x: number; y: number }[];
  x: number;
  y: number;
  hp: number;
  kind: 'pc' | 'monster';
}

interface Floater {
  text: Text;
  life: number;
}

export interface ViewOptions {
  selectedId: string | null;
  activeId: string | null;
  reach: Set<string>;
  targetIds: Set<string>;
  myIds: Set<string>;
}

const textures = new Map<string, Texture>();
function tex(name: string): Texture {
  let t = textures.get(name);
  if (!t) {
    t = Texture.from(spriteCanvas(name));
    t.source.scaleMode = 'nearest';
    textures.set(name, t);
  }
  return t;
}

export class MapRenderer {
  private app = new Application();
  private world = new Container();
  private tileLayer = new Container();
  private overlay = new Graphics();
  private entLayer = new Container();
  private fxLayer = new Container();
  private tiles: Sprite[] = [];
  private ents = new Map<string, Ent>();
  private floaters: Floater[] = [];
  private state: GameState | null = null;
  private opts: ViewOptions = { selectedId: null, activeId: null, reach: new Set(), targetIds: new Set(), myIds: new Set() };
  private hover: { x: number; y: number } | null = null;
  private mapKey = '';
  private scale = 3;
  private cam = { x: 0, y: 0, ready: false };
  private pulse = 0;
  private ready = false;
  private destroyed = false;
  onTile: (x: number, y: number) => void = () => {};

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: host, background: 0x0c0a0e, antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    if (this.destroyed) { this.app.destroy(true); return; }
    host.appendChild(this.app.canvas);
    this.world.addChild(this.tileLayer, this.overlay, this.entLayer, this.fxLayer);
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    const toTile = (gx: number, gy: number) => {
      const p = this.world.toLocal({ x: gx, y: gy });
      return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
    };
    this.app.stage.on('pointermove', (e) => { this.hover = toTile(e.global.x, e.global.y); });
    this.app.stage.on('pointerleave', () => { this.hover = null; });
    this.app.stage.on('pointertap', (e) => { const t = toTile(e.global.x, e.global.y); this.onTile(t.x, t.y); });
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS / 1000));
    this.ready = true;
    if (this.state) this.sync();
  }

  destroy() {
    this.destroyed = true;
    if (this.ready) this.app.destroy(true, { children: true });
  }

  queuePath(id: string, path: { x: number; y: number }[]) {
    const e = this.ents.get(id);
    if (e) e.path.push(...path);
  }

  update(state: GameState, opts: ViewOptions) {
    this.state = state;
    this.opts = opts;
    if (this.ready) this.sync();
  }

  private buildTiles(state: GameState) {
    this.tileLayer.removeChildren().forEach((c) => c.destroy());
    this.tiles = [];
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const s = new Sprite(tex('floor0'));
        s.anchor.set(0.5);
        s.position.set(x * TILE + TILE / 2, y * TILE + TILE / 2);
        this.tileLayer.addChild(s);
        this.tiles.push(s);
      }
    }
    for (const e of this.ents.values()) e.root.destroy({ children: true });
    this.ents.clear();
    this.cam.ready = false;
  }

  private sync() {
    const state = this.state!;
    const mk = `${state.room}:${state.map.rows.join('')}`;
    if (mk !== this.mapKey) { this.mapKey = mk; this.buildTiles(state); }
    const hostW = this.app.screen.width;
    // Battle arenas are small: show the whole fight when it fits, in quarter steps so pixels stay fairly crisp.
    const fit = Math.min(hostW / (state.map.width * TILE), this.app.screen.height / (state.map.height * TILE));
    this.scale = Math.max(1.5, Math.min(4, Math.floor(fit * 4) / 4));
    this.world.scale.set(this.scale);

    // Tiles
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const h = (x * 7 + y * 13) % 4;
        this.tiles[y * state.map.width + x].texture = tex(tileAt(state, x, y) === '#' ? `wall${h % 3}` : `floor${h}`);
      }
    }

    // Tokens
    const seen = new Set<string>();
    const place = (id: string, kind: 'pc' | 'monster', sprite: string, x: number, y: number, hp: number, maxHp: number) => {
      seen.add(id);
      let e = this.ents.get(id);
      if (!e) {
        const root = new Container();
        const sp = new Sprite(tex(sprite));
        sp.anchor.set(0.5);
        // Sprites taller than a tile (some art packs) stand on the tile's bottom edge.
        sp.position.set(TILE / 2, TILE - sp.height / 2);
        const bar = new Graphics();
        root.addChild(sp, bar);
        root.position.set(x * TILE, y * TILE);
        this.entLayer.addChild(root);
        e = { root, sprite: sp, bar, path: [], x, y, hp, kind };
        this.ents.set(id, e);
      }
      if (hp !== e.hp) {
        this.float(e, hp < e.hp ? `-${e.hp - hp}` : `+${hp - e.hp}`, hp < e.hp ? 0xff6b5e : 0x7be08a);
        e.hp = hp;
      }
      const last = e.path[e.path.length - 1] ?? { x: e.x, y: e.y };
      if (last.x !== x || last.y !== y) {
        // A long unexplained jump (reset, reconnect) snaps instead of sliding across the map.
        if (Math.abs(last.x - x) + Math.abs(last.y - y) > 12) { e.path = []; e.x = x; e.y = y; e.root.position.set(x * TILE, y * TILE); }
        else e.path.push({ x, y });
      }
      e.bar.clear();
      if (hp > 0 && (kind === 'monster' || hp < maxHp)) {
        const w = 12, frac = Math.max(0, Math.min(1, hp / maxHp));
        e.bar.rect(2, -3, w, 2).fill(0x1a1418);
        e.bar.rect(2, -3, Math.max(1, Math.round(w * frac)), 2).fill(kind === 'monster' ? 0xd9534f : frac > 0.5 ? 0x5cb85c : 0xf0ad4e);
      }
      return e;
    };
    for (const c of state.characters) {
      if (c.dead) continue;
      const e = place(c.id, 'pc', c.classId, c.x, c.y, c.hp, c.maxHp);
      const down = c.hp <= 0;
      e.sprite.rotation = down ? Math.PI / 2 : 0;
      e.sprite.tint = c.dead ? 0x555555 : 0xffffff;
      e.root.alpha = down ? 0.75 : 1;
      e.root.zIndex = down ? 0 : 2;
    }
    for (const m of state.monsters) {
      if (!m.alive) continue;
      const e = place(m.id, 'monster', m.sprite, m.x, m.y, m.hp, m.maxHp);
      e.root.zIndex = 1;
    }
    this.entLayer.sortableChildren = true;
    for (const [id, e] of this.ents) {
      if (seen.has(id)) continue;
      // Slain monsters get a last damage number, then vanish.
      if (e.kind === 'monster' && e.hp > 0) this.float(e, `-${e.hp}`, 0xff6b5e);
      e.root.destroy({ children: true });
      this.ents.delete(id);
    }
  }

  private float(e: Ent, label: string, color: number) {
    const text = new Text({ text: label, style: { fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 'bold', fill: color, stroke: { color: 0x000000, width: 5 } } });
    text.anchor.set(0.5, 1);
    text.scale.set(1 / this.scale / 1.6);
    text.position.set(e.root.x + TILE / 2, e.root.y);
    this.fxLayer.addChild(text);
    this.floaters.push({ text, life: 1.1 });
  }

  private tick(dt: number) {
    const state = this.state;
    if (!state) return;
    this.pulse += dt;

    // Token movement
    const speed = 9; // tiles per second
    for (const e of this.ents.values()) {
      let budget = speed * dt * Math.max(1, e.path.length / 4);
      while (e.path.length && budget > 0) {
        const next = e.path[0];
        const dx = next.x - e.x, dy = next.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= budget) { e.x = next.x; e.y = next.y; e.path.shift(); budget -= d; }
        else { e.x += (dx / d) * budget; e.y += (dy / d) * budget; budget = 0; }
      }
      e.root.position.set(e.x * TILE, e.y * TILE);
    }

    // Floating numbers
    this.floaters = this.floaters.filter((f) => {
      f.life -= dt;
      f.text.y -= dt * 10;
      f.text.alpha = Math.min(1, f.life * 2);
      if (f.life <= 0) { f.text.destroy(); return false; }
      return true;
    });

    // Overlay: reach, targets, selection, hover
    const g = this.overlay;
    g.clear();
    for (const k of this.opts.reach) {
      const [x, y] = k.split(',').map(Number);
      g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0x64b5f6, alpha: 0.16 });
    }
    const ring = (id: string | null, color: number, alpha: number) => {
      const e = id ? this.ents.get(id) : undefined;
      if (!e || !e.root.visible) return;
      g.rect(e.root.x + 0.5, e.root.y + 0.5, TILE - 1, TILE - 1).stroke({ width: 1, color, alpha });
    };
    const beat = 0.55 + 0.45 * Math.sin(this.pulse * 5);
    for (const id of this.opts.targetIds) ring(id, 0xff5252, beat);
    if (this.opts.activeId && this.opts.activeId !== this.opts.selectedId) ring(this.opts.activeId, 0xffd54f, beat);
    ring(this.opts.selectedId, 0xffffff, 0.9);
    if (this.hover && tileAt(state, this.hover.x, this.hover.y) === '.') {
      g.rect(this.hover.x * TILE + 0.5, this.hover.y * TILE + 0.5, TILE - 1, TILE - 1).stroke({ width: 1, color: 0xd4a857, alpha: 0.8 });
    }

    // Camera follows whoever is acting, or the selected hero.
    const focus = this.ents.get(this.opts.activeId ?? '') ?? this.ents.get(this.opts.selectedId ?? '');
    const focusOk = focus && focus.root.visible;
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const mw = state.map.width * TILE * this.scale, mh = state.map.height * TILE * this.scale;
    let tx = focusOk ? sw / 2 - (focus.x + 0.5) * TILE * this.scale : this.cam.x;
    let ty = focusOk ? sh / 2 - (focus.y + 0.5) * TILE * this.scale : this.cam.y;
    tx = mw <= sw ? (sw - mw) / 2 : Math.min(0, Math.max(sw - mw, tx));
    ty = mh <= sh ? (sh - mh) / 2 : Math.min(0, Math.max(sh - mh, ty));
    if (!this.cam.ready) { this.cam = { x: tx, y: ty, ready: true }; }
    const k = Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.world.position.set(Math.round(this.cam.x), Math.round(this.cam.y));
  }
}

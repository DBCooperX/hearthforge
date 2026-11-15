// PixiJS renderer for the battle map: tiles, tokens, movement tweens and
// floating combat numbers. React owns the UI; this class owns the canvas.
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { GameState } from '../../../shared/types';
import { TILE, packSprites, spriteCanvas } from './sprites';
import { tileWalkable } from '../../../shared/battlemap';
import { inFootprint, lookKey, type MonsterLook } from '../../../shared/monsterLook';
import { monsterCanvas } from './monsterArt';
import { artOfCharacter, heroCanvas } from './heroArt';
import { heroArtKey, type HeroArt } from '../../../shared/heroLook';
import { battleTileName } from './battleTiles';
import { heroSenses, lightLevels, tileAt } from './util';
import { LIGHT_KINDS, perceivedLight } from '../../../shared/light';

interface Ent {
  /** Squares along one side. */
  size: number;
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
  /** Monsters none of the player's heroes can see: drawn as a faint shape in the dark. */
  unseenIds: Set<string>;
  /** Tiles of a planned move that would provoke opportunity attacks, and the enemies that would strike. */
  danger: Set<string>;
  warnIds: Set<string>;
  /** Hero and monster of an open reaction prompt. */
  reaction: { heroId: string; monsterId: string } | null;
}

export const EMPTY_VIEW: ViewOptions = { selectedId: null, activeId: null, reach: new Set(), targetIds: new Set(), myIds: new Set(), unseenIds: new Set(), danger: new Set(), warnIds: new Set(), reaction: null };

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

const heroTextures = new Map<string, Texture>();
function heroTex(art: HeroArt): Texture {
  const k = heroArtKey(art);
  let t = heroTextures.get(k);
  if (!t) {
    t = Texture.from(heroCanvas(art));
    t.source.scaleMode = 'nearest';
    heroTextures.set(k, t);
  }
  return t;
}

const monsterTextures = new Map<string, Texture>();
function monsterTex(look: MonsterLook): Texture {
  const k = lookKey(look);
  let t = monsterTextures.get(k);
  if (!t) {
    t = Texture.from(monsterCanvas(look));
    t.source.scaleMode = 'nearest';
    monsterTextures.set(k, t);
  }
  return t;
}

/** Where a hovered monster's token is on screen, relative to the map element. */
export interface TokenHover { id: string; left: number; top: number; size: number }

export class MapRenderer {
  private app = new Application();
  private world = new Container();
  private tileLayer = new Container();
  private overlay = new Graphics();
  /** Darkness and dim light, seen through the eyes of the selected hero. Redrawn when the state changes. */
  private shade = new Graphics();
  /** Flames and glows, flickering every frame. */
  private glow = new Graphics();
  private entLayer = new Container();
  private fxLayer = new Container();
  private tiles: Sprite[] = [];
  private ents = new Map<string, Ent>();
  private floaters: Floater[] = [];
  private state: GameState | null = null;
  private opts: ViewOptions = EMPTY_VIEW;
  private hover: { x: number; y: number } | null = null;
  private mapKey = '';
  private scale = 3;
  private cam = { x: 0, y: 0, ready: false };
  private pulse = 0;
  private ready = false;
  private destroyed = false;
  onTile: (x: number, y: number) => void = () => {};
  onHoverMonster: (hover: TokenHover | null) => void = () => {};
  private hoverId: string | null = null;

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: host, background: 0x0c0a0e, antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    if (this.destroyed) { this.app.destroy(true); return; }
    host.appendChild(this.app.canvas);
    this.world.addChild(this.tileLayer, this.shade, this.glow, this.overlay, this.entLayer, this.fxLayer);
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    const toTile = (gx: number, gy: number) => {
      const p = this.world.toLocal({ x: gx, y: gy });
      return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
    };
    this.app.stage.on('pointermove', (e) => { this.hover = toTile(e.global.x, e.global.y); this.reportHover(); });
    this.app.stage.on('pointerleave', () => { this.hover = null; this.reportHover(); });
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
        this.tiles[y * state.map.width + x].texture = tex(battleTileName(state.map.biome ?? 'dungeon', tileAt(state, x, y), x, y));
      }
    }

    // Tokens
    const seen = new Set<string>();
    const place = (id: string, kind: 'pc' | 'monster', texture: Texture, x: number, y: number, hp: number, maxHp: number, size = 1) => {
      seen.add(id);
      let e = this.ents.get(id);
      if (!e) {
        const root = new Container();
        const sp = new Sprite(texture);
        sp.anchor.set(0.5);
        if (kind === 'monster') {
          // Monster tokens fill the square (or the block of squares) the creature occupies.
          sp.scale.set((size * TILE) / Math.max(texture.width, texture.height));
          sp.position.set((size * TILE) / 2, size * TILE - sp.height / 2);
        } else {
          // Hero tokens are drawn at twice the tile's resolution and fill their square.
          sp.scale.set(TILE / Math.max(texture.width, texture.height));
          sp.position.set(TILE / 2, TILE - sp.height / 2);
        }
        const bar = new Graphics();
        root.addChild(sp, bar);
        root.position.set(x * TILE, y * TILE);
        this.entLayer.addChild(root);
        e = { root, sprite: sp, bar, path: [], x, y, hp, kind, size };
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
        const w = size * TILE - 4, frac = Math.max(0, Math.min(1, hp / maxHp));
        e.bar.rect(2, -3, w, 2).fill(0x1a1418);
        e.bar.rect(2, -3, Math.max(1, Math.round(w * frac)), 2).fill(kind === 'monster' ? 0xd9534f : frac > 0.5 ? 0x5cb85c : 0xf0ad4e);
      }
      return e;
    };
    for (const c of state.characters) {
      if (c.dead) continue;
      const heroTexture = heroTex(artOfCharacter(c, state.items));
      const e = place(c.id, 'pc', heroTexture, c.x, c.y, c.hp, c.maxHp);
      if (e.sprite.texture !== heroTexture) e.sprite.texture = heroTexture; // gear changed
      const down = c.hp <= 0;
      e.sprite.rotation = down ? Math.PI / 2 : 0;
      e.sprite.tint = c.dead ? 0x555555 : 0xffffff;
      e.root.alpha = down ? 0.75 : 1;
      e.root.zIndex = down ? 0 : 2;
    }
    for (const m of state.monsters) {
      if (!m.alive) continue;
      const e = place(m.id, 'monster', !m.restyled && packSprites.has(m.sprite) ? tex(m.sprite) : monsterTex(m.look), m.x, m.y, m.hp, m.maxHp, m.tiles);
      e.root.zIndex = 1;
      // In the dark, a monster nobody in the party can see is only a shape.
      const unseen = this.opts.unseenIds.has(m.id);
      e.sprite.tint = unseen ? 0x2a2a3a : 0xffffff;
      e.root.alpha = unseen ? 0.55 : 1;
      e.bar.visible = !unseen;
    }
    this.drawShade(state);
    this.entLayer.sortableChildren = true;
    for (const [id, e] of this.ents) {
      if (seen.has(id)) continue;
      // Slain monsters get a last damage number, then vanish.
      if (e.kind === 'monster' && e.hp > 0) this.float(e, `-${e.hp}`, 0xff6b5e);
      e.root.destroy({ children: true });
      this.ents.delete(id);
    }
  }

  /**
   * Darken what is dim or dark. The selected hero's eyes decide: with darkvision, darkness
   * within range shows as a cold grey instead of black, so the player sees how far it reaches.
   */
  private drawShade(state: GameState) {
    const g = this.shade;
    g.clear();
    if (state.phase !== 'combat' || (state.light?.ambient ?? 'bright') === 'bright') return;
    const grid = lightLevels(state);
    const viewer = state.characters.find((c) => c.id === this.opts.selectedId) ?? null;
    const senses = viewer ? heroSenses(viewer) : { darkvision: 0, blindsight: 0 };
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const level = grid[y * state.map.width + x];
        if (level === 'bright') continue;
        const dist = viewer ? Math.max(Math.abs(viewer.x - x), Math.abs(viewer.y - y)) * 5 : 9999;
        const seen = perceivedLight(level, senses, dist);
        const byDarkvision = seen !== level;
        const alpha = seen === 'dark' ? 0.7 : seen === 'dim' ? (byDarkvision ? 0.42 : 0.34) : byDarkvision ? 0.18 : 0;
        if (alpha > 0) g.rect(x * TILE, y * TILE, TILE, TILE).fill({ color: byDarkvision ? 0x1d2026 : 0x05040a, alpha });
      }
    }
  }

  /** Flames on the map and a glow around every carried light, flickering a little. */
  private drawGlow(state: GameState) {
    const g = this.glow;
    g.clear();
    if (state.phase !== 'combat' || (state.light?.ambient ?? 'bright') === 'bright') return;
    for (const [i, src] of (state.light?.sources ?? []).entries()) {
      const k = LIGHT_KINDS[src.kind];
      if (!k) continue;
      const holder = src.holder ? this.ents.get(src.holder) : undefined;
      const px = (holder ? holder.x : src.x) * TILE + TILE / 2, py = (holder ? holder.y : src.y) * TILE + TILE / 2;
      const flick = 0.85 + 0.15 * Math.sin(this.pulse * 9 + i * 1.7) * Math.sin(this.pulse * 5.3 + i);
      const warm = src.kind === 'glow' ? 0x7fd6c8 : 0xffb347;
      const r = Math.max(TILE * 0.8, ((k.bright || k.dim) / 5) * TILE * 0.5);
      g.circle(px, py, r * flick).fill({ color: warm, alpha: 0.07 });
      g.circle(px, py, r * 0.45 * flick).fill({ color: warm, alpha: 0.08 });
      if (holder) {
        g.circle(px + TILE * 0.3, py - TILE * 0.2, 1.6 * flick).fill({ color: 0xffe08a, alpha: 0.95 });
      } else if (src.kind !== 'glow') {
        // A little flame on its sconce, brazier or hearth.
        g.ellipse(px, py + 1, 2.6, 3.6 * flick).fill({ color: 0xff7a1a, alpha: 0.9 });
        g.ellipse(px, py + 1.6, 1.3, 2 * flick).fill({ color: 0xffe08a, alpha: 0.95 });
      } else {
        g.circle(px, py, 1.4 * flick).fill({ color: 0xb8fff0, alpha: 0.8 });
      }
    }
  }

  /** Tells the page which monster the pointer is over, so it can show its card. */
  private reportHover() {
    const h = this.hover;
    const m = h && this.state?.phase === 'combat' ? this.state.monsters.find((o) => o.alive && inFootprint(o, o.tiles, h.x, h.y)) : undefined;
    if ((m?.id ?? null) === this.hoverId) return;
    this.hoverId = m?.id ?? null;
    const unit = TILE * this.scale;
    this.onHoverMonster(m ? { id: m.id, left: this.world.x + m.x * unit, top: this.world.y + m.y * unit, size: m.tiles * unit } : null);
  }

  private float(e: Ent, label: string, color: number) {
    const text = new Text({ text: label, style: { fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 'bold', fill: color, stroke: { color: 0x000000, width: 5 } } });
    text.anchor.set(0.5, 1);
    text.scale.set(1 / this.scale / 1.6);
    text.position.set(e.root.x + (e.size * TILE) / 2, e.root.y);
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

    this.drawGlow(state);

    // Overlay: reach, targets, selection, hover
    const g = this.overlay;
    g.clear();
    for (const k of this.opts.reach) {
      const [x, y] = k.split(',').map(Number);
      g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0x64b5f6, alpha: 0.16 });
    }
    // A planned move that provokes: the path in ember red.
    for (const k of this.opts.danger) {
      const [x, y] = k.split(',').map(Number);
      g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0xff6a3d, alpha: 0.32 });
    }
    const ring = (id: string | null, color: number, alpha: number) => {
      const e = id ? this.ents.get(id) : undefined;
      if (!e || !e.root.visible) return;
      g.rect(e.root.x + 0.5, e.root.y + 0.5, e.size * TILE - 1, e.size * TILE - 1).stroke({ width: 1, color, alpha });
    };
    const beat = 0.55 + 0.45 * Math.sin(this.pulse * 5);
    for (const id of this.opts.targetIds) ring(id, 0xff5252, beat);
    for (const id of this.opts.warnIds) ring(id, 0xff8a3d, beat);
    if (this.opts.reaction) { ring(this.opts.reaction.monsterId, 0xff8a3d, beat); ring(this.opts.reaction.heroId, 0xffd54f, beat); }
    if (this.opts.activeId && this.opts.activeId !== this.opts.selectedId) ring(this.opts.activeId, 0xffd54f, beat);
    ring(this.opts.selectedId, 0xffffff, 0.9);
    if (this.hover && tileWalkable(tileAt(state, this.hover.x, this.hover.y))) {
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

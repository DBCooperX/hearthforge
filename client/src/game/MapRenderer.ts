// PixiJS renderer for the battle map: tiles, tokens, movement tweens, effects and floating combat
// numbers. React owns the UI; this class owns the canvas.
//
// Two views share one model. The flat view draws the map from straight above with round tokens.
// The 2.5D view paints the same flat map (tiles, light, highlights) into a texture, lays it on a
// tilted plane with perspective, and stands every creature on it as a miniature with a base and a
// shadow. Effects and numbers are projected from map coordinates, so they work in both.
import { Application, Container, Graphics, PerspectiveMesh, Rectangle, RenderTexture, Sprite, Text, Texture } from 'pixi.js';
import type { GameState, LogEntry } from '../../../shared/types';
import { TILE, packSprites, spriteCanvas } from './sprites';
import { tileWalkable } from '../../../shared/battlemap';
import { inFootprint, lookKey, type MonsterLook } from '../../../shared/monsterLook';
import { monsterCanvas, monsterFigure, monsterVariant } from './monsterArt';
import { armedFigure, artOfCharacter, baseBoxOf, heroCanvas, heroStanding, offWeaponOf } from './heroArt';
import { onFigureLoaded, paintedFigure } from './paintedFigures';
import { heroArtKey, type HeroArt } from '../../../shared/heroLook';
import { battleTileName } from './battleTiles';
import { paintedGround } from './paintedGround';
import { heroSenses, lightLevels, partyOf, shortName, tileAt } from './util';
import { LIGHT_KINDS, perceivedLight } from '../../../shared/light';
import { GROUND_SQUASH, clampFocus, nearLimit, project, unproject, type TiltCam } from './tilt';
import tableUrl from '../assets/battle-table.webp';
import { Effects, HEAL_COLOR, damageColor, isPhysical, type P3 } from './fx';

/** The ring of a save against something that does no damage: a charm, a poison, a hold. */
const ARCANE = 0xb89cff;

export type BattleView = 'tilt' | 'flat';

interface Stand {
  root: Container;
  shadow: Sprite;
  base: Graphics;
  fig: Sprite;
  bar: Graphics;
  figKey: string;
  /** Height of the figure, in map pixels. */
  figH: number;
}

interface Ent {
  id: string;
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
  /** A brass nameplate under the token, shown while it is the creature's turn. */
  plate: Container | null;
  name: string;
  /** The standing miniature, in the 2.5D view. */
  stand: Stand | null;
  /** The figure's colour from light and visibility, before any hit flash. */
  tint: number;
  unseen: boolean;
  down: boolean;
  /** Seconds left of a red hit flash and of a shake. */
  flash: number;
  shake: number;
  /** Hits still flying towards it: its damage number waits for them to land. */
  incoming: number;
  held: { delta: number; at: number } | null;
  phase: number;
}

interface Floater {
  text: Text;
  life: number;
  p: P3;
  rise: boolean;
}

/** A slain creature's figure or token, fading out once the blows still flying at it have landed. */
interface Dying { node: Container; fig: Sprite | null; ent: Ent; life: number; waited: number }

interface Queued { actor: string | null; run: () => void; since: number }

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
  /** On a touch screen the first tap only plans: the square it picked, and the way there for a move. */
  planned?: { x: number; y: number } | null;
  plannedPath?: Set<string>;
  /** The way to the square the mouse points at, before any click: gold, or ember when it provokes. */
  hoverPath?: Set<string>;
  hoverRisk?: boolean;
  /** The creature pointed at in the initiative bar: lit up on the board so the eye finds it. */
  highlightId?: string | null;
}

export const EMPTY_VIEW: ViewOptions = { selectedId: null, activeId: null, reach: new Set(), targetIds: new Set(), myIds: new Set(), unseenIds: new Set(), danger: new Set(), warnIds: new Set(), reaction: null };

export interface RendererOptions {
  view: BattleView;
  /** 1 shows the whole fight; more comes closer. */
  zoom: number;
  reducedMotion: boolean;
  labels: { miss: string };
  /** The ground as one painted picture, or as the pixel tiles (which art packs can replace). */
  ground?: BattleGround;
}

export type BattleGround = 'painted' | 'pixel';

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

/** Ink-drawn tokens are painted at high resolution and scaled down smoothly, with mipmaps so lines stay clean when zoomed out. */
function smoothTexture(canvas: HTMLCanvasElement): Texture {
  const t = Texture.from({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
  t.source.scaleMode = 'linear';
  return t;
}

const heroTextures = new Map<string, Texture>();
function heroTex(art: HeroArt): Texture {
  const k = heroArtKey(art);
  let t = heroTextures.get(k);
  if (!t) {
    t = smoothTexture(heroCanvas(art));
    heroTextures.set(k, t);
  }
  return t;
}

const monsterTextures = new Map<string, Texture>();
function monsterTex(look: MonsterLook, variant: number): Texture {
  const k = `${lookKey(look)}#${variant}`;
  let t = monsterTextures.get(k);
  if (!t) {
    t = smoothTexture(monsterCanvas(look, variant));
    monsterTextures.set(k, t);
  }
  return t;
}

/** A figure on a transparent canvas, cropped to what is drawn, so its feet sit on the base. */
const figureTextures = new Map<string, Texture>();
/** For a figure with room round it (weapons added), where the figure itself stands inside the texture. */
const texBase = new WeakMap<Texture, { cx: number; bottom: number; w: number; h: number }>();
function figureTex(key: string, make: () => HTMLCanvasElement, pixel = false): Texture {
  let t = figureTextures.get(key);
  if (t) return t;
  const c = make();
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  try {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
  } catch { /* unreadable canvas: use it whole */ }
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
  const base = pixel ? Texture.from(c) : smoothTexture(c);
  if (pixel) base.source.scaleMode = 'nearest';
  t = new Texture({ source: base.source, frame: new Rectangle(x0, y0, x1 - x0 + 1, y1 - y0 + 1) });
  const box = baseBoxOf(c);
  if (box) texBase.set(t, { cx: box.x + box.w / 2 - x0, bottom: box.y + box.h - y0, w: box.w, h: box.h });
  figureTextures.set(key, t);
  return t;
}

/** Size a flat token sprite to its square (or block of squares), standing on the bottom edge. */
function fitToken(sp: Sprite, texture: Texture, kind: 'pc' | 'monster', size: number) {
  sp.texture = texture;
  // Monster tokens fill the square (or the block of squares) the creature occupies; hero tokens are round framed
  // portraits drawn at high resolution and fill their square.
  const side = (kind === 'monster' ? size : 1) * TILE;
  sp.scale.set(side / Math.max(texture.width, texture.height));
  sp.position.set(side / 2, side - sp.height / 2);
}

/**
 * A painted figure as a flat-view token: the figure standing on a small round base in the colours of its side, so it
 * reads as a token from straight above as well.
 */
const flatFigures = new Map<string, Texture>();
function flatFigureTex(id: string, fig: HTMLCanvasElement, kind: 'pc' | 'monster'): Texture {
  const k = `${kind}|${id}`;
  let t = flatFigures.get(k);
  if (t) return t;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rim = kind === 'pc' ? '#c9a45c' : '#a5483a';
  g.save();
  g.translate(S / 2, S * 0.86);
  g.scale(1, 0.42);
  g.beginPath(); g.arc(0, 8, S * 0.4, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill();
  g.beginPath(); g.arc(0, 0, S * 0.4, 0, Math.PI * 2); g.fillStyle = '#2b241d'; g.fill();
  g.lineWidth = 7; g.strokeStyle = rim; g.stroke();
  g.restore();
  const box = baseBoxOf(fig) ?? { x: 0, y: 0, w: fig.width, h: fig.height };
  const k2 = Math.min((S * 0.94) / box.h, (S * 0.94) / box.w);
  // The figure itself keeps its size and place; a weapon may reach past it.
  g.drawImage(fig, S / 2 - (box.x + box.w / 2) * k2, S * 0.9 - (box.y + box.h) * k2, fig.width * k2, fig.height * k2);
  t = smoothTexture(c);
  flatFigures.set(k, t);
  return t;
}

let softTex: Texture | null = null;
/** A soft round blot: shadows. */
function soft(): Texture {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  softTex = Texture.from(c);
  return softTex;
}

let vignetteTex: Texture | null = null;
/** Darker towards the far edge and the corners, a warm key light from the upper left. */
function vignette(): Texture {
  if (vignetteTex) return vignetteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const warm = g.createRadialGradient(70, 40, 0, 70, 40, 200);
  warm.addColorStop(0, 'rgba(255,200,130,0.10)');
  warm.addColorStop(1, 'rgba(255,200,130,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, 256, 256);
  const edge = g.createRadialGradient(128, 150, 70, 128, 150, 190);
  edge.addColorStop(0, 'rgba(6,5,8,0)');
  edge.addColorStop(1, 'rgba(6,5,8,0.62)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 256, 256);
  const far = g.createLinearGradient(0, 0, 0, 256);
  far.addColorStop(0, 'rgba(8,7,10,0.5)');
  far.addColorStop(0.35, 'rgba(8,7,10,0)');
  g.fillStyle = far;
  g.fillRect(0, 0, 256, 256);
  vignetteTex = Texture.from(c);
  return vignetteTex;
}

const mixColor = (a: number, b: number, f: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f) << s;
  return ch(16) | ch(8) | ch(0);
};

/** Where a hovered monster's token is on screen, relative to the map element. */
export interface TokenHover { id: string; left: number; top: number; size: number }

export class MapRenderer {
  private app = new Application();
  private world = new Container();
  private tileLayer = new Container();
  private overlay = new Graphics();
  /** Darkness and dim light, seen through the eyes of the selected hero. Redrawn when the state changes. */
  private shade = new Graphics();
  /** How dark each square looks (0 to 1), for tinting the miniatures that stand on it. */
  private shadeAt: number[] = [];
  /** Flames and glows, flickering every frame. */
  private glow = new Graphics();
  private entLayer = new Container();
  private tiles: Sprite[] = [];
  private ents = new Map<string, Ent>();
  /** Creatures that just left the board, kept a moment so the blow that felled them can still land. */
  private gone = new Map<string, Ent>();
  private floaters: Floater[] = [];
  private floatLayer = new Container();
  private state: GameState | null = null;
  private opts: ViewOptions = EMPTY_VIEW;
  private hover: { x: number; y: number } | null = null;
  private mapKey = '';
  private scale = 3;
  private cam = { x: 0, y: 0, ready: false };
  private pulse = 0;
  private ready = false;
  private destroyed = false;
  private fx: Effects;
  private lastLog: number | null = null;
  /** Where every creature last stood, so a hit still lands where a slain monster fell. */
  private lastPos = new Map<string, P3>();
  private queue: Queued[] = [];
  private queueReady = 0;

  // 2.5D view
  private readonly tilt: boolean;
  private tcam: TiltCam = { fx: 0, fy: 0, k: 3, cx: 0, cy: 0, dist: 18 * TILE };
  private tcamReady = false;
  private slab = new Graphics();
  /** The tavern table the battle board lies on, with its rug, plates, candles and dice. */
  private table: PerspectiveMesh | null = null;
  private tableTex: Texture | null = null;
  private tableCut = -1;
  private ground: PerspectiveMesh | null = null;
  private groundRT: RenderTexture | null = null;
  private rtRes = 0;
  private standLayer = new Container();
  /** Nameplates in the 2.5D view: above every miniature, so a figure in front never hides the name. */
  private plateLayer = new Container();
  private shadeSprite = new Sprite(Texture.EMPTY);
  private dying: Dying[] = [];
  private frame = 0;
  /** Weaker machines: a lighter ground texture, fewer particles. Decided after a few seconds of play. */
  private lite = false;
  private groundKind: BattleGround = 'painted';
  private paintedTex: Texture | null = null;
  private perf = { t: 0, frames: 0 };

  private zoom: number;
  private readonly reduced: boolean;
  private readonly labels: { miss: string };
  // Looking around: the player's own offset from where the camera would look, in map pixels.
  // Pushed by the pointer at the map's edge, by dragging, and by Shift and the arrow keys; it
  // returns to the action when the next creature's turn starts.
  private pan = { x: 0, y: 0 };
  private panTurn: string | null = null;
  private edgeScroll = true;
  private pointer: { x: number; y: number } | null = null;
  private edgeWait = 0;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private dragged = false;
  private keys = { x: 0, y: 0 };
  /** A square was tapped or clicked; `touch` when it came from a finger (or a pen), which plans before it acts. */
  onTile: (x: number, y: number, touch: boolean) => void = () => {};
  /** Two fingers pinched the map: zoom by this factor. */
  onZoom: (factor: number) => void = () => {};
  onHoverMonster: (hover: TokenHover | null) => void = () => {};
  /** The square under the mouse changed (null: off the map). Mouse only; a finger plans with a tap instead. */
  onHoverTile: (tile: { x: number; y: number } | null) => void = () => {};
  private hoverTileKey = '';
  private hoverId: string | null = null;
  private unFigures: () => void = () => {};

  constructor(options: RendererOptions = { view: 'flat', zoom: 1, reducedMotion: false, labels: { miss: 'Miss' } }) {
    this.tilt = options.view === 'tilt';
    this.zoom = options.zoom;
    this.reduced = options.reducedMotion;
    this.labels = options.labels;
    this.groundKind = options.ground ?? 'painted';
    this.fx = new Effects((x, y, h) => this.toScreen(x, y, h), () => (this.tilt ? this.tcam.k : this.scale), this.reduced, false);
  }

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: host, background: 0x0c0a0e, antialias: this.tilt, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    if (this.destroyed) { this.app.destroy(true); return; }
    host.appendChild(this.app.canvas);
    this.world.addChild(this.tileLayer, this.shade, this.glow, this.overlay, this.entLayer);
    if (this.tilt) {
      // The flat map is only painted into the ground texture; the stage shows it tilted.
      this.entLayer.visible = false;
      this.shadeSprite.texture = vignette();
      this.standLayer.sortableChildren = true;
      this.app.stage.addChild(this.slab, this.standLayer, this.shadeSprite, this.plateLayer, this.fx.layer, this.floatLayer);
      const img = new Image();
      img.onload = () => {
        if (this.destroyed) return;
        this.tableTex = Texture.from({ resource: img, autoGenerateMipmaps: true, scaleMode: 'linear' });
      };
      img.src = tableUrl;
    } else {
      this.app.stage.addChild(this.world, this.fx.layer, this.floatLayer);
    }
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointermove', (e) => { if (e.pointerType === 'mouse') { this.hover = this.pick(e.global.x, e.global.y); this.reportHover(); this.reportTile(); } });
    this.app.stage.on('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.hover = null; this.reportHover(); this.reportTile(); } });
    this.app.stage.on('pointertap', (e) => {
      if (this.dragged) { this.dragged = false; return; }
      const t = this.pick(e.global.x, e.global.y);
      // A finger has no hover: the tapped square becomes the "hovered" one, so a monster shows its card.
      const touch = e.pointerType !== 'mouse';
      if (touch) { this.hover = t; this.reportHover(); }
      if (t) this.onTile(t.x, t.y, touch);
    });
    this.listenForPanning(this.app.canvas);
    // A painted figure that finishes loading is swapped in at once.
    this.unFigures = onFigureLoaded(() => { if (this.ready && this.state && !this.destroyed) this.sync(); });
    this.app.ticker.add((ticker) => this.tick(Math.min(0.1, ticker.deltaMS / 1000)));
    this.ready = true;
    if (this.state) this.sync();
  }

  destroy() {
    this.destroyed = true;
    this.unFigures();
    if (this.ready) {
      this.groundRT?.destroy(true);
      this.paintedTex?.destroy(true);
      this.app.destroy(true, { children: true });
    }
  }

  setZoom(z: number) {
    this.zoom = z;
    if (this.ready && this.state) this.sync();
  }

  queuePath(id: string, path: { x: number; y: number }[]) {
    const e = this.ents.get(id);
    if (e) e.path.push(...path);
  }

  update(state: GameState, opts: ViewOptions) {
    const fresh = this.lastLog === null || this.state?.room !== state.room ? [] : state.log.filter((e) => e.id > this.lastLog!);
    this.lastLog = state.log.length ? state.log[state.log.length - 1].id : 0;
    this.state = state;
    this.opts = opts;
    if (state.phase === 'combat') this.effectsFor(fresh, state);
    if (this.ready) this.sync();
  }

  /** Map pixels (and a height) to screen pixels, in whichever view is showing. */
  private toScreen(x: number, y: number, h = 0): { x: number; y: number; s: number } {
    if (this.tilt) return project(this.tcam, x, y, h);
    return { x: this.world.x + x * this.scale, y: this.world.y + (y - h) * this.scale, s: 1 };
  }

  /** The square under a screen point: a miniature counts for the square it stands on. */
  private pick(gx: number, gy: number): { x: number; y: number } | null {
    if (!this.tilt) {
      const p = this.world.toLocal({ x: gx, y: gy });
      return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
    }
    const g = unproject(this.tcam, gx, gy);
    const ground = g ? { x: Math.floor(g.x / TILE), y: Math.floor(g.y / TILE) } : null;
    // A figure stands in front of the squares behind it. Pointing at a monster's figure picks the
    // monster, so it can be attacked by its head. A hero's figure gives way when the square behind it
    // is a free place to move to, so heroes can still step behind each other.
    const groundFree = !!ground && this.opts.reach.has(`${ground.x},${ground.y}`) && ![...this.ents.values()].some((e) => Math.round(e.x) <= ground.x && ground.x < Math.round(e.x) + e.size && Math.round(e.y) <= ground.y && ground.y < Math.round(e.y) + e.size);
    const order = [...this.ents.values()].filter((e) => e.stand && e.stand.root.visible).sort((a, b) => b.stand!.root.zIndex - a.stand!.root.zIndex);
    for (const e of order) {
      if (e.kind === 'pc' && groundFree) continue;
      const b = e.stand!.fig.getBounds();
      const shrink = b.width * 0.12;
      if (gx >= b.x + shrink && gx <= b.x + b.width - shrink && gy >= b.y + b.height * 0.04 && gy <= b.y + b.height) return { x: Math.round(e.x), y: Math.round(e.y) };
    }
    return ground;
  }

  private buildTiles(state: GameState) {
    this.tileLayer.removeChildren().forEach((c) => c.destroy());
    this.paintedTex?.destroy(true);
    this.paintedTex = null;
    this.tiles = [];
    if (this.groundKind === 'painted') {
      const S = this.lite ? 40 : 64;
      const pic = paintedGround(state.map.rows, state.map.biome ?? 'dungeon', S);
      this.paintedTex = Texture.from({ resource: pic, autoGenerateMipmaps: true, scaleMode: 'linear' });
      const s = new Sprite(this.paintedTex);
      s.scale.set(TILE / S);
      this.tileLayer.addChild(s);
    }
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const s = new Sprite(tex('floor0'));
        s.anchor.set(0.5);
        s.position.set(x * TILE + TILE / 2, y * TILE + TILE / 2);
        s.visible = this.groundKind === 'pixel';
        this.tileLayer.addChild(s);
        this.tiles.push(s);
      }
    }
    for (const e of this.ents.values()) { e.root.destroy({ children: true }); e.stand?.root.destroy({ children: true }); if (e.plate && !e.plate.destroyed) e.plate.destroy({ children: true }); }
    this.ents.clear();
    for (const d of this.dying) d.node.destroy({ children: true });
    this.dying = [];
    this.gone.clear();
    this.cam.ready = false;
    this.tcamReady = false;
  }

  /** How far the camera is from the map: "the whole fight fits", times the player's zoom. */
  private fitScale(state: GameState): number {
    const w = this.app.screen.width, h = this.app.screen.height;
    if (this.tilt) return Math.min(w / (state.map.width * TILE), h / (state.map.height * TILE * GROUND_SQUASH)) * 0.94;
    return Math.min(w / (state.map.width * TILE), h / (state.map.height * TILE));
  }

  private sync() {
    const state = this.state!;
    const mk = `${state.room}:${state.map.rows.join('')}`;
    if (mk !== this.mapKey) { this.mapKey = mk; this.buildTiles(state); }
    const fit = this.fitScale(state);
    if (this.tilt) {
      this.tcam.k = Math.max(1.2, Math.min(8, fit * this.zoom));
    } else {
      // Quarter steps keep the pixel-art tiles fairly crisp.
      this.scale = Math.max(1.5, Math.min(7, Math.floor(fit * this.zoom * 4) / 4));
      this.world.scale.set(this.scale);
    }

    // Tiles
    if (this.groundKind === 'pixel') for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        this.tiles[y * state.map.width + x].texture = tex(battleTileName(state.map.biome ?? 'dungeon', tileAt(state, x, y), x, y));
      }
    }
    this.drawShade(state);

    // Tokens
    const seen = new Set<string>();
    const place = (id: string, kind: 'pc' | 'monster', name: string, texture: Texture, x: number, y: number, hp: number, maxHp: number, size = 1) => {
      seen.add(id);
      let e = this.ents.get(id);
      if (!e) {
        const root = new Container();
        const sp = new Sprite(texture);
        sp.anchor.set(0.5);
        fitToken(sp, texture, kind, size);
        const bar = new Graphics();
        root.addChild(sp, bar);
        root.position.set(x * TILE, y * TILE);
        this.entLayer.addChild(root);
        e = { id, root, sprite: sp, bar, path: [], x, y, hp, kind, size, plate: null, name, stand: null, tint: 0xffffff, unseen: false, down: false, flash: 0, shake: 0, incoming: 0, held: null, phase: Math.random() * 6 };
        this.ents.set(id, e);
      } else if (e.sprite.texture !== texture) {
        // The gear changed, or a painted figure has arrived.
        fitToken(e.sprite, texture, kind, size);
      }
      if (hp !== e.hp) {
        this.hpChanged(e, hp - e.hp);
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
      this.lastPos.set(id, { x: (x + size / 2) * TILE, y: (y + size / 2) * TILE, h: 0 });
      return e;
    };
    for (const c of partyOf(state)) {
      if (c.dead) continue;
      const art = artOfCharacter(c, state.items);
      // The painting is fixed, so the weapon and shield the hero holds now are drawn onto it.
      const off = offWeaponOf(c, state.items);
      const base = paintedFigure(c.figureId);
      const figKey = `${c.figureId}|${art.gear.weapon}|${art.gear.shield ? 1 : 0}|${off}`;
      const painted = base && c.figureId ? armedFigure(c.figureId, base, art, off) : null;
      const heroTexture = painted ? flatFigureTex(figKey, painted, 'pc') : heroTex(art);
      const e = place(c.id, 'pc', c.name, heroTexture, c.x, c.y, c.hp, c.maxHp);
      const down = c.hp <= 0;
      e.down = down;
      e.sprite.rotation = down ? Math.PI / 2 : 0;
      e.sprite.tint = c.dead ? 0x555555 : 0xffffff;
      e.root.alpha = down ? 0.75 : 1;
      e.root.zIndex = down ? 0 : 2;
      if (this.tilt) {
        const key = painted ? `f|${figKey}` : `h|${heroArtKey(art)}`;
        this.standFor(e, key, () => figureTex(key, () => painted ?? heroStanding(art)), c.maxHp, false);
      }
    }
    for (const m of state.monsters) {
      if (!m.alive) continue;
      const painted = paintedFigure(m.look.imageId);
      const pack = !painted && !m.restyled && packSprites.has(m.sprite);
      const variant = monsterVariant(m.id);
      const flat = painted && m.look.imageId ? flatFigureTex(m.look.imageId, painted, 'monster') : pack ? tex(m.sprite) : monsterTex(m.look, variant);
      const e = place(m.id, 'monster', m.name, flat, m.x, m.y, m.hp, m.maxHp, m.tiles);
      e.root.zIndex = 1;
      // In the dark, a monster nobody in the party can see is only a shape.
      const unseen = this.opts.unseenIds.has(m.id);
      e.unseen = unseen;
      e.sprite.tint = unseen ? 0x2a2a3a : 0xffffff;
      e.root.alpha = unseen ? 0.55 : 1;
      e.bar.visible = !unseen;
      if (this.tilt) {
        const key = painted ? `f|${m.look.imageId}` : pack ? `p|${m.sprite}` : `m|${lookKey(m.look)}#${variant}`;
        this.standFor(e, key, () => figureTex(key, () => (painted ?? (pack ? spriteCanvas(m.sprite) : monsterFigure(m.look, variant))), pack), m.maxHp, pack);
      }
    }
    for (const [id, e] of this.ents) this.showPlate(e, seen.has(id) && id === this.opts.activeId && !e.unseen);
    this.entLayer.sortableChildren = true;
    for (const [id, e] of this.ents) {
      if (seen.has(id)) continue;
      // Slain monsters get a last damage number, then vanish.
      if (e.kind === 'monster' && e.hp > 0) this.hpChanged(e, -e.hp);
      if (e.plate) { e.plate.visible = false; if (e.plate.parent === this.plateLayer) { e.plate.destroy({ children: true }); e.plate = null; } }
      if (this.reduced && e.incoming === 0) {
        e.stand?.root.destroy({ children: true });
        e.root.destroy({ children: true });
      } else if (e.stand) {
        e.stand.bar.clear();
        this.dying.push({ node: e.stand.root, fig: e.stand.fig, ent: e, life: 0.9, waited: 0 });
        e.root.destroy({ children: true });
      } else {
        e.bar.visible = false;
        this.dying.push({ node: e.root, fig: e.sprite, ent: e, life: 0.9, waited: 0 });
      }
      this.ents.delete(id);
      this.gone.set(id, e);
    }
  }

  /** Make or refresh the miniature for a creature in the 2.5D view. */
  private standFor(e: Ent, key: string, texture: () => Texture, maxHp: number, pixel: boolean) {
    let s = e.stand;
    if (!s || s.figKey !== key) {
      const t = texture();
      if (!s) {
        const root = new Container();
        const shadow = new Sprite(soft());
        shadow.anchor.set(0.5);
        const base = new Graphics();
        const fig = new Sprite(t);
        fig.anchor.set(0.5, 1);
        const bar = new Graphics();
        root.addChild(shadow, base, fig, bar);
        this.standLayer.addChild(root);
        s = { root, shadow, base, fig, bar, figKey: key, figH: TILE };
        e.stand = s;
      }
      s.fig.texture = t;
      s.figKey = key;
      // Heroes stand about one and a half squares tall; a monster fills its squares, as tall as its shape asks.
      // A hero with a weapon drawn on has room round the painting: the size follows the painting, not that room.
      const tb = texBase.get(t);
      const bw = tb?.w ?? t.width, bh = tb?.h ?? t.height;
      s.fig.anchor.set(tb ? tb.cx / t.width : 0.5, tb ? tb.bottom / t.height : 1);
      const aspect = bw / Math.max(1, bh);
      const r = (e.size * TILE) / 2;
      let w: number, h: number;
      if (e.kind === 'pc') { h = TILE * 1.75; w = h * aspect; if (w > TILE * 1.4) { w = TILE * 1.4; h = w / aspect; } }
      else {
        w = e.size * TILE * (pixel ? 0.9 : 1.02); h = w / aspect;
        const cap = e.size * TILE * 1.7;
        if (h > cap) { h = cap; w = h * aspect; }
      }
      s.fig.width = (w / bw) * t.width;
      s.fig.height = (h / bh) * t.height;
      s.figH = h;
      s.fig.position.set(0, r * GROUND_SQUASH * 0.25);
      const rim = e.kind === 'pc' ? 0xc9a45c : 0xa5483a;
      s.base.clear();
      s.base.ellipse(0, 1.6, r * 0.8, r * 0.8 * GROUND_SQUASH).fill(0x0e0b09);
      s.base.ellipse(0, 0, r * 0.8, r * 0.8 * GROUND_SQUASH).fill(0x2b241d).stroke({ width: 1.1, color: rim, alpha: 0.95 });
      s.base.ellipse(0, -0.4, r * 0.62, r * 0.62 * GROUND_SQUASH).stroke({ width: 0.5, color: 0xffffff, alpha: 0.08 });
      s.shadow.width = r * 2.4;
      s.shadow.height = r * 2.4 * GROUND_SQUASH * 0.85;
      s.shadow.position.set(r * 0.28, r * 0.16 * GROUND_SQUASH);
    }
    // Lying down when at 0 hit points.
    if (e.down) { s.fig.rotation = -Math.PI / 2; s.fig.position.set(s.figH * 0.45, -2); }
    else { s.fig.rotation = 0; s.fig.position.set(0, ((e.size * TILE) / 2) * GROUND_SQUASH * 0.25); }
    s.root.alpha = e.unseen ? 0.5 : e.down ? 0.8 : 1;
    s.base.visible = s.shadow.visible = !e.unseen;
    const shadeIdx = Math.round(e.y) * (this.state?.map.width ?? 0) + Math.round(e.x);
    const dark = this.shadeAt[shadeIdx] ?? 0;
    e.tint = e.unseen ? 0x2a2a3a : mixColor(0xffffff, 0x2a2c38, Math.min(0.85, dark));
    // Health bar over the head: always for monsters, for heroes once hurt.
    const hpNow = e.hp;
    s.bar.clear();
    s.bar.visible = !e.unseen && hpNow > 0 && (e.kind === 'monster' || hpNow < maxHp);
    if (s.bar.visible) {
      const w = Math.max(10, e.size * TILE * 0.8), frac = Math.max(0, Math.min(1, hpNow / maxHp)), top = -s.figH - 4.5;
      s.bar.roundRect(-w / 2 - 0.6, top - 0.6, w + 1.2, 2.8, 1).fill({ color: 0x0b0908, alpha: 0.85 });
      s.bar.roundRect(-w / 2, top, Math.max(0.8, w * frac), 1.6, 0.8).fill(e.kind === 'monster' ? 0xd9534f : frac > 0.5 ? 0x5cb85c : 0xf0ad4e);
    }
  }

  /**
   * Darken what is dim or dark. The selected hero's eyes decide: with darkvision, darkness
   * within range shows as a cold grey instead of black, so the player sees how far it reaches.
   */
  private drawShade(state: GameState) {
    const g = this.shade;
    g.clear();
    this.shadeAt = [];
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
        this.shadeAt[y * state.map.width + x] = alpha;
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
      const flick = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(this.pulse * 9 + i * 1.7) * Math.sin(this.pulse * 5.3 + i);
      const warm = src.kind === 'glow' ? 0x7fd6c8 : 0xffb347;
      const r = Math.max(TILE * 0.8, ((k.bright || k.dim) / 5) * TILE * 0.5);
      g.circle(px, py, r * flick).fill({ color: warm, alpha: 0.07 });
      g.circle(px, py, r * 0.45 * flick).fill({ color: warm, alpha: 0.08 });
      if (holder) {
        if (!this.tilt) g.circle(px + TILE * 0.3, py - TILE * 0.2, 1.6 * flick).fill({ color: 0xffe08a, alpha: 0.95 });
      } else if (src.kind !== 'glow') {
        // A little flame on its sconce, brazier or hearth.
        g.ellipse(px, py + 1, 2.6, 3.6 * flick).fill({ color: 0xff7a1a, alpha: 0.9 });
        g.ellipse(px, py + 1.6, 1.3, 2 * flick).fill({ color: 0xffe08a, alpha: 0.95 });
      } else {
        g.circle(px, py, 1.4 * flick).fill({ color: 0xb8fff0, alpha: 0.8 });
      }
    }
  }

  /** Where a token is drawn right now, in pixels from the map's top left; null when it is not on the map. */
  tokenRect(id: string): { left: number; top: number; size: number } | null {
    const e = this.ents.get(id);
    if (!e || !this.ready || e.root.destroyed) return null;
    if (this.tilt) {
      const s = e.stand;
      if (!s || s.root.destroyed) return null;
      const unit = TILE * s.root.scale.x;
      const size = e.size * unit;
      // The status row sits just above the health bar over the head.
      const head = s.root.y + (-s.figH - 6) * s.root.scale.y;
      return { left: s.root.x - size / 2, top: head + size * 0.12, size };
    }
    const unit = TILE * this.scale;
    return { left: this.world.x + e.x * unit, top: this.world.y + e.y * unit, size: e.size * unit };
  }

  private reportTile() {
    const h = this.hover;
    const k = h ? `${h.x},${h.y}` : '';
    if (k === this.hoverTileKey) return;
    this.hoverTileKey = k;
    this.onHoverTile(h ? { x: h.x, y: h.y } : null);
  }

  /** Tells the page which monster the pointer is over, so it can show its card. */
  private reportHover() {
    const h = this.hover;
    const m = h && this.state?.phase === 'combat' ? this.state.monsters.find((o) => o.alive && inFootprint(o, o.tiles, h.x, h.y)) : undefined;
    if ((m?.id ?? null) === this.hoverId) return;
    this.hoverId = m?.id ?? null;
    if (!m) { this.onHoverMonster(null); return; }
    if (this.tilt) {
      const e = this.ents.get(m.id);
      const b = e?.stand?.fig.getBounds();
      if (b) { this.onHoverMonster({ id: m.id, left: b.x, top: b.y, size: Math.max(b.width, b.height) }); return; }
    }
    const unit = TILE * this.scale;
    this.onHoverMonster({ id: m.id, left: this.world.x + m.x * unit, top: this.world.y + m.y * unit, size: m.tiles * unit });
  }

  /** The nameplate: the creature's name on a small brass plate under its token. */
  private showPlate(e: Ent, on: boolean) {
    if (!on) { if (e.plate) e.plate.visible = false; return; }
    if (!e.plate) {
      const plate = new Container();
      const text = new Text({ text: shortName(e.name, 14), style: { fontFamily: 'Cinzel, Georgia, serif', fontSize: 26, fontWeight: '700', fill: 0x2a1a08, letterSpacing: 1 } });
      text.anchor.set(0.5, 0.5);
      const w = text.width + 26, h = text.height + 8;
      const g = new Graphics();
      g.roundRect(-w / 2, -h / 2, w, h, 6).fill(0x3a2410);
      g.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 5).fill(0xd9b061);
      g.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, (h - 4) / 2, 5).fill({ color: 0xf6dc96, alpha: 0.45 });
      for (const sx of [-1, 1]) g.circle(sx * (w / 2 - 8), 0, 2.5).fill(0x6a4a1c);
      plate.addChild(g, text);
      (this.tilt ? this.plateLayer : e.root).addChild(plate);
      e.plate = plate;
    }
    if (this.tilt) {
      // On the front rim of the miniature's base; placed with the miniature each frame.
      if (!e.stand) { e.plate.visible = false; return; }
    } else {
      // Sits on the bottom rim of the token's frame, like the plate on a miniature's base.
      e.plate.scale.set(1 / this.scale / 2.2);
      e.plate.position.set((e.size * TILE) / 2, e.size * TILE - 1);
      e.root.zIndex = 5;
    }
    e.plate.visible = true;
  }

  /** Hit points went up or down: a number, a flash, motes for healing. Waits while a hit is still flying in. */
  private hpChanged(e: Ent, delta: number) {
    if (delta === 0) return;
    if (delta < 0 && e.incoming > 0) {
      e.held = { delta: (e.held?.delta ?? 0) + delta, at: this.pulse };
      return;
    }
    this.showHp(e, delta);
  }

  private showHp(e: Ent, delta: number) {
    const at = this.center(e, this.tilt ? (e.stand?.figH ?? TILE) * 1.05 : 0);
    this.float(at, delta < 0 ? `${delta}` : `+${delta}`, delta < 0 ? 0xff6b5e : 0x7be08a);
    if (delta < 0) { e.flash = 0.32; if (!this.reduced) e.shake = 0.28; }
    else this.fx.motes(this.center(e, 0), HEAL_COLOR, (e.size * TILE) / 2);
  }

  /** The middle of a creature's squares on the ground, lifted by h. */
  private center(e: Ent, h: number): P3 {
    return { x: (e.x + e.size / 2) * TILE, y: (e.y + e.size / 2) * TILE, h };
  }

  /** The point where a creature is hit: its chest, or the middle of a flat token. */
  private chest(id: string): P3 | null {
    const e = this.ents.get(id) ?? this.gone.get(id);
    if (e) return this.center(e, this.tilt ? (e.stand?.figH ?? TILE) * (e.down ? 0.15 : 0.55) : 0);
    const p = this.lastPos.get(id);
    return p ? { ...p, h: this.tilt ? TILE * 0.6 : 0 } : null;
  }

  /** Attacks and spells in the new log lines, as effects that play one after another. */
  private effectsFor(fresh: LogEntry[], state: GameState) {
    if (!fresh.length) return;
    const wasIdle = this.queue.length === 0;
    const byName = new Map<string, string>();
    // The living win over a fallen creature that had the same name.
    for (const m of [...state.monsters].sort((a, b) => Number(a.alive) - Number(b.alive))) byName.set(m.name, m.id);
    for (const c of partyOf(state)) byName.set(c.name, c.id);
    for (const entry of fresh) {
      const r = entry.roll;
      if (!r) continue;
      const actor = byName.get(r.actor) ?? null;
      if (r.target.kind === 'AC' && r.target.name) {
        const target = byName.get(r.target.name);
        if (!actor || !target) continue;
        const hit = r.outcome === 'hit' || r.outcome === 'crit';
        const t = this.ents.get(target);
        if (hit && t) t.incoming++;
        this.queue.push({ actor, since: this.pulse, run: () => this.attack(actor, target, hit, r.outcome === 'crit', r.damage?.type, hit ? t : undefined) });
      } else if (r.target.kind === 'DC' && actor) {
        // Something that forces a save (a spell, a breath, a poison): it blooms around whoever had
        // to save. With no damage to it, the ring is a faint arcane one.
        const failed = r.outcome === 'failure';
        const type = r.damage?.type;
        const color = type ? damageColor(type) : ARCANE;
        const t = r.damage ? this.ents.get(actor) : undefined;
        if (t) t.incoming++;
        this.queue.push({ actor: null, since: this.pulse, run: () => {
          const p = this.chest(actor);
          if (p) {
            this.fx.ring({ ...p, h: 0 }, color, TILE * (type ? 0.9 : 0.7));
            if (failed && type) this.fx.impact(p, color);
          }
          if (t) this.landed(t);
        } });
      }
    }
    // The dice in the story tumble for a moment first: the blow lands when they settle.
    if (wasIdle && this.queue.length) this.queueReady = Math.max(this.queueReady, this.pulse + 0.6);
  }

  /** One of the hits flying at a creature arrived: once all have, its damage shows. */
  private landed(t: Ent) {
    t.incoming = Math.max(0, t.incoming - 1);
    if (t.incoming === 0 && t.held) { this.showHp(t, t.held.delta); t.held = null; }
  }

  private attack(actorId: string, targetId: string, hit: boolean, crit: boolean, type: string | undefined, counted?: Ent) {
    const from = this.chest(actorId), to = this.chest(targetId);
    // The creature as it was when the blow was struck: it may have fallen and left the board since.
    const t = counted ?? this.ents.get(targetId) ?? this.gone.get(targetId);
    const land = () => { if (counted) this.landed(counted); };
    if (!from || !to) { land(); return; }
    const a = this.ents.get(actorId);
    const reach = a && t ? Math.max(Math.abs(a.x - t.x) - (a.x < t.x ? a.size - 1 : t.size - 1), Math.abs(a.y - t.y) - (a.y < t.y ? a.size - 1 : t.size - 1)) : 1;
    const color = damageColor(type);
    const physical = isPhysical(type);
    const struck = () => {
      if (hit) { this.fx.impact(to, color, crit); land(); }
      else {
        // A miss flies or swings past.
        this.float({ ...to, h: to.h + TILE * 0.6 }, this.labels.miss, 0xd8d0c4);
        this.fx.sparks({ x: to.x + (to.x - from.x) * 0.3, y: to.y + (to.y - from.y) * 0.3, h: to.h }, 0x9a958c, 4, 18);
      }
    };
    if (reach <= 1.01 && physical) {
      if (hit) this.fx.slash(to, color === 0xfff1d6 ? 0xffe6c0 : color, TILE * 0.55 * (t?.size ?? 1));
      struck();
    } else {
      const aim = hit ? to : { x: to.x + (to.x - from.x) * 0.25 + 4, y: to.y + (to.y - from.y) * 0.25, h: to.h + 3 };
      this.fx.bolt(from, aim, physical ? 0xf3e6c8 : color, physical, struck);
    }
  }

  private float(p: P3, label: string, color: number) {
    const text = new Text({ text: label, style: { fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 'bold', fill: color, stroke: { color: 0x000000, width: 5 } } });
    text.anchor.set(0.5, 1);
    text.resolution = 2;
    this.floatLayer.addChild(text);
    this.floaters.push({ text, life: 1.1, p: { ...p }, rise: !this.reduced });
  }

  private tick(dt: number) {
    const state = this.state;
    if (!state) return;
    this.pulse += dt;
    this.frame++;
    this.watchPerformance(dt);

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

    // Queued effects: each waits for its attacker to finish walking.
    const head = this.queue[0];
    if (head && this.pulse >= this.queueReady) {
      const walking = head.actor ? (this.ents.get(head.actor)?.path.length ?? 0) > 0 : false;
      if (!walking || this.pulse - head.since > 2.5) {
        this.queue.shift();
        head.run();
        this.queueReady = this.pulse + (this.reduced ? 0.05 : 0.28);
      }
    }
    // Damage held for a hit that never arrived shows anyway.
    for (const e of [...this.ents.values(), ...this.gone.values()]) if (e.held && this.pulse - e.held.at > 3) { e.incoming = 0; this.showHp(e, e.held.delta); e.held = null; }

    this.drawGlow(state);
    this.drawOverlay(state);

    if (this.tilt) this.tickTilt(dt, state);
    else this.tickFlat(dt, state);

    this.fx.tick(dt);
    // The fallen stand until the blow that felled them lands, then fade into the floor.
    this.dying = this.dying.filter((d) => {
      if (d.ent.incoming > 0 && d.waited < 3) { d.waited += dt; return true; }
      d.life -= dt;
      if (d.life <= 0) {
        d.node.destroy({ children: true });
        if (this.gone.get(d.ent.id) === d.ent) this.gone.delete(d.ent.id);
        return false;
      }
      const f = Math.min(1, d.life / 0.6);
      d.node.alpha = f;
      if (d.fig) d.fig.tint = mixColor(0xffffff, 0x3a2a2a, 1 - f);
      if (d.fig && d.node !== d.ent.root) d.fig.y += dt * 6 * (1 - f);
      return true;
    });

    // Floating numbers
    const k = this.tilt ? this.tcam.k : this.scale;
    this.floaters = this.floaters.filter((f) => {
      f.life -= dt;
      if (f.rise) f.p.h += dt * 10;
      const s = this.toScreen(f.p.x, f.p.y, f.p.h);
      f.text.position.set(s.x, s.y);
      f.text.scale.set(Math.max(0.45, Math.min(0.9, (k * s.s) / 5.5)));
      f.text.alpha = Math.min(1, f.life * 2);
      if (f.life <= 0) { f.text.destroy(); return false; }
      return true;
    });
  }

  /** Reach, targets, selection, hover: drawn on the map's ground. */
  private drawOverlay(state: GameState) {
    const g = this.overlay;
    g.clear();
    for (const k of this.opts.reach) {
      const [x, y] = k.split(',').map(Number);
      g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0x64b5f6, alpha: this.tilt ? 0.22 : 0.16 });
    }
    // A planned move that provokes: the path in ember red.
    for (const k of this.opts.danger) {
      const [x, y] = k.split(',').map(Number);
      g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0xff6a3d, alpha: 0.32 });
    }
    const ring = (id: string | null, color: number, alpha: number) => {
      const e = id ? this.ents.get(id) : undefined;
      if (!e || !e.root.visible) return;
      if (this.tilt) {
        // A ring on the floor around the miniature's base.
        const r = (e.size * TILE) / 2;
        g.circle(e.root.x + r, e.root.y + r, r * 0.95).stroke({ width: 1.2, color, alpha });
      } else g.rect(e.root.x + 0.5, e.root.y + 0.5, e.size * TILE - 1, e.size * TILE - 1).stroke({ width: 1, color, alpha });
    };
    const beat = this.reduced ? 0.85 : 0.55 + 0.45 * Math.sin(this.pulse * 5);
    for (const id of this.opts.targetIds) ring(id, 0xff5252, beat);
    for (const id of this.opts.warnIds) ring(id, 0xff8a3d, beat);
    if (this.opts.reaction) { ring(this.opts.reaction.monsterId, 0xff8a3d, beat); ring(this.opts.reaction.heroId, 0xffd54f, beat); }
    if (this.opts.activeId && this.opts.activeId !== this.opts.selectedId) ring(this.opts.activeId, 0xffd54f, beat);
    ring(this.opts.selectedId, 0xffffff, 0.9);
    const lit = this.opts.highlightId ? this.ents.get(this.opts.highlightId) : undefined;
    if (lit && lit.root.visible) {
      const r = (lit.size * TILE) / 2;
      const foe = lit.kind === 'monster';
      const color = foe ? 0xff6a5a : 0x9fe0a0;
      if (this.tilt) {
        g.circle(lit.root.x + r, lit.root.y + r, r * 1.05).fill({ color, alpha: 0.28 }).stroke({ width: 2.4, color, alpha: 0.95 });
      } else g.rect(lit.root.x - 0.5, lit.root.y - 0.5, lit.size * TILE + 1, lit.size * TILE + 1).fill({ color, alpha: 0.22 }).stroke({ width: 2, color, alpha: 0.95 });
    }
    if (this.hover && tileWalkable(tileAt(state, this.hover.x, this.hover.y))) {
      g.rect(this.hover.x * TILE + 0.5, this.hover.y * TILE + 0.5, TILE - 1, TILE - 1).stroke({ width: 1, color: 0xd4a857, alpha: 0.8 });
    }
    // A move planned with a tap: the way there in gold, and the square itself framed, until a second tap goes.
    for (const k of this.opts.plannedPath ?? []) {
      const [x, y] = k.split(',').map(Number);
      g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0xf2c14e, alpha: 0.3 });
    }
    // Pointing at a square: the way there, step by step, before the click.
    for (const k of this.opts.hoverPath ?? []) {
      const [x, y] = k.split(',').map(Number);
      g.circle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.13).fill({ color: this.opts.hoverRisk ? 0xff6a3d : 0xf2c14e, alpha: 0.9 });
    }
    const p = this.opts.planned;
    if (p) g.rect(p.x * TILE + 1, p.y * TILE + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: 0xffd27a, alpha: beat });
  }

  private focus(): Ent | undefined {
    const f = this.ents.get(this.opts.activeId ?? '') ?? this.ents.get(this.opts.selectedId ?? '');
    return f && f.root.visible ? f : undefined;
  }

  /**
   * Where the camera looks, in map squares: whoever is acting, and as much of the way towards the
   * nearest foe they can see as the zoom allows, so a close view still shows who they are fighting.
   * `halfW`/`halfH` are half the visible area, in squares.
   */
  private focusPoint(halfW: number, halfH: number): { x: number; y: number } | null {
    const f = this.focus();
    if (!f) return null;
    const cx = f.x + f.size / 2, cy = f.y + f.size / 2;
    let best: { x: number; y: number; d: number } | null = null;
    for (const e of this.ents.values()) {
      if (e.kind === f.kind || e.unseen || e.down) continue;
      const ex = e.x + e.size / 2, ey = e.y + e.size / 2, d = Math.hypot(ex - cx, ey - cy);
      if (!best || d < best.d) best = { x: ex, y: ey, d };
    }
    if (!best) return { x: cx, y: cy };
    // Both fit: look between them. Otherwise keep the actor a square and a half inside the edge, facing the foe.
    const toward = (from: number, to: number, half: number) => {
      const room = Math.max(0, half - 1.5), d = to - from;
      return Math.abs(d) <= room * 2 ? from + d / 2 : from + Math.sign(d) * room;
    };
    return { x: toward(cx, best.x, halfW), y: toward(cy, best.y, halfH) };
  }

  /** Edge scrolling on or off (a setting of the player's). */
  /** Switches between the painted ground and the pixel tiles. */
  setGround(kind: BattleGround) {
    if (kind === this.groundKind) return;
    this.groundKind = kind;
    this.mapKey = '';
    if (this.ready && this.state) this.sync();
  }

  setEdgeScroll(on: boolean) { this.edgeScroll = on; if (!on) this.edgeWait = 0; }

  /** Which way the keys push the camera: -1, 0 or 1 on each axis. */
  setKeyPan(x: number, y: number) { this.keys = { x, y }; }

  /** Back to whoever is acting. */
  recenter() { this.pan = { x: 0, y: 0 }; }

  private listenForPanning(canvas: HTMLCanvasElement) {
    const at = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    // Fingers on the map, for pinching: two of them zoom, and nothing they do counts as a tap.
    const fingers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    canvas.addEventListener('pointermove', (e) => {
      const p = at(e);
      this.pointer = e.pointerType === 'mouse' ? p : null;
      if (fingers.has(e.pointerId)) fingers.set(e.pointerId, p);
      if (pinch && fingers.size === 2) {
        const now = spread();
        if (now > 0 && Math.abs(now / pinch - 1) > 0.03) { this.onZoom(now / pinch); pinch = now; }
        return;
      }
      const d = this.drag;
      if (!d) return;
      const dx = p.x - d.x, dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      this.dragged = true;
      d.x = p.x; d.y = p.y;
      canvas.style.cursor = 'grabbing';
      this.panBy(-dx, -dy, true);
    });
    canvas.addEventListener('pointerleave', () => { this.pointer = null; this.edgeWait = 0; });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const p = at(e);
      if (e.pointerType !== 'mouse') {
        fingers.set(e.pointerId, p);
        if (fingers.size === 2) { pinch = spread(); this.drag = null; this.dragged = true; return; }
      }
      this.drag = { ...p, moved: false };
      this.dragged = false;
      if (e.button === 1) e.preventDefault();
    });
    const end = (e: PointerEvent) => {
      fingers.delete(e.pointerId);
      if (fingers.size < 2) pinch = 0;
      this.drag = null;
      canvas.style.cursor = '';
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Move the view by a distance in screen pixels; `now` skips the camera's easing (for dragging). */
  private panBy(sx: number, sy: number, now: boolean) {
    if (this.tilt) {
      const k = this.tcam.k;
      const dx = sx / k, dy = sy / (k * GROUND_SQUASH);
      this.pan.x += dx; this.pan.y += dy;
      if (now) { this.tcam.fx += dx; this.tcam.fy += dy; }
    } else {
      this.pan.x += sx / this.scale; this.pan.y += sy / this.scale;
      if (now) { this.cam.x -= sx; this.cam.y -= sy; }
    }
  }

  /** The pointer near an edge of the map, or Shift and the arrow keys, push the view that way. */
  private looseLook(dt: number) {
    const active = this.opts.activeId;
    if (active !== this.panTurn) { this.panTurn = active; this.pan = { x: 0, y: 0 }; }
    let vx = this.keys.x, vy = this.keys.y;
    const p = this.pointer;
    if (this.edgeScroll && p && !this.drag) {
      const w = this.app.screen.width, h = this.app.screen.height, E = Math.min(48, w * 0.06);
      const ex = p.x < E ? -(1 - p.x / E) : p.x > w - E ? 1 - (w - p.x) / E : 0;
      const ey = p.y < E ? -(1 - p.y / E) : p.y > h - E ? 1 - (h - p.y) / E : 0;
      // A short wait, so crossing the edge on the way to the hotbar does not move anything.
      if (ex || ey) this.edgeWait += dt; else this.edgeWait = 0;
      if (this.edgeWait > 0.2) { vx += ex * 1.2; vy += ey * 1.2; }
    }
    if (vx || vy) this.panBy(vx * 700 * dt, vy * 700 * dt, this.reduced);
  }

  private tickFlat(dt: number, state: GameState) {
    // Camera follows whoever is acting, or the selected hero.
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const focus = this.focusPoint(sw / (2 * TILE * this.scale), sh / (2 * TILE * this.scale));
    const mw = state.map.width * TILE * this.scale, mh = state.map.height * TILE * this.scale;
    this.looseLook(dt);
    const fx = focus ? focus.x * TILE : (sw / 2 - this.cam.x) / this.scale - this.pan.x;
    const fy = focus ? focus.y * TILE : (sh / 2 - this.cam.y) / this.scale - this.pan.y;
    let tx = sw / 2 - (fx + this.pan.x) * this.scale;
    let ty = sh / 2 - (fy + this.pan.y) * this.scale;
    tx = mw <= sw ? (sw - mw) / 2 : Math.min(0, Math.max(sw - mw, tx));
    ty = mh <= sh ? (sh - mh) / 2 : Math.min(0, Math.max(sh - mh, ty));
    // The look-around offset never runs past the map's edges.
    this.pan.x = (sw / 2 - tx) / this.scale - fx;
    this.pan.y = (sh / 2 - ty) / this.scale - fy;
    if (!this.cam.ready) { this.cam = { x: tx, y: ty, ready: true }; }
    const k = this.reduced ? 1 : Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.world.position.set(Math.round(this.cam.x), Math.round(this.cam.y));
    for (const e of this.ents.values()) {
      if (e.flash > 0) { e.flash -= dt; e.sprite.tint = e.flash > 0 ? mixColor(e.unseen ? 0x2a2a3a : 0xffffff, 0xff4a3a, Math.min(1, e.flash / 0.2) * 0.7) : e.unseen ? 0x2a2a3a : 0xffffff; }
      if (e.shake > 0) { e.shake -= dt; e.root.x += Math.sin(this.pulse * 70) * 1.2 * Math.max(0, e.shake / 0.28); }
    }
  }

  private tickTilt(dt: number, state: GameState) {
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const mw = state.map.width * TILE, mh = state.map.height * TILE;
    const cam = this.tcam;
    cam.cx = sw / 2;
    cam.cy = sh * 0.5;
    const focus = this.focusPoint(sw / (2 * TILE * cam.k), (sh * 0.85) / (2 * TILE * cam.k * GROUND_SQUASH));
    this.looseLook(dt);
    const want = focus ? { fx: focus.x * TILE, fy: focus.y * TILE } : { fx: (cam.fx || mw / 2) - this.pan.x, fy: (cam.fy || mh / 2) - this.pan.y };
    const goal = clampFocus(want.fx + this.pan.x, want.fy + this.pan.y, cam.k, sw, sh, mw, mh, TILE * 0.8);
    // The look-around offset never runs past the map's edges.
    this.pan.x = goal.fx - want.fx;
    this.pan.y = goal.fy - want.fy;
    if (!this.tcamReady) { cam.fx = goal.fx; cam.fy = goal.fy; this.tcamReady = true; }
    const k = this.reduced ? 1 : Math.min(1, dt * 5);
    cam.fx += (goal.fx - cam.fx) * k;
    cam.fy += (goal.fy - cam.fy) * k;
    // Perspective squeezes the far rows, so the plain centring leaves sky above the map: slide the
    // picture so the far edge sits near the top when the near edge runs off the bottom, and the other way round.
    {
      const top = 46, bottom = sh - 24;
      const far = project(cam, cam.fx, 0).y, near = project(cam, cam.fx, mh).y;
      if (far > top && near > bottom) cam.cy -= Math.min(far - top, near - bottom);
      else if (near < bottom && far < top) cam.cy += Math.min(top - far, bottom - near);
    }

    // Ground: the flat map, painted into a texture and laid on the tilted plane.
    const dpr = this.app.renderer.resolution;
    const nearScale = project(cam, mw / 2, mh, 0).s;
    let res = Math.max(2, Math.min(this.lite ? 3 : 6, Math.ceil((cam.k * nearScale * dpr) / 1.1)));
    while (res > 1 && Math.max(mw, mh) * res > 4096) res--;
    if (!this.groundRT || this.rtRes !== res || this.groundRT.width !== mw || this.groundRT.height !== mh) {
      this.groundRT?.destroy(true);
      this.groundRT = RenderTexture.create({ width: mw, height: mh, resolution: res, scaleMode: 'linear', antialias: false });
      this.rtRes = res;
      if (this.ground) { this.ground.texture = this.groundRT; }
    }
    if (!this.lite || this.frame % 2 === 0 || this.frame < 3) {
      this.world.position.set(0, 0);
      this.world.scale.set(1);
      this.app.renderer.render({ container: this.world, target: this.groundRT, clear: true });
    }
    const c0 = project(cam, 0, 0), c1 = project(cam, mw, 0), c2 = project(cam, mw, mh), c3 = project(cam, 0, mh);
    if (!this.ground) {
      const n = this.lite ? 12 : 22;
      this.ground = new PerspectiveMesh({ texture: this.groundRT, verticesX: n, verticesY: n, x0: c0.x, y0: c0.y, x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x3: c3.x, y3: c3.y });
      this.app.stage.addChildAt(this.ground, this.app.stage.getChildIndex(this.slab) + 1);
    } else this.ground.setCorners(c0.x, c0.y, c1.x, c1.y, c2.x, c2.y, c3.x, c3.y);

    // The map is a board lying on the tavern table: its near edge shows a little thickness and it casts a shadow.
    const depth = TILE * 0.4;
    this.drawTable(cam, mw, mh, depth, state);
    const d2 = project(cam, mw, mh, -depth), d3 = project(cam, 0, mh, -depth);
    const s = this.slab;
    s.clear();
    const off = (x: number, y: number) => project(cam, x + TILE * 0.55, y + TILE * 0.7, -depth);
    const o0 = off(0, 0), o1 = off(mw, 0), o2 = off(mw, mh), o3 = off(0, mh);
    s.poly([o0.x, o0.y, o1.x, o1.y, o2.x, o2.y, o3.x, o3.y]).fill({ color: 0x000000, alpha: 0.5 });
    s.poly([c3.x, c3.y, c2.x, c2.y, d2.x, d2.y, d3.x, d3.y]).fill(0x1d1814);
    s.poly([c3.x, c3.y, c2.x, c2.y, (c2.x * 2 + d2.x) / 3, (c2.y * 2 + d2.y) / 3, (c3.x * 2 + d3.x) / 3, (c3.y * 2 + d3.y) / 3]).fill(0x2c251f);
    s.moveTo(c3.x, c3.y).lineTo(c2.x, c2.y).stroke({ width: 1, color: 0x6b5a44, alpha: 0.6 });
    // Darker far away and in the corners, warmer where the light comes from.
    this.shadeSprite.position.set(0, 0);
    this.shadeSprite.width = sw;
    this.shadeSprite.height = sh;

    // Miniatures
    for (const e of this.ents.values()) {
      const st = e.stand;
      if (!st) continue;
      const foot = project(cam, (e.x + e.size / 2) * TILE, (e.y + e.size / 2) * TILE, 0);
      let ox = 0;
      if (e.shake > 0) { e.shake -= dt; ox = Math.sin(this.pulse * 70) * 1.4 * Math.max(0, e.shake / 0.28) * cam.k; }
      st.root.position.set(foot.x + ox, foot.y);
      st.root.scale.set(cam.k * foot.s);
      st.root.zIndex = foot.y + (e.id === this.opts.activeId ? 0.5 : 0);
      if (e.plate?.visible) {
        const k = cam.k * foot.s;
        e.plate.position.set(foot.x + ox, foot.y + (((e.size * TILE) / 2) * 0.8 * GROUND_SQUASH + 2) * k);
        e.plate.scale.set(0.2 * k);
      }
      if (e.flash > 0) e.flash -= dt;
      st.fig.tint = e.flash > 0 ? mixColor(e.tint, 0xff4a3a, Math.min(1, e.flash / 0.2) * 0.7) : e.tint;
      // A slow breath, so the table feels alive.
      if (!this.reduced && !e.down && !e.unseen) {
        const sy = (st.figH / Math.max(1, texBase.get(st.fig.texture)?.h ?? st.fig.texture.height));
        st.fig.scale.y = sy * (1 + 0.014 * Math.sin(this.pulse * 2.1 + e.phase));
      }
    }
  }

  /**
   * The tavern table around the board: the picture is laid flat under the board with the same
   * perspective, so the board sits on the middle of the rug and the plates, candles and dice
   * lie around it. Whatever would come too close to the camera is cut off.
   */
  private drawTable(cam: TiltCam, mw: number, mh: number, depth: number, state: GameState) {
    const tex = this.tableTex;
    if (!tex) return;
    // The rug's inner field, as fractions of the picture: the board covers it, the rug's border shows around it.
    const F = { x0: 0.235, x1: 0.78, y0: 0.225, y1: 0.79 };
    const iw = tex.source.width, ih = tex.source.height;
    const W = Math.max(mw / (F.x1 - F.x0), (mh * (iw / ih)) / (F.y1 - F.y0)) * 1.22, H = (W * ih) / iw;
    const ox = mw / 2 - (W * (F.x0 + F.x1)) / 2, oy = mh / 2 - (H * (F.y0 + F.y1)) / 2;
    const bottom = Math.min(oy + H, cam.fy + nearLimit(cam));
    const cut = Math.round(Math.max(0.05, (bottom - oy) / H) * 100) / 100;
    if (!this.table || cut !== this.tableCut) {
      const frame = new Texture({ source: tex.source, frame: new Rectangle(0, 0, iw, Math.floor(ih * cut)) });
      if (!this.table) {
        this.table = new PerspectiveMesh({ texture: frame, verticesX: this.lite ? 10 : 18, verticesY: this.lite ? 10 : 18 });
        this.app.stage.addChildAt(this.table, 0);
      } else { const old = this.table.texture; this.table.texture = frame; old.destroy(false); }
      this.tableCut = cut;
    }
    const yb = oy + H * cut;
    const t0 = project(cam, ox, oy, -depth), t1 = project(cam, ox + W, oy, -depth), t2 = project(cam, ox + W, yb, -depth), t3 = project(cam, ox, yb, -depth);
    this.table.setCorners(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y, t3.x, t3.y);
    // A fight in the dark dims the candlelit table a little too.
    const ambient = state.phase === 'combat' ? state.light?.ambient ?? 'bright' : 'bright';
    this.table.tint = ambient === 'dark' ? 0x8a7f74 : ambient === 'dim' ? 0xc2b8ac : 0xffffff;

  }

  /** After a few seconds, a machine that cannot keep up gets the lighter version of the 2.5D view. */
  private watchPerformance(dt: number) {
    if (!this.tilt || this.lite || this.perf.t > 6) return;
    this.perf.t += dt;
    if (this.perf.t < 1.5) return;
    this.perf.frames++;
    if (this.perf.t > 5 && this.perf.frames / (this.perf.t - 1.5) < 36) {
      this.lite = true;
      this.fx.setLite(true);
      if (this.ground) { this.ground.destroy(); this.ground = null; }
    }
  }
}


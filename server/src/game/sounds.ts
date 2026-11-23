// The Dungeon Master's side of the sound library: look for a sound by words, put one on, or order a new one when
// nothing fits. Music and ambient loops the Dungeon Master puts on hold while the game stays in the same kind of
// scene (the tavern, a fight); an ordered sound takes over as soon as it is made, and the closest match plays
// until then. Effects play once, for everyone at the table.
import { musicContext } from '../../../shared/music';
import type { LibraryKind } from '../../../shared/library';
import type { SoundPick, Soundtrack } from '../../../shared/types';
import type { Game } from './engine';

/** A sound as the Dungeon Master sees it. */
export interface SoundHit {
  id: string;
  kind: LibraryKind;
  title: string;
  description: string;
  scene?: string;
  seconds: number;
  /** Empty while it is being made. */
  src: string;
  status: 'making' | 'ready' | 'failed';
}

/** What the room lends the game when the server has a sound library. */
export interface SoundHooks {
  find(kind: LibraryKind | null, words: string): SoundHit[];
  get(id: string): SoundHit | null;
  /** Null when a new sound may be ordered now, else why not, in a sentence for the Dungeon Master. */
  orderGate(): string | null;
  order(kind: LibraryKind, description: string): SoundHit;
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** The DM's words for a kind, which it writes as it likes: "effect", "sfx", "loop", "ambience". */
export function kindOf(raw: unknown): LibraryKind | null {
  const k = clean(raw, 20).toLowerCase();
  if (/^(music|song|track|tune)$/.test(k)) return 'music';
  if (/^(ambient|ambience|loop|atmosphere|background)$/.test(k)) return 'ambient';
  if (/^(effect|effects|sfx|sound|sound effect)$/.test(k)) return 'sfx';
  return null;
}
const kindWord = (k: LibraryKind) => (k === 'sfx' ? 'effect' : k);

/** The kind of scene the game is in now, which a picked track belongs to. */
export function sceneNow(game: Game): string {
  const s = game.s;
  return musicContext({ phase: s.phase, world: (s.world as never) ?? null, bossFight: s.phase === 'combat' && !!s.encounter?.boss });
}

const line = (h: SoundHit) => ({ id: h.id, kind: kindWord(h.kind), title: h.title, what: h.description, ...(h.scene ? { scene: h.scene } : {}), seconds: h.seconds });

/** The sound tool, do "find". */
export function findSound(game: Game, raw: { kind?: unknown; words?: unknown }): Record<string, unknown> {
  const hooks = game.sounds;
  if (!hooks) return { found: [], note: 'This server has no sound library. Carry on without sound.' };
  const kind = kindOf(raw.kind);
  const words = clean(raw.words, 200);
  if (!words) throw new Error('words: describe the sound in a few English words, for example "misty harbour at night".');
  const found = hooks.find(kind, words);
  const gate = hooks.orderGate();
  return {
    found: found.map(line),
    note: found.length
      ? `Put one on with do "play".${gate ? '' : ' If none fits the scene well, do "order" can have a new one made, with the closest of these as id to play meanwhile.'}`
      : gate ? `Nothing fits, and no new sound can be ordered now (${gate}). Carry on without it.` : 'Nothing fits. do "order" can have one made, if this moment deserves its own sound.',
  };
}

function put(game: Game, h: SoundHit): Record<string, unknown> {
  const st = (game.s.soundtrack ??= {});
  if (h.kind === 'sfx') {
    st.effect = { src: h.src, n: (st.effect?.n ?? 0) + 1 };
    return { playing: h.title, note: 'Everyone hears it once now. Do not mention the sound in the narration.' };
  }
  const pick = { id: h.id, title: h.title, src: h.src, context: sceneNow(game), place: game.s.world?.placeId ?? null };
  if (h.kind === 'music') st.music = pick; else st.ambient = pick;
  if (st.waiting) delete st.waiting[h.kind];
  return { playing: h.title, note: 'It plays for everyone until the party moves on to another kind of scene (another place, a fight). Do not mention the music in the narration.' };
}

/** The sound tool, do "play". */
export function playSound(game: Game, raw: { id?: unknown }): Record<string, unknown> {
  const hooks = game.sounds;
  if (!hooks) return { playing: null, note: 'This server has no sound library.' };
  const h = hooks.get(clean(raw.id, 40));
  if (!h) throw new Error('No sound with that id. Use an id from find.');
  if (h.status !== 'ready' || !h.src) return { playing: null, note: 'That sound is not ready yet. It takes over by itself when it is, if you ordered it for this scene.' };
  return put(game, h);
}

/** The sound tool, do "order". */
export function orderSound(game: Game, raw: { kind?: unknown; description?: unknown; meanwhile?: unknown }): Record<string, unknown> {
  const hooks = game.sounds;
  if (!hooks) return { ordered: false, note: 'This server has no sound library. Carry on without sound.' };
  const kind = kindOf(raw.kind);
  if (!kind) throw new Error('kind must be "music", "ambient" or "effect".');
  const description = clean(raw.description, 300);
  if (description.length < 8) throw new Error('description: say in English what it should sound like, for example "slow fiddle and low strings, misty harbour at night, a little eerie".');
  const gate = hooks.orderGate();
  if (gate) return { ordered: false, reason: gate, note: 'Use the closest sound from find, or none.' };
  const made = hooks.order(kind, description);
  const out: Record<string, unknown> = { ordered: true, id: made.id };
  const meanwhile = clean(raw.meanwhile, 40);
  const stand = meanwhile ? hooks.get(meanwhile) : null;
  if (stand && stand.kind === kind && stand.status === 'ready' && stand.src) out.meanwhile = put(game, stand).playing;
  if (kind === 'sfx') {
    out.note = 'It is made in a few seconds and kept in the library for next time; this moment passes without it. Do not mention the sound in the narration.';
  } else {
    ((game.s.soundtrack ??= {}).waiting ??= {})[kind] = { id: made.id, context: sceneNow(game), place: game.s.world?.placeId ?? null };
    out.note = `It takes over by itself when it is ready (${kind === 'music' ? 'about a minute' : 'a few seconds'}), if the party is still in this kind of scene, and stays in the library for next time. Do not mention it in the narration.`;
  }
  return out;
}

/**
 * A sound the Dungeon Master ordered has been made: put it on if this table is still waiting for it and still in
 * the kind of scene it was ordered for. True when the table's sound changed.
 */
export function soundReady(game: Game, h: SoundHit): boolean {
  const st = game.s.soundtrack;
  if (!st?.waiting || h.kind === 'sfx') return false;
  const wait = st.waiting[h.kind];
  if (wait?.id !== h.id) return false;
  delete st.waiting[h.kind];
  // A sound that failed, or that arrives after the party has moved on, stays in the library for later.
  if (h.status !== 'ready' || !h.src || wait.context !== sceneNow(game) || (wait.place ?? null) !== (game.s.world?.placeId ?? null)) return true;
  put(game, h);
  return true;
}

/** The table's sound as players get it: a pick made at another place has ended. */
export function soundtrackNow(game: Game): Soundtrack | null {
  const st = game.s.soundtrack;
  if (!st) return null;
  const here = game.s.world?.placeId ?? null;
  const keep = (p: SoundPick | null | undefined) => (p && (p.place ?? null) === here ? p : null);
  return { music: keep(st.music), ambient: keep(st.ambient), effect: st.effect ?? null };
}

/** A line for the Dungeon Master's state: what plays now and what it can do about it. Null without a library. */
export function soundState(game: Game): string | null {
  const hooks = game.sounds;
  if (!hooks) return null;
  const st = soundtrackNow(game);
  const waitingNow = game.s.soundtrack?.waiting;
  const now = sceneNow(game);
  const playing = [st?.music && st.music.context === now ? `music "${st.music.title}"` : '', st?.ambient && st.ambient.context === now ? `ambient "${st.ambient.title}"` : ''].filter(Boolean).join(', ');
  const waiting = waitingNow && (waitingNow.music || waitingNow.ambient) ? ' A sound you ordered is still being made.' : '';
  const gate = hooks.orderGate();
  return `Sound: ${playing ? `you put on ${playing}` : `the server plays ${now} music by itself`}.${waiting}${gate ? ` New sounds cannot be ordered right now (${gate}).` : ''}`;
}

import { EventCard } from './EventCard';
import { itemArtUrl } from '../game/itemArt';
import { GOOD_REASONS } from '../../../shared/odds';
import { reasonText } from './Odds';
import { npcBustUrl } from '../game/faces';
import { skillBonus } from '../../../shared/skillTag';
import { SkillGlyph } from '../ui/Glyph';
import { signed as plusMinus } from './Guide';
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CLASS_INFO, ITEMS } from '../../../shared/content';
import { HEX_MILES, direction, formatHours, hexDistance } from '../../../shared/hex';
import type { CombatState, GameState, LogEntry, RollInfo, SceneMeta } from '../../../shared/types';
import { monsterUrl, monsterVariant } from '../game/monsterArt';
import { artOfCharacter, heroPortraitUrl, onPortraitLoaded, paintedPortraitUrl } from '../game/heroArt';
import { usePrefs } from '../ui/prefs';
import type { CreatureType, Size } from '../../../shared/monsterLook';
import { playerId, useTypingSignal, type Connection } from '../net';
import { KIND_ICON } from './HexMap';
import { useT, type Translate } from '../i18n';
import { tr } from '../../../shared/i18n';
import { parseOoc } from '../../../shared/ooc';
import { classLabel } from '../game/util';
import { Icon } from '../ui/icons';
import { ReadAloud } from '../narrator';
import { MicButton } from '../dictation';
import { useLang } from '../i18n';
import { CharcoalReveal, REVEAL_MS } from '../ui/charcoal';
import { SFX_DOM_EVENT } from '../../../shared/sfx';

// ------------------------------------------------------------- entities

/** Something the story can mention by name: hovering it shows what the party knows. */
export interface Entity {
  name: string;
  kind: 'npc' | 'place' | 'item' | 'hero' | 'monster';
  icon: string;
  image?: string;
  /** The painted portrait (/pictures/<id>) of a person; shown in the brass frame once it has loaded. */
  portraitId?: string | null;
  subtitle: string;
  description: string;
  facts: string[];
}

export function buildEntities(state: GameState, t: Translate): Entity[] {
  // Names must match the text of the story, which is written in the table's language.
  const story = (text: string) => tr(state.language, text);
  const out: Entity[] = [];
  const w = state.world;
  const placeName = (id: string | null) => w?.locations.find((l) => l.id === id)?.name;
  for (const n of state.memory.npcs) {
    const facts = [`${t('Disposition')}: ${t(n.disposition)}`];
    const at = placeName(n.locationId);
    if (at) facts.push(`${t('Last seen')}: ${at}`);
    paintedPortraitUrl(n.portraitId, 104); // starts loading it now, so the card has it when hovered
    out.push({ name: n.name, kind: 'npc', icon: '🧑', portraitId: n.portraitId, subtitle: n.role || t('Someone you have met'), description: n.description, facts: [...facts, ...n.notes] });
  }
  for (const l of w?.locations ?? []) {
    const d = hexDistance(w!.party, l);
    const facts = [d === 0 ? t('You are here') : t('{miles} miles to the {direction}', { miles: d * HEX_MILES, direction: t(direction(w!.party, l)) }), l.visited ? t('Visited') : t('Not yet visited')];
    if (l.dungeon) facts.push(l.dungeon.cleared >= l.dungeon.total ? t('Cleared') : t('{n} of {total} sections cleared', { n: l.dungeon.cleared, total: l.dungeon.total }));
    const parent = placeName(l.parentId);
    out.push({ name: l.name, kind: 'place', icon: KIND_ICON[l.kind], subtitle: parent ? t('{kind} in {place}', { kind: t(l.kind), place: parent }) : t(l.kind), description: l.description, facts });
  }
  for (const c of state.characters) {
    out.push({
      name: c.name, kind: 'hero', icon: '🛡️', image: heroPortraitUrl(artOfCharacter(c, state.items)), subtitle: t('Level {level} {class}', { level: c.level, class: classLabel(c, t) }), description: t(CLASS_INFO[c.classId].blurb),
      facts: [`${t('HP')} ${c.hp}/${c.maxHp} · ${t('AC')} ${c.ac}`, state.players.find((p) => p.id === c.ownerId)?.name ? t('Played by {name}', { name: state.players.find((p) => p.id === c.ownerId)!.name }) : ''].filter(Boolean),
    });
  }
  if (state.phase === 'combat') {
    const sizes: Record<Size, string> = { tiny: t('Tiny'), small: t('Small'), medium: t('Medium'), large: t('Large'), huge: t('Huge'), gargantuan: t('Gargantuan') };
    const kinds: Record<CreatureType, string> = {
      aberration: t('Aberration'), beast: t('Beast'), celestial: t('Celestial'), construct: t('Construct'), dragon: t('Dragon'), elemental: t('Elemental'), fey: t('Fey'),
      fiend: t('Fiend'), giant: t('Giant'), humanoid: t('Humanoid'), monstrosity: t('Monstrosity'), ooze: t('Ooze'), plant: t('Plant'), undead: t('Undead'),
    };
    for (const m of state.monsters) {
      if (!m.alive) continue;
      const facts = [`${t('HP')} ${m.hp}/${m.maxHp} · ${t('AC')} ${m.ac}${m.cr ? ` · ${t('Challenge {cr}', { cr: m.cr })}` : ''}`];
      if (m.abilities?.length) facts.push(m.abilities.join(', '));
      if (m.legendary) facts.push(t('Legendary actions left this round: {left} of {uses}', m.legendary));
      if (m.conditions.length) facts.push(m.conditions.map((x) => t(x)).join(', '));
      if (m.tiles > 1) facts.push(t('Takes up {n} by {n} squares', { n: m.tiles }));
      if (m.senses?.darkvision) facts.push(t('Darkvision {n} ft', { n: m.senses.darkvision }));
      if (m.senses?.blindsight) facts.push(t('Blindsight {n} ft', { n: m.senses.blindsight }));
      if (m.light) facts.push(t('Carries a light'));
      out.push({ name: m.name, kind: 'monster', icon: '👹', image: monsterUrl(m.look, monsterVariant(m.id)), subtitle: `${sizes[m.look.size]} · ${kinds[m.kind]}`, description: m.description, facts });
    }
  }
  // Story items first: where a name is shared, the DM's own creation is the one the story means.
  for (const i of Object.values(state.items)) {
    const st = i.story;
    if (!st) continue;
    const holder = state.characters.find((c) => c.bag.some((b) => b?.defId === i.id) || Object.values(c.equipment).some((e) => e?.defId === i.id));
    const facts = [
      holder ? t('Carried by {name}', { name: holder.name }) : t('No longer with the party'),
      st.foundAt ? t('Found on day {day} at {place}', { day: st.foundDay, place: st.foundAt }) : t('Found on day {day}', { day: st.foundDay }),
      ...st.notes.map((n) => n.text),
    ];
    out.push({ name: i.name, kind: 'item', icon: i.icon, image: itemArtUrl(i), subtitle: `${t(st.category)}${st.quest ? ` · ${t('Quest item')}` : ''}${i.rarity ? ` · ${t(i.rarity)}` : ''}`, description: i.description, facts });
  }
  for (const i of Object.values(ITEMS)) {
    out.push({ name: story(i.name), kind: 'item', icon: i.icon, image: itemArtUrl(i), subtitle: `${t(i.kind)}${i.rarity ? ` · ${t(i.rarity)}` : ''}`, description: t(i.description), facts: [t('Worth {n} gp', { n: i.value })] });
  }
  return out;
}

interface Hover {
  /** `extra` rides at the bottom of the card, such as the odds of an attack on a monster. */
  show: (e: Entity, el: HTMLElement, extra?: ReactNode) => void;
  hide: () => void;
}
const HoverContext = createContext<{ entities: Entity[]; pattern: RegExp | null; hover: Hover }>({ entities: [], pattern: null, hover: { show: () => {}, hide: () => {} } });

/** The known entities and the shared hover card, for things outside the story feed such as the battle map. */
export const useEntityHover = () => useContext(HoverContext);

/** Provides entity highlighting and one shared hover card to everything inside it. */
export function EntityProvider({ state, children }: { state: GameState; children: ReactNode }) {
  const t = useT();
  const [card, setCard] = useState<{ entity: Entity; x: number; y: number; below: boolean; extra?: ReactNode } | null>(null);
  const entities = useMemo(() => buildEntities(state, t), [state.memory, state.items, state.world?.locations, state.world?.party, state.characters, state.monsters, state.phase, state.players, state.language, t]);
  const pattern = useMemo(() => {
    const names = [...new Set(entities.map((e) => e.name))].filter((n) => n.length > 2).sort((a, b) => b.length - a.length);
    if (!names.length) return null;
    return new RegExp(`(?<![\\p{L}\\p{N}])(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  }, [entities]);
  const hover = useMemo<Hover>(() => ({
    show: (entity, el, extra) => {
      const r = el.getBoundingClientRect();
      const below = r.top < (extra ? 360 : 240);
      setCard({ entity, x: Math.max(12, Math.min(window.innerWidth - 312, r.left + r.width / 2 - 150)), y: below ? r.bottom + 8 : r.top - 8, below, extra });
    },
    hide: () => setCard(null),
  }), []);
  const value = useMemo(() => ({ entities, pattern, hover }), [entities, pattern, hover]);
  const image = card ? card.entity.image ?? paintedPortraitUrl(card.entity.portraitId, 104) ?? undefined : undefined;
  return (
    <HoverContext.Provider value={value}>
      {children}
      {card && (
        <div className={`hovercard ${card.entity.kind}`} style={{ left: card.x, top: card.y, transform: card.below ? undefined : 'translateY(-100%)' }}>
          <div className="hc-head">
            <span className="hc-portrait">{image ? <img className={card.entity.kind === 'hero' || card.entity.kind === 'monster' || card.entity.portraitId ? 'hero-art' : image.endsWith('.svg') ? '' : 'pixel'} src={image} alt="" /> : card.entity.icon}</span>
            <div>
              <b>{card.entity.name}</b>
              <small>{card.entity.subtitle}</small>
            </div>
          </div>
          {card.entity.description && <p>{card.entity.description}</p>}
          {card.entity.facts.length > 0 && <ul>{card.entity.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          {card.extra}
        </div>
      )}
    </HoverContext.Provider>
  );
}

/** A name with a hover card. Use for anything in the codex. */
export function EntityName({ entity, children }: { entity: Entity; children?: ReactNode }) {
  const { hover } = useContext(HoverContext);
  return (
    <span className={`entity ${entity.kind}`} tabIndex={0} onMouseEnter={(e) => hover.show(entity, e.currentTarget)} onMouseLeave={hover.hide} onFocus={(e) => hover.show(entity, e.currentTarget)} onBlur={hover.hide}>
      {children ?? entity.name}
    </span>
  );
}

export function useEntity(name: string): Entity | undefined {
  const { entities } = useContext(HoverContext);
  return entities.find((e) => e.name === name);
}

/** Plain narration with every known name turned into a hoverable highlight. */
export function RichText({ text }: { text: string }) {
  const { entities, pattern } = useContext(HoverContext);
  const parts = useMemo(() => {
    if (!pattern) return [text];
    const out: (string | Entity)[] = [];
    let last = 0;
    for (const m of text.matchAll(pattern)) {
      const entity = entities.find((e) => e.name === m[0]);
      if (!entity) continue;
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(entity);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text, pattern, entities]);
  return <>{parts.map((p, i) => (typeof p === 'string' ? p : <EntityName key={i} entity={p} />))}</>;
}

// ----------------------------------------------------------------- dice

const OUTCOME: Record<RollInfo['outcome'], string> = { hit: 'Hit', miss: 'Miss', crit: 'Critical hit', success: 'Success', failure: 'Failure' };
const signed = (n: number) => (n >= 0 ? `+ ${n}` : `− ${-n}`);

/** A d20 roll with its breakdown. New rolls tumble for a moment before the result lands. */
function DiceRoll({ roll, animate }: { roll: RollInfo; animate: boolean }) {
  const t = useT();
  const [face, setFace] = useState<number | null>(animate ? 1 + Math.floor(Math.random() * 20) : null);
  useEffect(() => {
    if (!animate) return;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
      if (ticks >= 9) { clearInterval(timer); setFace(null); }
      else setFace(1 + Math.floor(Math.random() * 20));
    }, 70);
    return () => clearInterval(timer);
  }, [animate]);
  const rolling = face !== null;
  const good = roll.outcome === 'hit' || roll.outcome === 'crit' || roll.outcome === 'success';
  const dropped = roll.rolls.length > 1 ? roll.rolls[roll.rolls[0] === roll.die ? 1 : 0] : undefined;
  return (
    <div className={`dice ${rolling ? 'rolling' : good ? 'good' : 'bad'} ${roll.outcome}`}>
      <span className={`d20 ${roll.die === 20 ? 'nat20' : roll.die === 1 ? 'nat1' : ''}`} title={t('d20')}>{rolling ? face : roll.die}</span>
      <div className="dice-body">
        <div className="dice-label"><RichText text={roll.actor} /> · {roll.label}{roll.target.name && <> → <RichText text={roll.target.name} /></>}</div>
        <div className="dice-math">
          {!rolling && (
            <>
              {t('d20')} <b>{roll.die}</b>
              {dropped !== undefined && <s title={t(roll.mode)}>{dropped}</s>}
              {roll.mode !== 'normal' && <em>{t(roll.mode)}</em>} {signed(roll.modifier)} = <b>{roll.total}</b> {t('vs')} {t(roll.target.kind)} {roll.target.value}
              <span className="outcome">{t(OUTCOME[roll.outcome])}</span>
              {roll.damage && <span className="damage">{roll.damage.amount} {t(`${roll.damage.type} damage`)}</span>}
            </>
          )}
          {rolling && <span className="muted">{t('rolling…')}</span>}
        </div>
        {!rolling && (roll.why?.length || (roll.outcome === 'miss' && roll.die !== 1 && roll.target.kind === 'AC')) ? (
          <ul className="odds-why dice-why">
            {roll.outcome === 'miss' && roll.die !== 1 && roll.target.kind === 'AC' && roll.total < roll.target.value && <li className="bad">{t('Short by {n}', { n: roll.target.value - roll.total })}</li>}
            {roll.why?.map((r, i) => <li key={i} className={GOOD_REASONS.has(r.code) ? 'good' : 'bad'}>{reasonText(r.code, r.n, t)}</li>)}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- portraits in the story

/** Redraws the caller whenever a painted portrait has finished loading. */
function usePortraitTick() {
  const [, tick] = useState(0);
  useEffect(() => onPortraitLoaded(() => tick((n) => n + 1)), []);
}

/** The framed face of a speaker in the story: the painted portrait, or a drawn face until there is one. */
function Face({ name, image, portraitId, kind, role, about }: { name: string; image?: string; portraitId?: string | null; kind: 'npc' | 'hero'; role?: string; about?: string }) {
  usePortraitTick();
  // Someone without a painted portrait (yet) gets a drawn face, never just a letter.
  const src = image ?? paintedPortraitUrl(portraitId, 144) ?? (kind === 'npc' ? npcBustUrl(name, role, about) : undefined);
  return (
    <span className={`face ${kind}`} aria-hidden="true">
      {src ? <img className="hero-art" src={src} alt="" /> : <span className="face-initial">{[...name.trim()][0]?.toUpperCase() ?? '?'}</span>}
    </span>
  );
}

const OPEN_QUOTE = /["„“”«»‹›]/u;

/** Who speaks in a paragraph of narration: the first named person before the first quotation mark (after it, when the quote opens the paragraph). */
export function speakerOf(text: string, entities: Entity[], pattern: RegExp | null): Entity | null {
  if (!pattern) return null;
  const q = text.search(OPEN_QUOTE);
  if (q < 0) return null;
  const people = (from: number, to: number) => {
    for (const m of text.slice(from, to).matchAll(pattern)) {
      const e = entities.find((x) => x.name === m[0] && (x.kind === 'npc' || x.kind === 'hero'));
      if (e) return e;
    }
    return null;
  };
  return people(0, q) ?? (q <= 2 ? people(q, text.length) : null);
}

/** One paragraph of narration; when a named person speaks in it and portraits are on, the person's face sits beside it. */
function Paragraph({ text }: { text: string }) {
  const { entities, pattern } = useContext(HoverContext);
  const { storyPortraits } = usePrefs();
  const who = storyPortraits === 'off' ? null : speakerOf(text, entities, pattern);
  if (!who) return <p><RichText text={text} /></p>;
  return (
    <div className={`speech ${storyPortraits}`}>
      <Face name={who.name} image={who.image} portraitId={who.portraitId} kind={who.kind === 'hero' ? 'hero' : 'npc'} role={who.subtitle} about={who.description} />
      <div className="speech-body"><b className="speech-name">{who.name}</b><p><RichText text={text} /></p></div>
    </div>
  );
}

// ----------------------------------------------------------------- feed

function Entry({ entry, animate, takeBack, table, lang, hero, items }: { items: GameState['items']; entry: LogEntry; animate: boolean; takeBack?: () => void; table: string; lang: string; hero?: { name: string; image: string } }) {
  const t = useT();
  const { storyPortraits } = usePrefs();
  switch (entry.kind) {
    case 'dm':
      return (
        <article className={`scene mood-${entry.scene?.mood ?? 'plain'} ${animate ? 'enter' : ''}`}>
          {entry.scene && (
            <header><span className="mood-dot" />{entry.scene.title}<small>{t(entry.scene.mood)}</small></header>
          )}
          <ReadAloud table={table} entry={entry.id} lang={lang} />
          {entry.scene?.where && <SceneStage scene={entry.scene} />}
          {entry.scene && (entry.scene.imageId || entry.scene.painting) && <ScenePicture scene={entry.scene} />}
          {entry.text.split(/\n{2,}/).map((p, i) => <Paragraph key={i} text={p} />)}
        </article>
      );
    case 'chat':
      if (hero && storyPortraits !== 'off') {
        return (
          <div className={`said with-face ${storyPortraits}`}>
            <Face name={hero.name} image={hero.image} kind="hero" />
            <div className="said-body"><b>{entry.speaker}<i className="said-hero">{hero.name}</i></b>{entry.text}{takeBack && <button type="button" className="takeback" onClick={takeBack}>↩ {t('Take back')}</button>}</div>
          </div>
        );
      }
      return <p className="said"><b>{entry.speaker}</b>{entry.text}{takeBack && <button type="button" className="takeback" onClick={takeBack}>↩ {t('Take back')}</button>}</p>;
    case 'ask':
      return <p className="said ask"><b>{entry.speaker}<i>{t('to the Dungeon Master')}</i></b>{entry.text}</p>;
    case 'note':
      return (
        <aside className={`dm-note ${animate ? 'enter' : ''}`}>
          <b>{t('Dungeon Master')}<i>{t('Table talk, answering {name}', { name: entry.speaker ?? '' })}</i></b>
          {entry.text.split(/\n{2,}/).map((p, i) => <p key={i}><RichText text={p} /></p>)}
        </aside>
      );
    case 'roll':
      return entry.roll ? <DiceRoll roll={entry.roll} animate={animate} /> : <p className="line roll"><RichText text={entry.text} /></p>;
    case 'levelup':
      return (
        <article className={`levelup ${animate ? 'enter' : ''}`}>
          <header>⭐ {t('{name} reaches level {level}', { name: entry.levelUp?.name ?? '', level: entry.levelUp?.level ?? 0 })}</header>
          <ul>{entry.levelUp?.gains.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </article>
      );
    default:
      if (entry.event) return <EventCard entry={entry} items={items} animate={animate} />;
      return <p className="line system"><RichText text={entry.text} /></p>;
  }
}

/** Pictures already drawn in this page, so a picture is not drawn a second time when the feed re-renders. */
const drawnPictures = new Set<string>();
const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The hand-drawn picture of a big moment, or a note while it is being painted. It is drawn stroke by stroke on aged paper
 * when it comes into view (dark outlines, then shading, then the light tones). A click while it draws shows it at once;
 * a click afterwards shows it large. With reduced motion the picture just appears.
 */
function ScenePicture({ scene }: { scene: SceneMeta }) {
  const t = useT();
  const [large, setLarge] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const id = scene.imageId;
  const [drawing, setDrawing] = useState(false);
  // Which picture has been drawn already; keyed by id because the card first shows "drawing this moment" and gets its picture later.
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const [reduced] = useState(prefersReducedMotion);
  const settled = !id || reduced || drawnPictures.has(id) || doneFor === id;
  const box = useRef<HTMLButtonElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const skip = useRef<(() => void) | null>(null);

  // Wait until the picture is loaded and on screen, then draw it.
  useEffect(() => {
    if (!id || settled || drawing || !loaded || !box.current) return;
    const el = box.current;
    const go = () => setDrawing(true);
    if (typeof IntersectionObserver === 'undefined') { go(); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [id, settled, drawing, loaded]);

  useEffect(() => {
    if (!drawing || !id) return;
    const cv = canvas.current, im = img.current, el = box.current;
    if (!cv || !im || !el || !im.naturalWidth) { drawnPictures.add(id); setDoneFor(id); return; }
    const k = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.max(64, Math.min(1200, Math.round(el.clientWidth * k)));
    cv.height = Math.max(64, Math.min(900, Math.round(el.clientHeight * k)));
    let reveal: CharcoalReveal;
    try { reveal = new CharcoalReveal(cv, im); } catch { drawnPictures.add(id); setDoneFor(id); return; }
    let raf = 0, stopped = false, lastScratch = -1e9;
    const t0 = performance.now();
    window.dispatchEvent(new CustomEvent(SFX_DOM_EVENT, { detail: 'pencil_tap' }));
    const finish = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      reveal.finish();
      drawnPictures.add(id);
      setDrawing(false);
      setDoneFor(id);
    };
    skip.current = finish;
    const tick = (now: number) => {
      if (stopped) return;
      const ms = now - t0;
      if (ms - lastScratch > 280 && ms < REVEAL_MS - 300) { lastScratch = ms; window.dispatchEvent(new CustomEvent(SFX_DOM_EVENT, { detail: 'scratch' })); }
      if (reveal.frame(ms)) finish(); else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); skip.current = null; };
  }, [drawing, id]);

  if (!id) return <div className="scene-picture painting" aria-live="polite"><span>{t('The Dungeon Master is drawing this moment…')}</span></div>;
  const src = `/pictures/${id}`;
  const cls = ['scene-picture', loaded && settled ? 'shown' : '', drawing ? 'drawing' : ''].filter(Boolean).join(' ');
  return (
    <>
      <button ref={box} type="button" className={cls} onClick={() => { if (drawing && skip.current) skip.current(); else setLarge(true); }} title={drawing ? undefined : t('Show larger')}>
        <img ref={img} src={src} alt={scene.title} onLoad={() => setLoaded(true)} />
        {drawing && <canvas ref={canvas} className="charcoal-canvas" aria-hidden="true" />}
      </button>
      {large && (
        <div className="picture-lightbox" role="dialog" aria-label={scene.title} onClick={() => setLarge(false)}>
          <figure><img src={src} alt={scene.title} /><figcaption>{scene.title}</figcaption></figure>
        </div>
      )}
    </>
  );
}

/** Where a scene plays, when, and who is there besides the heroes: the line under a scene card's title. */
function SceneStage({ scene }: { scene: SceneMeta }) {
  const t = useT();
  const parts = [scene.where!, ...(scene.time ? [t(scene.time)] : [])];
  return (
    <div className="scene-where">
      <Icon name="pin" size={14} />
      <span>{parts.join(' · ')}</span>
      {scene.present && scene.present.length > 0 && <span className="present">· <RichText text={t('Present: {names}', { names: scene.present.join(', ') })} /></span>}
    </div>
  );
}

interface FeedProps {
  state: GameState;
  conn: Connection;
  /** Narrow log beside the battle map instead of the main story column. */
  compact?: boolean;
  /** The last log entry of the fight that just ended: the first scene after it opens with a divider. */
  afterFight?: number;
  /** In a fight: the log beside the map starts at the fight, with a divider for each round. */
  battle?: CombatState | null;
}

/** The story: scene cards, what players said, dice and system notes, plus the box to act in. */
/** The Dungeon Master proposed a trip to another place. Nothing moves until the table confirms it. */
function TripCard({ state, conn }: { state: GameState; conn: Connection }) {
  const t = useT();
  const { lang } = useLang();
  const trip = state.trip!;
  const voted = trip.yes.includes(playerId);
  const host = state.hostId === playerId;
  const solo = state.players.filter((p) => p.connected).length <= 1;
  return (
    <div className="trip-card" role="group" aria-label={t('Travel to {place}?', { place: trip.name })}>
      <b>{t('Travel to {place}?', { place: trip.name })}</b>
      <span className="muted small">{t('{n} miles', { n: trip.miles })} · {formatHours(trip.hours, lang)}</span>
      {!solo && <span className="muted small">{t('{n} of {m} agree', { n: trip.yes.length, m: trip.needed })}</span>}
      <div className="trip-buttons">
        <button className="primary" disabled={voted && !host} onClick={() => conn.send({ t: 'trip', go: true })}>{voted && !host ? t('Waiting for the others…') : t('Set out')}</button>
        <button onClick={() => conn.send({ t: 'trip', go: false })}>{t('Stay here')}</button>
      </div>
    </div>
  );
}

export function StoryFeed({ state, conn, compact, afterFight, battle }: FeedProps) {
  const t = useT();
  const { lang } = useLang();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  // Entries already on screen when the feed mounts appear instantly; later ones animate in.
  const seen = useRef(state.log[state.log.length - 1]?.id ?? 0);
  const last = state.log[state.log.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [last?.id, state.dmBusy]);

  const signal = useTypingSignal(conn, 'story');
  const [ooc, setOoc] = useState(false);
  const say = useCallback((line: string, question = false, skill?: string | null) => { if (line.trim()) conn.send({ t: 'say', text: line.trim(), ...(question ? { ooc: true } : {}), ...(skill ? { skill } : {}) }); }, [conn]);
  const asking = ooc || parseOoc(text) !== null;
  const exploring = state.phase === 'explore';
  // Suggestions belong to the newest scene. Each player keeps them until they have answered it themselves.
  const me = state.players.find((p) => p.id === playerId)?.name;
  const sceneAt = state.log.reduce((at, l, i) => (l.kind === 'dm' ? i : at), -1);
  const answered = state.log.slice(sceneAt + 1).some((l) => l.kind === 'chat' && l.speaker === me);
  const chips = exploring && !state.dmBusy && !state.travelling && sceneAt >= 0 && !answered ? state.log[sceneAt].scene?.actions ?? [] : [];
  const chipSkills = sceneAt >= 0 ? state.log[sceneAt].scene?.actionSkills ?? [] : [];
  // A tagged choice shows the skill and the bonus of the player's own hero (the first one still standing).
  const myHero = state.characters.find((c) => c.ownerId === playerId && !c.dead && c.hp > 0) ?? state.characters.find((c) => c.ownerId === playerId);
  // The newest line of mine that the Dungeon Master has not started on can still be taken back.
  const takeBackId = state.unanswered.filter((u) => u.playerId === playerId).pop()?.logId;
  const writing = state.players.filter((p) => p.id !== playerId && conn.typing[p.id] === 'story').map((p) => p.name);
  // Number keys pick a suggested action, as in a dialogue menu, when nobody is typing and no window is open.
  useEffect(() => {
    if (!chips.length || compact) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      if (!/^[1-9]$/.test(e.key) || document.querySelector('.overlay')) return;
      const action = chips[Number(e.key) - 1];
      if (action) { e.preventDefault(); say(action); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [chips.join('\n'), compact, say]);
  usePortraitTick();
  // The hero each player plays, so what they say and do in the story carries the hero's face.
  const heroOf = (speaker?: string) => {
    const player = state.players.find((p) => p.name === speaker);
    const c = player && state.characters.find((h) => h.ownerId === player.id);
    return c ? { name: c.name, image: heroPortraitUrl(artOfCharacter(c, state.items), 144) } : undefined;
  };
  const dividerAt = afterFight === undefined ? undefined : state.log.find((l) => l.id > afterFight && l.kind === 'dm')?.id;
  // The battle log: only this fight, round by round. The story before it is one click away.
  const [earlier, setEarlier] = useState(false);
  const from = compact && battle?.logFrom !== undefined && !earlier ? battle.logFrom : undefined;
  const shown = from === undefined ? state.log : state.log.filter((l) => l.id >= from);
  const roundAt = new Map<number, number>();
  if (compact && battle?.roundFrom) {
    battle.roundFrom.forEach((id, i) => { const first = state.log.find((l) => l.id >= id); if (first && !roundAt.has(first.id)) roundAt.set(first.id, i + 1); });
  }

  return (
    <section className={compact ? 'story compact' : 'story'}>
      <div className="feed">
        {compact && battle?.logFrom !== undefined && (
          <button type="button" className="link earlier-story" aria-expanded={earlier} onClick={() => setEarlier(!earlier)}>
            {earlier ? t('Show only the battle') : t('Show the story before the battle')}
          </button>
        )}
        {shown.map((l) => (
          <Fragment key={l.id}>
            {roundAt.has(l.id) && <div className="round-divider" role="separator"><span>{t('Round {n}', { n: roundAt.get(l.id)! })}</span></div>}
            {l.id === dividerAt && <div className="after-battle" role="separator"><span>{t('After the battle')}</span></div>}
            <Entry items={state.items} entry={l} table={state.room} lang={state.language} animate={l.id > seen.current} hero={l.kind === 'chat' ? heroOf(l.speaker) : undefined} takeBack={l.id === takeBackId ? () => conn.send({ t: 'unsay' }) : undefined} />
          </Fragment>
        ))}
        {state.dmBusy && <p className="line typing">{state.phase === 'combat' ? t('The Dungeon Master is thinking…') : t('The Dungeon Master is writing…')}</p>}
        {state.travelling && <p className="line typing">{t('On the road…')}</p>}
        {state.gathering && !state.dmBusy && <p className="line typing">{answered ? t('The Dungeon Master gives the others a moment to act…') : t('The Dungeon Master is listening. Say what you do, and it is resolved together with the others.')}</p>}
        {writing.length > 0 && <p className="line typing">{writing.length === 1 ? t('{name} is writing…', { name: writing[0] }) : t('{names} are writing…', { names: writing.join(', ') })}</p>}
        <div ref={end} />
      </div>
      {state.trip && exploring && !state.travelling && <TripCard state={state} conn={conn} />}
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((a, i) => {
            const skill = chipSkills[i] ?? null;
            const bonus = skill && myHero ? skillBonus(myHero, skill) : null;
            const tip = skill ? (bonus !== null && myHero ? t('{skill} check: {name} adds {bonus}. The Dungeon Master decides whether to roll, and how hard it is.', { skill: t(skill), name: myHero.name, bonus: plusMinus(bonus) }) : t('{skill} check', { skill: t(skill) })) : undefined;
            return (
              <button key={i} className={skill ? 'chip-action tagged' : 'chip-action'} data-pick={i + 1} title={tip} onClick={() => say(a, false, skill)}>
                {i < 9 && <kbd className="kbd">{i + 1}</kbd>}
                {skill && <span className="chip-skill"><SkillGlyph skill={skill} /><span className="cap">{t(skill)}</span>{bonus !== null && <b>{plusMinus(bonus)}</b>}</span>}
                {a}
              </button>
            );
          })}
        </div>
      )}
      <form
        className={asking ? 'composer ooc' : 'composer'}
        onSubmit={(e) => { e.preventDefault(); say(text, ooc); setText(''); setOoc(false); signal(''); }}
      >
        <span className="quill" aria-hidden>✒</span>
        <input value={text} onChange={(e) => { setText(e.target.value); signal(e.target.value); }} maxLength={500} placeholder={asking ? t('Ask the Dungeon Master out of character…') : exploring ? t('What do you do? Say or try anything…') : t('Speak to the Dungeon Master…')} />
        <MicButton lang={lang} text={text} setText={(v) => { setText(v); signal(v); }} />
        <button type="button" className="ooc-toggle" aria-pressed={asking} disabled={!ooc && parseOoc(text) !== null} title={t('Out-of-character question: answered as a note, the story does not move on')} onClick={() => setOoc(!ooc)}>{t('Ask the DM')}</button>
        <button className="primary" disabled={!text.trim()} title={t('Enter')}>{t('Send')}</button>
      </form>
    </section>
  );
}

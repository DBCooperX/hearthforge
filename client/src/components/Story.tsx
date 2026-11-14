import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CLASS_INFO, ITEMS } from '../../../shared/content';
import { HEX_MILES, direction, hexDistance } from '../../../shared/hex';
import type { GameState, LogEntry, RollInfo } from '../../../shared/types';
import { spriteUrl } from '../game/sprites';
import type { Connection } from '../net';
import { KIND_ICON } from './HexMap';

// ------------------------------------------------------------- entities

/** Something the story can mention by name: hovering it shows what the party knows. */
export interface Entity {
  name: string;
  kind: 'npc' | 'place' | 'item' | 'hero';
  icon: string;
  image?: string;
  subtitle: string;
  description: string;
  facts: string[];
}

export function buildEntities(state: GameState): Entity[] {
  const out: Entity[] = [];
  const w = state.world;
  const placeName = (id: string | null) => w?.locations.find((l) => l.id === id)?.name;
  for (const n of state.memory.npcs) {
    const facts = [`Disposition: ${n.disposition}`];
    const at = placeName(n.locationId);
    if (at) facts.push(`Last seen: ${at}`);
    out.push({ name: n.name, kind: 'npc', icon: '🧑', subtitle: n.role || 'Someone you have met', description: n.description, facts: [...facts, ...n.notes] });
  }
  for (const l of w?.locations ?? []) {
    const d = hexDistance(w!.party, l);
    const facts = [d === 0 ? 'You are here' : `${d * HEX_MILES} miles to the ${direction(w!.party, l)}`, l.visited ? 'Visited' : 'Not yet visited'];
    if (l.dungeon) facts.push(l.dungeon.cleared >= l.dungeon.total ? 'Cleared' : `${l.dungeon.cleared} of ${l.dungeon.total} sections cleared`);
    const parent = placeName(l.parentId);
    out.push({ name: l.name, kind: 'place', icon: KIND_ICON[l.kind], subtitle: parent ? `${l.kind} in ${parent}` : l.kind, description: l.description, facts });
  }
  for (const c of state.characters) {
    out.push({
      name: c.name, kind: 'hero', icon: '🛡️', image: spriteUrl(c.classId), subtitle: `Level ${c.level} ${c.className}`, description: CLASS_INFO[c.classId].blurb,
      facts: [`HP ${c.hp}/${c.maxHp} · AC ${c.ac}`, state.players.find((p) => p.id === c.ownerId)?.name ? `Played by ${state.players.find((p) => p.id === c.ownerId)!.name}` : ''].filter(Boolean),
    });
  }
  for (const i of Object.values(ITEMS)) {
    out.push({ name: i.name, kind: 'item', icon: i.icon, subtitle: `${i.rarity ? `${i.rarity} ` : ''}${i.kind}`, description: i.description, facts: [`Worth ${i.value} gp`] });
  }
  return out;
}

interface Hover {
  show: (e: Entity, el: HTMLElement) => void;
  hide: () => void;
}
const HoverContext = createContext<{ entities: Entity[]; pattern: RegExp | null; hover: Hover }>({ entities: [], pattern: null, hover: { show: () => {}, hide: () => {} } });

/** Provides entity highlighting and one shared hover card to everything inside it. */
export function EntityProvider({ state, children }: { state: GameState; children: ReactNode }) {
  const [card, setCard] = useState<{ entity: Entity; x: number; y: number; below: boolean } | null>(null);
  const entities = useMemo(() => buildEntities(state), [state.memory, state.world?.locations, state.world?.party, state.characters, state.players]);
  const pattern = useMemo(() => {
    const names = [...new Set(entities.map((e) => e.name))].filter((n) => n.length > 2).sort((a, b) => b.length - a.length);
    if (!names.length) return null;
    return new RegExp(`(?<![\\p{L}\\p{N}])(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  }, [entities]);
  const hover = useMemo<Hover>(() => ({
    show: (entity, el) => {
      const r = el.getBoundingClientRect();
      const below = r.top < 240;
      setCard({ entity, x: Math.max(12, Math.min(window.innerWidth - 312, r.left + r.width / 2 - 150)), y: below ? r.bottom + 8 : r.top - 8, below });
    },
    hide: () => setCard(null),
  }), []);
  const value = useMemo(() => ({ entities, pattern, hover }), [entities, pattern, hover]);
  return (
    <HoverContext.Provider value={value}>
      {children}
      {card && (
        <div className={`hovercard ${card.entity.kind}`} style={{ left: card.x, top: card.y, transform: card.below ? undefined : 'translateY(-100%)' }}>
          <div className="hc-head">
            <span className="hc-portrait">{card.entity.image ? <img className="pixel" src={card.entity.image} alt="" /> : card.entity.icon}</span>
            <div>
              <b>{card.entity.name}</b>
              <small>{card.entity.subtitle}</small>
            </div>
          </div>
          {card.entity.description && <p>{card.entity.description}</p>}
          {card.entity.facts.length > 0 && <ul>{card.entity.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>}
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
      <span className={`d20 ${roll.die === 20 ? 'nat20' : roll.die === 1 ? 'nat1' : ''}`} title="d20">{rolling ? face : roll.die}</span>
      <div className="dice-body">
        <div className="dice-label"><RichText text={roll.actor} /> · {roll.label}{roll.target.name && <> → <RichText text={roll.target.name} /></>}</div>
        <div className="dice-math">
          {!rolling && (
            <>
              d20 <b>{roll.die}</b>
              {dropped !== undefined && <s title={roll.mode}>{dropped}</s>}
              {roll.mode !== 'normal' && <em>{roll.mode}</em>} {signed(roll.modifier)} = <b>{roll.total}</b> vs {roll.target.kind} {roll.target.value}
              <span className="outcome">{OUTCOME[roll.outcome]}</span>
              {roll.damage && <span className="damage">{roll.damage.amount} {roll.damage.type}</span>}
            </>
          )}
          {rolling && <span className="muted">rolling…</span>}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- feed

function Entry({ entry, animate }: { entry: LogEntry; animate: boolean }) {
  switch (entry.kind) {
    case 'dm':
      return (
        <article className={`scene mood-${entry.scene?.mood ?? 'plain'} ${animate ? 'enter' : ''}`}>
          {entry.scene && <header><span className="mood-dot" />{entry.scene.title}<small>{entry.scene.mood}</small></header>}
          {entry.text.split(/\n{2,}/).map((p, i) => <p key={i}><RichText text={p} /></p>)}
        </article>
      );
    case 'chat':
      return <p className="said"><b>{entry.speaker}</b>{entry.text}</p>;
    case 'roll':
      return entry.roll ? <DiceRoll roll={entry.roll} animate={animate} /> : <p className="line roll"><RichText text={entry.text} /></p>;
    case 'levelup':
      return (
        <article className={`levelup ${animate ? 'enter' : ''}`}>
          <header>⭐ {entry.levelUp?.name} reaches level {entry.levelUp?.level}</header>
          <ul>{entry.levelUp?.gains.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </article>
      );
    default:
      return <p className="line system"><RichText text={entry.text} /></p>;
  }
}

interface FeedProps {
  state: GameState;
  conn: Connection;
  /** Narrow log beside the battle map instead of the main story column. */
  compact?: boolean;
}

/** The story: scene cards, what players said, dice and system notes, plus the box to act in. */
export function StoryFeed({ state, conn, compact }: FeedProps) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  // Entries already on screen when the feed mounts appear instantly; later ones animate in.
  const seen = useRef(state.log[state.log.length - 1]?.id ?? 0);
  const last = state.log[state.log.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [last?.id, state.dmBusy]);

  const say = useCallback((line: string) => { if (line.trim()) conn.send({ t: 'say', text: line.trim() }); }, [conn]);
  const exploring = state.phase === 'explore';
  // Suggestions belong to the newest scene and go stale once someone has answered it.
  const lastTalk = [...state.log].reverse().find((l) => l.kind === 'dm' || l.kind === 'chat');
  const chips = exploring && !state.dmBusy && !state.travelling && lastTalk?.kind === 'dm' ? lastTalk.scene?.actions ?? [] : [];

  return (
    <section className={compact ? 'story compact' : 'story'}>
      <div className="feed">
        {state.log.map((l) => <Entry key={l.id} entry={l} animate={l.id > seen.current} />)}
        {state.dmBusy && <p className="line typing">The Dungeon Master is {state.phase === 'combat' ? 'thinking' : 'writing'}…</p>}
        {state.travelling && <p className="line typing">On the road…</p>}
        <div ref={end} />
      </div>
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((a, i) => <button key={i} className="chip-action" onClick={() => say(a)}>{a}</button>)}
        </div>
      )}
      <form
        className="composer"
        onSubmit={(e) => { e.preventDefault(); say(text); setText(''); }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={exploring ? 'What do you do? Say or try anything…' : 'Speak to the Dungeon Master…'} />
        <button className="primary" disabled={!text.trim()}>Send</button>
      </form>
    </section>
  );
}

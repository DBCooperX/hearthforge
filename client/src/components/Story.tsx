import { itemArtUrl } from '../game/itemArt';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CLASS_INFO, ITEMS } from '../../../shared/content';
import { HEX_MILES, direction, hexDistance } from '../../../shared/hex';
import type { GameState, LogEntry, RollInfo } from '../../../shared/types';
import { monsterUrl } from '../game/monsterArt';
import { artOfCharacter, heroUrl } from '../game/heroArt';
import type { CreatureType, Size } from '../../../shared/monsterLook';
import { playerId, useTypingSignal, type Connection } from '../net';
import { KIND_ICON } from './HexMap';
import { useT, type Translate } from '../i18n';
import { tr } from '../../../shared/i18n';
import { classLabel } from '../game/util';

// ------------------------------------------------------------- entities

/** Something the story can mention by name: hovering it shows what the party knows. */
export interface Entity {
  name: string;
  kind: 'npc' | 'place' | 'item' | 'hero' | 'monster';
  icon: string;
  image?: string;
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
    out.push({ name: n.name, kind: 'npc', icon: '🧑', subtitle: n.role || t('Someone you have met'), description: n.description, facts: [...facts, ...n.notes] });
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
      name: c.name, kind: 'hero', icon: '🛡️', image: heroUrl(artOfCharacter(c, state.items)), subtitle: t('Level {level} {class}', { level: c.level, class: classLabel(c, t) }), description: t(CLASS_INFO[c.classId].blurb),
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
      const facts = [`${t('HP')} ${m.hp}/${m.maxHp} · ${t('AC')} ${m.ac}`];
      if (m.tiles > 1) facts.push(t('Takes up {n} by {n} squares', { n: m.tiles }));
      if (m.senses?.darkvision) facts.push(t('Darkvision {n} ft', { n: m.senses.darkvision }));
      if (m.senses?.blindsight) facts.push(t('Blindsight {n} ft', { n: m.senses.blindsight }));
      if (m.light) facts.push(t('Carries a light'));
      out.push({ name: m.name, kind: 'monster', icon: '👹', image: monsterUrl(m.look), subtitle: `${sizes[m.look.size]} · ${kinds[m.kind]}`, description: m.description, facts });
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
  show: (e: Entity, el: HTMLElement) => void;
  hide: () => void;
}
const HoverContext = createContext<{ entities: Entity[]; pattern: RegExp | null; hover: Hover }>({ entities: [], pattern: null, hover: { show: () => {}, hide: () => {} } });

/** The known entities and the shared hover card, for things outside the story feed such as the battle map. */
export const useEntityHover = () => useContext(HoverContext);

/** Provides entity highlighting and one shared hover card to everything inside it. */
export function EntityProvider({ state, children }: { state: GameState; children: ReactNode }) {
  const t = useT();
  const [card, setCard] = useState<{ entity: Entity; x: number; y: number; below: boolean } | null>(null);
  const entities = useMemo(() => buildEntities(state, t), [state.memory, state.items, state.world?.locations, state.world?.party, state.characters, state.monsters, state.phase, state.players, state.language, t]);
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
            <span className="hc-portrait">{card.entity.image ? <img className={card.entity.image.endsWith('.svg') ? '' : 'pixel'} src={card.entity.image} alt="" /> : card.entity.icon}</span>
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
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- feed

function Entry({ entry, animate, takeBack }: { entry: LogEntry; animate: boolean; takeBack?: () => void }) {
  const t = useT();
  switch (entry.kind) {
    case 'dm':
      return (
        <article className={`scene mood-${entry.scene?.mood ?? 'plain'} ${animate ? 'enter' : ''}`}>
          {entry.scene && <header><span className="mood-dot" />{entry.scene.title}<small>{t(entry.scene.mood)}</small></header>}
          {entry.text.split(/\n{2,}/).map((p, i) => <p key={i}><RichText text={p} /></p>)}
        </article>
      );
    case 'chat':
      return <p className="said"><b>{entry.speaker}</b>{entry.text}{takeBack && <button type="button" className="takeback" onClick={takeBack}>↩ {t('Take back')}</button>}</p>;
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
  const t = useT();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  // Entries already on screen when the feed mounts appear instantly; later ones animate in.
  const seen = useRef(state.log[state.log.length - 1]?.id ?? 0);
  const last = state.log[state.log.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [last?.id, state.dmBusy]);

  const signal = useTypingSignal(conn, 'story');
  const say = useCallback((line: string) => { if (line.trim()) conn.send({ t: 'say', text: line.trim() }); }, [conn]);
  const exploring = state.phase === 'explore';
  // Suggestions belong to the newest scene. Each player keeps them until they have answered it themselves.
  const me = state.players.find((p) => p.id === playerId)?.name;
  const sceneAt = state.log.reduce((at, l, i) => (l.kind === 'dm' ? i : at), -1);
  const answered = state.log.slice(sceneAt + 1).some((l) => l.kind === 'chat' && l.speaker === me);
  const chips = exploring && !state.dmBusy && !state.travelling && sceneAt >= 0 && !answered ? state.log[sceneAt].scene?.actions ?? [] : [];
  // The newest line of mine that the Dungeon Master has not started on can still be taken back.
  const takeBackId = state.unanswered.filter((u) => u.playerId === playerId).pop()?.logId;
  const writing = state.players.filter((p) => p.id !== playerId && conn.typing[p.id] === 'story').map((p) => p.name);

  return (
    <section className={compact ? 'story compact' : 'story'}>
      <div className="feed">
        {state.log.map((l) => <Entry key={l.id} entry={l} animate={l.id > seen.current} takeBack={l.id === takeBackId ? () => conn.send({ t: 'unsay' }) : undefined} />)}
        {state.dmBusy && <p className="line typing">{state.phase === 'combat' ? t('The Dungeon Master is thinking…') : t('The Dungeon Master is writing…')}</p>}
        {state.travelling && <p className="line typing">{t('On the road…')}</p>}
        {state.gathering && !state.dmBusy && <p className="line typing">{answered ? t('The Dungeon Master gives the others a moment to act…') : t('The Dungeon Master is listening. Say what you do, and it is resolved together with the others.')}</p>}
        {writing.length > 0 && <p className="line typing">{writing.length === 1 ? t('{name} is writing…', { name: writing[0] }) : t('{names} are writing…', { names: writing.join(', ') })}</p>}
        <div ref={end} />
      </div>
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((a, i) => <button key={i} className="chip-action" onClick={() => say(a)}>{a}</button>)}
        </div>
      )}
      <form
        className="composer"
        onSubmit={(e) => { e.preventDefault(); say(text); setText(''); signal(''); }}
      >
        <input value={text} onChange={(e) => { setText(e.target.value); signal(e.target.value); }} maxLength={500} placeholder={exploring ? t('What do you do? Say or try anything…') : t('Speak to the Dungeon Master…')} />
        <button className="primary" disabled={!text.trim()}>{t('Send')}</button>
      </form>
    </section>
  );
}

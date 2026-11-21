import { useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { ABILITIES } from '../../../shared/content';
import { RESOURCES, SLOT_COST, hasFeature, maxSpellLevelFor, resourceLeft } from '../../../shared/classes';
import { castLevel, diceAtLevel, upcastable } from '../../../shared/spells';
import { LIGHT_ITEMS } from '../../../shared/light';
import { itemDef } from '../../../shared/items';
import { isLightWeapon } from '../../../shared/build';
import { OPPORTUNITY_MODES, type Character, type GameState, type OpportunityMode } from '../../../shared/types';
import type { Connection } from '../net';
import { useLang, useT } from '../i18n';
import { dice } from './Guide';
import { Hint } from '../ui/Hint';
import { usePrefs } from '../ui/prefs';
import { AbilityGlyph, Glyph } from '../ui/Glyph';
import {
  HOTBAR_DRAG, HOTBAR_ROW, abilityRef, itemRef, loadHotbar, parseRef, placeOnHotbar, removeFromHotbar, saveHotbar, syncHotbar,
  type HotbarDrag, type HotbarLayout,
} from '../game/hotbar';

/** Powers that stay on once used, and the chip that shows them. */
const ACTIVE: Record<string, string> = {
  rage: 'raging', reckless: 'reckless', sacred_weapon: 'sacred weapon', innate_sorcery: 'innate sorcery',
  superior_defense: 'superior defense', holy_nimbus: 'holy nimbus', natures_veil: 'invisible', dodge: 'dodging',
};

export type Targeting = { kind: 'attack' } | { kind: 'offhand' } | { kind: 'ability'; abilityId: string; level?: number; item?: string } | { kind: 'item'; uid: string } | null;

export function TurnBar({ state }: { state: GameState }) {
  const t = useT();
  const combat = state.combat;
  if (!combat) return null;
  const name = (id: string) => state.characters.find((c) => c.id === id)?.name ?? state.monsters.find((m) => m.id === id)?.name ?? '???';
  return (
    <div className="turnbar">
      <span className="phase combat">{t('Round {n}', { n: combat.round })}</span>
      <div className="order">
        {combat.order.map((o, i) => {
          const m = state.monsters.find((x) => x.id === o.id);
          const c = state.characters.find((x) => x.id === o.id);
          const out = m ? !m.alive : c ? c.dead || c.hp <= 0 : true;
          return (
            <span key={o.id} className={['init', o.kind, i === combat.turnIndex && 'now', out && 'out', o.surprised && 'surprised', o.ambush && 'ambush'].filter(Boolean).join(' ')}
              title={[o.ambush ? t('Struck first, from hiding') : `${t('Initiative')} ${o.initiative}`, o.surprised ? t('Caught unawares: rolled initiative with Disadvantage') : ''].filter(Boolean).join(' · ')}>
              {o.ambush && <span className="init-mark" aria-hidden>🗡</span>}
              {name(o.id)}
              {o.surprised && <span className="init-mark surprised" aria-label={t('Caught unawares')}>!</span>}
            </span>
          );
        })}
      </div>
      {state.dmBusy && <span className="thinking">{t('The Dungeon Master is thinking…')}</span>}
    </div>
  );
}

/** What a hotbar entry spends: the colour of its frame. */
type Cost = 'action' | 'bonus' | 'reaction' | 'free';
const COST_LABEL: Record<Cost, string> = { action: 'Action', bonus: 'Bonus action', reaction: 'Reaction', free: 'Free' };

/** One button on the bar, whatever it is: an action, a spell, a feature or a wand. */
interface Entry {
  ref: string;
  name: string;
  icon: ReactNode;
  cost: Cost;
  /** Mana it costs, and uses or charges left. */
  mana?: number;
  uses?: number;
  /** Why it cannot be used now; empty when it can. */
  why: string;
  /** Casts itself when its moment comes. */
  auto?: boolean;
  on?: boolean;
  /** The tooltip, without the reason. */
  tip: ReactNode;
  /** A warning that does not stop it, such as no enemy in range yet. */
  warn?: string;
  run?: () => void;
}

interface ActionBarProps {
  state: GameState;
  /** The hero whose turn it is, when it is one of the player's. Only they can act. */
  actor: Character | null;
  /** The hero whose bar is shown: the actor, or the player's selected hero while others act. */
  hero: Character | null;
  targeting: Targeting;
  setTargeting: (t: Targeting) => void;
  conn: Connection;
  hint: string;
}

/** Abilities every hero has, which sit with the common actions rather than on the hotbar. */
const COMMON_IDS = ['dodge'];

export function ActionBar({ state, actor, hero, targeting, setTargeting, conn, hint }: ActionBarProps) {
  const t = useT();
  const { lang } = useLang();
  const combat = state.phase === 'combat' ? state.combat : null;
  const me = hero ?? actor;
  const canAct = !!actor && !!me && actor.id === me.id && actor.hp > 0;
  const actionUsed = !!combat?.actionUsed;
  const nudge = useTurnNudge(canAct, combat, state.log.length);
  const [book, setBook] = useState(false);
  const [castAt, setCastAt] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [layouts, setLayouts] = useState<Record<string, HotbarLayout>>({});

  const items = me ? [...Object.values(me.equipment), ...me.bag] : [];
  const potion = me?.bag.find((b) => b && itemDef(state.items, b.defId)?.consumable?.heal) ?? null;
  const potions = me?.bag.reduce((n, b) => n + (b && itemDef(state.items, b.defId)?.consumable?.heal ? b.qty : 0), 0) ?? 0;
  // Wands from the bag, and staffs, rings and amulets worn, that hold a spell.
  const wands = me ? [...Object.values(me.equipment), ...me.bag.filter((b) => b && !itemDef(state.items, b.defId)?.slot && !itemDef(state.items, b.defId)?.weapon)]
    .filter((b): b is NonNullable<typeof b> => !!b && !!itemDef(state.items, b.defId)?.casts && !!ABILITIES[itemDef(state.items, b.defId)!.casts!.spell]) : [];
  const hasLight = !!me && LIGHT_ITEMS.some((l) => items.some((b) => b?.defId === l.itemId));
  const held = me?.effects?.find((e) => e.escapeDc) ?? null;
  const known = me ? me.abilityIds.filter((id) => ABILITIES[id] && !COMMON_IDS.includes(id)) : [];
  const isSpell = (id: string) => ABILITIES[id].spellLevel !== undefined && ABILITIES[id].kind !== 'feature';
  const spells = known.filter((id) => (ABILITIES[id].spellLevel ?? 0) > 0 && isSpell(id));
  const levels = [...new Set(spells.map((id) => ABILITIES[id].spellLevel!))].sort((a, b) => a - b);
  const top = me ? Math.max(maxSpellLevelFor(me.classId, me.level), ...levels, 0) : 0;

  // What the hotbar may hold, in the order new things are placed: features, cantrips, spells by level, wands.
  const order = (id: string) => (!isSpell(id) ? 0 : ABILITIES[id].kind === 'react' ? 20 : 1 + (ABILITIES[id].spellLevel ?? 0));
  const available = [...[...known].sort((a, b) => order(a) - order(b)).map(abilityRef), ...wands.map((w) => itemRef(w.uid))];
  // Spells that take minutes to cast wait in the spellbook unless the player puts them on the bar.
  const autoPlace = available.filter((r) => !(r.startsWith('ab:') && ABILITIES[r.slice(3)].slow));
  const availKey = available.join('|');
  const layout = useMemo(() => (me ? syncHotbar(layouts[me.id] ?? loadHotbar(me.id), available, autoPlace) : null), [me?.id, availKey, layouts]);
  useEffect(() => {
    if (me && layout && JSON.stringify(loadHotbar(me.id)) !== JSON.stringify(layout)) saveHotbar(me.id, layout);
  }, [me?.id, layout]);
  const setLayout = (l: HotbarLayout) => { if (!me) return; saveHotbar(me.id, l); setLayouts((all) => ({ ...all, [me.id]: l })); };

  if (!me || !combat) return <div className="actionbar"><div className="hint">{hint}</div></div>;
  const c = me;
  const turnName = state.characters.find((x) => x.id === combat.order[combat.turnIndex]?.id)?.name ?? state.monsters.find((x) => x.id === combat.order[combat.turnIndex]?.id)?.name ?? '';
  const reacted = !!combat.reacted?.includes(c.id);
  const toggle = (tg: NonNullable<Targeting>) => setTargeting(JSON.stringify(targeting) === JSON.stringify(tg) ? null : tg);

  /** Why nothing can be done right now, before looking at the button itself. */
  const general = !canAct ? (c.hp <= 0 ? t('{name} is down.', { name: c.name }) : t('Not your turn: {name} is acting.', { name: turnName })) : '';
  const spentWhy = (cost: Cost) => cost === 'action' ? t('You have already used your action this turn.') : cost === 'bonus' ? t('You have already used your bonus action this turn.') : '';
  /** The nearest enemy anyone can see, in feet, for spells with a range. */
  const nearest = Math.min(9999, ...state.monsters.filter((m) => m.alive).map((m) => {
    const dx = Math.max(0, m.x - c.x, c.x - (m.x + m.tiles - 1)), dy = Math.max(0, m.y - c.y, c.y - (m.y + m.tiles - 1));
    return Math.max(dx, dy) * 5;
  }));

  /** An action, a class feature or a spell, with what it costs and why it may be out of reach. */
  function abilityEntry(id: string): Entry {
    const ab = ABILITIES[id];
    const base = ab.spellLevel ?? 0;
    const sustained = !!ab.sustain && c.sustain?.spell === id;
    const level = sustained ? c.sustain!.level : base > 0 && upcastable(ab) ? castLevel(ab, castAt ?? base, top) : base;
    const spent = ab.oncePerRest && c.spent.includes(id);
    const bonus = sustained ? ab.sustain === 'bonus' : !!ab.bonusAction;
    const cost: Cost = ab.kind === 'react' ? 'reaction' : ab.kind === 'surge' || ab.free ? 'free' : bonus ? 'bonus' : 'action';
    const used = ab.kind === 'surge' ? !actionUsed : cost === 'bonus' ? combat!.bonusUsed : cost === 'action' ? actionUsed : false;
    // Class resources: rages, focus points, Channel Divinity. Some spells have free castings before they cost mana.
    const pool = id === 'lay_on_hands' ? 'lay_on_hands' : id === 'hunters_mark' ? 'favored_enemy' : id === 'divine_smite' ? 'free_smite' : ab.resource;
    const left = pool ? resourceLeft(c, pool) : null;
    const freeCast = (id === 'hunters_mark' || id === 'divine_smite') && (left ?? 0) > 0;
    const mana = sustained ? 0 : id === 'hunters_mark' || id === 'divine_smite' ? (freeCast ? 0 : 2) : level > base ? SLOT_COST[level - 1] : ab.cost;
    const dry = left !== null && !mana && left < (ab.resourceCost ?? 1);
    const barred = ab.spellLevel !== undefined && (c.conditions.includes('raging') || (!!c.form && !hasFeature(c, 'beast_spells')));
    const active = !!ACTIVE[id] && c.conditions.includes(ACTIVE[id]);
    const react = ab.kind === 'react';
    const reactWhy = t('Casts itself at the right moment, so there is nothing to click. It needs your reaction and the mana.');
    const why = react ? (reacted ? t('Your reaction is used until your next turn.') : c.mana < mana ? t('Not enough mana: it needs {n}, you have {m}.', { n: mana, m: c.mana }) : '')
      : id.startsWith('wild_shape_') && c.form ? t('You are already in beast form.')
      : id === 'revert_form' && !c.form ? t('Only in beast form.')
      : ab.slow ? t('Takes minutes to cast, so not in a fight.')
      : general
      || (spent ? t('Already used. It comes back after a rest.')
      : barred ? (c.form ? t('No spells in beast form.') : t('No spells while raging.'))
      : dry ? t('None left. It comes back after a rest.')
      : c.mana < mana ? t('Not enough mana: it needs {n}, you have {m}.', { n: mana, m: c.mana })
      : active ? t('Already active.')
      : ab.kind === 'surge' && used ? t('Use your action first. Action Surge then gives you another one.')
      : used ? spentWhy(cost) : '');
    const facts = [
      ab.spellLevel === undefined ? '' : base === 0 ? t('Cantrip') : t('Spell level {n}', { n: base }),
      level > base ? t('Cast at level {n}', { n: level }) : '',
      sustained ? t('Free again this turn') : '',
      ab.range > 5 ? t('Range {n} ft', { n: ab.range }) : ab.range === 5 ? t('Touch') : '', ab.dice ? dice(diceAtLevel(ab, level) ?? ab.dice, lang) : '',
      ab.concentration ? t('Concentration') : '',
      left !== null && pool && RESOURCES[pool] ? `${t(RESOURCES[pool].name)}: ${left}` : '',
    ].filter(Boolean).join(' · ');
    const warn = !why && ab.target === 'enemy' && ab.range > 5 && nearest > ab.range ? t('No enemy in range yet ({n} ft). Move closer first.', { n: ab.range })
      : !why && ab.target === 'enemy' && ab.range === 5 && nearest > 5 ? t('No enemy within reach yet. Move next to one first.') : '';
    return {
      ref: abilityRef(id), name: t(ab.name), icon: <AbilityGlyph def={ab} />, cost, mana: mana > 0 ? mana : undefined,
      uses: left !== null && !(mana > 0) ? left : undefined, why, auto: react, warn,
      on: active || sustained || (targeting?.kind === 'ability' && targeting.abilityId === id && !targeting.item),
      tip: <>{t(ab.description)}{facts && <em>{facts}</em>}{react && <em className="info-line">{reactWhy}</em>}</>,
      run: () => {
        const lv = level > base ? level : undefined;
        if (ab.target === 'self') { conn.send({ t: 'ability', characterId: c.id, abilityId: id, ...(lv ? { level: lv } : {}) }); setTargeting(null); }
        else toggle({ kind: 'ability', abilityId: id, ...(lv ? { level: lv } : {}) });
      },
    };
  }

  /** A wand or staff: its spell at the item's level, for no mana, while charges last. */
  function itemEntry(uid: string): Entry | null {
    const it = items.find((b) => b?.uid === uid);
    const def = it && itemDef(state.items, it.defId);
    if (!it || !def?.casts) return null;
    const cast = def.casts;
    const ab = ABILITIES[cast.spell];
    const left = cast.charges - (it.used ?? 0);
    const cost: Cost = ab.bonusAction ? 'bonus' : 'action';
    const used = ab.bonusAction ? combat!.bonusUsed : actionUsed;
    const facts = [t('Cast at level {n}', { n: cast.level }), ab.range > 5 ? t('Range {n} ft', { n: ab.range }) : '', ab.dice ? dice(diceAtLevel(ab, cast.level) ?? ab.dice, lang) : ''].filter(Boolean).join(' · ');
    return {
      ref: itemRef(uid), name: t(def.name), icon: def.icon, cost, uses: left,
      why: general || (left <= 0 ? t('No charges left until a long rest.') : used ? spentWhy(cost) : ''),
      on: targeting?.kind === 'ability' && targeting.item === uid,
      tip: <>{t(ab.name)}: {t(ab.description)}<em>{facts}</em></>,
      run: () => {
        if (ab.target === 'self') { conn.send({ t: 'use_item', characterId: c.id, uid }); setTargeting(null); }
        else toggle({ kind: 'ability', abilityId: ab.id, item: uid });
      },
    };
  }

  const entryOf = (ref: string): Entry | null => {
    const p = parseRef(ref);
    if (!p) return null;
    return p.kind === 'ab' ? (ABILITIES[p.id] ? abilityEntry(p.id) : null) : itemEntry(p.id);
  };

  // The common actions: always there, in a fixed place.
  const cunning = hasFeature(c, 'cunning_action');
  const twoWeapons = isLightWeapon(itemDef(state.items, c.equipment.mainHand?.defId ?? '')) && isLightWeapon(itemDef(state.items, c.equipment.offHand?.defId ?? '')) && !c.form;
  const common: Entry[] = [
    {
      ref: 'attack', name: t('Attack'), icon: <Glyph keys={['action:attack']} emoji="⚔️" />, cost: 'action',
      why: general || (actionUsed && combat.attacksLeft <= 0 ? spentWhy('action') : ''),
      on: targeting?.kind === 'attack',
      tip: <>{t('Attack with your main-hand weapon. You can also just click an enemy.')}{combat.attacksLeft > 0 && actionUsed && <em>{t('one more attack')}</em>}</>,
      run: () => toggle({ kind: 'attack' }),
    },
    ...(twoWeapons ? [{
      ref: 'offhand', name: t('Off-hand attack'), icon: <Glyph keys={['action:attack']} emoji="🗡️" />, cost: 'bonus' as Cost,
      why: general || (!combat.attacked ? t('Attack with your main hand first.') : combat.bonusUsed ? spentWhy('bonus') : ''),
      on: targeting?.kind === 'offhand',
      tip: <>{t('Two-weapon fighting: after attacking with a light weapon, a bonus action attacks with the light weapon in your other hand. Its damage adds no ability modifier.')}</>,
      run: () => toggle({ kind: 'offhand' }),
    }] : []),
    ...COMMON_IDS.filter((id) => c.abilityIds.includes(id)).map(abilityEntry),
    {
      ref: 'disengage', name: t('Disengage'), icon: <Glyph keys={['action:disengage']} emoji="🏃" />, cost: cunning ? 'bonus' : 'action',
      why: general || (combat.disengaged ? t('Already active.') : (cunning ? combat.bonusUsed && actionUsed : actionUsed) ? spentWhy(cunning ? 'bonus' : 'action') : ''),
      on: !!combat.disengaged,
      tip: <>{t('Until the end of your turn, leaving an enemy\'s reach invites no opportunity attack.')}{cunning && <em>{t('Bonus action (Cunning Action)')}</em>}</>,
      run: () => conn.send({ t: 'disengage', characterId: c.id }),
    },
    ...(potion ? [{
      ref: 'potion', name: t('Potion'), icon: <Glyph keys={['action:potion']} emoji="🧪" />, cost: 'action' as Cost, uses: potions,
      why: general || (actionUsed ? spentWhy('action') : ''), on: targeting?.kind === 'item',
      tip: t('Drink a healing potion, or feed it to an adjacent ally.'),
      run: () => toggle({ kind: 'item', uid: potion.uid }),
    }] : []),
    ...(held ? [{
      ref: 'escape', name: t('Break free'), icon: <Glyph keys={['action:escape']} emoji="💪" />, cost: 'action' as Cost,
      why: general || (actionUsed ? spentWhy('action') : ''),
      tip: t('Wrestle out of the grip: a Strength (Athletics) or Dexterity (Acrobatics) check against DC {dc}. Until you are free you cannot move.', { dc: held.escapeDc ?? 0 }),
      run: () => conn.send({ t: 'escape', characterId: c.id }),
    }] : []),
    ...(state.light?.ambient !== 'bright' && (c.light || hasLight) ? [{
      ref: 'light', name: c.light ? t('Put out the light') : t('Light a torch'), icon: <Glyph keys={['action:light']} emoji={c.light ? '🌑' : '🔥'} />,
      cost: (c.light ? 'free' : 'bonus') as Cost, on: !!c.light,
      why: general || (!c.light && combat.bonusUsed ? spentWhy('bonus') : ''),
      tip: c.light ? t('Darkness hides you from enemies without darkvision, but you cannot see them either. Free.') : t('Bright light for 20 ft and dim light 20 ft beyond (a lantern: 30 and 30). Enemies see you too. Bonus action.'),
      run: () => conn.send({ t: 'light', characterId: c.id, on: !c.light }),
    }] : []),
  ];

  const drop = (to: number) => (e: DragEvent) => {
    const raw = e.dataTransfer.getData(HOTBAR_DRAG);
    if (!raw || !layout) return;
    e.preventDefault();
    const d = JSON.parse(raw) as HotbarDrag;
    if (available.includes(d.ref)) setLayout(placeOnHotbar(layout, d.ref, to, d.from));
  };
  const dragStart = (ref: string, from?: number) => (e: DragEvent) => {
    e.dataTransfer.setData(HOTBAR_DRAG, JSON.stringify({ ref, from } satisfies HotbarDrag));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };

  const slots = layout?.slots ?? [];
  const onBar = new Set(slots.filter(Boolean));
  const bookGroups: { label: string; refs: string[] }[] = [
    { label: t('Actions and features'), refs: known.filter((id) => !isSpell(id)).map(abilityRef) },
    { label: t('Cantrips'), refs: known.filter((id) => isSpell(id) && (ABILITIES[id].spellLevel ?? 0) === 0).map(abilityRef) },
    ...levels.map((l) => ({ label: t('Spell level {n}', { n: l }), refs: spells.filter((id) => ABILITIES[id].spellLevel === l).map(abilityRef) })),
    { label: t('Wands and staffs'), refs: wands.map((w) => itemRef(w.uid)) },
  ].filter((g) => g.refs.length > 0);

  return (
    <div className={['actionbar', 'hotbar', dragging && 'dragging'].filter(Boolean).join(' ')} onDragEnd={() => setDragging(false)}>
      {book && (
        <div className="hb-book" onDragOver={(e) => e.preventDefault()}>
          <div className="hb-book-head">
            <b>{t('Spellbook')}</b>
            <span className="muted">{t('Drag onto the hotbar. Right-click a slot to clear it.')}</span>
            {top > 0 && (
              <span className="hb-castat">
                {t('Cast at level')}
                {[0, ...Array.from({ length: top }, (_, i) => i + 1)].map((l) => (
                  <button key={l} className={(castAt ?? 0) === l ? 'chip on' : 'chip'} onClick={() => setCastAt(l || null)}>{l ? l : t('own')}</button>
                ))}
              </span>
            )}
            <button className="chip close" onClick={() => setBook(false)} aria-label={t('Close')}>✕</button>
          </div>
          <div className="hb-book-body">
            {bookGroups.map((g) => (
              <div key={g.label} className="hb-book-group">
                <span className="hb-book-label">{g.label}</span>
                <div className="hb-book-slots">
                  {g.refs.map((r) => {
                    const en = entryOf(r);
                    return en && <Slot key={r} entry={en} small marked={onBar.has(r)} draggable onDragStart={dragStart(r)} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="hb-top">
        <Economy state={state} hero={c} active={canAct} />
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div className="hb-main">
        <div className="hb-common">
          {common.map((en) => <Slot key={en.ref} entry={en} />)}
          <Slot entry={{
            ref: 'book', name: t('Spellbook'), icon: <Glyph keys={['action:spellbook']} emoji="📖" />, cost: 'free', why: '', on: book,
            tip: t('All your spells and features, grouped by level. Drag them onto the hotbar, and pick a higher level to cast a spell more strongly.'),
            run: () => setBook(!book),
          }} />
        </div>
        <div className="hb-slots" onDragOver={(e) => e.preventDefault()}>
          {slots.map((ref, i) => {
            const en = ref ? entryOf(ref) : null;
            const key = i < HOTBAR_ROW ? String((i + 1) % 10) : undefined;
            if (!en) {
              return <div key={i} className="hb-slot empty" data-slot={i} onDragOver={(e) => e.preventDefault()} onDrop={drop(i)}>{key && <i className="hk">{key}</i>}</div>;
            }
            return (
              <Slot key={i} entry={en} hotkey={key} draggable
                onDragStart={dragStart(ref!, i)}
                onDragEnd={(e) => { setDragging(false); if (e.dataTransfer.dropEffect === 'none' && layout) setLayout(removeFromHotbar(layout, i)); }}
                onDrop={drop(i)}
                onContextMenu={(e) => { e.preventDefault(); if (layout) setLayout(removeFromHotbar(layout, i)); }} />
            );
          })}
        </div>
        <div className="hb-end">
          <OpportunitySwitch actor={c} conn={conn} />
          <Hint title={t('End turn')} text={<>{t('Hand the turn to the next in the initiative order.')}<em>{t('Space')}</em></>}>
            <button className={nudge ? 'hb-endturn nudge' : 'hb-endturn'} aria-disabled={!canAct} onClick={() => canAct && conn.send({ t: 'end_turn', characterId: c.id })}>
              <Glyph keys={['action:end_turn']} emoji="⏭️" />
              <span>{t('End turn')}</span>
            </button>
          </Hint>
        </div>
      </div>
    </div>
  );
}

/**
 * A gentle reminder to end the turn: after the player's chosen delay without doing anything on
 * their turn, or soon after the action and movement are used up. It never ends the turn.
 */
export function useTurnNudge(canAct: boolean, combat: GameState['combat'] | null, logLength: number): 'idle' | 'spent' | null {
  const { turnReminder } = usePrefs();
  const [nudge, setNudge] = useState<'idle' | 'spent' | null>(null);
  const spent = !!combat && combat.actionUsed && combat.attacksLeft <= 0 && combat.movementLeft <= 0;
  // Anything that happens on the turn (a step, an attack, a new line in the story) starts the wait again.
  const activity = combat ? `${combat.round}:${combat.turnIndex}:${combat.movementLeft}:${combat.actionUsed}:${combat.attacksLeft}:${combat.bonusUsed}:${logLength}` : '';
  useEffect(() => {
    setNudge(null);
    if (!canAct || !combat || !turnReminder) return;
    const timer = window.setTimeout(() => setNudge(spent ? 'spent' : 'idle'), spent ? Math.min(4, turnReminder) * 1000 : turnReminder * 1000);
    return () => window.clearTimeout(timer);
  }, [canAct, activity, turnReminder, spent]);
  return nudge;
}

interface SlotProps {
  entry: Entry;
  hotkey?: string;
  small?: boolean;
  /** Already on the hotbar (in the spellbook). */
  marked?: boolean;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
}

/** A square button with an icon, framed in the colour of what it spends. Its name and everything else is in the tooltip. */
function Slot({ entry: en, hotkey, small, marked, draggable, onDragStart, onDragEnd, onDrop, onContextMenu }: SlotProps) {
  const t = useT();
  const blocked = !!en.why || !en.run;
  const cls = ['hb-slot', `cost-${en.cost}`, en.on && 'on', blocked && 'off', en.auto && 'auto', small && 'small', marked && 'marked'].filter(Boolean).join(' ');
  return (
    <Hint title={en.name} text={<>
      <span className={`hb-tip-cost cost-${en.cost}`}>{t(COST_LABEL[en.cost])}{en.mana ? ` · ${t('{n} mana', { n: en.mana })}` : ''}</span>
      {en.tip}
      {en.why && <em className="warn-line">{en.why}</em>}
      {!en.why && en.warn && <em className="warn-line soft">{en.warn}</em>}
    </>}>
      <button
        type="button"
        className={cls}
        aria-label={en.name}
        aria-disabled={blocked}
        aria-pressed={en.on}
        data-hotkey={hotkey}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
        onDrop={onDrop}
        onContextMenu={onContextMenu}
        onClick={() => { if (!blocked) en.run!(); }}
      >
        <span className="hb-icon">{en.icon}</span>
        {hotkey && <i className="hk">{hotkey}</i>}
        {en.mana ? <span className="hb-mana">{en.mana}</span> : null}
        {en.uses !== undefined ? <span className="hb-uses">{en.uses}</span> : null}
        {en.auto && <span className="hb-auto">{t('auto')}</span>}
      </button>
    </Hint>
  );
}

/** What the hero still has this turn: action, bonus action, reaction, movement and mana. */
function Economy({ state, hero, active }: { state: GameState; hero: Character; active: boolean }) {
  const t = useT();
  const combat = state.combat!;
  const mine = active;
  const action = mine ? !combat.actionUsed || combat.attacksLeft > 0 : true;
  const bonus = mine ? !combat.bonusUsed : true;
  const reaction = !combat.reacted?.includes(hero.id);
  const speedTiles = Math.max(1, Math.floor(hero.speed / 5));
  const moveFt = mine ? combat.movementLeft * 5 : hero.speed;
  const pct = Math.max(0, Math.min(100, ((mine ? combat.movementLeft : speedTiles) / speedTiles) * 100));
  return (
    <div className={mine ? 'economy' : 'economy waiting'}>
      <Hint title={t('Action')} text={<>{t('Attack, cast a spell, Dodge, Disengage or drink a potion. One per turn.')}{mine && combat.actionUsed && combat.attacksLeft > 0 && <em>{t('one more attack')}</em>}</>}>
        <span className={action ? 'eco action' : 'eco action spent'}><i />{t('Action')}{mine && combat.actionUsed && combat.attacksLeft > 0 && <b>+{combat.attacksLeft}</b>}</span>
      </Hint>
      <Hint title={t('Bonus action')} text={t('Quick things some spells and features allow, such as Healing Word or Cunning Action. One per turn.')}>
        <span className={bonus ? 'eco bonus' : 'eco bonus spent'}><i />{t('Bonus action')}</span>
      </Hint>
      <Hint title={t('Reaction')} text={t('Opportunity attacks and reaction spells such as Shield. One per round, back at the start of your turn.')}>
        <span className={reaction ? 'eco reaction' : 'eco reaction spent'}><i />{t('Reaction')}</span>
      </Hint>
      <Hint title={t('Movement')} text={t('{n} ft of movement', { n: moveFt })}>
        <span className="eco move"><span className="track"><span style={{ width: `${pct}%` }} /></span>{t('{n} ft', { n: moveFt })}</span>
      </Hint>
      {hero.maxMana > 0 && (
        <Hint title={t('Mana (spell points)')} text={t('Spells cost mana: a 1st-level spell 2, higher levels more. Cantrips are free.')}>
          <span className="eco mana"><i />{hero.mana} / {hero.maxMana}</span>
        </Hint>
      )}
    </div>
  );
}

const MODE_LABELS: Record<OpportunityMode, string> = { ask: 'Ask me', always: 'Always strike', never: 'Never' };

/** What the hero does when an enemy walks out of reach. Changeable at any time, also on others' turns. */
function OpportunitySwitch({ actor, conn }: { actor: Character; conn: Connection }) {
  const t = useT();
  const mode = actor.opportunity ?? 'ask';
  const next = OPPORTUNITY_MODES[(OPPORTUNITY_MODES.indexOf(mode) + 1) % OPPORTUNITY_MODES.length];
  return (
    <Hint title={t('Opportunity attacks')} text={t('When an enemy {name} can see leaves their reach, they may strike at it with their reaction, once per round. Ask me: you decide each time. Always strike or Never: the game decides for you. Click to switch.', { name: actor.name })}>
      <button className="act small oa-mode" onClick={() => conn.send({ t: 'set_opportunity', characterId: actor.id, mode: next })}>
        <span className="icon">🛡️</span>{t(MODE_LABELS[mode])}
      </button>
    </Hint>
  );
}

/**
 * An enemy is leaving a hero's reach. The hero's player decides: strike or let it go. Everyone
 * else sees who the fight is waiting for. Enter strikes, Escape lets it go.
 */
export function ReactionPrompt({ state, playable, conn }: { state: GameState; playable: Character[]; conn: Connection }) {
  const t = useT();
  const prompt = state.phase === 'combat' ? state.combat?.reaction : null;
  const hero = prompt ? state.characters.find((c) => c.id === prompt.heroId) : undefined;
  const foe = prompt ? state.monsters.find((m) => m.id === prompt.monsterId) : undefined;
  const [now, setNow] = useState(() => Date.now());
  const [span, setSpan] = useState(20000);
  useEffect(() => {
    if (!prompt) return;
    setSpan(Math.max(1000, prompt.until - Date.now()));
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [prompt?.until]);
  const mine = !!hero && playable.some((c) => c.id === hero.id);
  const answer = (take: boolean) => hero && conn.send({ t: 'reaction', characterId: hero.id, take });
  useEffect(() => {
    if (!mine) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); answer(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); answer(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mine, hero?.id]);
  if (!prompt || !hero || !foe) return null;
  const left = Math.max(0, prompt.until - now);
  const owner = state.players.find((p) => p.id === hero.ownerId)?.name ?? '?';
  return (
    <div className={mine ? 'reaction-prompt panel mine' : 'reaction-prompt panel'} role={mine ? 'alertdialog' : 'status'} aria-live="assertive">
      <div className="rp-head">
        <span className="icon">⚔️</span>
        <b>{t('{monster} is leaving the reach of {hero}!', { monster: foe.name, hero: hero.name })}</b>
      </div>
      {mine ? (
        <>
          <p>{t('Opportunity attack: strike at it with your reaction before it gets away. Your reaction comes back at the start of your next turn.')}</p>
          <div className="row">
            <button className="primary" onClick={() => answer(true)}>{t('Strike')}<kbd>{t('Enter')}</kbd></button>
            <button onClick={() => answer(false)}>{t('Let it go')}<kbd>Esc</kbd></button>
          </div>
        </>
      ) : (
        <p className="muted">{t('Waiting for {player} to decide whether {hero} strikes.', { player: owner, hero: hero.name })}</p>
      )}
      <div className="rp-timer" title={t('After that, the hero strikes.')}><span style={{ width: `${Math.min(100, (left / span) * 100)}%` }} /></div>
    </div>
  );
}

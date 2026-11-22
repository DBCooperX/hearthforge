import { ItemIcon } from '../ui/ItemIcon';
import { useEffect, useMemo, useState } from 'react';
import { ABILITIES, SLOT_LABELS } from '../../../shared/content';
import { SPELL_BUFFS } from '../../../shared/spells';
import { isLightWeapon, weaponAttack } from '../../../shared/build';
import { INV_FILTERS, INV_SORTS, arrangeBag, carriedWeight, carryCapacity, equipPreview, itemGroup, itemWeight, slotForItem, type InvFilter, type InvSort } from '../../../shared/inventory';
import { itemDef } from '../../../shared/items';
import { BAG_SIZE, type Character, type GameState, type InvLoc, type ItemDef, type ItemInstance, type SlotId } from '../../../shared/types';
import { artOfCharacter, companionFace, heroUrl } from '../game/heroArt';
import { heroTitle } from '../game/util';
import { playerId, type Connection } from '../net';
import { useLang, useT, type Translate } from '../i18n';
import { feetToMetres, type Lang } from '../../../shared/i18n';
import { dice, signed } from './Guide';
import { Float, Hint } from '../ui/Hint';
import { Icon, SlotIcon } from '../ui/icons';
import { FILTER_LABELS, ITEM_KIND_LABELS as KIND, SORT_LABELS, STAT_LABELS } from '../ui/labels';
import { setPrefs, usePrefs } from '../ui/prefs';
import { sfx } from '../ui/sound';
import { HeroTabs, Window } from '../ui/Window';

const MIME = 'application/x-hearthforge-item';
const LEFT: SlotId[] = ['head', 'armor', 'mainHand', 'hands', 'ring'];
const RIGHT: SlotId[] = ['amulet', 'cloak', 'offHand', 'waist', 'boots'];

const num = (n: number, lang: Lang) => n.toLocaleString(lang, { maximumFractionDigits: 1 });

/** Creature types that slaying weapons name. */
const VS_NAMES: Record<string, string> = { dragon: 'dragons', giant: 'giants', undead: 'undead and fiends', fiend: 'fiends and undead' };

export function kindLine(def: ItemDef, t: Translate): string {
  const slot = slotForItem(def);
  const kind = def.weapon ? t(KIND[def.weapon.category])
    : def.armor ? t(KIND[def.armor.category])
    : def.kind === 'shield' ? t(KIND.shield)
    : def.consumable ? t(KIND.consumable)
    : def.kind === 'wondrous' ? t(KIND.wondrous)
    : def.story ? t(def.story.category) : t(KIND.item);
  const line = [def.rarity && def.rarity !== 'common' ? t(def.rarity === 'very_rare' ? 'very rare' : def.rarity) : null, kind, slot && def.kind !== 'shield' ? t(SLOT_LABELS[slot]) : null].filter(Boolean).join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

interface TipProps { def: ItemDef; item: ItemInstance; c: Character; state: GameState; equipped: boolean; mine: boolean; pinned: boolean; onSplit?: () => void }

/** Everything about one item: what it does for this hero, how it compares with what they wear, and its story. */
export function ItemDetails({ def, item, c, state, equipped, mine, pinned, onSplit }: TipProps) {
  const t = useT();
  const { lang } = useLang();
  const story = def.story;
  const preview = equipPreview(c, def, state.items);
  const attack = def.weapon ? weaponAttack(c, def) : null;
  const weight = itemWeight(def) * item.qty;
  const props = def.weapon ? [
    def.weapon.finesse && t('Finesse'),
    def.weapon.twoHanded && t('Two-handed'),
    isLightWeapon(def) && t('Light weapon'),
    def.weapon.ranged && t('Range {normal}/{long} ft', def.weapon.ranged),
    def.weapon.bonus && t('Magic {bonus}', { bonus: signed(def.weapon.bonus) }),
  ].filter(Boolean) as string[] : [];
  // What a magic item does while worn, and the spell a wand or staff holds.
  const magic = [
    def.attune && t('Needs attunement'),
    def.weapon?.extra && t('+{dice} {type}', { dice: dice(def.weapon.extra.dice, lang), type: t(`${def.weapon.extra.type} damage`) }),
    def.weapon?.vs && t('+{dice} against {type}', { dice: dice(def.weapon.vs.dice, lang), type: t(VS_NAMES[def.weapon.vs.type] ?? def.weapon.vs.type) }),
    ...Object.entries(def.scores ?? {}).map(([k, v]) => t('{ability} becomes {n}', { ability: t(k.toUpperCase()), n: v })),
    def.saveBonus && t('Saving throws {bonus}', { bonus: signed(def.saveBonus) }),
    def.resist?.length && t('Resists {types}', { types: def.resist.map((x) => t(`${x} damage`)).join(', ') }),
    def.speed && t('Speed +{n} ft', { n: def.speed }),
    def.unarmored && t('Armor Class {bonus} without armor or shield', { bonus: signed(def.unarmored) }),
    def.darkvision && t('Darkvision {n} ft', { n: def.darkvision }),
    def.casts && t('Casts {spell} (level {level}), {left} of {charges} charges', { spell: t(ABILITIES[def.casts.spell]?.name ?? def.casts.spell), level: def.casts.level, left: def.casts.charges - (item.used ?? 0), charges: def.casts.charges }),
    def.consumable?.buff && t('Effect: {spell}', { spell: t(SPELL_BUFFS[def.consumable.buff]?.chip ?? def.consumable.buff) }),
    def.consumable?.temp && t('{n} temporary hit points', { n: def.consumable.temp }),
  ].filter(Boolean) as string[];
  const action = !mine ? null : !equipped && isLightWeapon(def) && !!c.equipment.mainHand ? t('Drag to the off hand to wield two weapons') : equipped ? t('Double-click to take it off') : preview ? t('Double-click to equip') : def.consumable ? t('Double-click to drink') : null;
  return (
    <div className={['item-tip', def.rarity ?? 'common', story?.quest && 'quest'].filter(Boolean).join(' ')}>
      <header>
        <span className="item-tip-icon"><ItemIcon def={def} /></span>
        <div>
          <b>{t(def.name)}{item.qty > 1 && <span className="item-tip-qty"> ×{item.qty}</span>}</b>
          <small>{kindLine(def, t)}</small>
        </div>
      </header>
      {story?.quest && <div className="item-tags"><span className="item-tag quest">{t('Quest item')}</span></div>}
      {(attack || def.armor || def.acBonus || def.consumable?.heal) && (
        <dl className="item-stats">
          {attack && <div><dt>{t('To hit')}</dt><dd>{signed(attack.bonus)}</dd></div>}
          {attack && <div><dt>{t('On a hit')}</dt><dd>{dice(attack.damage, lang)} {t(`${attack.type} damage`)}</dd></div>}
          {def.armor && <div><dt>{t('Armor Class')}</dt><dd>{def.armor.baseAc}{def.armor.dexCap === 0 ? '' : ` + ${t('DEX')}`}{def.armor.dexCap ? ` (${t('max {n}', { n: def.armor.dexCap })})` : ''}</dd></div>}
          {def.acBonus ? <div><dt>{t('Armor Class')}</dt><dd>{signed(def.acBonus)}</dd></div> : null}
          {def.consumable?.heal && <div><dt>{t('Heals')}</dt><dd>{dice(def.consumable.heal, lang)} {t('HP')}</dd></div>}
        </dl>
      )}
      {props.length > 0 && <div className="item-props">{props.map((p) => <span key={p}>{p}</span>)}</div>}
      {magic.length > 0 && <div className="item-props magic">{magic.map((p) => <span key={p}>{p}</span>)}</div>}
      {preview && !equipped && (preview.changes.length > 0 || !preview.usable) && (
        <div className="item-compare">
          <small>{preview.replaces ? t('Instead of {item}', { item: t(preview.replaces.name) }) : t('If equipped')}</small>
          {preview.changes.map((ch) => {
            const better = ch.then > ch.now;
            return (
              <div key={ch.stat} className={better ? 'better' : 'worse'}>
                <span>{t(STAT_LABELS[ch.stat])}</span>
                <span className="was">{ch.stat === 'toHit' ? signed(ch.now) : num(ch.now, lang)}</span>
                <Icon name={better ? 'up' : 'down'} size={13} />
                <b>{ch.stat === 'toHit' ? signed(ch.then) : num(ch.then, lang)}</b>
              </div>
            );
          })}
          {!preview.usable && <p className="item-warn">{t('{name} is not trained to use this.', { name: c.name })}</p>}
        </div>
      )}
      {def.description && <p className="item-flavor">{t(def.description)}</p>}
      {story && story.notes.length > 0 && (
        <ul className="item-notes">
          {story.notes.map((n, i) => <li key={i}><small>{t('Day')} {n.day}</small>{n.text}</li>)}
        </ul>
      )}
      {story && <p className="item-found">{story.foundAt ? t('Found on day {day} at {place}', { day: story.foundDay, place: story.foundAt }) : t('Found on day {day}', { day: story.foundDay })}</p>}
      <footer>
        {weight > 0 && <span><Icon name="weight" size={14} /> {t('{n} lb', { n: num(weight, lang) })}</span>}
        {def.value > 0 && <span><Icon name="coin" size={14} /> {def.value} {t('gp')}</span>}
        {!weight && !def.value && <span>{t('No weight or worth to speak of')}</span>}
        <span className="spacer" />
        {pinned && onSplit && mine && item.qty > 1 && def.stackable && <button type="button" className="item-split" onClick={onSplit}>{t('Split…')}</button>}
        {pinned ? <span className="item-pinned"><Icon name="pin" size={13} /> {t('Pinned')}</span> : action && <span className="item-action">{action}</span>}
      </footer>
    </div>
  );
}

interface Props {
  state: GameState;
  character: Character;
  conn: Connection;
  onSelect: (id: string) => void;
  onClose: () => void;
}

interface Shown { uid: string; rect: DOMRect }

export function Inventory({ state, character: c, conn, onSelect, onClose }: Props) {
  const t = useT();
  const { lang } = useLang();
  const prefs = usePrefs();
  const [drag, setDrag] = useState<{ item: ItemInstance; from: InvLoc } | null>(null);
  const [hover, setHover] = useState<Shown | null>(null);
  /** The item pinned by a click, so long notes can be read and scrolled without holding the mouse still. */
  const [picked, setPicked] = useState<Shown | null>(null);
  /** Between fights anyone at the table may sort out a companion's gear; in a fight they act on their own. */
  const mine = c.companion ? state.phase !== 'combat' : c.ownerId === playerId;
  /** A stack being divided: which one, and (when it came from a drop on a hero) who gets the share. */
  const [split, setSplit] = useState<{ item: ItemInstance; index: number; to?: string } | null>(null);
  const defOf = (item: ItemInstance | null) => (item ? itemDef(state.items, item.defId) ?? null : null);
  const dragDef = defOf(drag?.item ?? null);
  const dragSlot = dragDef ? slotForItem(dragDef) : null;
  const filter = prefs.invFilter, sort = prefs.invSort;
  const plain = filter === 'all' && sort === 'manual';

  useEffect(() => { setHover(null); setPicked(null); setSplit(null); }, [c.id]);

  /** What each backpack square shows and which real bag index it stands for. Null squares are filled by hidden items. */
  const squares = useMemo(() => {
    if (plain) return Array.from({ length: BAG_SIZE }, (_, i) => ({ item: c.bag[i] ?? null, index: i as number | null }));
    const shown = arrangeBag(c.bag, state.items, filter, sort, (d) => t(d.name));
    const free = c.bag.map((b, i) => (b ? -1 : i)).filter((i) => i >= 0);
    const out: { item: ItemInstance | null; index: number | null }[] = shown.map((e) => ({ item: e.item, index: e.index }));
    while (out.length < BAG_SIZE) out.push({ item: null, index: free.shift() ?? null });
    return out;
  }, [c.bag, state.items, filter, sort, plain, t]);

  const counts = useMemo(() => {
    const n: Record<InvFilter, number> = { all: 0, weapon: 0, armor: 0, consumable: 0, quest: 0, other: 0 };
    for (const it of c.bag) { const d = defOf(it); if (d) { n.all++; n[itemGroup(d)]++; } }
    return n;
  }, [c.bag, state.items]);

  const move = (from: InvLoc, to: InvLoc) => {
    conn.send({ t: 'inv_move', characterId: c.id, from, to });
    sfx(to.type === 'slot' ? 'equip' : 'drop');
  };

  const cell = (item: ItemInstance | null, loc: InvLoc | null, key?: string | number) => {
    const def = defOf(item);
    const isSlot = loc?.type === 'slot';
    const fits = (slot: SlotId) => dragSlot === slot || (slot === 'offHand' && isLightWeapon(dragDef));
    const valid = drag && isSlot && fits(loc.slot);
    const invalid = drag && isSlot && !fits(loc.slot);
    const unusable = def && mine && slotForItem(def) && !equipPreview(c, def, state.items)?.usable;
    const classes = ['cell', isSlot && 'slot-cell', !loc && 'inert', def?.rarity, def?.story?.quest && 'quest', item && 'filled', item && item.uid === picked?.uid && 'picked', valid && 'valid', invalid && 'invalid', unusable && 'unusable'];
    const body = (
      <div
        key={key}
        className={classes.filter(Boolean).join(' ')}
        onDragOver={(e) => { if (mine && drag && loc) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          if (drag && loc) move(drag.from, loc);
          setDrag(null);
        }}
        onMouseEnter={(e) => setHover(item ? { uid: item.uid, rect: e.currentTarget.getBoundingClientRect() } : null)}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { setPicked(item && item.uid !== picked?.uid ? { uid: item.uid, rect: e.currentTarget.getBoundingClientRect() } : null); if (item) sfx('click'); }}
        onDoubleClick={() => {
          if (!item || !mine || !loc) return;
          setPicked(null);
          if (loc.type === 'bag') { conn.send({ t: 'use_item', characterId: c.id, uid: item.uid }); sfx(def && slotForItem(def) ? 'equip' : 'drop'); }
          else {
            const free = c.bag.findIndex((b) => !b);
            if (free >= 0) move(loc, { type: 'bag', index: free });
            else { conn.toast(t('No free bag space')); sfx('deny'); }
          }
        }}
      >
        {isSlot && !item && <span className="ghost"><SlotIcon slot={loc.slot} /></span>}
        {item && def && loc && (
          <div
            className="item"
            draggable={mine}
            onDragStart={(e) => {
              e.dataTransfer.setData(MIME, JSON.stringify({ characterId: c.id, from: loc }));
              e.dataTransfer.effectAllowed = 'move';
              setDrag({ item, from: loc });
              setHover(null); setPicked(null);
            }}
            onDragEnd={() => setDrag(null)}
          >
            <span className="icon"><ItemIcon def={def} /></span>
            {def.story?.quest && <span className="quest-mark" aria-label={t('Quest item')} />}
            {item.qty > 1 && <span className="qty">{item.qty}</span>}
          </div>
        )}
      </div>
    );
    return isSlot && !item ? <Hint key={key} text={t('Empty')} title={t(SLOT_LABELS[loc.slot])}>{body}</Hint> : body;
  };

  const all = [...c.bag, ...Object.values(c.equipment)];
  const shown = drag ? null : hover ?? picked;
  const shownItem = shown ? all.find((i) => i?.uid === shown.uid) ?? null : null;
  const shownDef = defOf(shownItem);
  const attack = weaponAttack(c, defOf(c.equipment.mainHand));
  const weight = carriedWeight(c, state.items), capacity = carryCapacity(c);

  return (
    <Window
      title={t('Inventory')} icon="inventory" hotkey="I" size="large" className="inventory" onClose={onClose}
      tabs={<HeroTabs state={state} selectedId={c.id} onSelect={onSelect} dropping={!!drag} companions
        onDropOn={(o, shift) => {
          if (drag && shift && drag.item.qty > 1 && drag.from.type === 'bag' && defOf(drag.item)?.stackable) setSplit({ item: drag.item, index: drag.from.index, to: o.id });
          else if (drag) { conn.send({ t: 'give', characterId: c.id, from: drag.from, toCharacterId: o.id }); sfx('drop'); }
          setDrag(null);
        }} />}
      footer={(
        <>
          <Hint title={t('Carried weight')} text={t('Everything {name} wears and carries. A hero can carry 15 lb for each point of Strength. For your information only: the game does not slow anyone down yet.', { name: c.name })}>
            <div className={weight > capacity ? 'carry over' : 'carry'} tabIndex={0}>
              <Icon name="weight" size={16} />
              <span className="carry-bar"><i style={{ width: `${Math.min(100, (weight / capacity) * 100)}%` }} /></span>
              <span><b>{num(weight, lang)}</b> / {t('{n} lb', { n: capacity })}</span>
            </div>
          </Hint>
          <span className="inv-hint">{c.companion ? (mine ? t('{name} travels with the party and carries what you hand them. Double-click to have them wield something.', { name: c.name }) : t('{name} acts on their own in a fight. Sort out their gear afterwards.', { name: c.name })) : mine ? t('Double-click to equip or use. Drag onto a hero to hand over (hold Shift to hand over part of a stack). Click to pin the details.') : t('{name} belongs to another player, so you can look but not touch.', { name: c.name })}</span>
          <Hint title={t('Party gold')} text={t('Shared by the whole party.')}>
            <div className="purse" tabIndex={0}><Icon name="coin" size={17} /> <b>{state.gold.toLocaleString(lang)}</b> {t('gp')}</div>
          </Hint>
        </>
      )}
    >
      <div className="inv-body" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('.cell')) setPicked(null); }}>
        <section className="doll">
          <div className="doll-name">
            <h2>{c.name}</h2>
            <small>{c.companion ? `${c.companion.role} · ${t('Companion')}` : t('Level {level} {class}', { level: c.level, class: heroTitle(c, t) })}</small>
          </div>
          <div className="doll-stage">
            <div className="col">{LEFT.map((s) => cell(c.equipment[s], { type: 'slot', slot: s }, s))}</div>
            <div className="figure">
              {c.companion?.portraitId ? <img className="hero-art companion-face" src={companionFace(c, state.items)} alt="" /> : <img className="hero-art" src={heroUrl(artOfCharacter(c, state.items))} alt="" />}
            </div>
            <div className="col">{RIGHT.map((s) => cell(c.equipment[s], { type: 'slot', slot: s }, s))}</div>
          </div>
          <div className="doll-stats">
            <Hint title={t('Armor Class')} text={t('What an attack roll must reach to hit this hero. It changes with armor, shield and magic items.')}>
              <div tabIndex={0}><Icon name="shield" size={18} /><b>{c.ac}</b><small>{t('AC')}</small></div>
            </Hint>
            <Hint title={t('Attack')} text={`${t(attack.name)}: ${signed(attack.bonus)} ${lang === 'de' ? t('To hit') : t('To hit').toLowerCase()}, ${dice(attack.damage, lang)} ${t(`${attack.type} damage`)}`}>
              <div tabIndex={0}><Icon name="sword" size={18} /><b>{signed(attack.bonus)}</b><small>{dice(attack.damage, lang)}</small></div>
            </Hint>
            <Hint title={t('Hit points')} text={`${c.hp} / ${c.maxHp}`}>
              <div tabIndex={0}><Icon name="heart" size={18} /><b>{c.hp}</b><small>/ {c.maxHp}</small></div>
            </Hint>
            <Hint title={t('Speed')} text={t('{n} ft of movement', { n: c.speed })}>
              <div tabIndex={0}><Icon name="boot" size={18} /><b>{lang === 'de' ? feetToMetres(c.speed) : c.speed}</b><small>{lang === 'de' ? 'm' : 'ft'}</small></div>
            </Hint>
          </div>
        </section>
        <section className="bag">
          <div className="bag-tools">
            <div className="filters" role="group" aria-label={t('Show')}>
              {INV_FILTERS.map((f) => (
                <button key={f} type="button" className={[f === filter && 'on', f !== 'all' && !counts[f] && 'none'].filter(Boolean).join(' ')} aria-pressed={f === filter}
                  onClick={() => { setPrefs({ invFilter: f }); setPicked(null); sfx('tab'); }}>
                  {t(FILTER_LABELS[f])}<span>{counts[f]}</span>
                </button>
              ))}
            </div>
            <label className="sort">
              <span>{t('Sort')}</span>
              <select value={sort} onChange={(e) => { setPrefs({ invSort: e.target.value as InvSort }); setPicked(null); sfx('tab'); }}>
                {INV_SORTS.map((s) => <option key={s} value={s}>{t(SORT_LABELS[s])}</option>)}
              </select>
            </label>
          </div>
          <div className="bag-grid">
            {squares.map((sq, i) => cell(sq.item, sq.index === null ? null : { type: 'bag', index: sq.index }, i))}
          </div>
          {counts.all === 0 && <p className="empty-note">{t('The backpack is empty. What the party finds lands here.')}</p>}
          {counts.all > 0 && filter !== 'all' && counts[filter] === 0 && <p className="empty-note">{t('Nothing of this kind in the backpack.')}</p>}
        </section>
      </div>
      {shown && shownItem && shownDef && (
        <Float anchor={shown.rect} side="right" className="item-float" interactive={!hover && !!picked}>
          <ItemDetails def={shownDef} item={shownItem} c={c} state={state} mine={mine} pinned={!hover && !!picked}
            onSplit={() => { const i = c.bag.findIndex((b) => b?.uid === shownItem.uid); if (i >= 0) { setSplit({ item: shownItem, index: i }); setPicked(null); } }}
            equipped={Object.values(c.equipment).some((e) => e?.uid === shownItem.uid)} />
        </Float>
      )}
      {split && <SplitDialog state={state} from={c} item={split.item} index={split.index} to={split.to} conn={conn} onClose={() => setSplit(null)} />}
    </Window>
  );
}

interface SplitProps { state: GameState; from: Character; item: ItemInstance; index: number; to?: string; conn: Connection; onClose: () => void }

/** Divides a stack: some stay, some go to another hero, or into a stack of their own in the same backpack. */
function SplitDialog({ state, from, item, index, to, conn, onClose }: SplitProps) {
  const t = useT();
  const def = itemDef(state.items, item.defId);
  const [n, setN] = useState(Math.max(1, Math.floor(item.qty / 2)));
  const [target, setTarget] = useState(to ?? '');
  const others = [...state.characters, ...(state.companions ?? [])].filter((o) => o.id !== from.id && !o.dead);
  const free = from.bag.findIndex((b) => !b);
  const count = Math.min(item.qty - 1, Math.max(1, Math.floor(n) || 1));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (target) conn.send({ t: 'give', characterId: from.id, from: { type: 'bag', index }, toCharacterId: target, qty: count });
    else if (free >= 0) conn.send({ t: 'inv_move', characterId: from.id, from: { type: 'bag', index }, to: { type: 'bag', index: free }, qty: count });
    else { conn.toast(t('No free bag space')); sfx('deny'); return; }
    sfx('drop');
    onClose();
  };
  return (
    <div className="split-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <form className="panel split-dialog" onSubmit={submit}>
        <h3>{t('Split {item}', { item: def ? t(def.name) : '' })}</h3>
        <p className="muted">{t('You have {n}. Choose how many to take out of the stack.', { n: item.qty })}</p>
        <label>{t('How many')}
          <input type="number" min={1} max={item.qty - 1} value={n} autoFocus onChange={(e) => setN(Number(e.target.value))} />
        </label>
        <label>{t('Where to')}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t('A separate stack in this backpack')}</option>
            {others.map((o) => <option key={o.id} value={o.id}>{t('Hand to {name}', { name: o.name })}</option>)}
          </select>
        </label>
        <div className="confirm-buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button className="primary">{t('Split')}</button>
        </div>
      </form>
    </div>
  );
}

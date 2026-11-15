import { useState } from 'react';
import { SLOT_LABELS } from '../../../shared/content';
import { itemDef } from '../../../shared/items';
import { BAG_SIZE, type Character, type GameState, type InvLoc, type ItemInstance, type SlotId } from '../../../shared/types';
import { artOfCharacter, heroUrl } from '../game/heroArt';
import { mod, slotForItem, weaponSummary, classLabel } from '../game/util';
import { playerId, type Connection } from '../net';
import { useT } from '../i18n';

const MIME = 'application/x-hearthforge-item';
const LEFT: SlotId[] = ['head', 'armor', 'mainHand', 'ring'];
const RIGHT: SlotId[] = ['amulet', 'cloak', 'offHand', 'boots'];
const SLOT_GLYPH: Record<SlotId, string> = { head: '⛑', amulet: '📿', armor: '🥋', cloak: '🧣', mainHand: '🗡', offHand: '🛡', ring: '💍', boots: '🥾' };

interface Props {
  state: GameState;
  character: Character;
  conn: Connection;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function Inventory({ state, character: c, conn, onSelect, onClose }: Props) {
  const t = useT();
  const [drag, setDrag] = useState<{ item: ItemInstance; from: InvLoc } | null>(null);
  const [hover, setHover] = useState<ItemInstance | null>(null);
  /** The item pinned by a click, so its story can be read without holding the mouse still. */
  const [picked, setPicked] = useState<string | null>(null);
  const mine = c.ownerId === playerId;
  const defOf = (item: ItemInstance | null) => (item ? itemDef(state.items, item.defId) ?? null : null);
  const dragDef = defOf(drag?.item ?? null);
  const dragSlot = dragDef ? slotForItem(dragDef) : null;

  const cell = (item: ItemInstance | null, loc: InvLoc, extra = '') => {
    const def = defOf(item);
    const isSlot = loc.type === 'slot';
    const valid = drag && isSlot && dragSlot === loc.slot;
    const invalid = drag && isSlot && dragSlot !== loc.slot;
    return (
      <div
        className={['cell', extra, def?.rarity, def?.story?.quest && 'quest', item && item.uid === picked && 'picked', valid && 'valid', invalid && 'invalid'].filter(Boolean).join(' ')}
        onDragOver={(e) => { if (mine && drag) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          if (drag) conn.send({ t: 'inv_move', characterId: c.id, from: drag.from, to: loc });
          setDrag(null);
        }}
        onMouseEnter={() => setHover(item)}
        onMouseLeave={() => setHover(null)}
        onClick={() => setPicked(item && item.uid !== picked ? item.uid : null)}
        onDoubleClick={() => {
          if (!item || !mine) return;
          if (loc.type === 'bag') conn.send({ t: 'use_item', characterId: c.id, uid: item.uid });
          else {
            const free = c.bag.findIndex((b) => !b);
            if (free >= 0) conn.send({ t: 'inv_move', characterId: c.id, from: loc, to: { type: 'bag', index: free } });
            else conn.toast(t('No free bag space'));
          }
        }}
      >
        {isSlot && !item && <span className="ghost">{SLOT_GLYPH[loc.slot]}</span>}
        {item && def && (
          <div
            className="item"
            draggable={mine}
            onDragStart={(e) => {
              e.dataTransfer.setData(MIME, JSON.stringify({ characterId: c.id, from: loc }));
              e.dataTransfer.effectAllowed = 'move';
              setDrag({ item, from: loc });
            }}
            onDragEnd={() => setDrag(null)}
          >
            <span className="icon">{def.icon}</span>
            {def.story?.quest && <span className="quest-mark" title={t('Quest item')}>❗</span>}
            {item.qty > 1 && <span className="qty">{item.qty}</span>}
          </div>
        )}
      </div>
    );
  };

  const slot = (s: SlotId) => (
    <div className="slot" key={s}>
      {cell(c.equipment[s], { type: 'slot', slot: s })}
      <label>{t(SLOT_LABELS[s])}</label>
    </div>
  );

  const pinned = picked ? [...c.bag, ...Object.values(c.equipment)].find((i) => i?.uid === picked) ?? null : null;
  const hovered = defOf(hover ?? pinned);
  const story = hovered?.story;

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel inventory">
        <header>
          <div className="tabs">
            {state.characters.map((o) => (
              <button
                key={o.id}
                className={o.id === c.id ? 'tab on' : 'tab'}
                onClick={() => onSelect(o.id)}
                onDragOver={(e) => { if (drag && o.id !== c.id) e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag && o.id !== c.id) conn.send({ t: 'give', characterId: c.id, from: drag.from, toCharacterId: o.id });
                  setDrag(null);
                }}
              >
                <img className="pixel" src={heroUrl(artOfCharacter(o, state.items))} alt="" /> {o.name}
              </button>
            ))}
          </div>
          <button className="link close" onClick={onClose} title={t('Close (i or Esc)')}>✕</button>
        </header>
        <div className="inv-body">
          <section className="doll">
            <div className="doll-grid">
              <div className="col">{LEFT.map(slot)}</div>
              <div className="figure">
                <img className="pixel" src={heroUrl(artOfCharacter(c, state.items))} alt="" />
                <div className="ac-badge" title={t('Armor Class')}><b>{c.ac}</b><small>{t('AC')}</small></div>
              </div>
              <div className="col">{RIGHT.map(slot)}</div>
            </div>
            <div className="stats">
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
                <div key={a}><small>{a.toUpperCase()}</small><b>{c.abilities[a]}</b><span>{mod(c.abilities[a])}</span></div>
              ))}
            </div>
            <p className="muted small">
              {c.name}, {t('Level {level} {class}', { level: c.level, class: classLabel(c, t) })} · {t('HP')} {c.hp}/{c.maxHp} · {t('Speed')} {c.speed} ft<br />{t('Attack')}: {weaponSummary(state, c, t)}
            </p>
          </section>
          <section className="bag">
            <div className="bag-head">
              <h3>{t('Backpack')}</h3>
              <span className="gold" title={t('Party gold')}>🪙 {state.gold} {t('gp')}</span>
            </div>
            <div className="bag-grid">
              {Array.from({ length: BAG_SIZE }, (_, i) => <div key={i}>{cell(c.bag[i] ?? null, { type: 'bag', index: i })}</div>)}
            </div>
            <div className="tooltip">
              {hovered ? (
                <>
                  <b className={hovered.rarity}>{hovered.icon} {t(hovered.name)}</b>
                  {story && (
                    <div className="tags">
                      <span className="tag">{t(story.category)}</span>
                      {story.quest && <span className="tag quest" title={t('Quest items stay with the party until the story uses them.')}>❗ {t('Quest item')}</span>}
                    </div>
                  )}
                  <p>{t(hovered.description)}</p>
                  {story && story.notes.length > 0 && (
                    <ul className="item-notes">
                      {story.notes.map((n, i) => <li key={i}><small>{t('Day')} {n.day}</small> {n.text}</li>)}
                    </ul>
                  )}
                  {story && <p className="muted small">{story.foundAt ? t('Found on day {day} at {place}', { day: story.foundDay, place: story.foundAt }) : t('Found on day {day}', { day: story.foundDay })}</p>}
                  <small>{hovered.value} {t('gp')}{hovered.rarity ? ` · ${t(hovered.rarity)}` : ''}</small>
                </>
              ) : (
                <p className="muted">
                  {mine
                    ? t('Drag items between the backpack and equipment slots. Double-click to equip, drink or unequip. Drop an item on another hero to hand it over. Click an item to keep its notes open.')
                    : t('{name} belongs to another player, so you can look but not touch.', { name: c.name })}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

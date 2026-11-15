// The trade window: a merchant's shelves on the left, the chosen hero's backpack on the right.
// Every price shown comes from shared/trade.ts, the same sums the server charges and pays.
import { useEffect, useMemo, useState } from 'react';
import { itemGroup, type ItemGroup } from '../../../shared/inventory';
import { itemDef } from '../../../shared/items';
import { HAGGLE_DC, SHOP_BLURBS, SHOP_ICONS, buyPrice, sellPrice, type ShopView } from '../../../shared/trade';
import { abilityMod, type Character, type GameState, type ItemDef, type ItemInstance } from '../../../shared/types';
import { useLang, useT } from '../i18n';
import type { Connection } from '../net';
import { Float, Hint } from '../ui/Hint';
import { Icon } from '../ui/icons';
import { ItemIcon } from '../ui/ItemIcon';
import { sfx } from '../ui/sound';
import { HeroTabs, TabBar, Window } from '../ui/Window';
import { signed } from './Guide';
import { ItemDetails, kindLine } from './Inventory';

const GROUPS: ItemGroup[] = ['weapon', 'armor', 'consumable', 'other', 'quest'];
const MOOD_TEXT = { '-1': 'Prices are 10% worse today', '1': 'Prices are 10% better today', '2': 'Prices are 20% better today' } as const;

interface Props {
  state: GameState;
  shop: ShopView;
  character: Character;
  /** This player may act for the hero: it is theirs, or its player is away. */
  mine: boolean;
  conn: Connection;
  onSelect: (id: string) => void;
  onShop: (id: string) => void;
  onClose: () => void;
}

interface Shown { key: string; def: ItemDef; item: ItemInstance; rect: DOMRect }

export function Trade({ state, shop, character: c, mine, conn, onSelect, onShop, onClose }: Props) {
  const t = useT();
  const { lang } = useLang();
  const [hover, setHover] = useState<Shown | null>(null);
  useEffect(() => setHover(null), [c.id, shop.id]);

  const shelf = useMemo(() => shop.stock
    .map((e) => ({ ...e, def: itemDef(state.items, e.defId) }))
    .filter((e): e is typeof e & { def: ItemDef } => !!e.def)
    .sort((a, b) => GROUPS.indexOf(itemGroup(a.def)) - GROUPS.indexOf(itemGroup(b.def)) || a.def.value - b.def.value || a.def.name.localeCompare(b.def.name)),
  [shop.stock, state.items]);
  const bag = c.bag.map((item, index) => ({ item, index, def: item ? itemDef(state.items, item.defId) : undefined }))
    .filter((e): e is { item: ItemInstance; index: number; def: ItemDef } => !!e.item && !!e.def);
  const bagFull = c.bag.every((b) => !!b);
  const persuasion = abilityMod(c.abilities.cha) + (c.skills.includes('persuasion') ? c.profBonus * (c.expertise.includes('persuasion') ? 2 : 1) : 0);
  const hostile = shop.disposition === 'hostile';
  const keeper = shop.merchant ?? t('The keeper');
  const gp = (n: number) => `${n.toLocaleString(lang)} ${t('gp')}`;
  const show = (key: string, def: ItemDef, item: ItemInstance) => (e: { currentTarget: Element }) => setHover({ key, def, item, rect: e.currentTarget.getBoundingClientRect() });

  const buy = (def: ItemDef, qty: number) => { conn.send({ t: 'buy', characterId: c.id, shopId: shop.id, defId: def.id, qty }); sfx('coin'); };
  const sell = (index: number, qty: number) => { conn.send({ t: 'sell', characterId: c.id, shopId: shop.id, from: { type: 'bag', index }, qty }); sfx('coin'); };

  return (
    <Window
      title={t('Trade')} icon="coin" hotkey="T" size="large" className="trade" onClose={onClose}
      tabs={<HeroTabs state={state} selectedId={c.id} onSelect={onSelect} />}
      footer={(
        <>
          <span className="inv-hint">{!mine ? t('{name} belongs to another player, so you can look but not touch.', { name: c.name })
            : t('Click a price to buy or sell one. Hold Shift for five, or a whole stack when selling.')}</span>
          <Hint title={t('Party gold')} text={t('Shared by the whole party.')}>
            <div className="purse" tabIndex={0}><Icon name="coin" size={17} /> <b>{state.gold.toLocaleString(lang)}</b> {t('gp')}</div>
          </Hint>
        </>
      )}
    >
      {state.shops.length > 1 && (
        <TabBar tabs={state.shops.map((s) => ({ id: s.id, label: `${SHOP_ICONS[s.kind]} ${s.name}` }))} value={shop.id} onChange={onShop} />
      )}
      <div className="trade-body">
        <section className="trade-side">
          <header className="trade-head">
            <span className="trade-sign">{SHOP_ICONS[shop.kind]}</span>
            <div className="trade-who">
              <h2>{shop.name}</h2>
              <small><span className={`disp ${shop.disposition}`} title={t(shop.disposition)} /> {keeper} · {t(SHOP_BLURBS[shop.kind])}</small>
            </div>
            <Hint title={t("The merchant's purse")} text={t('What the merchant can pay today for the things you sell. It fills up again with the next delivery, in {n} days.', { n: shop.restockIn })}>
              <div className="purse dim" tabIndex={0}><Icon name="coin" size={15} /> <b>{shop.purse.toLocaleString(lang)}</b> {t('gp')}</div>
            </Hint>
          </header>
          <div className="trade-haggle">
            <Hint title={t('Haggle')} text={shop.haggled ? t('You have already haggled here today.')
              : t('{name} makes a Persuasion check ({bonus}) against DC {dc}. Success: 10% better prices today, 20% if you beat it by 5 or more. Miss it by 5 or more and the prices go up instead. Once a day at each shop.', { name: c.name, bonus: signed(persuasion), dc: HAGGLE_DC[shop.disposition] })}>
              <button type="button" disabled={!mine || shop.haggled || hostile} onClick={() => { conn.send({ t: 'haggle', characterId: c.id, shopId: shop.id }); sfx('click'); }}>
                🗣️ {t('Haggle')} <span className="cost">{signed(persuasion)}</span>
              </button>
            </Hint>
            {shop.mood !== 0
              ? <span className={shop.mood > 0 ? 'trade-mood good' : 'trade-mood bad'}>{t(MOOD_TEXT[String(shop.mood) as keyof typeof MOOD_TEXT])}</span>
              : <span className="trade-mood">{shop.markup > 1.01 ? t('Prices are higher here than in town') : shop.markup < 0.99 ? t('Prices are low here') : t('Fair prices')}</span>}
          </div>
          {hostile && <p className="item-warn">{t('{name} will not trade with you.', { name: keeper })}</p>}
          <ul className="trade-list">
            {shelf.map((e) => {
              const price = buyPrice(e.def, shop);
              const why = !mine ? null : hostile ? '' : price > state.gold ? t('The party cannot afford this.') : bagFull && !(e.def.stackable && c.bag.some((b) => b?.defId === e.def.id)) ? t('{name} has no free bag space.', { name: c.name }) : null;
              const key = `shop:${e.defId}`;
              return (
                <li key={e.defId} className={['trade-row', e.def.rarity, hover?.key === key && 'on'].filter(Boolean).join(' ')}
                  onMouseEnter={show(key, e.def, { uid: key, defId: e.defId, qty: 1 })} onMouseLeave={() => setHover(null)}>
                  <span className="trade-icon"><ItemIcon def={e.def} />{e.qty > 1 && <span className="qty">{e.qty}</span>}</span>
                  <span className="trade-name"><b>{t(e.def.name)}</b><small>{kindLine(e.def, t)}</small></span>
                  <Hint text={why ?? ''}>
                    <button type="button" className="trade-price" disabled={!mine || why !== null} aria-label={t('Buy {item} for {price}', { item: t(e.def.name), price: gp(price) })}
                      onClick={(ev) => buy(e.def, ev.shiftKey && e.def.stackable ? Math.min(5, e.qty) : 1)}>
                      <span>{t('Buy')}</span><b>{price.toLocaleString(lang)}</b><Icon name="coin" size={14} />
                    </button>
                  </Hint>
                </li>
              );
            })}
          </ul>
          {shelf.length === 0 && <p className="empty-note">{t('The shelves are bare. Come back after the next delivery.')}</p>}
        </section>
        <section className="trade-side yours">
          <header className="trade-head">
            <div className="trade-who">
              <h2>{t("{name}'s backpack", { name: c.name })}</h2>
              <small>{t('What you would get for it here')}</small>
            </div>
          </header>
          <ul className="trade-list">
            {bag.map(({ item, index, def }) => {
              const price = sellPrice(def, shop);
              const why = def.story?.quest ? t('Quest items stay with the party.') : price <= 0 ? t('Nobody here will pay for this.') : price > shop.purse ? t('{name} cannot afford this today.', { name: keeper }) : null;
              return (
                <li key={item.uid} className={['trade-row', def.rarity, def.story?.quest && 'quest', why && 'dim', hover?.key === item.uid && 'on'].filter(Boolean).join(' ')}
                  onMouseEnter={show(item.uid, def, item)} onMouseLeave={() => setHover(null)}>
                  <span className="trade-icon"><ItemIcon def={def} />{item.qty > 1 && <span className="qty">{item.qty}</span>}</span>
                  <span className="trade-name"><b>{t(def.name)}</b><small>{def.story?.quest ? t('Quest item') : kindLine(def, t)}</small></span>
                  <Hint text={mine ? why ?? '' : ''}>
                    <button type="button" className="trade-price sell" disabled={!mine || hostile || why !== null} aria-label={t('Sell {item} for {price}', { item: t(def.name), price: gp(price) })}
                      onClick={(ev) => sell(index, ev.shiftKey ? item.qty : 1)}>
                      <span>{t('Sell')}</span><b>{why && price <= 0 ? '–' : price.toLocaleString(lang)}</b><Icon name="coin" size={14} />
                    </button>
                  </Hint>
                </li>
              );
            })}
          </ul>
          {bag.length === 0 && <p className="empty-note">{t('The backpack is empty. What the party finds lands here.')}</p>}
        </section>
      </div>
      {hover && (
        <Float anchor={hover.rect} side="right" className="item-float">
          <ItemDetails def={hover.def} item={hover.item} c={c} state={state} mine={false} pinned={false} equipped={false} />
        </Float>
      )}
    </Window>
  );
}

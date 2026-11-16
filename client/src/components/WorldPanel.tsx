import { useMemo, useState } from 'react';
import { HEX_MILES, TERRAIN, UNKNOWN, findRoute, formatHours, formatTime, sameHex, summarizeRoute, timeOfDay, type Hex, type TerrainCode } from '../../../shared/hex';
import type { GameState, WorldView } from '../../../shared/types';
import { SHOP_ICONS } from '../../../shared/trade';
import type { Connection } from '../net';
import { HexMap, KIND_ICON } from './HexMap';
import { EntityName, useEntity } from './Story';
import { useLang, useT } from '../i18n';
import { Window } from '../ui/Window';
import { ZoneMap } from './ZoneMap';

function Named({ name }: { name: string }) {
  const entity = useEntity(name);
  return entity ? <EntityName entity={entity} /> : <>{name}</>;
}

interface TravelProps {
  world: WorldView;
  state: GameState;
  conn: Connection;
  target: Hex | null;
  setTarget: (h: Hex | null) => void;
}

/** The hex map with the travel planner: pick a hex, read the journey, set out. */
export function TravelMap({ world, state, conn, target, setTarget, local }: TravelProps & { local?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const terrainAt = (h: Hex) => world.terrain[h.r * world.width + h.q];
  const plan = useMemo(() => {
    if (!target || sameHex(target, world.party)) return null;
    const route = findRoute(world.width, world.height, terrainAt, world.party, target);
    return { route, summary: route && summarizeRoute(route, terrainAt, world.minutes) };
  }, [target, world.terrain, world.party, world.minutes]);
  const dest = target && world.locations.find((l) => !l.parentId && sameHex(l, target));
  const code = target ? terrainAt(target) : UNKNOWN;
  const canGo = state.phase === 'explore' && !state.travelling && !state.dmBusy;

  return (
    <div className="travelmap">
      <HexMap local={local} world={world} target={target} route={plan?.route ?? null} onPick={(h) => setTarget(sameHex(h, world.party) ? null : h)} />
      {target && plan && (
        <div className="travel">
          <div className="travel-head">
            <b>{dest ? `${KIND_ICON[dest.kind]} ${dest.name}` : code === UNKNOWN ? t('Uncharted land') : t(TERRAIN[code as TerrainCode].name)}</b>
            <button className="link" onClick={() => setTarget(null)}>{t('cancel')}</button>
          </div>
          {plan.summary ? (
            <>
              <dl>
                <div><dt>{t('Distance')}</dt><dd>{t('{n} miles', { n: plan.summary.miles })}</dd></div>
                <div><dt>{t('Time')}</dt><dd>{formatHours(plan.summary.hours, lang)}</dd></div>
                <div><dt>{t('Arrive')}</dt><dd>{formatTime(plan.summary.arrival, lang)}</dd></div>
                <div><dt>{t('Encounter')}</dt><dd className={plan.summary.encounterChance > 0.5 ? 'risky' : ''}>{Math.round(plan.summary.encounterChance * 100)}%</dd></div>
              </dl>
              <div className="terrain-row">
                {plan.summary.terrain.map((x) => <span key={x.name} className="chip">{t(x.name)} × {x.hexes}</span>)}
              </div>
              <button className="primary" disabled={!canGo} onClick={() => { conn.send({ t: 'travel', q: target.q, r: target.r }); setTarget(null); }}>
                {state.travelling ? t('Travelling…') : t('Set out')}
              </button>
            </>
          ) : (
            <p className="muted small">{code === 'w' ? t('You cannot cross open water.') : t('You know no way there yet.')}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The map of the place the party is in, with the region's hex map one tab away. In the wilderness,
 * or in a place nobody has mapped yet, it is just the hex map.
 */
function Maps(props: TravelProps & { local?: boolean }) {
  const t = useT();
  const { world, state, conn } = props;
  const place = world.locations.find((l) => l.id === world.placeId) ?? null;
  const root = place?.parentId ? world.locations.find((l) => l.id === place.parentId) ?? place : place;
  const zone = root?.zone ?? null;
  // The choice holds while the party stays in this place; a new place opens on its own map.
  const [pick, setPick] = useState<{ at: string | null; view: 'place' | 'region' }>({ at: null, view: 'place' });
  const view = zone && !(pick.at === root!.id && pick.view === 'region') ? 'place' : 'region';
  const idle = state.phase === 'explore' && !state.travelling && !state.dmBusy;
  return (
    <>
      {zone && (
        <div className="maptabs" role="tablist">
          <button role="tab" aria-selected={view === 'place'} className={view === 'place' ? 'on' : ''} onClick={() => setPick({ at: root!.id, view: 'place' })}>{t('Place')}</button>
          <button role="tab" aria-selected={view === 'region'} className={view === 'region' ? 'on' : ''} onClick={() => setPick({ at: root!.id, view: 'region' })}>{t('Region')}</button>
        </div>
      )}
      {zone && view === 'place'
        ? <ZoneMap zone={zone} placeId={world.placeId} big={!props.local}
            onGo={idle ? (s) => conn.send({ t: 'go', locationId: s.placeId ?? root!.id }) : null} />
        : <TravelMap {...props} />}
    </>
  );
}

interface PanelProps extends TravelProps {
  onExpand: () => void;
  onJournal: () => void;
  onTrade: (shopId: string) => void;
}

/** Right-hand panel while exploring: where you are, who is here, the map and your quests. */
export function WorldPanel(props: PanelProps) {
  const t = useT();
  const { lang } = useLang();
  const { world, state, conn, onExpand, onJournal, onTrade } = props;
  const place = world.locations.find((l) => l.id === world.placeId) ?? null;
  const parent = place?.parentId ? world.locations.find((l) => l.id === place.parentId) : null;
  const here = world.locations.filter((l) => sameHex(l, world.party) && l.id !== place?.id);
  // The people in the current scene, as its header names them; people who left are gone from it.
  const present = state.scene?.present ?? state.memory.npcs.filter((n) => n.locationId === world.placeId).map((n) => ({ name: n.name, npcId: n.id, role: n.role, disposition: n.disposition }));
  const quests = state.memory.quests.filter((q) => q.status === 'active');
  const terrain = TERRAIN[world.terrain[world.party.r * world.width + world.party.q] as TerrainCode]?.name ?? 'unknown';
  const idle = state.phase === 'explore' && !state.travelling && !state.dmBusy;
  const nearest = !place ? world.locations.filter((l) => !l.parentId).sort((a, b) => Math.abs(a.q - world.party.q) + Math.abs(a.r - world.party.r) - Math.abs(b.q - world.party.q) - Math.abs(b.r - world.party.r))[0] : null;

  return (
    <aside className="worldpanel">
      <header className="where">
        <span className="where-icon">{place ? KIND_ICON[place.kind] : '🧭'}</span>
        <div>
          <h2>{place?.name ?? t('The wilds')}</h2>
          <small>{place ? (parent ? t('{kind} in {place}', { kind: t(place.kind), place: parent.name }) : t(place.kind)) : `${t(terrain)}${nearest ? `, ${t('near {place}', { place: nearest.name })}` : ''}`}</small>
        </div>
        <div className="clock" title={world.safe ? t('A safe place to rest') : t('Resting here is risky')}>
          <b>{formatTime(world.minutes, lang)}</b>
          <small>{t(timeOfDay(world.minutes))}{world.safe ? ` · ${t('safe')}` : ''}</small>
        </div>
      </header>

      <div className="wp-scroll">
        <section>
          <h3>{t('Map')} <button className="link" onClick={onExpand} title={t('Open the full map (m)')}>{t('expand')}</button></h3>
          <Maps {...props} local />
        </section>

        {(here.length > 0 || place?.dungeon) && (
          <section>
            <h3>{t('Here')}</h3>
            <div className="here-list">
              {place?.dungeon && (
                place.dungeon.next
                  ? <button disabled={!idle} onClick={() => conn.send({ t: 'delve' })} title={t('Fight your way into the next section')}>⚔️ {t('Delve: {stage}', { stage: place.dungeon.next })} <small>{t('{n}/{total} cleared', { n: place.dungeon.cleared, total: place.dungeon.total })}</small></button>
                  : <p className="muted small">{t('Cleared. Nothing stirs here any more.')}</p>
              )}
              {here.map((l) => (
                <button key={l.id} disabled={!idle} onClick={() => conn.send({ t: 'go', locationId: l.id })}>
                  {KIND_ICON[l.kind]} {l.parentId ? t('Enter {place}', { place: l.name }) : t('Back to {place}', { place: l.name })}
                </button>
              ))}
            </div>
          </section>
        )}

        {state.shops.length > 0 && (
          <section>
            <h3>{t('Merchants')} <small className="muted">T</small></h3>
            <div className="here-list">
              {state.shops.map((sh) => (
                <button key={sh.id} className="shop-btn" onClick={() => onTrade(sh.id)} title={t('Buy and sell')}>
                  {SHOP_ICONS[sh.kind]} {sh.name}{sh.merchant && <small>{sh.merchant}</small>}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>{t('Who is here')}</h3>
          {present.length === 0 && <p className="muted small">{place ? t('Nobody you know by name.') : t('Just the party and the wind.')}</p>}
          <ul className="people">
            {present.map((n) => (
              <li key={n.npcId ?? n.name}>
                <span className={`disp ${n.disposition ?? 'unknown'}`} title={n.disposition ? t(n.disposition) : undefined} />
                <div>{n.npcId ? <Named name={n.name} /> : <span>{n.name}</span>}{n.role && <small>{n.role}</small>}</div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>{t('Quests')} <button className="link" onClick={onJournal} title={t('Open the journal (j)')}>{t('journal')}</button></h3>
          {quests.length === 0 && <p className="muted small">{t('No open quests. The Vale is wide; go and find trouble.')}</p>}
          <ul className="quests">
            {quests.map((q) => <li key={q.id}><b>{q.title}</b><small>{q.summary}</small></li>)}
          </ul>
        </section>
      </div>

      <footer className="wp-actions">
        <button disabled={!idle || state.shortRestsLeft <= 0} onClick={() => conn.send({ t: 'short_rest' })} title={t('One hour. Spend a hit die to heal and recover some mana.')}>{t('⛺ Short rest')} <span className="cost">{state.shortRestsLeft}</span></button>
        <button disabled={!idle} onClick={() => conn.send({ t: 'long_rest' })} title={world.safe ? t('Eight hours. Restores everything.') : t('Eight hours. Restores everything, but camping in the wild can be interrupted.')}>{t('🌙 Long rest')}</button>
      </footer>
    </aside>
  );
}

/** Full-size map window. */
export function MapOverlay(props: TravelProps & { onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  return (
    <Window title={props.world.name.charAt(0).toUpperCase() + props.world.name.slice(1)} icon="map" hotkey="M" size="map" className="bigmap" onClose={props.onClose}
      subtitle={<>{formatTime(props.world.minutes, lang)} · {t('One hex is {n} miles', { n: HEX_MILES })}</>}>
      <Maps {...props} />
    </Window>
  );
}

import { useMemo } from 'react';
import { HEX_MILES, TERRAIN, UNKNOWN, findRoute, formatHours, formatTime, sameHex, summarizeRoute, timeOfDay, type Hex, type TerrainCode } from '../../../shared/hex';
import type { GameState, WorldView } from '../../../shared/types';
import type { Connection } from '../net';
import { HexMap, KIND_ICON } from './HexMap';
import { EntityName, useEntity } from './Story';

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
            <b>{dest ? `${KIND_ICON[dest.kind]} ${dest.name}` : code === UNKNOWN ? 'Uncharted land' : `Open ${TERRAIN[code as TerrainCode].name}`}</b>
            <button className="link" onClick={() => setTarget(null)}>cancel</button>
          </div>
          {plan.summary ? (
            <>
              <dl>
                <div><dt>Distance</dt><dd>{plan.summary.miles} miles</dd></div>
                <div><dt>Time</dt><dd>{formatHours(plan.summary.hours)}</dd></div>
                <div><dt>Arrive</dt><dd>{formatTime(plan.summary.arrival)}</dd></div>
                <div><dt>Encounter</dt><dd className={plan.summary.encounterChance > 0.5 ? 'risky' : ''}>{Math.round(plan.summary.encounterChance * 100)}%</dd></div>
              </dl>
              <div className="terrain-row">
                {plan.summary.terrain.map((t) => <span key={t.name} className="chip">{t.name} × {t.hexes}</span>)}
              </div>
              <button className="primary" disabled={!canGo} onClick={() => { conn.send({ t: 'travel', q: target.q, r: target.r }); setTarget(null); }}>
                {state.travelling ? 'Travelling…' : 'Set out'}
              </button>
            </>
          ) : (
            <p className="muted small">{code === 'w' ? 'You cannot cross open water.' : 'You know no way there yet.'}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface PanelProps extends TravelProps {
  onExpand: () => void;
  onJournal: () => void;
}

/** Right-hand panel while exploring: where you are, who is here, the map and your quests. */
export function WorldPanel(props: PanelProps) {
  const { world, state, conn, onExpand, onJournal } = props;
  const place = world.locations.find((l) => l.id === world.placeId) ?? null;
  const parent = place?.parentId ? world.locations.find((l) => l.id === place.parentId) : null;
  const here = world.locations.filter((l) => sameHex(l, world.party) && l.id !== place?.id);
  const present = state.memory.npcs.filter((n) => n.locationId === world.placeId);
  const quests = state.memory.quests.filter((q) => q.status === 'active');
  const terrain = TERRAIN[world.terrain[world.party.r * world.width + world.party.q] as TerrainCode]?.name ?? 'unknown';
  const idle = state.phase === 'explore' && !state.travelling && !state.dmBusy;
  const nearest = !place ? world.locations.filter((l) => !l.parentId).sort((a, b) => Math.abs(a.q - world.party.q) + Math.abs(a.r - world.party.r) - Math.abs(b.q - world.party.q) - Math.abs(b.r - world.party.r))[0] : null;

  return (
    <aside className="worldpanel">
      <header className="where">
        <span className="where-icon">{place ? KIND_ICON[place.kind] : '🧭'}</span>
        <div>
          <h2>{place?.name ?? 'The wilds'}</h2>
          <small>{place ? `${place.kind}${parent ? ` in ${parent.name}` : ''}` : `${terrain}${nearest ? `, near ${nearest.name}` : ''}`}</small>
        </div>
        <div className="clock" title={world.safe ? 'A safe place to rest' : 'Resting here is risky'}>
          <b>{formatTime(world.minutes)}</b>
          <small>{timeOfDay(world.minutes)}{world.safe ? ' · safe' : ''}</small>
        </div>
      </header>

      <div className="wp-scroll">
        <section>
          <h3>Map <button className="link" onClick={onExpand} title="Open the full map (m)">expand</button></h3>
          <TravelMap {...props} local />
        </section>

        {(here.length > 0 || place?.dungeon) && (
          <section>
            <h3>Here</h3>
            <div className="here-list">
              {place?.dungeon && (
                place.dungeon.next
                  ? <button disabled={!idle} onClick={() => conn.send({ t: 'delve' })} title="Fight your way into the next section">⚔️ Delve into {place.dungeon.next} <small>{place.dungeon.cleared}/{place.dungeon.total} cleared</small></button>
                  : <p className="muted small">Cleared. Nothing stirs here any more.</p>
              )}
              {here.map((l) => (
                <button key={l.id} disabled={!idle} onClick={() => conn.send({ t: 'go', locationId: l.id })}>
                  {KIND_ICON[l.kind]} {l.parentId ? `Enter ${l.name}` : `Back to ${l.name}`}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>Who is here</h3>
          {present.length === 0 && <p className="muted small">{place ? 'Nobody you know by name.' : 'Just the party and the wind.'}</p>}
          <ul className="people">
            {present.map((n) => (
              <li key={n.id}>
                <span className={`disp ${n.disposition}`} title={n.disposition} />
                <div><Named name={n.name} /><small>{n.role}</small></div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Quests <button className="link" onClick={onJournal} title="Open the journal (j)">journal</button></h3>
          {quests.length === 0 && <p className="muted small">No open quests. The Vale is wide; go and find trouble.</p>}
          <ul className="quests">
            {quests.map((q) => <li key={q.id}><b>{q.title}</b><small>{q.summary}</small></li>)}
          </ul>
        </section>
      </div>

      <footer className="wp-actions">
        <button disabled={!idle || state.shortRestsLeft <= 0} onClick={() => conn.send({ t: 'short_rest' })} title="One hour. Spend a hit die to heal and recover some mana.">⛺ Short rest <span className="cost">{state.shortRestsLeft}</span></button>
        <button disabled={!idle} onClick={() => conn.send({ t: 'long_rest' })} title={world.safe ? 'Eight hours. Restores everything.' : 'Eight hours. Restores everything, but camping in the wild can be interrupted.'}>🌙 Long rest</button>
      </footer>
    </aside>
  );
}

/** Everything the party (and the Dungeon Master) remembers: quests, deeds, people and places. */
export function Journal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const w = state.world!;
  const { quests, deeds, npcs } = state.memory;
  const placeName = (id: string | null) => w.locations.find((l) => l.id === id)?.name ?? 'parts unknown';
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel journal">
        <header><h1>Journal</h1><button className="link close" onClick={onClose} title="Close (j or Esc)">✕</button></header>
        <div className="journal-body">
          <section>
            <h3>Quests</h3>
            {quests.length === 0 && <p className="muted">Nothing yet.</p>}
            {quests.map((q) => (
              <div key={q.id} className={`quest ${q.status}`}>
                <b>{q.title}</b> <span className="chip">{q.status}</span>
                <p>{q.summary}</p>
                {q.notes.length > 0 && <ul>{q.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              </div>
            ))}
            <h3>Deeds</h3>
            {deeds.length === 0 && <p className="muted">Your story is still unwritten.</p>}
            <ul className="deeds">{deeds.map((d) => <li key={d.id}><small>Day {d.day}</small> {d.text}</li>)}</ul>
          </section>
          <section>
            <h3>People</h3>
            {npcs.length === 0 && <p className="muted">You have met nobody yet.</p>}
            {npcs.map((n) => (
              <div key={n.id} className="person">
                <span className={`disp ${n.disposition}`} title={n.disposition} /> <b>{n.name}</b> <small>{n.role} · {placeName(n.locationId)}</small>
                <p>{n.description}</p>
                {n.notes.length > 0 && <ul>{n.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              </div>
            ))}
            <h3>Places</h3>
            {w.locations.map((l) => (
              <div key={l.id} className="person">
                {KIND_ICON[l.kind]} <b>{l.name}</b> <small>{l.kind}{l.parentId ? ` in ${placeName(l.parentId)}` : ''}{l.visited ? '' : ' · not yet visited'}</small>
                <p>{l.description}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Full-size map overlay. */
export function MapOverlay(props: TravelProps & { onClose: () => void }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="panel bigmap">
        <header><h1>The Emberfall Vale</h1><small className="muted">One hex is {HEX_MILES} miles</small><button className="link close" onClick={props.onClose} title="Close (m or Esc)">✕</button></header>
        <TravelMap {...props} />
      </div>
    </div>
  );
}

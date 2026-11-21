// The test mode toolbox. The owner switches test mode on per table in the Innkeeper; the host then
// gets this window to start fights, level up, change hit points, jump to places, move the clock and
// tell the Dungeon Master what should happen next. The server checks every action.
import { useEffect, useMemo, useState } from 'react';
import { ITEMS } from '../../../shared/content';
import { HERO_CONDITIONS } from '../../../shared/conditions';
import type { Character, GameState, TestAction } from '../../../shared/types';
import { useT } from '../i18n';
import type { Connection } from '../net';
import { Hint } from '../ui/Hint';
import { TabBar, Window } from '../ui/Window';

const TABS = { fight: 'Fight', heroes: 'Heroes', world: 'World', scene: 'Scene' } as const;
type Tab = keyof typeof TABS;

const KINDS = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];

const SCENE_IDEAS = [
  'A travelling merchant appears with an odd offer.',
  'A trap springs in the corridor ahead.',
  'A stranger runs up with urgent news.',
  'A storm breaks and everyone needs shelter.',
  'A wounded traveller begs for help.',
  'The local watch stops the party and asks questions.',
];


export function TestBadge({ state, onClick }: { state: GameState; onClick: () => void }) {
  const t = useT();
  if (!state.testMode) return null;
  return (
    <button type="button" className="test-badge" onClick={onClick}
      title={t('Test mode: nothing here counts unless the innkeeper keeps it.')}>
      {t('Test mode')}
    </button>
  );
}

export function TestToolbox({ state, conn, host, onClose }: { state: GameState; conn: Connection; host: boolean; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('fight');
  const act = (a: TestAction) => conn.send({ t: 'test', do: a });
  const idle = state.phase === 'explore' && !state.travelling;
  useEffect(() => { if (host && !conn.testCatalog.length) act({ op: 'catalog' }); }, [host]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Window title={t('Test mode')} icon="settings" size="medium" className="test-box" onClose={onClose}
      tabs={host ? <TabBar tabs={(Object.keys(TABS) as Tab[]).map((id) => ({ id, label: t(TABS[id]) }))} value={tab} onChange={setTab} /> : undefined}>
      <p className="muted small test-note">
        {t('The innkeeper has switched test mode on. Nothing done here counts for the real campaign unless the innkeeper keeps it.')}
        {!host && ' ' + t('Only the host can use the toolbox.')}
      </p>
      {/* Every pane stays mounted, so what is picked on one tab is still there when you come back to it. */}
      {host && <div hidden={tab !== 'fight'}><FightTab state={state} conn={conn} idle={idle} act={act} onDone={onClose} /></div>}
      {host && <div hidden={tab !== 'heroes'}><HeroesTab state={state} act={act} /></div>}
      {host && <div hidden={tab !== 'world'}><WorldTab state={state} idle={idle} act={act} /></div>}
      {host && <div hidden={tab !== 'scene'}><SceneTab idle={idle} act={act} onDone={onClose} /></div>}
    </Window>
  );
}

function FightTab({ state, conn, idle, act, onDone }: { state: GameState; conn: Connection; idle: boolean; act: (a: TestAction) => void; onDone: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<'pick' | 'budget'>('pick');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, number>>({});
  const avg = Math.max(1, Math.round(state.characters.reduce((n, c) => n + c.level, 0) / Math.max(1, state.characters.length)));
  const [budget, setBudget] = useState(avg);
  const [kind, setKind] = useState('');
  const [opening, setOpening] = useState<'none' | 'surprise' | 'ambush'>('none');
  const [heroId, setHeroId] = useState('');
  const catalog = conn.testCatalog;
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((m) => !q || m.name.toLowerCase().includes(q) || m.kind.includes(q) || m.cr === q).slice(0, 40);
  }, [catalog, query]);
  const ids = Object.keys(picked);
  const nameOf = (id: string) => catalog.find((m) => m.id === id)?.name ?? id;
  const change = (id: string, d: number) => setPicked((p) => { const n = Math.max(0, Math.min(8, (p[id] ?? 0) + d)); const next = { ...p }; if (n) next[id] = n; else delete next[id]; return next; });
  const ready = idle && (mode === 'budget' || ids.length > 0);
  // The window gets out of the way, so the fight (or the scene) can be watched.
  const start = () => { act({ op: 'fight', opening, ...(opening === 'surprise' && heroId ? { heroId } : {}), ...(mode === 'pick' ? { monsters: ids.map((id) => ({ id, count: picked[id] })) } : { budget, kind }) }); onDone(); };
  return (
    <div className="test-pane">
      <div className="pick test-modes">
        <button type="button" className={mode === 'pick' ? 'on' : ''} onClick={() => setMode('pick')}>{t('Pick monsters')}</button>
        <button type="button" className={mode === 'budget' ? 'on' : ''} onClick={() => setMode('budget')}>{t('Challenge budget')}</button>
      </div>
      {mode === 'pick' ? (
        <>
          <input type="search" value={query} placeholder={t('Search by name, type or challenge')} aria-label={t('Search by name, type or challenge')} onChange={(e) => setQuery(e.target.value)} />
          <ul className="test-list">
            {found.map((m) => (
              <li key={m.id}><button type="button" onClick={() => change(m.id, 1)}><b>{m.name}</b><span className="muted">{t('CR')} {m.cr} · {t(m.kind)}</span></button></li>
            ))}
            {!found.length && <li className="muted">{catalog.length ? t('Nothing matches.') : t('Loading…')}</li>}
          </ul>
          <div className="test-picked">
            {ids.length === 0 && <span className="muted">{t('Click a monster to add it to the fight.')}</span>}
            {ids.map((id) => (
              <span key={id} className="test-chip">
                <button type="button" aria-label={t('Fewer')} onClick={() => change(id, -1)}>−</button>
                <b>{picked[id]}× {nameOf(id)}</b>
                <button type="button" aria-label={t('More')} onClick={() => change(id, 1)}>+</button>
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="test-row">
          <label>{t('Total challenge rating')} <input type="number" min={0.125} max={30} step={0.5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
          <label>{t('Creature type')}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t('Any')}</option>
              {KINDS.map((k) => <option key={k} value={k}>{t(k)}</option>)}
            </select>
          </label>
          <span className="muted small">{t('The server draws a fitting group at random. A party of fewer than four meets fewer of them.')}</span>
        </div>
      )}
      <div className="test-row">
        <label>{t('How it begins')}
          <select value={opening} onChange={(e) => setOpening(e.target.value as typeof opening)}>
            <option value="none">{t('Normal start')}</option>
            <option value="surprise">{t('Heroes surprise the enemies')}</option>
            <option value="ambush">{t('Enemies ambush the heroes')}</option>
          </select>
        </label>
        {opening === 'surprise' && (
          <label>{t('Strikes first from hiding')}
            <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
              <option value="">{t('Nobody')}</option>
              {state.characters.filter((c) => !c.dead).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="test-actions">
        <button type="button" className="primary" disabled={!ready} onClick={start}>{t('Start the fight')}</button>
        {!idle && <span className="muted small">{state.phase === 'combat' ? t('A fight is already under way.') : t('Not possible right now.')}</span>}
      </div>
    </div>
  );
}

function HeroesTab({ state, act }: { state: GameState; act: (a: TestAction) => void }) {
  const t = useT();
  const heroes = state.characters;
  const [id, setId] = useState(heroes[0]?.id ?? '');
  const hero: Character | undefined = heroes.find((c) => c.id === id) ?? heroes[0];
  const [levels, setLevels] = useState(1);
  const [xp, setXp] = useState(300);
  const [hp, setHp] = useState(1);
  const [gold, setGold] = useState(100);
  const [itemQuery, setItemQuery] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const items = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return Object.values(ITEMS).filter((d) => !q || t(d.name).toLowerCase().includes(q) || d.name.toLowerCase().includes(q)).slice(0, 60);
  }, [itemQuery, t]);
  if (!hero) return <p className="muted">{t('There are no heroes yet.')}</p>;
  const down = hero.hp <= 0 || hero.dead;
  return (
    <div className="test-pane">
      <div className="test-row">
        <label>{t('Hero')}
          <select value={hero.id} onChange={(e) => setId(e.target.value)}>
            {heroes.map((c) => <option key={c.id} value={c.id}>{c.name} ({t('Level')} {c.level})</option>)}
          </select>
        </label>
        <span className="muted small">{t('HP')} {hero.hp}/{hero.maxHp} · {t('Mana')} {hero.mana}/{hero.maxMana} · {t('XP')} {hero.xp}</span>
      </div>
      <fieldset>
        <legend>{t('Level and experience')}</legend>
        <div className="test-row">
          <label>{t('Levels')} <input type="number" min={1} max={19} value={levels} onChange={(e) => setLevels(Number(e.target.value))} /></label>
          <button type="button" onClick={() => act({ op: 'level', characterId: hero.id, levels })}>{t('Level up')}</button>
          <label>{t('XP for the party')} <input type="number" min={1} step={50} value={xp} onChange={(e) => setXp(Number(e.target.value))} /></label>
          <button type="button" onClick={() => act({ op: 'xp', amount: xp })}>{t('Give XP')}</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('Hit points and resources')}</legend>
        <div className="test-row">
          <label>{t('HP')} <input type="number" min={0} max={hero.maxHp} value={hp} onChange={(e) => setHp(Number(e.target.value))} /></label>
          <button type="button" disabled={hero.dead} onClick={() => act({ op: 'hp', characterId: hero.id, hp })}>{t('Set')}</button>
          <button type="button" disabled={hero.dead} onClick={() => act({ op: 'hp', characterId: hero.id, hp: hero.maxHp })}>{t('Full')}</button>
          <button type="button" disabled={hero.dead || down} onClick={() => act({ op: 'hp', characterId: hero.id, hp: 0 })}>{t('Knock out')}</button>
          <button type="button" disabled={!down} onClick={() => act({ op: 'revive', characterId: hero.id })}>{t('Revive')}</button>
        </div>
        <div className="test-row">
          <Hint text={t('Mana, class resources and spent abilities come back. Hit points stay.')}>
            <button type="button" onClick={() => act({ op: 'restore', characterId: hero.id })}>{t('Restore this hero’s resources')}</button>
          </Hint>
          <button type="button" onClick={() => act({ op: 'restore' })}>{t('Restore the whole party')}</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('Conditions')}</legend>
        <div className="test-conds">
          {HERO_CONDITIONS.map((cnd) => {
            const on = hero.conditions.includes(cnd);
            return <button key={cnd} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => act({ op: 'condition', characterId: hero.id, condition: cnd, on: !on })}>{t(cnd)}</button>;
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('Items and gold')}</legend>
        <div className="test-row">
          <input type="search" value={itemQuery} placeholder={t('Search items')} aria-label={t('Search items')} onChange={(e) => setItemQuery(e.target.value)} />
          <select value={itemId} aria-label={t('Item')} onChange={(e) => setItemId(e.target.value)}>
            <option value="">{t('Pick an item')}</option>
            {items.map((d) => <option key={d.id} value={d.id}>{t(d.name)}</option>)}
          </select>
          <label>{t('Quantity')} <input type="number" min={1} max={10} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></label>
          <button type="button" disabled={!itemId} onClick={() => act({ op: 'item', characterId: hero.id, itemId, qty })}>{t('Give')}</button>
        </div>
        <div className="test-row">
          <label>{t('Gold')} <input type="number" step={50} value={gold} onChange={(e) => setGold(Number(e.target.value))} /></label>
          <button type="button" onClick={() => act({ op: 'gold', amount: gold })}>{t('Give gold')}</button>
          <button type="button" onClick={() => act({ op: 'gold', amount: -gold })}>{t('Take gold')}</button>
          <span className="muted small">{state.gold} {t('gp')}</span>
        </div>
      </fieldset>
    </div>
  );
}

const HOURS: [string, number][] = [['Midnight', 0], ['Dawn', 6], ['Noon', 12], ['Dusk', 19]];

function WorldTab({ state, idle, act }: { state: GameState; idle: boolean; act: (a: TestAction) => void }) {
  const t = useT();
  const places = state.world?.locations ?? [];
  const [place, setPlace] = useState('');
  const [spot, setSpot] = useState('');
  const here = places.find((l) => l.id === state.world?.placeId);
  const root = here?.parentId ? places.find((l) => l.id === here.parentId) ?? here : here;
  const spots = root?.zone?.spots ?? [];
  const target = place || places[0]?.id || '';
  const hour = state.world ? Math.floor(state.world.minutes / 60) % 24 : 0;
  return (
    <div className="test-pane">
      <fieldset disabled={!idle}>
        <legend>{t('Place')}</legend>
        <div className="test-row">
          <label>{t('Go to')}
            <select value={target} onChange={(e) => setPlace(e.target.value)}>
              {places.map((l) => <option key={l.id} value={l.id}>{l.parentId ? '↳ ' : ''}{l.name}</option>)}
            </select>
          </label>
          <label>{t('Spot (optional)')}
            <input list="test-spots" value={spot} placeholder={t('A spot on the zone map')} onChange={(e) => setSpot(e.target.value)} />
            <datalist id="test-spots">{spots.map((s) => <option key={s.id} value={s.name} />)}</datalist>
          </label>
          <button type="button" disabled={!target} onClick={() => act({ op: 'jump', locationId: target, spot })}>{t('Jump there')}</button>
          <button type="button" onClick={() => act({ op: 'reveal' })}>{t('Reveal the whole region')}</button>
        </div>
      </fieldset>
      <fieldset disabled={!idle}>
        <legend>{t('Clock')}</legend>
        <div className="test-row">
          {[['+1 hour', 60], ['+4 hours', 240], ['+1 day', 1440]].map(([label, minutes]) => (
            <button key={label} type="button" onClick={() => act({ op: 'time', minutes: Number(minutes) })}>{t(String(label))}</button>
          ))}
          <span className="muted small">{t('Jump to:')}</span>
          {HOURS.map(([label, h]) => <button key={label} type="button" className={hour === h ? 'on' : ''} onClick={() => act({ op: 'time', hour: h })}>{t(label)}</button>)}
        </div>
      </fieldset>
      <fieldset disabled={!idle}>
        <legend>{t('Rest')}</legend>
        <div className="test-row">
          <button type="button" onClick={() => act({ op: 'rest', kind: 'short' })}>{t('Short rest')}</button>
          <button type="button" onClick={() => act({ op: 'rest', kind: 'long' })}>{t('Long rest')}</button>
          <span className="muted small">{t('Always works, and is never interrupted.')}</span>
        </div>
      </fieldset>
      {!idle && <p className="muted small">{t('Not possible during a fight or a journey.')}</p>}
    </div>
  );
}

function SceneTab({ idle, act, onDone }: { idle: boolean; act: (a: TestAction) => void; onDone: () => void }) {
  const t = useT();
  const [text, setText] = useState('');
  return (
    <div className="test-pane">
      <p className="muted small">{t('Tell the Dungeon Master what should happen next. The players never see this note; the story just takes that turn.')}</p>
      <textarea rows={3} maxLength={300} value={text} placeholder={t('For example: a merchant appears')} aria-label={t('What should happen next')} onChange={(e) => setText(e.target.value)} />
      <div className="test-conds">
        {SCENE_IDEAS.map((idea) => <button key={idea} type="button" onClick={() => setText(t(idea))}>{t(idea)}</button>)}
      </div>
      <div className="test-actions">
        <button type="button" className="primary" disabled={!idle || !text.trim()} onClick={() => { act({ op: 'scene', text: text.trim() }); setText(''); onDone(); }}>{t('Make it happen')}</button>
        {!idle && <span className="muted small">{t('Not possible during a fight or a journey.')}</span>}
      </div>
    </div>
  );
}

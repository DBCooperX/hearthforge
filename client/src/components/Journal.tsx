// The journal: a bound book of everything the party (and the Dungeon Master) remembers.
// Six bookmarks, a list on the left page and the chosen entry written out on the right.
import { ItemIcon } from '../ui/ItemIcon';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { HEX_MILES, direction, formatTime, hexDistance, type Hex } from '../../../shared/hex';
import type { Disposition, GameState, ItemDef, Location, Mystery, Npc, Quest, QuestStatus } from '../../../shared/types';
import { TROPHIES } from '../../../shared/achievements';
import { TIER_PRICE, TIER_TEXT, type FactionView } from '../../../shared/reputation';
import { useLang, useT } from '../i18n';
import { KIND_ICON } from './HexMap';
import { RichText } from './Story';
import { Icon, type IconName } from '../ui/icons';
import { JOURNAL_EMPTY, JOURNAL_TABS, QUEST_HEADS } from '../ui/labels';
import { sfx } from '../ui/sound';
import { TabBar, Window } from '../ui/Window';

type Tab = keyof typeof JOURNAL_TABS;
const TABS: { id: Tab; icon: IconName }[] = [{ id: 'quests', icon: 'quest' }, { id: 'clues', icon: 'search' }, { id: 'people', icon: 'people' }, { id: 'places', icon: 'places' }, { id: 'standing', icon: 'shield' }, { id: 'lore', icon: 'lore' }];
const CHRONICLE = '~chronicle';
const RUMOURS = '~rumours';
const TROPHY_BOOK = '~trophies';

/** Where the book was last open, kept for as long as the page is. */
const remembered: { tab: Tab; entry: Partial<Record<Tab, string>> } = { tab: 'quests', entry: {} };

const QUEST_ORDER: QuestStatus[] = ['active', 'completed', 'failed'];

interface Entry {
  id: string;
  title: string;
  sub?: string;
  /** Heading of the group this entry starts. */
  head?: string;
  mark: ReactNode;
  indent?: boolean;
  faded?: boolean;
}

/** A portrait stand-in until the game draws people: a wax seal with their initial, ringed in the colour of how they feel about the party. */
function Seal({ name, disposition, large, portraitId }: { name: string; disposition: Disposition; large?: boolean; portraitId?: string | null }) {
  // Once the game has painted them, their portrait takes the seal's place inside the same coloured ring.
  if (portraitId && /^[a-f0-9]{18}$/.test(portraitId)) {
    return <span className={['seal', 'painted', disposition, large && 'large'].filter(Boolean).join(' ')} aria-hidden="true"><img src={`/pictures/${portraitId}`} alt="" loading="lazy" /></span>;
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) % 360;
  return (
    <span className={['seal', disposition, large && 'large'].filter(Boolean).join(' ')} style={{ '--hue': hash } as React.CSSProperties} aria-hidden="true">
      {name.replace(/^(Old|Sister|Brother|Reeve|Alte[rs]?|Schwester|Bruder|Vogt)\s+/u, '').trim().charAt(0).toUpperCase()}
    </span>
  );
}

interface Props {
  state: GameState;
  onClose: () => void;
  /** Open the map with this hex chosen. Absent when the map cannot be opened, as in a fight. */
  onShowMap?: (hex: Hex) => void;
}

export function Journal({ state, onClose, onShowMap }: Props) {
  const t = useT();
  const { lang } = useLang();
  const w = state.world!;
  const { quests, deeds, npcs } = state.memory;
  const mysteries = state.memory.mysteries ?? [];
  const { factions, rumours, trophies } = state;
  const [tab, setTabState] = useState<Tab>(remembered.tab);
  const [picked, setPicked] = useState<Partial<Record<Tab, string>>>(remembered.entry);
  const finds = useMemo(() => Object.values(state.items).filter((i) => i.story), [state.items]);
  const placeName = (id: string | null) => w.locations.find((l) => l.id === id)?.name ?? t('parts unknown');

  const entries: Record<Tab, Entry[]> = useMemo(() => {
    const questList = QUEST_ORDER.flatMap((status) => quests.filter((q) => q.status === status).map((q, i): Entry => ({
      id: q.id, title: q.title, head: i === 0 ? t(QUEST_HEADS[status]) : undefined, faded: status !== 'active',
      mark: <span className={`quest-pip ${status}`} />,
      sub: q.notes.length ? q.notes[q.notes.length - 1] : undefined,
    })));
    // Open questions first, newest clue on top, then the solved ones.
    const latest = (m: Mystery) => m.clues[m.clues.length - 1]?.day ?? 0;
    const open = mysteries.filter((m) => !m.solved).sort((a, b) => latest(b) - latest(a));
    const solved = mysteries.filter((m) => m.solved);
    const clueList = [...open, ...solved].map((m, i): Entry => ({
      id: m.id, title: m.question, faded: m.solved,
      head: i === 0 && open.length ? t('Open questions') : i === open.length ? t('Solved') : undefined,
      sub: m.clues.length === 1 ? t('1 clue') : m.clues.length ? t('{n} clues', { n: m.clues.length }) : undefined,
      mark: <span className={`quest-pip ${m.solved ? 'completed' : 'active'}`} />,
    }));
    const people = [...npcs].sort((a, b) => a.name.localeCompare(b.name)).map((n): Entry => ({
      id: n.id, title: n.name, sub: n.role, mark: <Seal name={n.name} disposition={n.disposition} portraitId={n.portraitId} />,
    }));
    const top = w.locations.filter((l) => !l.parentId);
    const places = top.flatMap((l) => [l, ...w.locations.filter((x) => x.parentId === l.id)]).map((l): Entry => ({
      id: l.id, title: l.name, indent: !!l.parentId, faded: !l.visited,
      sub: l.visited ? t(l.kind) : `${t(l.kind)} · ${t('not yet visited')}`,
      mark: <span className="place-mark">{KIND_ICON[l.kind]}</span>,
    }));
    const standing = factions.map((f): Entry => ({
      id: f.id, title: f.name, sub: `${t(f.tier)} · ${f.standing > 0 ? '+' : ''}${f.standing}`, mark: <span className={`tier-pip ${f.tier}`} />,
    }));
    const earned = trophies.filter((x) => x.day !== null).length;
    const lore: Entry[] = [
      { id: CHRONICLE, title: t('Chronicle of deeds'), sub: deeds.length ? t('{n} entries', { n: deeds.length }) : t('Still unwritten'), head: t('The story so far'), mark: <span className="place-mark">📜</span> },
      { id: RUMOURS, title: t('Rumours'), sub: rumours.length ? t('{n} entries', { n: rumours.length }) : t('Nothing heard yet'), mark: <span className="place-mark">👂</span> },
      { id: TROPHY_BOOK, title: t('Trophies'), sub: t('{n} of {total}', { n: earned, total: trophies.length }), mark: <span className="place-mark">🏆</span> },
      ...finds.map((i, n): Entry => ({ id: i.id, title: i.name, sub: `${t(i.story!.category)}${i.story!.quest ? ` · ${t('Quest item')}` : ''}`, head: n === 0 ? t('Clues and keepsakes') : undefined, mark: <span className="place-mark"><ItemIcon def={i} /></span> })),
    ];
    return { quests: questList, clues: clueList, people, places, standing, lore };
  }, [quests, mysteries, npcs, w.locations, deeds.length, finds, factions, rumours, trophies, t]);

  const list = entries[tab];
  const current = list.find((e) => e.id === picked[tab]) ?? list[0] ?? null;
  const setTab = (next: Tab) => { remembered.tab = next; setTabState(next); };
  const pick = (id: string) => { remembered.entry = { ...picked, [tab]: id }; setPicked(remembered.entry); };

  // 1 to 6 turn to a bookmark; the arrow keys walk the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const byNumber = TABS[Number(e.key) - 1];
      if (byNumber && /^[1-6]$/.test(e.key)) { if (byNumber.id !== tab) { setTab(byNumber.id); sfx('page'); } return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const at = list.findIndex((x) => x.id === current?.id);
      const next = list[at + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) { pick(next.id); sfx('click'); document.querySelector(`[data-entry="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const where = (l: Location) => {
    const d = hexDistance(w.party, l);
    return d === 0 ? t('You are here') : t('{miles} miles to the {direction}', { miles: d * HEX_MILES, direction: t(direction(w.party, l)) });
  };

  const questPage = (q: Quest) => (
    <article className="entry" key={q.id}>
      <span className={`stamp ${q.status}`}>{t(q.status)}</span>
      <h2>{q.title}</h2>
      <p className="lead"><RichText text={q.summary} /></p>
      {q.notes.length > 0 ? (
        <>
          <h3>{t('What you know')}</h3>
          <ul className="notes">
            {q.notes.map((n, i) => <li key={i} className={q.status === 'active' && i === q.notes.length - 1 ? 'latest' : ''}><RichText text={n} /></li>)}
          </ul>
        </>
      ) : q.status === 'active' && <p className="aside">{t('No leads yet. Ask around, or go and look.')}</p>}
    </article>
  );

  const mysteryPage = (m: Mystery) => (
    <article className="entry" key={m.id}>
      <span className={`stamp ${m.solved ? 'completed' : 'active'}`}>{t(m.solved ? 'Solved' : 'Unsolved')}</span>
      <h2>{m.question}</h2>
      <h3>{t('What you know')}</h3>
      <ul className="notes">
        {m.clues.map((c, i) => (
          <li key={i} className={!m.solved && i === m.clues.length - 1 ? 'latest' : ''}>
            <small>{t('Day')} {c.day}</small> <RichText text={c.text} />
            {(c.source || c.place) && <small className="rumour-meta"> {[c.source, c.place].filter(Boolean).join(' · ')}</small>}
          </li>
        ))}
      </ul>
    </article>
  );

  const personPage = (n: Npc) => {
    const place = w.locations.find((l) => l.id === n.locationId);
    return (
      <article className="entry" key={n.id}>
        <header className="entry-head">
          <Seal name={n.name} disposition={n.disposition} portraitId={n.portraitId} large />
          <div>
            <h2>{n.name}</h2>
            <p className="byline">{n.role}</p>
          </div>
        </header>
        <dl className="facts">
          <div><dt>{t('Disposition')}</dt><dd className={`disposition ${n.disposition}`}>{t(n.disposition)}</dd></div>
          <div><dt>{t('Last seen')}</dt><dd>{place ? <button type="button" className="inklink" onClick={() => { setTab('places'); remembered.entry = { ...picked, places: place.id }; setPicked(remembered.entry); sfx('page'); }}>{place.name}</button> : t('parts unknown')}</dd></div>
        </dl>
        <p className="lead"><RichText text={n.description} /></p>
        {n.notes.length > 0 && (
          <>
            <h3>{t('What you know')}</h3>
            <ul className="notes">{n.notes.map((x, i) => <li key={i}><RichText text={x} /></li>)}</ul>
          </>
        )}
      </article>
    );
  };

  const placePage = (l: Location) => {
    const inside = w.locations.filter((x) => x.parentId === l.id);
    const here = npcs.filter((n) => n.locationId === l.id || inside.some((x) => x.id === n.locationId));
    const onMap = l.parentId ? w.locations.find((x) => x.id === l.parentId) ?? l : l;
    return (
      <article className="entry" key={l.id}>
        <header className="entry-head">
          <span className="place-mark large">{KIND_ICON[l.kind]}</span>
          <div>
            <h2>{l.name}</h2>
            <p className="byline">{l.parentId ? t('{kind} in {place}', { kind: t(l.kind), place: placeName(l.parentId) }) : t(l.kind)}</p>
          </div>
        </header>
        <dl className="facts">
          <div><dt>{t('Distance')}</dt><dd>{where(onMap)}</dd></div>
          <div><dt>{t('Visited')}</dt><dd>{l.visited ? t('Yes') : t('Not yet')}</dd></div>
          {l.dungeon && <div><dt>{t('Cleared')}</dt><dd>{t('{n} of {total} sections cleared', { n: l.dungeon.cleared, total: l.dungeon.total })}</dd></div>}
        </dl>
        <p className="lead"><RichText text={l.description} /></p>
        {inside.length > 0 && (
          <>
            <h3>{t('Places inside')}</h3>
            <ul className="links">{inside.map((x) => <li key={x.id}><button type="button" className="inklink" onClick={() => { pick(x.id); sfx('click'); }}>{KIND_ICON[x.kind]} {x.name}</button></li>)}</ul>
          </>
        )}
        {here.length > 0 && (
          <>
            <h3>{t('People you met here')}</h3>
            <ul className="links">
              {here.map((n) => (
                <li key={n.id}>
                  <button type="button" className="inklink" onClick={() => { setTab('people'); remembered.entry = { ...picked, people: n.id }; setPicked(remembered.entry); sfx('page'); }}>
                    <Seal name={n.name} disposition={n.disposition} portraitId={n.portraitId} /> {n.name}
                  </button>
                  <small>{n.role}</small>
                </li>
              ))}
            </ul>
          </>
        )}
        {onShowMap && <button type="button" className="page-button" onClick={() => onShowMap({ q: onMap.q, r: onMap.r })}><Icon name="map" size={16} /> {t('Show on the map')}</button>}
      </article>
    );
  };

  const chroniclePage = () => {
    const days = [...new Set(deeds.map((d) => d.day))].sort((a, b) => a - b);
    return (
      <article className="entry" key={CHRONICLE}>
        <h2>{t('Chronicle of deeds')}</h2>
        {deeds.length === 0 && <p className="aside">{t('Your story is still unwritten.')}</p>}
        {days.map((day) => (
          <section key={day} className="day">
            <h3>{t('Day')} {day}</h3>
            <ul className="notes">{deeds.filter((d) => d.day === day).map((d) => <li key={d.id}><RichText text={d.text} /></li>)}</ul>
          </section>
        ))}
      </article>
    );
  };

  const factionPage = (f: FactionView) => {
    const price = f.id === 'guild' ? Math.round((TIER_PRICE[f.tier] - 1) * 100) : null;
    return (
      <article className="entry" key={f.id}>
        <span className={`stamp tier-${f.tier}`}>{t(f.tier)}</span>
        <h2>{f.name}</h2>
        <p className="byline">{f.blurb}</p>
        <div className="meter" role="img" aria-label={`${f.standing}`}>
          <span className="meter-mid" />
          <span className={`meter-mark ${f.tier}`} style={{ left: `${(f.standing + 100) / 2}%` }} />
        </div>
        <div className="meter-scale"><small>−100</small><small>0</small><small>+100</small></div>
        <dl className="facts">
          <div><dt>{t('Standing')}</dt><dd>{f.standing > 0 ? '+' : ''}{f.standing}</dd></div>
          <div><dt>{t('Opinion')}</dt><dd>{t(TIER_TEXT[f.tier])}</dd></div>
          {price !== null && <div><dt>{t('Prices in shops')}</dt><dd>{price > 0 ? '+' : ''}{price} %</dd></div>}
        </dl>
        <h3>{t('Lately')}</h3>
        {f.history.length === 0
          ? <p className="aside">{t('Nothing they would remember yet.')}</p>
          : <ul className="notes">{[...f.history].reverse().map((h, i) => <li key={i}><small>{t('Day')} {h.day}</small> <b className={h.delta > 0 ? 'up' : 'down'}>{h.delta > 0 ? '+' : ''}{h.delta}</b> {h.why}</li>)}</ul>}
      </article>
    );
  };

  const rumourPage = () => (
    <article className="entry" key={RUMOURS}>
      <h2>{t('Rumours')}</h2>
      <p className="byline">{t('Word on the road. Gossip travels from place to place, a few miles a day.')}</p>
      {rumours.length === 0 && <p className="aside">{t('You have not heard any gossip yet. Listen in taverns and market squares.')}</p>}
      <ul className="notes">
        {[...rumours].reverse().map((r) => (
          <li key={r.id}>
            <small>{t('Day')} {r.heard}</small> <RichText text={r.text} />
            {(r.from || r.aboutParty) && <small className="rumour-meta"> {r.aboutParty ? t('about you') : ''}{r.aboutParty && r.from ? ' · ' : ''}{r.from ? t('from {place}', { place: r.from }) : ''}</small>}
          </li>
        ))}
      </ul>
    </article>
  );

  const trophyPage = () => (
    <article className="entry" key={TROPHY_BOOK}>
      <h2>{t('Trophies')}</h2>
      <ul className="trophies">
        {TROPHIES.map((def) => {
          const v = trophies.find((x) => x.id === def.id);
          const got = v?.day != null;
          return (
            <li key={def.id} className={got ? 'got' : ''}>
              <span className="trophy-icon">{def.icon}</span>
              <span><b>{t(def.name)}</b><small>{t(def.text)}</small>
                {got ? <small className="trophy-day">{t('Day')} {v!.day}</small> : def.need > 1 && <small className="trophy-day">{v?.have ?? 0} / {def.need}</small>}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );

  const findPage = (i: ItemDef) => {
    const st = i.story!;
    const holder = state.characters.find((c) => c.bag.some((b) => b?.defId === i.id) || Object.values(c.equipment).some((e) => e?.defId === i.id));
    return (
      <article className="entry" key={i.id}>
        <header className="entry-head">
          <span className="place-mark large"><ItemIcon def={i} /></span>
          <div>
            <h2>{i.name}</h2>
            <p className="byline">{t(st.category)}{st.quest ? ` · ${t('Quest item')}` : ''}{i.rarity && i.rarity !== 'common' ? ` · ${t(i.rarity)}` : ''}</p>
          </div>
        </header>
        <dl className="facts">
          <div><dt>{t('Found')}</dt><dd>{st.foundAt ? t('Found on day {day} at {place}', { day: st.foundDay, place: st.foundAt }) : t('Found on day {day}', { day: st.foundDay })}</dd></div>
          <div><dt>{t('Now')}</dt><dd>{holder ? t('Carried by {name}', { name: holder.name }) : t('No longer with the party')}</dd></div>
        </dl>
        <p className="lead">{i.description}</p>
        {st.notes.length > 0 && (
          <>
            <h3>{t('What you know')}</h3>
            <ul className="notes">{st.notes.map((n, k) => <li key={k}><small>{t('Day')} {n.day}</small> <RichText text={n.text} /></li>)}</ul>
          </>
        )}
      </article>
    );
  };

  let page: ReactNode = null;
  if (current) {
    if (tab === 'quests') { const q = quests.find((x) => x.id === current.id); page = q && questPage(q); }
    else if (tab === 'clues') { const m = mysteries.find((x) => x.id === current.id); page = m && mysteryPage(m); }
    else if (tab === 'people') { const n = npcs.find((x) => x.id === current.id); page = n && personPage(n); }
    else if (tab === 'places') { const l = w.locations.find((x) => x.id === current.id); page = l && placePage(l); }
    else if (tab === 'standing') { const f = factions.find((x) => x.id === current.id); page = f && factionPage(f); }
    else if (current.id === CHRONICLE) page = chroniclePage();
    else if (current.id === RUMOURS) page = rumourPage();
    else if (current.id === TROPHY_BOOK) page = trophyPage();
    else { const i = finds.find((x) => x.id === current.id); page = i && findPage(i); }
  }

  const counts: Record<Tab, number> = { quests: quests.filter((q) => q.status === 'active').length, clues: mysteries.filter((m) => !m.solved).length, people: npcs.length, places: w.locations.length, standing: factions.length, lore: finds.length + (deeds.length ? 1 : 0) + rumours.length };

  return (
    <Window title={t('Journal')} icon="journal" hotkey="J" size="book" className="journal" onClose={onClose} subtitle={formatTime(w.minutes, lang)}>
      <TabBar className="bookmarks" sound="page" value={tab} onChange={setTab} tabs={TABS.map((x) => ({ id: x.id, label: t(JOURNAL_TABS[x.id]), icon: x.icon, count: counts[x.id] }))} />
      <div className="book">
        <div className="page left">
          {list.length === 0 && <p className="aside">{t(JOURNAL_EMPTY[tab])}</p>}
          <ul className="entries">
            {list.map((e) => (
              <li key={e.id}>
                {e.head && <h3>{e.head}</h3>}
                <button type="button" data-entry={e.id} className={['entry-row', e.id === current?.id && 'on', e.indent && 'indent', e.faded && 'faded'].filter(Boolean).join(' ')}
                  aria-current={e.id === current?.id} onClick={() => { if (e.id !== current?.id) { pick(e.id); sfx('click'); } }}>
                  {e.mark}
                  <span className="entry-text"><b>{e.title}</b>{e.sub && <small>{e.sub}</small>}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="page right">
          {page ?? <p className="aside center">{t('Choose an entry on the left page.')}</p>}
        </div>
      </div>
    </Window>
  );
}

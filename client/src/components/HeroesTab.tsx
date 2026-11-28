// The Heroes tab of the main screen: every hero this account keeps, as portrait cards, with the details of
// one hero in a side panel. From here a hero is made, changed, copied, deleted or taken to a table.
import { useMemo, useState } from 'react';
import { ABILITIES, CLASS_INFO } from '../../../shared/content';
import { buildSheet } from '../../../shared/build';
import { ABILITY_KEYS, BACKGROUNDS, CLASSES } from '../../../shared/rules';
import { MAX_TEMPLATES, type HeroTemplate } from '../../../shared/accounts';
import type { TableSummary } from '../../../shared/types';
import { traitLines, traitText } from '../../../shared/traits';
import { artOfDraft, heroPortraitUrl } from '../game/heroArt';
import { classLabel, heroTitle } from '../game/util';
import { playerId } from '../net';
import { useLang, useT } from '../i18n';
import { bringHero, copyTemplate, deleteTemplate } from '../templates';
import { ask } from '../ui/Confirm';
import { Icon } from '../ui/icons';
import { Creator } from './Creator';
import { useDismiss } from './Lobby';
import { accountErrorText } from './SignIn';

/** Where a saved hero plays: each table with a copy of them, and the level that copy has reached. */
export interface HeroAt { table: TableSummary; level: number }

interface Props {
  heroes: HeroTemplate[];
  loaded: boolean;
  tables: TableSummary[];
  /** Whether sitting down or opening a table can happen right now. */
  ready: boolean;
  /** Go to one of your tables. */
  onSit: (tb: TableSummary) => void;
  /** Open a new table with this many seats. */
  onOpen: (seats: number, name?: string) => void;
}

/** A free name for a copy: "Brann II", "Brann III" and so on, within the twenty letters a name may have. */
function copyName(name: string, taken: string[]): string {
  const base = name.replace(/\s+[IVX]+$/, '');
  for (const n of ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']) {
    const next = `${base.slice(0, 19 - n.length)} ${n}`;
    if (!taken.includes(next)) return next;
  }
  return base.slice(0, 20);
}

export function HeroesTab({ heroes, loaded, tables, ready, onSit, onOpen }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [cls, setCls] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  /** The creator: a new hero (`true`) or a saved one being changed. */
  const [creating, setCreating] = useState<HeroTemplate | true | null>(null);
  const [error, setError] = useState('');

  /** For every saved hero, the tables where a copy of them sits. */
  const where = useMemo(() => {
    const map = new Map<string, HeroAt[]>();
    for (const tb of tables) {
      if (!tb.players.some((p) => p.id === playerId)) continue;
      for (const k of tb.kept ?? []) map.set(k.templateId, [...(map.get(k.templateId) ?? []), { table: tb, level: k.level }]);
    }
    return map;
  }, [tables]);
  const classes = useMemo(() => [...new Set(heroes.map((h) => h.spec.classId))].sort((a, b) => t(CLASSES[a].name).localeCompare(t(CLASSES[b].name))), [heroes, t]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return heroes
      .filter((h) => !cls || h.spec.classId === cls)
      .filter((h) => !q || [h.name, t(CLASSES[h.spec.classId].name), heroTitle({ className: CLASSES[h.spec.classId].name, gender: h.spec.gender, speciesId: h.spec.speciesId }, t)].some((s) => s.toLocaleLowerCase().includes(q)))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [heroes, cls, query, t]);
  const hero = heroes.find((h) => h.id === picked) ?? null;
  const full = heroes.length >= MAX_TEMPLATES;

  const copy = async (h: HeroTemplate) => {
    setError('');
    try {
      const list = await copyTemplate(h.id, copyName(h.name, heroes.map((x) => x.name)));
      const made = [...list].sort((a, b) => b.savedAt - a.savedAt)[0];
      if (made) setPicked(made.id);
    } catch (err) { setError(accountErrorText(t, err)); }
  };
  const remove = async (h: HeroTemplate) => {
    if (!(await ask(t('Delete {name} from My heroes? Heroes already at a table keep playing.', { name: h.name }), { ok: t('Delete'), danger: true }))) return;
    setPicked(null);
    try { await deleteTemplate(h.id); } catch (err) { setError(accountErrorText(t, err)); }
  };

  const toolbar = (
    <div className="home-bar">
      {heroes.length > 6 && (
        <label className="home-search">
          <Icon name="search" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search heroes')} aria-label={t('Search heroes')} />
        </label>
      )}
      {classes.length > 1 && (
        <select className="home-filter" value={cls} onChange={(e) => setCls(e.target.value)} aria-label={t('Class')}>
          <option value="">{t('All classes')}</option>
          {classes.map((id) => <option key={id} value={id}>{t(CLASSES[id].name)}</option>)}
        </select>
      )}
      {heroes.length > 0 && <span className="muted small">{t('{n} of {max} heroes kept', { n: heroes.length, max: MAX_TEMPLATES })}</span>}
      <span className="spacer" />
      <button type="button" className="primary" disabled={full} title={full ? t('You keep 30 heroes already. Delete one first.') : undefined} onClick={() => setCreating(true)}>＋ {t('Create a hero')}</button>
    </div>
  );

  return (
    <div className="home-tab heroes-tab">
      {heroes.length > 0 && toolbar}
      {error && <p className="notice error" role="alert">{error}</p>}
      {loaded && heroes.length === 0 ? (
        <div className="home-empty">
          <span className="home-empty-icon" aria-hidden="true"><Icon name="character" size={40} /></span>
          <h3>{t('No heroes yet')}</h3>
          <p className="muted">{t('Make a hero once and take a fresh copy of them to any table. Playing never changes the saved hero.')}</p>
          <button type="button" className="primary" onClick={() => setCreating(true)}>＋ {t('Create your first hero')}</button>
          <p className="muted small">{t('A hero you made at a table can be kept here too: press ★ on them in the party.')}</p>
        </div>
      ) : (
        <div className={hero ? 'heroes-body with-panel' : 'heroes-body'}>
          <div className="hero-grid-wrap">
            {shown.length === 0 && heroes.length > 0 && <p className="muted">{t('No hero matches your search.')}</p>}
            <ul className="hero-grid">
              {shown.map((h) => {
                const at = where.get(h.id) ?? [];
                const top = Math.max(0, ...at.map((a) => a.level));
                return (
                  <li key={h.id}>
                    <button type="button" className={picked === h.id ? 'hero-card on' : 'hero-card'} aria-pressed={picked === h.id} onClick={() => setPicked(picked === h.id ? null : h.id)}>
                      <img className="hero-art" src={heroPortraitUrl(artOfDraft(h.spec)!)} alt="" loading="lazy" />
                      <b style={{ color: CLASS_INFO[h.spec.classId].color }}>{h.name}</b>
                      <small>{heroTitle({ className: CLASSES[h.spec.classId].name, gender: h.spec.gender, speciesId: h.spec.speciesId }, t)}</small>
                      <small className={at.length ? 'hero-where at' : 'hero-where'}>
                        {at.length === 1 ? t('Level {level} · at 1 table', { level: top }) : at.length ? t('Level {level} · at {n} tables', { level: top, n: at.length }) : t('Level 1 · not at a table')}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {hero && <HeroPanel key={hero.id} hero={hero} at={where.get(hero.id) ?? []} tables={tables} ready={ready} full={full}
            onClose={() => setPicked(null)} onEdit={() => setCreating(hero)} onCopy={() => void copy(hero)} onDelete={() => void remove(hero)} onSit={onSit} onOpen={onOpen} />}
        </div>
      )}
      {creating && <Creator initial={creating === true ? {} : creating.spec} template={creating === true ? undefined : creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

interface PanelProps {
  hero: HeroTemplate; at: HeroAt[]; tables: TableSummary[]; ready: boolean; full: boolean;
  onClose: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void;
  onSit: (tb: TableSummary) => void; onOpen: (seats: number, name?: string) => void;
}

/** One hero opened up: who they are, their numbers, where they play, and what you can do with them. */
function HeroPanel({ hero, at, tables, ready, full, onClose, onEdit, onCopy, onDelete, onSit, onOpen }: PanelProps) {
  const t = useT();
  const { lang } = useLang();
  const [playing, setPlaying] = useState(false);
  const [seats, setSeats] = useState(1);
  const [tableName, setTableName] = useState('');
  const spec = hero.spec;
  const sheet = useMemo(() => buildSheet(spec), [spec]);
  const spells = sheet ? sheet.abilityIds.filter((id) => ABILITIES[id]?.spellLevel !== undefined) : [];
  // Only a table that is still gathering its party takes a new hero.
  const gathering = tables.filter((tb) => !tb.playing && tb.players.some((p) => p.id === playerId))
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
  const take = (go: () => void) => { bringHero(hero.id); go(); };
  // Esc steps back: first out of choosing a table, then the panel closes.
  useDismiss(true, () => (playing ? setPlaying(false) : onClose()));

  return (
    <aside className="hero-panel" aria-label={hero.name}>
      <button type="button" className="hero-panel-x" onClick={onClose} aria-label={t('Close')} title={t('Close')}><Icon name="close" size={18} /></button>
      <header className="hero-panel-head">
        <img className="hero-art" src={heroPortraitUrl(artOfDraft(spec)!)} alt="" />
        <div>
          <h3 style={{ color: CLASS_INFO[spec.classId].color }}>{hero.name}</h3>
          <small>{heroTitle({ className: CLASSES[spec.classId].name, gender: spec.gender, speciesId: spec.speciesId }, t)} · {t(BACKGROUNDS[spec.backgroundId].name)}</small>
        </div>
      </header>

      {!playing ? (
        <div className="hero-panel-acts">
          <button type="button" className="primary" onClick={() => setPlaying(true)}>{t('Play at a table…')}</button>
          <span className="row">
            <button type="button" className="link" onClick={onEdit} title={t('Change the saved hero in the character creator')}>✏️ {t('Edit')}</button>
            <button type="button" className="link" onClick={onCopy} disabled={full} title={t('Keep a second hero with the same choices')}>⧉ {t('Copy')}</button>
            <button type="button" className="link danger" onClick={onDelete}>{t('Delete')}</button>
          </span>
        </div>
      ) : (
        <div className="hero-play">
          <b>{t('Take {name} to…', { name: hero.name })}</b>
          {gathering.length > 0 && (
            <ul className="hero-play-list">
              {gathering.map((tb) => {
                const here = (tb.kept ?? []).some((k) => k.templateId === hero.id);
                const partyFull = tb.heroes >= 4;
                return (
                  <li key={tb.id}>
                    <button type="button" disabled={!ready || here || partyFull} onClick={() => take(() => onSit(tb))}>
                      <span>{tb.title}</span>
                      <small className="muted">{here ? t('Already in the party') : partyFull ? t('The party is full') : t('{n} heroes', { n: tb.heroes })}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="hero-play-new">
            <span>{t('A new table')}</span>
            <input value={tableName} onChange={(e) => setTableName(e.target.value)} maxLength={40} placeholder={t('Name of the table')} aria-label={t('Name of the table')} />
            <span className="pick" role="group" aria-label={t('Players')}>
              {[1, 2, 3, 4].map((n) => <button type="button" key={n} className={seats === n ? 'on' : ''} aria-pressed={seats === n} onClick={() => setSeats(n)}>{n === 1 ? t('Solo') : `👥 ${n}`}</button>)}
            </span>
            <button type="button" className="primary" disabled={!ready} onClick={() => take(() => onOpen(seats, tableName))}>{t('Open the table')}</button>
          </div>
          <small className="muted">{t('Tables where the adventure is under way take no new heroes. The hero joins as a fresh level 1 copy.')}</small>
          <button type="button" className="link" onClick={() => setPlaying(false)}>{t('Cancel')}</button>
        </div>
      )}

      <div className="hero-panel-body">
        {spec.backstory && <p className="bio">{spec.backstory}</p>}
        {traitLines(spec.traits).length > 0 && <p className="bio muted">{traitText(spec.traits, lang)}</p>}
        {sheet && (
          <>
            <p className="hero-stats"><b>{sheet.maxHp}</b> {t('HP')} · <b>{sheet.ac}</b> {t('AC')}{sheet.maxMana > 0 && <> · <b>{sheet.maxMana}</b> {t('Mana')}</>}</p>
            <p className="abil">{ABILITY_KEYS.map((k) => <span key={k}>{t(k.toUpperCase())} <b>{sheet.abilities[k]}</b></span>)}</p>
            <p><b>{t('Skills')}:</b> {sheet.skills.map((s) => t(s)).join(', ')}</p>
            {spells.length > 0 && <p><b>{t('Spells and abilities')}:</b> {spells.map((id) => t(ABILITIES[id].name)).join(', ')}</p>}
          </>
        )}
        <h4>{t('At your tables')}</h4>
        {at.length ? (
          <ul className="hero-at">
            {at.map((a) => (
              <li key={a.table.id}>
                <span><b>{a.table.title}</b> <small className="muted">· {t('Level {n}', { n: a.level })} · {a.table.playing ? t('Adventure under way') : t('Gathering the party')}</small></span>
                <button type="button" className="link" disabled={!ready} onClick={() => onSit(a.table)}>{t('Go there')}</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">{t('{name} is not at any of your tables yet.', { name: hero.name })}</p>}
        <p className="muted small">{classLabel({ className: CLASSES[spec.classId].name, gender: spec.gender }, t)} · {t('Kept since {date}', { date: new Date(hero.savedAt).toLocaleDateString(lang) })}</p>
      </div>
    </aside>
  );
}

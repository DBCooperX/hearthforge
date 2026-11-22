// "Your adventure": every choice the host makes about the story, always on screen as a row of cards.
// Each card shows what is chosen and, in one visible line, what that means. A click opens a picker
// of cards with the full description; nothing important hides in a tooltip. Non-hosts see the same
// cards read-only, so everyone knows what they signed up for.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loc } from '../../../shared/rules';
import { CUSTOM, CUSTOM_MAX, PREMISES, SEED_MAX, SURPRISE, normalizeSeed, type StartOptions } from '../../../shared/start';
import { CHALLENGE_ROWS, FLAVOUR_INFO, RATING_INFO, RULES_INFO, TONE_INFO, type DmStyle } from '../../../shared/style';
import { LANGS, type Lang } from '../../../shared/i18n';
import type { GameState } from '../../../shared/types';
import { useLang, useT } from '../i18n';
import { playerId, type Connection } from '../net';
import { accountSession } from '../account';
import { Window } from '../ui/Window';
import { sfx } from '../ui/sound';
import { WherePicker } from './CampaignShelf';
import { copyText } from '../ui/clipboard';

type Pick = 'where' | 'begin' | 'tone' | 'challenge' | 'rating' | 'flavour' | 'language' | 'details';

interface Option { id: string; icon: string; label: string; blurb: string }

const CHALLENGE_ICONS = ['🕯️', '🌿', '⚖️', '🗡️', '💀'];

/** The cards. `world` adds where and how the story begins, which only matter before it starts. */
export function AdventureCards({ state, conn, world }: { state: GameState; conn: Connection; world: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const host = state.hostId === playerId;
  const [open, setOpen] = useState<Pick | null>(null);
  const { start, style } = state.table;
  const setStyle = (patch: Partial<DmStyle>) => conn.send({ t: 'set_style', style: patch });
  const setStart = (patch: Partial<StartOptions>) => conn.send({ t: 'set_start', start: patch });

  const where: Option[] = [
    { id: 'random', icon: '🎲', label: t('A new region'), blurb: t('Its own country, towns, people and troubles, rolled from the seed. Nobody at the table knows it yet.') },
    { id: 'classic', icon: '🔥', label: t('Classic: the Emberfall Vale'), blurb: t('The handcrafted valley around Emberfall and the Old Hearthforge. Only its wilderness changes with the seed.') },
  ];
  const begin: Option[] = [
    { id: SURPRISE, icon: '✨', label: t('Surprise us'), blurb: t('The seed picks one of the openings. You find out when the story begins.') },
    ...PREMISES.map((p) => ({ id: p.id, icon: p.icon, label: loc(p.label, lang), blurb: loc(p.blurb, lang) })),
    { id: CUSTOM, icon: '✒️', label: t('Our own idea'), blurb: t('Describe in a sentence or two how the story opens. The Dungeon Master builds the first scene around it.') },
  ];
  const tones: Option[] = TONE_INFO.map((x) => ({ id: x.id, icon: x.icon, label: loc(x.label, lang), blurb: loc(x.blurb, lang) }));
  const ratings: Option[] = RATING_INFO.map((x) => ({ id: x.id, icon: x.icon, label: loc(x.label, lang), blurb: loc(x.blurb, lang) }));
  const flavours: Option[] = FLAVOUR_INFO.map((x) => ({ id: x.id, icon: x.icon, label: loc(x.label, lang), blurb: loc(x.blurb, lang) }));
  const levels: Option[] = RULES_INFO.map((x, i) => ({ id: String(x.value), icon: CHALLENGE_ICONS[i], label: loc(x.label, lang), blurb: loc(x.blurb, lang) }));
  const languages: Option[] = LANGS.map((l) => ({ id: l.id, icon: '💬', label: l.label, blurb: t('The Dungeon Master tells the story in {lang}. Everyone picks their own interface language.', { lang: l.label }) }));

  const pick = <T extends Option>(list: T[], id: string) => list.find((o) => o.id === id) ?? list[0];
  const premise = pick(begin, start.premise);
  const book = start.campaign ?? null;
  const bookWhere: Option | null = book ? { id: 'campaign', icon: '📖', label: book.title, blurb: t('A campaign book. Its places, people and plot shape the world.') } : null;
  const bookBegin: Option = { id: 'campaign', icon: '📖', label: t('As the book begins'), blurb: t('The Dungeon Master opens the story the way the book does.') };
  const cards: { id: Pick; label: string; o: Option; line?: string; fixed?: boolean }[] = [
    ...(world ? [
      { id: 'where' as const, label: t('Where'), o: bookWhere ?? pick(where, start.region) },
      book
        ? { id: 'begin' as const, label: t('How it begins'), o: bookBegin, fixed: true }
        : { id: 'begin' as const, label: t('How it begins'), o: premise, line: start.premise === CUSTOM && start.custom ? start.custom : undefined },
    ] : []),
    { id: 'tone', label: t('Story style'), o: pick(tones, style.tone) },
    { id: 'challenge', label: t('Challenge'), o: pick(levels, String(style.rules)) },
    { id: 'rating', label: t('Content'), o: pick(ratings, style.rating) },
    { id: 'flavour', label: t('Characters'), o: pick(flavours, style.flavour) },
    ...(!world ? [{ id: 'language' as const, label: t('Story language'), o: pick(languages, state.language) }] : []),
  ];
  const close = () => setOpen(null);
  return (
    <>
      <ul className={world ? 'adv-cards six' : 'adv-cards five'}>
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" className="adv-card" onClick={() => { setOpen(c.id); sfx('open'); }} aria-haspopup="dialog">
              <span className="adv-label">{c.label}</span>
              <span className="adv-value"><span className="adv-icon" aria-hidden>{c.o.icon}</span>{c.o.label}</span>
              <span className="adv-line">{c.line ?? c.o.blurb}</span>
              <span className="adv-change">{host && !c.fixed ? t('Change') : t('Details')}</span>
            </button>
          </li>
        ))}
      </ul>
      {open === 'where' && (
        <WherePicker options={where} region={start.region} campaign={book?.id ?? null} host={host} onClose={close}
          onRegion={(id) => setStart({ region: id as StartOptions['region'], ...(book ? { campaign: null } : {}) })}
          onCampaign={(b) => setStart({ campaign: b ? { id: b.id, title: b.title } : null })} />
      )}
      {open === 'begin' && book && <Choice title={t('How it begins')} options={[bookBegin]} value="campaign" host={host} onPick={() => undefined} onClose={close} />}
      {open === 'begin' && !book && (
        <Choice title={t('How it begins')} options={begin} value={start.premise} host={host} wide onPick={(id) => setStart({ premise: id })} onClose={close} keepOpen={(id) => id === CUSTOM}>
          {start.premise === CUSTOM && <CustomPremise state={state} host={host} onSave={(custom) => setStart({ custom })} />}
        </Choice>
      )}
      {open === 'tone' && <Choice title={t('Story style')} options={tones} value={style.tone} host={host} onPick={(id) => setStyle({ tone: id as DmStyle['tone'] })} onClose={close} />}
      {open === 'rating' && <Choice title={t('Content')} options={ratings} value={style.rating} host={host} onPick={(id) => setStyle({ rating: id as DmStyle['rating'] })} onClose={close} />}
      {open === 'flavour' && <Choice title={t('Characters and clichés')} options={flavours} value={style.flavour} host={host} onPick={(id) => setStyle({ flavour: id as DmStyle['flavour'] })} onClose={close} />}
      {open === 'language' && <Choice title={t('Story language')} options={languages} value={state.language} host={host} onPick={(id) => conn.send({ t: 'set_language', lang: id as Lang })} onClose={close} />}
      {open === 'challenge' && <ChallengePicker value={style.rules} host={host} onPick={(rules) => setStyle({ rules })} onClose={close} />}
      {open === 'details' && <TableDetails state={state} conn={conn} onClose={close} />}
      {world && (
        <button type="button" className="link adv-details" onClick={() => setOpen('details')}>
          {t('Table details')}: <span className="muted">{[state.table.title, LANGS.find((l) => l.id === state.language)?.label, state.table.code ? t('invite only') : null, `${t('Seed')} ${start.seed}`].filter(Boolean).join(' · ')}</span>
        </button>
      )}
    </>
  );
}

/** Esc closes the picker on top before anything underneath hears it. */
function useEscClose(onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.confirm-overlay')) return;
      e.preventDefault(); e.stopImmediatePropagation(); onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
}

function Choice({ title, options, value, host, wide, onPick, onClose, keepOpen, children }: {
  title: string; options: Option[]; value: string; host: boolean; wide?: boolean;
  onPick: (id: string) => void; onClose: () => void; keepOpen?: (id: string) => boolean; children?: ReactNode;
}) {
  const t = useT();
  useEscClose(onClose);
  return (
    <Window title={title} size={wide ? 'medium' : 'small'} className="adv-picker" onClose={onClose} subtitle={host ? undefined : t('Set by the host')}>
      <div className={wide ? 'choice-grid wide' : 'choice-grid'} role="radiogroup" aria-label={title}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={o.id === value ? 'choice on' : 'choice'} disabled={!host && o.id !== value}
            onClick={() => { if (!host) return; onPick(o.id); sfx('tab'); if (!keepOpen?.(o.id)) onClose(); }}>
            <span className="choice-icon" aria-hidden>{o.icon}</span>
            <b>{o.label}</b>
            <span>{o.blurb}</span>
          </button>
        ))}
      </div>
      {children}
    </Window>
  );
}

function CustomPremise({ state, host, onSave }: { state: GameState; host: boolean; onSave: (text: string) => void }) {
  const t = useT();
  const [text, setText] = useState(state.table.start.custom);
  useEffect(() => setText(state.table.start.custom), [state.table.start.custom]);
  return (
    <label className="custom-premise">
      {t('Your opening')}
      <textarea value={text} maxLength={CUSTOM_MAX} rows={3} disabled={!host} autoFocus placeholder={t('For example: We are a travelling circus, and last night our bear went missing.')}
        onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== state.table.start.custom) onSave(text); }} />
    </label>
  );
}

/** Five steps and, always visible, what each changes: the chosen column is lit. */
export function ChallengePicker({ value, host, onPick, onClose }: { value: number; host: boolean; onPick: (rules: number) => void; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  useEscClose(onClose);
  const now = RULES_INFO.find((r) => r.value === value) ?? RULES_INFO[2];
  return (
    <Window title={t('Challenge')} size="medium" className="adv-picker challenge" onClose={onClose} subtitle={host ? undefined : t('Set by the host')}>
      <div className="challenge-steps" role="radiogroup" aria-label={t('Challenge')}>
        {RULES_INFO.map((r, i) => (
          <button key={r.value} type="button" role="radio" aria-checked={r.value === value} className={r.value === value ? 'step on' : 'step'} disabled={!host && r.value !== value}
            onClick={() => { if (host) { onPick(r.value); sfx('tab'); } }}>
            <span aria-hidden>{CHALLENGE_ICONS[i]}</span>{loc(r.label, lang)}
          </button>
        ))}
      </div>
      <p className="challenge-now"><b>{loc(now.label, lang)}.</b> {loc(now.blurb, lang)}</p>
      <table className="challenge-table">
        <thead>
          <tr><th>{t('What changes')}</th>{RULES_INFO.map((r) => <th key={r.value} className={r.value === value ? 'on' : ''}>{loc(r.label, lang)}</th>)}</tr>
        </thead>
        <tbody>
          {CHALLENGE_ROWS.map((row) => (
            <tr key={row.label.en}>
              <th>{loc(row.label, lang)}</th>
              {row.cells.map((c, i) => <td key={i} className={RULES_INFO[i].value === value ? 'on' : ''}>{loc(c, lang)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('The host can change this at any time, also during the adventure, from the game menu.')}</p>
    </Window>
  );
}


/** What few people change: the table's name, the story language, invite-only and the world seed. */
function TableDetails({ state, conn, onClose }: { state: GameState; conn: Connection; onClose: () => void }) {
  const t = useT();
  const host = state.hostId === playerId;
  useEscClose(onClose);
  const start = state.table.start;
  const [title, setTitle] = useState(state.table.title);
  const [seed, setSeed] = useState(start.seed);
  const [copied, setCopied] = useState(false);
  const seedField = useRef<HTMLInputElement>(null);
  useEffect(() => setSeed(start.seed), [start.seed]);
  const rename = () => { const next = title.trim(); if (next && next !== state.table.title) conn.send({ t: 'rename_table', session: accountSession(), room: state.room, title: next }); };
  return (
    <Window title={t('Table details')} size="small" className="adv-picker details" onClose={onClose} subtitle={host ? undefined : t('Set by the host')}>
      <div className="details-body">
        <label className="field">
          <span>{t('Name of the table')}</span>
          <input value={title} maxLength={40} readOnly={!host} onChange={(e) => setTitle(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>
        <div className="field">
          <span>{t('Story language')}</span>
          <span className="seg">
            {LANGS.map((l) => <button key={l.id} type="button" className={state.language === l.id ? 'on' : ''} aria-pressed={state.language === l.id} disabled={!host} onClick={() => conn.send({ t: 'set_language', lang: l.id })}>{l.label}</button>)}
          </span>
        </div>
        {state.table.maxPlayers > 1 && (
          <div className="field">
            <span>{t('Who may sit down')}</span>
            <span className="seg">
              <button type="button" className={!state.table.code ? 'on' : ''} disabled={!host} onClick={() => conn.send({ t: 'set_code', locked: false })}>{t('Anyone on this server')}</button>
              <button type="button" className={state.table.code ? 'on' : ''} disabled={!host} onClick={() => conn.send({ t: 'set_code', locked: true })}>{t('Only with an invite code')}</button>
            </span>
          </div>
        )}
        <div className="field">
          <span>{t('World seed')}</span>
          <span className="seed-row">
            <input ref={seedField} className="code" value={seed} maxLength={SEED_MAX} readOnly={!host} spellCheck={false} aria-label={t('World seed')}
              onChange={(e) => setSeed(e.target.value.toUpperCase())}
              onBlur={() => { if (normalizeSeed(seed) !== start.seed) conn.send({ t: 'set_start', start: { seed } }); else setSeed(start.seed); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            {host && <button type="button" onClick={() => conn.send({ t: 'set_start', start: { seed: '' } })}>🎲 {t('New seed')}</button>}
            <button type="button" onClick={() => { setCopied(copyText(start.seed, seedField.current)); setTimeout(() => setCopied(false), 2000); }}>{copied ? t('Copied') : t('Copy')}</button>
          </span>
          <small className="muted">{t('The same seed with the same region and opening builds the same map, places, people and quests again. Type in a seed a friend gave you, or share yours. The Dungeon Master still tells the story anew each time.')}</small>
        </div>
      </div>
    </Window>
  );
}

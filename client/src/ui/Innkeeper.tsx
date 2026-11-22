// The Innkeeper: the panel of whoever owns this server. Tables, players, art packs, settings and
// API key, updates and restarts, costs, the log and backups, so that nothing needs a terminal.
// It is reached from the list of tables and from Settings, by accounts with the Innkeeper role.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ADMIN_ERRORS, HTTPS_DNS_PROVIDERS, MODEL_SUGGESTIONS, type HttpsStatus, SETTINGS, type AdminBan, type AdminConnection, type AdminOverview, type AdminStatus, type AdminTable,
  type BackupInfo, type LogLine, type SettingDef, type SettingValue, type UpdaterStatus, type UsageReport, type UsageTotals,
} from '../../../shared/admin';
import { CLASS_INFO } from '../../../shared/content';
import { fmtAmount, type CreditConfig, type CreditReport } from '../../../shared/credits';
import { getMoney, setMoney, usd } from './money';
import type { ClassId } from '../../../shared/types';
import { useLang, useT, type Translate } from '../i18n';
import { RATING_INFO, RULES_INFO, TONE_INFO } from '../../../shared/style';
import { ArtWindow } from './ArtWindow';
import { Emblem } from './Brand';
import { Info } from './Hint';
import { DeletedTables } from './Bin';
import { Campaign } from './Campaign';
import type { BinItem } from '../../../shared/accounts';
import { Icon, type IconName } from './icons';
import { inn, innDownload, InnError } from './innkeeperApi';
import { signedOut } from '../account';
import type { AccountRow, AccountView, InviteView, LegacySeat, Role } from '../../../shared/accounts';
import { playTime } from './Profile';
import { ART_TABS, INN_MISC, INN_SECTIONS, INN_TABS, SERVER_TABS, SOUND_TABS, KEY_RESULTS, LOG_FILTERS, PHASE_LABELS, SOURCE_LABELS, UPDATER_STATES } from './labels';
import { sfx } from './sound';
import { SfxLibrary } from './SfxLibrary';
import { NarratorLibrary } from './NarratorLibrary';
import { PictureLibrary } from './PictureLibrary';
import { SoundLibrary } from './SoundLibrary';
import { TabBar, Window } from './Window';
import { ask } from './Confirm';

type Tab = keyof typeof INN_TABS;
const TAB_ICONS: Record<Tab, IconName> = { overview: 'innkeeper', tables: 'table', players: 'people', costs: 'coin', dm: 'quest', sound: 'sound', art: 'inventory', server: 'up' };

/** Where each server setting lives: next to the feature it controls. */
const DM_SECTIONS = [
  { title: INN_SECTIONS.ai, keys: ['ANTHROPIC_API_KEY', 'HEARTHFORGE_DM_MODEL_STANDARD', 'HEARTHFORGE_DM_MODEL_KEY', 'HEARTHFORGE_DM_MODEL_BACKGROUND', 'HEARTHFORGE_DM_FORCE_MODEL', 'HEARTHFORGE_DM_STORY_ON_KEY', 'HEARTHFORGE_DM_EFFORT'] },
  { title: INN_SECTIONS.newTables, keys: ['HEARTHFORGE_DM_TONE', 'HEARTHFORGE_DM_RULES', 'HEARTHFORGE_DM_RATING'] },
  { title: INN_SECTIONS.timing, keys: ['HEARTHFORGE_TURN_WAIT', 'HEARTHFORGE_UNDO_WINDOW', 'HEARTHFORGE_REACTION_WAIT'] },
];
const SOUND_SECTIONS = [
  { title: INN_SECTIONS.switches, keys: ['HEARTHFORGE_MUSIC', 'HEARTHFORGE_SFX', 'HEARTHFORGE_NARRATOR'] },
  { title: INN_SECTIONS.soundKeys, keys: ['FREESOUND_API_KEY', 'ELEVENLABS_API_KEY', 'OPENAI_API_KEY'] },
];
const ART_SECTIONS = [
  { title: INN_SECTIONS.art, keys: ['HEARTHFORGE_ART', 'HEARTHFORGE_AUTO_ASSETS', 'HEARTHFORGE_ART_UPLOADS'] },
  { title: INN_SECTIONS.pictureKeys, keys: ['GEMINI_API_KEY', 'FAL_KEY', 'REPLICATE_API_TOKEN', 'OPENAI_API_KEY'] },
];
const SERVER_SECTIONS = [{ title: INN_SECTIONS.server, keys: ['HEARTHFORGE_AUTO_UPDATE', 'HEARTHFORGE_TRUST_PROXY'] }];
type Section = { title: string; keys: string[] };

const errorText = (t: Translate, err: unknown) => {
  const code = err instanceof InnError ? err.code : 'failed';
  if (code === 'offline') return t('The server is not answering. It may be restarting.');
  return t(ADMIN_ERRORS[code as keyof typeof ADMIN_ERRORS] ?? ADMIN_ERRORS.failed);
};

const newVersion = (n: number, t: Translate) => (n === 1 ? t('A new version is available (1 change).') : t('A new version is available ({n} changes).', { n }));

function span(t: Translate, ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t('{n} s', { n: s });
  if (s < 3600) return t('{n} min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{h} h {m} min', { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  return t('{d} d {h} h', { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600) });
}
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
/** Costs are kept in dollars; they are shown in the one global currency at its fixed rate. */
const money = (c: number | null) => (c === null ? '?' : c > 0 && c * getMoney().rate < 0.01 ? `< ${fmtAmount(0.01, getMoney().currency)}` : usd(c));

/** Ask the server again every few seconds while the section is on screen. */
function usePoll<T>(path: string, ms: number, onError: (err: unknown) => void): [T | null, (next?: T) => void] {
  const [data, setData] = useState<T | null>(null);
  const load = useCallback((next?: T) => {
    const take = (d: T) => {
      const x = d as { money?: { currency: string; rate: number }; config?: { currency?: string; rate?: number } } | null;
      setMoney(x?.money ?? (x?.config?.currency ? { currency: x.config.currency, rate: x.config.rate ?? 1 } : undefined));
      setData(d);
    };
    if (next !== undefined) return take(next);
    inn<T>(path).then(take).catch(onError);
  }, [path, onError]);
  useEffect(() => {
    load();
    const timer = setInterval(() => load(), ms);
    return () => clearInterval(timer);
  }, [load, ms]);
  return [data, load];
}

interface PaneProps {
  /** Shows what went wrong, and signs out when the session has ended. */
  fail: (err: unknown) => void;
  say: (text: string) => void;
}

function Note({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  return <div className={`inn-note is-${kind}`}>{children}</div>;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="inn-stat"><small>{label}</small><b>{value}</b>{sub && <span>{sub}</span>}</div>;
}

// ---------------------------------------------------------------------------- overview

function Overview({ fail, say, go, firstPassword }: PaneProps & { go: (tab: Tab) => void; firstPassword: boolean }) {
  const t = useT();
  const [o] = usePoll<AdminOverview>('/overview', 5000, fail);
  const [text, setText] = useState('');
  if (!o) return <p className="muted">{t('Loading…')}</p>;
  const announce = async (e: FormEvent) => {
    e.preventDefault();
    try { await inn('/notice', { body: { text } }); setText(''); say(t('Sent to everyone who is connected.')); } catch (err) { fail(err); }
  };
  const models = o.dm.forced ? o.dm.forced : [o.dm.background, o.dm.standard, o.dm.key].filter(Boolean).join(' · ');
  return (
    <div className="inn-stack">
      {firstPassword && <Note kind="warn"><span>{t('You are still using the first password. Choose your own.')}</span><button type="button" onClick={() => go('server')}>{t('Change password')}</button></Note>}
      {o.restartPending && <Note kind="warn"><span>{t('Settings were changed. They apply after a restart.')}</span><button type="button" onClick={() => go('server')}>{t('To the restart')}</button></Note>}
      {o.updater.connected && o.updater.behind > 0 && <Note kind="good"><span>{newVersion(o.updater.behind, t)}</span><button type="button" onClick={() => go('server')}>{t('Show')}</button></Note>}
      {o.dm.mode === 'scripted' && <Note><span>{t('No API key is in use, so the scripted Dungeon Master runs the tables.')}</span><button type="button" onClick={() => go('dm')}>{t('Add a key')}</button></Note>}
      <div className="inn-stats">
        <Stat label={t('Tables')} value={o.tables} sub={t('{n} with players', { n: o.playing })} />
        <Stat label={t('Connections')} value={o.connections} />
        <Stat label={t('Running for')} value={span(t, o.now - o.startedAt)} sub={`v${o.version}${o.updater.commit ? ` · ${o.updater.commit}` : ''}`} />
        <Stat label={t('AI costs today')} value={money(o.usageToday.cost)} sub={t('{n} calls', { n: o.usageToday.calls })} />
        <Stat label={t('AI costs this month')} value={money(o.usageMonth.cost)} sub={t('{n} calls', { n: o.usageMonth.calls })} />
        <Stat label={t('Memory')} value={`${o.memoryMb} MB`} sub={`Node ${o.node}`} />
      </div>
      <section>
        <h3>{t('Dungeon Master')}</h3>
        <p>{o.dm.mode === 'claude' ? t('Claude, with these models: {models}', { models }) : t('Scripted (no API key)')}</p>
        {o.dm.mode === 'claude' && o.dm.storyOnKey && !o.dm.forced && <p>{t('Every story turn: {model}', { model: o.dm.key ?? '' })}</p>}
      </section>
      <section>
        <h3>{t('Announcement')}</h3>
        <form className="inn-row" onSubmit={announce}>
          <input value={text} maxLength={300} placeholder={t('For example: we stop in ten minutes')} onChange={(e) => setText(e.target.value)} />
          <button type="submit" disabled={!text.trim()}>{t('Send to everyone')}</button>
        </form>
        <p className="muted small">{t('Shows for a few seconds on the screen of everyone who is connected.')}</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------- assets

/** A section with its own row of tabs, filling the pane: sound, art and the server. */
function SubTabs<K extends string>({ tabs, children, value, onChange }: { tabs: Record<K, string>; children: (tab: K) => ReactNode; value?: K; onChange?: (tab: K) => void }) {
  const t = useT();
  const ids = Object.keys(tabs) as K[];
  const [own, setOwn] = useState<K>(ids[0]);
  const sub = value ?? own;
  const setSub = (k: K) => { setOwn(k); onChange?.(k); };
  return (
    <div className="assets-pane">
      <TabBar tabs={ids.map((id) => ({ id, label: t(tabs[id]) }))} value={sub} onChange={setSub} />
      <div className="assets-body">{children(sub)}</div>
    </div>
  );
}

function SoundPane(pane: PaneProps & { go: (tab: Tab) => void }) {
  return (
    <SubTabs tabs={SOUND_TABS}>
      {(sub) => sub === 'effects' ? <SfxLibrary /> : sub === 'narrator' ? <NarratorLibrary /> : sub === 'settings' ? <div className="inn-sub"><SettingsBlock {...pane} sections={SOUND_SECTIONS} /></div> : <SoundLibrary key={sub} layer={sub} />}
    </SubTabs>
  );
}

function ArtPane(pane: PaneProps & { go: (tab: Tab) => void }) {
  const [sub, setSub] = useState<keyof typeof ART_TABS>('art');
  return (
    <SubTabs tabs={ART_TABS} value={sub} onChange={setSub}>
      {(tab) => tab === 'art' ? <ArtWindow embedded /> : tab === 'pictures' ? <PictureLibrary onKeys={() => setSub('settings')} /> : <div className="inn-sub"><SettingsBlock {...pane} sections={ART_SECTIONS} /></div>}
    </SubTabs>
  );
}

function ServerTabs(pane: PaneProps & { go: (tab: Tab) => void; firstPassword: boolean; onPassword: () => void }) {
  return (
    <SubTabs tabs={SERVER_TABS}>
      {(sub) => sub === 'logs' ? <div className="inn-sub fill"><LogsPane {...pane} /></div> : sub === 'backups' ? <div className="inn-sub"><BackupsPane {...pane} /></div> : (
        <div className="inn-sub inn-stack">
          <ServerPane {...pane} />
          <SettingsBlock {...pane} sections={SERVER_SECTIONS} />
        </div>
      )}
    </SubTabs>
  );
}

// ---------------------------------------------------------------------------- tables

function Tables({ fail, say }: PaneProps) {
  const t = useT();
  const { lang } = useLang();
  const [data, set] = usePoll<{ tables: AdminTable[] }>('/tables', 5000, fail);
  const [story, setStory] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>) => {
    try { set(await inn<{ tables: AdminTable[] }>('/tables', { body })); sfx('tab'); } catch (err) { fail(err); }
  };
  const loadBin = useCallback(() => inn<{ tables: BinItem[] }>('/bin').then((r) => r.tables), []);
  const actBin = useCallback((what: 'restore' | 'purge', id: number) => inn<{ tables: BinItem[] }>('/bin', { body: { do: what, id } }).then((r) => r.tables), []);
  if (!data) return <p className="muted">{t('Loading…')}</p>;
  if (story) return <Campaign id={story} onBack={() => setStory(null)} onError={fail} />;
  const bin = <DeletedTables everyone always load={loadBin} act={actBin} onError={fail} watch={data.tables.length} />;
  if (!data.tables.length) return <><p className="muted">{t('No table has been opened yet.')}</p>{bin}</>;
  return (
    <>
    <ul className="inn-cards">
      {data.tables.map((tb) => (
        <li key={tb.id} className={tb.players.some((p) => p.connected) ? 'inn-card live' : 'inn-card'}>
          <header>
            <b>{tb.title}</b>
            <span className="inn-tag">{t(PHASE_LABELS[tb.phase] ?? tb.phase)}</span>
            {tb.paused && <span className="inn-tag is-warn">{t('Paused')}</span>}
            {tb.testMode && <span className="inn-tag is-warn" title={t('The host has the test toolbox. Nothing counts until you keep it.')}>{t('Test mode')}</span>}
            {tb.code && <span className="inn-tag" title={t('Invite code')}>{tb.code}</span>}
            <span className="spacer" />
            <button type="button" onClick={() => void act({ table: tb.id, do: tb.paused ? 'resume' : 'pause' })}>{tb.paused ? t('Resume') : t('Pause')}</button>
            {tb.testMode ? (
              <>
                <button type="button" title={t('End test mode and keep what the tests changed.')} onClick={() => { void ask(t('End test mode at "{title}" and keep everything the tests changed?', { title: tb.title })).then((yes) => { if (yes) void act({ table: tb.id, do: 'test_keep' }); }); }}>{t('Keep changes')}</button>
                <button type="button" title={t('End test mode and put the story back to how it was before.')} onClick={() => { void ask(t('End test mode at "{title}" and undo everything the tests changed? The story goes back to how it was when test mode began.', { title: tb.title }), { danger: true }).then((yes) => { if (yes) void act({ table: tb.id, do: 'test_discard' }); }); }}>{t('Undo changes')}</button>
              </>
            ) : (
              <button type="button" title={t('Give the host a toolbox to start fights, level up, jump to places and more. The story can go back to how it was afterwards.')} onClick={() => { void ask(t('Switch test mode on at "{title}"? The table is saved as it is now, and the host gets a toolbox. When you end test mode you can keep the changes or go back.', { title: tb.title })).then((yes) => { if (yes) void act({ table: tb.id, do: 'test_on' }); }); }}>{t('Test mode')}</button>
            )}
            <button type="button" title={t('See the story of this table: quests, clues, people, places and what the Dungeon Master holds back.')} onClick={() => setStory(tb.id)}>{t('Story')}</button>
            <button type="button" onClick={() => innDownload(`/table?id=${encodeURIComponent(tb.id)}`).catch(fail)}>{t('Download')}</button>
            <button type="button" className="link danger" onClick={() => { void ask(t('Delete the table "{title}"? Its story and heroes wait in the list of deleted tables, so you can bring it back.', { title: tb.title }), { danger: true }).then((yes) => { if (yes) void act({ table: tb.id, do: 'delete' }).then(() => say(t('The table was deleted.'))); }); }}>{t('Delete')}</button>
          </header>
          <dl>
            <div><dt>{t('Players')}</dt><dd>
              {tb.players.length === 0 && <span className="muted">{t('Nobody')}</span>}
              {tb.players.map((p) => (
                <span key={p.id} className={p.connected ? 'inn-who here' : 'inn-who'} title={p.connected ? t('At the table') : t('Away')}>
                  {p.name}{p.id === tb.hostId && <i>{t('host')}</i>}
                  <button type="button" className="inn-x" title={t('Send away from the table')} aria-label={t('Send away from the table')} onClick={() => { void ask(t('Send {name} away from this table?', { name: p.name }), { danger: true }).then((yes) => { if (yes) void act({ table: tb.id, do: 'remove', playerId: p.id }); }); }}>×</button>
                </span>
              ))}
              <span className="muted small">{t('{n} of {m} seats', { n: tb.players.length, m: tb.maxPlayers })}</span>
            </dd></div>
            {tb.heroes.length > 0 && <div><dt>{t('Heroes')}</dt><dd>{tb.heroes.map((h) => `${h.name} (${t(CLASS_INFO[h.classId as ClassId]?.name ?? h.classId)} ${h.level})`).join(', ')}</dd></div>}
            {tb.region && <div><dt>{t('Region')}</dt><dd>{tb.region}{tb.day > 0 && ` · ${t('Day')} ${tb.day}`} · {t('Seed')} {tb.seed}</dd></div>}
            <div><dt>{t('Saved')}</dt><dd>{tb.savedAt ? new Date(tb.savedAt).toLocaleString(lang) : '–'} · {tb.sizeKb} kB · {t('Story language')}: {tb.language.toUpperCase()}</dd></div>
            {tb.usage.calls > 0 && <div><dt>{t('AI costs')}</dt><dd>{money(tb.usage.cost)} · {t('{n} calls', { n: tb.usage.calls })}</dd></div>}
          </dl>
        </li>
      ))}
    </ul>
    {bin}
    </>
  );
}

// ---------------------------------------------------------------------------- players

interface AccountData { accounts: AccountRow[]; invites: InviteView[]; legacy: LegacySeat[]; password?: string; account?: AccountView; invite?: InviteView }

const inviteUrl = (code: string) => `${location.origin}${location.pathname}?invite=${encodeURIComponent(code)}`;

function copy(text: string, say: (s: string) => void, t: Translate) {
  void navigator.clipboard?.writeText(text).then(() => say(t('Copied.')), () => {});
}

/** Accounts, invite links, and the seats from before accounts that still need an owner. */
function AccountsPane({ fail, say, me }: PaneProps & { me: string }) {
  const t = useT();
  const { lang } = useLang();
  const [data, set] = usePoll<AccountData>('/accounts', 10000, fail);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('player');
  /** A password or link the server made up, shown once. */
  const [shown, setShown] = useState<{ kind: 'password' | 'invite'; who: string; value: string } | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const act = async (body: Record<string, unknown>) => {
    try { const next = await inn<AccountData>('/accounts', { body }); set(next); return next; } catch (err) { fail(err); return null; }
  };
  if (!data) return <p className="muted">{t('Loading…')}</p>;
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const out = await act({ do: 'create', username: name, role });
    if (out?.password && out.account) { setShown({ kind: 'password', who: out.account.username, value: out.password }); setName(''); }
  };
  const invite = async (r: Role) => {
    const out = await act({ do: 'invite', role: r });
    if (out?.invite) setShown({ kind: 'invite', who: '', value: inviteUrl(out.invite.code) });
  };
  return (
    <div className="inn-stack inn-accounts">
      <section>
        <h3>{t('Accounts')}</h3>
        {shown && (
          <div className="inn-note is-good">
            <span>{shown.kind === 'password'
              ? t('The password for {name}. Give it to them; it is shown only now. They choose their own after signing in.', { name: shown.who })
              : t('The invite link. It works once, for 7 days.')}</span>
            <span className="inn-secret"><code>{shown.value}</code><button type="button" onClick={() => copy(shown.value, say, t)}>{t('Copy')}</button><button type="button" className="link" onClick={() => setShown(null)}>{t('Done')}</button></span>
          </div>
        )}
        <table className="inn-table">
          <thead><tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Last seen')}</th><th className="num">{t('Heroes')}</th><th className="num">{t('Play time')}</th><th /></tr></thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={a.id}>
                <td><b>{a.username}</b>{a.id === me && <i className="inn-host">{t('you')}</i>}{!a.hasPassword && <span className="muted small"> · {t('needs a new password')}</span>}</td>
                <td>
                  <select value={a.role} disabled={a.id === me} onChange={(e) => void act({ do: 'role', id: a.id, role: e.target.value }).then((ok) => ok && say(t('The role was changed.')))}>
                    <option value="player">{t('Player')}</option>
                    <option value="innkeeper">{t('Innkeeper')}</option>
                  </select>
                </td>
                <td>{a.lastSeen ? new Date(a.lastSeen).toLocaleDateString(lang) : <span className="muted">{t('Never')}</span>}</td>
                <td className="num">{a.heroes}</td>
                <td className="num">{playTime(t, a.stats.playMs)}</td>
                <td className="inn-actions">
                  <button type="button" onClick={() => { const next = window.prompt(t('New name for {name}:', { name: a.username }), a.username); if (next && next.trim() !== a.username) void act({ do: 'rename', id: a.id, username: next }).then((ok) => ok && say(t('The name was changed.'))); }}>{t('Rename')}</button>
                  {a.id !== me && <>
                    <button type="button" onClick={() => { void ask(t('Clear the stats of {name}? Their numbers and hero list start again from zero.', { name: a.username })).then((yes) => { if (yes) void act({ do: 'stats', id: a.id, what: 'all' }).then((ok) => ok && say(t('The stats were cleared.'))); }); }}>{t('Clear')}</button>
                    <button type="button" onClick={() => { void ask(t('Give {name} a new password? They are signed out everywhere.', { name: a.username })).then((yes) => { if (yes) void act({ do: 'reset', id: a.id }).then((out) => out?.password && setShown({ kind: 'password', who: a.username, value: out.password })); }); }}>{t('New password')}</button>
                    <button type="button" className="link danger" onClick={() => { void ask(t('Delete the account {name}? Their heroes stay at the tables, but nobody can sign in as them any more.', { name: a.username }), { danger: true }).then((yes) => { if (yes) void act({ do: 'delete', id: a.id }).then((ok) => ok && say(t('The account was deleted.'))); }); }}>{t('Delete')}</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form className="inn-new-account" onSubmit={create}>
          <label>{t('New account')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={t('Name')} /></label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label={t('Role')}>
            <option value="player">{t('Player')}</option>
            <option value="innkeeper">{t('Innkeeper')}</option>
          </select>
          <button type="submit" disabled={name.trim().length < 3}>{t('Create')}</button>
          <span className="spacer" />
          <button type="button" onClick={() => void invite('player')}>{t('Invite link for a player')}</button>
        </form>
        <p className="muted small">{t('Make the account yourself and pass on the password, or send an invite link and they choose name and password. An innkeeper may open this panel.')}</p>
      </section>
      {data.invites.length > 0 && (
        <section>
          <h3>{t('Open invite links')}</h3>
          <ul className="inn-list">
            {data.invites.map((i) => (
              <li key={i.code}>
                <span>{i.role === 'innkeeper' ? t('Innkeeper') : t('Player')}</span>
                <span className="muted">{t('until {when}', { when: new Date(i.expiresAt).toLocaleDateString(lang) })}</span>
                <span className="spacer" />
                <button type="button" onClick={() => copy(inviteUrl(i.code), say, t)}>{t('Copy link')}</button>
                <button type="button" className="link danger" onClick={() => void act({ do: 'revoke', code: i.code })}>{t('Withdraw')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.legacy.length > 0 && (
        <section>
          <h3>{t('Seats from before accounts')}</h3>
          <p className="muted small">{t('These seats were taken in a browser, before there were accounts. They move to an account by themselves when that player signs in from the same browser. Or hand one to an account here.')}</p>
          <table className="inn-table">
            <thead><tr><th>{t('Name at the table')}</th><th>{t('Table')}</th><th>{t('Heroes')}</th><th /></tr></thead>
            <tbody>
              {data.legacy.map((l) => {
                const k = `${l.table}/${l.playerId}`;
                const pick = assign[k] ?? data.accounts.find((a) => a.username.toLocaleLowerCase() === l.name.toLocaleLowerCase())?.id ?? '';
                return (
                  <tr key={k}>
                    <td>{l.name}</td><td>{l.tableTitle}</td><td>{l.heroes.join(', ') || <span className="muted">{t('none')}</span>}</td>
                    <td className="inn-actions">
                      <select value={pick} onChange={(e) => setAssign({ ...assign, [k]: e.target.value })} aria-label={t('Account')}>
                        <option value="">{t('Choose an account')}</option>
                        {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
                      </select>
                      <button type="button" disabled={!pick} onClick={() => void act({ do: 'assign', table: l.table, playerId: l.playerId, id: pick }).then((ok) => ok && say(t('The seat now belongs to the account.')))}>{t('Hand over')}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function PlayersPane({ fail, say }: PaneProps) {
  const t = useT();
  const [data, set] = usePoll<{ connections: AdminConnection[]; bans: AdminBan[] }>('/players', 4000, fail);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const act = async (body: Record<string, unknown>) => {
    try { set(await inn('/players', { body })); } catch (err) { fail(err); }
  };
  if (!data) return <p className="muted">{t('Loading…')}</p>;
  const browser = (agent: string) => (/Firefox\/\d+/.exec(agent) ?? /Edg\/\d+/.exec(agent) ?? /Chrome\/\d+/.exec(agent) ?? /Version\/\d+.*Safari/.exec(agent))?.[0].replace('Version/', 'Safari ').replace(/\s?Safari$/, '').replace('Edg/', 'Edge ').replace('/', ' ') ?? '';
  const system = (agent: string) => (/Windows|Android|iPhone|iPad|Mac OS X|Linux/.exec(agent)?.[0] ?? '').replace('Mac OS X', 'macOS');
  return (
    <div className="inn-stack">
      <h3>{t('Who is connected')}</h3>
      {data.connections.length === 0 ? <p className="muted">{t('Nobody is connected.')}</p> : (
        <table className="inn-table">
          <thead><tr><th>{t('Account')}</th><th>{t('Table')}</th><th>{t('Address')}</th><th>{t('Connected for')}</th><th>{t('Browser')}</th><th /></tr></thead>
          <tbody>
            {data.connections.map((c) => (
              <tr key={c.id}>
                <td>{c.account || c.name || <span className="muted">{t('Not signed in yet')}</span>}{c.host && <i className="inn-host">{t('host')}</i>}</td>
                <td>{c.tableTitle || <span className="muted">{t('List of tables')}</span>}</td>
                <td className="mono">{c.ip}</td>
                <td>{span(t, now - c.since)}</td>
                <td title={c.agent}>{[browser(c.agent), system(c.agent)].filter(Boolean).join(', ')}</td>
                <td className="inn-actions">
                  <button type="button" onClick={() => void act({ do: 'disconnect', id: c.id })}>{t('Disconnect')}</button>
                  <button type="button" className="link danger" onClick={() => { void ask(t('Ban the address {ip}? Nobody can connect from it until you lift the ban.', { ip: c.ip }), { danger: true }).then((yes) => { if (yes) void act({ do: 'ban', ip: c.ip, note: c.name }).then(() => say(t('The address was banned.'))); }); }}>{t('Ban address')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">{t('Banning works by address, so it also stops everyone else behind the same router. Your own address cannot be banned. To keep one person out, delete their account instead.')}</p>
      {data.bans.length > 0 && (
        <section>
          <h3>{t('Banned addresses')}</h3>
          <ul className="inn-list">
            {data.bans.map((b) => <li key={b.ip}><span className="mono">{b.ip}</span><span className="muted">{b.note}</span><span className="spacer" /><button type="button" onClick={() => void act({ do: 'unban', ip: b.ip })}>{t('Lift the ban')}</button></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- settings

/** Names for the values of choice settings, so the select shows "Heroic" and not "heroic". */
const CHOICE_NAMES: Record<string, Record<string, { en: string; de: string }>> = {
  HEARTHFORGE_DM_TONE: Object.fromEntries(TONE_INFO.map((x) => [x.id, x.label])),
  HEARTHFORGE_DM_RATING: Object.fromEntries(RATING_INFO.map((x) => [x.id, x.label])),
  HEARTHFORGE_DM_RULES: Object.fromEntries(RULES_INFO.map((x) => [String(x.value), { en: `${x.value} · ${x.label.en}`, de: `${x.value} · ${x.label.de}` }])),
  HEARTHFORGE_DM_EFFORT: {
    low: { en: 'Low', de: 'Niedrig' }, medium: { en: 'Medium', de: 'Mittel' }, high: { en: 'High', de: 'Hoch' },
    xhigh: { en: 'Very high', de: 'Sehr hoch' }, max: { en: 'Maximum', de: 'Maximum' },
  },
  HEARTHFORGE_ART: {
    generated: { en: 'Hearthforge pixel art (built in)', de: 'Hearthforge-Pixelgrafik (eingebaut)' },
    kenney: { en: 'Tiny Dungeon (Kenney)', de: 'Tiny Dungeon (Kenney)' }, '0x72': { en: 'DungeonTileset II (0x72)', de: 'DungeonTileset II (0x72)' },
  },
};

interface KeyResult { ok: boolean; reason?: keyof typeof KEY_RESULTS; detail?: string; missing?: string[] }

function SettingRow({ def, value, draft, onDraft, onReset }: { def: SettingDef; value: SettingValue; draft: string | undefined; onDraft: (v: string | undefined) => void; onReset: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const current = draft ?? (def.kind === 'secret' ? '' : value.value);
  const names = CHOICE_NAMES[def.key];
  let control: ReactNode;
  if (def.kind === 'choice' && def.choices!.join() === 'on,off' || def.choices?.join() === 'off,on') {
    const on = current === 'on';
    control = <button type="button" role="switch" aria-checked={on} className={on ? 'switch on' : 'switch'} onClick={() => { onDraft(on ? 'off' : 'on'); sfx('tab'); }}>{on ? t('On') : t('Off')}</button>;
  } else if (def.kind === 'choice' || (def.kind === 'number' && names)) {
    const choices = def.choices ?? Object.keys(names!);
    control = <select value={current} onChange={(e) => onDraft(e.target.value)}>{choices.map((c) => <option key={c} value={c}>{names?.[c]?.[lang] ?? c}</option>)}</select>;
  } else if (def.kind === 'number') {
    control = <input type="number" min={def.min} max={def.max} value={current} onChange={(e) => onDraft(e.target.value)} />;
  } else if (def.kind === 'secret') {
    control = <input type="password" autoComplete="off" value={current} placeholder={value.set ? value.value : t('Not set')} onChange={(e) => onDraft(e.target.value || undefined)} />;
  } else {
    control = <input type="text" list={def.kind === 'model' ? 'inn-models' : undefined} value={current} placeholder={def.fallback || t(INN_MISC.empty)} spellCheck={false} onChange={(e) => onDraft(e.target.value)} />;
  }
  return (
    <div className={draft !== undefined ? 'inn-setting changed' : 'inn-setting'}>
      <span className="inn-setting-text">
        <span>{t(def.label)} <Info text={t(def.help)} /></span>
        <small className="inn-source">
          {t(SOURCE_LABELS[value.source])}{value.pending && ` · ${t('applies after a restart')}`}{def.live && value.set && ` · ${t('in use')}`}
          {value.source === 'panel' && <button type="button" className="link" onClick={onReset}>{t('Reset')}</button>}
        </small>
      </span>
      <span className="inn-setting-control">{control}</span>
    </div>
  );
}

function SettingsBlock({ fail, say, go, sections }: PaneProps & { go: (tab: Tab) => void; sections: Section[] }) {
  const t = useT();
  const [data, setData] = useState<{ settings: SettingValue[]; restartPending: boolean } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [test, setTest] = useState<KeyResult | 'busy' | null>(null);
  useEffect(() => { inn<typeof data>('/env').then(setData).catch(fail); }, [fail]);
  if (!data) return <p className="muted">{t('Loading…')}</p>;
  const dirty = Object.keys(draft).length > 0;
  const save = async (values: Record<string, string | null>) => {
    try {
      setData(await inn('/env', { body: { values } }));
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !(k in values))));
      const live = Object.keys(values).every((k) => SETTINGS.find((d) => d.key === k)?.live);
      say(live ? t('Saved. It is used at once.') : t('Saved. The change applies after a restart.'));
    } catch (err) { fail(err); }
  };
  const runTest = async () => {
    setTest('busy');
    try { setTest(await inn<KeyResult>('/env/test', { body: { key: draft.ANTHROPIC_API_KEY } })); } catch (err) { setTest(null); fail(err); }
  };
  return (
    <div className="inn-stack inn-settings">
      {data.restartPending && <Note kind="warn"><span>{t('Settings were changed. They apply after a restart.')}</span><button type="button" onClick={() => go('server')}>{t('To the restart')}</button></Note>}
      <datalist id="inn-models">{MODEL_SUGGESTIONS.map((m) => <option key={m} value={m} />)}</datalist>
      {sections.map((sec) => (
        <section key={sec.title}>
          <h3>{t(sec.title)}</h3>
          {sec.keys.map((k) => SETTINGS.find((d) => d.key === k)).filter((d): d is SettingDef => !!d).map((def) => {
            const value = data.settings.find((v) => v.key === def.key);
            if (!value) return null;
            return (
              <div key={def.key}>
                <SettingRow def={def} value={value} draft={draft[def.key]}
                  onDraft={(v) => setDraft((d) => { const next = { ...d }; if (v === undefined || (def.kind !== 'secret' && v === value.value)) delete next[def.key]; else next[def.key] = v; return next; })}
                  onReset={() => void save({ [def.key]: null })} />
                {def.key === 'ANTHROPIC_API_KEY' && (
                  <div className="inn-keytest">
                    <button type="button" disabled={test === 'busy'} onClick={() => void runTest()}>{test === 'busy' ? t('Checking…') : t('Test the key')}</button>
                    {test && test !== 'busy' && (
                      <span className={test.ok && !test.missing?.length ? 'is-good' : 'is-bad'}>
                        {t(KEY_RESULTS[test.ok ? 'ok' : test.reason ?? 'error'])}
                        {test.detail && ` ${test.detail}`}
                        {!!test.missing?.length && ` ${t('But it cannot use: {models}', { models: test.missing.join(', ') })}`}
                      </span>
                    )}
                    {value.set && <button type="button" className="link danger" onClick={() => { void ask(t('Remove the API key? The tables then get the scripted Dungeon Master.'), { danger: true }).then((yes) => { if (yes) void save({ ANTHROPIC_API_KEY: '' }); }); }}>{t('Remove the key')}</button>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <div className="inn-savebar">
        <button type="button" className="primary" disabled={!dirty} onClick={() => void save(draft)}>{t('Save')}</button>
        {dirty && <button type="button" onClick={() => setDraft({})}>{t('Discard')}</button>}
        <Info text={t('The key is stored on the server, in its data folder, readable only by the server. It is never sent back to a browser in full. The port and the data folder are set where the container is started and cannot be changed here.')} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- server and updates

function Commits({ list }: { list: UpdaterStatus['incoming'] }) {
  const { lang } = useLang();
  return (
    <ul className="inn-commits">
      {list.map((c) => <li key={c.commit}><span className="mono">{c.commit}</span><span>{c.subject}</span><small>{c.date ? new Date(c.date).toLocaleDateString(lang) : ''}</small></li>)}
    </ul>
  );
}

// ---------------------------------------------------------------------------- https

/** HTTPS through Caddy, which browsers need before they allow the microphone. The updater writes it into .env and restarts Caddy. */
function HttpsSection({ fail, say }: PaneProps) {
  const t = useT();
  const [h, reload] = usePoll<HttpsStatus>('/https', 4000, fail);
  const [form, setForm] = useState<{ domain: string; local: string; email: string; dnsProvider: string; dnsToken: string } | null>(null);
  const [lan, setLan] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!h || form) return;
    const here = window.location.hostname;
    const looksLocal = /^(\d{1,3}\.){3}\d{1,3}$/.test(here) || here.endsWith('.lan') || here.endsWith('.local') || here.endsWith('.home');
    setForm({ domain: h.domain, local: h.local || (looksLocal ? here : ''), email: h.email, dnsProvider: h.dnsProvider, dnsToken: '' });
    setLan(!!h.dnsProvider);
  }, [h, form]);
  if (!h || !form) return null;
  const working = sending || h.state === 'working';
  const send = async (mode: 'on' | 'off') => {
    setSending(true);
    try {
      const body: Record<string, string> = { mode, domain: form.domain, local: form.local, email: form.email, dnsProvider: lan ? form.dnsProvider : '' };
      if (!lan) body.dnsToken = '';
      else if (form.dnsToken) body.dnsToken = form.dnsToken;
      reload(await inn<HttpsStatus>('/https', { body }));
      setForm({ ...form, dnsToken: '' });
      say(mode === 'on' ? t('Caddy is being started. This takes a minute, longer the first time.') : t('HTTPS is being switched off.'));
    } catch (err) { fail(err); } finally { setSending(false); }
  };
  const first = form.local.split(',')[0]?.trim();
  const caddy = h.caddy === 'running' ? t('Caddy is running.') : h.caddy === 'none' ? t('Caddy is not running.') : t('Caddy: {state}', { state: h.caddy });
  return (
    <section>
      <h3>{t('HTTPS')}</h3>
      <p className="muted small">{t('Browsers only allow the microphone (voice input) on https, and it keeps passwords off the network. Caddy, a small web server next to the game, takes care of the certificates.')}</p>
      {!h.connected || !h.known ? (
        <Note kind="warn"><span>{t('HTTPS is set up by the updater, which is not running or is too old. Run the installer once more, or set it in .env (see "HTTPS" in the README).')}</span></Note>
      ) : (
        <>
          <p className={h.state === 'failed' ? 'inn-state is-bad' : working ? 'inn-state is-busy' : 'inn-state'}>
            {h.on ? t('HTTPS is on.') : t('HTTPS is off.')} {h.on && caddy}
            {h.message && <span className="muted"> · {h.message}</span>}
          </p>
          {h.on && (h.domain || h.local) && (
            <p className="small">
              {h.domain && <a href={`https://${h.domain}`} target="_blank" rel="noreferrer">https://{h.domain}</a>}
              {h.domain && h.local && ' · '}
              {h.local && h.local.split(',').map((x, i) => <span key={x}>{i > 0 && ' · '}<a href={`https://${x}`} target="_blank" rel="noreferrer">https://{x}</a></span>)}
            </p>
          )}
          <form className="https-form" onSubmit={(e) => { e.preventDefault(); void send('on'); }}>
            <label><span>{t('Domain')} <Info text={t('A name that points at this server, such as dnd.example.ch. Caddy gets a free certificate from Let\'s Encrypt and renews it by itself. Leave empty to use only the local addresses below.')} /></span>
              <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="dnd.example.ch" spellCheck={false} />
            </label>
            {form.domain && (
              <label className="inn-check"><input type="checkbox" checked={lan} onChange={(e) => setLan(e.target.checked)} />{t('This domain is only known inside my network (no ports forwarded)')}</label>
            )}
            {form.domain && !lan && <p className="muted small">{t('Ports 80 and 443 must reach this server from the internet, so Let\'s Encrypt can check the domain.')}</p>}
            {form.domain && lan && (
              <>
                <label><span>{t('DNS provider')} <Info text={t('Let\'s Encrypt then checks a DNS record instead of a website. Caddy is built once with your provider\'s plugin, which takes a few minutes.')} /></span>
                  <select value={form.dnsProvider} onChange={(e) => setForm({ ...form, dnsProvider: e.target.value })}>
                    <option value="">{t('Choose…')}</option>
                    {HTTPS_DNS_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label><span>{t('DNS API token')}</span>
                  <input type="password" autoComplete="off" value={form.dnsToken} onChange={(e) => setForm({ ...form, dnsToken: e.target.value })} placeholder={h.dnsToken ? t('Set. Leave empty to keep it.') : t('A token that may edit DNS records')} spellCheck={false} />
                </label>
              </>
            )}
            <label><span>{t('Local addresses')} <Info text={t('Addresses in your network, such as this server\'s IP, separated by commas. They get a certificate from Caddy\'s own authority, which each device has to trust once.')} /></span>
              <input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} placeholder="192.168.1.50" spellCheck={false} />
            </label>
            {form.domain && !lan && (
              <label><span>{t('Email for Let\'s Encrypt (optional)')}</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} spellCheck={false} />
              </label>
            )}
            {first && <p className="muted small">{t('Each device trusts the local certificate once. Download it here and install it (on phones as a CA certificate):')} <a href={`http://${first}/hearthforge-ca.crt`}>http://{first}/hearthforge-ca.crt</a></p>}
            <div className="inn-row">
              <button type="submit" className="primary" disabled={working || (!form.domain.trim() && !form.local.trim()) || (lan && !!form.domain && (!form.dnsProvider || (!form.dnsToken && !h.dnsToken)))}>{h.on ? t('Save and restart Caddy') : t('Switch HTTPS on')}</button>
              {h.on && <button type="button" disabled={working} onClick={() => { void ask(t('Switch HTTPS off? Voice input stops working until it is on again.')).then((yes) => { if (yes) void send('off'); }); }}>{t('Switch HTTPS off')}</button>}
            </div>
          </form>
          {h.log.length > 0 && <details open={h.state === 'failed'}><summary>{t('HTTPS log')}</summary><pre className="inn-log small">{h.log.join('\n')}</pre></details>}
        </>
      )}
    </section>
  );
}

function ServerPane({ fail, say, firstPassword, onPassword }: PaneProps & { firstPassword: boolean; onPassword: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const [o, reload] = usePoll<AdminOverview>('/overview', 3000, fail);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  if (!o) return <p className="muted">{t('Loading…')}</p>;
  const u = o.updater;
  const busy = u.state === 'checking' || u.state === 'building' || u.state === 'restarting';
  const server = async (body: Record<string, unknown>, done?: string) => {
    try { await inn('/server', { body }); if (done) say(done); reload(); } catch (err) { fail(err); }
  };
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await inn('/password', { body: { current: pw.current, next: pw.next } });
      setPw({ current: '', next: '', again: '' });
      onPassword();
      say(t('The password was changed.'));
    } catch (err) { fail(err); }
  };
  return (
    <div className="inn-stack">
      <section>
        <h3>{t('Version')}</h3>
        {u.commit
          ? <p><b>v{o.version}</b> · <span className="mono">{u.commit}</span> · {u.subject}{u.commitDate && <span className="muted"> · {new Date(u.commitDate).toLocaleString(lang)}</span>}</p>
          : <p><b>v{o.version}</b></p>}
        {!u.connected ? (
          <Note kind="warn"><span>{t('The updater is not running, so the server cannot update itself. It is part of docker-compose.yml: run the installer once more (or "docker compose up -d --build") and it starts.')}</span></Note>
        ) : (
          <>
            <p className={u.state === 'failed' ? 'inn-state is-bad' : busy ? 'inn-state is-busy' : 'inn-state'}>
              {t(UPDATER_STATES[u.state])}
              {u.message && <span className="muted"> · {u.message}</span>}
            </p>
            {u.behind > 0 && !busy && <Note kind="good"><span>{newVersion(u.behind, t)}</span></Note>}
            <div className="inn-row">
              <button type="button" className="primary" disabled={busy || u.behind < 1} onClick={() => { void ask(t('Install the new version now? The game keeps running while it is built (a few minutes), then the server restarts once. Everyone is told, and every table is saved.')).then((yes) => { if (yes) void server({ do: 'update' }, t('The update has started.')); }); }}>{t('Update now')}</button>
              <button type="button" disabled={busy} onClick={() => void server({ do: 'check' })}>{t('Look for a new version')}</button>
              <span className="muted small">{u.checkedAt && t('Last looked: {when}', { when: new Date(u.checkedAt).toLocaleString(lang) })} · {t('Branch')} {u.branch}</span>
            </div>
            {u.incoming.length > 0 && <><h4>{t('What is new')}</h4><Commits list={u.incoming} /></>}
            {u.recent.length > 0 && <details><summary>{t('What this version already has')}</summary><Commits list={u.recent} /></details>}
            {u.log.length > 0 && <details open={busy || u.state === 'failed'}><summary>{t('Updater log')}</summary><pre className="inn-log small">{u.log.join('\n')}</pre></details>}
          </>
        )}
        <p className="muted small">{t('If a new version does not start, the updater puts the previous one back by itself. Automatic updates can be switched on below, under Server settings.')}</p>
      </section>
      <HttpsSection fail={fail} say={say} />
      <section>
        <h3>{t('Restart')}</h3>
        {o.restartPending && <Note kind="warn"><span>{t('Settings were changed. They apply after a restart.')}</span></Note>}
        {!o.docker && <Note><span>{t('This server does not seem to run in Docker. A restart then only stops it, unless something else starts it again.')}</span></Note>}
        {o.restartAt && o.restartAt > o.now
          ? <Note kind="warn"><span>{t('The server restarts in {time}.', { time: span(t, o.restartAt - o.now) })}</span><button type="button" onClick={() => void server({ do: 'cancel' })}>{t('Call it off')}</button></Note>
          : (
            <div className="inn-row">
              <button type="button" onClick={() => { void ask(t('Restart the server now? Every table is saved, and the players are back within seconds.')).then((yes) => { if (yes) void server({ do: 'restart', delay: 0 }, t('Restarting…')); }); }}>{t('Restart now')}</button>
              <button type="button" onClick={() => void server({ do: 'restart', delay: 60 })}>{t('In 1 minute')}</button>
              <button type="button" onClick={() => void server({ do: 'restart', delay: 300 })}>{t('In 5 minutes')}</button>
            </div>
          )}
        <p className="muted small">{t('With a delay, everyone who is connected is told beforehand.')}</p>
      </section>
      <section>
        <h3>{t('Password')}</h3>
        {firstPassword && <Note kind="warn"><span>{t('You are still using the first password. Choose your own.')}</span></Note>}
        <form className="inn-form" onSubmit={changePassword}>
          <label>{t('Current password')}<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label>{t('New password')}<input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
          <label>{t('New password, again')}<input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></label>
          <button type="submit" disabled={!pw.current || pw.next.length < 8 || pw.next !== pw.again}>{t('Change password')}</button>
        </form>
        <p className="muted small">{t('At least 8 characters. Changing it signs out every other browser.')}</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------- costs

function UsageRows<T extends UsageTotals>({ rows, name, head }: { rows: T[]; name: (r: T) => string; head: string }) {
  const t = useT();
  const most = Math.max(1e-9, ...rows.map((r) => r.cost ?? 0));
  return (
    <table className="inn-table">
      <thead><tr><th>{head}</th><th className="num">{t('Calls')}</th><th className="num">{t('Input')}</th><th className="num">{t('Output')}</th><th className="num">{t('From cache')}</th><th className="num">{t('Pictures')}</th><th className="num">{t('Voice')}</th><th className="num">{t('Costs')}</th><th /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={name(r)}>
            <td>{name(r)}</td><td className="num">{r.calls}</td><td className="num">{tokens(r.input + r.cacheWrite)}</td><td className="num">{tokens(r.output)}</td><td className="num">{tokens(r.cacheRead)}</td><td className="num">{r.images ? money(r.images) : ''}</td><td className="num">{r.voice ? money(r.voice) : ''}</td><td className="num">{money(r.cost)}</td>
            <td className="inn-bar"><i style={{ width: `${Math.round(((r.cost ?? 0) / most) * 100)}%` }} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------- credits

/**
 * Player credits: what each account's share of the AI has cost, what they paid in, and the switch that stops a
 * player whose credit is used up. Changes apply at once.
 */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function CreditsPane({ fail, say }: PaneProps) {
  const t = useT();
  const { lang } = useLang();
  const [r, set] = usePoll<CreditReport>('/credits', 15000, fail);
  const [draft, setDraft] = useState<CreditConfig | null>(null);
  const [topUp, setTopUp] = useState<{ id: string; amount: string; note: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>) => {
    try { const next = await inn<CreditReport>('/credits', { body }); set(next); return next; } catch (err) { fail(err); return null; }
  };
  if (!r) return <p className="muted">{t('Loading…')}</p>;
  const c = draft ?? r.config;
  const edit = (patch: Partial<CreditConfig>) => setDraft({ ...c, ...patch });
  const field = (label: string, value: number, onChange: (n: number) => void, step: string) => (
    <label>{label}<input type="number" min="0" step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.valueAsNumber)} /></label>
  );
  const book = async (e: FormEvent) => {
    e.preventDefault();
    if (!topUp) return;
    const who = r.rows.find((x) => x.id === topUp.id)?.username ?? '';
    const amount = Number(topUp.amount.replace(',', '.'));
    if (await act({ do: 'top_up', id: topUp.id, amount, note: topUp.note })) { say(t('{amount} booked for {name}.', { amount: fmtAmount(amount, r.config.currency), name: who })); setTopUp(null); }
  };
  return (
    <section className="inn-credits">
      <h3>{t('Player credits')}</h3>
      <label className="inn-switch">
        <input type="checkbox" checked={r.config.on} onChange={(e) => void act({ do: 'config', config: { on: e.target.checked } }).then((ok) => ok && say(e.target.checked ? t('Credits are on.') : t('Credits are off.')))} />
        <span><b>{t('Players pay for the AI with credits')}</b><br /><span className="muted small">{r.config.on
          ? t('A player whose credit is used up cannot ask the Dungeon Master for anything new until you top it up. A fight already under way is finished. Innkeepers and accounts marked free are never stopped.')
          : t('Off: what each account costs is counted below, but nobody is stopped. Switch it on once your players have paid in.')}</span></span>
      </label>
      <form className="inn-credit-config" onSubmit={(e) => { e.preventDefault(); void act({ do: 'config', config: c }).then((ok) => { if (ok) { setDraft(null); say(t('Saved.')); } }); }}>
        <label>{t('Currency for everything')}
          <input value={c.currency} maxLength={3} list="inn-currencies" onChange={(e) => { const cur = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); edit({ currency: cur, ...(cur === 'USD' ? { rate: 1 } : {}) }); }} />
          <datalist id="inn-currencies">{['USD', 'CHF', 'EUR', 'GBP'].map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        {c.currency !== 'USD' && field(t('{currency} per US dollar (your fixed rate)', { currency: c.currency }), c.rate, (n) => edit({ rate: n }), '0.01')}
        {field(t('Warn players below ({currency})', { currency: c.currency }), c.warn, (n) => edit({ warn: n }), '0.5')}
        {field(t('ElevenLabs voice, Quality model, {currency} per 1000 characters', { currency: c.currency }), round6(c.voiceUsdPer1k.elevenlabs * c.rate), (n) => edit({ voiceUsdPer1k: { ...c.voiceUsdPer1k, elevenlabs: n / c.rate } }), '0.001')}
        <p className="muted small">{c.currency === 'USD'
          ? t('Dollars: every price is the provider\'s own price, with no conversion.')
          : t('The AI providers bill in dollars. Every dollar price is multiplied once by your fixed rate; nothing is fetched from the internet. When you change the currency, the money already booked is converted once at the new rate.')}</p>
        <button type="submit" disabled={!draft}>{t('Save')}</button>
      </form>
      <table className="inn-table">
        <thead><tr><th>{t('Account')}</th><th className="num">{t('Left')}</th><th className="num">{t('Paid in')}</th><th className="num">{t('Dungeon Master')}</th><th className="num">{t('Narrator')}</th><th className="num">{t('Pictures')}</th><th className="num">{t('Last 30 days')}</th><th>{t('Free')}</th><th /></tr></thead>
        <tbody>
          {r.rows.map((a) => (
            <Fragment key={a.id}>
              <tr className={a.out ? 'is-out' : a.low ? 'is-low' : undefined}>
                <td><button type="button" className="link" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}><b>{a.username}</b></button>{a.role === 'innkeeper' && <span className="muted small"> · {t('Innkeeper')}</span>}</td>
                <td className="num">{a.limited ? <b className={a.out ? 'bad' : a.low ? 'warn' : undefined}>{fmtAmount(a.balance, a.currency)}</b> : <span className="muted">{t('no limit')}</span>}</td>
                <td className="num">{fmtAmount(a.paid, a.currency)}</td>
                <td className="num">{fmtAmount(a.spentClaude, a.currency)}</td>
                <td className="num">{fmtAmount(a.spentVoice, a.currency)}</td>
                <td className="num">{fmtAmount(a.spentImages ?? 0, a.currency)}</td>
                <td className="num">{fmtAmount(a.last30, a.currency)}</td>
                <td>{a.role === 'innkeeper' ? <span className="muted">—</span> : <input type="checkbox" checked={a.free} aria-label={t('Free')} onChange={(e) => void act({ do: 'free', id: a.id, free: e.target.checked })} />}</td>
                <td className="inn-actions"><button type="button" onClick={() => setTopUp({ id: a.id, amount: '', note: '' })}>{t('Top up')}</button></td>
              </tr>
              {topUp?.id === a.id && (
                <tr className="inn-subrow"><td colSpan={9}>
                  <form className="inn-topup" onSubmit={book}>
                    <label>{t('Amount ({currency})', { currency: r.config.currency })}<input autoFocus inputMode="decimal" value={topUp.amount} onChange={(e) => setTopUp({ ...topUp, amount: e.target.value })} placeholder="10.00" /></label>
                    <label>{t('Note')}<input value={topUp.note} maxLength={80} onChange={(e) => setTopUp({ ...topUp, note: e.target.value })} placeholder={t('for example: TWINT, 20 Nov')} /></label>
                    <button type="submit" className="primary" disabled={!Number(topUp.amount.replace(',', '.'))}>{t('Book')}</button>
                    <button type="button" className="link" onClick={() => setTopUp(null)}>{t('Cancel')}</button>
                  </form>
                  <p className="muted small">{t('A negative amount corrects a mistake or pays money back.')}</p>
                </td></tr>
              )}
              {open === a.id && (
                <tr className="inn-subrow"><td colSpan={9}>
                  {a.topUps.length === 0 ? <span className="muted">{t('Nothing paid in yet.')}</span> : (
                    <ul className="inn-list">{a.topUps.map((p, i) => <li key={i}><span>{new Date(p.at).toLocaleDateString(lang)}</span><b>{fmtAmount(p.amount, a.currency)}</b><span className="muted">{p.note}</span></li>)}</ul>
                  )}
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('Each call to the AI is shared equally among the accounts sitting at the table, at the list prices below, in your currency at your fixed rate. Piper voices cost nothing. An estimate: your invoices from Anthropic and ElevenLabs are what count.')}</p>
      <p className="muted small">{t('Scene pictures and hero portraits are billed per picture at the price shown under Art → Illustrations. A hero portrait goes on the account of the player whose hero it is; the portrait of a person the party meets is shared by the table, like a scene picture.')}</p>
    </section>
  );
}

function UsagePane({ fail }: PaneProps) {
  const t = useT();
  const [r] = usePoll<UsageReport>('/usage', 15000, fail);
  if (!r) return <p className="muted">{t('Loading…')}</p>;
  if (!r.total.calls && !r.total.images && !r.total.voice) return <p className="muted">{t('The AI Dungeon Master has not been called yet. Costs show up here once it has.')}</p>;
  return (
    <div className="inn-stack">
      <div className="inn-stats">
        <Stat label={t('Last 90 days')} value={money(r.total.cost)} sub={t('{n} calls', { n: r.total.calls })} />
        <Stat label={t('Input')} value={tokens(r.total.input + r.total.cacheWrite)} sub={t('tokens')} />
        <Stat label={t('Output')} value={tokens(r.total.output)} sub={t('tokens')} />
        <Stat label={t('From cache')} value={tokens(r.total.cacheRead)} sub={t('tokens')} />
        <Stat label={t('Pictures')} value={money(r.total.images ?? 0)} sub={t('image service')} />
        <Stat label={t('Voice')} value={money(r.total.voice ?? 0)} sub={t('narrator')} />
      </div>
      <section><h3>{t('By model')}</h3><UsageRows rows={r.models} name={(m) => (m.model === 'images' ? t('Pictures') : m.model === 'voice' ? t('Narrator voice') : m.model)} head={t('Model')} /></section>
      <section><h3>{t('By table')}</h3><UsageRows rows={r.tables} name={(x) => x.title} head={t('Table')} /></section>
      <section><h3>{t('By day')}</h3><UsageRows rows={r.days.slice(0, 30)} name={(d) => d.day} head={t('Day')} /></section>
      <p className="muted small">{t('An estimate from the tokens the API reported and these list prices per million tokens: {prices}, plus what pictures and the narrator voice cost at the prices set for them. Your invoices are what counts.', { prices: r.prices.map((p) => `${p.model} ${usd(p.input, true)} / ${usd(p.output, true)}`).join(', ') })}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------- log

function LogsPane({ fail }: PaneProps) {
  const t = useT();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all');
  const last = useRef(0);
  const box = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    let stop = false;
    const load = () => inn<{ lines: LogLine[] }>(`/logs?after=${last.current}`).then((r) => {
      if (stop || !r.lines.length) return;
      // The server counts lines from 1 again after a restart.
      const restarted = r.lines[r.lines.length - 1].id < last.current;
      last.current = r.lines[r.lines.length - 1].id;
      setLines((l) => [...(restarted ? [] : l), ...r.lines].slice(-1500));
    }).catch((err) => { if (err instanceof InnError && err.code === 'offline') last.current = 0; else fail(err); });
    void load();
    const timer = setInterval(load, 3000);
    return () => { stop = true; clearInterval(timer); };
  }, [fail]);
  useEffect(() => { if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines, level]);
  const shown = lines.filter((l) => level === 'all' || l.level === 'error' || (level === 'warn' && l.level === 'warn'));
  return (
    <div className="inn-logs">
      <div className="inn-row">
        <span className="pick">
          {(['all', 'warn', 'error'] as const).map((l) => <button key={l} type="button" className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{t(LOG_FILTERS[l])}</button>)}
        </span>
        <span className="spacer" />
        <button type="button" onClick={() => { const text = shown.map((l) => `${new Date(l.at).toISOString()} ${l.level} ${l.text}`).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = 'hearthforge-log.txt'; a.click(); }}>{t('Save as a file')}</button>
      </div>
      <pre ref={box} className="inn-log" onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {shown.length === 0 && <span className="muted">{t('Nothing here yet.')}</span>}
        {shown.map((l) => <span key={l.id} className={`lv-${l.level}`}><time>{new Date(l.at).toLocaleTimeString()}</time> {l.text}{'\n'}</span>)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------- backups

function BackupsPane({ fail, say }: PaneProps) {
  const t = useT();
  const { lang } = useLang();
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { inn<{ backups: BackupInfo[] }>('/backups').then((r) => setList(r.backups)).catch(fail); }, [fail]);
  const run = async (job: () => Promise<{ backups: BackupInfo[]; restored?: number }>, done?: (r: { restored?: number }) => string) => {
    setBusy(true);
    try { const r = await job(); setList(r.backups); if (done) say(done(r)); } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const restored = (r: { restored?: number }) => t('{n} tables were put back.', { n: r.restored ?? 0 });
  const q = settings ? '&settings=1' : '';
  const askRestore = () => ask(t('Put the tables of this backup back? Tables with the same name are overwritten, and their players are sent to the list of tables. The current state is saved as a backup first.'), { danger: true });
  if (!list) return <p className="muted">{t('Loading…')}</p>;
  return (
    <div className="inn-stack">
      <div className="inn-row">
        <button type="button" className="primary" disabled={busy} onClick={() => void run(() => inn('/backup', { method: 'POST' }), () => t('Backup made.'))}>{t('Back up now')}</button>
        <button type="button" disabled={busy} onClick={() => innDownload('/backup').catch(fail)}>{t('Download a backup')}</button>
        <button type="button" disabled={busy} onClick={() => file.current?.click()}>{t('Restore from a file')}</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void askRestore().then((yes) => { if (yes) void run(() => inn(`/restore?${q}`, { raw: f }), restored); }); }} />
      </div>
      <label className="inn-check"><input type="checkbox" checked={settings} onChange={(e) => setSettings(e.target.checked)} />{t('When restoring, also take the settings and bans of the backup')}</label>
      <p className="muted small">{t('A backup holds every table with its heroes, story and world, the settings and the bans. It never holds the API key or passwords, and not the art packs. The server makes one by itself every day and keeps the newest {n}.', { n: 14 })}</p>
      {list.length === 0 ? <p className="muted">{t('No backup on the server yet.')}</p> : (
        <table className="inn-table">
          <thead><tr><th>{t('Backup')}</th><th>{t('Made')}</th><th className="num">{t('Tables')}</th><th className="num">{t('Size')}</th><th /></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.name}>
                <td className="mono">{b.name.replace(/^hearthforge-|\.json$/g, '')}</td>
                <td>{new Date(b.at).toLocaleString(lang)}</td>
                <td className="num">{b.tables}</td>
                <td className="num">{b.sizeKb} kB</td>
                <td className="inn-actions">
                  <button type="button" disabled={busy} onClick={() => innDownload(`/backup?name=${encodeURIComponent(b.name)}`).catch(fail)}>{t('Download')}</button>
                  <button type="button" disabled={busy} onClick={() => { void askRestore().then((yes) => { if (yes) void run(() => inn(`/restore?name=${encodeURIComponent(b.name)}${q}`, { method: 'POST' }), restored); }); }}>{t('Restore')}</button>
                  <button type="button" className="link danger" disabled={busy} onClick={() => { void ask(t('Delete this backup?'), { danger: true }).then((yes) => { if (yes) void run(() => inn('/backup/delete', { body: { name: b.name } })); }); }}>{t('Delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- the window

export function Innkeeper({ account, onClose }: { account: AccountView; onClose: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const loadStatus = useCallback(() => { inn<AdminStatus>('/status').then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(loadStatus, [loadStatus]);

  const show = useCallback((text: string, bad: boolean) => {
    setMessage({ text, bad });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), bad ? 7000 : 4000);
  }, []);
  const say = useCallback((text: string) => show(text, false), [show]);
  const fail = useCallback((err: unknown) => {
    if (err instanceof InnError && err.code === 'signed_out') { signedOut(); return; }
    show(errorText(t, err), true);
  }, [show, t]);

  // Esc closes the panel, also from the list of tables where nothing else listens for it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pane: PaneProps = useMemo(() => ({ fail, say }), [fail, say]);
  const first = !!status?.firstPassword;

  return (
    <Window title={t('Innkeeper')} icon="innkeeper" size="large" className="innkeeper" onClose={onClose}
      subtitle={<span className="muted">{account.username}</span>}>
      {status && !status.enabled ? <div className="inn-signin"><p>{t(ADMIN_ERRORS.disabled)}</p></div>
        : account.role !== 'innkeeper' ? <div className="inn-signin"><Emblem /><p>{t(ADMIN_ERRORS.not_innkeeper)}</p></div> : (
        <div className="inn">
          <nav className="inn-nav" aria-label={t('Innkeeper')}>
            {(Object.keys(INN_TABS) as Tab[]).map((id) => (
              <button key={id} type="button" className={tab === id ? 'on' : ''} aria-current={tab === id} onClick={() => { setTab(id); sfx('tab'); }}>
                <Icon name={TAB_ICONS[id]} size={17} /><span>{t(INN_TABS[id])}</span>
              </button>
            ))}
          </nav>
          <div className={tab === 'sound' || tab === 'art' || tab === 'server' ? 'inn-pane fill' : 'inn-pane'}>
            {message && <div className={message.bad ? 'inn-flash is-bad' : 'inn-flash'} role="status">{message.text}</div>}
            {tab === 'overview' && <Overview {...pane} go={setTab} firstPassword={first} />}
            {tab === 'tables' && <Tables {...pane} />}
            {tab === 'players' && <div className="inn-stack"><AccountsPane {...pane} me={account.id} /><PlayersPane {...pane} /></div>}
            {tab === 'costs' && <div className="inn-stack"><CreditsPane {...pane} /><UsagePane {...pane} /></div>}
            {tab === 'dm' && <SettingsBlock {...pane} go={setTab} sections={DM_SECTIONS} />}
            {tab === 'sound' && <SoundPane {...pane} go={setTab} />}
            {tab === 'art' && <ArtPane {...pane} go={setTab} />}
            {tab === 'server' && <ServerTabs {...pane} go={setTab} firstPassword={first} onPassword={loadStatus} />}
          </div>
        </div>
      )}
    </Window>
  );
}

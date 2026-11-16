// The Innkeeper: the panel of whoever owns this server. Tables, players, art packs, settings and
// API key, updates and restarts, costs, the log and backups, so that nothing needs a terminal.
// It is reached from the list of tables and from Settings, and asks for the owner's password.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ADMIN_ERRORS, MODEL_SUGGESTIONS, SETTINGS, SETTING_GROUPS, type AdminBan, type AdminConnection, type AdminOverview, type AdminStatus, type AdminTable,
  type BackupInfo, type LogLine, type SettingDef, type SettingGroup, type SettingValue, type UpdaterStatus, type UsageReport, type UsageTotals,
} from '../../../shared/admin';
import { CLASS_INFO } from '../../../shared/content';
import type { ClassId } from '../../../shared/types';
import { useLang, useT, type Translate } from '../i18n';
import { ArtWindow } from './ArtWindow';
import { Emblem } from './Brand';
import { Info } from './Hint';
import { Icon, type IconName } from './icons';
import { inn, innDownload, innkeeperSession, InnError, setInnkeeperSession } from './innkeeperApi';
import { ASSET_TABS, INN_MISC, INN_TABS, KEY_RESULTS, LOG_FILTERS, PHASE_LABELS, SOURCE_LABELS, UPDATER_STATES } from './labels';
import { sfx } from './sound';
import { SfxLibrary } from './SfxLibrary';
import { SoundLibrary } from './SoundLibrary';
import { TabBar, Window } from './Window';

type Tab = keyof typeof INN_TABS;
const TAB_ICONS: Record<Tab, IconName> = { overview: 'innkeeper', tables: 'table', players: 'people', assets: 'inventory', settings: 'settings', server: 'up', usage: 'coin', logs: 'lore', backups: 'journal' };

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
const money = (c: number | null) => (c === null ? '?' : c > 0 && c < 0.01 ? '< $0.01' : `$${c.toFixed(2)}`);

/** Ask the server again every few seconds while the section is on screen. */
function usePoll<T>(path: string, ms: number, onError: (err: unknown) => void): [T | null, (next?: T) => void] {
  const [data, setData] = useState<T | null>(null);
  const load = useCallback((next?: T) => {
    if (next !== undefined) return setData(next);
    inn<T>(path).then(setData).catch(onError);
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

// ---------------------------------------------------------------------------- signing in

function SignIn({ status, onSession }: { status: AdminStatus | null; onSession: (token: string) => void }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { session } = await inn<{ session: string }>('/login', { body: { password } });
      onSession(session);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  if (status && !status.enabled) return <div className="inn-signin"><p>{t(ADMIN_ERRORS.disabled)}</p></div>;
  return (
    <form className="inn-signin" onSubmit={submit}>
      <Emblem />
      <h2>{t('The Innkeeper')}</h2>
      <p className="muted">{t('This is the panel of whoever runs this server. Players do not need it.')}</p>
      <label>{t('Password')}
        <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="inn-error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy || !password}>{t('Sign in')}</button>
      {status?.firstPassword && <p className="muted small">{t('First time here? The installer printed the password when it finished. Without the installer, the server wrote it into its log and into the file innkeeper-first-password.txt in its data folder.')}</p>}
    </form>
  );
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
      {o.dm.mode === 'scripted' && <Note><span>{t('No API key is in use, so the scripted Dungeon Master runs the tables.')}</span><button type="button" onClick={() => go('settings')}>{t('Add a key')}</button></Note>}
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

function AssetsPane() {
  const t = useT();
  const [sub, setSub] = useState<keyof typeof ASSET_TABS>('music');
  return (
    <div className="assets-pane">
      <TabBar tabs={(Object.keys(ASSET_TABS) as (keyof typeof ASSET_TABS)[]).map((id) => ({ id, label: t(ASSET_TABS[id]) }))} value={sub} onChange={setSub} />
      <div className="assets-body">
        {sub === 'art' ? <ArtWindow embedded /> : sub === 'effects' ? <SfxLibrary /> : <SoundLibrary key={sub} layer={sub} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- tables

function Tables({ fail, say }: PaneProps) {
  const t = useT();
  const { lang } = useLang();
  const [data, set] = usePoll<{ tables: AdminTable[] }>('/tables', 5000, fail);
  const act = async (body: Record<string, unknown>) => {
    try { set(await inn<{ tables: AdminTable[] }>('/tables', { body })); sfx('tab'); } catch (err) { fail(err); }
  };
  if (!data) return <p className="muted">{t('Loading…')}</p>;
  if (!data.tables.length) return <p className="muted">{t('No table has been opened yet.')}</p>;
  return (
    <ul className="inn-cards">
      {data.tables.map((tb) => (
        <li key={tb.id} className={tb.players.some((p) => p.connected) ? 'inn-card live' : 'inn-card'}>
          <header>
            <b>{tb.title}</b>
            <span className="inn-tag">{t(PHASE_LABELS[tb.phase] ?? tb.phase)}</span>
            {tb.paused && <span className="inn-tag is-warn">{t('Paused')}</span>}
            {tb.code && <span className="inn-tag" title={t('Invite code')}>{tb.code}</span>}
            <span className="spacer" />
            <button type="button" onClick={() => void act({ table: tb.id, do: tb.paused ? 'resume' : 'pause' })}>{tb.paused ? t('Resume') : t('Pause')}</button>
            <button type="button" onClick={() => innDownload(`/table?id=${encodeURIComponent(tb.id)}`).catch(fail)}>{t('Download')}</button>
            <button type="button" className="link danger" onClick={() => { if (window.confirm(t('Delete the table "{title}" with its heroes and its story? This cannot be undone, except from a backup.', { title: tb.title }))) void act({ table: tb.id, do: 'delete' }).then(() => say(t('The table was deleted.'))); }}>{t('Delete')}</button>
          </header>
          <dl>
            <div><dt>{t('Players')}</dt><dd>
              {tb.players.length === 0 && <span className="muted">{t('Nobody')}</span>}
              {tb.players.map((p) => (
                <span key={p.id} className={p.connected ? 'inn-who here' : 'inn-who'} title={p.connected ? t('At the table') : t('Away')}>
                  {p.name}{p.id === tb.hostId && <i>{t('host')}</i>}
                  <button type="button" className="inn-x" title={t('Send away from the table')} aria-label={t('Send away from the table')} onClick={() => { if (window.confirm(t('Send {name} away from this table?', { name: p.name }))) void act({ table: tb.id, do: 'remove', playerId: p.id }); }}>×</button>
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
  );
}

// ---------------------------------------------------------------------------- players

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
      {data.connections.length === 0 ? <p className="muted">{t('Nobody is connected.')}</p> : (
        <table className="inn-table">
          <thead><tr><th>{t('Player')}</th><th>{t('Table')}</th><th>{t('Address')}</th><th>{t('Connected for')}</th><th>{t('Browser')}</th><th /></tr></thead>
          <tbody>
            {data.connections.map((c) => (
              <tr key={c.id}>
                <td>{c.name || <span className="muted">{t('Not seated')}</span>}{c.host && <i className="inn-host">{t('host')}</i>}</td>
                <td>{c.tableTitle || <span className="muted">{t('List of tables')}</span>}</td>
                <td className="mono">{c.ip}</td>
                <td>{span(t, now - c.since)}</td>
                <td title={c.agent}>{[browser(c.agent), system(c.agent)].filter(Boolean).join(', ')}</td>
                <td className="inn-actions">
                  <button type="button" onClick={() => void act({ do: 'disconnect', id: c.id })}>{t('Disconnect')}</button>
                  <button type="button" className="link danger" onClick={() => { if (window.confirm(t('Ban the address {ip}? Nobody can connect from it until you lift the ban.', { ip: c.ip }))) void act({ do: 'ban', ip: c.ip, note: c.name }).then(() => say(t('The address was banned.'))); }}>{t('Ban address')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">{t('Players have no accounts: a seat belongs to a browser. Banning works by address, so it also stops everyone else behind the same router. Your own address cannot be banned.')}</p>
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

interface KeyResult { ok: boolean; reason?: keyof typeof KEY_RESULTS; detail?: string; missing?: string[] }

function SettingRow({ def, value, draft, onDraft, onReset }: { def: SettingDef; value: SettingValue; draft: string | undefined; onDraft: (v: string | undefined) => void; onReset: () => void }) {
  const t = useT();
  const current = draft ?? (def.kind === 'secret' ? '' : value.value);
  let control: ReactNode;
  if (def.kind === 'choice' && def.choices!.join() === 'on,off' || def.choices?.join() === 'off,on') {
    const on = current === 'on';
    control = <button type="button" role="switch" aria-checked={on} className={on ? 'switch on' : 'switch'} onClick={() => { onDraft(on ? 'off' : 'on'); sfx('tab'); }}>{on ? t('On') : t('Off')}</button>;
  } else if (def.kind === 'choice') {
    control = <select value={current} onChange={(e) => onDraft(e.target.value)}>{def.choices!.map((c) => <option key={c} value={c}>{c}</option>)}</select>;
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
          {t(SOURCE_LABELS[value.source])}{value.pending && ` · ${t('applies after a restart')}`}
          {value.source === 'panel' && <button type="button" className="link" onClick={onReset}>{t('Reset')}</button>}
        </small>
      </span>
      <span className="inn-setting-control">{control}</span>
    </div>
  );
}

function SettingsPane({ fail, say, go }: PaneProps & { go: (tab: Tab) => void }) {
  const t = useT();
  const [data, setData] = useState<{ settings: SettingValue[]; restartPending: boolean } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [test, setTest] = useState<KeyResult | 'busy' | null>(null);
  const [group, setGroup] = useState<SettingGroup>('dm');
  useEffect(() => { inn<typeof data>('/env').then(setData).catch(fail); }, [fail]);
  if (!data) return <p className="muted">{t('Loading…')}</p>;
  const dirty = Object.keys(draft).length > 0;
  const save = async (values: Record<string, string | null>) => {
    try {
      setData(await inn('/env', { body: { values } }));
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !(k in values))));
      say(t('Saved. The change applies after a restart.'));
    } catch (err) { fail(err); }
  };
  const runTest = async () => {
    setTest('busy');
    try { setTest(await inn<KeyResult>('/env/test', { body: { key: draft.ANTHROPIC_API_KEY } })); } catch (err) { setTest(null); fail(err); }
  };
  const groups = Object.keys(SETTING_GROUPS) as SettingGroup[];
  const changedIn = (g: SettingGroup) => SETTINGS.filter((d) => d.group === g && d.key in draft).length;
  return (
    <div className="inn-stack inn-settings">
      <TabBar tabs={groups.map((g) => ({ id: g, label: t(SETTING_GROUPS[g]), count: changedIn(g) || undefined }))} value={group} onChange={setGroup} />
      {data.restartPending && <Note kind="warn"><span>{t('Settings were changed. They apply after a restart.')}</span><button type="button" onClick={() => go('server')}>{t('To the restart')}</button></Note>}
      <datalist id="inn-models">{MODEL_SUGGESTIONS.map((m) => <option key={m} value={m} />)}</datalist>
      {[group].map((g) => (
        <section key={g}>
          {SETTINGS.filter((d) => d.group === g).map((def) => {
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
                    {value.set && <button type="button" className="link danger" onClick={() => { if (window.confirm(t('Remove the API key? The tables then get the scripted Dungeon Master.'))) void save({ ANTHROPIC_API_KEY: '' }); }}>{t('Remove the key')}</button>}
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
              <button type="button" className="primary" disabled={busy || u.behind < 1} onClick={() => { if (window.confirm(t('Install the new version now? The game keeps running while it is built (a few minutes), then the server restarts once. Everyone is told, and every table is saved.'))) void server({ do: 'update' }, t('The update has started.')); }}>{t('Update now')}</button>
              <button type="button" disabled={busy} onClick={() => void server({ do: 'check' })}>{t('Look for a new version')}</button>
              <span className="muted small">{u.checkedAt && t('Last looked: {when}', { when: new Date(u.checkedAt).toLocaleString(lang) })} · {t('Branch')} {u.branch}</span>
            </div>
            {u.incoming.length > 0 && <><h4>{t('What is new')}</h4><Commits list={u.incoming} /></>}
            {u.recent.length > 0 && <details><summary>{t('What this version already has')}</summary><Commits list={u.recent} /></details>}
            {u.log.length > 0 && <details open={busy || u.state === 'failed'}><summary>{t('Updater log')}</summary><pre className="inn-log small">{u.log.join('\n')}</pre></details>}
          </>
        )}
        <p className="muted small">{t('If a new version does not start, the updater puts the previous one back by itself. Automatic updates can be switched on under Settings.')}</p>
      </section>
      <section>
        <h3>{t('Restart')}</h3>
        {o.restartPending && <Note kind="warn"><span>{t('Settings were changed. They apply after a restart.')}</span></Note>}
        {!o.docker && <Note><span>{t('This server does not seem to run in Docker. A restart then only stops it, unless something else starts it again.')}</span></Note>}
        {o.restartAt && o.restartAt > o.now
          ? <Note kind="warn"><span>{t('The server restarts in {time}.', { time: span(t, o.restartAt - o.now) })}</span><button type="button" onClick={() => void server({ do: 'cancel' })}>{t('Call it off')}</button></Note>
          : (
            <div className="inn-row">
              <button type="button" onClick={() => { if (window.confirm(t('Restart the server now? Every table is saved, and the players are back within seconds.'))) void server({ do: 'restart', delay: 0 }, t('Restarting…')); }}>{t('Restart now')}</button>
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
      <thead><tr><th>{head}</th><th className="num">{t('Calls')}</th><th className="num">{t('Input')}</th><th className="num">{t('Output')}</th><th className="num">{t('From cache')}</th><th className="num">{t('Costs')}</th><th /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={name(r)}>
            <td>{name(r)}</td><td className="num">{r.calls}</td><td className="num">{tokens(r.input + r.cacheWrite)}</td><td className="num">{tokens(r.output)}</td><td className="num">{tokens(r.cacheRead)}</td><td className="num">{money(r.cost)}</td>
            <td className="inn-bar"><i style={{ width: `${Math.round(((r.cost ?? 0) / most) * 100)}%` }} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UsagePane({ fail }: PaneProps) {
  const t = useT();
  const [r] = usePoll<UsageReport>('/usage', 15000, fail);
  if (!r) return <p className="muted">{t('Loading…')}</p>;
  if (!r.total.calls) return <p className="muted">{t('The AI Dungeon Master has not been called yet. Costs show up here once it has.')}</p>;
  return (
    <div className="inn-stack">
      <div className="inn-stats">
        <Stat label={t('Last 90 days')} value={money(r.total.cost)} sub={t('{n} calls', { n: r.total.calls })} />
        <Stat label={t('Input')} value={tokens(r.total.input + r.total.cacheWrite)} sub={t('tokens')} />
        <Stat label={t('Output')} value={tokens(r.total.output)} sub={t('tokens')} />
        <Stat label={t('From cache')} value={tokens(r.total.cacheRead)} sub={t('tokens')} />
      </div>
      <section><h3>{t('By model')}</h3><UsageRows rows={r.models} name={(m) => m.model} head={t('Model')} /></section>
      <section><h3>{t('By table')}</h3><UsageRows rows={r.tables} name={(x) => x.title} head={t('Table')} /></section>
      <section><h3>{t('By day')}</h3><UsageRows rows={r.days.slice(0, 30)} name={(d) => d.day} head={t('Day')} /></section>
      <p className="muted small">{t('An estimate from the tokens the API reported and these list prices per million tokens: {prices}. Your invoice from Anthropic is what counts.', { prices: r.prices.map((p) => `${p.model} $${p.input} / $${p.output}`).join(', ') })}</p>
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
  const ask = () => window.confirm(t('Put the tables of this backup back? Tables with the same name are overwritten, and their players are sent to the list of tables. The current state is saved as a backup first.'));
  if (!list) return <p className="muted">{t('Loading…')}</p>;
  return (
    <div className="inn-stack">
      <div className="inn-row">
        <button type="button" className="primary" disabled={busy} onClick={() => void run(() => inn('/backup', { method: 'POST' }), () => t('Backup made.'))}>{t('Back up now')}</button>
        <button type="button" disabled={busy} onClick={() => innDownload('/backup').catch(fail)}>{t('Download a backup')}</button>
        <button type="button" disabled={busy} onClick={() => file.current?.click()}>{t('Restore from a file')}</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && ask()) void run(() => inn(`/restore?${q}`, { raw: f }), restored); }} />
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
                  <button type="button" disabled={busy} onClick={() => { if (ask()) void run(() => inn(`/restore?name=${encodeURIComponent(b.name)}${q}`, { method: 'POST' }), restored); }}>{t('Restore')}</button>
                  <button type="button" className="link danger" disabled={busy} onClick={() => { if (window.confirm(t('Delete this backup?'))) void run(() => inn('/backup/delete', { body: { name: b.name } })); }}>{t('Delete')}</button>
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

export function Innkeeper({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [session, setSession] = useState(innkeeperSession);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const loadStatus = useCallback(() => { inn<AdminStatus>('/status').then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(loadStatus, [loadStatus, session]);

  const show = useCallback((text: string, bad: boolean) => {
    setMessage({ text, bad });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), bad ? 7000 : 4000);
  }, []);
  const say = useCallback((text: string) => show(text, false), [show]);
  const fail = useCallback((err: unknown) => {
    if (err instanceof InnError && err.code === 'signed_out') { setInnkeeperSession(''); setSession(''); return; }
    show(errorText(t, err), true);
  }, [show, t]);

  // Esc closes the panel, also from the list of tables where nothing else listens for it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signOut = () => { void inn('/logout', { method: 'POST' }).catch(() => {}); setInnkeeperSession(''); setSession(''); };
  const pane: PaneProps = useMemo(() => ({ fail, say }), [fail, say]);
  const first = !!status?.firstPassword;

  return (
    <Window title={t('Innkeeper')} icon="innkeeper" size="large" className="innkeeper" onClose={onClose}
      subtitle={session ? <button type="button" className="link" onClick={signOut}>{t('Sign out')}</button> : undefined}>
      {!session ? <SignIn status={status} onSession={(s) => { setInnkeeperSession(s); setSession(s); sfx('open'); }} /> : (
        <div className="inn">
          <nav className="inn-nav" aria-label={t('Innkeeper')}>
            {(Object.keys(INN_TABS) as Tab[]).map((id) => (
              <button key={id} type="button" className={tab === id ? 'on' : ''} aria-current={tab === id} onClick={() => { setTab(id); sfx('tab'); }}>
                <Icon name={TAB_ICONS[id]} size={17} /><span>{t(INN_TABS[id])}</span>
              </button>
            ))}
          </nav>
          <div className={tab === 'assets' || tab === 'logs' ? 'inn-pane fill' : 'inn-pane'}>
            {message && <div className={message.bad ? 'inn-flash is-bad' : 'inn-flash'} role="status">{message.text}</div>}
            {tab === 'overview' && <Overview {...pane} go={setTab} firstPassword={first} />}
            {tab === 'tables' && <Tables {...pane} />}
            {tab === 'players' && <PlayersPane {...pane} />}
            {tab === 'assets' && <AssetsPane />}
            {tab === 'settings' && <SettingsPane {...pane} go={setTab} />}
            {tab === 'server' && <ServerPane {...pane} firstPassword={first} onPassword={loadStatus} />}
            {tab === 'usage' && <UsagePane {...pane} />}
            {tab === 'logs' && <LogsPane {...pane} />}
            {tab === 'backups' && <BackupsPane {...pane} />}
          </div>
        </div>
      )}
    </Window>
  );
}

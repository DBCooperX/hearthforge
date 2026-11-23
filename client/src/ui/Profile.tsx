// Your account: what you and each of your heroes have done at the tables, and your password.
import { useEffect, useState, type FormEvent } from 'react';
import { PASSWORD_MIN, type PlayStats, type Profile } from '../../../shared/accounts';
import { CLASSES } from '../../../shared/rules';
import type { ClassId } from '../../../shared/types';
import { fmtAmount, type CreditView, type UsageView } from '../../../shared/credits';
import { accountCall } from '../account';
import { accountErrorText } from '../components/SignIn';
import { useLang, useT, type Translate } from '../i18n';
import { Window } from './Window';
import { deleteTemplate, useHeroTemplates } from '../templates';
import { ask } from './Confirm';

export function playTime(t: Translate, ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return t('{n} min', { n: min });
  return t('{h} h {m} min', { h: Math.floor(min / 60), m: min % 60 });
}

function StatTiles({ stats }: { stats: PlayStats }) {
  const t = useT();
  const tiles: [string, string | number][] = [
    [t('Sessions'), stats.sessions], [t('Play time'), playTime(t, stats.playMs)], [t('Killing blows'), stats.kills],
    [t('Critical hits'), stats.crits], [t('Deaths'), stats.deaths], [t('Gold earned'), t('{0} gp', { 0: stats.gold })],
  ];
  return <div className="inn-stats">{tiles.map(([label, value]) => <div key={label} className="inn-stat"><small>{label}</small><b>{value}</b></div>)}</div>;
}

/** What the AI has cost you, and what is left of what you paid in. */
function CreditTiles({ credit }: { credit: CreditView }) {
  const t = useT();
  return (
    <section>
      <h3>{t('AI credit')}</h3>
      {credit.out && <div className="inn-note is-bad"><span>{t('Your credit is used up. Ask the innkeeper to top it up, then carry on.')}</span></div>}
      {credit.low && <div className="inn-note is-warn"><span>{t('Your credit is running low. Ask the innkeeper to top it up before it runs out.')}</span></div>}
      <div className="inn-stats">
        {credit.limited && <div className="inn-stat"><small>{t('Left')}</small><b>{fmtAmount(credit.balance, credit.currency)}</b></div>}
        <div className="inn-stat"><small>{t('Paid in')}</small><b>{fmtAmount(credit.paid, credit.currency)}</b></div>
        <div className="inn-stat"><small>{t('AI costs so far')}</small><b>{fmtAmount(credit.spent, credit.currency)}</b></div>
      </div>
      <p className="muted small">{credit.limited
        ? t('The Dungeon Master and the narrator cost the innkeeper real money. Your share is taken off what you paid in: at a table with friends the cost is split among everyone sitting there.')
        : t('What your share of the Dungeon Master and the narrator has cost so far. At a table with friends the cost is split among everyone sitting there.')}</p>
    </section>
  );
}

/** The last seven days of that cost: by type and by table. */
function UsageSection({ usage }: { usage: UsageView }) {
  const t = useT();
  const m = (n: number) => fmtAmount(n, usage.currency, true);
  const kinds: [string, number][] = [[t('Story'), usage.claude], [t('Pictures'), usage.images], [t('Voice'), usage.voice], ...(usage.sound ? [[t('Sounds and music'), usage.sound] as [string, number]] : [])];
  const rows = [...usage.byTable.map((x) => [x.id, x.title, x.amount] as const), ...(usage.elsewhere > 0.0005 ? [['', t('Elsewhere'), usage.elsewhere] as const] : [])];
  return (
    <section>
      <h3>{t('Spent in the last {n} days', { n: usage.days })}</h3>
      <div className="inn-stats">
        <div className="inn-stat"><small>{t('Total')}</small><b>{m(usage.total)}</b></div>
        {kinds.map(([label, v]) => <div key={label} className="inn-stat"><small>{label}</small><b>{m(v)}</b></div>)}
      </div>
      {rows.length > 0 && (
        <table className="inn-table">
          <thead><tr><th>{t('Table')}</th><th className="num">{t('Spent')}</th></tr></thead>
          <tbody>{rows.map(([id, title, amount]) => <tr key={id || 'else'}><td>{title}</td><td className="num">{m(amount)}</td></tr>)}</tbody>
        </table>
      )}
      <p className="muted small">{t('At a table with friends the cost is split among everyone sitting there, so this is your share.')}</p>
    </section>
  );
}

export function ProfileWindow({ profile, onClose, onChanged }: { profile: Profile; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [name, setName] = useState(profile.account.username);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  // Fresh numbers whenever the window opens.
  useEffect(() => { onChanged(); }, []);
  const { account, stats, heroes } = profile;
  const { heroes: kept } = useHeroTemplates();

  const change = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await accountCall('/password', { current: pw.current, next: pw.next });
      setPw({ current: '', next: '', again: '' });
      setMsg({ text: t('The password was changed.'), bad: false });
      onChanged();
    } catch (err) {
      setMsg({ text: accountErrorText(t, err), bad: true });
    }
  };

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await accountCall('/rename', { username: name });
      setNote({ text: t('The name was changed.'), bad: false });
      onChanged();
    } catch (err) {
      setNote({ text: accountErrorText(t, err), bad: true });
    }
  };

  /** Clear numbers: everything, the hero list, or one hero's entry. */
  const clear = async (what: 'all' | 'heroes' | 'hero', question: string, done: string, hero?: string) => {
    if (!(await ask(question, { danger: true }))) return;
    try {
      await accountCall('/stats', { what, hero });
      setNote({ text: done, bad: false });
      onChanged();
    } catch (err) {
      setNote({ text: accountErrorText(t, err), bad: true });
    }
  };

  return (
    <Window title={account.username} icon="character" size="medium" className="profile" onClose={onClose}
      subtitle={<span className="muted">{account.role === 'innkeeper' ? t('Innkeeper') : t('Player')} · {t('Member since {when}', { when: new Date(account.createdAt).toLocaleDateString(lang) })}</span>}>
      <div className="inn-stack profile-body">
        {account.mustChange && <div className="inn-note is-warn"><span>{t('You are still using a password you did not choose. Choose your own below.')}</span></div>}
        {profile.credit && (profile.credit.limited || profile.credit.spent > 0 || profile.credit.paid !== 0) && <CreditTiles credit={profile.credit} />}
        {profile.usage && profile.usage.total > 0 && <UsageSection usage={profile.usage} />}
        <section>
          <h3>{t('At the tables')}</h3>
          <StatTiles stats={stats} />
          <p className="inn-actions">
            <button type="button" className="link danger" onClick={() => void clear('all', t('Reset all your numbers to zero and clear the hero list? This cannot be undone.'), t('Your stats were reset.'))}>{t('Reset all')}</button>
          </p>
        </section>
        <section>
          <h3>{t('Your heroes')}</h3>
          {heroes.length === 0 ? <p className="muted">{t('None yet. Sit down at a table and make one.')}</p> : (
            <table className="inn-table">
              <thead><tr><th>{t('Hero')}</th><th>{t('Table')}</th><th className="num">{t('Sessions')}</th><th className="num">{t('Play time')}</th><th className="num">{t('Kills')}</th><th className="num">{t('Crits')}</th><th className="num">{t('Deaths')}</th><th className="num">{t('Gold')}</th><th /></tr></thead>
              <tbody>
                {heroes.map((h) => (
                  <tr key={`${h.table}/${h.heroId}`}>
                    <td><b>{h.name}</b> <span className="muted small">{t(CLASSES[h.classId as ClassId]?.name ?? h.classId)} {h.level}</span></td>
                    <td>{h.tableTitle}</td>
                    <td className="num">{h.sessions}</td><td className="num">{playTime(t, h.playMs)}</td><td className="num">{h.kills}</td>
                    <td className="num">{h.crits}</td><td className="num">{h.deaths}</td><td className="num">{h.gold}</td>
                    <td className="inn-actions"><button type="button" className="link danger" aria-label={t('Remove hero entry')} title={t('Remove hero entry')} onClick={() => void clear('hero', t('Remove this hero from your list?'), t('The hero entry was removed.'), `${h.table}/${h.heroId}`)}>{t('Clear')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {heroes.length > 0 && <p className="inn-actions"><button type="button" className="link danger" onClick={() => void clear('heroes', t('Clear the hero list? The totals above stay.'), t('The hero entry was removed.'))}>{t('Clear hero list')}</button></p>}
          <p className="muted small">{t('Removing an entry only clears the list. The hero stays at the table.')} {t('Gold is what the party took in while the hero was in it. Play time counts while you sit at the table. Test mode does not count.')}</p>
        </section>
        {kept.length > 0 && (
          <section>
            <h3>{t('My heroes')}</h3>
            <table className="inn-table">
              <tbody>
                {kept.map((h) => (
                  <tr key={h.id}>
                    <td><b>{h.name}</b> <span className="muted small">{t(CLASSES[h.spec.classId]?.name ?? h.spec.classId)}</span></td>
                    <td className="inn-actions"><button type="button" className="link danger" onClick={async () => { if (await ask(t('Delete {name} from My heroes? Heroes already at a table keep playing.', { name: h.name }), { danger: true, ok: t('Delete') })) void deleteTemplate(h.id).catch(() => {}); }}>{t('Delete')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">{t('Heroes you keep on your account. Manage them in the Heroes tab of the main screen.')}</p>
          </section>
        )}
        <section>
          <h3>{t('Account name')}</h3>
          <form className="inn-form" onSubmit={rename}>
            <label>{t('New name')}<input value={name} maxLength={24} autoComplete="username" onChange={(e) => setName(e.target.value)} /></label>
            <button type="submit" disabled={name.trim().length < 3 || name.trim() === account.username}>{t('Change name')}</button>
          </form>
          {note && <p className={note.bad ? 'inn-error' : 'muted'} role="status">{note.text}</p>}
          <p className="muted small">{t('You sign in with the new name from now on. Your seats at the tables take it too.')}</p>
        </section>
        <section>
          <h3>{t('Password')}</h3>
          <form className="inn-form" onSubmit={change}>
            <label>{t('Current password')}<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
            <label>{t('New password')}<input type="password" autoComplete="new-password" minLength={PASSWORD_MIN} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
            <label>{t('New password, again')}<input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></label>
            <button type="submit" disabled={!pw.current || pw.next.length < PASSWORD_MIN || pw.next !== pw.again}>{t('Change password')}</button>
          </form>
          {msg && <p className={msg.bad ? 'inn-error' : 'muted'} role="status">{msg.text}</p>}
          <p className="muted small">{t('At least 8 characters. Changing it signs out every other browser.')}</p>
        </section>
      </div>
    </Window>
  );
}

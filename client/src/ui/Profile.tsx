// Your account: what you and each of your heroes have done at the tables, and your password.
import { useEffect, useState, type FormEvent } from 'react';
import { PASSWORD_MIN, type PlayStats, type Profile } from '../../../shared/accounts';
import { CLASSES } from '../../../shared/rules';
import type { ClassId } from '../../../shared/types';
import { accountCall } from '../account';
import { accountErrorText } from '../components/SignIn';
import { useLang, useT, type Translate } from '../i18n';
import { Window } from './Window';

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

export function ProfileWindow({ profile, onClose, onChanged }: { profile: Profile; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  // Fresh numbers whenever the window opens.
  useEffect(() => { onChanged(); }, []);
  const { account, stats, heroes } = profile;

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

  return (
    <Window title={account.username} icon="character" size="medium" className="profile" onClose={onClose}
      subtitle={<span className="muted">{account.role === 'innkeeper' ? t('Innkeeper') : t('Player')} · {t('Member since {when}', { when: new Date(account.createdAt).toLocaleDateString(lang) })}</span>}>
      <div className="inn-stack profile-body">
        {account.mustChange && <div className="inn-note is-warn"><span>{t('You are still using a password you did not choose. Choose your own below.')}</span></div>}
        <section>
          <h3>{t('At the tables')}</h3>
          <StatTiles stats={stats} />
        </section>
        <section>
          <h3>{t('Your heroes')}</h3>
          {heroes.length === 0 ? <p className="muted">{t('None yet. Sit down at a table and make one.')}</p> : (
            <table className="inn-table">
              <thead><tr><th>{t('Hero')}</th><th>{t('Table')}</th><th className="num">{t('Sessions')}</th><th className="num">{t('Play time')}</th><th className="num">{t('Kills')}</th><th className="num">{t('Crits')}</th><th className="num">{t('Deaths')}</th><th className="num">{t('Gold')}</th></tr></thead>
              <tbody>
                {heroes.map((h) => (
                  <tr key={`${h.table}/${h.heroId}`}>
                    <td><b>{h.name}</b> <span className="muted small">{t(CLASSES[h.classId as ClassId]?.name ?? h.classId)} {h.level}</span></td>
                    <td>{h.tableTitle}</td>
                    <td className="num">{h.sessions}</td><td className="num">{playTime(t, h.playMs)}</td><td className="num">{h.kills}</td>
                    <td className="num">{h.crits}</td><td className="num">{h.deaths}</td><td className="num">{h.gold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">{t('Gold is what the party took in while the hero was in it. Play time counts while you sit at the table. Test mode does not count.')}</p>
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

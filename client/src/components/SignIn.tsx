// The door of the tavern: sign in with your account, or make one with an invite link from the Innkeeper.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ACCOUNT_ERRORS, PASSWORD_MIN, cleanUsername, usernameOk, type AccountView } from '../../../shared/accounts';
import { AccountFail, accountCall } from '../account';
import { LangSwitch, useT, type Translate } from '../i18n';
import { MusicControl } from '../music';
import { Backdrop, Embers, Logo } from '../ui/Brand';
import '../accounts.css';

export const accountErrorText = (t: Translate, err: unknown) => {
  const code = err instanceof AccountFail ? err.code : 'failed';
  if (code === 'offline') return t('The server is not answering. It may be restarting.');
  return t(ACCOUNT_ERRORS[code as keyof typeof ACCOUNT_ERRORS] ?? ACCOUNT_ERRORS.failed);
};

function inviteCode(): string {
  return new URLSearchParams(location.search).get('invite') ?? '';
}

function dropInvite() {
  const url = new URL(location.href);
  url.searchParams.delete('invite');
  history.replaceState(null, '', url);
}

export function SignInScreen({ onSession }: { onSession: (session: string, remember: boolean) => Promise<void> }) {
  const t = useT();
  const code = useMemo(inviteCode, []);
  /** An invite link opens the form to make an account; null while the server checks the link. */
  const [invite, setInvite] = useState<'checking' | 'ok' | 'bad' | 'none'>(code ? 'checking' : 'none');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    accountCall(`/invite?code=${encodeURIComponent(code)}`).then(() => setInvite('ok')).catch(() => setInvite('bad'));
  }, [code]);

  const joining = invite === 'ok';
  const name = cleanUsername(username);
  const nameBad = joining && !!name && !usernameOk(name);
  const ready = !busy && !!name && (joining ? password.length >= PASSWORD_MIN && password === again && !nameBad : !!password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const out = joining
        ? await accountCall<{ session: string; account: AccountView }>('/join', { code, username: name, password, remember })
        : await accountCall<{ session: string; account: AccountView }>('/login', { username: name, password, remember });
      if (joining) dropInvite();
      await onSession(out.session, remember);
    } catch (err) {
      setError(accountErrorText(t, err));
      setBusy(false);
    }
  };

  return (
    <div className="splash tavern">
      <Backdrop />
      <Embers />
      <div className="splash-tools"><MusicControl /></div>
      <form className="panel join sign-in" onSubmit={submit}>
        <h1><Logo /></h1>
        <div className="rune-line" aria-hidden="true" />
        <div className="join-lang"><LangSwitch /></div>
        {joining ? (
          <p className="tagline">{t('You were invited to this tavern. Choose a name and a password for your account.')}</p>
        ) : (
          <p className="tagline">{t('Dungeons & Dragons at your own hearth, with an AI Dungeon Master.')}</p>
        )}
        {invite === 'bad' && <p className="notice error" role="alert">{t(ACCOUNT_ERRORS.bad_invite)}</p>}
        <label>{joining ? t('Your name') : t('Name')}
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24} autoFocus autoComplete="username" placeholder={t('Adventurer')} />
        </label>
        {nameBad && <small className="warn">{t(ACCOUNT_ERRORS.bad_name)}</small>}
        <label>{t('Password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={joining ? 'new-password' : 'current-password'} />
        </label>
        {joining && (
          <label>{t('Password, again')}
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>{t('Stay signed in on this device')}</span>
        </label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={!ready}>{joining ? t('Make my account') : t('Sign in')}</button>
        {joining
          ? <p className="muted small">{t('At least {n} characters. The others at the table see your name.', { n: PASSWORD_MIN })}</p>
          : <p className="muted small">{t('No account yet? Ask whoever runs this server for an invite link. Forgot your password? They can give you a new one.')}</p>}
        {invite === 'checking' && <p className="muted small">{t('Loading…')}</p>}
      </form>
    </div>
  );
}

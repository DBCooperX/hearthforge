// The story of one table as the Innkeeper sees it: what the Dungeon Master has set up behind the
// scenes (the premise, held-back secrets, planned events) next to what the party has found so far.
// What the party does not know yet stays folded away until the Innkeeper asks to see it.
import { useEffect, useState, type ReactNode } from 'react';
import type { AdminCampaign } from '../../../shared/admin';
import { useT } from '../i18n';
import { inn } from './innkeeperApi';
import { PHASE_LABELS } from './labels';

const Tag = ({ children, kind }: { children: ReactNode; kind?: 'warn' | 'good' }) => <span className={kind ? `inn-tag is-${kind}` : 'inn-tag'}>{children}</span>;

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className="camp-block"><h3>{title}{count !== undefined && <span className="muted"> · {count}</span>}</h3>{children}</section>;
}

export function Campaign({ id, onBack, onError }: { id: string; onBack: () => void; onError: (err: unknown) => void }) {
  const t = useT();
  const [c, setC] = useState<AdminCampaign | null>(null);
  const [spoilers, setSpoilers] = useState(false);
  useEffect(() => {
    const load = () => inn<AdminCampaign>(`/campaign?id=${encodeURIComponent(id)}`).then(setC).catch(onError);
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [id, onError]);
  if (!c) return <p className="muted">{t('Loading…')}</p>;

  const day = (n: number) => `${t('Day')} ${n}`;
  const status = { active: t('Ongoing'), completed: t('Completed'), failed: t('Failed') } as const;
  const found = c.places.filter((p) => p.discovered), unseen = c.places.length - found.length;
  const met = c.npcs.filter((n) => n.met), unmet = c.npcs.length - met.length;
  const held = c.secrets.filter((x) => x.revealedDay === null), told = c.secrets.filter((x) => x.revealedDay !== null);
  const events = c.timeline.filter((e) => spoilers || e.by === 'party' || (!e.planned && e.knownBy.trim() !== ''));
  const hiddenEvents = c.timeline.length - events.length;
  const premise = c.premiseId === 'custom' ? c.custom : c.premise;

  return (
    <div className="inn-stack camp">
      <header className="camp-head">
        <button type="button" onClick={onBack}>← {t('Back')}</button>
        <b>{c.title}</b>
        <Tag>{t(PHASE_LABELS[c.phase] ?? c.phase)}</Tag>
        {c.day > 0 && <Tag>{day(c.day)}</Tag>}
        <span className="spacer" />
        <label className="camp-spoil"><input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} /> {t('Show what the party does not know yet')}</label>
      </header>
      {c.phase === 'lobby' && <p className="muted">{t('The adventure has not started yet, so there is no story to show.')}</p>}

      {c.region && (
        <Block title={t('Setting')}>
          <p><b>{c.region}</b></p>
          {spoilers ? <p>{premise}</p> : <p className="muted">{t('What the Dungeon Master knows about the region is hidden.')}</p>}
        </Block>
      )}

      {c.chronicle && <Block title={t('The story so far')}><p className="camp-text">{c.chronicle}</p></Block>}

      <Block title={t('Quests')} count={c.quests.length}>
        {c.quests.length === 0 && <p className="muted">{t('None yet.')}</p>}
        <ul className="camp-list">
          {c.quests.map((q) => (
            <li key={q.id}>
              <b>{q.title}</b> <Tag kind={q.status === 'completed' ? 'good' : q.status === 'failed' ? 'warn' : undefined}>{status[q.status]}</Tag>
              <p>{q.summary}</p>
              {q.notes.length > 0 && <ul className="camp-notes">{q.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </li>
          ))}
        </ul>
      </Block>

      <Block title={t('Open questions of the story')} count={c.mysteries.length}>
        {c.mysteries.length === 0 && <p className="muted">{t('None yet.')}</p>}
        <ul className="camp-list">
          {c.mysteries.map((m) => (
            <li key={m.id}>
              <b>{m.question}</b> {m.solved && <Tag kind="good">{t('Solved')}</Tag>}
              {m.clues.length === 0 ? <p className="muted">{t('No clue found yet.')}</p> : (
                <ul className="camp-notes">{m.clues.map((cl, i) => <li key={i}>{cl.text} <span className="muted small">— {[cl.source, cl.place, day(cl.day)].filter(Boolean).join(', ')}</span></li>)}</ul>
              )}
            </li>
          ))}
        </ul>
      </Block>

      <Block title={t('Held-back secrets')} count={c.secrets.length}>
        {c.secrets.length === 0 && <p className="muted">{t('None yet.')}</p>}
        <ul className="camp-list">
          {told.map((x) => <li key={x.id}><Tag kind="good">{t('Revealed on {day}', { day: day(x.revealedDay ?? 0) })}</Tag> {x.text}</li>)}
          {held.map((x) => (
            <li key={x.id}>
              <Tag>{t('Still held back')}</Tag> {spoilers ? <>{x.text}<span className="muted small"> — {t('after: {what}', { what: x.after })}</span></> : <span className="muted">{t('Hidden')}</span>}
            </li>
          ))}
        </ul>
      </Block>

      <Block title={t('Settled facts')} count={c.facts.length}>
        {c.facts.length === 0 && <p className="muted">{t('None yet.')}</p>}
        <ul className="camp-list">
          {c.facts.map((f) => (
            <li key={f.id}>
              <b>{f.about}</b>{' '}
              {!f.truth ? <Tag kind="warn">{t('Not settled yet')}</Tag> : spoilers ? <>{f.truth}</> : <span className="muted">{t('Hidden')}</span>}
              {f.told.length > 0 && <ul className="camp-notes">{f.told.map((x, i) => <li key={i}><span className="muted small">{day(x.day)} · {x.who}:</span> {x.text}</li>)}</ul>}
            </li>
          ))}
        </ul>
      </Block>

      <Block title={t('People')} count={met.length}>
        {met.length === 0 && <p className="muted">{t('Nobody met yet.')}</p>}
        <ul className="camp-list tight">
          {met.map((n) => <li key={n.id}><b>{n.name}</b>, {n.role} <Tag>{t(n.disposition)}</Tag>{n.place && <span className="muted small"> · {n.place}</span>}{n.notes.length > 0 && <ul className="camp-notes">{n.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}</li>)}
        </ul>
        {unmet > 0 && (spoilers
          ? <ul className="camp-list tight muted">{c.npcs.filter((n) => !n.met).map((n) => <li key={n.id}>{n.name}, {n.role} <Tag>{t('not met')}</Tag></li>)}</ul>
          : <p className="muted small">{t('{n} more people are waiting out there.', { n: unmet })}</p>)}
      </Block>

      <Block title={t('Places')} count={found.length}>
        <ul className="camp-list tight">
          {found.map((p) => (
            <li key={p.id}><b>{p.name}</b> <span className="muted small">{t(p.kind)}</span> {p.visited ? <Tag kind="good">{t('visited')}</Tag> : <Tag>{t('known')}</Tag>}{p.total !== null && <span className="muted small"> · {t('{n} of {m} sections cleared', { n: p.cleared ?? 0, m: p.total })}</span>}</li>
          ))}
        </ul>
        {unseen > 0 && (spoilers
          ? <ul className="camp-list tight muted">{c.places.filter((p) => !p.discovered).map((p) => <li key={p.id}>{p.name} <span className="small">{t(p.kind)}</span> <Tag>{t('undiscovered')}</Tag></li>)}</ul>
          : <p className="muted small">{t('{n} more places are still undiscovered.', { n: unseen })}</p>)}
      </Block>

      <Block title={t('Timeline')} count={events.length}>
        {events.length === 0 && <p className="muted">{t('Nothing has been noted yet.')}</p>}
        <ul className="camp-list tight">
          {events.map((e) => (
            <li key={e.id}><span className="muted small">{e.day < 1 ? t('Before the adventure') : day(e.day)}</span> {e.planned && <Tag>{t('planned')}</Tag>} {e.what}{e.where && <span className="muted small"> · {e.where}</span>}{spoilers && e.knownBy && <span className="muted small"> · {t('known by: {who}', { who: e.knownBy })}</span>}</li>
          ))}
        </ul>
        {hiddenEvents > 0 && <p className="muted small">{t('{n} events the party does not know about are hidden.', { n: hiddenEvents })}</p>}
      </Block>

      {c.factions.length > 0 && (
        <Block title={t('Factions')}>
          <ul className="camp-list tight">{c.factions.map((f) => <li key={f.id}><b>{f.name}</b> <span className="muted small">{f.standing > 0 ? '+' : ''}{f.standing}</span></li>)}</ul>
        </Block>
      )}

      {c.rumours.length > 0 && (
        <Block title={t('Rumours')} count={c.rumours.length}>
          <ul className="camp-list tight">{c.rumours.map((r, i) => <li key={i}>{r.text} <span className="muted small">{r.heardDay === null ? t('not heard yet') : t('heard on {day}', { day: day(r.heardDay) })}{r.from && ` · ${r.from}`}</span></li>)}</ul>
        </Block>
      )}

      <Block title={t('Journal')} count={c.journal.length}>
        {c.journal.length === 0 && <p className="muted">{t('Nothing has been noted yet.')}</p>}
        <ul className="camp-list tight">{c.journal.slice(-40).reverse().map((j, i) => <li key={i}><span className="muted small">{day(j.day)}</span> {j.text}</li>)}</ul>
      </Block>
    </div>
  );
}

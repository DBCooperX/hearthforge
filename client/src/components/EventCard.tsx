// A story event (loot, travel, a quest, a rest …) as a framed card with an icon, so it is not lost between the long paragraphs.
import type { ReactNode } from 'react';
import type { GameState, LogEntry, StoryEventType } from '../../../shared/types';
import { ItemIcon } from '../ui/ItemIcon';
import { useT } from '../i18n';

const S = ({ children }: { children: ReactNode }) => (
  <svg className="ev-svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** Line icons for each kind of event, drawn here so they look the same on every system. */
const ICONS: Record<StoryEventType, ReactNode> = {
  item: <><path d="M5 9.5h14v10a1.500 1.500 0 0 1-1.500 1.500h-11A1.500 1.500 0 0 1 5 19.500Z" /><path d="M4 6.500h16v3H4Z" /><path d="M12 6.500V21M12 6.500c-1-3.500-5-3.500-5-1.500 0 1.200 2 1.500 5 1.500Zm0 0c1-3.500 5-3.500 5-1.500 0 1.200-2 1.500-5 1.500Z" /></>,
  gold: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.700 3.100 3 7 3s7-1.300 7-3V7M5 12v5c0 1.700 3.100 3 7 3s7-1.300 7-3v-5" /></>,
  // A road running into the distance.
  travel: <><path d="M9 3.500 4.500 20.500M15 3.500l4.500 17" /><path d="M12 5v2.500M12 10.500V13M12 16.500V20" /></>,
  place: <><path d="M12 21s6.500-6.200 6.500-11A6.500 6.500 0 0 0 5.500 10c0 4.800 6.500 11 6.500 11Z" /><circle cx="12" cy="10" r="2.300" /></>,
  quest: <><path d="M6.500 3.500h9l3 3v14h-12Z" /><path d="M15.500 3.500v3h3M9.500 11h5M9.500 14.500h5" /></>,
  'quest-done': <><path d="M6.500 3.500h9l3 3v14h-12Z" /><path d="M15.500 3.500v3h3" /><path d="m9.500 13.500 2 2 3.500-4" /></>,
  'quest-failed': <><path d="M6.500 3.500h9l3 3v14h-12Z" /><path d="M15.500 3.500v3h3" /><path d="m9.800 11.300 4.400 4.400M14.200 11.300l-4.400 4.400" /></>,
  clue: <><circle cx="10.500" cy="10.500" r="6" /><path d="m15 15 5.500 5.500" /><path d="M10.500 8v3.200M10.500 13v.1" /></>,
  rest: <><path d="M12 3.500c1 3-3 4.500-3 8a3.200 3.200 0 0 0 6.400.300c1.200 1.100 1.600 2.200 1.600 3.200a5 5 0 0 1-10 0c0-5 5-6 5-11.500Z" /><path d="M5 21h14" /></>,
  xp: <path d="M12 3.500 14.600 9l6 .700-4.500 4.100 1.300 5.900L12 16.700l-5.400 3 1.300-5.900L3.400 9.700l6-.700Z" />,
  shop: <><path d="M4 9.500 5.500 4h13L20 9.500c0 1.400-1.100 2.500-2.500 2.500S15 10.900 15 9.500c0 1.400-1.100 2.500-3 2.500S9 10.900 9 9.500C9 10.900 7.900 12 6.500 12S4 10.900 4 9.500Z" /><path d="M5.500 12v8.500h13V12M10 20.500v-4.500h4v4.500" /></>,
  companion: <><circle cx="8.500" cy="8" r="2.800" /><circle cx="16.500" cy="9" r="2.300" /><path d="M3 19c.4-3.300 2.600-5.200 5.500-5.200s5.100 1.900 5.500 5.200M15 14.200c2.800-.3 5.200 1.300 5.800 4.800" /></>,
  trophy: <><path d="M7.500 4h9v5.500a4.500 4.500 0 0 1-9 0Z" /><path d="M7.500 6H4.500c0 3 1.200 4.500 3.300 4.800M16.500 6h3c0 3-1.200 4.500-3.300 4.800M12 14v4M8.500 20.500h7M9.500 18h5" /></>,
  standing: <><path d="M5 21V4M5 5h12l-2.500 3.500L17 12H5" /></>,
  victory: <><path d="m14.500 3.500 6 0 0 6-9.500 9.500-2.800-2.800Z" transform="translate(-1 0)" /><path d="m6.500 13.500 4 4M5 19l2.500-2.500M3.800 16.200l4 4" /></>,
  defeat: <><path d="M12 3.500c-4 0-6.500 2.700-6.500 6.200 0 2 .9 3.400 2 4.300V17h9v-3c1.100-.9 2-2.300 2-4.300 0-3.500-2.500-6.200-6.500-6.200Z" /><path d="M9.500 20.500v-3.500M14.500 20.500v-3.500M9.500 10.500h.1M14.500 10.500h.1" /></>,
  ambush: <><path d="M12 3.500 21 20H3Z" /><path d="M12 10v4.500M12 17.200v.1" /></>,
};

/** The colour family of each card: gains are warm, trouble is red, travel and places are cool. */
const TONE: Record<StoryEventType, string> = {
  item: 'gain', gold: 'gold', travel: 'road', place: 'road', quest: 'quest', 'quest-done': 'win', 'quest-failed': 'bad', clue: 'quest',
  rest: 'calm', xp: 'gold', shop: 'gold', companion: 'calm', trophy: 'gold', standing: 'quest', victory: 'win', defeat: 'bad', ambush: 'bad',
};

export function EventCard({ entry, items, animate }: { entry: LogEntry; items: GameState['items']; animate: boolean }) {
  const t = useT();
  const ev = entry.event!;
  const title: Record<StoryEventType, string> = {
    item: t('Item found'), gold: (ev.amount ?? 1) < 0 ? t('Gold spent') : t('Gold gained'), travel: t('Travel'), place: t('New place'), quest: t('New quest'),
    'quest-done': t('Quest completed'), 'quest-failed': t('Quest failed'), clue: t('New clue'), rest: t('Rest'), xp: t('Experience'), shop: t('Trade'),
    companion: t('Companion'), trophy: t('Trophy'), standing: t('Standing'), victory: t('Victory'), defeat: t('Defeat'), ambush: t('Ambush!'),
  };
  const def = ev.itemId ? items[ev.itemId] : undefined;
  return (
    <aside className={`event ev-${TONE[ev.type]} ev-${ev.type} ${animate ? 'enter' : ''}`}>
      <span className="ev-icon">{ev.type === 'item' && def ? <ItemIcon def={def} /> : ICONS[ev.type] ? <S>{ICONS[ev.type]}</S> : null}</span>
      <div className="ev-body"><b>{title[ev.type]}</b><span>{entry.text}</span></div>
    </aside>
  );
}

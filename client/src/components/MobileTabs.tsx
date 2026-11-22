// Phones and tablets held upright show the game one pane at a time: the story (or the battle), the party and
// the place the party is in. This tab bar along the bottom switches between them; on wider screens it is hidden
// and everything sits side by side as before.
import { useT } from '../i18n';
import { Icon, type IconName } from '../ui/icons';

export type Pane = 'story' | 'fight' | 'party' | 'place';

interface Props {
  pane: Pane;
  /** A battle is on (or its closing screen): the battle takes the place of the place. */
  fighting: boolean;
  /** Something new was written in the story while another pane was open. */
  storyNew: boolean;
  onPane: (pane: Pane) => void;
}

export function MobileTabs({ pane, fighting, storyNew, onPane }: Props) {
  const t = useT();
  const tabs: { id: Pane; icon: IconName; label: string; className?: string }[] = fighting
    ? [
        { id: 'fight', icon: 'sword', label: t('Fight') },
        // On a tablet the story sits under the battle already, so only phones need this tab.
        { id: 'story', icon: 'lore', label: t('Story'), className: 'phone-only' },
        { id: 'party', icon: 'table', label: t('Party') },
      ]
    : [
        { id: 'story', icon: 'lore', label: t('Story') },
        { id: 'party', icon: 'table', label: t('Party') },
        { id: 'place', icon: 'places', label: t('Place') },
      ];
  return (
    <nav className="mobile-tabs" role="tablist" aria-label={t('Windows')}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={pane === tab.id}
          className={['mtab', pane === tab.id && 'on', tab.className].filter(Boolean).join(' ')}
          onClick={() => onPane(tab.id)}>
          <span className="mtab-icon"><Icon name={tab.icon} size={22} />{tab.id === 'story' && storyNew && pane !== 'story' && <span className="mtab-dot" />}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

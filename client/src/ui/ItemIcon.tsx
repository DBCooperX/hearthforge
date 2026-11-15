// The picture of an item: from the icon pack in use, or the item's emoji.
import type { ItemDef } from '../../../shared/types';
import { useItemArt } from '../game/itemArt';

export function ItemIcon({ def }: { def: Pick<ItemDef, 'id' | 'icon'> | undefined }) {
  const url = useItemArt()(def);
  if (!def) return null;
  return url ? <img className={url.startsWith('data:') || url.endsWith('.png') ? 'item-art pixel' : 'item-art'} src={url} alt="" draggable={false} /> : <>{def.icon}</>;
}

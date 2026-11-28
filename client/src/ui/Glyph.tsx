// Pictures for skills, feats, spells and class features, from the server's own painted icons
// has installed (see shared/glyphs.ts). Where there is no picture, because the set is not
// installed or another icon pack is in use, the entry keeps its emoji.
import type { ReactNode } from 'react';
import { glyphKeys, featureLineKeys } from '../../../shared/glyphs';
import type { AbilityDef } from '../../../shared/types';
import { glyphUrl, useItemArt } from '../game/itemArt';

/** A picture for the first of `keys` that has one, or `emoji`. */
export function Glyph({ keys, emoji }: { keys: string[]; emoji?: ReactNode }) {
  useItemArt();
  const url = glyphUrl(keys);
  return url ? <img className="item-art glyph" src={url} alt="" draggable={false} /> : <>{emoji ?? '✦'}</>;
}

/** A spell, or an action of a class (hex and divine smite are both). */
export function AbilityGlyph({ def }: { def: Pick<AbilityDef, 'id' | 'icon' | 'spellLevel' | 'school'> }) {
  return <Glyph keys={glyphKeys('spell', def.id, def.school)} emoji={def.icon} />;
}

export const SkillGlyph = ({ skill }: { skill: string }) => <Glyph keys={glyphKeys('skill', skill)} emoji="🎯" />;
export const FeatureGlyph = ({ id, via, emoji }: { id: string; via?: string; emoji?: ReactNode }) => <Glyph keys={glyphKeys('feature', id, via)} emoji={emoji} />;
/** A line of the features list of a character sheet. */
export const LineGlyph = ({ line }: { line: string }) => <Glyph keys={featureLineKeys(line)} emoji="✦" />;

/** A feat, class option or fighting style card. Classes, species and backgrounds have no picture and keep their emoji. */
export function OptionGlyph({ option }: { option: { id: string; icon: ReactNode } }) {
  return <Glyph keys={[`feat:${option.id}`, `feature:${option.id}`, `feature:style_${option.id}`]} emoji={option.icon} />;
}

/** A kind of place (tavern, temple, cave…). */
export const PlaceGlyph = ({ kind, emoji }: { kind: string; emoji?: ReactNode }) => <span className="ui-glyph" aria-hidden><Glyph keys={[`place:${kind}`]} emoji={emoji} /></span>;
/** A kind of merchant. */
export const ShopGlyph = ({ kind, emoji }: { kind: string; emoji?: ReactNode }) => <span className="ui-glyph" aria-hidden><Glyph keys={[`shop:${kind}`]} emoji={emoji} /></span>;
/** Rests, gold, level up, inspiration and the marks of a fight, drawn like the hotbar. */
export const UiGlyph = ({ id, emoji }: { id: string; emoji?: ReactNode }) => <span className="ui-glyph" aria-hidden><Glyph keys={[id.includes(':') ? id : `ui:${id}`]} emoji={emoji} /></span>;

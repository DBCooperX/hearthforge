// What sits on each token in a fight: conditions, spell effects, marks and concentration, with
// how long each lasts. The battle map shows them as small icons over the token.
import { ABILITIES } from '../../../shared/content';
import { CONDITION_HELP, type HeroEffect } from '../../../shared/conditions';
import { SPELL_BUFFS, SPELL_CONDITIONS } from '../../../shared/spells';
import { glyphKeys } from '../../../shared/glyphs';
import type { Lang } from '../../../shared/i18n';
import type { Character, GameState, MonsterView } from '../../../shared/types';
import { conditionHelp } from './util';

export type StatusTone = 'good' | 'bad' | 'mark' | 'focus';

export interface TokenStatus {
  key: string;
  /** Icon keys, most specific first, and the emoji when no icon is installed. */
  glyph: string[];
  emoji: string;
  name: string;
  /** What it does. */
  text: string;
  /** How it ends. */
  ends: string;
  /** Turns left, when the engine counts them. */
  badge?: number;
  tone: StatusTone;
}

type T = (text: string, vars?: Record<string, string | number>) => string;

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Toggled class powers that show as a condition chip on the hero. */
const POWERS: Record<string, string> = {
  raging: 'feature:rage', 'sacred weapon': 'feature:sacred_weapon', 'innate sorcery': 'feature:innate_sorcery',
  'superior defense': 'feature:superior_defense', 'holy nimbus': 'feature:holy_nimbus', invisible: 'spell:invisibility',
  reckless: 'condition:reckless', dodging: 'condition:dodging',
};

/** Conditions monsters get from heroes' features rather than spells. */
const MONSTER_HELP: Record<string, string> = {
  turned: 'It flees from the cleric and loses its turns.',
  rattled: 'Its next attack has disadvantage.',
  guided: 'The next attack against it has advantage.',
  stunned: 'It loses its turns. Attacks against it have advantage.',
  incapacitated: 'It loses its turns.',
  prone: 'Melee attacks against it have advantage.',
};

const ABIL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

function heroEffectEnds(e: HeroEffect, state: GameState, t: T): string {
  const source = e.sourceId ? state.monsters.find((m) => m.id === e.sourceId)?.name ?? e.source ?? '' : e.source ?? '';
  switch (e.ends) {
    case 'save_end': return e.save ? t('A {ability} save at the end of each turn ends it (DC {dc}).', { ability: t(ABIL[e.save.ability]), dc: e.save.dc }) : t('A save at the end of each turn ends it.');
    case 'target_end': return t('Until the end of the next turn.');
    case 'target_start': return t('Until the start of the next turn.');
    case 'source_start': return source ? t('Until the start of the turn of {name}.', { name: source }) : t('Until the start of the next turn.');
    case 'source_end': return source ? t('Until the end of the turn of {name}.', { name: source }) : t('Until the end of the next turn.');
    case 'escape': return e.escapeDc ? t('Until you break free (DC {dc}).', { dc: e.escapeDc }) : t('Until you break free.');
    case 'minute': return t('For one minute.');
    case 'combat': return t('Until the fight ends.');
    default: return '';
  }
}

const BUFF_ENDS: Record<string, string> = {
  turn: 'Until your next turn.', fight: 'Until the fight ends.', rest: 'Until the next rest.', long: 'Until the next long rest.',
};

/** Everything showing on a hero's token. */
export function heroStatuses(c: Character, state: GameState, t: T, lang: Lang): TokenStatus[] {
  const out: TokenStatus[] = [];
  const name = (id: string) => state.characters.find((x) => x.id === id)?.name ?? state.monsters.find((x) => x.id === id)?.name ?? '';
  const done = new Set<string>();
  for (const b of c.buffs ?? []) {
    const def = SPELL_BUFFS[b.id];
    if (!def || def.instant || done.has(def.chip)) continue;
    done.add(def.chip);
    const ab = ABILITIES[b.spell] ?? ABILITIES[b.id];
    const by = b.by && b.by !== c.id ? name(b.by) : '';
    out.push({
      key: `buff:${b.id}`, glyph: glyphKeys('spell', b.spell || b.id, ab?.school), emoji: ab?.icon ?? '✨',
      name: lang === 'de' ? def.de : def.chip, text: def.text[lang] ?? def.text.en,
      ends: [by ? t('Cast by {name}.', { name: by }) : '', t(BUFF_ENDS[def.lasts] ?? '')].filter(Boolean).join(' '),
      badge: def.lasts === 'turn' ? 1 : undefined, tone: 'good',
    });
  }
  for (const x of c.conditions) {
    if (done.has(x)) continue;
    done.add(x);
    const e = c.effects?.find((f) => f.condition === x || f.also === x);
    const power = POWERS[x];
    out.push({
      key: `cond:${x}`, glyph: power ? [power, `condition:${x}`] : [`condition:${x}`], emoji: power ? '✦' : '⚠️',
      name: cap(t(x)), text: conditionHelp(x, t) ?? '',
      ends: e ? heroEffectEnds(e, state, t) : x === 'dodging' || x === 'reckless' ? t('Until your next turn.') : power ? t('Until the fight ends.') : '',
      badge: e?.rounds, tone: power ? 'good' : x in CONDITION_HELP ? 'bad' : 'good',
    });
  }
  if (c.conc && ABILITIES[c.conc.spell]) {
    out.push({
      key: 'conc', glyph: ['condition:concentration'], emoji: '🔮', name: t('Concentration'),
      text: t('Concentrating on {spell}. Taking damage can break it, and casting another concentration spell ends it.', { spell: t(ABILITIES[c.conc.spell].name) }),
      ends: '', tone: 'focus',
    });
  }
  if (c.inspired) {
    out.push({
      key: 'inspired', glyph: ['feature:bardic_inspiration'], emoji: '🎵', name: t('Bardic Inspiration'),
      text: t('A d{n} to add to one attack roll, check or save.', { n: c.inspired }), ends: t('Until it is used.'), tone: 'good',
    });
  }
  return out;
}

/** Everything showing on a monster's token, including the marks heroes have put on it. */
export function monsterStatuses(m: MonsterView, state: GameState, t: T, lang: Lang): TokenStatus[] {
  const out: TokenStatus[] = [];
  const hero = (id?: string) => (id ? state.characters.find((c) => c.id === id)?.name ?? '' : '');
  for (const c of state.characters) {
    if (c.mark?.monsterId !== m.id || c.dead) continue;
    const ab = ABILITIES[c.mark.spell];
    out.push({
      key: `mark:${c.id}`, glyph: ['condition:marked', ...glyphKeys('spell', c.mark.spell, ab?.school)], emoji: '🎯',
      name: ab ? t(ab.name) : t('Marked'),
      text: c.mark.spell === 'hex'
        ? t('Marked by {name}: their hits on it deal 1d6 extra necrotic damage.', { name: c.name })
        : t('Marked by {name}: their weapon hits on it deal 1d6 extra damage.', { name: c.name }),
      ends: t('Until the fight ends.'), tone: 'mark',
    });
  }
  const shown = new Set<string>();
  for (const e of m.effects ?? []) {
    if (shown.has(e.condition)) continue;
    shown.add(e.condition);
    const spell = e.spell ? ABILITIES[e.spell] : undefined;
    const ends = [
      e.turns ? (e.turns === 1 ? t('Lasts 1 more turn.') : t('Lasts {n} more turns.', { n: e.turns })) : '',
      e.save ? t('A {ability} save at the end of each of its turns ends it (DC {dc}).', { ability: t(ABIL[e.save.ability]), dc: e.save.dc }) : '',
      e.untilHero ? t('Until the start of the turn of {name}.', { name: hero(e.untilHero) }) : '',
      e.onHurt ? t('Ends when it takes damage.') : '',
      e.by && spell ? t('As long as {name} concentrates on {spell}.', { name: hero(e.by), spell: t(spell.name) }) : '',
    ].filter(Boolean).join(' ');
    out.push(monsterCondition(e.condition, t, lang, ends, e.turns, spell ? glyphKeys('spell', spell.id, spell.school) : []));
  }
  for (const x of m.conditions) if (!shown.has(x)) { shown.add(x); out.push(monsterCondition(x, t, lang, '', undefined, [])); }
  return out;
}

function monsterCondition(x: string, t: T, lang: Lang, ends: string, turns: number | undefined, extra: string[]): TokenStatus {
  const sc = SPELL_CONDITIONS[x];
  const text = MONSTER_HELP[x] ? t(MONSTER_HELP[x]) : sc ? `${cap(sc.text[lang] ?? sc.text.en)}.` : conditionHelp(x, t) ?? '';
  return {
    key: `cond:${x}`, glyph: [`condition:${x}`, ...extra], emoji: '⚠️', name: cap(lang === 'de' && sc ? sc.de : t(x)), text, ends, badge: turns,
    tone: x === 'guided' || x === 'outlined' ? 'mark' : 'bad',
  };
}

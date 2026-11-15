// The spells of the System Reference Document 5.2.1 (CC BY 4.0) as the game plays them.
// Numbers come from shared/srd/spells.json, what each spell does from shared/spellTable.ts.
// This file reads both into abilities, class spell lists, and the German dictionary.
import type { AbilityDef, AbilityKey, ClassId } from './types';
import { SLOT_COST } from './classes';
import { SPELL_ROWS } from './spellTable';
import raw from './srd/spells.json';

interface SrdSpell {
  id: string; name: string; level: number; school: string; classes: string[];
  time: 'action' | 'bonus' | 'reaction' | 'long'; range: number; self?: boolean;
  conc?: boolean; ritual?: boolean; duration: string; type?: string; dice?: Record<string, string>;
}
export const SRD_SPELLS = raw as unknown as Record<string, SrdSpell>;

type L2 = { en: string; de: string };

// --------------------------------------------------------------------- buffs

/** What a spell does to the hero it lies on. The chip is the name shown beside the conditions. */
export interface SpellBuff {
  chip: string;
  de: string;
  text: L2;
  /** turn: until the hero's next turn. fight: until the fight ends. rest: until any rest. long: until a long rest. */
  lasts: 'turn' | 'fight' | 'rest' | 'long';
  /** Nothing stays: temporary hit points, and that is all. */
  instant?: boolean;
  ac?: number;
  acMin?: number;
  /** Added to attack rolls and saving throws. */
  roll?: string;
  /** Added to the next ability check, which uses it up. */
  check?: string;
  /** Taken off the first damage of each round. */
  soak?: string;
  saveAdv?: AbilityKey[] | 'all';
  attackAdv?: boolean;
  /** Attacks against the hero have disadvantage. */
  blur?: boolean;
  images?: number;
  speed?: number;
  speedMul?: number;
  resist?: string[];
  /** Resists the first of these damage types that strikes. */
  adapt?: string[];
  /** Extra damage on weapon hits, and more dice per spell level above its own. */
  hit?: { dice: string; type: string; up?: string };
  /** Bonus to weapon attack and damage rolls, by spell level. */
  weapon?: Record<number, number>;
  invisible?: 'fragile' | 'lasting';
  extraAttack?: boolean;
  /** Temporary hit points when cast, and how many more per spell level. */
  temp?: string;
  tempUp?: number;
  /** Temporary hit points equal to the caster's modifier at the start of every turn. */
  tempTurn?: boolean;
  /** More maximum hit points: a number per spell level from 2, or dice. */
  maxHp?: number | string;
  deathWard?: boolean;
  darkvision?: number;
  light?: boolean;
  /** Damage to whoever hits the hero from next to them. */
  thorns?: { dice: string; type: string };
  /** Creature types whose attacks against the hero have disadvantage. */
  wardTypes?: string[];
  immune?: string[];
  /** Melee weapon attacks use the casting ability. */
  shillelagh?: boolean;
}

const B = (chip: string, de: string, lasts: SpellBuff['lasts'], en: string, deText: string, more: Partial<SpellBuff> = {}): SpellBuff => ({ chip, de, lasts, text: { en, de: deText }, ...more });

export const SPELL_BUFFS: Record<string, SpellBuff> = {
  light: B('magic light', 'magisches Licht', 'rest', 'Sheds bright light like a torch, until you rest.', 'Spendet helles Licht wie eine Fackel, bis du rastest.', { light: true }),
  guidance: B('guidance', 'Göttliche Führung', 'rest', 'Adds 1d4 to the next ability check.', 'Addiert 1W4 auf den nächsten Attributswurf.', { check: '1d4' }),
  resistance: B('resistance', 'Resistenz', 'fight', 'The first damage taken each round is reduced by 1d4.', 'Der erste Schaden jeder Runde wird um 1W4 verringert.', { soak: '1d4' }),
  shillelagh: B('shillelagh', 'Shillelagh', 'fight', 'Melee weapon attacks use your spellcasting ability instead of Strength.', 'Nahkampfangriffe mit Waffen nutzen dein Zauberattribut statt Stärke.', { shillelagh: true }),
  bless: B('blessed', 'gesegnet', 'fight', 'Adds 1d4 to attack rolls and saving throws.', 'Addiert 1W4 auf Angriffs- und Rettungswürfe.', { roll: '1d4' }),
  divine_favor: B('divine favor', 'Göttliche Gunst', 'fight', 'Weapon hits deal 1d4 extra radiant damage.', 'Waffentreffer verursachen 1W4 zusätzlichen gleißenden Schaden.', { hit: { dice: '1d4', type: 'radiant' } }),
  expeditious_retreat: B('fleet', 'flink', 'fight', 'Twice the movement each turn.', 'Doppelte Bewegung in jedem Zug.', { speedMul: 2 }),
  false_life: B('false life', 'Falsches Leben', 'fight', 'Grants 2d4 + 4 temporary hit points, 5 more per spell level above the first.', 'Gewährt 2W4 + 4 temporäre Trefferpunkte, 5 mehr je Zaubergrad über dem ersten.', { instant: true, temp: '2d4+4', tempUp: 5 }),
  heroism: B('heroic', 'heldenmütig', 'fight', 'Cannot be frightened and gains temporary hit points equal to the caster\'s spellcasting modifier at the start of every turn.', 'Kann nicht verängstigt werden und erhält zu Beginn jedes Zuges temporäre Trefferpunkte in Höhe des Zaubermodifikators des Wirkenden.', { tempTurn: true, immune: ['frightened'] }),
  longstrider: B('long strides', 'lange Schritte', 'rest', 'Speed +10 ft until you rest.', 'Bewegungsrate +10 ft bis zur nächsten Rast.', { speed: 10 }),
  mage_armor: B('mage armor', 'Magierrüstung', 'long', 'Without armor the armor class is 13 + DEX. Lasts until the next long rest.', 'Ohne Rüstung beträgt die Rüstungsklasse 13 + GES. Hält bis zur nächsten langen Rast.'),
  protection: B('protected', 'beschützt', 'fight', 'Aberrations, celestials, elementals, fey, fiends and undead have disadvantage on attacks against the hero.', 'Aberrationen, Himmlische, Elementare, Feen, Unholde und Untote sind bei Angriffen gegen den Helden im Nachteil.', { wardTypes: ['aberration', 'celestial', 'elemental', 'fey', 'fiend', 'undead'] }),
  shield: B('shield spell', 'Schildzauber', 'turn', '+5 armor class until your next turn.', '+5 Rüstungsklasse bis zu deinem nächsten Zug.', { ac: 5 }),
  shield_of_faith: B('shield of faith', 'Schild des Glaubens', 'fight', '+2 armor class.', '+2 Rüstungsklasse.', { ac: 2 }),
  aid: B('bolstered', 'gestärkt', 'long', 'Maximum and current hit points rise by 5, and by 5 more per spell level above the second. Lasts until the next long rest.', 'Maximale und aktuelle Trefferpunkte steigen um 5 und um weitere 5 je Zaubergrad über dem zweiten. Hält bis zur nächsten langen Rast.', { maxHp: 5 }),
  barkskin: B('barkskin', 'Rindenhaut', 'rest', 'Armor class is at least 17, until you rest.', 'Die Rüstungsklasse beträgt mindestens 17, bis du rastest.', { acMin: 17 }),
  blur: B('blurred', 'verschwommen', 'fight', 'Attacks against the hero have disadvantage.', 'Angriffe gegen den Helden sind im Nachteil.', { blur: true }),
  darkvision: B('darkvision', 'Dunkelsicht', 'long', 'Sees in the dark out to 150 ft until the next long rest.', 'Sieht bis zur nächsten langen Rast 150 ft weit im Dunkeln.', { darkvision: 150 }),
  enlarge: B('enlarged', 'vergrößert', 'fight', 'Weapon hits deal 1d4 extra damage.', 'Waffentreffer verursachen 1W4 zusätzlichen Schaden.', { hit: { dice: '1d4', type: 'weapon' } }),
  invisibility: B('invisible', 'unsichtbar', 'fight', 'Cannot be seen: own attacks have advantage, attacks against the hero have disadvantage. Ends when the hero attacks or casts a spell.', 'Nicht zu sehen: Eigene Angriffe sind im Vorteil, Angriffe gegen den Helden im Nachteil. Endet, wenn der Held angreift oder zaubert.', { invisible: 'fragile' }),
  greater_invisibility: B('invisible', 'unsichtbar', 'fight', 'Cannot be seen, even while attacking: own attacks have advantage, attacks against the hero have disadvantage.', 'Nicht zu sehen, auch beim Angreifen: Eigene Angriffe sind im Vorteil, Angriffe gegen den Helden im Nachteil.', { invisible: 'lasting' }),
  magic_weapon: B('magic weapon', 'magische Waffe', 'rest', '+1 to weapon attack and damage rolls, +2 from spell level 3 and +3 from level 6. Lasts until you rest.', '+1 auf Angriffs- und Schadenswürfe mit Waffen, +2 ab Zaubergrad 3 und +3 ab Grad 6. Hält bis zur nächsten Rast.', { weapon: { 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 3 } }),
  mirror_image: B('mirror images', 'Spiegelbilder', 'fight', 'Three illusory doubles. An attack that would hit strikes a double instead when a d6 per double shows 3 or more, and destroys it.', 'Drei illusionäre Doppelgänger. Ein Angriff, der treffen würde, trifft stattdessen ein Spiegelbild, wenn ein W6 je Spiegelbild 3 oder mehr zeigt, und zerstört es.', { images: 3 }),
  haste: B('hasted', 'beschleunigt', 'fight', '+2 armor class, twice the movement, advantage on Dexterity saves and one more weapon attack each turn.', '+2 Rüstungsklasse, doppelte Bewegung, Vorteil bei Geschicklichkeitsrettungswürfen und ein zusätzlicher Waffenangriff pro Zug.', { ac: 2, speedMul: 2, saveAdv: ['dex'], extraAttack: true }),
  protection_from_energy: B('energy ward', 'Energieschutz', 'fight', 'Resists the first of acid, cold, fire, lightning or thunder that strikes.', 'Resistenz gegen die erste Schadensart aus Säure, Kälte, Feuer, Blitz oder Schall, die trifft.', { adapt: ['acid', 'cold', 'fire', 'lightning', 'thunder'] }),
  death_ward: B('death ward', 'Todesschutz', 'long', 'The first time the hero would drop to 0 hit points, they stay at 1 instead. Lasts until the next long rest.', 'Wenn der Held das erste Mal auf 0 Trefferpunkte fallen würde, bleibt er stattdessen bei 1. Hält bis zur nächsten langen Rast.', { deathWard: true }),
  fire_shield: B('fire shield', 'Feuerschild', 'fight', 'Resists cold damage, and whoever hits the hero from next to them takes 2d8 fire damage.', 'Resistenz gegen Kälteschaden, und wer den Helden aus nächster Nähe trifft, erleidet 2W8 Feuerschaden.', { resist: ['cold'], thorns: { dice: '2d8', type: 'fire' } }),
  freedom: B('unbound', 'ungebunden', 'rest', 'Cannot be grappled, restrained or paralyzed, until you rest.', 'Kann nicht gepackt, festgesetzt oder gelähmt werden, bis du rastest.', { immune: ['grappled', 'restrained', 'paralyzed'] }),
  stoneskin: B('stoneskin', 'Steinhaut', 'fight', 'Resists bludgeoning, piercing and slashing damage.', 'Resistenz gegen Wucht-, Stich- und Hiebschaden.', { resist: ['bludgeoning', 'piercing', 'slashing'] }),
  minor_elementals: B('elemental spirits', 'Elementargeister', 'fight', 'Your attacks that hit deal 2d8 extra lightning damage, and 1d8 more per spell level above the fourth.', 'Deine Angriffe, die treffen, verursachen 2W8 zusätzlichen Blitzschaden und 1W8 mehr je Zaubergrad über dem vierten.', { hit: { dice: '2d8', type: 'lightning', up: '1d8' } }),
  heroes_feast: B('feasted', 'gestärkt vom Festmahl', 'long', 'Maximum and current hit points rise by 2d10; cannot be frightened or poisoned and resists poison. Lasts until the next long rest.', 'Maximale und aktuelle Trefferpunkte steigen um 2W10; kann nicht verängstigt oder vergiftet werden und ist gegen Gift resistent. Hält bis zur nächsten langen Rast.', { maxHp: '2d10', immune: ['frightened', 'poisoned'], resist: ['poison'] }),
  holy_aura: B('holy aura', 'Heilige Aura', 'fight', 'Advantage on all saving throws, and attacks against the hero have disadvantage.', 'Vorteil bei allen Rettungswürfen, und Angriffe gegen den Helden sind im Nachteil.', { saveAdv: 'all', blur: true }),
  foresight: B('foresight', 'Voraussicht', 'long', 'Advantage on attack rolls and saving throws, and attacks against the hero have disadvantage. Lasts until the next long rest.', 'Vorteil bei Angriffs- und Rettungswürfen, und Angriffe gegen den Helden sind im Nachteil. Hält bis zur nächsten langen Rast.', { saveAdv: 'all', attackAdv: true, blur: true }),
};

/** Help for the chips of spell effects, by chip name. */
export const SPELL_BUFF_HELP: Record<string, string> = Object.fromEntries(Object.values(SPELL_BUFFS).filter((b) => !b.instant).map((b) => [b.chip, b.text.en]));

// ---------------------------------------------------------------- conditions

/** Conditions spells put on monsters, with what they do, for the spell texts and the chips. */
export const SPELL_CONDITIONS: Record<string, { de: string; text: L2 }> = {
  paralyzed: { de: 'gelähmt', text: { en: 'it loses its turns, and hits from next to it are critical', de: 'es verliert seine Züge, und Treffer aus nächster Nähe sind kritisch' } },
  stunned: { de: 'betäubt', text: { en: 'it loses its turns', de: 'es verliert seine Züge' } },
  incapacitated: { de: 'kampfunfähig', text: { en: 'it loses its turns', de: 'es verliert seine Züge' } },
  asleep: { de: 'schlafend', text: { en: 'it loses its turns', de: 'es verliert seine Züge' } },
  charmed: { de: 'bezaubert', text: { en: 'it loses its turns', de: 'es verliert seine Züge' } },
  banished: { de: 'verbannt', text: { en: 'it is gone from the fight and cannot be harmed while that lasts', de: 'es ist aus dem Kampf verschwunden und kann solange nicht verletzt werden' } },
  restrained: { de: 'festgesetzt', text: { en: 'it cannot move, its attacks have disadvantage and attacks against it have advantage', de: 'es kann sich nicht bewegen, seine Angriffe sind im Nachteil und Angriffe gegen es im Vorteil' } },
  blinded: { de: 'blind', text: { en: 'its attacks have disadvantage and attacks against it have advantage', de: 'seine Angriffe sind im Nachteil und Angriffe gegen es im Vorteil' } },
  frightened: { de: 'verängstigt', text: { en: 'its attacks have disadvantage', de: 'seine Angriffe sind im Nachteil' } },
  poisoned: { de: 'vergiftet', text: { en: 'its attacks have disadvantage', de: 'seine Angriffe sind im Nachteil' } },
  cursed: { de: 'verflucht', text: { en: 'its attacks have disadvantage', de: 'seine Angriffe sind im Nachteil' } },
  weakened: { de: 'geschwächt', text: { en: 'its attacks have disadvantage', de: 'seine Angriffe sind im Nachteil' } },
  rattled: { de: 'verunsichert', text: { en: 'its next attack has disadvantage', de: 'sein nächster Angriff ist im Nachteil' } },
  prone: { de: 'liegend', text: { en: 'melee attacks against it have advantage, and getting up costs half its movement', de: 'Nahkampfangriffe gegen es sind im Vorteil, und das Aufstehen kostet die halbe Bewegung' } },
  slowed: { de: 'verlangsamt', text: { en: 'half speed and -2 armor class', de: 'halbe Bewegungsrate und -2 Rüstungsklasse' } },
  outlined: { de: 'erleuchtet', text: { en: 'attacks against it have advantage', de: 'Angriffe gegen es sind im Vorteil' } },
  baned: { de: 'verdammt', text: { en: 'it subtracts 1d4 from its attack rolls and saving throws', de: 'es zieht 1W4 von seinen Angriffs- und Rettungswürfen ab' } },
  confused: { de: 'verwirrt', text: { en: 'on each of its turns it has an even chance of doing nothing', de: 'in jedem seiner Züge tut es mit halber Wahrscheinlichkeit nichts' } },
};

// ------------------------------------------------------------------- reading

const ABIL_DE: Record<AbilityKey, string> = { str: 'STÄ', dex: 'GES', con: 'KON', int: 'INT', wis: 'WEI', cha: 'CHA' };
const TYPE_DE: Record<string, string> = {
  acid: 'Säureschaden', bludgeoning: 'Wuchtschaden', cold: 'Kälteschaden', fire: 'Feuerschaden', force: 'Energieschaden', lightning: 'Blitzschaden',
  necrotic: 'nekrotischer Schaden', piercing: 'Stichschaden', poison: 'Giftschaden', psychic: 'psychischer Schaden', radiant: 'gleißender Schaden',
  slashing: 'Hiebschaden', thunder: 'Schallschaden',
};
/** "best" is damage of whichever element the target resists least. */
export const BEST_TYPES = ['fire', 'cold', 'lightning', 'acid', 'thunder', 'poison'];

const parseDice = (d: string) => {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(d);
  return m ? { n: Number(m[1]), sides: Number(m[2]), mod: Number(m[3] ?? 0) } : null;
};
/** "3d4+3" and two times "1d4+1" make "5d4+5". */
export function addDice(base: string, inc: string, times: number): string {
  const a = parseDice(base), b = parseDice(inc);
  if (!a || !b || a.sides !== b.sides) return base;
  const mod = a.mod + b.mod * times;
  return `${a.n + b.n * times}d${a.sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ''}`;
}
const deDice = (d: string) => d.replace(/d/g, 'W');
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function read([id, icon, de, spec, en, deText]: (typeof SPELL_ROWS)[number]): { def: AbilityDef; de: string; deDesc: string } {
  const src = SRD_SPELLS[id];
  if (!src) throw new Error(`Spell table: ${id} is not in the SRD data`);
  const level = src.level;
  const def: AbilityDef = {
    id, name: src.name, icon, description: '', kind: 'story', cost: level ? SLOT_COST[level - 1] : 0, range: src.range, target: 'self',
    spellLevel: level, school: src.school,
    ...(src.conc ? { concentration: true } : {}), ...(src.ritual ? { ritual: true } : {}),
    ...(src.time === 'bonus' ? { bonusAction: true } : {}), ...(src.time === 'long' ? { slow: true } : {}),
  };
  let useSrdDice = false;
  let own: string | undefined, ownUp: string | undefined, healUp: string | undefined;
  for (const word of spec.split(/\s+/).filter(Boolean)) {
    const [key, ...rest] = word.split(':');
    const arg = rest.join(':');
    const pair = (): [string, string | undefined] => { const [a, b] = arg.split('/'); return [a, b]; };
    switch (key) {
      case 'atk': def.kind = 'attack'; def.target = 'enemy'; break;
      case 'sv': if (def.kind !== 'smite') { def.kind = 'save'; def.target = 'enemy'; } def.saveAbility = arg as AbilityKey; break;
      case 'nosave': def.kind = 'save'; def.target = 'enemy'; break;
      case 'auto': def.kind = 'auto'; def.target = 'enemy'; break;
      case 'smite': def.kind = 'smite'; def.target = 'self'; break;
      case 'weapon': def.kind = 'weapon'; def.target = 'enemy'; def.range = 5; break;
      case 'step': def.kind = 'step'; def.step = Number(arg); break;
      case 'story': def.kind = 'story'; break;
      case 'react': def.reaction = arg as AbilityDef['reaction']; if (def.kind === 'story') def.kind = 'react'; break;
      case 'buff': def.kind = 'buff'; def.buff = arg; def.target = src.range > 0 ? 'ally' : 'self'; break;
      case 'heal': {
        def.kind = 'heal'; def.target = 'ally';
        const [a, b] = pair();
        if (/^\d+$/.test(a)) { def.flat = Number(a); if (b) def.flatUp = Number(b); } else { own = a; healUp = b; }
        break;
      }
      case 'cure': def.kind = 'cure'; def.target = 'ally'; def.cures = arg.split(','); break;
      case 'revive': def.kind = 'revive'; def.target = 'ally'; def.revive = arg === 'full' ? 0 : Number(arg); break;
      case 'dmg': useSrdDice = true; break;
      case 'd': [own, ownUp] = pair(); break;
      case 'ty': def.damageType = arg; break;
      case 'half': def.half = true; break;
      case 'rng': def.range = Number(arg); break;
      case 'r': def.radius = Number(arg); break;
      case 'n': { const [a, b] = pair(); def.count = Number(a); if (b) def.countUp = Number(b); break; }
      case 'rays': { const [a, b] = pair(); def.rays = Number(a); if (b) def.raysUp = Number(b); break; }
      case 'plus': def.plusMod = true; break;
      case 'c': {
        const [condition, ...flags] = rest;
        const turns = flags.find((f) => /^\d+$/.test(f));
        def.inflict = { condition, ...(turns ? { turns: Number(turns) } : {}), ...(flags.includes('rep') ? { repeat: true } : {}), ...(flags.includes('hurt') ? { onHurt: true } : {}) };
        break;
      }
      case 'zone': def.zone = { radius: Number(arg) }; break;
      case 'aura': def.zone = { radius: Number(arg), follow: true }; def.range = Number(arg); break;
      case 'sus': def.sustain = arg === 'bonus' ? 'bonus' : 'action'; break;
      case 'only': def.only = arg.split(','); break;
      case 'act': delete def.bonusAction; break;
      case 'bonus': def.bonusAction = true; break;
      case 'conc': def.concentration = true; break;
      case 'noconc': delete def.concentration; break;
      case 'self': def.target = 'self'; break;
      case 'ally': def.target = 'ally'; if (def.range === 0) def.range = 5; break;
      case 'party': def.count = 99; def.target = 'self'; break;
      default: throw new Error(`Spell table: ${id} has an unknown word "${word}"`);
    }
  }
  if (def.reaction) { delete def.bonusAction; def.target = 'self'; }
  if (def.count && def.kind === 'buff' && def.count < 99 && def.target === 'self') def.target = 'ally';
  // Dice: the table's own, or what the SRD lists for each slot level.
  if (own) {
    def.dice = own;
    const up = ownUp ?? healUp;
    if (up && level > 0) def.diceAt = Object.fromEntries(Array.from({ length: 10 - level }, (_, i) => [level + i, addDice(own!, up, i)]));
  } else if (useSrdDice && src.dice) {
    const at = Object.entries(src.dice).map(([k, v]) => [Number(k), v] as const).sort((a, b) => a[0] - b[0]);
    def.dice = (at.find(([k]) => k === level) ?? at[0])[1];
    if (level > 0 && at.length > 1) def.diceAt = Object.fromEntries(at.filter(([k]) => k >= level));
  } else if (useSrdDice) throw new Error(`Spell table: ${id} asks for SRD dice but the data has none`);
  if (def.dice && !def.damageType && def.kind !== 'heal') def.damageType = src.type ?? 'force';
  if (def.inflict && !def.inflict.turns && !def.concentration) def.inflict.turns = 10;

  // The text: a heading, what the engine does, the table's own words, and how it is cast.
  const en1: string[] = [], de1: string[] = [];
  const say = (e: string, d: string) => { en1.push(e); de1.push(d); };
  if (level === 0) say('Cantrip.', 'Zaubertrick.');
  else say(`${ordinal(level)}-level spell (${def.cost} mana).`, `Zauber des ${level}. Grades (${def.cost} Mana).`);
  const dmgEn = def.damageType === 'best' ? `${def.dice} damage of the element the target resists least` : `${def.dice} ${def.damageType} damage`;
  const dmgDe = def.damageType === 'best' ? `${deDice(def.dice ?? '')} Schaden des Elements, dem das Ziel am wenigsten widersteht` : `${deDice(def.dice ?? '')} ${TYPE_DE[def.damageType ?? ''] ?? 'Schaden'}`;
  const plusEn = def.plusMod ? ' + your spellcasting modifier' : '', plusDe = def.plusMod ? ' + dein Zaubermodifikator' : '';
  const cond = def.inflict ? SPELL_CONDITIONS[def.inflict.condition] : undefined;
  if (def.inflict && !cond) throw new Error(`Spell table: ${id} inflicts an unknown condition`);
  const condEn = def.inflict ? `${def.inflict.condition} (${cond!.text.en})` : '', condDe = def.inflict ? `${cond!.de} (${cond!.text.de})` : '';
  const SV = def.saveAbility?.toUpperCase() ?? '', SVde = def.saveAbility ? ABIL_DE[def.saveAbility] : '';
  switch (def.kind) {
    case 'attack':
      say(`${def.range <= 5 ? 'Melee' : 'Ranged'} spell attack, ${dmgEn}${plusEn}.`, `${def.range <= 5 ? 'Nahkampf' : 'Fernkampf'}-Zauberangriff, ${dmgDe}${plusDe}.`);
      if (def.rays) say(`${def.rays} attacks, each with its own roll.`, `${def.rays} Angriffe, jeder mit eigenem Wurf.`);
      if (def.inflict) say(`A hit leaves the target ${condEn}.`, `Ein Treffer macht das Ziel ${condDe}.`);
      break;
    case 'save': case 'smite':
      if (def.kind === 'smite') say(`Bonus action right after a melee hit: ${dmgEn} more.`, `Bonusaktion direkt nach einem Nahkampftreffer: zusätzlich ${dmgDe}.`);
      else if (def.dice && def.saveAbility) say(`${SV} save or ${dmgEn}${def.half ? ', half on a success' : ''}.`, `${SVde}-Rettungswurf oder ${dmgDe}${def.half ? ', bei Erfolg die Hälfte' : ''}.`);
      else if (def.dice && !def.inflict) say(`${dmgEn}, no save.`, `${dmgDe}, kein Rettungswurf.`);
      if (def.inflict) {
        if (!def.saveAbility) say(`The target is ${condEn}.`, `Das Ziel ist ${condDe}.`);
        else if (def.dice) say(`On a failure the target is also ${condEn}.`, `Bei einem Fehlschlag ist das Ziel außerdem ${condDe}.`);
        else say(`${SV} save or ${condEn}.`, `${SVde}-Rettungswurf oder ${condDe}.`);
      }
      break;
    case 'auto': say(`${dmgEn}, no roll needed.`, `${dmgDe}, ohne Wurf.`); break;
    case 'heal':
      if (def.flat) say(`Restores ${def.flat} hit points.`, `Stellt ${def.flat} Trefferpunkte wieder her.`);
      else say(`Restores ${def.dice} + your spellcasting modifier hit points.`, `Stellt ${deDice(def.dice!)} + deinen Zaubermodifikator Trefferpunkte wieder her.`);
      break;
    case 'buff': { const b = SPELL_BUFFS[def.buff!]; if (!b) throw new Error(`Spell table: ${id} has an unknown buff`); say(b.text.en, b.text.de); break; }
    case 'cure':
      if (def.cures![0] === 'all') say('Ends every condition on the ally you touch.', 'Beendet alle Zustände des berührten Verbündeten.');
      else if (def.cures![0] !== 'dying') say(`Ends these conditions on the ally you touch: ${def.cures!.join(', ')}.`, `Beendet diese Zustände des berührten Verbündeten: ${def.cures!.map((c) => SPELL_CONDITIONS[c]?.de ?? (c === 'deafened' ? 'taub' : c)).join(', ')}.`);
      break;
    default: break;
  }
  if (def.inflict && def.kind !== 'attack') {
    if (def.inflict.turns && def.inflict.turns < 10) say(def.inflict.turns === 1 ? 'It lasts one turn.' : `It lasts ${def.inflict.turns} turns.`, def.inflict.turns === 1 ? 'Das hält einen Zug.' : `Das hält ${def.inflict.turns} Züge.`);
    if (def.inflict.repeat) say(`It repeats the save at the end of each of its turns.`, 'Am Ende jedes seiner Züge wiederholt es den Rettungswurf.');
    if (def.inflict.onHurt) say('Damage ends it.', 'Schaden beendet es.');
  }
  if (def.only) say(`Works only on: ${def.only.join(', ')}.`, `Wirkt nur auf: ${def.only.map((t) => ({ humanoid: 'Humanoide', beast: 'Tiere' })[t] ?? t).join(', ')}.`);
  if (def.radius && def.target === 'enemy') say(`Catches every enemy within ${def.radius} ft of the target.`, `Erfasst jeden Gegner im Umkreis von ${def.radius} ft um das Ziel.`);
  if (def.count && def.count > 1 && def.count < 99) say(def.target === 'enemy' ? `Up to ${def.count} enemies close together.` : `Up to ${def.count} allies.`, def.target === 'enemy' ? `Bis zu ${def.count} nahe beieinander stehende Gegner.` : `Bis zu ${def.count} Verbündete.`);
  if (def.count === 99) say('For the whole party.', 'Für die ganze Gruppe.');
  if (def.zone?.follow) say(`It surrounds you out to ${def.zone.radius} ft and strikes the enemies inside again at the start of each of your turns.`, `Es umgibt dich bis ${def.zone.radius} ft weit und trifft die Gegner darin zu Beginn jedes deiner Züge erneut.`);
  else if (def.zone) say(`The area (${def.zone.radius} ft around the target) stays and strikes the enemies inside again at the start of each of your turns.`, `Der Bereich (${def.zone.radius} ft um das Ziel) bleibt bestehen und trifft die Gegner darin zu Beginn jedes deiner Züge erneut.`);
  if (en) say(en, deText ?? en);
  if (def.sustain) say(def.sustain === 'bonus' ? 'While it lasts you can use it again each turn as a bonus action, at no cost.' : 'While it lasts you can use it again each turn, at no cost.', def.sustain === 'bonus' ? 'Solange es anhält, kannst du es jede Runde als Bonusaktion kostenlos erneut einsetzen.' : 'Solange es anhält, kannst du es jede Runde kostenlos erneut einsetzen.');
  if (def.diceAt || def.countUp || def.raysUp || def.flatUp || (def.buff && level > 0 && (SPELL_BUFFS[def.buff].tempUp || SPELL_BUFFS[def.buff].hit?.up || SPELL_BUFFS[def.buff].weapon || typeof SPELL_BUFFS[def.buff].maxHp === 'number'))) say('Stronger when cast at a higher level.', 'Stärker, wenn auf höherem Grad gewirkt.');
  if (def.bonusAction && def.kind !== 'smite') say('Bonus action.', 'Bonusaktion.');
  if (def.reaction) say('Reaction.', 'Reaktion.');
  if (def.concentration) say('Concentration.', 'Konzentration.');
  if (def.slow) say('Takes minutes to cast, so not in a fight.', 'Das Wirken dauert Minuten, also nicht im Kampf.');
  if (def.ritual) say('Ritual: free outside a fight.', 'Ritual: außerhalb eines Kampfes kostenlos.');
  def.description = en1.join(' ');
  return { def, de, deDesc: de1.join(' ') };
}

const built = SPELL_ROWS.map(read);

/** Every spell of the table as an ability. */
export const SPELLS: AbilityDef[] = built.map((b) => b.def);

/** German names and texts of the spells, the chips and the conditions. */
export const SPELLS_DE: Record<string, string> = {
  ...Object.fromEntries(built.flatMap((b) => [[b.def.name, b.de], [b.def.description, b.deDesc]])),
  ...Object.fromEntries(Object.values(SPELL_BUFFS).flatMap((b) => [[b.chip, b.de], [b.text.en, b.text.de]])),
  ...Object.fromEntries(Object.entries(SPELL_CONDITIONS).map(([k, c]) => [k, c.de])),
  'best damage': 'Elementarschaden',
};

const CASTERS: ClassId[] = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'];

/** The spell list of each class by spell level (0 = cantrips), in SRD order. */
export const SRD_SPELL_LISTS: Partial<Record<ClassId, Record<number, string[]>>> = Object.fromEntries(CASTERS.map((cls) => {
  const byLevel: Record<number, string[]> = {};
  for (const s of Object.values(SRD_SPELLS)) if (s.classes.includes(cls)) (byLevel[s.level] ??= []).push(s.id);
  return [cls, byLevel];
}));

/** The spell level a spell is cast at: its own, or the one asked for, within what the caster can reach. */
export function castLevel(ab: AbilityDef, asked: number | undefined, top: number): number {
  const base = ab.spellLevel ?? 0;
  if (base === 0) return 0;
  return Math.max(base, Math.min(Math.max(base, top), Math.round(asked ?? base) || base, 9));
}

/** Dice of a spell at a slot level. */
export const diceAtLevel = (ab: AbilityDef, level: number) => ab.diceAt?.[level] ?? ab.dice;

/** Does casting it at a higher level change anything? */
export const upcastable = (ab: AbilityDef) => !!(ab.diceAt || ab.countUp || ab.raysUp || ab.flatUp
  || (ab.buff && (SPELL_BUFFS[ab.buff]?.tempUp || SPELL_BUFFS[ab.buff]?.hit?.up || SPELL_BUFFS[ab.buff]?.weapon || typeof SPELL_BUFFS[ab.buff]?.maxHp === 'number')));

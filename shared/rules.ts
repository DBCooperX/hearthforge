// Character options: species, classes, backgrounds, feats, fighting styles and spell lists,
// with the explanations the character creator shows for each of them.
//
// The rules come from the D&D System Reference Document 5.2.1 (species, backgrounds, origin
// feats) and 5.1 (the remaining spells and the Dueling style), both CC-BY-4.0, Wizards of the
// Coast. See CREDITS.md. Every explanation is written for Hearthforge in its own words, and
// says where this game simplifies a rule.
import type { Lang } from './i18n';
import { SRD_SPELL_LISTS } from './spells';
import { CASTING, GROUPS, OPTIONS, optionLine, CLASS_FEATURES, CLASS_IDS, EPIC_BOON_LEVEL, SUBCLASS_LEVEL, LEVEL_ABILITIES, SRD_CLASSES, featureLine, featuresAt, manaFor, maxSpellLevelFor, profBonusFor } from './classes';
import type { Abilities, AbilityKey, BackgroundId, ClassId, FeatId, SlotId, SpeciesId } from './types';

/** The ability behind each skill. shared/content.ts has the same table; this copy avoids importing it here. */
const SKILL_ABILITY: Record<string, AbilityKey> = {
  acrobatics: 'dex', 'animal handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int',
  insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', 'sleight of hand': 'dex', stealth: 'dex', survival: 'wis',
};

/** Text in both interface languages. */
export interface L { en: string; de: string }
const L = (en: string, de: string): L => ({ en, de });
export const loc = (l: L, lang: Lang) => l[lang] || l.en;

/**
 * One thing an option does. `engine` effects are enforced by the server's rules engine;
 * `story` effects are handed to the Dungeon Master, who plays them out in the narration.
 */
export interface Effect { name: string; text: L; by: 'engine' | 'story' }
const E = (name: string, en: string, de: string): Effect => ({ name, text: L(en, de), by: 'engine' });
const S = (name: string, en: string, de: string): Effect => ({ name, text: L(en, de), by: 'story' });

/** What the creator shows for anything the player can pick. `name` is English and translated like other game terms. */
export interface Option {
  id: string;
  name: string;
  icon: string;
  summary: L;
  description: L;
  effects: Effect[];
  /** Who gets the most out of it. */
  goodFor: L;
  /** Classes for which this is a recommended pick. */
  recommendedFor: ClassId[];
}

const ALL: ClassId[] = CLASS_IDS;

// ------------------------------------------------------------------ classes

export interface LevelGain {
  /** Ability ids from ABILITIES learned at this level. */
  abilities?: string[];
  /** Features gained at this level, as lines for the character sheet. */
  features?: string[];
  /** Names of features that improve at this level. */
  improves?: string[];
  /** Choices the player makes at this level. Fighting styles, metamagic and the like come from CHOICES. */
  choose?: ('feat' | 'spell' | 'cantrip')[];
}

export interface ClassDef {
  id: ClassId;
  name: string;
  hitDie: number;
  castingAbility?: AbilityKey;
  /** Mana at level 1. */
  maxMana: number;
  armorProf: ('light' | 'medium' | 'heavy' | 'shield')[];
  weaponProf: ('simple' | 'martial')[];
  /** Extra weapons the class is proficient with by item id. */
  weaponProfIds?: string[];
  /** Actions every member of the class starts with. */
  abilityIds: string[];
  /** Features every member of the class starts with. */
  features: string[];
  saves: AbilityKey[];
  skillCount: number;
  skillList: string[];
  /** Cantrips and 1st-level spells picked at creation. */
  cantrips: { fixed: string[]; pick: number };
  spellPicks: number;
  subclass: { name: string; text: L };
  /** What each level after the first grants, keyed by the level reached. */
  levels: Record<number, LevelGain>;
}

export { profBonusFor };

/** Spells each list offers, by spell level (0 = cantrips): the class lists of the SRD. */
export const SPELL_LISTS: Partial<Record<ClassId, Record<number, string[]>>> = SRD_SPELL_LISTS;

/** What a class starts with beyond its table: the spells it knows from the first day and how many it picks. */
const START: Record<ClassId, { abilityIds?: string[]; cantrips?: { fixed: string[]; pick: number }; spellPicks?: number; weaponProfIds?: string[] }> = {
  fighter: {},
  rogue: { weaponProfIds: ['shortsword', 'longsword', 'rapier', 'scimitar'] },
  wizard: { cantrips: { fixed: [], pick: 2 }, spellPicks: 2 },
  cleric: { cantrips: { fixed: ['sacred_flame'], pick: 0 }, spellPicks: 2 },
  barbarian: {},
  bard: { cantrips: { fixed: ['vicious_mockery'], pick: 0 }, spellPicks: 2 },
  druid: { cantrips: { fixed: [], pick: 2 }, spellPicks: 2 },
  monk: { weaponProfIds: ['shortsword', 'scimitar'] },
  paladin: { abilityIds: ['cure_wounds'] },
  ranger: { abilityIds: ['cure_wounds'] },
  sorcerer: { cantrips: { fixed: [], pick: 4 }, spellPicks: 2 },
  warlock: { abilityIds: ['hex'], cantrips: { fixed: ['eldritch_blast'], pick: 1 } },
};

const SUBCLASS_TEXT: Record<ClassId, L> = {
  fighter: L('A fighter who wins through raw physical excellence. Your weapon attacks score a critical hit on a roll of 19 or 20.', 'Ein Kämpfer, der durch pure körperliche Überlegenheit siegt. Deine Waffenangriffe treffen schon bei einer gewürfelten 19 oder 20 kritisch.'),
  rogue: L('A nimble burglar and treasure hunter. Fast Hands lets you drink or hand out a potion as a bonus action, so you can still attack in the same turn.', 'Ein flinker Einbrecher und Schatzjäger. Mit Flinken Händen trinkst oder verabreichst du einen Trank als Bonusaktion und kannst im selben Zug trotzdem angreifen.'),
  wizard: L('A specialist in raw destructive magic. Potent Cantrip makes your damaging cantrips deal half damage even when they miss or the target saves.', 'Ein Spezialist für rohe Zerstörungsmagie. Durch Mächtigen Zaubertrick verursachen deine Schadens-Zaubertricks auch dann halben Schaden, wenn sie verfehlen oder das Ziel den Rettungswurf schafft.'),
  cleric: L('A servant of the gods of healing and vitality. Disciple of Life makes every healing spell you cast stronger, and Preserve Life heals several allies at once.', 'Ein Diener der Götter der Heilung und Lebenskraft. Jünger des Lebens verstärkt jeden deiner Heilzauber, und Leben bewahren heilt mehrere Verbündete auf einmal.'),
  barbarian: L('A barbarian who gives in to fury completely. Frenzy adds extra dice to your first reckless hit each turn while you rage.', 'Ein Barbar, der sich dem Zorn ganz hingibt. Raserei fügt deinem ersten rücksichtslosen Treffer in jedem Zug Zusatzwürfel hinzu, solange du im Kampfrausch bist.'),
  bard: L('A collector of knowledge and secrets. You learn three more skills, and Cutting Words spends your inspiration to make an enemy\'s attack miss.', 'Ein Sammler von Wissen und Geheimnissen. Du lernst drei weitere Fertigkeiten, und Schneidende Worte verbrauchen deine Inspiration, um den Angriff eines Gegners danebengehen zu lassen.'),
  druid: L('A keeper of old rites, bound to one kind of land. Land\'s Aid turns a use of Wild Shape into thorns that hurt your enemies and heal a friend.', 'Ein Hüter alter Riten, an eine Art von Land gebunden. Hilfe des Landes verwandelt eine Anwendung der Tiergestalt in Dornen, die deine Gegner verletzen und einen Freund heilen.'),
  monk: L('A master of unarmed combat. Every hit of your Flurry of Blows can knock the target to the ground.', 'Ein Meister des waffenlosen Kampfes. Jeder Treffer deines Schlaghagels kann das Ziel zu Boden werfen.'),
  paladin: L('A knight sworn to honesty, courage and duty. Sacred Weapon adds your Charisma to weapon attack rolls for a whole fight.', 'Ein Ritter, der Ehrlichkeit, Mut und Pflicht geschworen hat. Heilige Waffe addiert einen ganzen Kampf lang dein Charisma auf Waffenangriffswürfe.'),
  ranger: L('A stalker of dangerous prey. You choose extra damage against wounded enemies or an extra attack against a second one.', 'Ein Jäger gefährlicher Beute. Du wählst Zusatzschaden gegen verwundete Gegner oder einen zusätzlichen Angriff gegen einen zweiten.'),
  sorcerer: L('Magic from a dragon among your ancestors. You gain extra hit points, and scales that protect you without armor.', 'Magie von einem Drachen unter deinen Ahnen. Du erhältst zusätzliche Trefferpunkte und Schuppen, die dich ohne Rüstung schützen.'),
  warlock: L('A pact with a lord of the lower planes. Dark One\'s Blessing gives you temporary hit points whenever you slay an enemy.', 'Ein Pakt mit einem Herrscher der Niederen Ebenen. Segen des Finsteren gibt dir temporäre Trefferpunkte, wann immer du einen Gegner tötest.'),
};

function levelGains(id: ClassId): Record<number, LevelGain> {
  const src = SRD_CLASSES[id];
  const out: Record<number, LevelGain> = {};
  for (let level = 2; level <= 20; level++) {
    const at = featuresAt(id, level);
    const row = src.table[level - 1], before = src.table[level - 2];
    const choose: LevelGain['choose'] = [];
    if (src.asi.includes(level) || level === EPIC_BOON_LEVEL) choose.push('feat');
    if (SPELL_LISTS[id]) {
      if ((row.cantrips ?? 0) > (before.cantrips ?? 0)) choose.push('cantrip');
      if ((row.prepared ?? 0) > (before.prepared ?? 0)) choose.push('spell');
    }
    out[level] = {
      abilities: LEVEL_ABILITIES[id]?.[level] ?? [],
      features: at.filter((f) => f.levels[0] === level).map(featureLine),
      improves: at.filter((f) => f.levels[0] !== level).map((f) => f.name),
      choose,
    };
  }
  return out;
}

export const CLASSES = Object.fromEntries(CLASS_IDS.map((id) => {
  const src = SRD_CLASSES[id], start = START[id];
  const def: ClassDef = {
    id, name: src.name, hitDie: src.hitDie, castingAbility: CASTING[id], maxMana: manaFor(id, 1),
    armorProf: src.armor, weaponProf: src.weapons, weaponProfIds: start.weaponProfIds,
    abilityIds: [...(LEVEL_ABILITIES[id]?.[1] ?? []), ...(start.abilityIds ?? []), 'dodge'],
    features: featuresAt(id, 1).map(featureLine),
    saves: src.saves, skillCount: src.skillCount, skillList: src.skills.length ? src.skills : Object.keys(SKILL_ABILITY),
    cantrips: start.cantrips ?? { fixed: [], pick: 0 }, spellPicks: start.spellPicks ?? 0,
    subclass: { name: src.subclass.name, text: SUBCLASS_TEXT[id] },
    levels: levelGains(id),
  };
  return [id, def];
})) as Record<ClassId, ClassDef>;

/** The sheet lines of every class feature a hero of this level has. */
export const classFeatureLines = (classId: ClassId, level: number) => CLASS_FEATURES[classId].filter((f) => f.levels[0] <= level).map(featureLine);

/** Highest spell level a caster of this class and level can learn. */
export const maxSpellLevel = (classId: ClassId, level: number) => maxSpellLevelFor(classId, level);

/** A short "when to take it" note for each spell. */
export const SPELL_TIPS: Record<string, L> = {
  vicious_mockery: L('Little damage, but it targets Wisdom instead of armor and works from 60 ft.', 'Wenig Schaden, zielt aber auf Weisheit statt auf die Rüstung und wirkt auf 60 ft.'),
  eldritch_blast: L('The warlock\'s bread and butter: force damage almost nothing resists, more beams as you level, and invocations make it stronger still.', 'Das tägliche Brot des Hexenmeisters: Energieschaden, dem kaum etwas widersteht, mehr Strahlen mit jeder Stufe, und Anrufungen machen ihn noch stärker.'),
  produce_flame: L('A solid ranged attack for a druid who is not in beast form.', 'Ein solider Fernangriff für einen Druiden, der nicht in Tiergestalt ist.'),
  starry_wisp: L('Radiant damage at range, which very few monsters resist.', 'Gleißender Schaden auf Distanz, dem kaum ein Monster widersteht.'),
  fire_bolt: L('The hardest-hitting cantrip and the longest range. A safe first pick.', 'Der stärkste Zaubertrick mit der größten Reichweite. Eine sichere erste Wahl.'),
  ray_of_frost: L('Slightly less damage than Fire Bolt, but a second damage type for enemies that shrug off fire.', 'Etwas weniger Schaden als Feuerpfeil, dafür eine zweite Schadensart gegen Gegner, denen Feuer nichts ausmacht.'),
  chill_touch: L('Long range and necrotic damage, which very few monsters resist.', 'Große Reichweite und nekrotischer Schaden, dem kaum ein Monster widersteht.'),
  shocking_grasp: L('Your answer when a monster stands next to you: ranged spells are rolled with disadvantage then, this one is not.', 'Deine Antwort, wenn ein Monster neben dir steht: Fernzauber haben dann Nachteil, dieser nicht.'),
  acid_splash: L('Low damage, but it hits a whole cluster of enemies and targets a saving throw instead of armor.', 'Wenig Schaden, trifft aber eine ganze Gruppe von Gegnern und zielt auf einen Rettungswurf statt auf die Rüstung.'),
  poison_spray: L('The biggest cantrip die, but only at 10 ft, and many undead are immune to poison.', 'Der größte Würfel unter den Zaubertricks, aber nur auf 10 ft, und viele Untote sind immun gegen Gift.'),
  sacred_flame: L('Every cleric knows it. It ignores armor: the target has to dodge instead.', 'Jeder Kleriker beherrscht sie. Sie ignoriert Rüstung: Das Ziel muss stattdessen ausweichen.'),
  magic_missile: L('Never misses. The reliable way to finish a wounded enemy.', 'Verfehlt nie. Der verlässliche Weg, einen angeschlagenen Gegner zu erledigen.'),
  burning_hands: L('Best damage for 2 mana when enemies bunch up. You have to get close.', 'Der meiste Schaden für 2 Mana, wenn Gegner dicht beisammenstehen. Du musst nah heran.'),
  thunderwave: L('Like Burning Hands, but against Constitution and with thunder damage. Good against nimble enemies.', 'Wie Brennende Hände, aber gegen Konstitution und mit Schallschaden. Gut gegen flinke Gegner.'),
  mage_armor: L('Raises a robed wizard from AC 10 + DEX to 13 + DEX for the whole day. Strongly recommended for your first adventures.', 'Hebt einen Magier in Robe von RK 10 + GES auf 13 + GES, und das den ganzen Tag. Für die ersten Abenteuer sehr zu empfehlen.'),
  acid_arrow: L('High single-target damage at long range.', 'Hoher Schaden gegen ein einzelnes Ziel auf große Entfernung.'),
  shatter: L('A strong area spell with 60 ft range, so you can stay out of harm\'s way.', 'Ein starker Flächenzauber mit 60 ft Reichweite, du bleibst also außer Gefahr.'),
  cure_wounds: L('The strongest heal at this level, but you must stand next to the patient.', 'Die stärkste Heilung auf diesem Grad, aber du musst neben dem Patienten stehen.'),
  healing_word: L('A small heal at range that only costs your bonus action: bring a fallen friend back and still attack.', 'Eine kleine Heilung auf Entfernung, die nur deine Bonusaktion kostet: Hol einen gefallenen Freund zurück und greif trotzdem an.'),
  guiding_bolt: L('Heavy damage, and the next attack against the target has advantage. Set up your rogue.', 'Hoher Schaden, und der nächste Angriff gegen das Ziel hat Vorteil. Bereite deinem Schurken den Weg.'),
  inflict_wounds: L('The biggest hit a 1st-level spell can deliver, but only in melee.', 'Der härteste Treffer, den ein Zauber des 1. Grades austeilen kann, aber nur im Nahkampf.'),
};

/** How the creator explains each class and which picks it recommends. */
export interface ClassGuide extends Option {
  role: L;
  /** Ability priority from most to least important; also the recommended standard array assignment. */
  priority: AbilityKey[];
  armor: L;
  weapons: L;
  recSkills: string[];
  recExpertise?: string[];
  recStyle?: string;
  recSpells: string[];
  /** Class options to suggest at level 1 and later, by id of OPTIONS. */
  recOptions?: string[];
  recBackground: BackgroundId;
  recKit: string;
  recSpecies: SpeciesId;
  /** What the levels after the first bring, for the "your path" preview. */
  path: { level: number; text: L }[];
}

const SUBCLASS_DE: Record<ClassId, string> = {
  fighter: 'Champion', rogue: 'Dieb', wizard: 'Hervorrufer', cleric: 'Domäne des Lebens', barbarian: 'Pfad des Berserkers', bard: 'Schule des Wissens',
  druid: 'Zirkel des Landes', monk: 'Krieger der Offenen Hand', paladin: 'Schwur der Hingabe', ranger: 'Jäger', sorcerer: 'Drakonische Zauberei', warlock: 'Unhold als Schutzherr',
};

const GUIDES: Record<ClassId, Omit<ClassGuide, 'path'> & { path?: unknown }> = {
  fighter: {
    id: 'fighter', name: 'Fighter', icon: '🛡️', recommendedFor: ALL,
    role: L('Front line · easy to play', 'Frontkämpfer · leicht zu spielen'),
    summary: L('A master of weapons and armor who stands between the monsters and the party.', 'Ein Meister der Waffen und Rüstungen, der zwischen den Monstern und der Gruppe steht.'),
    description: L('Fighters wear the heaviest armor, use every weapon and have the most hit points. They need no resources to be effective: every turn you attack, and you keep standing when others fall. The best choice for a first character.', 'Kämpfer tragen die schwerste Rüstung, führen jede Waffe und haben die meisten Trefferpunkte. Sie brauchen keine Ressourcen, um wirksam zu sein: Du greifst jede Runde an und stehst noch, wenn andere fallen. Die beste Wahl für einen ersten Charakter.'),
    effects: [
      E('Hit die d10', '10 + CON modifier hit points at level 1, then 6 + CON per level.', '10 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 6 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Strength and Constitution saves.', 'Geübt in Stärke- und Konstitutionsrettungswürfen.'),
      E('Fighting Style', 'You pick a combat specialty at level 1.', 'Du wählst auf Stufe 1 eine Kampfspezialisierung.'),
      E('Second Wind', 'Bonus action, twice per long rest: regain 1d10 + your level hit points.', 'Bonusaktion, zweimal pro langer Rast: Du erhältst 1W10 + deine Stufe Trefferpunkte zurück.'),
    ],
    goodFor: L('Players who want to hit hard, survive and not track spells.', 'Spieler, die hart zuschlagen, überleben und keine Zauber verwalten wollen.'),
    priority: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    armor: L('All armor and shields', 'Alle Rüstungen und Schilde'), weapons: L('All weapons', 'Alle Waffen'),
    recSkills: ['athletics', 'perception', 'survival', 'insight'], recStyle: 'defense', recSpells: [],
    recBackground: 'soldier', recKit: 'fighter_guard', recSpecies: 'dwarf',
    path: [
      { level: 2, text: L('Action Surge: once per rest, take a second action in one turn.', 'Tatendrang: einmal pro Rast eine zweite Aktion im selben Zug.') },
      { level: 3, text: L('Subclass Champion: critical hits on 19 or 20.', 'Unterklasse Champion: kritische Treffer bei 19 oder 20.') },
      { level: 4, text: L('A feat of your choice, or +2 to ability scores.', 'Ein Talent deiner Wahl oder +2 auf Attributswerte.') },
      { level: 5, text: L('Extra Attack: two weapon attacks with every Attack action.', 'Zusätzlicher Angriff: zwei Waffenangriffe mit jeder Angriffsaktion.') },
    ],
  },
  rogue: {
    id: 'rogue', name: 'Rogue', icon: '🗡️', recommendedFor: ALL,
    role: L('Precise striker · skill expert', 'Präziser Angreifer · Fertigkeitsexperte'),
    summary: L('A cunning specialist who strikes where it hurts and knows a trick for every lock.', 'Ein gerissener Spezialist, der dort zuschlägt, wo es wehtut, und für jedes Schloss einen Kniff kennt.'),
    description: L('Rogues deal one very strong hit per turn instead of many. Sneak Attack adds extra dice when an ally stands next to your target or you attack with advantage. Outside combat no one has more skills: sneaking, lockpicking, lying and spotting traps are your trade.', 'Schurken landen pro Runde einen sehr starken Treffer statt vieler. Der Hinterhältige Angriff fügt Extrawürfel hinzu, wenn ein Verbündeter neben deinem Ziel steht oder du mit Vorteil angreifst. Außerhalb des Kampfes hat niemand mehr Fertigkeiten: Schleichen, Schlösserknacken, Lügen und Fallenfinden sind dein Handwerk.'),
    effects: [
      E('Hit die d8', '8 + CON modifier hit points at level 1, then 5 + CON per level.', '8 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 5 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Dexterity and Intelligence saves.', 'Geübt in Geschicklichkeits- und Intelligenzrettungswürfen.'),
      E('Sneak Attack', '+1d6 damage with a finesse or ranged weapon when an ally is next to the target or you have advantage. Grows every two levels.', '+1W6 Schaden mit einer Finesse- oder Fernkampfwaffe, wenn ein Verbündeter neben dem Ziel steht oder du Vorteil hast. Wächst alle zwei Stufen.'),
      E('Expertise', 'Two of your skills use double your proficiency bonus.', 'Zwei deiner Fertigkeiten nutzen den doppelten Übungsbonus.'),
      E('Four skills', 'Twice as many class skills as other classes.', 'Doppelt so viele Klassenfertigkeiten wie andere Klassen.'),
    ],
    goodFor: L('Players who like clever positioning and solving problems without a fight.', 'Spieler, die geschicktes Stellungsspiel mögen und Probleme gern ohne Kampf lösen.'),
    priority: ['dex', 'con', 'wis', 'cha', 'int', 'str'],
    armor: L('Light armor', 'Leichte Rüstung'), weapons: L('Simple weapons, shortsword, rapier, longsword', 'Einfache Waffen, Kurzschwert, Rapier, Langschwert'),
    recSkills: ['stealth', 'perception', 'acrobatics', 'deception', 'insight', 'investigation'], recExpertise: ['stealth', 'sleight of hand', 'perception'], recSpells: [],
    recBackground: 'criminal', recKit: 'rogue_duelist', recSpecies: 'halfling',
    path: [
      { level: 2, text: L('Cunning Dash: extra movement as a bonus action, every turn.', 'Raffinierter Spurt: zusätzliche Bewegung als Bonusaktion, in jedem Zug.') },
      { level: 3, text: L('Subclass Thief: potions as a bonus action. Sneak Attack 2d6.', 'Unterklasse Dieb: Tränke als Bonusaktion. Hinterhältiger Angriff 2W6.') },
      { level: 4, text: L('A feat of your choice, or +2 to ability scores.', 'Ein Talent deiner Wahl oder +2 auf Attributswerte.') },
      { level: 5, text: L('Sneak Attack 3d6.', 'Hinterhältiger Angriff 3W6.') },
    ],
  },
  wizard: {
    id: 'wizard', name: 'Wizard', icon: '🔮', recommendedFor: ALL,
    role: L('Ranged damage · fragile', 'Fernkampfschaden · zerbrechlich'),
    summary: L('A scholar of arcane magic who ends fights from a distance, as long as nothing reaches them.', 'Ein Gelehrter der arkanen Magie, der Kämpfe aus der Ferne beendet, solange ihn nichts erreicht.'),
    description: L('Wizards have the widest choice of spells. Cantrips cost nothing and can be cast every turn; stronger spells cost mana, which returns when you rest. You have few hit points and no armor, so stay behind your friends.', 'Magier haben die größte Auswahl an Zaubern. Zaubertricks kosten nichts und können jede Runde gewirkt werden; stärkere Zauber kosten Mana, das bei einer Rast zurückkehrt. Du hast wenige Trefferpunkte und keine Rüstung, bleib also hinter deinen Freunden.'),
    effects: [
      E('Hit die d6', '6 + CON modifier hit points at level 1, then 4 + CON per level.', '6 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 4 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Intelligence and Wisdom saves.', 'Geübt in Intelligenz- und Weisheitsrettungswürfen.'),
      E('Spellcasting', 'Intelligence sets your spell attack bonus and the DC enemies must beat. You start with 2 cantrips, 2 spells and 4 mana.', 'Intelligenz bestimmt deinen Zauberangriffsbonus und den SG, den Gegner erreichen müssen. Du beginnst mit 2 Zaubertricks, 2 Zaubern und 4 Mana.'),
      E('New spells', 'You choose new spells as you gain levels, and more cantrips at levels 4 and 10.', 'Mit dem Stufenaufstieg wählst du neue Zauber, auf den Stufen 4 und 10 weitere Zaubertricks.'),
    ],
    goodFor: L('Players who enjoy choosing the right tool for each fight and do not mind being fragile.', 'Spieler, die gern für jeden Kampf das passende Werkzeug wählen und damit leben können, zerbrechlich zu sein.'),
    priority: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
    armor: L('None', 'Keine'), weapons: L('Simple weapons', 'Einfache Waffen'),
    recSkills: ['arcana', 'investigation', 'insight', 'history'], recSpells: ['fire_bolt', 'shocking_grasp', 'magic_missile', 'mage_armor'],
    recBackground: 'sage', recKit: 'wizard_scholar', recSpecies: 'elf',
    path: [
      { level: 2, text: L('Arcane Recovery: short rests restore more mana. A new spell.', 'Arkane Erholung: Kurze Rasten stellen mehr Mana wieder her. Ein neuer Zauber.') },
      { level: 3, text: L('Subclass Evoker: cantrips deal half damage on a miss. A new spell, now up to 2nd level.', 'Unterklasse Hervorrufer: Zaubertricks verursachen bei Fehlschlag halben Schaden. Ein neuer Zauber, nun bis zum 2. Grad.') },
      { level: 4, text: L('A feat of your choice or +2 to ability scores, and a third cantrip.', 'Ein Talent deiner Wahl oder +2 auf Attributswerte, dazu ein dritter Zaubertrick.') },
      { level: 5, text: L('Cantrips roll twice as many damage dice. A new spell.', 'Zaubertricks würfeln doppelt so viele Schadenswürfel. Ein neuer Zauber.') },
    ],
  },
  cleric: {
    id: 'cleric', name: 'Cleric', icon: '✨', recommendedFor: ALL,
    role: L('Healer · sturdy support', 'Heiler · robuster Unterstützer'),
    summary: L('A warrior of faith in armor who keeps the party alive and smites with divine light.', 'Ein gerüsteter Glaubensstreiter, der die Gruppe am Leben hält und mit göttlichem Licht straft.'),
    description: L('Clerics combine decent armor with healing magic. You can fight in the second rank with a mace and shield, burn enemies with Sacred Flame and bring fallen friends back on their feet. A party with a cleric forgives many mistakes.', 'Kleriker verbinden ordentliche Rüstung mit Heilmagie. Du kannst mit Streitkolben und Schild in der zweiten Reihe kämpfen, Gegner mit der Heiligen Flamme verbrennen und gefallene Freunde wieder auf die Beine bringen. Eine Gruppe mit Kleriker verzeiht viele Fehler.'),
    effects: [
      E('Hit die d8', '8 + CON modifier hit points at level 1, then 5 + CON per level.', '8 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 5 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Wisdom and Charisma saves.', 'Geübt in Weisheits- und Charismarettungswürfen.'),
      E('Spellcasting', 'Wisdom sets your spell attack bonus, your save DC and how much you heal. You start with Sacred Flame, 2 spells and 4 mana.', 'Weisheit bestimmt deinen Zauberangriffsbonus, deinen Rettungswurf-SG und wie viel du heilst. Du beginnst mit Heiliger Flamme, 2 Zaubern und 4 Mana.'),
      E('New spells', 'You choose new spells as you gain levels.', 'Mit dem Stufenaufstieg wählst du neue Zauber.'),
    ],
    goodFor: L('Players who like to support the group and still want to be hard to kill.', 'Spieler, die gern die Gruppe unterstützen und trotzdem schwer zu töten sein wollen.'),
    priority: ['wis', 'con', 'str', 'dex', 'cha', 'int'],
    armor: L('Light and medium armor, shields', 'Leichte und mittelschwere Rüstung, Schilde'), weapons: L('Simple weapons', 'Einfache Waffen'),
    recSkills: ['medicine', 'insight', 'persuasion', 'religion'], recSpells: ['cure_wounds', 'guiding_bolt'],
    recOptions: ['order_protector'], recBackground: 'acolyte', recKit: 'cleric_battle', recSpecies: 'human',
    path: [
      { level: 2, text: L('A new spell.', 'Ein neuer Zauber.') },
      { level: 3, text: L('Subclass Life Domain: +3 hit points on every healing spell. A new spell.', 'Unterklasse Domäne des Lebens: +3 Trefferpunkte bei jedem Heilzauber. Ein neuer Zauber.') },
      { level: 4, text: L('A feat of your choice, or +2 to ability scores.', 'Ein Talent deiner Wahl oder +2 auf Attributswerte.') },
      { level: 5, text: L('Cantrips roll twice as many damage dice.', 'Zaubertricks würfeln doppelt so viele Schadenswürfel.') },
    ],
  },
  barbarian: {
    id: 'barbarian', name: 'Barbarian', icon: '🪓', recommendedFor: ALL,
    role: L('Front line · hard to kill', 'Frontkämpfer · kaum totzukriegen'),
    summary: L('A warrior of primal fury who shrugs off blows that would fell anyone else.', 'Ein Krieger urtümlichen Zorns, der Schläge abschüttelt, die jeden anderen fällen würden.'),
    description: L('Barbarians have the most hit points of all and need no armor. In a Rage you take half damage from weapons and hit harder. Reckless Attack trades your own safety for advantage. Simple to play: get angry, get close, swing.', 'Barbaren haben von allen die meisten Trefferpunkte und brauchen keine Rüstung. Im Kampfrausch erleidest du halben Schaden durch Waffen und schlägst härter zu. Der Rücksichtslose Angriff tauscht deine eigene Sicherheit gegen Vorteil. Leicht zu spielen: wütend werden, nah heran, zuschlagen.'),
    effects: [
      E('Hit die d12', '12 + CON modifier hit points at level 1, then 7 + CON per level.', '12 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 7 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Strength and Constitution saves.', 'Geübt in Stärke- und Konstitutionsrettungswürfen.'),
      E('Rage', 'Bonus action, twice per long rest at first: resist weapon damage and deal +2 damage for a whole fight.', 'Bonusaktion, anfangs zweimal pro langer Rast: einen ganzen Kampf lang Resistenz gegen Waffenschaden und +2 Schaden.'),
      E('Unarmored Defense', 'Without armor your AC is 10 + DEX + CON, and a shield still helps.', 'Ohne Rüstung beträgt deine RK 10 + GES + KON, und ein Schild hilft weiterhin.'),
    ],
    goodFor: L('Players who want to wade in, hit hard and not worry much about tactics.', 'Spieler, die sich ins Getümmel stürzen, hart zuschlagen und sich wenig um Taktik sorgen wollen.'),
    priority: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    armor: L('Light and medium armor, shields', 'Leichte und mittelschwere Rüstung, Schilde'), weapons: L('All weapons', 'Alle Waffen'),
    recSkills: ['athletics', 'perception', 'survival', 'intimidation'], recSpells: [],
    recBackground: 'soldier', recKit: 'barbarian_greataxe', recSpecies: 'orc',
  },
  bard: {
    id: 'bard', name: 'Bard', icon: '🎻', recommendedFor: ALL,
    role: L('Support · voice of the party', 'Unterstützer · Stimme der Gruppe'),
    summary: L('A performer whose words and music heal friends, unsettle foes and open doors.', 'Ein Künstler, dessen Worte und Musik Freunde heilen, Gegner verunsichern und Türen öffnen.'),
    description: L('Bards make everyone around them better. Bardic Inspiration turns an ally\'s near miss into a hit, your spells heal, and Vicious Mockery spoils an enemy\'s next attack. Outside combat you are the one who talks: nobody has more skills.', 'Barden machen alle um sich herum besser. Bardische Inspiration macht aus dem knappen Fehlschlag eines Verbündeten einen Treffer, deine Zauber heilen, und Gehässiger Spott verdirbt einem Gegner den nächsten Angriff. Außerhalb des Kampfes führst du das Wort: Niemand hat mehr Fertigkeiten.'),
    effects: [
      E('Hit die d8', '8 + CON modifier hit points at level 1, then 5 + CON per level.', '8 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 5 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Dexterity and Charisma saves.', 'Geübt in Geschicklichkeits- und Charismarettungswürfen.'),
      E('Bardic Inspiration', 'Bonus action: give an ally a d6 for their next failed attack or save. As many uses as your Charisma modifier.', 'Bonusaktion: Gib einem Verbündeten einen W6 für seinen nächsten misslungenen Angriff oder Rettungswurf. So viele Anwendungen wie dein Charismamodifikator.'),
      E('Spellcasting', 'Charisma sets your spell attack bonus and save DC. You start with Vicious Mockery, 2 spells and 4 mana.', 'Charisma bestimmt deinen Zauberangriffsbonus und Rettungswurf-SG. Du beginnst mit Gehässigem Spott, 2 Zaubern und 4 Mana.'),
    ],
    goodFor: L('Players who enjoy helping the party shine and doing the talking.', 'Spieler, die gern die Gruppe glänzen lassen und das Reden übernehmen.'),
    priority: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
    armor: L('Light armor', 'Leichte Rüstung'), weapons: L('Simple weapons', 'Einfache Waffen'),
    recSkills: ['persuasion', 'deception', 'performance', 'insight', 'perception'], recExpertise: ['persuasion', 'deception'], recSpells: ['healing_word', 'thunderwave'],
    recBackground: 'acolyte', recKit: 'bard_troubadour', recSpecies: 'human',
  },
  druid: {
    id: 'druid', name: 'Druid', icon: '🌿', recommendedFor: ALL,
    role: L('Shapeshifter · nature caster', 'Gestaltwandler · Naturzauberer'),
    summary: L('A priest of the old faith who calls on the elements and fights in the shape of a beast.', 'Ein Priester des alten Glaubens, der die Elemente ruft und in Tiergestalt kämpft.'),
    description: L('Druids heal like clerics and strike from range with fire and starlight. From level 2 Wild Shape turns you into a wolf, later a bear, with temporary hit points on top of your own. You wear only light armor, so the beast is also your shield.', 'Druiden heilen wie Kleriker und greifen aus der Ferne mit Feuer und Sternenlicht an. Ab Stufe 2 verwandelt dich die Tiergestalt in einen Wolf, später in einen Bären, mit temporären Trefferpunkten zusätzlich zu deinen eigenen. Du trägst nur leichte Rüstung, das Tier ist also auch dein Schild.'),
    effects: [
      E('Hit die d8', '8 + CON modifier hit points at level 1, then 5 + CON per level.', '8 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 5 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Intelligence and Wisdom saves.', 'Geübt in Intelligenz- und Weisheitsrettungswürfen.'),
      E('Spellcasting', 'Wisdom sets your spell attack bonus, save DC and healing. You start with 2 cantrips, 2 spells and 4 mana.', 'Weisheit bestimmt deinen Zauberangriffsbonus, Rettungswurf-SG und deine Heilung. Du beginnst mit 2 Zaubertricks, 2 Zaubern und 4 Mana.'),
      E('Wild Shape', 'From level 2: become a beast as a bonus action, twice per long rest.', 'Ab Stufe 2: Werde als Bonusaktion zu einem Tier, zweimal pro langer Rast.'),
    ],
    goodFor: L('Players who want a healer who can also bite.', 'Spieler, die einen Heiler wollen, der auch zubeißen kann.'),
    priority: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
    armor: L('Light armor, shields', 'Leichte Rüstung, Schilde'), weapons: L('Simple weapons', 'Einfache Waffen'),
    recSkills: ['perception', 'nature', 'survival', 'medicine'], recSpells: ['produce_flame', 'starry_wisp', 'cure_wounds', 'healing_word'], recOptions: ['primal_magician'],
    recBackground: 'sage', recKit: 'druid_staff', recSpecies: 'elf',
  },
  monk: {
    id: 'monk', name: 'Monk', icon: '🥋', recommendedFor: ALL,
    role: L('Skirmisher · fast and precise', 'Plänkler · schnell und präzise'),
    summary: L('A martial artist who needs neither weapon nor armor and strikes more often than anyone.', 'Ein Kampfkünstler, der weder Waffe noch Rüstung braucht und öfter zuschlägt als jeder andere.'),
    description: L('Monks fight with Dexterity and bare hands. Every turn you attack and then strike again as a bonus action. From level 2 focus points pay for a Flurry of Blows, a dodge or a dash, and they return after every rest. You are fast, hard to pin down and from level 5 you can stun.', 'Mönche kämpfen mit Geschicklichkeit und bloßen Händen. In jedem Zug greifst du an und schlägst als Bonusaktion noch einmal zu. Ab Stufe 2 bezahlen Fokuspunkte einen Schlaghagel, ein Ausweichen oder einen Spurt, und sie kehren nach jeder Rast zurück. Du bist schnell, schwer festzunageln und kannst ab Stufe 5 betäuben.'),
    effects: [
      E('Hit die d8', '8 + CON modifier hit points at level 1, then 5 + CON per level.', '8 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 5 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Strength and Dexterity saves.', 'Geübt in Stärke- und Geschicklichkeitsrettungswürfen.'),
      E('Martial Arts', 'Unarmed strikes use Dexterity and a d6, and you get one more as a bonus action every turn.', 'Waffenlose Schläge nutzen Geschicklichkeit und einen W6, und du erhältst in jedem Zug einen weiteren als Bonusaktion.'),
      E('Unarmored Defense', 'Without armor and shield your AC is 10 + DEX + WIS.', 'Ohne Rüstung und Schild beträgt deine RK 10 + GES + WEI.'),
    ],
    goodFor: L('Players who like to dart around the battlefield and make many attacks.', 'Spieler, die gern über das Schlachtfeld huschen und viele Angriffe ausführen.'),
    priority: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    armor: L('None', 'Keine'), weapons: L('Simple weapons, shortsword, scimitar', 'Einfache Waffen, Kurzschwert, Krummsäbel'),
    recSkills: ['acrobatics', 'stealth', 'insight', 'athletics'], recSpells: [],
    recBackground: 'soldier', recKit: 'monk_staff', recSpecies: 'human',
  },
  paladin: {
    id: 'paladin', name: 'Paladin', icon: '⚜️', recommendedFor: ALL,
    role: L('Front line · healer and striker', 'Frontkämpfer · Heiler und Angreifer'),
    summary: L('A holy knight in heavy armor who heals with a touch and smites with divine fire.', 'Ein heiliger Ritter in schwerer Rüstung, der mit einer Berührung heilt und mit göttlichem Feuer niederstreckt.'),
    description: L('Paladins are as sturdy as fighters and bring healing along. Lay on Hands is a pool of hit points you hand out as a bonus action. From level 2 Divine Smite turns mana into a burst of radiant damage right after you hit. Later your aura protects everyone near you.', 'Paladine sind so robust wie Kämpfer und bringen Heilung mit. Handauflegen ist ein Vorrat an Trefferpunkten, den du als Bonusaktion verteilst. Ab Stufe 2 verwandelt Göttliches Niederstrecken Mana in gleißenden Schaden, direkt nachdem du getroffen hast. Später schützt deine Aura alle in deiner Nähe.'),
    effects: [
      E('Hit die d10', '10 + CON modifier hit points at level 1, then 6 + CON per level.', '10 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 6 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Wisdom and Charisma saves.', 'Geübt in Weisheits- und Charismarettungswürfen.'),
      E('Lay on Hands', 'Bonus action: heal by touch from a pool of five times your level.', 'Bonusaktion: Heile durch Berührung aus einem Vorrat in Höhe deiner fünffachen Stufe.'),
      E('Spellcasting', 'Charisma is your spellcasting ability. You start with Cure Wounds and 4 mana.', 'Charisma ist dein Zauberattribut. Du beginnst mit Wunden heilen und 4 Mana.'),
    ],
    goodFor: L('Players who want to protect the party and still land the biggest single hits.', 'Spieler, die die Gruppe beschützen und trotzdem die größten Einzeltreffer landen wollen.'),
    priority: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
    armor: L('All armor and shields', 'Alle Rüstungen und Schilde'), weapons: L('All weapons', 'Alle Waffen'),
    recSkills: ['athletics', 'persuasion', 'insight', 'intimidation'], recStyle: 'defense', recSpells: [],
    recBackground: 'soldier', recKit: 'paladin_guard', recSpecies: 'dragonborn',
  },
  ranger: {
    id: 'ranger', name: 'Ranger', icon: '🏹', recommendedFor: ALL,
    role: L('Ranged striker · scout', 'Fernkämpfer · Kundschafter'),
    summary: L('A hunter of the wilds who marks a quarry and does not let it go.', 'Ein Jäger der Wildnis, der seine Beute markiert und nicht mehr loslässt.'),
    description: L('Rangers fight best with a bow. Hunter\'s Mark adds a d6 to every hit on one enemy for the whole fight, and you can cast it twice a day for free. You wear medium armor, heal a little and find your way where others get lost.', 'Waldläufer kämpfen am besten mit dem Bogen. Das Zeichen des Jägers fügt jedem Treffer gegen einen Gegner den ganzen Kampf über einen W6 hinzu, und du kannst es zweimal am Tag kostenlos wirken. Du trägst mittelschwere Rüstung, heilst ein wenig und findest den Weg, wo andere sich verirren.'),
    effects: [
      E('Hit die d10', '10 + CON modifier hit points at level 1, then 6 + CON per level.', '10 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 6 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Strength and Dexterity saves.', 'Geübt in Stärke- und Geschicklichkeitsrettungswürfen.'),
      E('Favored Enemy', 'Hunter\'s Mark is always known and costs no mana twice per long rest.', 'Das Zeichen des Jägers ist immer bekannt und kostet zweimal pro langer Rast kein Mana.'),
      E('Spellcasting', 'Wisdom is your spellcasting ability. You start with Cure Wounds and 4 mana.', 'Weisheit ist dein Zauberattribut. Du beginnst mit Wunden heilen und 4 Mana.'),
    ],
    goodFor: L('Players who want steady damage from a safe distance and a hero at home outdoors.', 'Spieler, die verlässlichen Schaden aus sicherer Entfernung und einen Helden wollen, der in der Wildnis zu Hause ist.'),
    priority: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    armor: L('Light and medium armor, shields', 'Leichte und mittelschwere Rüstung, Schilde'), weapons: L('All weapons', 'Alle Waffen'),
    recSkills: ['perception', 'stealth', 'survival', 'nature', 'athletics'], recExpertise: ['perception', 'stealth', 'survival'], recStyle: 'archery', recSpells: [],
    recBackground: 'soldier', recKit: 'ranger_archer', recSpecies: 'elf',
  },
  sorcerer: {
    id: 'sorcerer', name: 'Sorcerer', icon: '🐉', recommendedFor: ALL,
    role: L('Ranged damage · flexible', 'Fernkampfschaden · flexibel'),
    summary: L('A caster born with magic in the blood, who bends spells to the moment.', 'Ein Zauberwirker, dem die Magie im Blut liegt und der Zauber dem Augenblick anpasst.'),
    description: L('Sorcerers know the wizard\'s attack spells and more cantrips than anyone at the start. Innate Sorcery makes your magic harder to resist for a whole fight. From level 2 sorcery points buy extra mana or Metamagic: a spell as a bonus action, a spell at twice the range. As fragile as a wizard.', 'Zauberer beherrschen die Angriffszauber des Magiers und anfangs mehr Zaubertricks als jeder andere. Angeborene Zauberei macht deine Magie einen ganzen Kampf lang schwerer zu widerstehen. Ab Stufe 2 kaufen Zauberpunkte zusätzliches Mana oder Metamagie: ein Zauber als Bonusaktion, ein Zauber mit doppelter Reichweite. So zerbrechlich wie ein Magier.'),
    effects: [
      E('Hit die d6', '6 + CON modifier hit points at level 1, then 4 + CON per level.', '6 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 4 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Constitution and Charisma saves.', 'Geübt in Konstitutions- und Charismarettungswürfen.'),
      E('Spellcasting', 'Charisma sets your spell attack bonus and save DC. You start with 4 cantrips, 2 spells and 4 mana.', 'Charisma bestimmt deinen Zauberangriffsbonus und Rettungswurf-SG. Du beginnst mit 4 Zaubertricks, 2 Zaubern und 4 Mana.'),
      E('Innate Sorcery', 'Bonus action, twice per long rest: +1 spell save DC and advantage on spell attacks for a fight.', 'Bonusaktion, zweimal pro langer Rast: einen Kampf lang +1 Zauber-SG und Vorteil auf Zauberangriffe.'),
    ],
    goodFor: L('Players who like casting and want tricks to play with their spells.', 'Spieler, die gern zaubern und Kniffe wollen, um mit ihren Zaubern zu spielen.'),
    priority: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    armor: L('None', 'Keine'), weapons: L('Simple weapons', 'Einfache Waffen'),
    recSkills: ['arcana', 'persuasion', 'deception', 'insight'], recSpells: ['fire_bolt', 'shocking_grasp', 'ray_of_frost', 'chill_touch', 'magic_missile', 'mage_armor'],
    recBackground: 'acolyte', recKit: 'sorcerer_wanderer', recSpecies: 'human',
  },
  warlock: {
    id: 'warlock', name: 'Warlock', icon: '🧿', recommendedFor: ALL,
    role: L('Ranged damage · rests often', 'Fernkampfschaden · rastet oft'),
    summary: L('An occultist who traded service for power and hurls it as crackling beams.', 'Ein Okkultist, der Dienst gegen Macht getauscht hat und sie als knisternde Strahlen schleudert.'),
    description: L('Warlocks have very little mana, but all of it returns after a short rest. Between rests you rely on Eldritch Blast, the strongest cantrip in the game, and on Hex, which adds a d6 to every hit on one enemy. Invocations shape you further: armor of shadow, a pact blade, sight in the dark.', 'Hexenmeister haben sehr wenig Mana, doch es kehrt nach einer kurzen Rast vollständig zurück. Zwischen den Rasten verlässt du dich auf den Schauerstrahl, den stärksten Zaubertrick im Spiel, und auf Verhexen, das jedem Treffer gegen einen Gegner einen W6 hinzufügt. Anrufungen formen dich weiter: Rüstung aus Schatten, eine Paktklinge, Sicht im Dunkeln.'),
    effects: [
      E('Hit die d8', '8 + CON modifier hit points at level 1, then 5 + CON per level.', '8 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 5 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Wisdom and Charisma saves.', 'Geübt in Weisheits- und Charismarettungswürfen.'),
      E('Pact Magic', 'Charisma is your spellcasting ability. You start with Eldritch Blast, one more cantrip, Hex and 2 mana, which return on a short rest.', 'Charisma ist dein Zauberattribut. Du beginnst mit Schauerstrahl, einem weiteren Zaubertrick, Verhexen und 2 Mana, die bei einer kurzen Rast zurückkehren.'),
      E('Eldritch Invocations', 'You choose one lasting power at level 1 and more as you level.', 'Du wählst auf Stufe 1 eine dauerhafte Kraft und mit dem Aufstieg weitere.'),
    ],
    goodFor: L('Players who want a simple, strong attack every turn and a hero with a dark secret.', 'Spieler, die in jedem Zug einen einfachen, starken Angriff und einen Helden mit dunklem Geheimnis wollen.'),
    priority: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    armor: L('Light armor', 'Leichte Rüstung'), weapons: L('Simple weapons', 'Einfache Waffen'),
    recSkills: ['arcana', 'deception', 'intimidation', 'investigation'], recSpells: ['chill_touch'], recOptions: ['inv_armor'],
    recBackground: 'acolyte', recKit: 'warlock_occultist', recSpecies: 'tiefling',
  },
};

/** What the levels after the first bring, written from the class table. */
function pathOf(id: ClassId): { level: number; text: L }[] {
  const out: { level: number; text: L }[] = [];
  for (let level = 2; level <= 20; level++) {
    const en: string[] = [], de: string[] = [];
    if (level === SUBCLASS_LEVEL) { en.push(`Subclass ${SRD_CLASSES[id].subclass.name}`); de.push(`Unterklasse ${SUBCLASS_DE[id]}`); }
    for (const f of featuresAt(id, level)) {
      const again = f.levels[0] !== level;
      en.push(again ? `${f.name} improves` : f.name);
      de.push(again ? `${f.de} verbessert sich` : f.de);
    }
    if (SRD_CLASSES[id].asi.includes(level)) { en.push('a feat or +2 to ability scores'); de.push('ein Talent oder +2 auf Attributswerte'); }
    if (level === EPIC_BOON_LEVEL) { en.push('an epic boon'); de.push('eine epische Gabe'); }
    if (en.length) out.push({ level, text: L(`${en.join(', ')}.`, `${de.join(', ')}.`) });
  }
  return out;
}

export const CLASS_GUIDE = Object.fromEntries(CLASS_IDS.map((id) => [id, { ...GUIDES[id], path: pathOf(id) }])) as Record<ClassId, ClassGuide>;


// ------------------------------------------------------------------ species

export interface SpeciesDef extends Option {
  id: SpeciesId;
  size: 'Small' | 'Medium';
  speed: number;
  /** Extra hit points per level. */
  hpPerLevel?: number;
  resist?: string[];
  /** Ability ids from ABILITIES the species grants. */
  grants?: string[];
  /** The player picks one skill from this list. */
  skillChoice?: string[];
  /** The player picks an extra origin feat. */
  originFeat?: boolean;
  /** Suggested names for the "suggest a name" button. */
  names: string[];
}

const ALL_SKILLS = ['acrobatics', 'animal handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight of hand', 'stealth', 'survival'];

const darkvision = (ft: number) => S('Darkvision', `You see in dim light and darkness out to ${ft} ft, without colour.`, `Du siehst in schwachem Licht und Dunkelheit bis zu ${ft} ft weit, allerdings ohne Farben.`);

const species: SpeciesDef[] = [
  {
    id: 'human', name: 'Human', icon: '🧑', size: 'Medium', speed: 30, recommendedFor: ALL, originFeat: true, skillChoice: ALL_SKILLS,
    summary: L('Adaptable and ambitious. An extra skill and an extra feat.', 'Anpassungsfähig und ehrgeizig. Eine zusätzliche Fertigkeit und ein zusätzliches Talent.'),
    description: L('Humans are found in every corner of the world and in every profession. They have no supernatural gifts, but they learn faster than anyone else, which makes them the most flexible choice.', 'Menschen findet man in jedem Winkel der Welt und in jedem Beruf. Sie besitzen keine übernatürlichen Gaben, lernen aber schneller als alle anderen und sind damit die flexibelste Wahl.'),
    effects: [
      E('Skillful', 'Proficiency in one skill of your choice.', 'Übung in einer Fertigkeit deiner Wahl.'),
      E('Versatile', 'An origin feat of your choice, on top of the one from your background.', 'Ein Herkunftstalent deiner Wahl, zusätzlich zu dem deines Hintergrunds.'),
      S('Resourceful', 'You wake from every long rest with Heroic Inspiration; the Dungeon Master may let you reroll a die for it.', 'Du erwachst nach jeder langen Rast mit Heldischer Inspiration; der Spielleiter kann dich dafür einen Würfel neu würfeln lassen.'),
    ],
    goodFor: L('Every class. The extra feat lets you shore up a weakness or double down on a strength.', 'Jede Klasse. Mit dem zusätzlichen Talent gleichst du eine Schwäche aus oder baust eine Stärke weiter aus.'),
    names: ['Aldric', 'Mirela', 'Tomas', 'Isolde', 'Garrick', 'Liesel', 'Bertram', 'Rowena'],
  },
  {
    id: 'dwarf', name: 'Dwarf', icon: '⛏️', size: 'Medium', speed: 30, recommendedFor: ['fighter', 'cleric', 'paladin'], hpPerLevel: 1, resist: ['poison'],
    summary: L('Tough as the stone they come from. More hit points and resistance to poison.', 'Zäh wie der Stein, aus dem sie stammen. Mehr Trefferpunkte und Resistenz gegen Gift.'),
    description: L('Dwarves were shaped in the deep places of the world. They are stubborn, loyal and very hard to bring down, and they see in the dark better than almost anyone.', 'Zwerge wurden in den Tiefen der Welt geformt. Sie sind stur, treu und nur schwer zu Fall zu bringen, und sie sehen im Dunkeln besser als fast alle anderen.'),
    effects: [
      E('Dwarven Toughness', '+1 maximum hit point per level.', '+1 maximaler Trefferpunkt pro Stufe.'),
      E('Dwarven Resilience', 'You take half damage from poison.', 'Du erleidest nur halben Giftschaden.'),
      darkvision(120),
      S('Stonecunning', 'With a moment of concentration you sense movement through stone you are touching.', 'Mit einem Moment der Konzentration spürst du Bewegungen durch Stein, den du berührst.'),
    ],
    goodFor: L('Anyone on the front line. A wizard also appreciates the extra hit points.', 'Alle an der Front. Auch ein Magier freut sich über die zusätzlichen Trefferpunkte.'),
    names: ['Brann', 'Hilda', 'Thorgar', 'Dagna', 'Orsik', 'Gunnloda', 'Baern', 'Vistra'],
  },
  {
    id: 'elf', name: 'Elf', icon: '🧝', size: 'Medium', speed: 35, recommendedFor: ['rogue', 'wizard', 'ranger', 'druid'], skillChoice: ['insight', 'perception', 'survival'],
    summary: L('Graceful, long-lived and sharp-eyed. Faster on their feet, with an extra skill.', 'Anmutig, langlebig und scharfäugig. Schneller zu Fuß, mit einer zusätzlichen Fertigkeit.'),
    description: L('Elves live for centuries and it shows: they move with unhurried grace and notice what others miss. Hearthforge uses the wood elf lineage, whose members are especially swift.', 'Elfen leben Jahrhunderte, und das merkt man: Sie bewegen sich mit ruhiger Anmut und bemerken, was anderen entgeht. Hearthforge verwendet die Abstammung der Waldelfen, die besonders flink sind.'),
    effects: [
      E('Fleet of Foot', 'Your speed is 35 ft instead of 30 ft: one more tile of movement each turn.', 'Deine Bewegungsrate beträgt 35 ft statt 30 ft: ein Feld mehr Bewegung pro Zug.'),
      E('Keen Senses', 'Proficiency in Insight, Perception or Survival.', 'Übung in Motiv erkennen, Wahrnehmung oder Überlebenskunst.'),
      darkvision(60),
      S('Fey Ancestry', 'You have advantage on saves against being charmed.', 'Du hast Vorteil bei Rettungswürfen dagegen, bezaubert zu werden.'),
      S('Trance', 'You do not sleep; four hours of meditation are a long rest for you.', 'Du schläfst nicht; vier Stunden Meditation sind für dich eine lange Rast.'),
    ],
    goodFor: L('Rogues and wizards, who both live from staying out of reach.', 'Schurken und Magier, die beide davon leben, außer Reichweite zu bleiben.'),
    names: ['Elowen', 'Thalion', 'Sariel', 'Faelar', 'Lirael', 'Aerendyl', 'Naivara', 'Ilmar'],
  },
  {
    id: 'halfling', name: 'Halfling', icon: '🍀', size: 'Small', speed: 30, recommendedFor: ['rogue', 'bard'],
    summary: L('Small, cheerful and uncannily lucky. Rerolls natural 1s.', 'Klein, fröhlich und unheimlich vom Glück verfolgt. Würfelt natürliche Einsen neu.'),
    description: L('Halflings prefer a warm hearth to a cold road, but when they do go adventuring, fortune seems to walk beside them. They slip past larger folk and are not easily scared.', 'Halblinge ziehen den warmen Herd der kalten Straße vor, doch wenn sie auf Abenteuer gehen, scheint das Glück an ihrer Seite zu wandern. Sie schlüpfen an größeren Leuten vorbei und lassen sich nicht leicht einschüchtern.'),
    effects: [
      E('Luck', 'When you roll a 1 on the d20 of an attack, ability check or death save, you roll again and use the new result.', 'Wenn du bei einem Angriff, Attributswurf oder Todesrettungswurf eine 1 auf dem W20 würfelst, würfelst du erneut und nimmst das neue Ergebnis.'),
      S('Brave', 'You have advantage on saves against being frightened.', 'Du hast Vorteil bei Rettungswürfen dagegen, verängstigt zu werden.'),
      S('Naturally Stealthy', 'You can hide behind a creature that is larger than you.', 'Du kannst dich hinter einer Kreatur verstecken, die größer ist als du.'),
    ],
    goodFor: L('Rogues above all, but luck never hurts anyone who rolls dice.', 'Vor allem Schurken, aber Glück schadet niemandem, der Würfel wirft.'),
    names: ['Vex', 'Nim', 'Rosie', 'Milo', 'Sable', 'Pip', 'Callie', 'Finnan'],
  },
  {
    id: 'gnome', name: 'Gnome', icon: '🧙', size: 'Small', speed: 30, recommendedFor: ['wizard'],
    summary: L('Curious tinkerers with a mind that is hard to fool. Mostly story benefits.', 'Neugierige Tüftler mit einem Verstand, der sich kaum täuschen lässt. Vor allem erzählerische Vorteile.'),
    description: L('Gnomes meet the world with wide eyes and a notebook. Their quick minds resist magic that tries to bend thought. In this game their gifts mostly matter in the story, not on the battle grid.', 'Gnome begegnen der Welt mit großen Augen und einem Notizbuch. Ihr wacher Verstand widersteht Magie, die Gedanken verbiegen will. In diesem Spiel zählen ihre Gaben vor allem in der Geschichte, weniger auf dem Kampffeld.'),
    effects: [
      darkvision(60),
      S('Gnomish Cunning', 'You have advantage on Intelligence, Wisdom and Charisma saves.', 'Du hast Vorteil bei Intelligenz-, Weisheits- und Charismarettungswürfen.'),
      S('Tinker', 'You can mend small things and build little clockwork toys.', 'Du kannst kleine Dinge reparieren und winzige Uhrwerkspielzeuge bauen.'),
    ],
    goodFor: L('Wizards and anyone who picks a character for the story first.', 'Magier und alle, die einen Charakter zuerst wegen der Geschichte wählen.'),
    names: ['Mirth', 'Fizzwick', 'Nyx', 'Bimble', 'Orla', 'Wrenn', 'Zook', 'Tana'],
  },
  {
    id: 'orc', name: 'Orc', icon: '🪓', size: 'Medium', speed: 30, recommendedFor: ['fighter', 'barbarian'], grants: ['adrenaline_rush'],
    summary: L('Fierce and enduring. Refuses to fall, and closes the distance in a burst.', 'Wild und ausdauernd. Weigert sich zu fallen und überbrückt Distanz in einem Ansturm.'),
    description: L('Orcs carry a restless strength that pushes them onward when others stop. An orc who should have gone down is often still standing, and angrier than before.', 'Orks tragen eine rastlose Kraft in sich, die sie weitertreibt, wenn andere stehen bleiben. Ein Ork, der längst hätte fallen müssen, steht oft noch und ist wütender als zuvor.'),
    effects: [
      E('Relentless Endurance', 'Once per rest, when damage would drop you to 0 hit points, you stay at 1 instead.', 'Einmal pro Rast bleibst du bei 1 Trefferpunkt, wenn Schaden dich auf 0 bringen würde.'),
      E('Adrenaline Rush', 'Once per rest, a bonus action gives you extra movement equal to your speed.', 'Einmal pro Rast verschafft dir eine Bonusaktion zusätzliche Bewegung in Höhe deiner Bewegungsrate.'),
      darkvision(120),
    ],
    goodFor: L('Fighters and anyone else who wades into melee.', 'Kämpfer und alle anderen, die sich in den Nahkampf stürzen.'),
    names: ['Grusha', 'Thokk', 'Keth', 'Morga', 'Urzul', 'Dench', 'Sharn', 'Varg'],
  },
  {
    id: 'dragonborn', name: 'Dragonborn', icon: '🐲', size: 'Medium', speed: 30, recommendedFor: ['fighter', 'cleric', 'paladin', 'sorcerer'], grants: ['breath_weapon'], resist: ['fire'],
    summary: L('Proud heirs of dragons. Breathe fire and shrug off flames.', 'Stolze Erben der Drachen. Speien Feuer und trotzen den Flammen.'),
    description: L('Dragonborn hatch with the power of their draconic ancestors in their blood. Hearthforge uses the fire ancestry of red and gold dragons: your breath burns, and fire harms you less.', 'Drachenblütige schlüpfen mit der Macht ihrer drachischen Ahnen im Blut. Hearthforge verwendet die Feuerabstammung roter und goldener Drachen: Dein Odem brennt, und Feuer schadet dir weniger.'),
    effects: [
      E('Breath Weapon', 'Once per rest: the target and every enemy next to it make a DEX save or take 1d10 fire damage (half on a success). 2d10 from level 5.', 'Einmal pro Rast: Das Ziel und jeder Gegner daneben legen einen GES-Rettungswurf ab oder erleiden 1W10 Feuerschaden (halber Schaden bei Erfolg). Ab Stufe 5 2W10.'),
      E('Draconic Resistance', 'You take half damage from fire.', 'Du erleidest nur halben Feuerschaden.'),
      darkvision(60),
    ],
    goodFor: L('Front-line characters, who are close enough to catch several enemies in the flames.', 'Charaktere an der Front, die nah genug stehen, um mehrere Gegner in die Flammen zu bekommen.'),
    names: ['Kaelith', 'Arjhan', 'Sora', 'Rhogar', 'Vyra', 'Medrash', 'Nala', 'Torinn'],
  },
  {
    id: 'tiefling', name: 'Tiefling', icon: '😈', size: 'Medium', speed: 30, recommendedFor: ['wizard', 'rogue', 'warlock', 'sorcerer'], grants: ['fire_bolt'], resist: ['fire'],
    summary: L('Marked by an infernal bloodline. Knows Fire Bolt and resists fire.', 'Gezeichnet von einer infernalischen Blutlinie. Beherrscht Feuerpfeil und widersteht Feuer.'),
    description: L('Somewhere in a tiefling\'s family tree, someone made a deal. Horns, a tail and a spark of hellfire are the inheritance. Hearthforge uses the infernal legacy.', 'Irgendwo im Stammbaum eines Tieflings hat jemand einen Pakt geschlossen. Hörner, ein Schweif und ein Funke Höllenfeuer sind das Erbe. Hearthforge verwendet das infernalische Vermächtnis.'),
    effects: [
      E('Infernal Legacy', 'You know the Fire Bolt cantrip, whatever your class. It uses your best mental ability if your class does not cast spells.', 'Du beherrschst den Zaubertrick Feuerpfeil, unabhängig von deiner Klasse. Er nutzt dein bestes geistiges Attribut, falls deine Klasse nicht zaubert.'),
      E('Fiendish Resistance', 'You take half damage from fire.', 'Du erleidest nur halben Feuerschaden.'),
      darkvision(60),
      S('Otherworldly Presence', 'You can make your voice boom, flames flicker or doors slam with a minor magical trick.', 'Mit einem kleinen magischen Kniff lässt du deine Stimme dröhnen, Flammen flackern oder Türen zuschlagen.'),
    ],
    goodFor: L('A rogue or fighter who wants a ranged attack that needs no ammunition, and any wizard.', 'Ein Schurke oder Kämpfer, der einen Fernangriff ohne Munition möchte, und jeder Magier.'),
    names: ['Zarek', 'Nemeia', 'Kairon', 'Orianna', 'Damakos', 'Rieta', 'Mordai', 'Akta'],
  },
  {
    id: 'goliath', name: 'Goliath', icon: '🏔️', size: 'Medium', speed: 35, recommendedFor: ['fighter', 'barbarian', 'monk'],
    summary: L('Towering mountain folk, distantly related to giants. Long strides.', 'Hünenhaftes Bergvolk, entfernt mit Riesen verwandt. Lange Schritte.'),
    description: L('Goliaths grow up on high peaks where every day is a contest. They are taller than any other people, and a single step of theirs covers a lot of ground.', 'Goliaths wachsen auf hohen Gipfeln auf, wo jeder Tag ein Wettstreit ist. Sie sind größer als jedes andere Volk, und ein einziger ihrer Schritte überwindet viel Boden.'),
    effects: [
      E('Long Stride', 'Your speed is 35 ft instead of 30 ft: one more tile of movement each turn.', 'Deine Bewegungsrate beträgt 35 ft statt 30 ft: ein Feld mehr Bewegung pro Zug.'),
      S('Powerful Build', 'You lift, carry and push like a creature one size larger, and break free of a grapple more easily.', 'Du hebst, trägst und schiebst wie eine Kreatur der nächsten Größenkategorie und befreist dich leichter aus einem Haltegriff.'),
      S('Giant Ancestry', 'The blood of giants lets you shrug off a blow or shove a foe now and then, as the Dungeon Master sees fit.', 'Das Blut der Riesen lässt dich hin und wieder einen Schlag abschütteln oder einen Gegner wegstoßen, wie es der Spielleiter für passend hält.'),
    ],
    goodFor: L('Melee fighters who need to reach the enemy quickly.', 'Nahkämpfer, die schnell beim Gegner sein müssen.'),
    names: ['Aukan', 'Thalai', 'Vimak', 'Orilo', 'Keothi', 'Gae-Al', 'Manneo', 'Paavu'],
  },
];
export const SPECIES = Object.fromEntries(species.map((s) => [s.id, s])) as Record<SpeciesId, SpeciesDef>;

// -------------------------------------------------------------- backgrounds

export interface BackgroundDef extends Option {
  id: BackgroundId;
  /** The three abilities the background may raise. */
  abilities: AbilityKey[];
  skills: string[];
  feat: FeatId;
  bag: { id: string; qty?: number }[];
  gold: number;
}

const backgrounds: BackgroundDef[] = [
  {
    id: 'acolyte', name: 'Acolyte', icon: '📿', recommendedFor: ['cleric', 'bard', 'sorcerer', 'warlock'], abilities: ['int', 'wis', 'cha'], skills: ['insight', 'religion'], feat: 'magic_initiate_cleric',
    bag: [{ id: 'holy_symbol' }], gold: 8,
    summary: L('Raised in a temple. Reads people and knows the gods, and learned a little divine magic.', 'In einem Tempel aufgewachsen. Durchschaut Menschen, kennt die Götter und hat ein wenig göttliche Magie gelernt.'),
    description: L('You spent your youth in service to a temple, between prayer, chores and the worries of the people who came for help.', 'Du hast deine Jugend im Dienst eines Tempels verbracht, zwischen Gebet, Pflichten und den Sorgen der Menschen, die Hilfe suchten.'),
    effects: [
      E('Ability scores', '+2 and +1, or +1 to all three: Intelligence, Wisdom, Charisma.', '+2 und +1 oder +1 auf alle drei: Intelligenz, Weisheit, Charisma.'),
      E('Skills', 'Proficiency in Insight and Religion.', 'Übung in Motiv erkennen und Religion.'),
      E('Feat: Magic Initiate (Cleric)', 'A cleric cantrip and a 1st-level cleric spell, with 2 mana to cast it.', 'Ein Kleriker-Zaubertrick und ein Klerikerzauber des 1. Grades, dazu 2 Mana, um ihn zu wirken.'),
      E('Equipment', 'A holy symbol and 8 gp.', 'Ein heiliges Symbol und 8 GM.'),
    ],
    goodFor: L('Clerics get a third spell. A fighter or rogue gains a healing spell for emergencies.', 'Kleriker erhalten einen dritten Zauber. Ein Kämpfer oder Schurke bekommt einen Heilzauber für Notfälle.'),
  },
  {
    id: 'criminal', name: 'Criminal', icon: '🗝️', recommendedFor: ['rogue'], abilities: ['dex', 'con', 'int'], skills: ['sleight of hand', 'stealth'], feat: 'alert',
    bag: [{ id: 'dagger', qty: 2 }, { id: 'thieves_tools' }], gold: 16,
    summary: L('Made a living outside the law. Quiet, quick-fingered and always first to react.', 'Hat jenseits des Gesetzes gelebt. Leise, fingerfertig und immer als Erster bereit.'),
    description: L('You learned your trade in back alleys: picking pockets, opening doors that were meant to stay shut, and noticing trouble before it noticed you.', 'Du hast dein Handwerk in Hinterhöfen gelernt: Taschen leeren, Türen öffnen, die verschlossen bleiben sollten, und Ärger bemerken, bevor er dich bemerkt.'),
    effects: [
      E('Ability scores', '+2 and +1, or +1 to all three: Dexterity, Constitution, Intelligence.', '+2 und +1 oder +1 auf alle drei: Geschicklichkeit, Konstitution, Intelligenz.'),
      E('Skills', 'Proficiency in Sleight of Hand and Stealth.', 'Übung in Fingerfertigkeit und Heimlichkeit.'),
      E('Feat: Alert', 'You add your proficiency bonus to initiative, so you act earlier in combat.', 'Du addierst deinen Übungsbonus auf die Initiative und handelst im Kampf früher.'),
      E('Equipment', 'Two daggers, thieves\' tools and 16 gp.', 'Zwei Dolche, Diebeswerkzeug und 16 GM.'),
    ],
    goodFor: L('Rogues, and wizards who want Dexterity, Constitution and a high initiative.', 'Schurken und Magier, die Geschicklichkeit, Konstitution und hohe Initiative wollen.'),
  },
  {
    id: 'sage', name: 'Sage', icon: '📚', recommendedFor: ['wizard', 'druid'], abilities: ['con', 'int', 'wis'], skills: ['arcana', 'history'], feat: 'magic_initiate_wizard',
    bag: [{ id: 'quarterstaff' }], gold: 8,
    summary: L('Years among books and scrolls. Knows lore and history, and picked up some wizardry.', 'Jahre zwischen Büchern und Schriftrollen. Kennt Sagen und Geschichte und hat etwas Magierkunst aufgeschnappt.'),
    description: L('You travelled between libraries and universities, copying, arguing and collecting knowledge. Somewhere among the pages you learned your first spells.', 'Du bist zwischen Bibliotheken und Universitäten gereist, hast kopiert, gestritten und Wissen gesammelt. Irgendwo zwischen den Seiten hast du deine ersten Zauber gelernt.'),
    effects: [
      E('Ability scores', '+2 and +1, or +1 to all three: Constitution, Intelligence, Wisdom.', '+2 und +1 oder +1 auf alle drei: Konstitution, Intelligenz, Weisheit.'),
      E('Skills', 'Proficiency in Arcana and History.', 'Übung in Arkane Kunde und Geschichte.'),
      E('Feat: Magic Initiate (Wizard)', 'A wizard cantrip and a 1st-level wizard spell, with 2 mana to cast it.', 'Ein Magier-Zaubertrick und ein Magierzauber des 1. Grades, dazu 2 Mana, um ihn zu wirken.'),
      E('Equipment', 'A quarterstaff and 8 gp.', 'Ein Kampfstab und 8 GM.'),
    ],
    goodFor: L('Wizards gain a third cantrip, a third spell and more mana. Clerics get a strong ranged cantrip.', 'Magier erhalten einen dritten Zaubertrick, einen dritten Zauber und mehr Mana. Kleriker bekommen einen starken Fernkampf-Zaubertrick.'),
  },
  {
    id: 'soldier', name: 'Soldier', icon: '🎖️', recommendedFor: ['fighter', 'barbarian', 'monk', 'paladin', 'ranger'], abilities: ['str', 'dex', 'con'], skills: ['athletics', 'intimidation'], feat: 'savage_attacker',
    bag: [{ id: 'spear' }, { id: 'shortbow' }], gold: 14,
    summary: L('Trained for war. Strong, intimidating and deadly with any weapon.', 'Für den Krieg ausgebildet. Stark, einschüchternd und tödlich mit jeder Waffe.'),
    description: L('You marched, drilled and fought in someone\'s army. The discipline never left you, and neither did the reflex to hit where it counts.', 'Du bist in irgendeiner Armee marschiert, hast exerziert und gekämpft. Die Disziplin ist geblieben, ebenso der Reflex, dort zu treffen, wo es zählt.'),
    effects: [
      E('Ability scores', '+2 and +1, or +1 to all three: Strength, Dexterity, Constitution.', '+2 und +1 oder +1 auf alle drei: Stärke, Geschicklichkeit, Konstitution.'),
      E('Skills', 'Proficiency in Athletics and Intimidation.', 'Übung in Athletik und Einschüchtern.'),
      E('Feat: Savage Attacker', 'Once per turn, when you hit with a weapon, you roll its damage dice twice and keep the higher result.', 'Einmal pro Zug würfelst du bei einem Waffentreffer die Schadenswürfel zweimal und behältst das höhere Ergebnis.'),
      E('Equipment', 'A spear, a shortbow and 14 gp.', 'Ein Speer, ein Kurzbogen und 14 GM.'),
    ],
    goodFor: L('Fighters and anyone who attacks with weapons. Of little use to a wizard.', 'Kämpfer und alle, die mit Waffen angreifen. Für einen Magier kaum von Nutzen.'),
  },
];
export const BACKGROUNDS = Object.fromEntries(backgrounds.map((b) => [b.id, b])) as Record<BackgroundId, BackgroundDef>;

// -------------------------------------------------------------------- feats

export interface FeatDef extends Option {
  id: FeatId;
  /** Origin feats can be taken at level 1; the others only from level 4. */
  origin: boolean;
  /** The line the feat adds to the character sheet. */
  feature: string;
  /** An epic boon: only from level 19, and its ability increase may go up to 30. */
  epic?: boolean;
  /** The feat raises one of these abilities by 1. */
  boost?: AbilityKey[];
  spellList?: 'wizard' | 'cleric';
}

const feats: FeatDef[] = [
  {
    id: 'asi', name: 'Ability Score Improvement', icon: '📈', origin: false, recommendedFor: ALL, feature: '',
    summary: L('+2 to one ability score, or +1 to two.', '+2 auf einen Attributswert oder +1 auf zwei.'),
    description: L('Training pays off. Raising your most important ability improves almost everything your class does: attacks, damage, spell DCs or hit points.', 'Übung macht sich bezahlt. Dein wichtigstes Attribut zu erhöhen verbessert fast alles, was deine Klasse tut: Angriffe, Schaden, Zauber-SG oder Trefferpunkte.'),
    effects: [
      E('Increase', 'Raise one ability score by 2, or two scores by 1 each, to a maximum of 20.', 'Erhöhe einen Attributswert um 2 oder zwei Werte um je 1, bis höchstens 20.'),
      E('Even numbers matter', 'The modifier rises at every even score: 16 gives +3, 18 gives +4.', 'Der Modifikator steigt bei jedem geraden Wert: 16 ergibt +3, 18 ergibt +4.'),
    ],
    goodFor: L('Almost always the strongest choice until your main ability reaches 18 or 20.', 'Fast immer die stärkste Wahl, bis dein Hauptattribut 18 oder 20 erreicht.'),
  },
  {
    id: 'alert', name: 'Alert', icon: '👁️', origin: true, recommendedFor: ['rogue', 'wizard'], feature: 'Alert: add your proficiency bonus to initiative',
    summary: L('Add your proficiency bonus to initiative.', 'Addiere deinen Übungsbonus auf die Initiative.'),
    description: L('You are never caught off guard. Acting before the monsters often decides a fight: a wizard can clear the room, a rogue can strike before the enemy moves.', 'Du lässt dich nie überrumpeln. Vor den Monstern zu handeln entscheidet oft einen Kampf: Ein Magier kann den Raum leeren, ein Schurke zuschlagen, bevor sich der Gegner rührt.'),
    effects: [E('Initiative', 'You add your proficiency bonus (+2, later +3) to every initiative roll.', 'Du addierst deinen Übungsbonus (+2, später +3) auf jeden Initiativewurf.')],
    goodFor: L('Rogues and wizards, who gain the most from acting first.', 'Schurken und Magier, die am meisten davon haben, zuerst zu handeln.'),
  },
  {
    id: 'savage_attacker', name: 'Savage Attacker', icon: '🩸', origin: true, recommendedFor: ['fighter'], feature: 'Savage Attacker: once per turn, roll weapon damage twice and keep the higher',
    summary: L('Once per turn, roll weapon damage twice and keep the higher result.', 'Einmal pro Zug Waffenschaden zweimal würfeln und das höhere Ergebnis behalten.'),
    description: L('You have learned to make every hit count. The bigger your weapon\'s dice, the more this is worth: a greatsword gains far more than a dagger.', 'Du hast gelernt, jeden Treffer auszukosten. Je größer die Würfel deiner Waffe, desto mehr ist das wert: Ein Zweihänder profitiert weit mehr als ein Dolch.'),
    effects: [E('Damage', 'On your first weapon hit each turn, the weapon\'s damage dice are rolled twice and the higher total is used.', 'Bei deinem ersten Waffentreffer in jedem Zug werden die Schadenswürfel der Waffe zweimal gewürfelt und das höhere Ergebnis zählt.')],
    goodFor: L('Fighters with big weapons. No effect on spells.', 'Kämpfer mit großen Waffen. Keine Wirkung auf Zauber.'),
  },
  {
    id: 'skilled', name: 'Skilled', icon: '🎓', origin: true, recommendedFor: ['rogue'], feature: 'Skilled: three extra skill proficiencies',
    summary: L('Proficiency in three more skills.', 'Übung in drei weiteren Fertigkeiten.'),
    description: L('You have picked up a bit of everything. Outside combat the Dungeon Master asks for skill checks all the time, and being proficient adds your proficiency bonus to each of them.', 'Du hast von allem ein wenig gelernt. Außerhalb des Kampfes verlangt der Spielleiter ständig Fertigkeitswürfe, und Übung addiert deinen Übungsbonus auf jeden davon.'),
    effects: [E('Skills', 'Choose three skills you are not yet proficient in.', 'Wähle drei Fertigkeiten, in denen du noch nicht geübt bist.')],
    goodFor: L('Solo players and small parties, where one hero has to cover many situations.', 'Solospieler und kleine Gruppen, in denen ein Held viele Situationen abdecken muss.'),
  },
  {
    id: 'magic_initiate_cleric', name: 'Magic Initiate (Cleric)', icon: '🕯️', origin: true, recommendedFor: ['fighter', 'cleric'], spellList: 'cleric', feature: 'Magic Initiate (Cleric): a cleric cantrip, a 1st-level cleric spell and 2 extra mana',
    summary: L('Learn a cleric cantrip and a 1st-level cleric spell.', 'Lerne einen Kleriker-Zaubertrick und einen Klerikerzauber des 1. Grades.'),
    description: L('A touch of divine magic. The usual reason to take this is a healing spell on a character who otherwise has none.', 'Ein Hauch göttlicher Magie. Meist nimmt man dieses Talent für einen Heilzauber auf einem Charakter, der sonst keinen hat.'),
    effects: [
      E('Spells', 'You learn one cleric cantrip you do not know yet (if there is one) and one 1st-level cleric spell.', 'Du lernst einen Kleriker-Zaubertrick, den du noch nicht kennst (falls es einen gibt), und einen Klerikerzauber des 1. Grades.'),
      E('Mana', '+2 maximum mana: enough to cast the spell once per rest, on top of what your class gives.', '+2 maximales Mana: genug, um den Zauber einmal pro Rast zu wirken, zusätzlich zu dem, was deine Klasse gibt.'),
      E('Casting ability', 'Uses your class\'s spellcasting ability, or your best of Intelligence, Wisdom and Charisma.', 'Nutzt das Zauberattribut deiner Klasse oder das beste aus Intelligenz, Weisheit und Charisma.'),
    ],
    goodFor: L('Parties without a cleric, and clerics who want one more spell.', 'Gruppen ohne Kleriker und Kleriker, die einen weiteren Zauber wollen.'),
  },
  {
    id: 'magic_initiate_wizard', name: 'Magic Initiate (Wizard)', icon: '🪄', origin: true, recommendedFor: ['wizard', 'cleric'], spellList: 'wizard', feature: 'Magic Initiate (Wizard): a wizard cantrip, a 1st-level wizard spell and 2 extra mana',
    summary: L('Learn a wizard cantrip and a 1st-level wizard spell.', 'Lerne einen Magier-Zaubertrick und einen Magierzauber des 1. Grades.'),
    description: L('A little arcane training. It gives a non-wizard a ranged attack that never runs out, and gives a wizard more of what they do best.', 'Ein wenig arkane Ausbildung. Sie gibt einem Nichtmagier einen Fernangriff, der nie ausgeht, und einem Magier mehr von dem, was er am besten kann.'),
    effects: [
      E('Spells', 'You learn one wizard cantrip you do not know yet and one 1st-level wizard spell.', 'Du lernst einen Magier-Zaubertrick, den du noch nicht kennst, und einen Magierzauber des 1. Grades.'),
      E('Mana', '+2 maximum mana: enough to cast the spell once per rest, on top of what your class gives.', '+2 maximales Mana: genug, um den Zauber einmal pro Rast zu wirken, zusätzlich zu dem, was deine Klasse gibt.'),
      E('Casting ability', 'Uses your class\'s spellcasting ability, or your best of Intelligence, Wisdom and Charisma.', 'Nutzt das Zauberattribut deiner Klasse oder das beste aus Intelligenz, Weisheit und Charisma.'),
    ],
    goodFor: L('Wizards, and clerics who want a stronger ranged cantrip than they can get otherwise.', 'Magier und Kleriker, die einen stärkeren Fernkampf-Zaubertrick wollen, als sie sonst bekommen.'),
  },
  {
    id: 'grappler', name: 'Grappler', icon: '🤼', origin: false, recommendedFor: [], boost: ['str', 'dex'], feature: 'Grappler: +1 Strength or Dexterity; you are skilled at seizing and holding foes',
    summary: L('+1 Strength or Dexterity, and a knack for wrestling.', '+1 Stärke oder Geschicklichkeit und ein Händchen fürs Ringen.'),
    description: L('You have learned to seize an enemy and keep hold of it. The ability increase is applied by the game; grabbing and holding is played out by the Dungeon Master.', 'Du hast gelernt, einen Gegner zu packen und festzuhalten. Die Attributserhöhung wendet das Spiel an; das Packen und Halten spielt der Spielleiter aus.'),
    effects: [
      E('Increase', 'Raise Strength or Dexterity by 1, to a maximum of 20.', 'Erhöhe Stärke oder Geschicklichkeit um 1, bis höchstens 20.'),
      S('Punch and Grab', 'When you hit with an unarmed strike you can also grapple the target, and you attack it with advantage while you hold it.', 'Wenn du mit einem waffenlosen Schlag triffst, kannst du das Ziel zugleich packen, und du greifst es mit Vorteil an, solange du es hältst.'),
    ],
    goodFor: L('Heroes with an odd Strength or Dexterity score who like to brawl.', 'Helden mit ungeradem Stärke- oder Geschicklichkeitswert, die gern raufen.'),
  },
  {
    id: 'boon_combat_prowess', name: 'Boon of Combat Prowess', icon: '🏆', origin: false, epic: true, recommendedFor: ['fighter', 'barbarian', 'paladin', 'ranger', 'monk', 'rogue'], boost: ['str', 'dex', 'con', 'int', 'wis', 'cha'], feature: 'Boon of Combat Prowess: once per turn, an attack that misses hits instead',
    summary: L('+1 to an ability score, and once per turn a miss becomes a hit.', '+1 auf einen Attributswert, und einmal pro Zug wird aus einem Fehlschlag ein Treffer.'),
    description: L('Your aim no longer fails you. The first attack you miss on each of your turns hits anyway.', 'Deine Treffsicherheit lässt dich nicht mehr im Stich. Der erste Angriff, den du in jedem deiner Züge verfehlst, trifft trotzdem.'),
    effects: [
      E('Increase', 'Raise one ability score by 1, to a maximum of 30.', 'Erhöhe einen Attributswert um 1, bis höchstens 30.'),
      E('Peerless Aim', 'Once on each of your turns, an attack roll that misses hits instead.', 'Einmal in jedem deiner Züge trifft ein Angriffswurf, der verfehlt, stattdessen.'),
    ],
    goodFor: L('Anyone who attacks with weapons.', 'Alle, die mit Waffen angreifen.'),
  },
  {
    id: 'boon_irresistible_offense', name: 'Boon of Irresistible Offense', icon: '🗡️', origin: false, epic: true, recommendedFor: ['fighter', 'barbarian', 'rogue'], boost: ['str', 'dex'], feature: 'Boon of Irresistible Offense: your weapon damage ignores resistance, and a natural 20 deals extra damage equal to your Strength or Dexterity score',
    summary: L('+1 Strength or Dexterity; your weapons ignore resistance and a natural 20 hits far harder.', '+1 Stärke oder Geschicklichkeit; deine Waffen ignorieren Resistenzen, und eine natürliche 20 trifft weit härter.'),
    description: L('Nothing turns your blows aside. Creatures that halve bludgeoning, piercing or slashing damage take it in full from you.', 'Nichts lenkt deine Hiebe ab. Kreaturen, die Hieb-, Stich- oder Wuchtschaden halbieren, erleiden ihn von dir in voller Höhe.'),
    effects: [
      E('Increase', 'Raise Strength or Dexterity by 1, to a maximum of 30.', 'Erhöhe Stärke oder Geschicklichkeit um 1, bis höchstens 30.'),
      E('Overcome Defenses', 'Your bludgeoning, piercing and slashing damage ignores resistance.', 'Dein Hieb-, Stich- und Wuchtschaden ignoriert Resistenzen.'),
      E('Overwhelming Strike', 'A weapon attack that rolls a 20 deals extra damage equal to the higher of your Strength and Dexterity scores.', 'Ein Waffenangriff, der eine 20 würfelt, verursacht Zusatzschaden in Höhe des höheren deiner Werte für Stärke und Geschicklichkeit.'),
    ],
    goodFor: L('Weapon users who meet many resistant monsters at high level.', 'Waffenkämpfer, die auf hoher Stufe vielen resistenten Monstern begegnen.'),
  },
  {
    id: 'boon_spell_recall', name: 'Boon of Spell Recall', icon: '♻️', origin: false, epic: true, recommendedFor: ['wizard', 'cleric', 'bard', 'druid', 'sorcerer', 'warlock'], boost: ['int', 'wis', 'cha'], feature: 'Boon of Spell Recall: a spell of 1st to 4th level has a one in four chance to cost no mana',
    summary: L('+1 Intelligence, Wisdom or Charisma; one spell in four costs no mana.', '+1 Intelligenz, Weisheit oder Charisma; jeder vierte Zauber kostet kein Mana.'),
    description: L('Magic sometimes flows back into you. Each time you cast a spell of 1st to 4th level there is a one in four chance that it costs nothing.', 'Manchmal fließt die Magie in dich zurück. Jedes Mal, wenn du einen Zauber des 1. bis 4. Grades wirkst, kostet er mit einer Chance von eins zu vier nichts.'),
    effects: [
      E('Increase', 'Raise Intelligence, Wisdom or Charisma by 1, to a maximum of 30.', 'Erhöhe Intelligenz, Weisheit oder Charisma um 1, bis höchstens 30.'),
      E('Free Casting', 'A spell of 1st to 4th level costs no mana one time in four.', 'Ein Zauber des 1. bis 4. Grades kostet in einem von vier Fällen kein Mana.'),
    ],
    goodFor: L('Every caster.', 'Jeden Zauberwirker.'),
  },
  {
    id: 'boon_fate', name: 'Boon of Fate', icon: '🎲', origin: false, epic: true, recommendedFor: [], boost: ['str', 'dex', 'con', 'int', 'wis', 'cha'], feature: 'Boon of Fate: once per fight, add 2d4 to a saving throw you would fail',
    summary: L('+1 to an ability score, and fate tips one saving throw per fight your way.', '+1 auf einen Attributswert, und das Schicksal neigt einen Rettungswurf pro Kampf zu deinen Gunsten.'),
    description: L('You can nudge what is about to happen. The first saving throw you would fail in each fight gets 2d4 added.', 'Du kannst dem, was gleich geschieht, einen Stoß geben. Der erste Rettungswurf, der dir in jedem Kampf misslingen würde, erhält 2W4 dazu.'),
    effects: [
      E('Increase', 'Raise one ability score by 1, to a maximum of 30.', 'Erhöhe einen Attributswert um 1, bis höchstens 30.'),
      E('Improve Fate', 'Once per fight, 2d4 is added to a saving throw you would fail.', 'Einmal pro Kampf werden 2W4 auf einen Rettungswurf addiert, der dir misslingen würde.'),
    ],
    goodFor: L('Heroes who fear one bad save more than anything.', 'Helden, die einen einzigen schlechten Rettungswurf mehr fürchten als alles andere.'),
  },
  {
    id: 'boon_truesight', name: 'Boon of Truesight', icon: '👁️', origin: false, epic: true, recommendedFor: [], boost: ['str', 'dex', 'con', 'int', 'wis', 'cha'], feature: 'Boon of Truesight: you see in darkness out to 60 ft',
    summary: L('+1 to an ability score, and truesight out to 60 ft.', '+1 auf einen Attributswert und Wahrer Blick bis 60 ft.'),
    description: L('Darkness hides nothing from you within 60 ft. Seeing through illusions and shape-changers is played out by the Dungeon Master.', 'Dunkelheit verbirgt im Umkreis von 60 ft nichts vor dir. Das Durchschauen von Illusionen und Gestaltwandlern spielt der Spielleiter aus.'),
    effects: [
      E('Increase', 'Raise one ability score by 1, to a maximum of 30.', 'Erhöhe einen Attributswert um 1, bis höchstens 30.'),
      E('Truesight', 'You see normally in darkness within 60 ft.', 'Du siehst im Umkreis von 60 ft in Dunkelheit normal.'),
    ],
    goodFor: L('Heroes without darkvision.', 'Helden ohne Dunkelsicht.'),
  },
  {
    id: 'boon_night_spirit', name: 'Boon of the Night Spirit', icon: '🌒', origin: false, epic: true, recommendedFor: [], boost: ['str', 'dex', 'con', 'int', 'wis', 'cha'], feature: 'Boon of the Night Spirit: in dim light or darkness you resist all damage except psychic and radiant',
    summary: L('+1 to an ability score; outside bright light you resist almost all damage.', '+1 auf einen Attributswert; außerhalb von hellem Licht bist du gegen fast jeden Schaden resistent.'),
    description: L('The night takes you in. While you stand in dim light or darkness in a fight, you take half damage from everything but psychic and radiant damage.', 'Die Nacht nimmt dich auf. Solange du im Kampf in schwachem Licht oder Dunkelheit stehst, erleidest du halben Schaden durch alles außer psychischem und gleißendem Schaden.'),
    effects: [
      E('Increase', 'Raise one ability score by 1, to a maximum of 30.', 'Erhöhe einen Attributswert um 1, bis höchstens 30.'),
      E('Shadowy Form', 'In dim light or darkness you resist all damage except psychic and radiant.', 'In schwachem Licht oder Dunkelheit bist du gegen jeden Schaden außer psychischem und gleißendem resistent.'),
    ],
    goodFor: L('Heroes who fight underground and at night.', 'Helden, die unter der Erde und bei Nacht kämpfen.'),
  },
  {
    id: 'boon_dimensional_travel', name: 'Boon of Dimensional Travel', icon: '🌀', origin: false, epic: true, recommendedFor: [], boost: ['str', 'dex', 'con', 'int', 'wis', 'cha'], feature: 'Boon of Dimensional Travel: after an attack or a spell you may teleport up to 30 ft',
    summary: L('+1 to an ability score, and short teleports after you act.', '+1 auf einen Attributswert und kurze Teleportationen nach deiner Aktion.'),
    description: L('Space bends around you. The ability increase is applied by the game; the teleport is played out by the Dungeon Master.', 'Der Raum krümmt sich um dich. Die Attributserhöhung wendet das Spiel an; die Teleportation spielt der Spielleiter aus.'),
    effects: [
      E('Increase', 'Raise one ability score by 1, to a maximum of 30.', 'Erhöhe einen Attributswert um 1, bis höchstens 30.'),
      S('Blink Steps', 'Right after you attack or cast a spell you can teleport up to 30 ft to a place you can see.', 'Direkt nach einem Angriff oder Zauber kannst du dich bis zu 30 ft an einen Ort teleportieren, den du sehen kannst.'),
    ],
    goodFor: L('Heroes who like to be where nobody expects them.', 'Helden, die gern dort sind, wo niemand sie erwartet.'),
  },
];
export const FEATS = Object.fromEntries(feats.map((f) => [f.id, f])) as Record<FeatId, FeatDef>;
export const ORIGIN_FEATS = feats.filter((f) => f.origin).map((f) => f.id);

// ----------------------------------------------------------- fighting styles

export interface StyleDef extends Option { feature: string }

const styles: StyleDef[] = [
  {
    id: 'defense', name: 'Defense', icon: '🛡️', recommendedFor: ['fighter'], feature: 'Fighting Style (Defense): +1 AC while wearing armor',
    summary: L('+1 armor class while you wear armor.', '+1 Rüstungsklasse, solange du Rüstung trägst.'),
    description: L('You know how to turn a blow with your armor. One point of AC sounds small, but it makes about one in twenty attacks against you miss, in every fight, forever.', 'Du weißt, wie man Schläge mit der Rüstung ablenkt. Ein Punkt RK klingt gering, lässt aber etwa jeden zwanzigsten Angriff gegen dich danebengehen, in jedem Kampf, für immer.'),
    effects: [E('Armor class', '+1 AC while you wear any armor. Works with every weapon.', '+1 RK, solange du irgendeine Rüstung trägst. Funktioniert mit jeder Waffe.')],
    goodFor: L('The safe choice, and the best one for a sword-and-shield fighter who holds the line.', 'Die sichere Wahl und die beste für einen Kämpfer mit Schwert und Schild, der die Linie hält.'),
  },
  {
    id: 'dueling', name: 'Dueling', icon: '🤺', recommendedFor: [], feature: 'Fighting Style (Dueling): +2 damage with a one-handed melee weapon',
    summary: L('+2 damage with a one-handed melee weapon.', '+2 Schaden mit einer einhändigen Nahkampfwaffe.'),
    description: L('You fight with one weapon and make it count. The bonus applies to every hit, and you can still carry a shield.', 'Du kämpfst mit einer Waffe und holst alles aus ihr heraus. Der Bonus gilt für jeden Treffer, und einen Schild kannst du trotzdem tragen.'),
    effects: [E('Damage', '+2 damage on every hit with a melee weapon that is not two-handed.', '+2 Schaden bei jedem Treffer mit einer Nahkampfwaffe, die nicht zweihändig ist.')],
    goodFor: L('Sword-and-shield fighters who would rather hit harder than be hit less.', 'Kämpfer mit Schwert und Schild, die lieber härter zuschlagen als seltener getroffen zu werden.'),
  },
  {
    id: 'great_weapon', name: 'Great Weapon Fighting', icon: '⚔️', recommendedFor: [], feature: 'Fighting Style (Great Weapon Fighting): damage dice of two-handed melee weapons never roll below 3',
    summary: L('Two-handed melee weapons never roll below 3 on a damage die.', 'Zweihändige Nahkampfwaffen würfeln bei Schadenswürfeln nie unter 3.'),
    description: L('You swing the biggest weapons with practised force. Bad damage rolls become rare, which makes your hits more reliable.', 'Du schwingst die größten Waffen mit geübter Wucht. Schlechte Schadenswürfe werden selten, deine Treffer also verlässlicher.'),
    effects: [E('Damage', 'When you roll a 1 or 2 on a damage die of a two-handed melee weapon, it counts as 3.', 'Wenn du bei einem Schadenswürfel einer zweihändigen Nahkampfwaffe eine 1 oder 2 würfelst, zählt sie als 3.')],
    goodFor: L('Fighters with a greatsword. You give up the shield for it.', 'Kämpfer mit Zweihänder. Dafür verzichtest du auf den Schild.'),
  },
  {
    id: 'archery', name: 'Archery', icon: '🏹', recommendedFor: [], feature: 'Fighting Style (Archery): +2 to attack rolls with ranged weapons',
    summary: L('+2 to attack rolls with ranged weapons.', '+2 auf Angriffswürfe mit Fernkampfwaffen.'),
    description: L('Your arrows find their mark. +2 to hit is a large bonus: it turns roughly one miss in ten into a hit.', 'Deine Pfeile finden ihr Ziel. +2 auf den Trefferwurf ist ein großer Bonus: Er macht etwa aus jedem zehnten Fehlschuss einen Treffer.'),
    effects: [E('Attack', '+2 to attack rolls with bows and other ranged weapons.', '+2 auf Angriffswürfe mit Bögen und anderen Fernkampfwaffen.')],
    goodFor: L('Fighters who build on Dexterity and fight with a longbow.', 'Kämpfer, die auf Geschicklichkeit setzen und mit dem Langbogen kämpfen.'),
  },
];
export const STYLES: Record<string, StyleDef> = Object.fromEntries(styles.map((s) => [s.id, s]));

// ---------------------------------------------------------- equipment kits

export interface KitDef extends Option {
  classId: ClassId;
  equipment: Partial<Record<SlotId, string>>;
  bag: { id: string; qty?: number }[];
}

const kit = (id: string, classId: ClassId, name: string, icon: string, rec: boolean, equipment: KitDef['equipment'], bag: KitDef['bag'], summary: L, description: L, goodFor: L): KitDef =>
  ({ id, classId, name, icon, recommendedFor: rec ? [classId] : [], equipment, bag, summary, description, goodFor, effects: [] });

const kits: KitDef[] = [
  kit('fighter_guard', 'fighter', 'Sword and Shield', '🛡️', true, { armor: 'chain_mail', mainHand: 'longsword', offHand: 'shield' }, [{ id: 'handaxe' }, { id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('Chain mail, longsword and shield. The highest armor class in the game at level 1.', 'Kettenpanzer, Langschwert und Schild. Die höchste Rüstungsklasse im Spiel auf Stufe 1.'),
    L('The classic guardian. With AC 18 most monsters need a very good roll to hurt you. Pairs with the Defense or Dueling style.', 'Der klassische Beschützer. Bei RK 18 brauchen die meisten Monster einen sehr guten Wurf, um dir zu schaden. Passt zum Kampfstil Verteidigung oder Duellieren.'),
    L('Strength fighters who want to be the party\'s wall.', 'Stärke-Kämpfer, die die Mauer der Gruppe sein wollen.')),
  kit('fighter_greatsword', 'fighter', 'Greatsword', '⚔️', false, { armor: 'chain_mail', mainHand: 'greatsword' }, [{ id: 'handaxe' }, { id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('Chain mail and a two-handed greatsword. Less armor, much more damage.', 'Kettenpanzer und ein zweihändiger Zweihänder. Weniger Rüstung, deutlich mehr Schaden.'),
    L('2d6 damage instead of 1d8, at the price of the shield (AC 16 instead of 18). Pairs with Great Weapon Fighting and Savage Attacker.', '2W6 Schaden statt 1W8, zum Preis des Schilds (RK 16 statt 18). Passt zu Kampf mit Zweihandwaffen und Wilder Angreifer.'),
    L('Strength fighters who want fights to end quickly.', 'Stärke-Kämpfer, die Kämpfe schnell beenden wollen.')),
  kit('fighter_archer', 'fighter', 'Longbow', '🏹', false, { armor: 'studded_leather', mainHand: 'longbow' }, [{ id: 'shortsword' }, { id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('Studded leather, a longbow and a shortsword for close quarters.', 'Beschlagenes Leder, ein Langbogen und ein Kurzschwert für den Nahkampf.'),
    L('You fight from 150 ft away. Light armor adds your full Dexterity to AC, so put your best score there. Pairs with the Archery style.', 'Du kämpfst aus 150 ft Entfernung. Leichte Rüstung addiert deine volle Geschicklichkeit auf die RK, setze also deinen besten Wert dorthin. Passt zum Kampfstil Bogenschießen.'),
    L('Fighters with Dexterity as their highest ability.', 'Kämpfer mit Geschicklichkeit als höchstem Attribut.')),
  kit('rogue_duelist', 'rogue', 'Rapier and Bow', '🤺', true, { armor: 'leather', mainHand: 'rapier' }, [{ id: 'shortbow' }, { id: 'dagger' }, { id: 'potion_healing' }, { id: 'thieves_tools' }],
    L('Leather armor, a rapier for melee, a shortbow for range and thieves\' tools.', 'Lederrüstung, ein Rapier für den Nahkampf, ein Kurzbogen für die Distanz und Diebeswerkzeug.'),
    L('The rapier is the strongest finesse weapon (1d8), and both weapons work with Sneak Attack. Swap between them in the inventory.', 'Das Rapier ist die stärkste Finessewaffe (1W8), und beide Waffen funktionieren mit dem Hinterhältigen Angriff. Wechsle im Inventar zwischen ihnen.'),
    L('Most rogues.', 'Die meisten Schurken.')),
  kit('rogue_scout', 'rogue', 'Bow and Blades', '🏹', false, { armor: 'leather', mainHand: 'shortbow' }, [{ id: 'shortsword' }, { id: 'dagger', qty: 2 }, { id: 'potion_healing', qty: 2 }, { id: 'thieves_tools' }],
    L('Leather armor, a shortbow in hand, a shortsword, daggers and a second potion.', 'Lederrüstung, ein Kurzbogen in der Hand, ein Kurzschwert, Dolche und ein zweiter Trank.'),
    L('You start at range and stay there. Slightly less melee damage than the rapier, but an extra healing potion.', 'Du beginnst auf Distanz und bleibst dort. Etwas weniger Nahkampfschaden als mit dem Rapier, dafür ein zusätzlicher Heiltrank.'),
    L('Rogues who prefer to keep their distance.', 'Schurken, die lieber Abstand halten.')),
  kit('wizard_scholar', 'wizard', 'Scholar\'s Pack', '📖', true, { mainHand: 'quarterstaff' }, [{ id: 'dagger' }, { id: 'potion_healing' }, { id: 'spellbook' }],
    L('Quarterstaff, dagger, spellbook and a healing potion.', 'Kampfstab, Dolch, Zauberbuch und ein Heiltrank.'),
    L('Your weapons hardly matter: your cantrips are stronger than any staff. The potion is your insurance.', 'Deine Waffen spielen kaum eine Rolle: Deine Zaubertricks sind stärker als jeder Stab. Der Trank ist deine Versicherung.'),
    L('Most wizards.', 'Die meisten Magier.')),
  kit('wizard_survivor', 'wizard', 'Survivor\'s Pack', '🧪', false, { mainHand: 'dagger' }, [{ id: 'potion_healing', qty: 3 }, { id: 'spellbook' }, { id: 'torch', qty: 3 }],
    L('Dagger, spellbook and three healing potions.', 'Dolch, Zauberbuch und drei Heiltränke.'),
    L('A wizard\'s biggest weakness is low hit points. Three potions buy you a lot of second chances.', 'Die größte Schwäche eines Magiers sind wenige Trefferpunkte. Drei Tränke verschaffen dir einige zweite Chancen.'),
    L('Solo wizards and small parties without a healer.', 'Solo-Magier und kleine Gruppen ohne Heiler.')),
  kit('cleric_battle', 'cleric', 'Mace and Shield', '🔨', true, { armor: 'scale_mail', mainHand: 'mace', offHand: 'shield', amulet: 'holy_symbol' }, [{ id: 'potion_healing', qty: 2 }],
    L('Scale mail, mace, shield and a holy symbol.', 'Schuppenpanzer, Streitkolben, Schild und ein heiliges Symbol.'),
    L('AC 16 to 18 depending on your Dexterity: you can stand right behind the fighter, or next to them.', 'RK 16 bis 18 je nach Geschicklichkeit: Du kannst direkt hinter dem Kämpfer stehen oder neben ihm.'),
    L('Most clerics.', 'Die meisten Kleriker.')),
  kit('cleric_pilgrim', 'cleric', 'Pilgrim\'s Pack', '🕊️', false, { armor: 'chain_shirt', mainHand: 'quarterstaff', amulet: 'holy_symbol' }, [{ id: 'potion_healing', qty: 4 }, { id: 'torch', qty: 3 }],
    L('Chain shirt, quarterstaff, a holy symbol and four healing potions.', 'Kettenhemd, Kampfstab, ein heiliges Symbol und vier Heiltränke.'),
    L('Lighter armor and no shield, but enough potions to heal without spending mana.', 'Leichtere Rüstung und kein Schild, dafür genug Tränke, um ohne Mana zu heilen.'),
    L('Clerics who stay in the back and cast.', 'Kleriker, die hinten bleiben und zaubern.')),
  kit('barbarian_greataxe', 'barbarian', 'Greataxe', '🪓', true, { mainHand: 'greataxe' }, [{ id: 'handaxe', qty: 2 }, { id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('A greataxe, two handaxes and no armor at all.', 'Eine Zweihandaxt, zwei Handbeile und überhaupt keine Rüstung.'),
    L('1d12 damage, the biggest weapon die in the game. Your Unarmored Defense replaces armor, so Dexterity and Constitution are your protection.', '1W12 Schaden, der größte Waffenwürfel im Spiel. Deine Ungerüstete Verteidigung ersetzt die Rüstung, Geschicklichkeit und Konstitution sind also dein Schutz.'),
    L('Barbarians who want every hit to hurt.', 'Barbaren, bei denen jeder Treffer wehtun soll.')),
  kit('barbarian_shield', 'barbarian', 'Axe and Shield', '🛡️', false, { mainHand: 'battleaxe', offHand: 'shield' }, [{ id: 'handaxe', qty: 2 }, { id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('A battleaxe and a shield, without armor.', 'Eine Streitaxt und ein Schild, ohne Rüstung.'),
    L('The shield adds 2 to your Unarmored Defense. You deal 1d8 instead of 1d12 and are hit noticeably less often.', 'Der Schild addiert 2 auf deine Ungerüstete Verteidigung. Du verursachst 1W8 statt 1W12 und wirst spürbar seltener getroffen.'),
    L('Barbarians who hold the front line for the party.', 'Barbaren, die für die Gruppe die Front halten.')),
  kit('bard_troubadour', 'bard', 'Troubadour\'s Pack', '🎻', true, { armor: 'leather', mainHand: 'dagger' }, [{ id: 'lute' }, { id: 'potion_healing', qty: 2 }],
    L('Leather armor, a dagger, a lute and two healing potions.', 'Lederrüstung, ein Dolch, eine Laute und zwei Heiltränke.'),
    L('Your weapon hardly matters: Vicious Mockery and your spells do the work. The potions keep you going when your mana runs out.', 'Deine Waffe spielt kaum eine Rolle: Gehässiger Spott und deine Zauber erledigen die Arbeit. Die Tränke halten dich auf den Beinen, wenn dein Mana ausgeht.'),
    L('Most bards.', 'Die meisten Barden.')),
  kit('bard_wanderer', 'bard', 'Wanderer\'s Pack', '🏹', false, { armor: 'leather', mainHand: 'shortbow' }, [{ id: 'dagger' }, { id: 'lute' }, { id: 'potion_healing' }],
    L('Leather armor, a shortbow, a dagger, a lute and a healing potion.', 'Lederrüstung, ein Kurzbogen, ein Dolch, eine Laute und ein Heiltrank.'),
    L('The shortbow gives you a ranged weapon attack beside your cantrip. Worth it if your Dexterity is high.', 'Der Kurzbogen gibt dir neben deinem Zaubertrick einen Fernkampfangriff. Lohnt sich bei hoher Geschicklichkeit.'),
    L('Bards who keep their distance.', 'Barden, die Abstand halten.')),
  kit('druid_staff', 'druid', 'Staff and Shield', '🌿', true, { armor: 'leather', mainHand: 'quarterstaff', offHand: 'shield' }, [{ id: 'healers_kit' }, { id: 'potion_healing' }],
    L('Leather armor, a quarterstaff, a wooden shield, a healer\'s kit and a potion.', 'Lederrüstung, ein Kampfstab, ein Holzschild, eine Heilertasche und ein Trank.'),
    L('The shield lifts your armor class by 2 while you cast. In beast form your equipment does not matter.', 'Der Schild hebt deine Rüstungsklasse beim Zaubern um 2. In Tiergestalt spielt deine Ausrüstung keine Rolle.'),
    L('Most druids.', 'Die meisten Druiden.')),
  kit('druid_herbalist', 'druid', 'Herbalist\'s Pack', '🧪', false, { armor: 'leather', mainHand: 'quarterstaff' }, [{ id: 'potion_healing', qty: 3 }, { id: 'antitoxin' }, { id: 'healers_kit' }],
    L('Leather armor, a quarterstaff, three healing potions, antitoxin and a healer\'s kit.', 'Lederrüstung, ein Kampfstab, drei Heiltränke, Gegengift und eine Heilertasche.'),
    L('No shield, but enough potions to heal without spending mana.', 'Kein Schild, dafür genug Tränke, um ohne Mana zu heilen.'),
    L('Druids in small parties without another healer.', 'Druiden in kleinen Gruppen ohne weiteren Heiler.')),
  kit('monk_staff', 'monk', 'Staff', '🥋', true, { mainHand: 'quarterstaff' }, [{ id: 'dagger', qty: 2 }, { id: 'potion_healing', qty: 2 }],
    L('A quarterstaff, two daggers and two healing potions. No armor.', 'Ein Kampfstab, zwei Dolche und zwei Heiltränke. Keine Rüstung.'),
    L('The staff attacks with Dexterity like your fists and keeps its d6 until your Martial Arts die outgrows it. Your bonus strike is always unarmed.', 'Der Stab greift wie deine Fäuste mit Geschicklichkeit an und behält seinen W6, bis dein Kampfkunstwürfel ihn überholt. Dein Bonusschlag ist immer waffenlos.'),
    L('Most monks.', 'Die meisten Mönche.')),
  kit('monk_fists', 'monk', 'Bare Hands', '👊', false, {}, [{ id: 'potion_healing', qty: 3 }, { id: 'rope_hemp' }, { id: 'torch', qty: 3 }],
    L('Nothing in your hands. Three healing potions, a rope and torches.', 'Nichts in den Händen. Drei Heiltränke, ein Seil und Fackeln.'),
    L('Your fists hit as hard as a staff, so you lose nothing and carry an extra potion instead.', 'Deine Fäuste treffen so hart wie ein Stab, du verlierst also nichts und trägst stattdessen einen Trank mehr.'),
    L('Monks who like the idea of needing nothing at all.', 'Mönche, denen der Gedanke gefällt, gar nichts zu brauchen.')),
  kit('paladin_guard', 'paladin', 'Sword and Shield', '🛡️', true, { armor: 'chain_mail', mainHand: 'longsword', offHand: 'shield', amulet: 'holy_symbol' }, [{ id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('Chain mail, longsword, shield and a holy symbol.', 'Kettenpanzer, Langschwert, Schild und ein heiliges Symbol.'),
    L('AC 18 from the first day. Pairs with the Defense or Dueling style at level 2.', 'RK 18 vom ersten Tag an. Passt zum Kampfstil Verteidigung oder Duellieren auf Stufe 2.'),
    L('Paladins who protect the party.', 'Paladine, die die Gruppe beschützen.')),
  kit('paladin_greatsword', 'paladin', 'Greatsword', '⚔️', false, { armor: 'chain_mail', mainHand: 'greatsword', amulet: 'holy_symbol' }, [{ id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('Chain mail, a greatsword and a holy symbol.', 'Kettenpanzer, ein Zweihänder und ein heiliges Symbol.'),
    L('2d6 damage and a Divine Smite on top. You give up the shield for it.', '2W6 Schaden und obendrauf ein Göttliches Niederstrecken. Dafür verzichtest du auf den Schild.'),
    L('Paladins who want the biggest hits in the party.', 'Paladine, die die größten Treffer der Gruppe wollen.')),
  kit('ranger_archer', 'ranger', 'Longbow', '🏹', true, { armor: 'studded_leather', mainHand: 'longbow' }, [{ id: 'shortsword' }, { id: 'potion_healing' }, { id: 'rope_hemp' }, { id: 'torch', qty: 3 }],
    L('Studded leather, a longbow, a shortsword, a rope and a potion.', 'Beschlagenes Leder, ein Langbogen, ein Kurzschwert, ein Seil und ein Trank.'),
    L('You fight from 150 ft away, with Hunter\'s Mark on your target. Pairs with the Archery style at level 2.', 'Du kämpfst aus 150 ft Entfernung, mit dem Zeichen des Jägers auf deinem Ziel. Passt zum Kampfstil Bogenschießen auf Stufe 2.'),
    L('Most rangers.', 'Die meisten Waldläufer.')),
  kit('ranger_warden', 'ranger', 'Sword and Shield', '🗡️', false, { armor: 'scale_mail', mainHand: 'longsword', offHand: 'shield' }, [{ id: 'shortbow' }, { id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('Scale mail, longsword, shield and a shortbow for range.', 'Schuppenpanzer, Langschwert, Schild und ein Kurzbogen für die Distanz.'),
    L('A ranger for the front line. Build on Strength, and take the Defense or Dueling style at level 2.', 'Ein Waldläufer für die Front. Setze auf Stärke und nimm auf Stufe 2 den Kampfstil Verteidigung oder Duellieren.'),
    L('Rangers who would rather stand next to the fighter.', 'Waldläufer, die lieber neben dem Kämpfer stehen.')),
  kit('sorcerer_wanderer', 'sorcerer', 'Wanderer\'s Pack', '🐉', true, { mainHand: 'dagger' }, [{ id: 'potion_healing', qty: 2 }, { id: 'torch', qty: 3 }],
    L('A dagger, two healing potions and torches.', 'Ein Dolch, zwei Heiltränke und Fackeln.'),
    L('You need nothing but your magic. The potions are for the day something reaches you.', 'Du brauchst nichts als deine Magie. Die Tränke sind für den Tag, an dem dich etwas erreicht.'),
    L('Most sorcerers.', 'Die meisten Zauberer.')),
  kit('sorcerer_staff', 'sorcerer', 'Staff and Lantern', '🏮', false, { mainHand: 'quarterstaff' }, [{ id: 'potion_healing' }, { id: 'lantern_hooded' }, { id: 'rations', qty: 2 }],
    L('A quarterstaff, a healing potion, a hooded lantern and rations.', 'Ein Kampfstab, ein Heiltrank, eine Kapuzenlaterne und Rationen.'),
    L('One potion fewer, but a lantern that lights the dark far better than a torch.', 'Ein Trank weniger, dafür eine Laterne, die das Dunkel viel besser erhellt als eine Fackel.'),
    L('Sorcerers without darkvision.', 'Zauberer ohne Dunkelsicht.')),
  kit('warlock_occultist', 'warlock', 'Occultist\'s Pack', '🧿', true, { armor: 'leather', mainHand: 'dagger' }, [{ id: 'potion_healing', qty: 2 }, { id: 'torch', qty: 3 }],
    L('Leather armor, a dagger, two healing potions and torches.', 'Lederrüstung, ein Dolch, zwei Heiltränke und Fackeln.'),
    L('Eldritch Blast is your weapon. With the Armor of Shadows invocation, take the leather off: 13 + Dexterity is better.', 'Der Schauerstrahl ist deine Waffe. Mit der Anrufung Rüstung der Schatten legst du das Leder ab: 13 + Geschicklichkeit ist besser.'),
    L('Most warlocks.', 'Die meisten Hexenmeister.')),
  kit('warlock_blade', 'warlock', 'Pact Blade', '🗡️', false, { armor: 'leather', mainHand: 'longsword' }, [{ id: 'dagger' }, { id: 'potion_healing' }, { id: 'torch', qty: 3 }],
    L('Leather armor, a longsword, a dagger and a healing potion.', 'Lederrüstung, ein Langschwert, ein Dolch und ein Heiltrank.'),
    L('Only with the Pact of the Blade invocation: it makes you proficient with the sword and lets you attack with Charisma.', 'Nur mit der Anrufung Pakt der Klinge: Sie macht dich mit dem Schwert geübt und lässt dich mit Charisma angreifen.'),
    L('Warlocks who want to fight in melee.', 'Hexenmeister, die im Nahkampf kämpfen wollen.')),
];
export const KITS: Record<string, KitDef> = Object.fromEntries(kits.map((k) => [k.id, k]));
export const kitsFor = (classId: ClassId) => kits.filter((k) => k.classId === classId);

// ------------------------------------------------- abilities and skills help

export const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_HELP: Record<AbilityKey, { text: L; uses: L }> = {
  str: {
    text: L('Raw physical power: how hard you hit and how much you can lift, push or break.', 'Rohe Körperkraft: wie hart du zuschlägst und wie viel du heben, schieben oder zerbrechen kannst.'),
    uses: L('Attack and damage with most melee weapons · Athletics · Strength saves', 'Angriff und Schaden mit den meisten Nahkampfwaffen · Athletik · Stärkerettungswürfe'),
  },
  dex: {
    text: L('Agility, reflexes and balance.', 'Beweglichkeit, Reflexe und Gleichgewicht.'),
    uses: L('Attack and damage with finesse and ranged weapons · armor class in light or no armor · initiative · Stealth, Acrobatics, Sleight of Hand · Dexterity saves, the most common kind', 'Angriff und Schaden mit Finesse- und Fernkampfwaffen · Rüstungsklasse in leichter oder ohne Rüstung · Initiative · Heimlichkeit, Akrobatik, Fingerfertigkeit · Geschicklichkeitsrettungswürfe, die häufigste Art'),
  },
  con: {
    text: L('Health and stamina. No class can ignore it.', 'Gesundheit und Ausdauer. Keine Klasse kann darauf verzichten.'),
    uses: L('Hit points at every level · hit points regained on a short rest · Constitution saves', 'Trefferpunkte auf jeder Stufe · Trefferpunkte bei einer kurzen Rast · Konstitutionsrettungswürfe'),
  },
  int: {
    text: L('Memory, logic and learning.', 'Gedächtnis, Logik und Bildung.'),
    uses: L('Wizard spell attacks and save DC · Arcana, History, Investigation, Nature, Religion', 'Zauberangriffe und Rettungswurf-SG des Magiers · Arkane Kunde, Geschichte, Nachforschungen, Naturkunde, Religion'),
  },
  wis: {
    text: L('Awareness, intuition and willpower.', 'Aufmerksamkeit, Intuition und Willenskraft.'),
    uses: L('Cleric spell attacks, save DC and healing · Perception, Insight, Medicine, Survival, Animal Handling', 'Zauberangriffe, Rettungswurf-SG und Heilung des Klerikers · Wahrnehmung, Motiv erkennen, Heilkunde, Überlebenskunst, Mit Tieren umgehen'),
  },
  cha: {
    text: L('Force of personality: charm, confidence and presence.', 'Stärke der Persönlichkeit: Charme, Selbstsicherheit und Ausstrahlung.'),
    uses: L('Persuasion, Deception, Intimidation, Performance: most conversations with people in the world', 'Überzeugen, Täuschen, Einschüchtern, Auftreten: die meisten Gespräche mit Leuten in der Welt'),
  },
};

/** What each skill is used for at the table. */
export const SKILL_HELP: Record<string, L> = {
  acrobatics: L('Keep your balance, tumble past danger, land on your feet.', 'Das Gleichgewicht halten, an Gefahren vorbeirollen, auf den Füßen landen.'),
  'animal handling': L('Calm a frightened horse, read a beast\'s mood, ride through trouble.', 'Ein scheuendes Pferd beruhigen, die Stimmung eines Tieres deuten, sicher durch Gefahr reiten.'),
  arcana: L('Recognise spells, magic items, runes and creatures of magic.', 'Zauber, magische Gegenstände, Runen und magische Wesen erkennen.'),
  athletics: L('Climb, swim, jump, grapple and force things open.', 'Klettern, schwimmen, springen, ringen und Dinge aufstemmen.'),
  deception: L('Lie convincingly, bluff, wear a disguise.', 'Überzeugend lügen, bluffen, eine Verkleidung tragen.'),
  history: L('Recall kingdoms, wars, legends and old ruins.', 'Wissen über Reiche, Kriege, Legenden und alte Ruinen abrufen.'),
  insight: L('Sense whether someone is lying and what they really want.', 'Spüren, ob jemand lügt und was er wirklich will.'),
  intimidation: L('Get your way through threats and a hard stare.', 'Mit Drohungen und einem harten Blick den eigenen Willen durchsetzen.'),
  investigation: L('Search a room, find hidden doors, piece clues together.', 'Einen Raum durchsuchen, Geheimtüren finden, Hinweise zusammensetzen.'),
  medicine: L('Stabilise the dying, diagnose an illness, tend wounds.', 'Sterbende stabilisieren, Krankheiten erkennen, Wunden versorgen.'),
  nature: L('Know plants, animals, weather and terrain.', 'Pflanzen, Tiere, Wetter und Gelände kennen.'),
  perception: L('Notice ambushes, traps and hidden things. The skill the Dungeon Master asks for most.', 'Hinterhalte, Fallen und Verborgenes bemerken. Die Fertigkeit, die der Spielleiter am häufigsten verlangt.'),
  performance: L('Sing, play, act or tell a story that holds a room.', 'Singen, musizieren, schauspielern oder eine Geschichte erzählen, die den Raum fesselt.'),
  persuasion: L('Win people over with honest words, tact and good manners.', 'Leute mit ehrlichen Worten, Takt und guten Manieren gewinnen.'),
  religion: L('Know gods, rites, holy symbols and the undead.', 'Götter, Riten, heilige Symbole und Untote kennen.'),
  'sleight of hand': L('Pick pockets, palm objects, plant something on someone.', 'Taschen leeren, Gegenstände verschwinden lassen, jemandem etwas zustecken.'),
  stealth: L('Move unseen and unheard, hide, set an ambush.', 'Ungesehen und ungehört bewegen, verstecken, einen Hinterhalt legen.'),
  survival: L('Follow tracks, find food and shelter, avoid getting lost.', 'Spuren folgen, Nahrung und Unterschlupf finden, sich nicht verirren.'),
};

// ----------------------------------------------------------------- glossary

/** Rules terms that get a hover explanation wherever they appear in creator text. */
export interface Term { id: string; name: L; text: L; match: { en: string; de: string } }

export const GLOSSARY: Term[] = [
  { id: 'd20', name: L('d20', 'W20'), match: { en: 'd20', de: 'W20' },
    text: L('The twenty-sided die. Almost everything uncertain is decided by rolling it, adding a modifier and comparing the total with a target number.', 'Der zwanzigseitige Würfel. Fast alles Ungewisse wird entschieden, indem man ihn würfelt, einen Modifikator addiert und das Ergebnis mit einer Zielzahl vergleicht.') },
  { id: 'modifier', name: L('Ability modifier', 'Attributsmodifikator'), match: { en: 'modifiers?', de: 'Modifikator(?:en|s)?' },
    text: L('The number an ability score actually adds to your rolls: (score - 10) / 2, rounded down. 10 gives +0, 14 gives +2, 16 gives +3, 8 gives -1.', 'Die Zahl, die ein Attributswert tatsächlich zu deinen Würfen addiert: (Wert - 10) / 2, abgerundet. 10 ergibt +0, 14 ergibt +2, 16 ergibt +3, 8 ergibt -1.') },
  { id: 'proficiency', name: L('Proficiency bonus', 'Übungsbonus'), match: { en: 'proficiency bonus|proficiency|proficient', de: 'Übungsbonus|Übung|geübt' },
    text: L('A bonus for things you are trained in: +2 at levels 1 to 4, +3 from level 5. It is added to attacks with weapons you know, your spells, your proficient skills and your proficient saving throws.', 'Ein Bonus auf alles, worin du ausgebildet bist: +2 auf den Stufen 1 bis 4, +3 ab Stufe 5. Er wird auf Angriffe mit vertrauten Waffen, deine Zauber, deine geübten Fertigkeiten und deine geübten Rettungswürfe addiert.') },
  { id: 'save', name: L('Saving throw', 'Rettungswurf'), match: { en: 'saving throws?|saves?', de: 'Rettungsw(?:urf|ürfe|ürfen|urfs)' },
    text: L('A d20 roll to resist something that happens to you: dodging a fireball (Dexterity), enduring poison (Constitution), shaking off a charm (Wisdom). You add the ability modifier, plus your proficiency bonus for the two saves your class is trained in.', 'Ein W20-Wurf, um etwas zu widerstehen, das dir zustößt: einem Feuerball ausweichen (Geschicklichkeit), Gift aushalten (Konstitution), eine Bezauberung abschütteln (Weisheit). Du addierst den Attributsmodifikator und bei den zwei Rettungswürfen deiner Klasse zusätzlich den Übungsbonus.') },
  { id: 'dc', name: L('Difficulty Class (DC)', 'Schwierigkeitsgrad (SG)'), match: { en: 'DCs?', de: 'SG' },
    text: L('The number a check or saving throw has to reach. Your own spells set a DC of 8 + proficiency bonus + spellcasting modifier for the enemy to beat.', 'Die Zahl, die ein Wurf erreichen muss. Deine eigenen Zauber setzen einen SG von 8 + Übungsbonus + Zaubermodifikator, den der Gegner erreichen muss.') },
  { id: 'ac', name: L('Armor Class (AC)', 'Rüstungsklasse (RK)'), match: { en: 'armor class|AC', de: 'Rüstungsklasse|RK' },
    text: L('How hard you are to hit. An attack hits when d20 + attack bonus is at least your AC. Without armor it is 10 + Dexterity modifier; armor and shields raise it.', 'Wie schwer du zu treffen bist. Ein Angriff trifft, wenn W20 + Angriffsbonus mindestens deine RK erreicht. Ohne Rüstung beträgt sie 10 + Geschicklichkeitsmodifikator; Rüstung und Schilde erhöhen sie.') },
  { id: 'hp', name: L('Hit points', 'Trefferpunkte'), match: { en: 'hit points?|HP', de: 'Trefferpunkt(?:e|en)?|TP' },
    text: L('How much punishment you can take. At 0 you fall unconscious and start making death saves. Your class\'s hit die and your Constitution decide how many you have.', 'Wie viel du einstecken kannst. Bei 0 wirst du bewusstlos und beginnst mit Todesrettungswürfen. Der Trefferwürfel deiner Klasse und deine Konstitution bestimmen, wie viele du hast.') },
  { id: 'hitdie', name: L('Hit die', 'Trefferwürfel'), match: { en: 'hit dic?e', de: 'Trefferwürfel[ns]?' },
    text: L('The die that stands for your class\'s toughness: d6 for a wizard, d10 for a fighter. It sets your hit points per level, and you spend hit dice during a short rest to heal.', 'Der Würfel, der für die Zähigkeit deiner Klasse steht: W6 beim Magier, W10 beim Kämpfer. Er bestimmt deine Trefferpunkte pro Stufe, und bei einer kurzen Rast gibst du Trefferwürfel aus, um zu heilen.') },
  { id: 'advantage', name: L('Advantage and disadvantage', 'Vorteil und Nachteil'), match: { en: 'advantage|disadvantage', de: 'Vorteil|Nachteil' },
    text: L('With advantage you roll two d20s and use the higher; with disadvantage the lower. Advantage is worth roughly +4 on average.', 'Mit Vorteil würfelst du zwei W20 und nimmst den höheren, mit Nachteil den niedrigeren. Vorteil ist im Schnitt etwa +4 wert.') },
  { id: 'initiative', name: L('Initiative', 'Initiative'), match: { en: 'initiative', de: 'Initiative(?:wurf)?' },
    text: L('At the start of a fight everyone rolls d20 + Dexterity modifier. Highest goes first, and the order stays for the whole fight.', 'Zu Beginn eines Kampfes würfeln alle W20 + Geschicklichkeitsmodifikator. Der höchste Wert handelt zuerst, und die Reihenfolge gilt für den ganzen Kampf.') },
  { id: 'cantrip', name: L('Cantrip', 'Zaubertrick'), match: { en: 'cantrips?', de: 'Zaubertricks?' },
    text: L('A small spell you can cast as often as you like. It costs no mana, and its damage grows as you gain levels.', 'Ein kleiner Zauber, den du beliebig oft wirken kannst. Er kostet kein Mana, und sein Schaden wächst mit deiner Stufe.') },
  { id: 'mana', name: L('Mana', 'Mana'), match: { en: 'mana', de: 'Mana' },
    text: L('Hearthforge uses spell points instead of spell slots. A 1st-level spell costs 2 mana, a 2nd-level spell 3. A short rest restores a little, a long rest all of it.', 'Hearthforge verwendet Zauberpunkte statt Zauberplätzen. Ein Zauber des 1. Grades kostet 2 Mana, einer des 2. Grades 3. Eine kurze Rast stellt etwas wieder her, eine lange Rast alles.') },
  { id: 'bonus', name: L('Bonus action', 'Bonusaktion'), match: { en: 'bonus actions?', de: 'Bonusaktion(?:en)?' },
    text: L('On your turn you can move, take one action (usually an attack or a spell) and one bonus action. Only certain abilities use the bonus action, so one that does is effectively free.', 'In deinem Zug kannst du dich bewegen, eine Aktion ausführen (meist ein Angriff oder Zauber) und eine Bonusaktion. Nur bestimmte Fähigkeiten nutzen die Bonusaktion, sie sind also praktisch geschenkt.') },
  { id: 'rest', name: L('Short and long rest', 'Kurze und lange Rast'), match: { en: 'short rests?|long rests?|per rest', de: 'kurzen? Rast(?:en)?|langen? Rast(?:en)?|pro Rast' },
    text: L('A short rest takes an hour: you spend a hit die to heal, regain a little mana and refresh once-per-rest abilities. A long rest takes eight hours and restores everything.', 'Eine kurze Rast dauert eine Stunde: Du gibst einen Trefferwürfel aus, um zu heilen, erhältst etwas Mana zurück und frischst Fähigkeiten auf, die einmal pro Rast gelten. Eine lange Rast dauert acht Stunden und stellt alles wieder her.') },
  { id: 'crit', name: L('Critical hit', 'Kritischer Treffer'), match: { en: 'critical hits?|crits?', de: 'kritische[rn]? Treffer|kritisch' },
    text: L('A natural 20 on an attack roll always hits and rolls all damage dice twice.', 'Eine natürliche 20 beim Angriffswurf trifft immer und würfelt alle Schadenswürfel doppelt.') },
  { id: 'finesse', name: L('Finesse', 'Finesse'), match: { en: 'finesse', de: 'Finesse(?:waffen?)?' },
    text: L('A finesse weapon (dagger, shortsword, rapier) uses Dexterity instead of Strength for attack and damage if that is better for you.', 'Eine Finessewaffe (Dolch, Kurzschwert, Rapier) nutzt Geschicklichkeit statt Stärke für Angriff und Schaden, wenn das für dich besser ist.') },
  { id: 'resistance', name: L('Resistance', 'Resistenz'), match: { en: 'resistance|half damage', de: 'Resistenz|halben? [A-Za-zäöü]*[Ss]chaden' },
    text: L('You take only half damage from that damage type, rounded down.', 'Du erleidest von dieser Schadensart nur den halben Schaden, abgerundet.') },
  { id: 'expertise', name: L('Expertise', 'Expertise'), match: { en: 'expertise', de: 'Expertise' },
    text: L('Your proficiency bonus counts twice for that skill: +4 instead of +2 at level 1.', 'Dein Übungsbonus zählt für diese Fertigkeit doppelt: +4 statt +2 auf Stufe 1.') },
  { id: 'feat', name: L('Feat', 'Talent'), match: { en: 'origin feats?|feats?', de: 'Herkunftstalent(?:e|en|s)?|Talent(?:e|en|s)?' },
    text: L('A special talent beyond what your class gives. Everyone gets an origin feat from their background at level 1, and may choose another feat at level 4 instead of raising ability scores.', 'Eine besondere Begabung über das hinaus, was deine Klasse gibt. Jeder erhält auf Stufe 1 ein Herkunftstalent durch seinen Hintergrund und kann auf Stufe 4 ein weiteres Talent wählen, statt Attributswerte zu erhöhen.') },
  { id: 'spellattack', name: L('Spell attack', 'Zauberangriff'), match: { en: 'spell attacks?', de: 'Zauberangriff(?:e|en|s)?(?:bonus)?' },
    text: L('Some spells must hit like a weapon: d20 + proficiency bonus + spellcasting modifier against the target\'s AC. Ranged spell attacks have disadvantage while an enemy stands next to you.', 'Manche Zauber müssen wie eine Waffe treffen: W20 + Übungsbonus + Zaubermodifikator gegen die RK des Ziels. Fernkampf-Zauberangriffe haben Nachteil, solange ein Gegner neben dir steht.') },
];

// ------------------------------------------------------- sheet feature lines

/** The line a species trait or story effect puts on the character sheet. */
export const effectLine = (e: Effect) => `${e.name}: ${e.text.en}`;

/** Sheet lines generated from effects, with their German text, so the client can show them translated. */
export const EFFECT_LINES: Record<string, { name: string; de: string }> = Object.fromEntries([
  ...species.flatMap((s) => s.effects).map((e) => [effectLine(e), { name: e.name, de: e.text.de }] as const),
  ...CLASS_IDS.flatMap((id) => CLASS_FEATURES[id]).map((f) => [featureLine(f), { name: f.name, de: f.text.de }] as const),
  ...Object.values(OPTIONS).map((o) => [optionLine(o), { name: o.name, de: o.text.de }] as const),
]);

/** Class options in the shape the creator and the level-up screen explain things. */
export const OPTION_CARDS: Record<string, Option> = Object.fromEntries(Object.values(OPTIONS).map((o) => [o.id, {
  id: o.id, name: o.name, icon: o.icon, summary: o.text, description: GROUPS[o.group]?.text ?? o.text,
  effects: [{ name: GROUPS[o.group]?.name ?? o.name, text: o.text, by: o.by }],
  goodFor: o.by === 'engine'
    ? L('The game applies this by itself.', 'Das Spiel wendet dies selbst an.')
    : L('The Dungeon Master plays this out in the story.', 'Der Spielleiter spielt dies in der Geschichte aus.'),
  recommendedFor: [],
}]));

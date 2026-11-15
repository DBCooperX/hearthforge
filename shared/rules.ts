// Character options: species, classes, backgrounds, feats, fighting styles and spell lists,
// with the explanations the character creator shows for each of them.
//
// The rules come from the D&D System Reference Document 5.2.1 (species, backgrounds, origin
// feats) and 5.1 (the remaining spells and the Dueling style), both CC-BY-4.0, Wizards of the
// Coast. See CREDITS.md. Every explanation is written for Hearthforge in its own words, and
// says where this game simplifies a rule.
import type { Lang } from './i18n';
import type { Abilities, AbilityKey, BackgroundId, ClassId, FeatId, SlotId, SpeciesId } from './types';

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

const ALL: ClassId[] = ['fighter', 'rogue', 'wizard', 'cleric'];

// ------------------------------------------------------------------ classes

export interface LevelGain {
  /** Ability ids from ABILITIES learned at this level. */
  abilities?: string[];
  /** Passive features, as lines for the character sheet. A later line with the same prefix before ':' replaces the earlier one. */
  features?: string[];
  /** Choices the player makes at this level. */
  choose?: ('feat' | 'spell' | 'cantrip')[];
}

export interface ClassDef {
  id: ClassId;
  name: string;
  hitDie: number;
  castingAbility?: 'int' | 'wis';
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

/** Spell points by level for casters (house rule; a 1st-level spell costs 2). */
export const MANA_BY_LEVEL = [4, 6, 8, 10, 14];

export const profBonusFor = (level: number) => (level >= 5 ? 3 : 2);

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: 'fighter', name: 'Fighter', hitDie: 10, maxMana: 0,
    armorProf: ['light', 'medium', 'heavy', 'shield'], weaponProf: ['simple', 'martial'],
    abilityIds: ['second_wind', 'dodge'], features: [], saves: ['str', 'con'],
    skillCount: 2, skillList: ['acrobatics', 'animal handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'persuasion', 'survival'],
    cantrips: { fixed: [], pick: 0 }, spellPicks: 0,
    subclass: { name: 'Champion', text: L('A fighter who wins through raw physical excellence. Your weapon attacks score a critical hit on a roll of 19 or 20.', 'Ein Kämpfer, der durch pure körperliche Überlegenheit siegt. Deine Waffenangriffe treffen schon bei einer gewürfelten 19 oder 20 kritisch.') },
    levels: {
      2: { abilities: ['action_surge'] },
      3: { features: ['Improved Critical: weapon attacks crit on 19 or 20'] },
      4: { choose: ['feat'] },
      5: { features: ['Extra Attack: two weapon attacks with each Attack action'] },
    },
  },
  rogue: {
    id: 'rogue', name: 'Rogue', hitDie: 8, maxMana: 0,
    armorProf: ['light'], weaponProf: ['simple'], weaponProfIds: ['shortsword', 'longsword', 'rapier'],
    abilityIds: ['dodge'], features: ['Sneak Attack: 1d6'], saves: ['dex', 'int'],
    skillCount: 4, skillList: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'persuasion', 'sleight of hand', 'stealth'],
    cantrips: { fixed: [], pick: 0 }, spellPicks: 0,
    subclass: { name: 'Thief', text: L('A nimble burglar and treasure hunter. Fast Hands lets you drink or hand out a potion as a bonus action, so you can still attack in the same turn.', 'Ein flinker Einbrecher und Schatzjäger. Mit Flinken Händen trinkst oder verabreichst du einen Trank als Bonusaktion und kannst im selben Zug trotzdem angreifen.') },
    levels: {
      2: { abilities: ['dash'] },
      3: { features: ['Sneak Attack: 2d6', 'Fast Hands: using a potion takes a bonus action instead of your action'] },
      4: { choose: ['feat'] },
      5: { features: ['Sneak Attack: 3d6'] },
    },
  },
  wizard: {
    id: 'wizard', name: 'Wizard', hitDie: 6, castingAbility: 'int', maxMana: 4,
    armorProf: [], weaponProf: ['simple'],
    abilityIds: ['dodge'], features: [], saves: ['int', 'wis'],
    skillCount: 2, skillList: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'],
    cantrips: { fixed: [], pick: 2 }, spellPicks: 2,
    subclass: { name: 'Evoker', text: L('A specialist in raw destructive magic. Potent Cantrip makes your damaging cantrips deal half damage even when they miss or the target saves.', 'Ein Spezialist für rohe Zerstörungsmagie. Durch Mächtigen Zaubertrick verursachen deine Schadens-Zaubertricks auch dann halben Schaden, wenn sie verfehlen oder das Ziel den Rettungswurf schafft.') },
    levels: {
      2: { features: ['Arcane Recovery: a short rest restores 1 extra mana'], choose: ['spell'] },
      3: { features: ['Potent Cantrip: your damaging cantrips deal half damage on a miss or a successful save'], choose: ['spell'] },
      4: { choose: ['feat', 'cantrip'] },
      5: { features: ['Empowered Cantrips: cantrips roll twice as many damage dice'], choose: ['spell'] },
    },
  },
  cleric: {
    id: 'cleric', name: 'Cleric', hitDie: 8, castingAbility: 'wis', maxMana: 4,
    armorProf: ['light', 'medium', 'shield'], weaponProf: ['simple'],
    abilityIds: ['dodge'], features: [], saves: ['wis', 'cha'],
    skillCount: 2, skillList: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    cantrips: { fixed: ['sacred_flame'], pick: 0 }, spellPicks: 2,
    subclass: { name: 'Life Domain', text: L('A servant of the gods of healing and vitality. Disciple of Life adds 3 hit points to every healing spell you cast.', 'Ein Diener der Götter der Heilung und Lebenskraft. Jünger des Lebens fügt jedem deiner Heilzauber 3 Trefferpunkte hinzu.') },
    levels: {
      2: { choose: ['spell'] },
      3: { features: ['Disciple of Life: your healing spells restore 3 extra hit points'], choose: ['spell'] },
      4: { choose: ['feat'] },
      5: { features: ['Empowered Cantrips: cantrips roll twice as many damage dice'] },
    },
  },
};

/** Spells each list offers, by spell level (0 = cantrips). */
export const SPELL_LISTS: Record<'wizard' | 'cleric', Record<number, string[]>> = {
  wizard: {
    0: ['fire_bolt', 'ray_of_frost', 'chill_touch', 'shocking_grasp', 'acid_splash', 'poison_spray'],
    1: ['magic_missile', 'burning_hands', 'thunderwave', 'mage_armor'],
    2: ['acid_arrow', 'shatter'],
  },
  cleric: {
    0: ['sacred_flame'],
    1: ['cure_wounds', 'healing_word', 'guiding_bolt', 'inflict_wounds'],
    2: [],
  },
};

/** Highest spell level a caster of this character level can learn. */
export const maxSpellLevel = (level: number) => (level >= 3 ? 2 : 1);

/** A short "when to take it" note for each spell. */
export const SPELL_TIPS: Record<string, L> = {
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
  recBackground: BackgroundId;
  recKit: string;
  recSpecies: SpeciesId;
  /** What the levels after the first bring, for the "your path" preview. */
  path: { level: number; text: L }[];
}

export const CLASS_GUIDE: Record<ClassId, ClassGuide> = {
  fighter: {
    id: 'fighter', name: 'Fighter', icon: '🛡️', recommendedFor: ALL,
    role: L('Front line · easy to play', 'Frontkämpfer · leicht zu spielen'),
    summary: L('A master of weapons and armor who stands between the monsters and the party.', 'Ein Meister der Waffen und Rüstungen, der zwischen den Monstern und der Gruppe steht.'),
    description: L('Fighters wear the heaviest armor, use every weapon and have the most hit points. They need no resources to be effective: every turn you attack, and you keep standing when others fall. The best choice for a first character.', 'Kämpfer tragen die schwerste Rüstung, führen jede Waffe und haben die meisten Trefferpunkte. Sie brauchen keine Ressourcen, um wirksam zu sein: Du greifst jede Runde an und stehst noch, wenn andere fallen. Die beste Wahl für einen ersten Charakter.'),
    effects: [
      E('Hit die d10', '10 + CON modifier hit points at level 1, then 6 + CON per level.', '10 + KON-Modifikator Trefferpunkte auf Stufe 1, danach 6 + KON pro Stufe.'),
      E('Saving throws', 'Proficient in Strength and Constitution saves.', 'Geübt in Stärke- und Konstitutionsrettungswürfen.'),
      E('Fighting Style', 'You pick a combat specialty at level 1.', 'Du wählst auf Stufe 1 eine Kampfspezialisierung.'),
      E('Second Wind', 'Bonus action, once per rest: regain 1d10 + your level hit points.', 'Bonusaktion, einmal pro Rast: Du erhältst 1W10 + deine Stufe Trefferpunkte zurück.'),
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
      E('New spells', 'You choose a new spell at levels 2, 3 and 5, and a third cantrip at level 4.', 'Auf den Stufen 2, 3 und 5 wählst du einen neuen Zauber, auf Stufe 4 einen dritten Zaubertrick.'),
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
      E('New spells', 'You choose a new spell at levels 2 and 3.', 'Auf den Stufen 2 und 3 wählst du einen neuen Zauber.'),
    ],
    goodFor: L('Players who like to support the group and still want to be hard to kill.', 'Spieler, die gern die Gruppe unterstützen und trotzdem schwer zu töten sein wollen.'),
    priority: ['wis', 'con', 'str', 'dex', 'cha', 'int'],
    armor: L('Light and medium armor, shields', 'Leichte und mittelschwere Rüstung, Schilde'), weapons: L('Simple weapons', 'Einfache Waffen'),
    recSkills: ['medicine', 'insight', 'persuasion', 'religion'], recSpells: ['cure_wounds', 'guiding_bolt'],
    recBackground: 'acolyte', recKit: 'cleric_battle', recSpecies: 'human',
    path: [
      { level: 2, text: L('A new spell.', 'Ein neuer Zauber.') },
      { level: 3, text: L('Subclass Life Domain: +3 hit points on every healing spell. A new spell.', 'Unterklasse Domäne des Lebens: +3 Trefferpunkte bei jedem Heilzauber. Ein neuer Zauber.') },
      { level: 4, text: L('A feat of your choice, or +2 to ability scores.', 'Ein Talent deiner Wahl oder +2 auf Attributswerte.') },
      { level: 5, text: L('Cantrips roll twice as many damage dice.', 'Zaubertricks würfeln doppelt so viele Schadenswürfel.') },
    ],
  },
};

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
    id: 'dwarf', name: 'Dwarf', icon: '⛏️', size: 'Medium', speed: 30, recommendedFor: ['fighter', 'cleric'], hpPerLevel: 1, resist: ['poison'],
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
    id: 'elf', name: 'Elf', icon: '🧝', size: 'Medium', speed: 35, recommendedFor: ['rogue', 'wizard'], skillChoice: ['insight', 'perception', 'survival'],
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
    id: 'halfling', name: 'Halfling', icon: '🍀', size: 'Small', speed: 30, recommendedFor: ['rogue'],
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
    id: 'orc', name: 'Orc', icon: '🪓', size: 'Medium', speed: 30, recommendedFor: ['fighter'], grants: ['adrenaline_rush'],
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
    id: 'dragonborn', name: 'Dragonborn', icon: '🐲', size: 'Medium', speed: 30, recommendedFor: ['fighter', 'cleric'], grants: ['breath_weapon'], resist: ['fire'],
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
    id: 'tiefling', name: 'Tiefling', icon: '😈', size: 'Medium', speed: 30, recommendedFor: ['wizard', 'rogue'], grants: ['fire_bolt'], resist: ['fire'],
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
    id: 'goliath', name: 'Goliath', icon: '🏔️', size: 'Medium', speed: 35, recommendedFor: ['fighter'],
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
    id: 'acolyte', name: 'Acolyte', icon: '📿', recommendedFor: ['cleric'], abilities: ['int', 'wis', 'cha'], skills: ['insight', 'religion'], feat: 'magic_initiate_cleric',
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
    id: 'sage', name: 'Sage', icon: '📚', recommendedFor: ['wizard'], abilities: ['con', 'int', 'wis'], skills: ['arcana', 'history'], feat: 'magic_initiate_wizard',
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
    id: 'soldier', name: 'Soldier', icon: '🎖️', recommendedFor: ['fighter'], abilities: ['str', 'dex', 'con'], skills: ['athletics', 'intimidation'], feat: 'savage_attacker',
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
export const EFFECT_LINES: Record<string, { name: string; de: string }> = Object.fromEntries(
  species.flatMap((s) => s.effects).map((e) => [effectLine(e), { name: e.name, de: e.text.de }]),
);

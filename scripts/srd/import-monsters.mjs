#!/usr/bin/env node
// Builds server/src/data/srd/monsters.json from the monsters of the System Reference
// Document 5.2.1 (Wizards of the Coast, CC BY 4.0), as structured by the 5e-bits
// "5e-database" project (MIT). Run it again when the source data changes:
//
//   node scripts/srd/import-monsters.mjs            (downloads the source file)
//   node scripts/srd/import-monsters.mjs <file>     (uses a local copy)
//
// The stat blocks of the SRD 5.2.1 are written to a strict pattern, so the rules text of
// each action is read into data the engine can run: attack rolls, damage, saving throws,
// areas, conditions, recharge and uses. What cannot be read stays as text for the
// Dungeon Master. Nothing here runs on a server; only the JSON it writes is shipped.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/5e-SRD-Monsters.json';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../server/src/data/srd/monsters.json');

const ABILITY = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const ABILITY_KEYS = Object.values(ABILITY);
const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const CONDITIONS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];

const feet = (s) => (s ? Number(String(s).match(/\d+/)?.[0] ?? 0) : 0);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const clean = (s) => String(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim();

const DMG = /(\d+) \((\d+d\d+(?: ?[+-] ?\d+)?)\) ([A-Z][a-z]+) damage|(\d+) ([A-Z][a-z]+) damage/g;
/** Every damage expression in a piece of rules text, in order. */
function damages(text) {
  const out = [];
  for (const m of text.matchAll(DMG)) out.push({ dice: (m[2] ?? m[4]).replace(/\s+/g, ''), type: (m[3] ?? m[5]).toLowerCase(), at: m.index, end: m.index + m[0].length });
  return out;
}

/** What a hit or a failed save does besides damage: a condition, how it ends, a push. */
function rider(text) {
  const r = {};
  const conds = [...text.matchAll(/(?:has|have|gains?) the ([A-Z][a-z]+)(?: (?:and|or) ([A-Z][a-z]+))? conditions?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean).map((c) => c.toLowerCase()).filter((c) => CONDITIONS.includes(c));
  const second = text.match(/Second Failure: [^.]*?the ([A-Z][a-z]+) condition/);
  const first = conds.filter((c) => !second || c !== second[1].toLowerCase() || conds.indexOf(c) === 0);
  if (first[0]) r.condition = first[0];
  if (first[1] && first[1] !== first[0]) r.also = first[1];
  if (second && CONDITIONS.includes(second[1].toLowerCase()) && second[1].toLowerCase() !== r.condition) r.escalate = second[1].toLowerCase();
  const size = text.match(/(Tiny|Small|Medium|Large|Huge) or smaller/);
  if (size) r.maxSize = size[1].toLowerCase();
  const esc = text.match(/escape DC (\d+)/);
  if (esc) r.escapeDc = Number(esc[1]);
  const push = text.match(/pushed (?:up to )?(\d+) feet/);
  if (push) r.push = Number(push[1]);
  const moved = text.match(/moved (\d+)\+? feet straight toward/);
  if (moved) r.ifMoved = Number(moved[1]);
  const save = text.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)/);
  if (save) r.save = { ability: ABILITY[save[1].toLowerCase()], dc: Number(save[2]) };
  if (r.condition) {
    if (/repeats the save at the end of (?:each of )?its turns?|repeats the save at the end of its next turn|at which point it repeats the save|when it repeats the save/.test(text)) r.ends = 'save_end';
    else if (/until the end of (?:its|the target's) next turn/.test(text)) r.ends = 'target_end';
    else if (/until the start of (?:its|the target's) next turn/.test(text)) r.ends = 'target_start';
    else if (/until the start of the [a-z' ]+?'s next turn/.test(text)) r.ends = 'source_start';
    else if (/until the end of the [a-z' ]+?'s next turn/.test(text)) r.ends = 'source_end';
    else if (r.condition === 'grappled' || /until the grapple ends/.test(text)) r.ends = 'escape';
    else if (r.condition === 'prone') r.ends = 'none';
    else if (/for (\d+) (minute|hour)/.test(text)) r.ends = 'minute';
    else r.ends = 'minute';
    if (r.condition === 'grappled' && !r.escapeDc) r.escapeDc = 12;
  }
  if (/can't regain Hit Points/.test(text)) r.noHealing = true;
  return Object.keys(r).length ? r : null;
}

const ATTACK = /^(Melee|Ranged|Melee or Ranged) Attack Roll: \+(\d+)(?: to hit)?(?: \(with Advantage ([^)]*)\))?, (?:reach (\d+) (?:ft\.?|feet))?(?:\.? ?or )?(?:range (\d+)(?:\/(\d+))? (?:ft\.?|feet))?\.? Hit: (.*)$/;

/** One or two attack entries (a weapon that is swung or thrown gives two) from an attack's rules text. */
function parseAttack(a, stats) {
  const text = clean(a.desc);
  const m = text.match(ATTACK);
  if (!m) return null;
  const [, , toHit, advIf, reach, range, long, hit] = m;
  const firstSentence = hit.split(/(?<=damage)[.,] /)[0];
  const all = damages(hit);
  if (!all.length) return null;
  const main = all[0];
  const extra = [];
  let after = hit.slice(main.end);
  // "plus 5 (2d4) Fire damage" straight after the main damage; ", plus … if the attack roll had Advantage"; "or … if …" is an alternative and is left out.
  for (const d of all.slice(1)) {
    const between = hit.slice(all[all.indexOf(d) - 1].end, d.at);
    if (/^,? plus $/.test(between)) {
      const cond = hit.slice(d.end, d.end + 40);
      extra.push({ dice: d.dice, type: d.type, ...(/^ if the attack roll had Advantage/.test(cond) ? { ifAdv: true } : {}) });
      after = hit.slice(d.end);
    } else break;
  }
  let r = rider(after) ?? undefined;
  // A saving throw without a condition the engine knows (a curse, a wound) stays text for the Dungeon Master.
  if (r && !r.condition && !r.push && !r.ifMoved) r = undefined;
  if (r && r.ifMoved) {
    const bonus = after.match(/takes an extra (\d+) \((\d+d\d+(?: ?[+-] ?\d+)?)\) ([A-Z][a-z]+) damage/);
    if (bonus) r.extra = { dice: bonus[2].replace(/\s+/g, ''), type: bonus[3].toLowerCase() };
  }
  const plain = /^[.]?$/.test(after.trim()) || /^\.?$/.test(hit.slice(firstSentence.length).trim());
  const base = {
    name: a.name, toHit: Number(toHit), damage: main.dice, damageType: main.type,
    ...(extra.length ? { extra } : {}),
    ...(r ? { rider: r } : {}),
    ...(advIf ? { advIf: /Grappled/.test(advIf) ? 'grappled' : /doesn't have all its Hit Points/.test(advIf) ? 'wounded' : /first round/.test(advIf) ? 'first_round' : undefined } : {}),
    ...(!plain || r ? { text } : {}),
  };
  void stats;
  const out = [];
  if (reach) out.push({ ...base, range: Number(reach) });
  if (range) out.push({ ...base, range: Number(range), ...(long ? { longRange: Number(long) } : {}), ranged: true });
  return out.length ? out : null;
}

const SAVE = /^(.*?)(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+), (.*?)\. (.*)$/;

/** An action that asks for a saving throw: a breath weapon, a gaze, a stench. */
function parseSave(a, slot) {
  const text = clean(a.desc);
  const m = text.match(SAVE);
  if (!m) return null;
  const [, lead, ability, dc, target, rest] = m;
  if (/Attack Roll/.test(lead)) return null;
  const s = { name: a.name, slot, save: ABILITY[ability.toLowerCase()], dc: Number(dc), damage: [], text };
  let t;
  if ((t = target.match(/(\d+)-foot Cone/))) s.area = { shape: 'cone', size: Number(t[1]) };
  else if ((t = target.match(/(\d+)-foot-long, (\d+)-foot-?wide Line/))) s.area = { shape: 'line', size: Number(t[1]), width: Number(t[2]) };
  else if ((t = target.match(/(\d+)-foot-radius Sphere.*?within (\d+) feet/))) s.area = { shape: 'sphere', size: Number(t[1]), range: Number(t[2]) };
  else if ((t = target.match(/(\d+)-foot Emanation/))) s.area = { shape: 'emanation', size: Number(t[1]) };
  else if ((t = target.match(/^one .*?within (\d+) feet/))) s.range = Number(t[1]);
  else if (/^one .*(Grappled by|in the .* space)/.test(target)) s.range = 5;
  else return null;
  if (/Grappled by/.test(target)) s.needs = 'grappled';
  else if (/has the Prone condition/.test(target)) s.needs = 'prone';
  if (/^any creature that starts its turn/.test(target)) s.slot = 'aura';
  if (/can see the|that can see/.test(target) && s.area) s.sight = true;
  const fail = rest.match(/(?:First )?Failure: (.*?)(?= Success:| Failure or Success:|$)/);
  if (!fail) return null;
  const failText = fail[1];
  const firstFail = failText.split(/ Second Failure: /)[0];
  s.damage = damages(firstFail).map(({ dice, type }) => ({ dice, type }));
  if (/Success: Half damage/.test(rest)) s.half = true;
  const r = rider(failText);
  if (r) { delete r.save; if (Object.keys(r).length) s.rider = r; }
  // A web, a rope or a net holds until it is destroyed: the hero can tear loose against the same DC.
  if (s.rider?.condition === 'restrained' && /until the [a-z ]+ is destroyed/.test(failText)) s.rider.escapeDc = s.dc;
  if (!s.damage.length && !s.rider) return null;
  const u = a.usage;
  if (u?.type === 'recharge on roll') s.recharge = u.min_value;
  else if (u?.type === 'per day') s.perDay = u.times;
  else if (u?.type === 'recharge after rest') s.perDay = 1;
  if (/can't take this action again until the start of its next turn/.test(rest)) s.cooldown = true;
  return s;
}

/** A multiattack as fixed steps plus, sometimes, a choice between alternatives. */
function parseMulti(a) {
  const step = (o) => [o.action_name, Number(o.count) || 1];
  const option = (o) => (o.option_type === 'multiple' ? (o.items ?? []).map(step) : [step(o)]);
  const fixed = (a.actions ?? []).map(step);
  const options = (a.action_options?.from?.options ?? []).map(option).filter((o) => o.length);
  return { fixed, ...(options.length ? { options } : {}) };
}

function parseLegendary(a, specials) {
  const text = clean(a.desc);
  const o = { name: a.name, text };
  const sv = parseSave(a, 'legendary');
  if (sv) { specials.push(sv); o.use = a.name; if (sv.cooldown) o.cooldown = true; return o; }
  if (/moves up to half its Speed/.test(text)) o.move = 'half';
  else if (/moves up to its Speed|flies up to (half )?its (Fly )?Speed|teleports/.test(text)) o.move = 'full';
  let m;
  if ((m = text.match(/makes one ([A-Z][A-Za-z' -]+?)(?: or [A-Z][A-Za-z' -]+?)? attack/))) o.use = m[1];
  else if ((m = text.match(/(?:uses Spellcasting to cast|casts) ([A-Z][A-Za-z' ]+?)(?: \(|,|\.| on)/))) o.spell = slug(m[1]);
  else if ((m = text.match(/uses ([A-Z][A-Za-z' -]+?)(?:\.|,| and)/))) o.use = m[1];
  if (/can't take this action again until the start of its next turn/.test(text)) o.cooldown = true;
  return o;
}

// ------------------------------------------------------------------ looks

const COLOR_WORDS = [
  ['red', 'red'], ['gold', 'yellow'], ['brass', 'orange'], ['bronze', 'brown'], ['copper', 'orange'], ['silver', 'grey'], ['white', 'white'], ['black', 'black'], ['blue', 'blue'], ['green', 'green'],
  ['fire', 'orange'], ['magma', 'orange'], ['flame', 'orange'], ['ice', 'white'], ['frost', 'white'], ['polar', 'white'], ['winter', 'white'], ['water', 'blue'], ['sea', 'teal'], ['storm', 'blue'], ['cloud', 'white'],
  ['shadow', 'black'], ['night', 'black'], ['ghost', 'white'], ['bone', 'bone'], ['skeleton', 'bone'], ['zombie', 'green'], ['ghoul', 'grey'], ['ghast', 'grey'], ['mummy', 'tan'], ['stone', 'grey'], ['iron', 'grey'], ['clay', 'tan'], ['flesh', 'pink'],
  ['earth', 'brown'], ['dust', 'tan'], ['mud', 'brown'], ['steam', 'white'], ['air', 'white'], ['ochre', 'yellow'], ['pudding', 'black'], ['gelatinous', 'teal'], ['violet', 'purple'], ['rust', 'orange'],
];
const BODY_WORDS = [
  ['rodent', /\brat|weasel|badger|\bbat\b|rabbit|hare/], ['insect', /spider|scorpion|centipede|beetle|wasp|insect|ankheg|crab|chuul|ettercap|\bbee|fly\b|mantis|remorhaz|carrion|rust monster/],
  ['serpent', /snake|serpent|naga|worm|behir|\beel|couatl|salamander|hydra|basilisk/], ['bird', /eagle|hawk|owl\b|raven|vulture|\broc\b|stirge|cockatrice|harpy|griffon|hippogriff|peryton|axe beak|phoenix|pteranodon/],
  ['dragon', /dragon|wyvern|drake|wyrmling|pseudodragon|tarrasque|tyrannosaurus|allosaurus|lizard|crocodile|plesiosaurus|ankylosaurus|triceratops|bulette/],
  ['ghost', /ghost|specter|wraith|shadow|will-o|wisp|banshee|invisible stalker/], ['ooze', /ooze|pudding|jelly|cube|mimic|gibbering|slime/],
  ['plant', /shrieker|fungus|blight|treant|shambling|awakened (shrub|tree)|violet/], ['giant', /giant$|^(cloud|fire|frost|hill|stone|storm) giant|ogre|troll|ettin|cyclops|oni\b/],
  ['aberration', /aboleth|cloaker|darkmantle|otyugh|kraken|octopus|squid|roper|grick|\bgrell/], ['construct', /golem|animated|armor|homunculus|shield guardian|flying sword|rug of/],
  ['elemental', /elemental|mephit|azer|djinni|efreeti|magmin|xorn|gargoyle|salamander/],
];

function lookFor(name, type, size, speed) {
  const n = name.toLowerCase();
  const typeBody = { aberration: 'aberration', beast: 'beast', celestial: 'humanoid', construct: 'construct', dragon: 'dragon', elemental: 'elemental', fey: 'humanoid', fiend: 'humanoid', giant: 'giant', humanoid: 'humanoid', monstrosity: 'beast', ooze: 'ooze', plant: 'plant', undead: 'humanoid' };
  let body = typeBody[type];
  if (!['humanoid', 'celestial', 'fey'].includes(type) || /wererat|rat form|bat form|wolf form|bear form|boar form|tiger form/.test(n)) {
    for (const [b, re] of BODY_WORDS) if (re.test(n)) { body = b; break; }
  }
  if (type === 'undead' && /ghost|specter|wraith|shadow|wisp/.test(n)) body = 'ghost';
  const typeColor = { aberration: 'purple', beast: 'brown', celestial: 'white', construct: 'grey', dragon: 'red', elemental: 'teal', fey: 'green', fiend: 'red', giant: 'tan', humanoid: 'tan', monstrosity: 'brown', ooze: 'green', plant: 'green', undead: 'grey' };
  let color = typeColor[type];
  for (const [w, c] of COLOR_WORDS) if (new RegExp(`\\b${w}`).test(n)) { color = c; break; }
  const look = { body, size, color, heads: 1, arms: 2, horns: false, tail: false, wings: null, eyes: null, armor: null, weapon: null, aura: null, mutation: null, imageId: null };
  if (/ettin/.test(n)) look.heads = 2;
  if (/hydra|chimera|cerberus/.test(n)) look.heads = 3;
  if (type === 'dragon' || /wyvern|manticore|chimera|gargoyle|imp\b|quasit|balor|pit fiend|erinyes|vrock|succubus|incubus|horned devil|bone devil|ice devil|mephit|bat form|vampire/.test(n)) look.wings = 'bat';
  if (type === 'celestial' || /pegasus|griffon|hippogriff|sphinx|couatl|harpy|peryton/.test(n)) look.wings = 'feather';
  if (body === 'bird' && !look.wings) look.wings = 'feather';
  if (speed.fly && !look.wings && ['beast', 'monstrosity', 'fiend'].includes(type) && body !== 'insect') look.wings = body === 'bird' ? 'feather' : 'bat';
  if (type === 'fiend' || type === 'dragon' || /minotaur|goat|ram\b|bull|ox\b|elk|deer|satyr|gorgon|triceratops|unicorn|rhinoceros|oni/.test(n)) look.horns = true;
  if (type === 'fiend' || type === 'dragon' || body === 'rodent' || body === 'dragon' || /wolf|lion|tiger|panther|cat\b|ape|baboon|monkey|kobold|lizardfolk|scorpion|manticore|chimera|hound|jackal|hyena|horse|mastiff/.test(n)) look.tail = true;
  if (type === 'fiend') look.eyes = 'yellow';
  if (type === 'undead') look.eyes = body === 'ghost' ? 'blue' : 'red';
  if (/skeleton|lich|bone/.test(n)) look.mutation = 'skeletal';
  else if (/zombie|ghoul|ghast|mummy|otyugh/.test(n)) look.mutation = 'rotting';
  else if (body === 'ghost') look.mutation = /shadow|wraith/.test(n) ? 'shadowy' : 'spectral';
  else if (/xorn|galeb|crystal|ice mephit/.test(n)) look.mutation = 'crystal';
  if (/fire|flame|magma|balor|efreeti|hell hound|salamander|azer|magmin|phoenix|pit fiend/.test(n) || (type === 'dragon' && /red|gold|brass/.test(n))) look.aura = 'fire';
  else if (/ice|frost|winter/.test(n) || (type === 'dragon' && /white|silver/.test(n))) look.aura = 'frost';
  else if (/storm|lightning|djinni|air elemental/.test(n) || (type === 'dragon' && /blue|bronze/.test(n))) look.aura = 'lightning';
  else if (type === 'celestial') look.aura = 'holy';
  else if (type === 'dragon' && /green/.test(n)) look.aura = 'poison';
  else if (/lich|wraith|vampire|death/.test(n)) look.aura = 'shadow';
  if (['humanoid', 'giant'].includes(body) && ['humanoid', 'fey', 'giant', 'fiend', 'celestial', 'undead'].includes(type)) {
    if (/archer|scout|bow/.test(n)) look.weapon = 'bow';
    else if (/mage|priest|druid|cultist|lich|hag|acolyte|archmage|fanatic/.test(n)) look.weapon = 'staff';
    else if (/berserker|minotaur|executioner/.test(n)) look.weapon = 'axe';
    else if (/giant|ogre|troll|ettin|cyclops|bugbear|zombie|ghoul|commoner/.test(n)) look.weapon = /zombie|ghoul|troll|commoner/.test(n) ? null : 'club';
    else if (/guard|merfolk|lizardfolk|kobold|centaur|hobgoblin/.test(n)) look.weapon = 'spear';
    else if (type !== 'undead' || /skeleton|knight/.test(n)) look.weapon = 'sword';
    if (/knight|captain|guard|gladiator|veteran|warrior|champion|hobgoblin|death knight|helmed|solar|planetar|deva|pit fiend/.test(n)) look.armor = 'plate';
    else if (/bandit|scout|thug|tough|pirate|spy|assassin|goblin|berserker|gnoll|orc/.test(n)) look.armor = 'leather';
  }
  return look;
}

/** Coins a creature carries, as a dice expression: people, giants and dragons have some, animals none. */
function goldFor(type, cr) {
  if (!['humanoid', 'giant', 'dragon', 'fiend', 'fey', 'celestial'].includes(type) && !(type === 'undead' && cr >= 5)) return undefined;
  if (cr < 1) return '2d6';
  if (cr < 3) return '4d10';
  if (cr < 5) return '6d10';
  if (cr < 9) return type === 'dragon' ? '10d20' : '6d20';
  if (cr < 13) return type === 'dragon' ? '20d20' : '10d20';
  if (cr < 17) return type === 'dragon' ? '40d20' : '20d20';
  return type === 'dragon' ? '100d20' : '40d20';
}

const crText = (cr) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));

function convert(m, stats) {
  const type = m.type.startsWith('swarm') ? m.type.split(' ').pop().replace(/s$/, '') : m.type;
  const size = m.size.toLowerCase().split(' ')[0];
  const speed = Object.fromEntries(Object.entries(m.speed ?? {}).map(([k, v]) => [k, feet(v)]));
  const abilities = Object.keys(ABILITY).map((k) => m[k]);
  const saves = {};
  for (const p of m.proficiencies ?? []) {
    const s = p.proficiency.index.match(/^saving-throw-(\w+)$/);
    if (s) saves[s[1]] = p.value;
  }
  const out = {
    id: slug(m.index), name: clean(m.name), type, size, ...(m.type.startsWith('swarm') ? { swarm: true } : {}),
    cr: crText(m.challenge_rating), xp: m.xp, ac: m.armor_class?.[0]?.value ?? 10, hp: m.hit_points,
    speed: speed.walk || Math.max(speed.fly ?? 0, speed.swim ?? 0, speed.burrow ?? 0, speed.climb ?? 0),
    ...(speed.fly ? { fly: speed.fly } : {}), ...(speed.swim ? { swim: speed.swim } : {}), ...(speed.climb ? { climb: speed.climb } : {}), ...(speed.burrow ? { burrow: speed.burrow } : {}),
    abilities, ...(Object.keys(saves).length ? { saves } : {}), pb: m.proficiency_bonus,
  };
  const list = (xs) => [...new Set((xs ?? []).flatMap((x) => (typeof x === 'string' ? x : x.index ?? x.name ?? '').toLowerCase().split(/[,;] ?/)).map((x) => x.trim()).filter(Boolean))];
  for (const [k, src] of [['resist', m.damage_resistances], ['immune', m.damage_immunities], ['vulnerable', m.damage_vulnerabilities], ['conditionImmune', m.condition_immunities]]) {
    const v = list(src);
    if (v.length) out[k] = v;
  }
  for (const k of ['darkvision', 'blindsight', 'truesight', 'tremorsense']) if (m.senses?.[k]) out[k] = feet(m.senses[k]);
  // Passive Perception and the Stealth bonus decide who is surprised when a fight starts.
  if (m.senses?.passive_perception) out.perception = m.senses.passive_perception;
  const stealth = (m.proficiencies ?? []).find((p) => p.proficiency.index === 'skill-stealth');
  if (stealth) out.stealth = stealth.value;
  if (m.languages && !/^(None|—|-)?$/.test(m.languages)) out.languages = clean(m.languages);

  const attacks = [], specials = [], traits = [], spells = [];
  const flags = {};
  const text = (slot, a) => traits.push({ name: a.name, ...(slot ? { slot } : {}), text: clean(a.desc) });
  const noteSpells = (a) => {
    const sc = a.spellcasting;
    if (!sc) return false;
    if (sc.dc) out.spellDc = sc.dc;
    if (sc.modifier) out.spellHit = sc.modifier;
    for (const s of sc.spells ?? []) {
      if (spells.some((x) => x.id === slug(s.index))) continue;
      spells.push({ id: slug(s.index), name: s.name, ...(s.usage?.type === 'per day' ? { perDay: s.usage.times } : {}) });
    }
    return true;
  };
  for (const a of m.actions ?? []) {
    if (a.name === 'Multiattack') { out.multi = parseMulti(a); stats.multi++; continue; }
    if (noteSpells(a)) { text('action', a); continue; }
    const atk = parseAttack(a, stats);
    if (atk) { attacks.push(...atk); stats.attacks++; continue; }
    const sv = parseSave(a, 'action');
    if (sv) { specials.push(sv); stats.saves++; continue; }
    text('action', a); stats.textActions++;
  }
  for (const a of m.bonus_actions ?? []) {
    if (a.name === 'Nimble Escape' || a.name === 'Cunning Action') { flags.nimbleEscape = true; text('bonus', a); continue; }
    if (noteSpells(a)) { text('bonus', a); continue; }
    const sv = parseSave(a, 'bonus');
    if (sv) { specials.push(sv); stats.saves++; continue; }
    text('bonus', a); stats.textBonus++;
  }
  for (const a of m.reactions ?? []) {
    const parry = a.name === 'Parry' && clean(a.desc).match(/adds (\d+) to its AC/);
    if (parry) flags.parry = Number(parry[1]);
    noteSpells(a);
    text('reaction', a);
  }
  for (const a of m.special_abilities ?? []) {
    const d = clean(a.desc);
    noteSpells(a);
    if (a.name === 'Pack Tactics') flags.packTactics = true;
    else if (a.name === 'Flyby') flags.flyby = true;
    else if (a.name === 'Magic Resistance') flags.magicResistance = true;
    else if (a.name === 'Legendary Resistance') flags.legendaryResistance = a.usage?.times ?? 3;
    else if (a.name === 'Undead Fortitude') flags.undeadFortitude = true;
    else if (a.name === 'Bloodied Fury' || a.name === 'Bloodied Frenzy') flags.bloodiedFury = true;
    else if (a.name === 'Regeneration') {
      const amount = d.match(/regains (\d+) Hit Points at the start of each of its turns/);
      const stop = d.match(/takes ([A-Za-z, ]+?) damage, this trait doesn't function/);
      if (amount) flags.regeneration = { amount: Number(amount[1]), ...(stop ? { stop: stop[1].toLowerCase().split(/,? or |, /).map((x) => x.trim()).filter(Boolean) } : {}) };
    }
    const aura = d.match(/^At the end of each of the [a-z' ]+?'s turns, each creature (?:of the [a-z' ]+?'s choice )?in a (\d+)-foot Emanation originating from the [a-z' ]+? takes (\d+) \((\d+d\d+(?: ?[+-] ?\d+)?)\) ([A-Z][a-z]+) damage/);
    if (aura) flags.aura = { size: Number(aura[1]), dice: aura[3].replace(/\s+/g, ''), type: aura[4].toLowerCase() };
    const slot = /explodes when it dies|^The [a-z' ]+ (?:explodes|bursts) when it dies/.test(d) || a.name === 'Death Burst' || a.name === 'Death Throes' ? 'death' : 'trait';
    const sv = parseSave(a, slot);
    if (sv && (sv.slot === 'aura' || sv.slot === 'death')) { specials.push(sv); stats.saves++; continue; }
    traits.push({ name: a.name, text: d });
  }
  if (attacks.length) out.attacks = attacks;
  if (specials.length) out.specials = specials;
  if (spells.length) out.spells = spells;
  // The source data has a stray fragment of a sentence as an "action" in one stat block.
  const leg = (m.legendary_actions ?? []).filter((a) => !/\(level \d+ version\)/.test(a.name)).map((a) => parseLegendary(a, specials));
  if (specials.length) out.specials = specials;
  if (leg.length) { out.legendary = { uses: 3, options: leg }; stats.legendary++; }
  if (Object.keys(flags).length) out.flags = flags;
  if (traits.length) out.traits = traits;
  out.look = lookFor(out.name, type, size, speed);
  const gold = goldFor(type, m.challenge_rating);
  if (gold) out.gold = gold;
  return out;
}

const arg = process.argv[2];
const raw = arg ? await readFile(arg, 'utf8') : await (await fetch(SOURCE)).text();
const stats = { attacks: 0, saves: 0, multi: 0, legendary: 0, textActions: 0, textBonus: 0 };
const monsters = JSON.parse(raw).map((m) => convert(m, stats)).sort((a, b) => a.id.localeCompare(b.id));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(monsters)}\n`);
console.log(`${monsters.length} monsters written to ${OUT}`);
console.log(stats);

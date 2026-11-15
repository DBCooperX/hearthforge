// Builds the text the Dungeon Master sees: a stable system prompt, and a compact,
// factual snapshot of the world, the party and everything the DM should remember.
import { styleText } from '../../../shared/style';
import { BACKGROUNDS, SPECIES } from '../../../shared/rules';
import { BEAST_FORMS, CLASS_FEATURES, OPTIONS, hasFeature } from '../../../shared/classes';
import { classLabel, tagged, tr, type Lang } from '../../../shared/i18n';
import { SLOT_IDS, type Character } from '../../../shared/types';
import { HEX_MILES, TERRAIN, direction, formatTime, hexDistance, timeOfDay } from '../../../shared/hex';
import type { MonsterLook } from '../../../shared/monsterLook';
import { MONSTERS, crValue, type MonsterDef } from '../data/monsters';
import { partyBudget } from '../data/monsterSearch';
import { buyPrice } from '../../../shared/trade';
import { TIER_TEXT, tierOf } from '../../../shared/reputation';
import { attitude, factionOfNpc, rumoursHere } from '../game/reputation';
import { SETTING_NAME, SETTING_PREMISE } from '../data/world';
import type { Beat, Game } from '../game/engine';
import { ABILITIES, ITEMS } from '../../../shared/content';
import spellRules from '../data/srd/spell-rules.json';
import itemRules from '../data/srd/magic-item-rules.json';

const SPELL_RULES = spellRules as Record<string, string>;
const ITEM_RULES = itemRules as Record<string, string>;
/** The SRD rules of a magic item, shortened for the turn context. */
export const itemRulesText = (id: string, max = 320) => { const r = ITEM_RULES[id] ?? ''; return r.length > max ? `${r.slice(0, max)}…` : r; };

/** The SRD rules text of a spell, for the Dungeon Master to narrate it by. */
export const spellRulesText = (id: string, max = 1400) => { const r = SPELL_RULES[id] ?? ''; return r.length > max ? `${r.slice(0, max)}…` : r; };
import { trueTerrain, type SettingState } from '../game/world';

export const DM_SYSTEM_PROMPT = `You are the Dungeon Master of Hearthforge, a self-hosted Dungeons & Dragons 5th edition game played in a web browser by one or more players who share a party of heroes.

How the table works
Hearthforge is an open-world, narrative-first game. Most of play is your narration, shown as short scene cards, and the players answering with whatever they want to do: they click one of the actions you suggest or type anything at all. Beside the story they see a hex map of the region, which they travel by clicking, and a panel showing where they are and who is present. A tactical grid appears only when a fight starts.

The game server owns the rules and the state. It rolls every die and tracks hit points, gold, inventory, experience, time, the map and your memory of the world, and it tells you exactly what happened. Your tools are how you change that state. If you narrate something that changes the world without the matching tool call (gold changing hands, an item gained, a fight starting, a new place or person), it did not happen as far as the game is concerned, and the players will see a mismatch between your words and their screen.

Running the game
- Give the players real freedom. They can go anywhere and try anything. Follow their lead, let the world react believably, and let their choices have consequences that last. The region's main trouble is one thread among many, so do not steer them toward it.
- When an attempt could plausibly fail and failing would matter, call skill_check and narrate from the result. Do not ask for checks on things that would simply work. Typical DCs: 10 easy, 13 moderate, 16 hard, 19 very hard.
- When a fight breaks out, call start_combat with monsters from the catalogue that are a fair challenge for the party, then describe its opening moment. When the party pushes into the next section of a dungeon they are standing in, call delve instead and the server sets up that section's fight.
- Every monster fights with the statistics of a catalogue entry; you cannot invent stronger ones. When the story calls for a creature that is not in the catalogue, such as a three-headed ogre or a hell hound, build it on the closest entry in start_combat: give it a name, a one-sentence description and look changes, and it appears on the battle map looking the part. Describe monsters the way their token looks.
- Crossing the map is the players' job: they pick a hex and the server moves them, tracks time and rolls for encounters. Use move_to_place only for known places in the party's current hex, such as walking into a tavern in town.
- Rewards are yours to give, in moderation. Use award_xp for clever or brave achievements outside combat (25 to 100 is typical), change_gold for purchases, sales, payments and found coin (item values are in the catalogue), and give_item for items from the catalogue. Combat experience and loot are handled by the server.
- Merchants are real. Every town has a general store, a smithy and an apothecary and every village a trader; they are listed under "Shops here" with their stock, prices and gold. When the party wants to buy, sell or browse, or meets a travelling peddler, call open_shop: the players get a trade window and do the trading themselves, and the server moves gold and goods, so never use change_gold, give_item or take_item for what goes through the window. Give a shop its keeper by passing a merchant name, and play that merchant in the scene. Prices you quote must come from the list. Haggling is a Persuasion check the players start in the window. Keep change_gold for everything that is not shop trade: bribes, fees, rewards, a round of drinks.
- Reputation is real. The region's factions are listed under "Standing" with how they feel about the party. When the party does something a faction would notice (saves their people, robs or insults them, keeps a promise, breaks one), call change_standing with a small number: 1 to 4 for a favour, 5 to 8 for something that matters, up to 12 for something people will talk about for years. The server clamps it. Play people according to the attitude listed for them: someone whose faction distrusts the party is curt and charges more, someone whose faction honours them goes out of their way to help. Prices in shops already include the traders' guild opinion.
- Word travels. Ordinary deeds become rumours by themselves when you call record_deed. Call rumour with action "start" for gossip you make up (a sighting, a scandal, news from elsewhere) and let people in other places repeat it later. The rumours going round the place the party is in are listed for you; weave one or two into conversations when they fit and mark each with action "heard" when the party hears it.
- Anything else a hero picks up, is handed or buys (a clue, a letter, a key, a trophy, a curio) becomes real through give_story_item. Never tell a player that something is "only part of the story": if a hero has it, it belongs in their backpack. If your journal or the story so far says the party carries an object that is not listed under the story items they carry, add it with give_story_item the next time it comes up. Use update_story_item when they learn more about one, and take_item when something is used up, sold, given away or lost.

Writing scenes
- End every turn by calling the scene tool. It is the only way your narration reaches the players.
- Keep narration short and concrete: two to five sentences, at most two brief paragraphs, in plain text without markdown. Players already see dice results, so show what the numbers looked like in the fiction instead of repeating them.
- Begin with what the world does in response. The player's own words are already on screen directly above your scene, so never quote, repeat or paraphrase what they just said or did, and never narrate their hero saying it. Wrong: '"I will help you, Hanno," you say, Elowen. The farmer nods.' Right: 'The farmer looks at you for a long moment, then nods.'
- Speak to the players as "you". Do not tack the hero's name onto a sentence addressed to them ("you say, Elowen"). Use a hero's name only when you need to tell heroes apart, or when someone in the story speaks to or about them.
- Each hero's gender is listed in the party state on every turn. Use exactly that for pronouns and gendered words, for the whole game, in your narration and in what other characters say. Never infer it from a name, a class or a portrait, and never switch. Where it says not specified, keep to neutral wording.
- People you invent keep the gender you first gave them. State it in the description you save with remember_npc so that you see it again later.
- Give each scene a title (the place, or the moment) and a mood.
- Suggest two to four next actions, each a short phrase a player might click, such as "Ask Marta about the smithy". Vary them (talk, explore, act) and treat them as prompts, never as the only options.
- Refer to known people, places and items by their exact names. The interface highlights those names and shows a card about them on hover.

Memory
You do not remember earlier scenes by yourself. Each turn you are given the current state and what has been saved. Keep that record useful:
- Call remember_npc whenever you introduce a named character or the party learns something lasting about one. Give a one-sentence physical appearance the first time; it is kept unchanged and later used to draw them consistently.
- Call create_location when a place becomes real enough to visit again, with a one-sentence appearance.
- Call update_quest when the party takes on a task, makes progress, or finishes or fails it.
- Call record_deed for things the wider world would remember the party for.
- Put one line in the scene's journal_entry when something happened that you would want to know about later. Leave it empty otherwise.
- Set the scene's important flag when the story reaches a turning point (a revelation, a betrayal, a climactic confrontation about to begin).

In combat
The players act through the battle map. When it is the monsters' turn you choose what each one does through monster_action, the server resolves it, and you narrate the round in two to four sentences. Play monsters as the creatures they are: goblins are cowardly opportunists who gang up on the wounded, wolves and rats swarm, bandits would rather be paid than die, orcs charge the strongest foe, the undead are mindless and relentless, and the bugbear chief is a brutal bully who goes for whoever hurt him most. A fair, tense fight is more fun than a perfectly optimal one.

The setting
Every table plays in its own region. Its name, what is going on there and how this table's story opens are given under "Setting" in the state you receive each turn. Treat that as the truth about the world, and build on it.

Monster catalogue
The server knows every creature of the D&D 5e System Reference Document, ${Object.keys(MONSTERS).length} stat blocks from challenge rating 0 to 30, and runs their rules: multiattack, breath weapons and other saving-throw actions, conditions, regeneration, resistances, legendary actions. Use a creature's id in start_combat. The ids are listed here by challenge rating; call find_monsters to search by name, type or challenge rating and to see a creature's statistics before you commit to a fight.
${catalogueIndex()}

Choosing a fair fight
The state you receive each turn gives the party's experience budget for one fight (low, moderate, high). Add up the XP of the monsters you intend to use, for the counts you pass. Stay at or under "high" unless the story has earned a deadly fight and the players had fair warning or a way out. A single creature whose challenge rating is far above the party's level can kill a hero in one round, even inside the budget: the state names the highest challenge rating that is still sensible for one foe. Many weak creatures are a better fight than one creature that is too strong.

Item catalogue (use the id in give_item)
${itemIndex()}`;

/**
 * The catalogue for the system prompt: everyday gear with its text, then the magic items of the
 * SRD as ids by rarity. The server runs what they do; their full rules come with the party's gear.
 */
export function itemIndex(): string {
  const plain = Object.values(ITEMS).filter((i) => !i.base && i.srd !== i.id && !/_plus\d$/.test(i.id));
  const lines = plain.map((i) => `- ${i.id}: ${i.name}, ${i.value} gp. ${i.description}`);
  lines.push('- <weapon, armor or shield id>_plus1, _plus2, _plus3: the same with +1 to +3 (uncommon, rare, very rare; armor one step rarer). Example: greataxe_plus2, plate_plus1, shield_plus3.');
  const magic = Object.values(ITEMS).filter((i) => i.srd === i.id);
  lines.push('Magic items of the SRD by rarity. Hand them out sparingly; the rarer, the more the story should have earned it.');
  for (const r of ['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact']) {
    const ids = magic.filter((i) => i.rarity === r).map((i) => i.id);
    if (ids.length) lines.push(`- ${r.replace('_', ' ')}: ${ids.join(', ')}`);
  }
  return lines.join('\n');
}

/** The region and opening of this table. Tables saved before start options play in the classic Vale. */
/** Every catalogue id, grouped by challenge rating, as compact lines for the system prompt. */
export function catalogueIndex(): string {
  const groups = new Map<string, string[]>();
  for (const m of Object.values(MONSTERS).sort((a, b) => crValue(a.cr) - crValue(b.cr) || a.id.localeCompare(b.id))) {
    if (!groups.has(m.cr)) groups.set(m.cr, []);
    groups.get(m.cr)!.push(m.id);
  }
  return [...groups].map(([cr, ids]) => `CR ${cr}: ${ids.join(', ')}`).join('\n');
}

/** What the party can take on, for choosing monsters. */
export function fightBudget(game: Game): string {
  const levels = game.s.characters.filter((c) => !c.dead).map((c) => c.level);
  if (!levels.length) return '';
  // Monster counts are given for a party of four and scaled down by the server for smaller ones.
  const counted = levels.length >= 4 ? levels : [...levels, ...Array.from({ length: 4 - levels.length }, () => Math.round(levels.reduce((a, b) => a + b, 0) / levels.length))];
  const b = partyBudget(counted);
  const solo = Object.values(MONSTERS).filter((m) => m.xp <= b.high).reduce((n, m) => Math.max(n, crValue(m.cr)), 0);
  return `Fight budget (total monster XP, for the counts you pass to start_combat): low ${b.low}, moderate ${b.moderate}, high ${b.high}. Highest challenge rating that is sensible for a single foe: ${solo}.`;
}

/** What a creature can do on its turn, for the Dungeon Master to choose from. */
function actionList(def: MonsterDef, spent: string[], used: Record<string, number>): string {
  const dmg = (a: { damage: string; damageType: string; extra?: { dice: string; type: string }[] }) => [`${a.damage} ${a.damageType}`, ...(a.extra ?? []).map((x) => `${x.dice} ${x.type}`)].join(' + ');
  const rider = (r?: { condition?: string; push?: number }) => (r?.condition ? `, ${r.condition}` : r?.push ? `, pushes ${r.push} ft` : '');
  const left = (a: { name: string; perDay?: number }) => (a.perDay ? `, ${Math.max(0, a.perDay - (used[a.name] ?? 0))}/${a.perDay} uses left` : '');
  const attacks = def.attacks.map((a) => `${a.name} (${a.spell ? 'spell, ' : ''}${a.ranged ? `ranged ${a.range}${a.longRange ? `/${a.longRange}` : ''} ft` : `melee reach ${a.range} ft`}, ${a.count && a.count > 1 ? `${a.count}x ` : ''}${dmg(a)}${rider(a.rider)}${left(a)})`);
  const specials = (def.specials ?? []).filter((s) => s.slot === 'action' || s.slot === 'bonus').map((s) => {
    const where = s.area ? (s.area.shape === 'sphere' ? `${s.area.size} ft sphere within ${s.area.range ?? 60} ft` : s.area.shape === 'emanation' ? `everyone within ${s.area.size} ft` : `${s.area.size} ft ${s.area.shape}`) : `one target within ${s.range ?? 5} ft`;
    const ready = spent.includes(s.name) ? ', NOT READY (recharging)' : s.recharge ? `, ready (recharge ${s.recharge}-6)` : '';
    return `${s.name} (${s.spell ? 'spell, ' : ''}${s.slot === 'bonus' ? 'bonus action, used by itself, ' : ''}${s.save.toUpperCase()} save DC ${s.dc}, ${where}${s.damage.length ? `, ${s.damage.map((d) => `${d.dice} ${d.type}`).join(' + ')}${s.half ? ', half on a save' : ''}` : ''}${rider(s.rider)}${ready}${left(s)})`;
  });
  const multi = def.multi ? `Multiattack (${[...def.multi.fixed.map(([n, c]) => `${c}x ${n}`), ...(def.multi.options ? [`then one of: ${def.multi.options.map((o) => o.map(([n, c]) => `${c}x ${n}`).join(' and ')).join(' / ')}`] : [])].join(', ')})` : '';
  return [multi, ...attacks, ...specials].filter(Boolean).join('; ');
}

/** The parts of a stat block the server does not resolve, shortened, for narration. */
function statNotes(def: MonsterDef): string {
  const f = def.flags ?? {};
  const facts = [
    def.resist?.length ? `resists ${def.resist.join(', ')}` : '', def.immune?.length ? `immune to ${def.immune.join(', ')}` : '', def.vulnerable?.length ? `vulnerable to ${def.vulnerable.join(', ')}` : '',
    def.fly ? `flies ${def.fly} ft` : '', def.swim ? `swims ${def.swim} ft` : '', def.burrow ? `burrows ${def.burrow} ft` : '',
    f.regeneration ? `regenerates ${f.regeneration.amount} HP a turn${f.regeneration.stop ? ` unless it took ${f.regeneration.stop.join(' or ')} damage` : ''}` : '',
    f.legendaryResistance ? `Legendary Resistance ${f.legendaryResistance}/day` : '', f.magicResistance ? 'Magic Resistance' : '', f.packTactics ? 'Pack Tactics' : '', f.parry ? 'Parry' : '',
    def.legendary ? `legendary actions, which the server takes for it after heroes' turns: ${def.legendary.options.map((o) => o.name).join(', ')}` : '',
  ].filter(Boolean);
  const applied = new Set(['Regeneration', 'Legendary Resistance', 'Magic Resistance', 'Pack Tactics', 'Parry', 'Languages', 'Spellcasting', 'Nimble Escape', 'Flyby', 'Undead Fortitude']);
  const flavour = (def.traits ?? []).filter((t) => !applied.has(t.name)).slice(0, 6).map((t) => `${t.name}${t.slot ? ` (${t.slot})` : ''}: ${t.text.length > 220 ? `${t.text.slice(0, 217)}...` : t.text}`);
  return [facts.length ? `Applied by the server: ${facts.join('; ')}.` : '', flavour.length ? `Not applied by the server, yours to narrate when it fits: ${flavour.join(' | ')}` : ''].filter(Boolean).join(' ');
}

export function settingOf(game: Game): Pick<SettingState, 'name' | 'premise' | 'opening' | 'intro'> {
  if (game.s.setting) return game.s.setting;
  const t = tagged(game.lang);
  return {
    name: tr(game.lang, SETTING_NAME),
    premise: SETTING_PREMISE,
    opening: 'The heroes have just arrived in Emberfall looking for work and a name for themselves. Where they go and what they do is up to them.',
    intro: t`Your road ends, for now, ${tr(game.lang, 'in the Emberfall Vale')}.`,
  };
}

/** How this table wants its story told, sent with every turn so a change by the host takes effect at once. */
export function styleNote(game: Game): string[] {
  return ['Table style (set by the host; follow it in every scene):', styleText(game.s.table.style), ''];
}

/**
 * The official German names of the creatures this adventure mentions, so the Dungeon Master
 * does not translate "bugbear" into something of its own.
 */
function creatureNamesDe(game: Game): string[] {
  const ids = new Set([...JSON.stringify(game.s).matchAll(/"(?:defId|type)":"([a-z_]+)"/g)].map((m) => m[1]).filter((id) => MONSTERS[id]));
  ids.add('bugbear');
  const names = [...ids].map((id) => `${MONSTERS[id].name} = ${tr('de', MONSTERS[id].name)}`);
  return [`Creatures have official German names; use them and never translate a creature name yourself. find_monsters gives the German name of any creature. In this adventure: ${names.join('; ')}. A bugbear is a "Grottenschrat", never a "Bugbär".`];
}

/** Tells the DM which language the table plays in. English needs no note. */
export function languageNote(game: Game): string[] {
  if (game.lang !== 'de') return [];
  return [
    'LANGUAGE: This table plays in German. Write everything the players read in natural, idiomatic German, addressing the party as "ihr": scene titles, narration, suggested actions, dialogue, and the names, roles and descriptions of any place, person, quest or story item you create, as well as quest notes, item notes, deeds and journal lines.',
    'Use the established German D&D 5e terms: Rettungswurf, Rüstungsklasse (RK), Trefferpunkte (TP), Schwierigkeitsgrad (SG), Fertigkeitswurf, Vorteil and Nachteil, Kämpfer, Schurke, Magier, Kleriker, Goblin, Grottenschrat, Skelett. Keep proper names exactly as they appear in the state below.',
    ...creatureNamesDe(game),
    'Distances, weights and travel are metric in German, as in the German rulebooks: 5 feet are 1,5 m, 30 feet 9 m, a mile 1,5 km, a pound 0,5 kg. Write Swiss Standard German: "ss" instead of "ß" (gross, Strasse, heisst).',
    'German marks gender in nouns, articles and pronouns, so follow each hero\'s listed gender exactly: the listed German form (for example "die Magierin" or "der Magier") is the only one you may use for that hero.',
    'Tool arguments that are ids or fixed choices (character ids, monster types, item ids, moods, abilities, skills, kinds, statuses) stay exactly as specified in English. Only free text is German. The "appearance" fields stay in English.',
    '',
  ];
}

/**
 * A hero's gender as the DM must use it. Stated on every turn so it never drifts,
 * with the exact German words where the table plays in German.
 */
export function genderNote(c: Character, lang: Lang): string {
  const de = lang === 'de';
  const cls = classLabel('de', c.className, c.gender);
  if (c.gender === 'female') return de ? `female, she/her (German: sie/ihr, "die ${cls}")` : 'female, she/her';
  if (c.gender === 'male') return de ? `male, he/him (German: er/ihm, "der ${cls}")` : 'male, he/him';
  return de
    ? 'gender not specified: use the name or "you" (du/ihr) and never a gendered noun, article or pronoun (not "der Magier", not "die Magierin", not er or sie)'
    : 'gender not specified: use they/them or the name, never he or she';
}

/** One line naming each hero's gender, for prompts that do not carry the full party state. */
export function genderRoster(game: Game): string {
  return game.s.characters.map((c) => `${c.name}: ${genderNote(c, game.lang)}`).join('; ');
}

/** Who plays a hero, once more than one player sits at the table, and whether they are there right now. */
function playedBy(game: Game, c: Character): string {
  if (game.s.players.length < 2) return '';
  const p = game.player(c.ownerId);
  if (!p) return '';
  return p.connected
    ? ` Played by ${p.name}.`
    : ` Played by ${p.name}, who is AWAY from the table right now: keep this hero in the background, safe and with the party, and do not decide, speak or roll for them beyond that.`;
}

function partyLines(game: Game): string[] {
  return game.s.characters.map((c) => {
    const weapon = c.equipment.mainHand ? game.def(c.equipment.mainHand.defId).name : 'unarmed';
    const form = c.form && BEAST_FORMS[c.form] ? `in the shape of a ${BEAST_FORMS[c.form].name.toLowerCase()}, ` : '';
    const status = form + (c.dead ? 'DEAD' : c.hp <= 0 ? 'unconscious' : c.conditions.join(', ') || 'fine');
    const who = `${SPECIES[c.speciesId]?.name ?? ''} ${c.subclass ?? ''} ${c.className}`.replace(/\s+/g, ' ').trim();
    const bag = c.bag.filter((b) => !!b).map((b) => `${game.def(b.defId).name}${b.qty > 1 ? ` ×${b.qty}` : ''}`).join(', ');
    const line = `- ${c.name} [${c.id}] level ${c.level} ${who} (${BACKGROUNDS[c.backgroundId]?.name ?? 'no'} background), HP ${c.hp}/${c.maxHp}, AC ${c.ac}, wielding ${weapon}, skilled in ${c.skills.map((s) => (c.expertise.includes(s) ? `${s} (expertise)` : s)).join(', ')}, ${status}. Gender: ${genderNote(c, game.lang)}.${playedBy(game, c)} Backpack: ${bag || 'empty'}`;
    // Story traits are not enforced by the rules engine, so the DM has to honour them.
    const traits = [
      ...(SPECIES[c.speciesId]?.effects ?? []).filter((e) => e.by === 'story').map((e) => `${e.name}: ${e.text.en}`),
      ...(CLASS_FEATURES[c.classId] ?? []).filter((f) => f.by === 'story' && f.text.en && hasFeature(c, f.id)).map((f) => `${f.name}: ${f.text.en}`),
      ...(c.options ?? []).map((o) => OPTIONS[o]).filter((o) => o?.by === 'story').map((o) => `${o.name}: ${o.text.en}`),
    ];
    // Spells the engine does not run: when one is cast, the DM tells what it does.
    const story = c.abilityIds.filter((id) => ABILITIES[id]?.kind === 'story').map((id) => ABILITIES[id].name);
    const magic = c.maxMana > 0 ? `  Mana ${c.mana}/${c.maxMana}.${c.conc ? ` Concentrating on ${ABILITIES[c.conc.spell]?.name ?? c.conc.spell}.` : ''}${story.length ? ` Knows these spells you narrate when cast: ${story.join(', ')}.` : ''}` : '';
    // Magic items: the engine runs their bonuses and spells; the DM plays out the rest of their rules.
    const worn = SLOT_IDS.flatMap((s) => (c.equipment[s] ? [game.def(c.equipment[s]!.defId)] : []));
    const carried = [...worn, ...c.bag.filter((b) => !!b).map((b) => game.def(b!.defId))].filter((d, i, all) => d.srd && all.indexOf(d) === i);
    const items = carried.map((d) => `${d.name}${worn.includes(d) ? ' (worn)' : ''}: ${itemRulesText(d.srd!)}`);
    return [
      line,
      ...(magic ? [magic] : []),
      ...(items.length ? [`  Magic items (the server runs bonuses, resistances and the spells of wands and staffs; you play out the rest): ${items.join(' | ')}`] : []),
      ...(traits.length ? [`  Traits to honour in the story: ${traits.join(' ')}`] : []),
      ...(c.appearance ? [`  Appearance: ${c.appearance}`] : []),
      ...(c.backstory ? [`  Backstory: ${c.backstory}`] : []),
    ].join('\n');
  });
}

/** How someone feels about the party: what they felt to begin with, and what their faction's opinion makes of it. */
function feels(game: Game, n: Parameters<typeof attitude>[1]): string {
  const now = attitude(game, n);
  const f = factionOfNpc(game, n);
  return now === n.disposition ? now : `${now} (was ${n.disposition}; ${f?.name ?? 'their people'} think ${tierOf(f?.standing ?? 0)} of the party)`;
}

/** The world outside combat: where the party is, what it knows and what the DM remembers. */
export function describeWorld(game: Game): string {
  const s = game.s, w = game.world, mem = s.memory;
  const lines: string[] = [...languageNote(game), ...styleNote(game)];
  const place = game.place();
  const terrain = TERRAIN[trueTerrain(w, w.party)].name;
  const setting = settingOf(game);
  lines.push(`Setting: ${setting.name}. ${setting.premise}`);
  lines.push(`Time: ${formatTime(w.minutes)} (${timeOfDay(w.minutes)}).`);
  const top = w.locations.find((l) => !l.parentId && l.q === w.party.q && l.r === w.party.r);
  if (place) {
    const parent = place.parentId ? game.location(place.parentId) : null;
    lines.push(`Location: ${place.name} [${place.id}], a ${place.kind}${parent ? ` in ${parent.name}` : ''} (${terrain} country). ${place.description}`);
    if (place.stages) {
      const next = place.stages[place.cleared ?? 0];
      lines.push(next
        ? `Dungeon: ${place.cleared ?? 0} of ${place.stages.length} sections cleared. Next: ${next.name}. ${next.description} Call delve when the party pushes in.`
        : `Dungeon: all ${place.stages.length} sections are cleared. It is quiet now.`);
    }
  } else {
    const near = w.locations.filter((l) => l.discovered && !l.parentId).sort((a, b) => hexDistance(a, w.party) - hexDistance(b, w.party))[0];
    lines.push(`Location: wilderness, ${terrain}${near ? `, ${hexDistance(near, w.party) * HEX_MILES} miles ${direction(near, w.party)} of ${near.name}` : ''}.${top ? ` ${top.name} is right here.` : ''}`);
  }
  const here = game.placesHere().filter((l) => l.id !== place?.id);
  if (here.length) lines.push(`Other known places right here (move_to_place): ${here.map((l) => `${l.name} [${l.id}] (${l.kind})`).join('; ')}.`);
  const elsewhere = w.locations.filter((l) => l.discovered && !l.parentId && hexDistance(l, w.party) > 0);
  if (elsewhere.length) {
    lines.push('Known places elsewhere on the map:');
    for (const l of elsewhere) lines.push(`- ${l.name} [${l.id}] (${l.kind}), ${hexDistance(l, w.party) * HEX_MILES} miles ${direction(w.party, l)}${l.visited ? ', visited' : ', not yet visited'}. ${l.description}`);
  }
  lines.push(`Party (${s.gold} gp between them):`, ...partyLines(game));
  const budget = fightBudget(game);
  if (budget) lines.push(budget);
  const held = game.heldStoryItems();
  if (held.length) {
    lines.push('Story items the party carries (your own creations; refer to them by these exact names):');
    for (const h of held) {
      const st = h.def.story!;
      lines.push(`- ${h.def.name}${h.qty > 1 ? ` ×${h.qty}` : ''} [${h.def.id}], ${st.category}${st.quest ? ', quest item' : ''}, carried by ${h.holder.name}. ${h.def.description}${st.notes.length ? ` Notes: ${st.notes.map((n) => n.text).join(' / ')}` : ''}`);
    }
  }
  const shops = game.shopsHere();
  if (shops.length) {
    lines.push('Shops here (open_shop shows the players the trade window; prices already include today\'s haggling):');
    for (const sh of shops) {
      const v = game.shopView(sh);
      const wares = v.stock.slice(0, 16).map((e) => { const d = game.def(e.defId); return `${d.name}${e.qty > 1 ? ` ×${e.qty}` : ''} ${buyPrice(d, game.priced(sh))} gp`; }).join(', ');
      lines.push(`- ${sh.name} [${sh.id}], ${sh.kind}, ${v.merchant ? `kept by ${v.merchant}` : 'keeper not named yet'}, ${v.purse} gp to buy with. For sale: ${wares || 'nothing left'}${v.stock.length > 16 ? ', and more' : ''}.`);
    }
  }
  const present = game.presentNpcs();
  if (present.length) {
    lines.push('People here:');
    for (const n of present) lines.push(`- ${n.name} [${n.id}], ${n.role || 'no known role'}, ${feels(game, n)}. ${n.description}${n.notes.length ? ` Notes: ${n.notes.join(' / ')}` : ''}`);
  }
  const others = mem.npcs.filter((n) => n.met && !present.includes(n));
  if (others.length) {
    lines.push('Other people the party has met:');
    for (const n of others) lines.push(`- ${n.name} (${n.role || 'no known role'}, ${feels(game, n)}), last seen at ${game.location(n.locationId ?? '')?.name ?? 'an unknown place'}.${n.notes.length ? ` Notes: ${n.notes.slice(-3).join(' / ')}` : ''}`);
  }
  if (mem.quests.length) {
    lines.push('Quests:');
    for (const q of mem.quests) lines.push(`- [${q.status}] ${q.title}: ${q.summary}${q.notes.length ? ` Notes: ${q.notes.slice(-4).join(' / ')}` : ''}`);
  }
  if (s.factions.length) {
    lines.push('Standing with the factions of the region (from -100 to 100; only change_standing moves it, and the attitudes listed for people already count it):');
    for (const f of s.factions) lines.push(`- ${f.name} [${f.id}]: ${f.standing > 0 ? '+' : ''}${f.standing}, ${tierOf(f.standing)}. ${f.blurb}${f.history.length ? ` Lately: ${f.history.slice(-3).map((h) => `${h.delta > 0 ? '+' : ''}${h.delta} ${h.why}`).join('; ')}.` : ''}`);
  }
  const talk = rumoursHere(game);
  if (talk.length) {
    lines.push('Rumours going round here (people may bring them up in conversation; when the party hears one, call rumour with action "heard" and its id):');
    for (const r of talk) lines.push(`- [${r.id}] ${r.text}${r.aboutParty ? ' (about the party)' : ''}${r.heard !== null ? ' (the party has heard it)' : ''}`);
  }
  if (mem.deeds.length) lines.push('Deeds the party is known for:', ...mem.deeds.slice(-12).map((d) => `- Day ${d.day}: ${d.text}`));
  if (mem.chronicle) lines.push(`The story so far: ${mem.chronicle}`);
  if (mem.journal.length) lines.push('Your recent journal:', ...mem.journal.slice(-30).map((j) => `- Day ${j.day}: ${j.text}`));
  return lines.join('\n');
}

/** A monster's look in a few words, so narration matches the token. */
export function describeLook(l: MonsterLook): string {
  const parts = [`${l.size} ${l.color} ${l.body}`];
  if (l.heads > 1) parts.push(`${l.heads} heads`);
  if (l.arms > 2) parts.push(`${l.arms} arms`);
  if (l.horns) parts.push('horns');
  if (l.wings) parts.push(`${l.wings} wings`);
  if (l.tail) parts.push('tail');
  if (l.eyes) parts.push(`glowing ${l.eyes} eyes`);
  if (l.armor) parts.push(`${l.armor} armour`);
  if (l.weapon) parts.push(l.weapon);
  if (l.aura) parts.push(`${l.aura} aura`);
  if (l.mutation) parts.push(l.mutation);
  return parts.join(', ');
}

/** The battle in progress, for narrating and playing monsters. */
export function describeCombat(game: Game): string {
  const s = game.s;
  const lines: string[] = [...languageNote(game), ...styleNote(game)];
  const place = game.place();
  lines.push(`Combat, round ${s.combat?.round ?? 1}, ${place ? `at ${place.name}` : `in the wilderness (${TERRAIN[trueTerrain(game.world, game.world.party)].name})`}. Positions are tiles on the battle map; one tile is 5 feet.`);
  lines.push(`The battle map shows: ${s.biome ?? 'dungeon'}. Mud, undergrowth, rubble and shallow water are difficult terrain (double movement); trees, boulders and furniture give half cover (+2 AC) against shots. The server applies both; use them to colour the narration.`);
  const ambient = s.ambient ?? 'bright';
  if (ambient !== 'bright') {
    const fixed = (s.lights ?? []).map((l) => `${l.kind} at (${l.x},${l.y})`).join(', ');
    lines.push(`Light: the battlefield is ${ambient === 'dark' ? 'dark' : 'in dim light'}${fixed ? `, lit by ${fixed}` : ''}. The server applies the rules: a creature cannot see into darkness without darkvision or blindsight; attacking a creature you cannot see has disadvantage, and attacking one that cannot see you has advantage. Light and shadow are good material for the narration.`);
  }
  lines.push('Leaving the reach of an enemy that can see you provokes its opportunity attack, which the server rolls. A monster can avoid that with the "disengage" tactic, at the cost of its attack.');
  lines.push('In monster_action, "attack" may name any action listed for the monster, or "Multiattack". Leave it empty and the server picks sensibly: a breath weapon as soon as it has recharged, Multiattack when the creature has one. Conditions on heroes (prone, grappled, poisoned, frightened, paralyzed and so on) are applied and lifted by the server and shown after each hero below.');
  lines.push('Party:');
  for (const c of s.characters) {
    const weapon = c.equipment.mainHand?.defId ?? 'unarmed';
    const status = c.dead ? 'DEAD' : c.hp <= 0 ? 'unconscious' : c.conditions.join(', ') || 'fine';
    const dv = game.heroSenses(c).darkvision;
    const sight = ambient === 'bright' ? '' : ` ${dv ? `Darkvision ${dv} ft.` : 'No darkvision.'}${c.light ? ` Holds a lit ${c.light}.` : ''}`;
    lines.push(`- ${c.name} [${c.id}] ${c.className}, HP ${c.hp}/${c.maxHp}, AC ${c.ac}, at (${c.x},${c.y}), wielding ${weapon}, ${status}.${sight} Gender: ${genderNote(c, game.lang)}`);
  }
  const foes = s.monsters.filter((m) => m.alive);
  if (foes.length) {
    lines.push('Enemies:');
    for (const m of foes) {
      const def = MONSTERS[m.defId];
      const attacks = actionList(def, m.spent ?? [], m.used ?? {}) || 'none';
      const tiles = game.tilesOf(m);
      const where = tiles > 1 ? `filling ${tiles}x${tiles} tiles from (${m.x},${m.y})` : `at (${m.x},${m.y})`;
      const senses = game.monsterSenses(m);
      const sees = [senses.darkvision ? `darkvision ${senses.darkvision} ft` : '', senses.blindsight ? `blindsight ${senses.blindsight} ft` : ''].filter(Boolean).join(', ');
      let sight = '';
      if (ambient !== 'bright') {
        const unseen = s.characters.filter((c) => game.conscious(c) && !game.monsterSees(m, c)).map((c) => c.name);
        const hidden = s.characters.filter((c) => game.conscious(c) && !game.heroSees(c, m)).map((c) => c.name);
        sight = ` Senses: ${sees || 'normal sight'}.${m.light ? ` Carries a ${m.light}.` : ''} Standing in ${game.lightAt(game.monsterPoint(m))} light.${unseen.length ? ` Cannot see: ${unseen.join(', ')}.` : ''}${hidden.length ? ` Unseen by: ${hidden.join(', ')}.` : ''}`;
      }
      const legendary = def.legendary ? ` Legendary actions left this round: ${m.legLeft ?? def.legendary.uses}/${def.legendary.uses}.` : '';
      lines.push(`- ${m.name} [${m.id}] (${def.name}, CR ${def.cr}) HP ${m.hp}/${m.maxHp}, AC ${def.ac}, speed ${def.speed} ft, ${where}. Actions: ${attacks}.${legendary}${sight} ${m.description ?? def.description}${m.look ? ` Looks: ${describeLook(m.look)}.` : ''}`);
    }
    const kinds = [...new Set(foes.map((m) => m.defId))].map((id) => MONSTERS[id]).map((d) => ({ d, notes: statNotes(d) })).filter((x) => x.notes);
    if (kinds.length) {
      lines.push('Stat block notes:');
      for (const k of kinds) lines.push(`- ${k.d.name}: ${k.notes}`);
    }
  }
  const fallen = s.monsters.filter((m) => !m.alive).map((m) => m.name);
  if (fallen.length) lines.push(`Slain so far: ${fallen.join(', ')}.`);
  if (s.combat) lines.push(`Initiative order: ${s.combat.order.map((o) => game.nameOf(o.id)).join(' > ')}.`);
  return lines.join('\n');
}

/** The last stretch of play as the table saw it: narration, what players said, and what the server resolved. */
export function transcript(game: Game, max = 28): string {
  const recent = game.s.log.slice(-max);
  if (!recent.length) return '(nothing yet)';
  return recent
    .map((l) => {
      if (l.kind === 'dm') return `DM${l.scene ? ` [${l.scene.title}]` : ''}: ${l.text}`;
      if (l.kind === 'chat') return `${l.speaker ?? 'Player'} (player): ${l.text}`;
      return `(${l.text})`;
    })
    .join('\n');
}

export function describeBeats(beats: Beat[], game?: Game): string {
  return beats
    .map((b) => {
      switch (b.kind) {
        case 'start': return `The adventure begins. Open the story. ${game ? settingOf(game).opening : 'The heroes have just arrived at this place.'} Set the scene, hint at what is going on in the region, and leave the players free to choose what to do first.`;
        case 'arrive': return `The party ${b.journey ? `arrives after ${b.journey}` : 'steps inside'}: ${b.location}${b.firstVisit ? ', for the first time. Establish the place and who is there' : '. They have been here before, so keep it brief and note anything that has changed'}.`;
        case 'travel_end': return b.reason === 'blocked' ? `After ${b.journey} the party can find no way onward and stops.` : `The party stops in the wilderness after ${b.journey}. Describe where they are in a sentence or two.`;
        case 'discover': return `After ${b.journey}, the party sights something new and halts: ${b.locations.join('; ')}. Describe what they can see from here.`;
        case 'combat_start': return `A fight begins against ${b.monsters.join(', ')}. ${b.context} Describe the moment it breaks out; the players will fight it on the battle map.`;
        case 'combat_end': return `The fight is won${b.boss ? ', and a dangerous foe lies dead' : ''}. Rewards: ${b.rewards}. Give the moment a breath and describe the aftermath.`;
        case 'level_up': return `${b.heroes.join(' and ')} ${b.heroes.length > 1 ? 'have' : 'has'} grown in power and gained a level. Mark it with a line about how they have changed.`;
        case 'rest': return 'The party has finished a long rest and wakes restored. Describe the morning briefly.';
        case 'rescued': return 'The whole party was struck down. The survivors were carried to safety and wake battered the next morning, lighter of purse. Describe the waking, and who helped them.';
        case 'defeat': return 'Every hero has died. Narrate the end with some dignity.';
        case 'spell': return `${b.hero} casts ${b.spell}${b.level > (ABILITIES[b.spellId]?.spellLevel ?? b.level) ? ` at level ${b.level}` : ''}${b.target ? ` on ${b.target}` : ''}. The game spent the mana but leaves the effect to you. SRD rules: ${spellRulesText(b.spellId)} Tell what happens in a few lines, true to these rules, and use your tools if it changes the world (an NPC's mood, a found item, a skill check).`;
      }
    })
    .join('\n');
}

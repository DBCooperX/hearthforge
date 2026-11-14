// Builds the text the Dungeon Master sees: a stable system prompt, and a compact,
// factual snapshot of the world, the party and everything the DM should remember.
import { ITEMS } from '../../../shared/content';
import { classLabel, type Lang } from '../../../shared/i18n';
import type { Character } from '../../../shared/types';
import { HEX_MILES, TERRAIN, direction, formatTime, hexDistance, timeOfDay } from '../../../shared/hex';
import { MONSTERS } from '../data/monsters';
import { SETTING_NAME, SETTING_PREMISE } from '../data/world';
import type { Beat, Game } from '../game/engine';
import { trueTerrain } from '../game/world';

export const DM_SYSTEM_PROMPT = `You are the Dungeon Master of Hearthforge, a self-hosted Dungeons & Dragons 5th edition game played in a web browser by one or more players who share a party of heroes.

How the table works
Hearthforge is an open-world, narrative-first game. Most of play is your narration, shown as short scene cards, and the players answering with whatever they want to do: they click one of the actions you suggest or type anything at all. Beside the story they see a hex map of the region, which they travel by clicking, and a panel showing where they are and who is present. A tactical grid appears only when a fight starts.

The game server owns the rules and the state. It rolls every die and tracks hit points, gold, inventory, experience, time, the map and your memory of the world, and it tells you exactly what happened. Your tools are how you change that state. If you narrate something that changes the world without the matching tool call (gold changing hands, an item gained, a fight starting, a new place or person), it did not happen as far as the game is concerned, and the players will see a mismatch between your words and their screen.

Running the game
- Give the players real freedom. They can go anywhere and try anything. Follow their lead, let the world react believably, and let their choices have consequences that last. The goblin trouble is one thread among many, so do not steer them toward it.
- When an attempt could plausibly fail and failing would matter, call skill_check and narrate from the result. Do not ask for checks on things that would simply work. Typical DCs: 10 easy, 13 moderate, 16 hard, 19 very hard.
- When a fight breaks out, call start_combat with monsters from the catalogue that are a fair challenge for the party, then describe its opening moment. When the party pushes into the next section of a dungeon they are standing in, call delve instead and the server sets up that section's fight.
- Crossing the map is the players' job: they pick a hex and the server moves them, tracks time and rolls for encounters. Use move_to_place only for known places in the party's current hex, such as walking into a tavern in town.
- Rewards are yours to give, in moderation. Use award_xp for clever or brave achievements outside combat (25 to 100 is typical), change_gold for purchases, sales, payments and found coin (item values are in the catalogue), and give_item for items from the catalogue. Combat experience and loot are handled by the server.
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

Setting: ${SETTING_NAME}
${SETTING_PREMISE}

Monster catalogue (use the id in start_combat)
${Object.values(MONSTERS).map((m) => `- ${m.id}: ${m.name}, AC ${m.ac}, ${m.hp} HP, ${m.xp} XP. ${m.description}`).join('\n')}

Item catalogue (use the id in give_item)
${Object.values(ITEMS).map((i) => `- ${i.id}: ${i.name}, ${i.value} gp. ${i.description}`).join('\n')}`;

/** Tells the DM which language the table plays in. English needs no note. */
export function languageNote(game: Game): string[] {
  if (game.lang !== 'de') return [];
  return [
    'LANGUAGE: This table plays in German. Write everything the players read in natural, idiomatic German, addressing the party as "ihr": scene titles, narration, suggested actions, dialogue, and the names, roles and descriptions of any place, person, quest or story item you create, as well as quest notes, item notes, deeds and journal lines.',
    'Use the established German D&D 5e terms: Rettungswurf, Rüstungsklasse (RK), Trefferpunkte (TP), Schwierigkeitsgrad (SG), Fertigkeitswurf, Vorteil and Nachteil, Kämpfer, Schurke, Magier, Kleriker, Goblin, Grottenschrat, Skelett. Keep proper names exactly as they appear in the state below.',
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

function partyLines(game: Game): string[] {
  return game.s.characters.map((c) => {
    const weapon = c.equipment.mainHand ? game.def(c.equipment.mainHand.defId).name : 'unarmed';
    const status = c.dead ? 'DEAD' : c.hp <= 0 ? 'unconscious' : c.conditions.join(', ') || 'fine';
    const bag = c.bag.filter((b) => !!b).map((b) => `${game.def(b.defId).name}${b.qty > 1 ? ` ×${b.qty}` : ''}`).join(', ');
    return `- ${c.name} [${c.id}] level ${c.level} ${c.className}, HP ${c.hp}/${c.maxHp}, AC ${c.ac}, wielding ${weapon}, skilled in ${c.skills.join(', ')}, ${status}. Gender: ${genderNote(c, game.lang)}. Backpack: ${bag || 'empty'}`;
  });
}

/** The world outside combat: where the party is, what it knows and what the DM remembers. */
export function describeWorld(game: Game): string {
  const s = game.s, w = game.world, mem = s.memory;
  const lines: string[] = languageNote(game);
  const place = game.place();
  const terrain = TERRAIN[trueTerrain(w, w.party)].name;
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
  const held = game.heldStoryItems();
  if (held.length) {
    lines.push('Story items the party carries (your own creations; refer to them by these exact names):');
    for (const h of held) {
      const st = h.def.story!;
      lines.push(`- ${h.def.name}${h.qty > 1 ? ` ×${h.qty}` : ''} [${h.def.id}], ${st.category}${st.quest ? ', quest item' : ''}, carried by ${h.holder.name}. ${h.def.description}${st.notes.length ? ` Notes: ${st.notes.map((n) => n.text).join(' / ')}` : ''}`);
    }
  }
  const present = game.presentNpcs();
  if (present.length) {
    lines.push('People here:');
    for (const n of present) lines.push(`- ${n.name} [${n.id}], ${n.role || 'no known role'}, ${n.disposition}. ${n.description}${n.notes.length ? ` Notes: ${n.notes.join(' / ')}` : ''}`);
  }
  const others = mem.npcs.filter((n) => n.met && !present.includes(n));
  if (others.length) {
    lines.push('Other people the party has met:');
    for (const n of others) lines.push(`- ${n.name} (${n.role || 'no known role'}, ${n.disposition}), last seen at ${game.location(n.locationId ?? '')?.name ?? 'an unknown place'}.${n.notes.length ? ` Notes: ${n.notes.slice(-3).join(' / ')}` : ''}`);
  }
  if (mem.quests.length) {
    lines.push('Quests:');
    for (const q of mem.quests) lines.push(`- [${q.status}] ${q.title}: ${q.summary}${q.notes.length ? ` Notes: ${q.notes.slice(-4).join(' / ')}` : ''}`);
  }
  if (mem.deeds.length) lines.push('Deeds the party is known for:', ...mem.deeds.slice(-12).map((d) => `- Day ${d.day}: ${d.text}`));
  if (mem.chronicle) lines.push(`The story so far: ${mem.chronicle}`);
  if (mem.journal.length) lines.push('Your recent journal:', ...mem.journal.slice(-30).map((j) => `- Day ${j.day}: ${j.text}`));
  return lines.join('\n');
}

/** The battle in progress, for narrating and playing monsters. */
export function describeCombat(game: Game): string {
  const s = game.s;
  const lines: string[] = languageNote(game);
  const place = game.place();
  lines.push(`Combat, round ${s.combat?.round ?? 1}, ${place ? `at ${place.name}` : `in the wilderness (${TERRAIN[trueTerrain(game.world, game.world.party)].name})`}. Positions are tiles on the battle map; one tile is 5 feet.`);
  lines.push(`The battle map shows: ${s.biome ?? 'dungeon'}. Mud, undergrowth, rubble and shallow water are difficult terrain (double movement); trees, boulders and furniture give half cover (+2 AC) against shots. The server applies both; use them to colour the narration.`);
  lines.push('Party:');
  for (const c of s.characters) {
    const weapon = c.equipment.mainHand?.defId ?? 'unarmed';
    const status = c.dead ? 'DEAD' : c.hp <= 0 ? 'unconscious' : c.conditions.join(', ') || 'fine';
    lines.push(`- ${c.name} [${c.id}] ${c.className}, HP ${c.hp}/${c.maxHp}, AC ${c.ac}, at (${c.x},${c.y}), wielding ${weapon}, ${status}. Gender: ${genderNote(c, game.lang)}`);
  }
  const foes = s.monsters.filter((m) => m.alive);
  if (foes.length) {
    lines.push('Enemies:');
    for (const m of foes) {
      const def = MONSTERS[m.defId];
      const attacks = def.attacks.map((a) => `${a.name} (${a.ranged ? `ranged ${a.range}/${a.longRange} ft` : 'melee'}, ${a.damage} ${a.damageType})`).join('; ');
      lines.push(`- ${m.name} [${m.id}] HP ${m.hp}/${m.maxHp}, AC ${def.ac}, at (${m.x},${m.y}). Attacks: ${attacks}. ${def.description}`);
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

export function describeBeats(beats: Beat[]): string {
  return beats
    .map((b) => {
      switch (b.kind) {
        case 'start': return 'The adventure begins. Open the story: the heroes have just arrived at this place. Set the scene, hint at what is going on in the region, and leave them free to choose what to do first.';
        case 'arrive': return `The party ${b.journey ? `arrives after ${b.journey}` : 'steps inside'}: ${b.location}${b.firstVisit ? ', for the first time. Establish the place and who is there' : '. They have been here before, so keep it brief and note anything that has changed'}.`;
        case 'travel_end': return b.reason === 'blocked' ? `After ${b.journey} the party can find no way onward and stops.` : `The party stops in the wilderness after ${b.journey}. Describe where they are in a sentence or two.`;
        case 'discover': return `After ${b.journey}, the party sights something new and halts: ${b.locations.join('; ')}. Describe what they can see from here.`;
        case 'combat_start': return `A fight begins against ${b.monsters.join(', ')}. ${b.context} Describe the moment it breaks out; the players will fight it on the battle map.`;
        case 'combat_end': return `The fight is won${b.boss ? ', and a dangerous foe lies dead' : ''}. Rewards: ${b.rewards}. Give the moment a breath and describe the aftermath.`;
        case 'level_up': return `${b.heroes.join(' and ')} ${b.heroes.length > 1 ? 'have' : 'has'} grown in power and gained a level. Mark it with a line about how they have changed.`;
        case 'rest': return 'The party has finished a long rest and wakes restored. Describe the morning briefly.';
        case 'rescued': return 'The whole party was struck down. The survivors were carried to safety and wake battered the next morning, lighter of purse. Describe the waking, and who helped them.';
        case 'defeat': return 'Every hero has died. Narrate the end with some dignity.';
      }
    })
    .join('\n');
}

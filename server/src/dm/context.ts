// Builds the text the Dungeon Master sees: a compact, factual snapshot of the table.
import { AREAS, DUNGEON_PREMISE } from '../data/dungeon';
import { MONSTERS } from '../data/monsters';
import type { Beat, Game } from '../game/engine';

export const DM_SYSTEM_PROMPT = `You are the Dungeon Master of Hearthforge, a self-hosted Dungeons & Dragons 5th edition game played in a web browser on a 2D top-down map. One or more players control a party of level 1 heroes.

How the table works:
- The game server owns all rules and state. It rolls every die, tracks hit points, positions and inventory, and tells you exactly what happened. You never roll dice or decide whether something hits; you bring the results to life.
- You have two jobs: narrate, and play the monsters. When monsters act, you choose what each one does through the monster_action tool, and the server resolves it and returns the outcome.
- Narration is shown in a small log panel beside the map. Write two to four sentences of vivid, concrete prose per beat, in plain text with no markdown, headings or lists. Address the heroes by name. Players already see the dice results in the log, so describe what the numbers looked like in the fiction instead of repeating them.
- Stay consistent with the facts you are given. Do not invent loot, new enemies, exits, damage or conditions that the server did not report, because the players would see a mismatch between your words and the map.
- Play monsters as the creatures they are. Goblins are cowardly opportunists who gang up on the wounded and use their bows when cornered. Giant rats swarm. Skeletons are mindless and relentless. The bugbear chief is a brutal bully who goes for whoever hurt him most. A fair, tense fight is more fun than a perfectly optimal one.
- When a player speaks to you out of turn, answer as a DM would at the table: in character for the world, brief, and helpful about what their hero could try. If an attempt has an uncertain outcome, call for an ability check with the skill_check tool and narrate from its result. Actions the game has buttons for (moving, attacking, casting, looting chests, resting) happen through the game interface, so point players to it for those.

Setting: ${DUNGEON_PREMISE}

Known areas of the dungeon:
${AREAS.map((a) => `- ${a.name}: ${a.description}`).join('\n')}`;

export function describeState(game: Game): string {
  const s = game.s;
  const lines: string[] = [];
  const leader = game.consciousChars()[0] ?? s.characters[0];
  const area = leader && AREAS.find((a) => leader.x >= a.x0 && leader.x <= a.x1 && leader.y >= a.y0 && leader.y <= a.y1);
  lines.push(`Phase: ${s.phase}${s.combat ? `, round ${s.combat.round}` : ''}. Location: ${area?.name ?? 'a doorway between chambers'}.`);
  lines.push('Party:');
  for (const c of s.characters) {
    const weapon = c.equipment.mainHand?.defId ?? 'unarmed';
    const status = c.dead ? 'DEAD' : c.hp <= 0 ? 'unconscious' : c.conditions.join(', ') || 'fine';
    lines.push(`- ${c.name} [${c.id}] ${c.className}, HP ${c.hp}/${c.maxHp}, AC ${c.ac}, at (${c.x},${c.y}), wielding ${weapon}, ${status}`);
  }
  const foes = s.monsters.filter((m) => m.revealed && m.alive);
  if (foes.length) {
    lines.push('Enemies in sight:');
    for (const m of foes) {
      const def = MONSTERS[m.defId];
      const attacks = def.attacks.map((a) => `${a.name} (${a.ranged ? `ranged ${a.range}/${a.longRange} ft` : 'melee'}, ${a.damage} ${a.damageType})`).join('; ');
      lines.push(`- ${m.name} [${m.id}] HP ${m.hp}/${m.maxHp}, AC ${def.ac}, at (${m.x},${m.y}). Attacks: ${attacks}. ${def.description}`);
    }
  }
  const fallen = s.monsters.filter((m) => m.revealed && !m.alive).map((m) => m.name);
  if (fallen.length) lines.push(`Slain so far: ${fallen.join(', ')}.`);
  if (s.combat) lines.push(`Initiative order: ${s.combat.order.map((o) => game.nameOf(o.id)).join(' > ')}.`);
  return lines.join('\n');
}

/** Mechanical log lines since the DM last spoke, so narration can weave them in. */
export function recentEvents(game: Game, max = 14): string {
  const log = game.s.log;
  let i = log.length - 1;
  while (i >= 0 && log[i].kind !== 'dm') i--;
  const since = log.slice(i + 1).filter((l) => l.kind !== 'chat').slice(-max);
  return since.length ? since.map((l) => `- ${l.text}`).join('\n') : '- (nothing new)';
}

export function lastNarration(game: Game, count = 3): string {
  const dm = game.s.log.filter((l) => l.kind === 'dm').slice(-count);
  return dm.length ? dm.map((l) => l.text).join('\n\n') : '(none yet)';
}

export function describeBeats(beats: Beat[]): string {
  return beats
    .map((b) => {
      switch (b.kind) {
        case 'start': return 'The adventure begins. Set the scene: the heroes have just climbed down into the Cellar Landing.';
        case 'area': return `The party enters a new area, ${b.area.name}: ${b.area.description}`;
        case 'combat_start': return `Enemies are spotted and combat begins: ${b.monsters.join(', ')}.`;
        case 'combat_end': return 'The last enemy in this fight has fallen. Give the moment a breath.';
        case 'victory': return 'The bugbear chief is dead and the warren is cleared. Narrate the victory and close the chapter.';
        case 'defeat': return 'Every hero has fallen. Narrate the defeat with some dignity.';
      }
    })
    .join('\n');
}

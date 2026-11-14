// Fallback Dungeon Master used when no API key is configured (or the API is unreachable).
// Monsters use the engine's built-in tactics and narration comes from short templates.
// It cannot improvise, so free-form actions only get a description of the surroundings.
import { TERRAIN } from '../../../shared/hex';
import type { Mood } from '../../../shared/types';
import { SETTING_NAME } from '../data/world';
import type { Beat, Game, Monster } from '../game/engine';
import { trueTerrain } from '../game/world';
import type { DungeonMaster, Scene } from './types';

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function whereTitle(game: Game): string {
  const place = game.s.world ? game.place() : null;
  if (place) return place.name;
  return game.s.world ? `The wilds: ${TERRAIN[trueTerrain(game.world, game.world.party)].name}` : 'Hearthforge';
}

/** Actions that make sense wherever the party is, for when the AI is not suggesting any. */
export function defaultActions(game: Game): string[] {
  if (!game.s.world || game.s.phase !== 'explore') return [];
  const out = game.presentNpcs().slice(0, 2).map((n) => `Talk to ${n.name}`);
  out.push('Look around');
  const place = game.place();
  if (place?.stages && (place.cleared ?? 0) < place.stages.length) out.push('Scout the way ahead');
  if (!place) out.push('Search the area');
  return out;
}

function surroundings(game: Game): string {
  const place = game.place();
  if (!place) return `You stand in open ${TERRAIN[trueTerrain(game.world, game.world.party)].name}. The map shows where you might go next.`;
  const people = game.presentNpcs();
  const who = people.length ? ` Here you find ${people.map((n) => `${n.name}, ${n.role}`).join('; ')}.` : '';
  const next = place.stages?.[place.cleared ?? 0];
  const deeper = place.stages ? (next ? ` Ahead lies ${next.name}.` : ' Nothing stirs here any more.') : '';
  return `${place.description}${who}${deeper}`;
}

export function scriptedScene(game: Game, beats: Beat[]): Scene | null {
  const out: string[] = [];
  let mood: Mood = 'calm';
  let title = whereTitle(game);
  for (const b of beats) {
    switch (b.kind) {
      case 'start':
        out.push(`Your road ends, for now, in ${SETTING_NAME}. ${surroundings(game)}`);
        mood = 'warm';
        break;
      case 'arrive':
        out.push(`${b.journey ? `After ${b.journey}, you reach ${b.location}. ` : ''}${surroundings(game)}`);
        break;
      case 'travel_end':
        out.push(b.reason === 'blocked' ? 'The way forward is barred. You will have to find another route.' : `You halt after ${b.journey}. ${surroundings(game)}`);
        break;
      case 'discover':
        out.push(`You stop short. In the distance you make out ${b.locations.join(' and ')}.`);
        mood = 'wonder';
        break;
      case 'combat_start':
        out.push(pick([
          `Shapes close in: ${b.monsters.join(', ')}. Steel leaves its scabbard.`,
          `You are not alone. ${b.monsters.join(', ')} turn toward you with a snarl.`,
        ]));
        mood = 'danger';
        title = b.boss ? 'A deadly foe' : 'To arms!';
        break;
      case 'combat_end':
        out.push(`${pick(['The last foe drops and silence settles.', 'It is over. Only your own breathing breaks the quiet.'])} You come away with ${b.rewards}.`);
        mood = 'triumph';
        break;
      case 'level_up':
        out.push(`${b.heroes.join(' and ')} ${b.heroes.length > 1 ? 'feel' : 'feels'} stronger for all that has happened.`);
        mood = 'triumph';
        break;
      case 'rest':
        out.push('You wake rested, your wounds closed and your mind clear.');
        break;
      case 'rescued':
        out.push('You wake on a pallet, bandaged and aching. Someone dragged you out of the fight, and helped themselves to part of your purse for the trouble.');
        mood = 'somber';
        break;
      case 'defeat':
        out.push(`Darkness closes in. ${SETTING_NAME[0].toUpperCase()}${SETTING_NAME.slice(1)} has claimed another band of would-be heroes.`);
        mood = 'somber';
        title = 'The end';
        break;
    }
  }
  return out.length ? { title, mood, text: out.join(' '), actions: defaultActions(game) } : null;
}

export class ScriptedDM implements DungeonMaster {
  readonly mode = 'scripted' as const;
  readonly model = null;

  async narrate(game: Game, beats: Beat[]) {
    return scriptedScene(game, beats);
  }

  async runMonsters(game: Game, block: Monster[], onAction: () => Promise<void>) {
    for (const m of block) {
      if (game.s.phase !== 'combat') break;
      game.monsterAct(m.id);
      await onAction();
    }
    return null;
  }

  async respond(game: Game, _playerName: string, text: string): Promise<Scene | null> {
    if (game.s.phase !== 'explore') return null;
    const npc = game.presentNpcs().find((n) => text.toLowerCase().includes(n.name.toLowerCase()));
    const body = npc ? `${npc.name}, ${npc.role}. ${npc.description}` : surroundings(game);
    return {
      title: whereTitle(game),
      mood: 'calm',
      text: `${body}\n\nThe Dungeon Master is running on scripts, so it can describe the world but not improvise. Set ANTHROPIC_API_KEY on the server to bring the AI Dungeon Master to the table. Travel, fights, rests and dungeons all work without it.`,
      actions: defaultActions(game),
    };
  }

  async maintain() {}
}

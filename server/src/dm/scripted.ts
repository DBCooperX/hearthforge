// Fallback Dungeon Master used when no API key is configured (or the API is unreachable).
// Monsters use the engine's built-in tactics and narration comes from short templates.
// It cannot improvise, so free-form actions only get a description of the surroundings.
import { TERRAIN } from '../../../shared/hex';
import { tagged, tr } from '../../../shared/i18n';
import type { Mood } from '../../../shared/types';
import type { Beat, Game, Monster, MonsterIntent } from '../game/engine';
import { MONSTERS } from '../data/monsters';
import { trueTerrain } from '../game/world';
import { settingOf } from './context';
import type { DungeonMaster, MonsterActor, PlayerLine, Scene } from './types';

/**
 * Scripted monsters press the attack. The one exception: a hurt creature with Nimble Escape
 * and a bow slips out of reach without provoking and shoots instead.
 */
export function scriptedIntent(game: Game, m: Monster): MonsterIntent {
  const def = MONSTERS[m.defId];
  const cornered = game.consciousChars().some((c) => Math.max(Math.abs(c.x - m.x), Math.abs(c.y - m.y)) <= 1);
  if (def?.nimbleEscape && def.attacks.some((a) => a.ranged) && m.hp <= m.maxHp / 2 && cornered) return { tactic: 'disengage' };
  return {};
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function whereTitle(game: Game): string {
  const place = game.s.world ? game.place() : null;
  if (place) return place.name;
  return game.s.world ? tagged(game.lang)`The wilds: ${tr(game.lang, TERRAIN[trueTerrain(game.world, game.world.party)].name)}` : 'Hearthforge';
}

/** Actions that make sense wherever the party is, for when the AI is not suggesting any. */
export function defaultActions(game: Game): string[] {
  if (!game.s.world || game.s.phase !== 'explore') return [];
  const t = tagged(game.lang);
  const out = game.presentNpcs().slice(0, 2).map((n) => t`Talk to ${n.name}`);
  out.push(t`Look around`);
  const place = game.place();
  if (place?.stages && (place.cleared ?? 0) < place.stages.length) out.push(t`Scout the way ahead`);
  if (!place) out.push(t`Search the area`);
  return out;
}

function surroundings(game: Game): string {
  const t = tagged(game.lang);
  const place = game.place();
  if (!place) return t`You stand in open country: ${tr(game.lang, TERRAIN[trueTerrain(game.world, game.world.party)].name)}. The map shows where you might go next.`;
  const people = game.presentNpcs();
  const who = people.length ? ` ${t`Here you find ${people.map((n) => `${n.name}, ${n.role}`).join('; ')}.`}` : '';
  const next = place.stages?.[place.cleared ?? 0];
  const deeper = place.stages ? ` ${next ? t`Ahead lies: ${next.name}.` : t`Nothing stirs here any more.`}` : '';
  return `${place.description}${who}${deeper}`;
}

export function scriptedScene(game: Game, beats: Beat[]): Scene | null {
  const t = tagged(game.lang);
  const out: string[] = [];
  let mood: Mood = 'calm';
  let title = whereTitle(game);
  for (const b of beats) {
    switch (b.kind) {
      case 'start':
        out.push(`${settingOf(game).intro} ${surroundings(game)}`);
        mood = 'warm';
        break;
      case 'arrive':
        out.push(`${b.journey ? `${t`After ${b.journey}, you reach ${b.location}.`} ` : ''}${surroundings(game)}`);
        break;
      case 'travel_end':
        out.push(b.reason === 'blocked' ? t`The way forward is barred. You will have to find another route.` : t`You halt after ${b.journey}. ${surroundings(game)}`);
        break;
      case 'discover':
        out.push(t`You stop short. In the distance you make out: ${b.locations.join(', ')}.`);
        mood = 'wonder';
        break;
      case 'combat_start':
        out.push(pick([
          t`Shapes close in: ${b.monsters.join(', ')}. Steel leaves its scabbard.`,
          t`You are not alone. Turning toward you with a snarl: ${b.monsters.join(', ')}.`,
        ]));
        mood = 'danger';
        title = b.boss ? t`A deadly foe` : t`To arms!`;
        break;
      case 'combat_end':
        out.push(`${pick([t`The last foe drops and silence settles.`, t`It is over. Only your own breathing breaks the quiet.`])} ${t`You come away with ${b.rewards}.`}`);
        mood = 'triumph';
        break;
      case 'level_up':
        out.push(t`Stronger for all that has happened: ${b.heroes.join(', ')}.`);
        mood = 'triumph';
        break;
      case 'rest':
        out.push(t`You wake rested, your wounds closed and your mind clear.`);
        break;
      case 'rescued':
        out.push(t`You wake on a pallet, bandaged and aching. Someone dragged you out of the fight, and helped themselves to part of your purse for the trouble.`);
        mood = 'somber';
        break;
      case 'spell':
        out.push(t`The magic of ${tr(game.lang, b.spell)} takes hold.`);
        break;
      case 'defeat':
        out.push(t`Darkness closes in. The Vale has claimed another band of would-be heroes.`);
        mood = 'somber';
        title = t`The end`;
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

  async runMonsters(game: Game, block: Monster[], act: MonsterActor) {
    for (const m of block) {
      if (game.s.phase !== 'combat') break;
      await act(m.id, scriptedIntent(game, m));
    }
    return null;
  }

  async respond(game: Game, said: PlayerLine[]): Promise<Scene | null> {
    if (game.s.phase !== 'explore') return null;
    const text = said.map((l) => l.text).join(' ');
    const npc = game.presentNpcs().find((n) => text.toLowerCase().includes(n.name.toLowerCase()));
    const body = npc ? `${npc.name}, ${npc.role}. ${npc.description}` : surroundings(game);
    return {
      title: whereTitle(game),
      mood: 'calm',
      text: `${body}\n\n${tagged(game.lang)`The Dungeon Master is running on scripts, so it can describe the world but not improvise. Set ANTHROPIC_API_KEY on the server to bring the AI Dungeon Master to the table. Travel, fights, rests and dungeons all work without it.`}`,
      actions: defaultActions(game),
    };
  }

  async answerQuestion(game: Game, _asked?: PlayerLine): Promise<string> {
    return tagged(game.lang)`The Dungeon Master is running on scripts, so it cannot answer questions. Set ANTHROPIC_API_KEY on the server to bring the AI Dungeon Master to the table. Your character sheet, inventory and journal show everything the game knows.`;
  }

  async maintain() {}
}

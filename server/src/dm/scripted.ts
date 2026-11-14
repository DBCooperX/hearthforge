// Fallback Dungeon Master used when no API key is configured (or the API is unreachable).
// Monsters use the engine's built-in tactics and narration comes from short templates.
import type { Beat, Game, Monster } from '../game/engine';
import type { DungeonMaster } from './types';

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

export function scriptedNarration(beats: Beat[]): string | null {
  const out: string[] = [];
  for (const b of beats) {
    switch (b.kind) {
      case 'start':
        out.push('You climb down the rope ladder into the cold cellar beneath the old Hearthforge smithy. Somewhere below, goblin voices echo off stone.');
        break;
      case 'area':
        out.push(`${b.area.name}. ${b.area.description}`);
        break;
      case 'combat_start':
        out.push(pick([
          `Shapes move in the gloom: ${b.monsters.join(', ')}. Steel leaves its scabbard.`,
          `You are not alone. ${b.monsters.join(', ')} turn toward you with a snarl.`,
        ]));
        break;
      case 'combat_end':
        out.push(pick(['The last foe drops and silence settles over the room.', 'It is over. Only your own breathing breaks the quiet.']));
        break;
      case 'victory':
        out.push('The bugbear chief crashes to the floor and the warren falls silent. The farms of the valley will sleep easier tonight.');
        break;
      case 'defeat':
        out.push('Darkness closes in. The warren has claimed another band of would-be heroes.');
        break;
    }
  }
  return out.length ? out.join(' ') : null;
}

export class ScriptedDM implements DungeonMaster {
  readonly mode = 'scripted' as const;
  readonly model = null;

  async narrate(_game: Game, beats: Beat[]) {
    return scriptedNarration(beats);
  }

  async runMonsters(game: Game, block: Monster[], onAction: () => Promise<void>) {
    for (const m of block) {
      if (game.s.phase !== 'combat') break;
      game.monsterAct(m.id);
      await onAction();
    }
    return null;
  }

  async chat() {
    return 'The Dungeon Master is running on scripts right now. Set ANTHROPIC_API_KEY on the server to bring the AI Dungeon Master to the table.';
  }
}

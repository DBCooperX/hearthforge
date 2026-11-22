import { describe, expect, it } from 'vitest';
import { speakerOf, type Entity } from './components/Story';

const e = (name: string, kind: Entity['kind']): Entity => ({ name, kind, icon: '', subtitle: '', description: '', facts: [] });
const entities = [e('Griet', 'npc'), e('Hendrick', 'npc'), e('Lexe', 'hero'), e('Emberfall', 'place')];
const pattern = /(?<![\p{L}\p{N}])(Griet|Hendrick|Lexe|Emberfall)(?![\p{L}\p{N}])/gu;

describe('who speaks in a paragraph', () => {
  it('is the first person named before the quotation', () => {
    expect(speakerOf('Griet turns to Hendrick and says: "Wait here."', entities, pattern)?.name).toBe('Griet');
    expect(speakerOf('Griet sagt leise: „Fragt Hendrick.“', entities, pattern)?.name).toBe('Griet');
  });
  it('is the one named after a quotation that opens the paragraph', () => {
    expect(speakerOf('"Wait here," says Hendrick.', entities, pattern)?.name).toBe('Hendrick');
  });
  it('is nobody in plain narration, places, or when a name only comes up inside the words', () => {
    expect(speakerOf('Rain falls on Emberfall and Griet shuts the door.', entities, pattern)).toBeNull();
    expect(speakerOf('The crowd murmurs: "Ask Griet."', entities, pattern)).toBeNull();
  });
});

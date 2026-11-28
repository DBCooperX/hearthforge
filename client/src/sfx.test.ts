import { describe, expect, it } from 'vitest';
import { sfxForRoll, SFX_EVENTS } from '../../shared/sfx';
import type { RollInfo } from '../../shared/types';

const roll = (over: Partial<RollInfo>): RollInfo => ({ actor: 'A', label: 'Longsword', die: 12, rolls: [12], mode: 'normal', modifier: 3, total: 15, target: { kind: 'AC', value: 12 }, outcome: 'hit', damage: { amount: 6, type: 'slashing' }, ...over });

describe('sound effects', () => {
  it('maps weapon and spell rolls to sounds', () => {
    expect(sfxForRoll(roll({}))).toEqual(['hit_slash']);
    expect(sfxForRoll(roll({ damage: { amount: 4, type: 'bludgeoning' } }))).toEqual(['hit_blunt']);
    expect(sfxForRoll(roll({ label: 'Langbogen', damage: { amount: 4, type: 'piercing' } }))).toEqual(['shot_hit']);
    expect(sfxForRoll(roll({ label: 'Longbow', outcome: 'miss', damage: undefined }))).toEqual(['shot']);
    expect(sfxForRoll(roll({ label: 'Fire Bolt', damage: { amount: 8, type: 'fire' } }))).toEqual(['spell_fire']);
    expect(sfxForRoll(roll({ outcome: 'crit' }))).toEqual(['hit_crit']);
    expect(sfxForRoll(roll({ outcome: 'miss', damage: undefined }))).toEqual(['miss']);
  });
  it('keeps saves and checks silent', () => {
    expect(sfxForRoll(roll({ target: { kind: 'DC', value: 13 }, outcome: 'failure' }))).toEqual([]);
  });
  it('has a built-in sound for every event', async () => {
    const calls: string[] = [];
    const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 };
    const node: Record<string, unknown> = { connect: (n: unknown) => n, start() {}, stop() {}, gain: param, frequency: param, Q: param };
    const ctx = { currentTime: 0, sampleRate: 8000, createGain: () => node, createOscillator: () => node, createBiquadFilter: () => node, createBuffer: () => ({ getChannelData: () => new Float32Array(8) }), createBufferSource: () => node };
    const { synth } = await import('./sfxSynth');
    for (const e of SFX_EVENTS) { expect(() => synth(ctx as never, node as never, e)).not.toThrow(); calls.push(e); }
    expect(calls).toHaveLength(SFX_EVENTS.length);
  });
});

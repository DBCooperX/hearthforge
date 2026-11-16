import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Narrator, cleanChoice, type PiperRun } from '../src/voice';
import { DEFAULT_VOICE, PIPER_VOICES, piperCard, piperPath, speakable, speechParts } from '../../shared/voice';
import { SETTINGS } from '../../shared/admin';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'voice-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A stand-in for the Piper program: it only has to exist. */
function fakeBin(dir: string) {
  const bin = join(dir, 'piper-bin');
  writeFileSync(bin, '#!/bin/sh\nexit 0\n');
  chmodSync(bin, 0o755);
  return bin;
}

/** Writes a pretend WAV and remembers what it was asked to say. */
function fakePiper(said: string[]): PiperRun {
  return async (_bin, args, text) => {
    said.push(text);
    writeFileSync(args[args.indexOf('--output_file') + 1], Buffer.alloc(400, 1));
  };
}

const okFetch = (log: { url: string; init?: RequestInit }[], body = new Uint8Array(500).fill(2)) =>
  (async (url: string | URL, init?: RequestInit) => {
    log.push({ url: String(url), init });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;

describe('narrator text', () => {
  it('splits a story into whole sentences of a readable length', () => {
    const story = 'The door creaks open. A cold wind blows out of the dark! Somewhere below, water drips.\n\nYou hear footsteps.';
    expect(speechParts(story)).toEqual(['The door creaks open. A cold wind blows out of the dark! Somewhere below, water drips.', 'You hear footsteps.']);
    const long = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} goes on for a little while.`).join(' ');
    const parts = speechParts(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(520);
    expect(parts.join(' ')).toBe(long);
    expect(speechParts('   \n\n  ')).toEqual([]);
    expect(speakable('**Achtung**, die _Strasse_ bebt.')).toBe('Achtung, die Strasse bebt.');
  });

  it('knows where each Piper voice lives in Piper\'s collection', () => {
    expect(piperPath('de_DE-thorsten-high')).toBe('de/de_DE/thorsten/high/de_DE-thorsten-high');
    expect(piperPath('en_GB-northern_english_male-medium')).toBe('en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium');
    expect(piperCard('en_GB-alan-medium')).toBe('https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/en/en_GB/alan/medium/MODEL_CARD');
    for (const v of PIPER_VOICES) expect(v.id.startsWith(v.lang === 'de' ? 'de_' : 'en_')).toBe(true);
  });

  it('keeps only known voices and sane speeds', () => {
    expect(cleanChoice({})).toEqual(DEFAULT_VOICE);
    const c = cleanChoice({ provider: 'openai', openai: 'onyx', speed: 3, piper: { en: 'de_DE-thorsten-high', de: 'de_DE-kerstin-low' }, elevenlabs: 'bad id!' });
    expect(c.provider).toBe('openai');
    expect(c.openai).toBe('onyx');
    expect(c.speed).toBe(1.3);
    expect(c.piper).toEqual({ en: DEFAULT_VOICE.piper.en, de: 'de_DE-kerstin-low' });
    expect(c.elevenlabs).toBe(DEFAULT_VOICE.elevenlabs);
    expect(cleanChoice({ provider: 'nonsense' }).provider).toBe('piper');
  });

  it('lists the keys and the switch in the Innkeeper settings', () => {
    for (const key of ['HEARTHFORGE_NARRATOR', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY']) expect(SETTINGS.find((s) => s.key === key)?.group).toBe('voice');
  });
});

describe('narrator on the server', () => {
  it('downloads the chosen Piper voices from their source, then reads both languages', async () => {
    const dir = tmp();
    const log: { url: string }[] = [];
    const n = new Narrator(join(dir, 'voice'), { HEARTHFORGE_PIPER: fakeBin(dir) }, okFetch(log), fakePiper([]));
    expect(n.manifest()).toEqual({ enabled: false, provider: 'piper', langs: [] });
    await n.start();
    expect(log.map((l) => l.url)).toEqual([
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx.json?download=true',
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx?download=true',
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx.json?download=true',
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx?download=true',
    ]);
    expect(n.manifest()).toEqual({ enabled: true, provider: 'piper', langs: ['en', 'de'] });
    expect(n.library().piper.filter((v) => v.installed).map((v) => v.id)).toEqual(['en_GB-northern_english_male-medium', 'de_DE-thorsten-high']);
  });

  it('makes speech once and serves it from the cache after that', async () => {
    const dir = tmp();
    const said: string[] = [];
    const n = new Narrator(join(dir, 'voice'), { HEARTHFORGE_PIPER: fakeBin(dir) }, okFetch([]), fakePiper(said));
    await n.start();
    const [a, b] = await Promise.all([n.speak('Der Drache erwacht.', 'de'), n.speak('Der Drache erwacht.', 'de')]);
    const c = await n.speak('Der Drache erwacht.', 'de');
    expect(said).toEqual(['Der Drache erwacht.']);
    expect(a.file).toBe(b.file);
    expect(c.file).toBe(a.file);
    expect(a.type).toBe('audio/wav');
    expect(existsSync(a.file)).toBe(true);
    await n.speak('Der Drache erwacht.', 'en');
    expect(said).toHaveLength(2);
    expect(n.library().cacheMb).toBe(0);
    await n.action({ do: 'clear' });
    expect(existsSync(a.file)).toBe(false);
  });

  it('asks OpenAI as a storyteller, only with a key, and remembers the choice', async () => {
    const dir = tmp();
    const log: { url: string; init?: RequestInit }[] = [];
    const without = new Narrator(join(dir, 'a'), {}, okFetch(log));
    await expect(without.action({ do: 'choose', choice: { provider: 'openai' } })).rejects.toThrow('no_key');

    const n = new Narrator(join(dir, 'b'), { OPENAI_API_KEY: 'sk-test' }, okFetch(log));
    await n.action({ do: 'choose', choice: { provider: 'openai', openai: 'onyx' } });
    expect(n.manifest()).toEqual({ enabled: true, provider: 'openai', langs: ['en', 'de'] });
    const audio = await n.speak('The gate falls shut behind you.', 'en');
    expect(audio.type).toBe('audio/mpeg');
    const call = log.find((l) => l.url === 'https://api.openai.com/v1/audio/speech')!;
    const body = JSON.parse(String(call.init!.body));
    expect(body).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: 'The gate falls shut behind you.', response_format: 'mp3' });
    expect(body.instructions).toMatch(/narrator/);
    expect((call.init!.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    // The choice survives a restart.
    expect(new Narrator(join(dir, 'b'), { OPENAI_API_KEY: 'sk-test' }, okFetch([])).library().choice.openai).toBe('onyx');
  });

  it('sends ElevenLabs the voice and the multilingual model', async () => {
    const dir = tmp();
    const log: { url: string; init?: RequestInit }[] = [];
    const n = new Narrator(dir, { ELEVENLABS_API_KEY: 'xi-test' }, okFetch(log));
    await n.action({ do: 'choose', choice: { provider: 'elevenlabs' } });
    await n.speak('Ein Schatten huscht über die Mauer.', 'de');
    const call = log.find((l) => l.url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/'))!;
    expect(call.url).toContain(DEFAULT_VOICE.elevenlabs);
    expect(JSON.parse(String(call.init!.body))).toMatchObject({ text: 'Ein Schatten huscht über die Mauer.', model_id: 'eleven_multilingual_v2' });
    expect((call.init!.headers as Record<string, string>)['xi-api-key']).toBe('xi-test');
  });

  it('stays silent when switched off, and says why Piper cannot speak', async () => {
    const dir = tmp();
    const off = new Narrator(dir, { HEARTHFORGE_NARRATOR: 'off', OPENAI_API_KEY: 'sk' }, okFetch([]));
    expect(off.manifest().enabled).toBe(false);
    await expect(off.speak('Hello.', 'en')).rejects.toThrow();
    const noPiper = new Narrator(join(dir, 'x'), { HEARTHFORGE_PIPER: join(dir, 'missing') }, okFetch([]));
    expect(noPiper.library().piperReady).toBe(false);
    await expect(noPiper.speak('Hello.', 'en')).rejects.toThrow('no_piper');
  });

  it('does not keep a half-made file when a hosted voice fails', async () => {
    const dir = tmp();
    const failing = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch;
    const n = new Narrator(dir, { OPENAI_API_KEY: 'sk' }, failing);
    await n.action({ do: 'choose', choice: { provider: 'openai' } });
    await expect(n.speak('Hello.', 'en')).rejects.toThrow(/429/);
    expect(n.library().error).toMatch(/429/);
    expect(n.library().cacheMb).toBe(0);
    expect(readFileSync(join(dir, 'voice.json'), 'utf8')).toContain('openai');
  });
});

describe('HTTPS from the Innkeeper', () => {
  it('only passes values the updater will accept', async () => {
    const { checkHttps } = await import('../src/admin/updater');
    expect(checkHttps({ mode: 'on', domain: ' DnD.Example.ch ', local: '192.168.1.50, hearthforge.lan' })).toEqual({ mode: 'on', domain: 'dnd.example.ch', local: '192.168.1.50,hearthforge.lan', email: '', dnsProvider: '' });
    expect(checkHttps({ mode: 'on', domain: 'a.ch', dnsProvider: 'cloudflare', dnsToken: 'abc_123-XYZ' })?.dnsToken).toBe('abc_123-XYZ');
    expect(checkHttps({ mode: 'on', domain: 'a.ch;rm -rf /' })).toBeNull();
    expect(checkHttps({ mode: 'on', local: '$(reboot)' })).toBeNull();
    expect(checkHttps({ mode: 'on', domain: 'a.ch', dnsProvider: 'route53' })).toBeNull();
    expect(checkHttps({ mode: 'on', domain: 'a.ch', dnsToken: 'x\nCOMPOSE_PROFILES=evil' })).toBeNull();
    expect(checkHttps({ mode: 'on' })).toBeNull();
    expect(checkHttps({ mode: 'off' })).toMatchObject({ mode: 'off' });
  });

  it('leaves the settings for the updater and reads back what it reports', async () => {
    const { Updater } = await import('../src/admin/updater');
    const dir = tmp();
    const u = new Updater(dir, () => 1_000_000_000);
    expect(u.requestHttps({ mode: 'on', local: '10.0.0.5' })).toBe('no_updater');
    writeFileSync(join(dir, 'control', 'heartbeat'), String(1_000_000));
    expect(u.requestHttps({ mode: 'on', domain: 'bad domain' })).toBe('bad_value');
    expect(u.requestHttps({ mode: 'on', domain: 'dnd.example.ch', local: '10.0.0.5', dnsProvider: 'cloudflare', dnsToken: 'tok' })).toBe('ok');
    expect(readFileSync(join(dir, 'control', 'request'), 'utf8')).toBe('https\n');
    expect(readFileSync(join(dir, 'control', 'https.request'), 'utf8')).toBe('mode=on\ndomain=dnd.example.ch\nlocal=10.0.0.5\nemail=\ndnsProvider=cloudflare\ndnsToken=tok\n');
    expect(u.requestHttps({ mode: 'off' })).toBe('busy');
    writeFileSync(join(dir, 'control', 'https'), 'state=idle\nmessage=Caddy runs for dnd.example.ch.\non=1\ndomain=dnd.example.ch\nlocal=10.0.0.5\nemail=\ndnsProvider=cloudflare\ndnsToken=1\ncaddy=running\n');
    expect(u.https()).toMatchObject({ connected: true, known: true, on: true, domain: 'dnd.example.ch', dnsToken: true, caddy: 'running', state: 'idle' });
  });
});

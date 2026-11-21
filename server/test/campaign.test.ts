import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAMPAIGN_SOURCES } from '../../shared/campaign';
import { hasTranslation } from '../../shared/i18n';
import { readBook, readText, searchBook } from '../src/campaign/read';
import { cleanDigest, partsOf, readCampaign } from '../src/campaign/digest';
import { CampaignLibrary } from '../src/campaign/library';
import { setShelf } from '../src/campaign/registry';
import { campaignTool } from '../src/campaign/prompt';
import { ClaudeDM } from '../src/dm/claude';
import { describeTable } from '../src/dm/context';
import { Game, GameError } from '../src/game/engine';

const BELL = new Uint8Array(readFileSync(join(__dirname, 'fixtures/sunken-bell.pdf')));
const text = (c: any): string => (typeof c === 'string' ? c : c.map((b: any) => b.text ?? '').join(''));

const DIGEST = {
  title: 'The Sunken Bell', levels: '1-2', blurb: 'A drowned bell rings under a lake.', system: '', theme: 'marsh', region: 'the Wrenmoor Fens',
  overview: 'A cult of the Deep Mother sank the chapel; the priest Varn rings the bell to wake her.',
  opening: 'The heroes reach Wrenmoor as the bell rings for the third night.',
  town: { name: 'Wrenmoor', kind: 'village', description: { en: 'A fishing village on a grey lake.', de: 'Ein Fischerdorf an einem grauen See.' } },
  places: [
    { name: 'The Lantern and Oar', kind: 'tavern', in_town: true, known: true, description: { en: 'A smoky lakeside tavern.', de: 'Eine verrauchte Taverne am See.' } },
    { name: 'Drowned Chapel', kind: 'ruin', in_town: false, known: true, description: { en: 'A tower rising from the water.', de: 'Ein Turm, der aus dem Wasser ragt.' } },
    { name: 'Nowhere', kind: 'spaceship', in_town: false, known: false, description: 'Odd.' },
  ],
  people: [
    { name: 'Edda Rook', gender: 'female', disposition: 'friendly', place: 'Wrenmoor', role: { en: 'mayor', de: 'Bürgermeisterin' }, description: { en: 'Worried and stern.', de: 'Besorgt und streng.' } },
    { name: 'Old Tobin', gender: 'male', disposition: 'grumpy', place: 'The Lantern and Oar', role: { en: 'fisherman', de: 'Fischer' }, description: { en: 'Saw lights under the water.', de: 'Hat Lichter unter Wasser gesehen.' } },
  ],
  quest: { title: { en: 'Silence the Sunken Bell', de: 'Bringt die versunkene Glocke zum Schweigen' }, summary: { en: 'Mayor Rook pays fifty gold.', de: 'Bürgermeisterin Rook zahlt fünfzig Gold.' } },
  chapters: [{ title: 'Chapter 3', sections: ['s4', 's99'], summary: 'The chapel.' }],
};

describe('reading a book', () => {
  it('splits a PDF along its bookmarks and finds things in it', async () => {
    const book = await readBook('bell.pdf', BELL);
    expect(book.title).toBe('The Sunken Bell');
    expect(book.pages).toBe(4);
    expect(book.sections.map((s) => [s.id, s.title, s.page])).toEqual([
      ['s1', 'Introduction', 1], ['s2', 'Chapter 1: Wrenmoor', 2], ['s3', 'Chapter 2: The Lake', 3], ['s4', 'Chapter 3: The Drowned Chapel', 4],
    ]);
    expect(book.sections[3].text).toMatch(/cult priest Varn/);
    expect(searchBook(book.sections, 'Varn')[0].id).toBe('s4');
  });

  it('splits text and Markdown by headings, and refuses what is no book', async () => {
    const md = `# The Goblin Hole\n\n${'Intro text about the region. '.repeat(3)}` + `\n\n## Area 1\n${'Rats in the cellar. '.repeat(30)}\n\n## Area 2\n${'A goblin chief named Grotz. '.repeat(30)}`;
    const book = readText(md, 'fallback');
    expect(book.title).toBe('The Goblin Hole');
    expect(book.sections.map((s) => s.title)).toEqual(['The Goblin Hole / Area 1', 'Area 2']);
    await expect(readBook('x.docx', new Uint8Array([1, 2, 3]))).rejects.toThrow('not_a_book');
    await expect(readBook('x.pdf', new TextEncoder().encode('%PDF-1.4 rubbish'))).rejects.toThrow();
    expect(() => readText('too short', 'x')).toThrow('no_text');
  });

  it('cuts long parts at paragraph ends and groups sections for the notes calls', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}. ${'Words go here. '.repeat(30)}`).join('\n\n');
    const book = readText(`# Big\n\n## One\n${long}\n\n## Two\nShort but long enough to stand on its own as a section of this book.`, 'b');
    expect(book.sections.length).toBeGreaterThan(2);
    expect(book.sections.every((s) => s.text.length <= 12_000)).toBe(true);
    expect(book.sections[0].title).toMatch(/^One \(1\/\d\)$/);
    expect(partsOf(book.sections, 20_000).every((p) => p.length >= 1)).toBe(true);
  });
});

describe('the digest', () => {
  it('takes notes part by part, then writes a digest the server cleans up', async () => {
    const book = await readBook('bell.pdf', BELL);
    const calls: { tier: string; prompt: string }[] = [];
    const progress: number[] = [];
    const digest = await readCampaign(book, async (tier, _system, prompt) => {
      calls.push({ tier, prompt });
      if (tier === 'background') return `Here you go: {"gists": {"s1": "Hook", "s4": "The chapel, Varn", "s77": "nope"}, "notes": "Varn rings the bell."}`;
      return JSON.stringify(DIGEST);
    }, (p) => progress.push(p));
    expect(calls.map((c) => c.tier)).toEqual(['background', 'standard']);
    expect(calls[1].prompt).toMatch(/Varn rings the bell/);
    expect(progress.at(-1)).toBe(1);
    expect(digest).not.toBeNull();
    const d = digest!;
    expect(d.gists).toEqual({ s1: 'Hook', s4: 'The chapel, Varn' });
    expect(d.places.map((p) => p.kind)).toEqual(['tavern', 'ruin', 'landmark']);
    expect(d.places[0].inTown).toBe(true);
    expect(d.places[2].description).toEqual({ en: 'Odd.', de: 'Odd.' });
    expect(d.people[1].disposition).toBe('neutral');
    expect(d.chapters[0].sections).toEqual(['s4']);
  });

  it('gives up when the AI answers nothing, instead of making a book up', async () => {
    const book = await readBook('bell.pdf', BELL);
    expect(await readCampaign(book, async () => null, () => undefined)).toBeNull();
  });
});

describe('the shelf and a table that plays a book', () => {
  let dir = '';
  afterEach(() => { setShelf(null); if (dir) rmSync(dir, { recursive: true, force: true }); });

  async function shelfWithBell() {
    dir = mkdtempSync(join(tmpdir(), 'hf-campaign-'));
    const lib = new CampaignLibrary(dir, (async () => new Response(BELL, { status: 200, headers: { 'content-length': String(BELL.length) } })) as typeof fetch);
    lib.reader = async (_id, book) => cleanDigest(DIGEST, book, { s4: 'The chapel' });
    setShelf(lib, (id) => (id === 'acct_host' ? { id, innkeeper: false } : id === 'acct_inn' ? { id, innkeeper: true } : null));
    const info = lib.add('bell.pdf', BELL, 'acct_host');
    for (let i = 0; i < 50 && lib.info(info.id)!.status === 'reading'; i++) await new Promise((r) => setTimeout(r, 20));
    return { lib, id: info.id };
  }

  it('reads a book onto the shelf and shows it only to its owner and the Innkeeper', async () => {
    const { lib, id } = await shelfWithBell();
    expect(lib.info(id)).toMatchObject({ status: 'ready', title: 'The Sunken Bell', pages: 4, sections: 4, levels: '1-2' });
    expect(lib.list({ id: 'acct_host', innkeeper: false }).map((b) => b.id)).toEqual([id]);
    expect(lib.list({ id: 'acct_inn', innkeeper: true }).map((b) => b.id)).toEqual([id]);
    expect(lib.list({ id: 'acct_other', innkeeper: false })).toEqual([]);
    expect(() => lib.remove(id, { id: 'acct_other', innkeeper: false })).toThrow('not_found');
    // The shelf survives a restart.
    expect(new CampaignLibrary(dir).info(id)?.status).toBe('ready');
    lib.remove(id, { id: 'acct_host', innkeeper: false });
    expect(lib.info(id)).toBeUndefined();
  });

  it('fetches a free book from its source once, for everyone', async () => {
    const { lib } = await shelfWithBell();
    const src = CAMPAIGN_SOURCES.find((s) => s.access === 'click')!;
    const a = await lib.fetchSource(src.id, 'acct_host');
    const b = await lib.fetchSource(src.id, 'acct_other');
    for (let i = 0; i < 50 && lib.info(a.id)!.status === 'reading'; i++) await new Promise((r) => setTimeout(r, 20));
    expect(lib.info(a.id)!.status).toBe('ready');
    expect(a.id).toBe(b.id);
    expect(a.owner).toBe('');
    await expect(lib.fetchSource(CAMPAIGN_SOURCES.find((s) => s.access === 'manual')!.id, 'acct_host')).rejects.toThrow('bad_request');
  });

  it('builds the starting world from the book and lets the Dungeon Master read it section by section', async () => {
    const { id } = await shelfWithBell();
    const g = new Game('book');
    g.upsertPlayer('acct_host', 'Host', true);
    g.upsertPlayer('acct_other', 'Guest', true);
    g.setStart('acct_host', { region: 'random', seed: 'BELL-1' });
    expect(() => g.setStart('acct_host', { campaign: { id: 'nope', title: 'x' } })).toThrow(GameError);
    g.setStart('acct_host', { campaign: { id, title: 'ignored' } });
    expect(g.s.table.start.campaign).toEqual({ id, title: 'The Sunken Bell' });
    g.addCharacter('acct_host', 'fighter', 'Brann');
    g.start();
    const home = g.world.locations.find((l) => l.id === 'home')!;
    expect(home).toMatchObject({ name: 'Wrenmoor', kind: 'village' });
    expect(g.world.locations.find((l) => l.name === 'The Lantern and Oar')?.parentId).toBe('home');
    expect(g.world.locations.find((l) => l.name === 'Drowned Chapel')?.discovered).toBe(true);
    expect(g.s.memory.npcs.map((n) => n.name)).toEqual(['Edda Rook', 'Old Tobin']);
    expect(g.s.memory.npcs[1].locationId).toBe(g.world.locations.find((l) => l.name === 'The Lantern and Oar')!.id);
    expect(g.s.memory.quests[0].title).toBe('Silence the Sunken Bell');
    expect(g.s.setting?.campaign).toMatchObject({ id, title: 'The Sunken Bell', focus: null });

    let about = describeTable(g);
    expect(about).toMatch(/CAMPAIGN BOOK: this table plays the published adventure "The Sunken Bell"/);
    expect(about).toMatch(/s4 Chapter 3: The Drowned Chapel \(p\. 4\): The chapel/);
    expect(about).toMatch(/No section is open yet/);
    const read = campaignTool(g, { section: 's2', search: '' }) as { text: string; next: string };
    expect(read.text).toMatch(/Lantern and Oar/);
    expect(read.next).toMatch(/^s3 /);
    about = describeTable(g);
    expect(about).toMatch(/The part of the book the party is in now, s2 "Chapter 1: Wrenmoor"/);
    expect(about).toMatch(/Old Tobin the fisherman/);
    expect((campaignTool(g, { section: '', search: 'Varn' }) as { found: { id: string }[] }).found[0].id).toBe('s4');
    expect(() => campaignTool(g, { section: 's99', search: '' })).toThrow(/No section/);

    // German tables show the German texts the digest brought along.
    const de = new Game('book-de');
    de.upsertPlayer('acct_host', 'Host', true);
    de.setLanguage('acct_host', 'de');
    de.setStart('acct_host', { campaign: { id, title: '' } });
    de.addCharacter('acct_host', 'fighter', 'Brann');
    de.start();
    expect(de.s.memory.quests[0].title).toBe('Bringt die versunkene Glocke zum Schweigen');
    expect(de.s.memory.npcs[0].role).toBe('Bürgermeisterin');
  });

  it('gives the campaign tool only to tables that play a book', async () => {
    const { id } = await shelfWithBell();
    const requests: any[] = [];
    const dm = new ClaudeDM({ models: { background: 'b', standard: 's', key: 'k', forced: null }, effort: 'low', apiKey: 'test' });
    (dm as any).client = { beta: { messages: { create: async (req: any) => {
      requests.push(JSON.parse(JSON.stringify(req)));
      if (req.messages.length === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'campaign', input: { section: 's3', search: '' } }] };
      return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 's', name: 'scene', input: { title: 'The lake', mood: 'mystery', narration: 'Reeds whisper.', suggested_actions: [], journal_entry: '', important: false } }] };
    } } } };
    const play = (campaign: boolean) => {
      const g = new Game(campaign ? 'with' : 'without');
      g.upsertPlayer('acct_host', 'Host', true);
      if (campaign) g.setStart('acct_host', { campaign: { id, title: '' } });
      g.addCharacter('acct_host', 'fighter', 'Brann');
      g.start();
      g.takeBeats();
      return g;
    };
    const plain = play(false);
    await dm.respond(plain, [{ player: 'Host', text: 'We look around' }], async () => {});
    expect(requests[0].tools.map((t: any) => t.name)).not.toContain('campaign');
    requests.length = 0;
    const book = play(true);
    await dm.respond(book, [{ player: 'Host', text: 'We row out' }], async () => {});
    const names = requests[0].tools.map((t: any) => t.name);
    expect(names).toContain('campaign');
    expect(names.at(-1)).toBe('scene');
    expect(text(requests[0].messages[0].content)).toMatch(/CAMPAIGN BOOK/);
    expect(requests[1].messages[2].content[0].content).toMatch(/giant frogs/);
    expect(book.s.setting?.campaign?.focus).toBe('s3');
  });
});

describe('campaign texts', () => {
  it('has German for every book on the list', () => {
    for (const s of CAMPAIGN_SOURCES) {
      expect(s.blurb.de && s.length.de && s.terms.de, s.id).toBeTruthy();
      expect(s.page).toMatch(/^https:\/\//);
      if (s.access === 'click') expect(s.pdf).toMatch(/^https:\/\/.+\.pdf$/);
    }
    for (const key of ['Drop a PDF or text file here', 'As the book begins', 'That campaign book is not on this server']) expect(hasTranslation('de', key), key).toBe(true);
  });
});


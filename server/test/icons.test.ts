import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { ICON_SUBJECTS, iconSheetPrompt, sheetsFor } from '../../shared/iconLibrary';
import { ITEM_ICON_NAMES } from '../../shared/art';
import { GLYPH_ICON_NAMES } from '../../shared/glyphs';
import { IconError, IconLibrary, cellRect, imageSize, type IconPainter } from '../src/iconLibrary';

/** The header of a PNG of this size, which is all the library reads. */
function png(w: number, h: number, salt = 0) {
  const b = Buffer.alloc(64);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  b.writeUInt32BE(salt, 40);
  return b;
}

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function make(opts: { fail?: boolean; noKey?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hf-icons-'));
  dirs.push(dir);
  const prompts: string[] = [];
  const costs: number[] = [];
  let n = 0, changes = 0;
  const painter: IconPainter = {
    label: 'gemini test', usd: 0.067,
    paint: async (prompt) => { prompts.push(prompt); if (opts.fail) throw new Error('Gemini answered 400: refused'); return { data: png(1024, 1024, ++n), mime: 'image/png' }; },
  };
  const lib = new IconLibrary(dir, { painter: () => (opts.noKey ? null : painter), onCost: (usd) => costs.push(usd), onChange: () => { changes++; } });
  return { lib, dir, prompts, costs, changes: () => changes };
}

describe('the server\'s own icons', () => {
  it('has one subject for every distinct picture the game shows', () => {
    const paths = new Set([...Object.values(ITEM_ICON_NAMES), ...Object.values(GLYPH_ICON_NAMES)]);
    expect(ICON_SUBJECTS.length).toBe(paths.size);
    const slots = ICON_SUBJECTS.flatMap((s) => s.slots);
    expect(slots.length).toBe(Object.keys(ITEM_ICON_NAMES).length + Object.keys(GLYPH_ICON_NAMES).length);
    expect(ICON_SUBJECTS.every((s) => s.name && !s.name.includes('/'))).toBe(true);
  });

  it('asks for a 2 by 2 sheet on a flat key colour, without text', () => {
    const p = iconSheetPrompt(ICON_SUBJECTS.slice(0, 4));
    expect(p).toMatch(/2 by 2/);
    expect(p).toMatch(/magenta/);
    expect(p).toMatch(/top left: .+bottom right: /);
    expect(p).toMatch(/No text/);
    expect(iconSheetPrompt([ICON_SUBJECTS[0]], 'made of bone')).toMatch(/four different takes.*made of bone/);
  });

  it('reads the size of PNG and JPEG pictures and cuts sheets into quarters', () => {
    expect(imageSize(png(1024, 768))).toEqual({ w: 1024, h: 768 });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x03, 0x00, 0x03, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ w: 768, h: 512 });
    expect(imageSize(Buffer.from('not a picture'))).toBeNull();
    expect(cellRect({ w: 1024, h: 1024 }, 3)).toEqual({ x: 512, y: 512, w: 512, h: 512 });
  });

  it('paints every missing icon four to a sheet, pays for each sheet and fills every slot', async () => {
    const { lib, prompts, costs } = make();
    const sheets = lib.makeMissing({ account: 'a1' });
    expect(sheets).toBe(sheetsFor(ICON_SUBJECTS.length));
    expect(lib.view().queued).toBeGreaterThan(0);
    await lib.whenIdle();
    expect(prompts.length).toBe(sheets);
    expect(costs.reduce((a, b) => a + b, 0)).toBeCloseTo(sheets * 0.067, 5);
    const v = lib.view();
    expect(v.missing).toBe(0);
    const refs = lib.refs();
    expect(refs.longsword).toMatchObject({ key: true, rect: { w: 512, h: 512 } });
    expect(refs['spell:fire_bolt']?.src).toMatch(/^\/icons\/[0-9a-f]{20}\.png$/);
    expect(Object.keys(refs).length).toBe(ICON_SUBJECTS.flatMap((s) => s.slots).length);
    // Nothing is painted twice.
    expect(lib.makeMissing()).toBe(0);
  });

  it('repaints four takes, keeps the one in use until another is picked, and switches icons off', async () => {
    const { lib } = make();
    lib.makeMissing();
    await lib.whenIdle();
    const id = ICON_SUBJECTS.find((s) => s.slots.includes('longsword'))!.id;
    const before = lib.refs().longsword;
    lib.repaint(id, 'a rune on the blade');
    expect(() => lib.repaint(id, '')).toThrow();
    await lib.whenIdle();
    expect(lib.refs().longsword).toEqual(before);
    const icon = lib.view().icons.find((i) => i.id === id)!;
    expect(icon.takes?.length).toBe(5);
    const pick = icon.takes!.find((tk) => tk.src !== before.src && tk.cell === 2)!;
    lib.choose(id, pick.sheet, pick.cell);
    expect(lib.refs().longsword).toMatchObject({ src: pick.src, rect: { x: 0, y: 512 } });
    lib.setEnabled(id, false);
    expect(lib.refs().longsword).toBeUndefined();
    expect(lib.view().icons.find((i) => i.id === id)?.disabled).toBe(true);
    lib.setEnabled(id, true);
    expect(lib.refs().longsword).toBeDefined();
  });

  it('keeps its icons over a restart', async () => {
    const { lib, dir } = make();
    lib.makeMissing();
    await lib.whenIdle();
    const again = new IconLibrary(dir, { painter: () => null });
    expect(again.refs()).toEqual(lib.refs());
    expect(again.file(lib.refs().longsword.src.slice(7))?.mime).toBe('image/png');
  });

  it('notes a refusal on each icon of the sheet, and needs a picture service', async () => {
    const { lib, costs } = make({ fail: true });
    lib.makeMissing();
    await lib.whenIdle();
    expect(costs).toEqual([]);
    expect(lib.view().icons[0].error).toMatch(/refused/);
    expect(lib.view().missing).toBe(ICON_SUBJECTS.length);
    expect(() => make({ noKey: true }).lib.makeMissing()).toThrow(/no_key/);
  });

  it('turns the ids of icons chosen before the rename ("author/name") into plain names', () => {
    const { dir } = make();
    const id = ICON_SUBJECTS[0].id;
    writeFileSync(join(dir, 'icons.json'), JSON.stringify({
      sheets: [{ id: 'sheet-old', file: 'aaaaaaaaaaaaaaaaaaaa.png', mime: 'image/png', w: 1024, h: 1024, subjects: [`lorc/${id}`], takes: false, usd: 0.067, at: 1 }],
      use: { [`lorc/${id}`]: { sheet: 'sheet-old', cell: 0 } }, off: [`lorc/${ICON_SUBJECTS[1].id}`], errors: {},
    }));
    const lib = new IconLibrary(dir, { painter: () => null });
    expect(lib.view().icons.find((i) => i.id === id)?.src).toBe('/icons/aaaaaaaaaaaaaaaaaaaa.png');
    expect(lib.view().icons.find((i) => i.id === ICON_SUBJECTS[1].id)?.disabled).toBe(true);
  });

  it('puts a downloaded zip back, skips what is already there, and refuses anything else', async () => {
    const first = make();
    first.lib.makeMissing();
    await first.lib.whenIdle();
    const out = first.dir;
    const files: Record<string, Uint8Array> = { 'icons.json': new TextEncoder().encode(JSON.stringify({ format: 'hearthforge-icons', version: 1, ...first.lib.exportable() })) };
    for (const sh of first.lib.exportable().sheets) files[`sheets/${sh.file}`] = readFileSync(join(out, 'sheets', sh.file));
    const zip = zipSync(files);
    const fresh = make();
    const done = fresh.lib.restoreZip(zip);
    expect(done.added).toBe(first.lib.exportable().sheets.length);
    expect(fresh.lib.refs()).toEqual(first.lib.refs());
    expect(fresh.lib.restoreZip(zip).added).toBe(0);
    expect(() => fresh.lib.restoreZip(new Uint8Array([1, 2, 3]))).toThrow(IconError);
    expect(() => fresh.lib.restoreZip(zipSync({ 'icons.json': new TextEncoder().encode('{"format":"other"}') }))).toThrow(IconError);
    // A sheet whose bytes do not match its name is left out.
    const forged = zipSync({ ...files, [`sheets/${first.lib.exportable().sheets[0].file}`]: png(1024, 1024, 999) });
    expect(make().lib.restoreZip(forged).skipped).toBeGreaterThan(0);
  });

  it('brings back the list from a backup while the sheets are still in the folder', async () => {
    const first = make();
    first.lib.makeMissing();
    await first.lib.whenIdle();
    const saved = JSON.parse(JSON.stringify(first.lib.exportable()));
    writeFileSync(join(first.dir, 'icons.json'), '{}');
    const lost = new IconLibrary(first.dir, { painter: () => null });
    expect(lost.view().missing).toBe(ICON_SUBJECTS.length);
    expect(lost.restoreList(saved)).toBe(saved.sheets.length);
    expect(lost.view().missing).toBe(0);
  });
});

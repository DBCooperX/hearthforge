// Builds the starting region of a table: either the handcrafted Emberfall Vale, or a
// region rolled from the world seed. Everything here is decided by the seed alone, in the
// same order whatever the language, so one seed gives the same region in English and German.
import { tr, type Lang } from '../../../shared/i18n';
import { CUSTOM, PREMISES, SURPRISE, seedStream, type StartOptions } from '../../../shared/start';
import {
  AUTHORITY_TEXT, FIRST_NAMES, INNKEEPER, KEEPER_TEXT, LOOKS, MINOR_LOOT, MINOR_SITES, PREMISE_TEXT, QUEST_REWARD, ROOTS, SANCTUARIES,
  SETTLEMENT_ENDINGS, STAGE_LOOT, SURNAMES, TAVERNS, TAVERN_TEXT, THEMES, THREATS, TOWNS, VILLAGES,
  type Gender, type L, type MonsterGroup, type Pair, type PlaceName, type PremiseTpl, type Siting, type StageTpl,
} from '../data/regions';
import {
  SEED_LOCATIONS, SEED_NPCS, SEED_QUESTS, SETTING_NAME, SETTING_PREMISE, START_LOCATION,
  type GroupSpec, type RegionDef, type SeedLocation, type SeedNpc, type StageDef,
} from '../data/world';
import type { LocationKind } from '../../../shared/types';
import type { CampaignDigest } from '../campaign/library';
import type { Rng } from './dice';

const fill = (tpl: string, tokens: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => tokens[k] ?? m);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The Emberfall Vale, exactly as it was written. */
export function classicRegion(lang: Lang): RegionDef {
  const l = (text: string) => tr(lang, text);
  return {
    name: l(SETTING_NAME),
    nameIn: l('in the Emberfall Vale'),
    premise: SETTING_PREMISE,
    startId: START_LOCATION,
    tavernId: 'gilded_anvil',
    locations: SEED_LOCATIONS.map((loc) => ({
      ...loc, name: l(loc.name), description: l(loc.description),
      ...(loc.stages ? { stages: loc.stages.map((st) => ({ ...st, name: l(st.name), description: l(st.description) })) } : {}),
    })),
    npcs: SEED_NPCS.map((n) => ({ ...n, name: l(n.name), role: l(n.role), description: l(n.description) })),
    quests: SEED_QUESTS.map((q) => ({ ...q, title: l(q.title), summary: l(q.summary) })),
    placed: true,
    tokens: { town: l('Emberfall'), tavern: l('The Gilded Anvil'), region: l(SETTING_NAME), regionIn: l('in the Emberfall Vale') },
  };
}

// --------------------------------------------------------------- the dice

function shuffled<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const pick = <T,>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length) % xs.length];

// ----------------------------------------------------------------- grammar

const DE_ARTICLE: Record<Gender, string> = { f: 'die', m: 'der', n: 'das', p: 'die' };
const DE_PREP: Record<'at' | 'under' | 'from' | 'in', Record<Gender, string>> = {
  at: { f: 'bei der', m: 'beim', n: 'beim', p: 'bei den' },
  under: { f: 'unter der', m: 'unter dem', n: 'unter dem', p: 'unter den' },
  from: { f: 'aus der', m: 'aus dem', n: 'aus dem', p: 'aus den' },
  in: { f: 'in der', m: 'im', n: 'im', p: 'in den' },
};
const EN_PREP = { at: 'at', under: 'beneath', from: 'from', in: 'in' } as const;

interface Named {
  /** The bare name in the table's language, as the map shows it. */
  name: string;
  g: Gender;
  the: boolean;
}

/** A place name with a preposition, in the grammar of `lang`. */
function withPrep(n: Named, prep: keyof typeof EN_PREP, lang: Lang): string {
  return lang === 'de' ? `${DE_PREP[prep][n.g]} ${n.name}` : `${EN_PREP[prep]} ${n.the ? 'the ' : ''}${n.name}`;
}
const withArticle = (n: Named, lang: Lang) => (lang === 'de' ? `${DE_ARTICLE[n.g]} ${n.name}` : `${n.the ? 'the ' : ''}${n.name}`);

/** Takes name roots off a shuffled pile, skipping ones that would read badly with a given ending. */
class Roots {
  private pile: Pair[];
  constructor(rng: Rng) { this.pile = shuffled(ROOTS, rng); }

  private take(ok: (r: Pair) => boolean): Pair {
    const i = this.pile.findIndex(ok);
    return this.pile.splice(i < 0 ? 0 : i, 1)[0];
  }

  place(p: PlaceName, lang: Lang): Named {
    const enEnd = p.en('').trim().toLowerCase(), deEnd = p.de('').trim().toLowerCase();
    const r = this.take(([en, de]) => !enEnd.startsWith(en.toLowerCase()) && !deEnd.startsWith(de.slice(0, 4).toLowerCase()));
    return { name: lang === 'de' ? p.de(r[1]) : p.en(r[0]), g: p.g, the: !!p.the };
  }

  settlement(rng: Rng, lang: Lang): string {
    const end = pick(SETTLEMENT_ENDINGS, rng);
    const r = this.take(([en, de]) => en.slice(-1).toLowerCase() !== end[0][0] && !end[0].startsWith(en.toLowerCase()) && !end[1].startsWith(de.slice(0, 4).toLowerCase()));
    return lang === 'de' ? `${r[1]}${end[1]}` : `${r[0]}${end[0]}`;
  }
}

// ------------------------------------------------------------------ people

interface Person {
  first: string;
  surname: string;
  /** 0 female, 1 male: the index of the German form of a role. */
  gi: 0 | 1;
  appearance: (clothes: string) => string;
}

function people(rng: Rng, count: number): Person[] {
  const women = shuffled(FIRST_NAMES.female, rng), men = shuffled(FIRST_NAMES.male, rng), surnames = shuffled(SURNAMES, rng);
  return Array.from({ length: count }, (_, i) => {
    const gi = (rng() < 0.5 ? 0 : 1) as 0 | 1;
    const species = pick(LOOKS.species, rng), build = pick(LOOKS.build, rng), age = pick(LOOKS.age, rng), hair = pick(LOOKS.hair, rng), eyes = pick(LOOKS.eyes, rng);
    const who = `${species === 'human' ? '' : `${species} `}${gi === 0 ? 'woman' : 'man'}`;
    return {
      first: (gi === 0 ? women : men)[i], surname: surnames[i], gi,
      appearance: (clothes: string) => `A ${build} ${age} ${who} with ${hair} and ${eyes}, wearing ${clothes}.`,
    };
  });
}

// ----------------------------------------------------------------- regions

/** Which kind of country a premise asks for, if any. */
export const premiseTheme = (premiseId: string) => PREMISE_TEXT[premiseId]?.theme;

/**
 * Roll a region from the seed. Its places have no hex yet: the world builder puts
 * them on the map once the terrain exists, using each place's `site` wishes.
 */
export function randomRegion(seed: string, lang: Lang, forcedTheme?: string): RegionDef {
  const rng = seedStream(seed, 'region');
  const text = (l: L) => l[lang];
  const roots = new Roots(seedStream(seed, 'names'));
  // Rolled first and always, so a premise that forces the kind of country changes nothing else.
  const rolledTheme = pick(THEMES, rng);
  const theme = THEMES.find((t) => t.id === forcedTheme) ?? rolledTheme;

  const region = roots.place(theme.name, lang);
  const regionName = withArticle(region, lang);
  const regionIn = lang === 'de' ? `${theme.deIn ?? DE_PREP.in[region.g]} ${region.name}` : `${theme.enIn ?? 'in'} ${regionName}`;

  const fits = <T extends { themes?: string[] }>(xs: T[]) => xs.filter((x) => !x.themes || x.themes.includes(theme.id));
  const townRoll = rng(), villageRoll = rng(), sanctuaryRoll = rng();
  const at = <T,>(xs: T[], roll: number) => xs[Math.floor(roll * xs.length) % xs.length];
  const town = at(fits(TOWNS), townRoll);
  const village = at(fits(VILLAGES), villageRoll);
  const sanctuary = at(fits(SANCTUARIES), sanctuaryRoll);
  const threat = pick(THREATS, rng);
  const lair = pick(threat.lairs, rng);
  const minor = pick(MINOR_SITES.filter((m) => m.tag !== threat.tag), rng);
  const tavern = text(pick(TAVERNS, rng));
  const tavernLook = pick(TAVERN_TEXT.appearance, rng);

  const townName = roots.settlement(rng, lang), villageName = roots.settlement(rng, lang);
  const lairName = roots.place(lair.name, lang), minorName = roots.place(minor.name, lang), sanctuaryName = roots.place(sanctuary.name, lang);

  const [innkeeper, authority, villager, keeper] = people(seedStream(seed, 'people'), 4);
  const authorityName = `${lang === 'de' ? town.title.de[authority.gi] : town.title.en} ${authority.first} ${authority.surname}`;

  // Sentences the players read use the grammar of the table's language; the Dungeon Master's
  // premise is English around the same names.
  const tokens = (grammar: Lang): Record<string, string> => ({
    town: townName, village: villageName, tavern, authority: authorityName,
    region: regionName, regionIn, Region: upperFirst(regionName),
    site: withArticle(lairName, grammar),
    atSite: withPrep(lairName, 'at', grammar), underSite: withPrep(lairName, 'under', grammar),
    fromSite: withPrep(lairName, 'from', grammar), inSite: withPrep(lairName, 'in', grammar),
  });
  const shown = tokens(lang), dm = tokens('en');
  const say = (l: L) => fill(text(l), shown);
  const role = (r: { en: string; de: [string, string] }, who: Person) => fill(lang === 'de' ? r.de[who.gi] : r.en, shown);

  const group = (g: MonsterGroup): GroupSpec => ({
    defId: g.defId, count: g.count,
    ...(g.name ? { name: text(g.name) } : {}), ...(g.description ? { description: text(g.description) } : {}),
    ...(g.look ? { look: g.look } : {}), ...(g.power ? { power: g.power } : {}), ...(g.boss ? { boss: true } : {}),
  });
  const stages = (tpls: StageTpl[], loot: typeof STAGE_LOOT): StageDef[] =>
    tpls.map((st, i) => ({ name: text(st.name), description: text(st.description), monsters: st.monsters.map(group), loot: loot[i] }));

  const locations: SeedLocation[] = [
    { id: 'home', name: townName, kind: 'town', q: 0, r: 0, terrain: 'p', known: true, description: say(town.description), appearance: town.appearance, site: { dist: [0, 0], water: town.water } },
    { id: 'tavern', name: tavern, kind: 'tavern', q: 0, r: 0, parentId: 'home', known: true, description: say(TAVERN_TEXT.description), appearance: tavernLook },
    { id: 'lair', name: lairName.name, kind: 'dungeon', q: 0, r: 0, known: true, questId: 'main', description: say(lair.description), appearance: lair.appearance, site: threat.site, stages: stages(threat.stages, STAGE_LOOT) },
    { id: 'village', name: villageName, kind: 'village', q: 0, r: 0, terrain: 'p', description: say(village.description), appearance: village.appearance, site: village.site },
    { id: 'minor', name: minorName.name, kind: minor.kind, q: 0, r: 0, description: say(minor.description), appearance: minor.appearance, site: minor.site, stages: stages(minor.stages, MINOR_LOOT) },
    { id: 'sanctuary', name: sanctuaryName.name, kind: sanctuary.kind, q: 0, r: 0, description: say(sanctuary.description), appearance: sanctuary.appearance, site: sanctuary.site },
  ];

  const textRng = seedStream(seed, 'texts');
  const keeperRole = lang === 'de' ? sanctuary.role.de(sanctuaryName.name)[keeper.gi] : fill(sanctuary.role.en, { name: `${sanctuaryName.the ? 'the ' : ''}${sanctuaryName.name}` });
  const npcs: SeedNpc[] = [
    {
      id: 'innkeeper', name: `${innkeeper.first} ${innkeeper.surname}`, role: role(INNKEEPER.role, innkeeper), disposition: 'friendly', locationId: 'tavern',
      description: say(pick(INNKEEPER.text, textRng)), appearance: innkeeper.appearance(INNKEEPER.clothes),
    },
    {
      id: 'authority', name: authorityName, role: role(town.role, authority), disposition: 'neutral', locationId: 'home',
      description: say(pick(AUTHORITY_TEXT, textRng)), appearance: authority.appearance('a dark wool coat with a bronze chain of office'),
    },
    {
      id: 'villager', name: `${villager.first} ${villager.surname}`, role: role(village.role, villager), disposition: 'wary', locationId: 'village',
      description: say(village.person), appearance: villager.appearance(village.clothes),
    },
    {
      id: 'keeper', name: `${keeper.first} ${keeper.surname}`, role: keeperRole, disposition: 'friendly', locationId: 'sanctuary',
      description: say(pick(KEEPER_TEXT, textRng)), appearance: keeper.appearance(sanctuary.clothes),
    },
  ];

  const premise = [
    fill(theme.about, dm),
    `Its heart is ${townName}. ${town.description.en}`,
    fill(threat.premise, dm),
    `Beyond that trouble the region is open country. Places people talk about that the party has not found yet: ${villageName} (${village.gist}), ${withArticle(minorName, 'en')} (${minor.gist}) and ${withArticle(sanctuaryName, 'en')} (${sanctuary.gist}), each a day or two from ${townName}. The rest is whatever lies out there that nobody has mapped.`,
  ].join(' ');

  return {
    name: regionName, nameIn: regionIn, premise, startId: 'home', tavernId: 'tavern', locations, npcs,
    quests: [{ id: 'main', title: text(threat.quest.title), summary: say(threat.quest.summary), ...QUEST_REWARD }],
    terrain: theme.terrain, placed: false,
    tokens: { town: townName, tavern, region: regionName, regionIn },
  };
}

// ---------------------------------------------------------------- premises

export interface Opening {
  /** The preset that is used, after 'surprise' has been rolled. */
  premiseId: string;
  startIn: PremiseTpl['startIn'];
  /** For the Dungeon Master. */
  opening: string;
  /** For the players, when no AI tells the story. */
  intro: string;
}

/** Which premise a table opens with. 'surprise' is settled by the seed; an empty custom text falls back to the plain arrival. */
export function resolvePremise(start: StartOptions): string {
  if (start.premise === SURPRISE) return pick(PREMISES, seedStream(start.seed, 'premise')).id;
  if (start.premise === CUSTOM) return start.custom.trim() ? CUSTOM : 'arrival';
  return PREMISE_TEXT[start.premise] ? start.premise : 'arrival';
}

export function openingFor(premiseId: string, custom: string, region: RegionDef, lang: Lang): Opening {
  const tpl = PREMISE_TEXT[premiseId] ?? PREMISE_TEXT.arrival;
  const tokens = { ...region.tokens, custom: JSON.stringify(custom.trim()) };
  return { premiseId, startIn: tpl.startIn, opening: fill(tpl.opening, tokens), intro: fill(tpl.intro[lang], tokens) };
}

// ------------------------------------------------------------ campaign books

const BOOK_KINDS: Record<string, LocationKind> = {
  town: 'town', city: 'town', village: 'village', hamlet: 'village', tavern: 'tavern', inn: 'tavern', shop: 'shop', temple: 'temple', church: 'temple',
  chapel: 'temple', shrine: 'shrine', camp: 'camp', dungeon: 'dungeon', lair: 'dungeon', ruin: 'ruin', ruins: 'ruin', castle: 'ruin', tower: 'ruin',
  cave: 'cave', caves: 'cave', mine: 'cave', landmark: 'landmark',
};
const IN_TOWN: LocationKind[] = ['tavern', 'shop', 'temple', 'shrine'];
const SITES: Partial<Record<LocationKind, Siting>> = {
  village: { dist: [4, 7], prefer: 'p' }, dungeon: { dist: [3, 6], prefer: 'hf' }, cave: { dist: [3, 6], prefer: 'hm' }, ruin: { dist: [3, 7], prefer: 'hf' },
  camp: { dist: [2, 5], prefer: 'f' }, landmark: { dist: [2, 6] }, temple: { dist: [3, 7], prefer: 'h' }, shrine: { dist: [3, 7], prefer: 'f' },
};
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'place';

/**
 * The starting region of a table that plays a campaign book: the book's home town, the places
 * and people it names and its opening quest, put on a map rolled from the seed. The Dungeon
 * Master adds whatever else the book needs as the story gets there.
 */
export function campaignRegion(d: CampaignDigest, seed: string, lang: Lang): RegionDef {
  const text = (l: { en: string; de: string }) => (lang === 'de' && l.de ? l.de : l.en);
  const theme = THEMES.find((t) => t.id === d.theme) ?? THEMES[0];
  const townName = d.town.name || (lang === 'de' ? 'Ausgangsort' : 'The starting town');
  const regionName = d.region || townName;
  const locations: SeedLocation[] = [{
    id: 'home', name: townName, kind: d.town.kind === 'village' ? 'village' : 'town', q: 0, r: 0, terrain: 'p', known: true,
    description: text(d.town.description) || townName, appearance: 'A small medieval settlement of timber and stone, smoke rising from its chimneys.', site: { dist: [0, 0] },
  }];
  const used = new Set(['home']);
  let tavernId: string | null = null;
  for (const p of d.places.slice(0, 10)) {
    const kind = BOOK_KINDS[p.kind.toLowerCase()] ?? 'landmark';
    if (kind === 'town' || !p.name.trim() || p.name === townName) continue;
    let id = slug(p.name);
    while (used.has(id)) id = `${id}_`;
    used.add(id);
    const inside = p.inTown && IN_TOWN.includes(kind);
    if (inside && kind === 'tavern' && !tavernId) tavernId = id;
    locations.push({
      id, name: p.name.trim().slice(0, 60), kind, q: 0, r: 0, known: inside || p.known,
      description: text(p.description).slice(0, 400), appearance: `${kind} — ${p.description.en}`.slice(0, 300),
      ...(inside ? { parentId: 'home' } : { site: SITES[kind] ?? { dist: [3, 7] } }),
      ...(kind === 'village' ? { terrain: 'p' as const } : {}),
    });
  }
  if (!tavernId) {
    const name = lang === 'de' ? 'Die Schenke' : 'The Tavern';
    tavernId = 'tavern';
    locations.push({ id: 'tavern', name, kind: 'tavern', q: 0, r: 0, parentId: 'home', known: true, description: name, appearance: 'A low-beamed tavern common room with a stone hearth.' });
  }
  const rng = seedStream(seed, 'people');
  const folk = people(rng, Math.min(10, d.people.length));
  const placeOf = (name: string) => locations.find((l) => name && l.name.toLowerCase() === name.trim().toLowerCase())?.id ?? 'home';
  const npcs: SeedNpc[] = d.people.slice(0, 10).map((p, i) => {
    const who = folk[i];
    const gi = p.gender === 'female' ? 0 : p.gender === 'male' ? 1 : who.gi;
    const base = who.appearance('clothes that fit their station');
    const appearance = gi === who.gi ? base : base.replace(/\b(wo)?man\b/, gi === 0 ? 'woman' : 'man');
    const disposition = (['friendly', 'neutral', 'wary', 'hostile'] as const).find((x) => x === p.disposition) ?? 'neutral';
    return {
      id: `${slug(p.name)}_${i}`, name: p.name.trim().slice(0, 60), role: text(p.role).slice(0, 80), description: text(p.description).slice(0, 400),
      appearance,
      disposition, locationId: placeOf(p.place),
    };
  });
  const premise = [
    fill(theme.about, { Region: upperFirst(regionName), region: regionName }),
    `The table plays the published adventure "${d.title}". Its home base is ${townName}.`,
  ].join(' ');
  return {
    name: regionName, nameIn: lang === 'de' ? `in ${regionName}` : `in ${regionName}`, premise, startId: 'home', tavernId, locations, npcs,
    quests: d.quest.title.en ? [{ id: 'main', title: text(d.quest.title).slice(0, 80), summary: text(d.quest.summary).slice(0, 400), ...QUEST_REWARD }] : [],
    terrain: theme.terrain, placed: false,
    tokens: { town: townName, tavern: locations.find((l) => l.id === tavernId)!.name, region: regionName, regionIn: `in ${regionName}` },
  };
}

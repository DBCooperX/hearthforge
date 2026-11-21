// Builds the starting region of a table: either the handcrafted Emberfall Vale, or a
// region rolled from the world seed. Everything here is decided by the seed alone, in the
// same order whatever the language, so one seed gives the same region in English and German.
import { tr, type Lang } from '../../../shared/i18n';
import { CUSTOM, PREMISES, SURPRISE, seedStream, type StartOptions } from '../../../shared/start';
import {
  AUTHORITY_TEXT, ERRANDS, FIRST_NAMES, INNKEEPER, KEEPER_TEXT, LOOKS, MINOR_LOOT, MINOR_SITES, PREMISE_TEXT, QUEST_REWARD, ROOTS, SANCTUARIES,
  SETTLEMENT_ENDINGS, SIDE_REWARD, STAGE_LOOT, SURNAMES, TAVERNS, TAVERN_TEXT, THEMES, THREATS, TOWNS, TWISTS, VILLAGES,
  type Gender, type L, type MonsterGroup, type Pair, type PlaceName, type PremiseTpl, type QuestTpl, type StageTpl,
} from '../data/regions';
import {
  SEED_LOCATIONS, SEED_NPCS, SEED_QUESTS, SETTING_NAME, SETTING_PREMISE, START_LOCATION,
  type GroupSpec, type RegionDef, type SeedLocation, type SeedNpc, type StageDef,
} from '../data/world';
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
const DE_ACC: Record<Gender, string> = { f: 'die', m: 'den', n: 'das', p: 'die' };
const DE_PREP: Record<'at' | 'under' | 'from' | 'in' | 'near' | 'to', Record<Gender, string>> = {
  at: { f: 'bei der', m: 'beim', n: 'beim', p: 'bei den' },
  under: { f: 'unter der', m: 'unter dem', n: 'unter dem', p: 'unter den' },
  from: { f: 'aus der', m: 'aus dem', n: 'aus dem', p: 'aus den' },
  in: { f: 'in der', m: 'im', n: 'im', p: 'in den' },
  near: { f: 'nahe der', m: 'nahe dem', n: 'nahe dem', p: 'nahe den' },
  to: { f: 'zur', m: 'zum', n: 'zum', p: 'zu den' },
};
const EN_PREP = { at: 'at', under: 'beneath', from: 'from', in: 'in', near: 'near', to: 'to' } as const;

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
/** The same, as the object of a German verb. English has no case. */
const accusative = (n: Named, lang: Lang) => (lang === 'de' ? `${DE_ACC[n.g]} ${n.name}` : withArticle(n, lang));

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
    innkeeper: `${innkeeper.first} ${innkeeper.surname}`, villager: `${villager.first} ${villager.surname}`, keeper: `${keeper.first} ${keeper.surname}`,
    region: regionName, regionIn, Region: upperFirst(regionName),
    site: withArticle(lairName, grammar),
    atSite: withPrep(lairName, 'at', grammar), underSite: withPrep(lairName, 'under', grammar),
    fromSite: withPrep(lairName, 'from', grammar), inSite: withPrep(lairName, 'in', grammar), nearSite: withPrep(lairName, 'near', grammar),
    sanctuary: withArticle(sanctuaryName, grammar), atSanctuary: withPrep(sanctuaryName, 'at', grammar), fromSanctuary: withPrep(sanctuaryName, 'from', grammar),
    minor: withArticle(minorName, grammar), minorAcc: accusative(minorName, grammar), atMinor: withPrep(minorName, 'at', grammar),
    fromMinor: withPrep(minorName, 'from', grammar), inMinor: withPrep(minorName, 'in', grammar), toMinor: withPrep(minorName, 'to', grammar),
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

  // Quests are rolled from their own stream, so they never move the map, the names or the people.
  const questRng = seedStream(seed, 'quests');
  const hook = pick(threat.hooks, questRng);
  const side = questRng() < 0.4 ? minor.quest : pick(ERRANDS.filter((e) => e.patron !== hook.patron), questRng);
  const twist = pick(TWISTS, questRng);
  // The places a quest points to, including the home of whoever asked, are on the map from the start.
  const home: Record<QuestTpl['patron'], QuestTpl['where'] | undefined> = { authority: undefined, innkeeper: undefined, villager: 'village', keeper: 'sanctuary' };
  const known = new Set([hook, side].flatMap((q) => [q.where, home[q.patron]]).filter(Boolean));
  const quest = (id: string, q: QuestTpl, reward: typeof QUEST_REWARD) => ({ id, title: say(q.title), summary: say(q.summary), ...reward });
  const patronName: Record<QuestTpl['patron'], string> = { authority: dm.authority, innkeeper: `${dm.innkeeper}, the innkeeper`, villager: `${dm.villager} of ${villageName}`, keeper: `${dm.keeper}, keeper of ${dm.sanctuary}` };
  const lead = (kind: string, q: QuestTpl) => `${kind} (quest "${say(q.title)}", asked by ${patronName[q.patron]}): ${fill(q.brief, dm)}`;

  const locations: SeedLocation[] = [
    { id: 'home', name: townName, kind: 'town', q: 0, r: 0, terrain: 'p', known: true, description: say(town.description), appearance: town.appearance, site: { dist: [0, 0], water: town.water } },
    { id: 'tavern', name: tavern, kind: 'tavern', q: 0, r: 0, parentId: 'home', known: true, description: say(TAVERN_TEXT.description), appearance: tavernLook },
    { id: 'lair', name: lairName.name, kind: 'dungeon', q: 0, r: 0, known: true, questId: 'main', description: say(lair.description), appearance: lair.appearance, site: threat.site, stages: stages(threat.stages, STAGE_LOOT) },
    { id: 'village', name: villageName, kind: 'village', q: 0, r: 0, terrain: 'p', ...(known.has('village') ? { known: true } : {}), description: say(village.description), appearance: village.appearance, site: village.site },
    { id: 'minor', name: minorName.name, kind: minor.kind, q: 0, r: 0, ...(known.has('minor') ? { known: true } : {}), ...(side === minor.quest ? { questId: 'side' } : {}), description: say(minor.description), appearance: minor.appearance, site: minor.site, stages: stages(minor.stages, MINOR_LOOT) },
    { id: 'sanctuary', name: sanctuaryName.name, kind: sanctuary.kind, q: 0, r: 0, ...(known.has('sanctuary') ? { known: true } : {}), description: say(sanctuary.description), appearance: sanctuary.appearance, site: sanctuary.site },
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

  const plot = [
    lead('Main quest', hook),
    lead('Side quest', side),
    'A quest can end without clearing every room: when its goal is met another way, mark it completed with update_quest.',
    `Hidden twist, which the party must uncover through play (hold it back with the secret tool until they earn it): ${fill(twist, dm)}`,
  ].join(' ');

  return {
    name: regionName, nameIn: regionIn, premise, plot, startId: 'home', tavernId: 'tavern', locations, npcs,
    quests: [quest('main', hook, QUEST_REWARD), quest('side', side, SIDE_REWARD)],
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

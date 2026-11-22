// The server's memory of what earlier tables used up: the names of the people and places the Dungeon
// Master invented, and the quests it told. It outlives the tables (deleting one, or emptying the bin,
// does not touch it), so a new story is nudged away from the old ones' names and shapes. It is a nudge
// only: the note is short, skips common fantasy words and fades with time.
import type { InternalState } from '../game/engine';

/** One table's contribution: what the Dungeon Master made up there. */
export interface LedgerEntry { npcs: string[]; places: string[]; quests: string[] }
export interface LedgerRow extends LedgerEntry { room: string; savedAt: number }

/** The part of the store the ledger needs. */
export interface LedgerStore {
  ledgerPut(room: string, savedAt: number, data: string): void;
  ledgerAll(): { room: string; savedAt: number; data: string }[];
  ledgerClear(): void;
}

/** How many of the latest tables are remembered, and for how long. */
export const LEDGER_TABLES = 20;
export const LEDGER_DAYS = 90;
/** How much of it goes into a prompt. */
const MAX_NPCS = 24, MAX_PLACES = 16, MAX_QUESTS = 10;

/** Everyday fantasy words that must never end up on an avoid list: "tavern" and "goblins" stay allowed. */
const COMMON = new Set(`the of a an and at in on to from by with for old new little great grand
tavern inn innkeeper keeper smith blacksmith shop shopkeeper merchant trader market guard guards captain watch sergeant
elder mayor priest priestess monk healer herbalist farmer miller baker butcher hunter ranger scout thief rogue bandit bandits
wizard mage witch sorcerer cultist cult knight lord lady king queen prince princess
village town city castle keep tower fort fortress temple shrine chapel crypt tomb ruins ruin cave caves cavern mine mines dungeon lair camp
forest wood woods grove hill hills mountain mountains valley river lake swamp marsh bridge road crossing ford well farm mill harbour harbor port
goblin goblins orc orcs kobold kobolds skeleton skeletons zombie zombies wolf wolves rat rats spider spiders dragon dragons bandit
gold silver iron stone ancient lost hidden forgotten dark black red white grey gray green blue golden silent broken sunken
quest rumour rumor mystery missing stolen`.split(/\s+/));

const words = (s: string) => s.toLowerCase().split(/[^a-zäöüéèàß']+/).filter(Boolean);
/** True when a name is just everyday words and so says nothing about the story it came from. */
export const isCommonName = (name: string) => words(name).every((w) => COMMON.has(w));

const clean = (xs: (string | undefined)[], max: number, skipCommon: boolean) => {
  const out: string[] = [];
  for (const raw of xs) {
    const n = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (n.length < 3 || n.length > 60 || out.includes(n)) continue;
    if (skipCommon && isCommonName(n)) continue;
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
};

/** What a table's Dungeon Master has invented so far. Campaign books bring their own names, so they add nothing. */
export function entryOf(s: InternalState): LedgerEntry | null {
  if (s.phase === 'lobby' || !s.memory || s.setting?.campaign) return null;
  return {
    npcs: clean(s.memory.npcs.filter((n) => n.origin === 'dm').map((n) => n.name), 40, true),
    places: clean((s.world?.locations ?? []).filter((l) => l.origin === 'dm').map((l) => l.name), 30, true),
    // 'main' and 'side' are the rolled opening quests, which come from varied templates already.
    quests: clean(s.memory.quests.filter((q) => q.id !== 'main' && q.id !== 'side').map((q) => q.title), 20, false),
  };
}

export class StoryLedger {
  private last = new Map<string, string>();

  constructor(private store: LedgerStore, private now: () => number = Date.now) {}

  /** Note what a table has made up. Cheap to call on every save: nothing is written when it did not change. */
  record(room: string, s: InternalState) {
    const entry = entryOf(s);
    if (!entry || (!entry.npcs.length && !entry.places.length && !entry.quests.length)) return;
    const data = JSON.stringify(entry);
    if (this.last.get(room) === data) return;
    this.last.set(room, data);
    this.store.ledgerPut(room, this.now(), data);
  }

  /** The tables that count, newest first: the last LEDGER_TABLES, none older than LEDGER_DAYS. */
  rows(except?: string): LedgerRow[] {
    const limit = this.now() - LEDGER_DAYS * 86_400_000;
    const out: LedgerRow[] = [];
    for (const r of this.store.ledgerAll().sort((a, b) => b.savedAt - a.savedAt)) {
      if (r.room === except || r.savedAt < limit) continue;
      try { out.push({ room: r.room, savedAt: r.savedAt, ...(JSON.parse(r.data) as LedgerEntry) }); } catch { /* a damaged row is ignored */ }
      if (out.length >= LEDGER_TABLES) break;
    }
    return out;
  }

  /** What the Innkeeper sees, and the note is made from: the remembered names, newest tables first. */
  summary(except?: string): { tables: number; npcs: string[]; places: string[]; quests: string[] } {
    const rows = this.rows(except);
    const pile = (pick: (r: LedgerRow) => string[], max: number) => clean(rows.flatMap(pick), max, false);
    return { tables: rows.length, npcs: pile((r) => r.npcs, MAX_NPCS), places: pile((r) => r.places, MAX_PLACES), quests: pile((r) => r.quests, MAX_QUESTS) };
  }

  /**
   * The note for a new table's Dungeon Master, or '' when there is nothing to say. It is fixed when the table
   * begins, so it never changes the part of the prompt that the cache serves.
   */
  note(except?: string): string {
    const m = this.summary(except);
    const lines: string[] = [];
    if (m.npcs.length) lines.push(`people: ${m.npcs.join(', ')}`);
    if (m.places.length) lines.push(`places: ${m.places.join(', ')}`);
    if (!lines.length && !m.quests.length) return '';
    return [
      'Fresh names, a nudge and not a rule: other tables of this server already used these, so when you invent someone or somewhere new, give it a different name and a different feel.',
      ...lines,
      m.quests.length ? `Quests already told elsewhere (give new ones another shape, patron and reason): ${m.quests.join('; ')}.` : '',
      'Everyday things stay allowed (taverns, goblins, a missing child). If a name or hook fits the story better than anything fresh, use it: the story comes first.',
    ].filter(Boolean).join('\n');
  }

  /** Forget everything, for the Innkeeper. */
  clear() {
    this.last.clear();
    this.store.ledgerClear();
  }
}

let ledger: StoryLedger | null = null;
export const setLedger = (l: StoryLedger | null) => { ledger = l; };
export const storyLedger = () => ledger;

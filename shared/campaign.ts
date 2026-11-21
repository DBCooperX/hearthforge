// Campaign books: published adventures a host brings to the table, as a PDF or a text file,
// which the Dungeon Master then runs. The server reads each book once into sections and a
// short digest; during play the Dungeon Master gets the digest every turn and reads the
// section the party is in, never the whole book.
import type { Lang } from './i18n';

type L = Record<Lang, string>;

/** Largest book the server takes. */
export const CAMPAIGN_MAX_BYTES = 64 * 1024 * 1024;
/** File types a book can come as. */
export const CAMPAIGN_TYPES = ['.pdf', '.txt', '.md'] as const;

/**
 * How a book from the list gets onto the server, following the house rule for third-party files:
 * nothing is hosted or mirrored by Hearthforge.
 * - click: a free PDF with a direct link. The host presses Download and the server fetches it from the source.
 * - manual: the source needs a sign-in, a checkout or a click through its own page. "Get it here" opens
 *   that page; the host downloads the file there and drops it onto the table room.
 */
export type CampaignAccess = 'click' | 'manual';

export interface CampaignSource {
  id: string;
  title: string;
  by: string;
  /** Character levels it is written for, as printed: "1", "1-3". */
  levels: string;
  /** How long it plays. */
  length: L;
  blurb: L;
  /** Licence or terms, in a few words. */
  terms: L;
  /** Rules it is written for. Books for other systems work; the Dungeon Master converts them. */
  system: '5e' | 'osr' | 'any';
  access: CampaignAccess;
  /** The page the book comes from: shown as "Get it here". */
  page: string;
  /** For click: the PDF itself, fetched by the server. */
  pdf?: string;
}

/**
 * Free adventures known to work well. Only links to their own sources: the files come from there.
 * Checked Nov 2026. Open-licence 5e adventures with a stable direct download turned out to be rare;
 * the open-licence entries here (One Page Dungeon Contest, Basic Fantasy) are written for older rules.
 */
export const CAMPAIGN_SOURCES: CampaignSource[] = [
  {
    id: 'peril-in-pinebrook', title: 'Peril in Pinebrook', by: 'Wizards of the Coast', levels: '1', system: '5e', access: 'click',
    length: { en: 'One evening', de: 'Ein Abend' },
    blurb: {
      en: 'A short, friendly first adventure: a snowed-in mountain village, a cave and a young white dragon. Made for new and young players.',
      de: 'Ein kurzes, freundliches erstes Abenteuer: ein eingeschneites Bergdorf, eine Höhle und ein junger weisser Drache. Gemacht für neue und junge Spieler.',
    },
    terms: { en: 'Free download from Wizards of the Coast', de: 'Gratis-Download von Wizards of the Coast' },
    page: 'https://www.dndbeyond.com/posts/1625-peril-in-pinebrook-a-free-introductory-adventure',
    pdf: 'https://media.wizards.com/2023/downloads/dnd/Peril_in_Pinebrook_COMPLETE.pdf',
  },
  {
    id: 'a-most-potent-brew', title: 'A Most Potent Brew', by: 'Winghorn Press', levels: '1', system: '5e', access: 'manual',
    length: { en: 'One evening', de: 'Ein Abend' },
    blurb: {
      en: 'A brewer\'s cellar has been overrun by giant rats, and something else lurks below. A classic first-level one-shot.',
      de: 'Der Keller einer Brauerei ist voller Riesenratten, und darunter lauert noch etwas anderes. Ein klassisches Einzelabenteuer für die 1. Stufe.',
    },
    terms: { en: 'Pay what you want on DMs Guild (sign-in)', de: 'Zahl, was du willst, auf DMs Guild (Anmeldung)' },
    page: 'https://adventurelookup.com/adventures/a-most-potent-brew',
  },
  {
    id: 'the-wild-sheep-chase', title: 'The Wild Sheep Chase', by: 'Winghorn Press', levels: '5', system: '5e', access: 'manual',
    length: { en: 'One evening', de: 'Ein Abend' },
    blurb: {
      en: 'A wizard turned into a sheep begs the heroes for help, with his apprentice and her hired muscle close behind. Silly, fast and loved.',
      de: 'Ein in ein Schaf verwandelter Zauberer fleht die Helden um Hilfe an, seine Schülerin und ihre Schläger dicht auf den Fersen. Albern, schnell und beliebt.',
    },
    terms: { en: 'Pay what you want on DMs Guild (sign-in)', de: 'Zahl, was du willst, auf DMs Guild (Anmeldung)' },
    page: 'https://adventurelookup.com/adventures/the-wild-sheep-chase',
  },
  {
    id: 'stormwreck-isle-intro', title: 'Intro to Stormwreck Isle', by: 'Wizards of the Coast', levels: '1', system: '5e', access: 'manual',
    length: { en: 'One or two evenings', de: 'Ein oder zwei Abende' },
    blurb: {
      en: 'The opening of the Starter Set: a sanctuary of dragons on a storm-lashed island. Read it on D&D Beyond and save it as a PDF or text file.',
      de: 'Der Auftakt des Einsteigersets: ein Drachenrefugium auf einer sturmumtosten Insel. Auf D&D Beyond lesen und als PDF oder Textdatei speichern.',
    },
    terms: { en: 'Free with a D&D Beyond account', de: 'Gratis mit einem D&D-Beyond-Konto' },
    page: 'https://www.dndbeyond.com/posts/1582-intro-to-stormwreck-isle-your-free-introduction-to',
  },
  {
    id: 'frozen-sick', title: 'Frozen Sick', by: 'Wizards of the Coast', levels: '1-3', system: '5e', access: 'manual',
    length: { en: 'A few evenings', de: 'Einige Abende' },
    blurb: {
      en: 'A strange frost sickness spreads through a northern town, and the trail leads into the ice. Read it on D&D Beyond and save it as a PDF or text file.',
      de: 'Eine seltsame Frostkrankheit breitet sich in einer Stadt im Norden aus, und die Spur führt ins Eis. Auf D&D Beyond lesen und als PDF oder Textdatei speichern.',
    },
    terms: { en: 'Free with a D&D Beyond account', de: 'Gratis mit einem D&D-Beyond-Konto' },
    page: 'https://www.dndbeyond.com/sources/dnd/wa/frozen-sick',
  },
  {
    id: 'one-page-dungeons', title: 'One Page Dungeon Contest', by: 'Many authors', levels: '1-10', system: 'any', access: 'manual',
    length: { en: 'One evening each', de: 'Je ein Abend' },
    blurb: {
      en: 'Hundreds of tiny dungeons, each on one page. Most are free to share under Creative Commons. Pick one you like and drop its PDF here.',
      de: 'Hunderte kleiner Dungeons auf je einer Seite. Die meisten stehen unter Creative Commons. Such dir einen aus und zieh sein PDF hierher.',
    },
    terms: { en: 'Mostly CC BY-SA, see each entry', de: 'Meist CC BY-SA, siehe jeden Beitrag' },
    page: 'https://itch.io/jam/one-page-dungeon-contest/entries',
  },
  {
    id: 'basic-fantasy', title: 'Basic Fantasy adventures', by: 'Basic Fantasy Project', levels: '1-6', system: 'osr', access: 'manual',
    length: { en: 'From one evening to a campaign', de: 'Von einem Abend bis zur Kampagne' },
    blurb: {
      en: 'A whole shelf of free old-school modules, such as Morgansfort. Written for older rules; the Dungeon Master converts the monsters as it plays.',
      de: 'Ein ganzes Regal freier Old-School-Module, etwa Morgansfort. Für ältere Regeln geschrieben; der Spielleiter rechnet die Monster beim Spielen um.',
    },
    terms: { en: 'Free; open licence (CC BY-SA / OGL)', de: 'Gratis; offene Lizenz (CC BY-SA / OGL)' },
    page: 'https://www.basicfantasy.org/downloads.html',
  },
];

export type CampaignStatus = 'reading' | 'ready' | 'failed';

/** A book on this server, as the browser sees it. */
export interface CampaignInfo {
  id: string;
  title: string;
  by: string;
  /** The file it came from. */
  file: string;
  pages: number;
  sections: number;
  status: CampaignStatus;
  /** While reading: how far, 0 to 1. */
  progress?: number;
  /** Why reading failed: a code the client turns into words. */
  error?: string;
  /** The entry of CAMPAIGN_SOURCES it came from, if any. */
  source?: string;
  /** Account that added it; empty for books everyone on the server may use. */
  owner: string;
  /** Levels and one line about it, from the digest once it is ready. */
  levels?: string;
  blurb?: string;
  addedAt: number;
}

/** What a table remembers of the book it plays. */
export interface CampaignPick {
  id: string;
  title: string;
}

export const CAMPAIGN_ERRORS = ['too_big', 'not_a_book', 'no_text', 'download_failed', 'not_found', 'forbidden', 'no_dm', 'failed', 'bad_request'] as const;

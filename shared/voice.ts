// The narrator: the Dungeon Master's story read aloud. The Innkeeper picks one voice for the
// whole server; each player only mutes it or sets its volume. The speech is made on the server,
// by Piper (free, runs on the server's own CPU) or by ElevenLabs (an API key, paid).
import type { Lang } from './i18n';

export const VOICE_PROVIDERS = ['piper', 'elevenlabs', 'off'] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<VoiceProvider, string> = {
  piper: 'Piper, on this server (free)',
  elevenlabs: 'ElevenLabs (API key, sounds the most natural)',
  off: 'No narrator',
};

/** A Piper voice. Voices are downloaded from Piper's own collection on Hugging Face, never mirrored. */
export interface PiperVoice {
  /** The file name without .onnx, as Piper names it, for example de_DE-thorsten-high. */
  id: string;
  lang: Lang;
  label: string;
  /** Approximate download size in MB. */
  mb: number;
}

export const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';

/** Where a Piper voice lives in Piper's collection: en/en_GB/alan/medium/en_GB-alan-medium. */
export function piperPath(id: string): string {
  const [locale, name, quality] = id.split('-');
  return `${locale.split('_')[0]}/${locale}/${name}/${quality}/${id}`;
}

/** The page that says who recorded a voice and under which licence. */
export const piperCard = (id: string) => `https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/${piperPath(id).replace(/\/[^/]+$/, '')}/MODEL_CARD`;

export const PIPER_VOICES: PiperVoice[] = [
  { id: 'en_GB-northern_english_male-medium', lang: 'en', label: 'Northern English man, calm storyteller', mb: 63 },
  { id: 'en_GB-alan-medium', lang: 'en', label: 'British man, clear', mb: 63 },
  { id: 'en_GB-cori-high', lang: 'en', label: 'British woman, warm', mb: 114 },
  { id: 'en_US-ryan-high', lang: 'en', label: 'American man, deep', mb: 121 },
  { id: 'en_US-lessac-high', lang: 'en', label: 'American woman, bright', mb: 114 },
  { id: 'de_DE-thorsten-high', lang: 'de', label: 'Thorsten, German man, clear', mb: 114 },
  { id: 'de_DE-kerstin-low', lang: 'de', label: 'Kerstin, German woman', mb: 63 },
  { id: 'de_DE-karlsson-low', lang: 'de', label: 'Karlsson, German man, deep', mb: 63 },
  { id: 'de_DE-ramona-low', lang: 'de', label: 'Ramona, German woman, soft', mb: 63 },
];

/** George, one of ElevenLabs' own voices: a warm British storyteller. */
export const ELEVENLABS_DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
/** Quality is Eleven v4 ($0.08 per 1000 characters); Cheaper is Eleven v4 Turbo, which costs half as much. Both speak German. */
export const VOICE_QUALITIES = ['quality', 'cheaper'] as const;
export type VoiceQuality = (typeof VOICE_QUALITIES)[number];
export const ELEVENLABS_MODELS: Record<VoiceQuality, string> = { quality: 'eleven_v4', cheaper: 'eleven_v4_turbo' };
/** What a character costs next to the Quality model. */
export const VOICE_QUALITY_FACTOR: Record<VoiceQuality, number> = { quality: 1, cheaper: 0.5 };

export interface VoiceChoice {
  provider: VoiceProvider;
  /** Piper speaks one language per voice, so there is one for each language of the story. */
  piper: Record<Lang, string>;
  /** ElevenLabs voices speak both languages. */
  elevenlabs: string;
  /** Which ElevenLabs model reads: the best, or the cheaper one. */
  quality: VoiceQuality;
  /** 0.8 is slower, 1.2 faster. */
  speed: number;
}

export const DEFAULT_VOICE: VoiceChoice = {
  provider: 'piper',
  piper: { en: 'en_GB-northern_english_male-medium', de: 'de_DE-thorsten-high' },
  elevenlabs: ELEVENLABS_DEFAULT_VOICE,
  quality: 'quality',
  speed: 1,
};

/** What every browser learns about the narrator. */
export interface VoiceManifest {
  /** A narrator is chosen and can speak in at least one language. */
  enabled: boolean;
  provider: VoiceProvider;
  /** The languages the narrator can read right now. */
  langs: Lang[];
}

export interface PiperVoiceState extends PiperVoice { installed: boolean; downloading: boolean; card: string }

/** What the Innkeeper sees. */
export interface VoiceLibrary {
  choice: VoiceChoice;
  /** The Piper program is in the image. */
  piperReady: boolean;
  piper: PiperVoiceState[];
  keys: { elevenlabs: boolean };
  /** The voices of the ElevenLabs account, when its key is set and the list could be read. */
  elevenlabsVoices: { id: string; name: string }[];
  /** Megabytes of speech kept on disk, so a story read once is not paid for twice. */
  cacheMb: number;
  /** The last thing that went wrong, for the Innkeeper. */
  error: string;
}

export const VOICE_ERRORS = {
  failed: 'That did not work. The server log says more.',
  forbidden: 'The narrator is set up in the Innkeeper, by the owner of this server.',
  no_key: 'This needs an API key first (Sound and voice → Switches and keys).',
  not_installed: 'This voice is not on the server yet. Download it first.',
  no_piper: 'Piper is not part of this server. Rebuild the image with the current Dockerfile.',
  bad_request: 'That did not work. The server log says more.',
} as const;

/** How the server splits a story entry into parts, so the first one is read while the next is still being made. */
export function speechParts(text: string, max = 320): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const flat = para.replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    // Whole sentences, gathered until a part is long enough.
    const sentences = flat.match(/[^.!?…]+(?:[.!?…]+["»«“”']?|$)\s*/g) ?? [flat];
    let cur = '';
    for (const s of sentences) {
      if (cur && (cur + s).length > max) { out.push(cur.trim()); cur = ''; }
      cur += s;
      while (cur.length > max * 1.6) {
        const cut = cur.lastIndexOf(' ', max) > 0 ? cur.lastIndexOf(' ', max) : max;
        out.push(cur.slice(0, cut).trim());
        cur = cur.slice(cut);
      }
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

/** Text as the narrator should say it: no markup, Swiss spelling kept. */
export function speakable(text: string): string {
  return text.replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim();
}

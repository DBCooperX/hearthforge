// Translations. English is the source language: the English text is the lookup key,
// so untranslated strings fall back to English instead of breaking.
import { DE } from './i18n-de';

export type Lang = 'en' | 'de';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
];
export const isLang = (x: unknown): x is Lang => x === 'en' || x === 'de';

const DICTS: Record<Lang, Record<string, string> | null> = { en: null, de: DE };

/** Translate `text`, filling `{name}` placeholders from `vars`. */
export function tr(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  const tpl = DICTS[lang]?.[text] ?? text;
  return vars ? tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : tpl;
}

/** The lookup key of a tagged template: its literal parts joined by `{0}`, `{1}`, … */
export const templateKey = (strings: readonly string[]) => strings.reduce((out, s, i) => `${out}{${i - 1}}${s}`);

/**
 * A template tag that translates the whole sentence and then fills in the values,
 * so a translation may reorder them: t`${who} hits ${whom}.` looks up "{0} hits {1}."
 */
export function tagged(lang: Lang) {
  return (strings: TemplateStringsArray, ...values: unknown[]): string => {
    const key = templateKey(strings);
    const tpl = DICTS[lang]?.[key] ?? key;
    return tpl.replace(/\{(\d+)\}/g, (_, i: string) => String(values[Number(i)]));
  };
}

/**
 * A class name for one hero. German has a feminine form of each class (Magierin, Kämpferin);
 * the dictionary lists it as "<Class> (female)". Other languages and genders use the plain name.
 */
export function classLabel(lang: Lang, className: string, gender?: string): string {
  const feminine = gender === 'female' ? DICTS[lang]?.[`${className} (female)`] : undefined;
  return feminine ?? tr(lang, className);
}

export const hasTranslation = (lang: Lang, key: string) => lang === 'en' || !!DICTS[lang]?.[key];

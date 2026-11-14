// Interface language. Each player picks their own and it is remembered in the browser;
// the language of the story itself belongs to the table and is chosen by the host.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LANGS, isLang, tr, type Lang } from '../../shared/i18n';

const KEY = 'hearthforge.lang';
const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

function stored(): Lang {
  try { const v = localStorage.getItem(KEY); if (isLang(v)) return v; } catch { /* private window */ }
  return 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(stored);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* not remembered, still applied */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

export type Translate = (text: string, vars?: Record<string, string | number>) => string;

/** Translates into the player's interface language; `{name}` placeholders are filled from the second argument. */
export function useT(): Translate {
  const { lang } = useContext(LangContext);
  return useCallback((text, vars) => tr(lang, text, vars), [lang]);
}

/** Interface language picker. */
export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <span className="langswitch" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.id} type="button" className={l.id === lang ? 'on' : ''} onClick={() => setLang(l.id)} title={l.label} aria-pressed={l.id === lang}>
          {l.id.toUpperCase()}
        </button>
      ))}
    </span>
  );
}

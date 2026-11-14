import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LangProvider } from './i18n';
import { loadArtPack } from './game/sprites';
import '@fontsource/alegreya/latin-400.css';
import '@fontsource/alegreya/latin-400-italic.css';
import '@fontsource/alegreya/latin-700.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-400-italic.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/grenze-gotisch/latin-600.css';
import './styles.css';
import './theme.css';
import './creator.css';

// Art packs are optional; never wait long for them.
void Promise.race([loadArtPack(), new Promise((r) => setTimeout(r, 4000))]).then(() => {
  createRoot(document.getElementById('root')!).render(<LangProvider><App /></LangProvider>);
});

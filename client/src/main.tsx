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
import '@fontsource/cinzel/latin-700.css';
import './styles.css';
import './creator.css';
import './table.css';
import './ui.css';
import './forge.css';
import './compact.css';
import './ooc.css';
import './hotbar.css';
import './fight.css';
import './zone.css';
import './test.css';
import './art.css';
import './voice.css';
import './menu.css';
import './adventure.css';
import './gamelook.css';
import './pictures.css';
import './ui/prefs';

// Art packs are optional; never wait long for them.
void Promise.race([loadArtPack(), new Promise((r) => setTimeout(r, 4000))]).then(() => {
  createRoot(document.getElementById('root')!).render(<LangProvider><App /></LangProvider>);
});

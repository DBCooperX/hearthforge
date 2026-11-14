import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LangProvider } from './i18n';
import { loadArtPack } from './game/sprites';
import './styles.css';

// Art packs are optional; never wait long for them.
void Promise.race([loadArtPack(), new Promise((r) => setTimeout(r, 4000))]).then(() => {
  createRoot(document.getElementById('root')!).render(<LangProvider><App /></LangProvider>);
});

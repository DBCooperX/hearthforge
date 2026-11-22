# Development

Back to the [README](../README.md).

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev        # server on :3000, Vite client on :5173 with hot reload
npm test           # rules engine tests, including seeded full playthroughs
npm run typecheck
npm run build && npm start
```

Layout:

- `shared/` types and content used by both sides. `shared/i18n.ts` and `shared/i18n-de.ts` hold the translations: English text is the key, and `server/test/i18n.test.ts` fails when something has no German.
- `server/src/game/` the rules engine (dice, movement, line of sight, combat, inventory) and `world.ts` for overworld generation. The engine is authoritative and synchronous.
- `server/src/dm/` the Dungeon Master: Claude integration, model tiers, scripted fallback.
- `server/src/data/` classes, monsters and the starting region. `shared/battlemap.ts`, `shared/heroLook.ts`, `shared/monsterLook.ts` and `shared/hex.ts` describe maps, looks and hex maths; `client/src/game/` draws them.
- `server/src/admin/` and `client/src/ui/Innkeeper.tsx` the Innkeeper; `shared/admin.ts` is its settings list; `updater/` is the updater container.
- `server/src/music.ts`, `server/src/artLibrary.ts`, `shared/music.ts`, `shared/art.ts` the asset sources and their access levels.
- `client/src/` the React UI. `theme.css` holds the colour tokens and `forge.css` the logo-specific rules.

Saves from before the open world cannot be converted: such a table keeps its players and starts a new adventure.

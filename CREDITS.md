# Credits

## Rules and monsters

This work includes material from the System Reference Document 5.1 ("SRD 5.1") and the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <https://dnd.wizards.com/resources/systems-reference-document> and <https://www.dndbeyond.com/srd>. Both are licensed under the Creative Commons Attribution 4.0 International License, available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

Which parts come from which: the equipment and the Dueling style (`shared/content.ts`, `server/src/data/`) follow the SRD 5.1. The 341 monster stat blocks (`server/src/data/srd/monsters.json`) follow the SRD 5.2.1; seven older ones without a 5.2.1 counterpart (goblin, orc, kobold, hobgoblin, gnoll, bugbear, wyrmling) keep their SRD 5.1 numbers. The class tables for levels 1 to 20 (`shared/srd/classes.json`: hit dice, proficiencies, which feature arrives at which level, the numbers that grow with level and the spell slots), the class features, Grappler and the epic boons follow the SRD 5.2.1. Species, backgrounds, origin feats and the other fighting styles (`shared/rules.ts`) follow the SRD 5.2.1. All descriptions, hints and German texts are written for Hearthforge in its own words, and nothing is taken from the Player's Handbook or any other book outside the SRD. The Spell Points mana bar and the Hearth's Blessing are house rules.

The 339 spells (`shared/srd/spells.json`, rules text in `server/src/data/srd/spell-rules.json`) and the 239 magic items (`shared/srd/magic-items.json`, rules text in `server/src/data/srd/magic-item-rules.json`) follow the SRD 5.2.1; the rules text is given to the Dungeon Master, and the game's own short descriptions and German texts (`shared/spellTable.ts`, `shared/magicItemTable.ts`) are written for Hearthforge. The class tables are converted by `scripts/srd/import-classes.mjs`, the monster data by `scripts/srd/import-monsters.mjs`, the spells by `scripts/srd/import-spells.mjs` and the magic items by `scripts/srd/import-magic-items.mjs` from the JSON edition of the SRD 5.2.1 in [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT License, see `server/src/data/srd/LICENSE-5e-database.md` and `shared/srd/LICENSE-5e-database.md`).

Hearthforge is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC.

## Art, sound effects and music

No third-party art or audio is bundled, downloaded or redistributed by Hearthforge.

- **Pixel art.** All sprites and tiles are original pixel art generated procedurally in `client/src/game/sprites.ts` and dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Icons.** Painted for your server by the picture service you set up (Gemini by default) from prompts in `shared/iconLibrary.ts`, and kept in your data folder. The list of what is painted (`shared/art.ts`, `shared/glyphs.ts`) names the pictures the game needs, in its own words.
- **Sound effects, ambient loops and music.** Made for your server with your own ElevenLabs key and kept in your data folder (`/data/library`). Check ElevenLabs' terms for what your plan allows you to do with the output; they forbid putting music into a library for third parties, which is why Hearthforge never ships or shares the files. Without a library sound, effects are synthesised in the browser by `client/src/sfxSynth.ts`, original code with no recordings.

Earlier versions could fetch Kevin MacLeod's music, OpenGameArt and Freesound loops, Kenney's tile and sound packs and the game-icons.net icons, and could take art packs from uploads. All of that is gone. Files from those sources that an older server still holds in `/data/music`, `/data/sfx` and `/data/art` are no longer used and can be deleted.

## Logo

The Hearthforge logo (`docs/hearthforge-logo.jpg`) was made by the project's owner. The lobby logo, the emblem, the top bar mark and the browser icon are cut from it.

The tavern table picture behind the lobby, the table room and the character creator (`client/src/assets/tavern*.webp` and `.jpg`, resized from the owner's original) is also the project's owner's own image.

The candlelit tavern table under the 2.5D battle board (`client/src/assets/battle-table.webp`, resized with faded edges from the owner's original) is the project's owner's own image as well.

## Fonts

Bundled through [Fontsource](https://fontsource.org), all under the [SIL Open Font License 1.1](https://openfontlicense.org): Alegreya and Alegreya Sans (Juan Pablo del Peral, Huerta Tipográfica), and Cinzel (Natanael Gama).

## Software

Built with [PixiJS](https://pixijs.com) (MIT), [React](https://react.dev) (MIT), [ws](https://github.com/websockets/ws) (MIT) and the [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (MIT).

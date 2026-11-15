# Credits

## Rules and monsters

This work includes material from the System Reference Document 5.1 ("SRD 5.1") and the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <https://dnd.wizards.com/resources/systems-reference-document> and <https://www.dndbeyond.com/srd>. Both are licensed under the Creative Commons Attribution 4.0 International License, available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

Which parts come from which: the equipment and the Dueling style (`shared/content.ts`, `server/src/data/`) follow the SRD 5.1. The 341 monster stat blocks (`server/src/data/srd/monsters.json`) follow the SRD 5.2.1; seven older ones without a 5.2.1 counterpart (goblin, orc, kobold, hobgoblin, gnoll, bugbear, wyrmling) keep their SRD 5.1 numbers. The class tables for levels 1 to 20 (`shared/srd/classes.json`: hit dice, proficiencies, which feature arrives at which level, the numbers that grow with level and the spell slots), the class features, Grappler and the epic boons follow the SRD 5.2.1. Species, backgrounds, origin feats and the other fighting styles (`shared/rules.ts`) follow the SRD 5.2.1. All descriptions, hints and German texts are written for Hearthforge in its own words, and nothing is taken from the Player's Handbook or any other book outside the SRD. The Spell Points mana bar and the Hearth's Blessing are house rules.

The 339 spells (`shared/srd/spells.json`, rules text in `server/src/data/srd/spell-rules.json`) and the 239 magic items (`shared/srd/magic-items.json`, rules text in `server/src/data/srd/magic-item-rules.json`) follow the SRD 5.2.1; the rules text is given to the Dungeon Master, and the game's own short descriptions and German texts (`shared/spellTable.ts`, `shared/magicItemTable.ts`) are written for Hearthforge. The class tables are converted by `scripts/srd/import-classes.mjs`, the monster data by `scripts/srd/import-monsters.mjs`, the spells by `scripts/srd/import-spells.mjs` and the magic items by `scripts/srd/import-magic-items.mjs` from the JSON edition of the SRD 5.2.1 in [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT License, see `server/src/data/srd/LICENSE-5e-database.md` and `shared/srd/LICENSE-5e-database.md`).

Hearthforge is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC.

## Art

All sprites and tiles are original pixel art generated procedurally in `client/src/game/sprites.ts` and dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No third-party art is bundled or redistributed in this repository or its Docker image. Packs are fetched by the server at the host's request, or uploaded by the host, and stay in the server's data folder. The game shows name, artist and license of the packs in use under Settings → Art & Assets.

Fetched by the server on request:

- Game-icons.net, item icons by Lorc, Delapouite, Sbed, Skoll, Willdabeast, Lucas, Faithtoken and other contributors, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/): <https://game-icons.net>. The server downloads about 100 icons from <https://github.com/game-icons/icons> and recolours them.
- Kenney, "Tiny Dungeon", CC0 1.0: <https://kenney.nl/assets/tiny-dungeon>

Recognised when uploaded, with the license as stated on the pack's page on 15 November 2026:

- 0x72, "DungeonTileset II", CC0 1.0: <https://0x72.itch.io/dungeontileset-ii>
- Alex's Assets, "16x16 RPG Item Pack", CC0 1.0: <https://alexs-assets.itch.io/16x16-rpg-item-pack>
- Kyrise, "Kyrise's Free 16x16 RPG Icon Pack", CC BY 4.0: <https://kyrise.itch.io/kyrises-free-16x16-rpg-icon-pack>
- Matt Firth (cheekyinkling), "Shikashi's Fantasy Icons Pack": free to use and remix with credit to "Matt Firth (cheekyinkling)" and "game-icons.net"; the page names no license and says nothing about passing the files on: <https://cheekyinkling.itch.io/shikashis-fantasy-icons-pack>
- Clockwork Raven, "Raven Fantasy Icons" (free version): may be used in projects but not distributed as a separate product; the author's comments and the page disagree on commercial use: <https://clockworkraven.itch.io/raven-fantasy-icons>

Kenney's page could not be read when this list was written; its CC0 license is taken from Kenney's listing on itch.io. For any other pack you upload, crediting it is up to you: the window has fields for artist, license and link.

Without an icon pack, item icons are emoji rendered by the player's system font.

## Music

No music is bundled. Unless `HEARTHFORGE_MUSIC=off`, the server downloads these tracks at runtime (they can be switched off, moved or removed in the Innkeeper's Assets page) from [incompetech.com](https://incompetech.com). All are by Kevin MacLeod and licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/):

- Tavern: "Thatched Villagers", "Master of the Feast", "Folk Round", "Fiddles McGinty", "Celtic Impulse", "Dragon and Toast", "Spazzmatica Polka"
- Town: "Minstrel Guild", "Village Consort", "Suonatore di Liuto", "Virtutes Instrumenti", "Mystery Bazaar", "Lord of the Land", "Winter Reflections", "Evening Melodrama", "Night in Venice"
- Overworld: "Heroic Age", "Moorland", "Skye Cuillin", "Eternal Hope", "Ice Flow", "Dreamer", "Heart of Nowhere", "Echoes of Time v2", "Hidden Past", "Atlantean Twilight", "Lightless Dawn"
- Dungeon: "Ossuary 6 - Air", "Ossuary 5 - Rest", "Dark Times", "The Dread", "The Descent", "Oppressive Gloom", "Gathering Darkness", "Ghost Story", "Disquiet", "Dark Walk", "Dark Fog", "Anguish", "Ancient Rite"
- Combat: "Five Armies", "Clash Defiant", "Crossing the Chasm", "Volatile Reaction", "Faster Does It", "Prelude and Action", "Impact Moderato", "Killers", "Unholy Knight", "Crusade - Heavy Industry"
- Boss fights: "Black Vortex", "Death and Axes", "Giant Wyrm", "Epic Unease", "The Complex", "Hall of the Mountain King", "Danse Macabre"

Ambient loops (under the music) are downloaded the same way, straight from [OpenGameArt](https://opengameart.org), and can be switched off or removed in the Innkeeper:

- "Fire loop" by qubodup, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- "Wind loop" by AntumDeluge, based on a recording by InspectorJ (Jonathan Shaw), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- "Cathedral in the forest" by congusbongus, [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

Deutsch: Umgebungsschleifen werden genauso direkt von OpenGameArt geladen (Feuer: qubodup, CC BY 3.0; Wind: AntumDeluge nach InspectorJ, CC BY 3.0; Kathedrale im Wald: congusbongus, CC0) und lassen sich im Innkeeper abschalten oder entfernen.

Loops you add yourself are credited in the game by whatever title, artist and license you give them.

The game shows title, artist and license of the track that is playing. For tracks you add yourself, crediting them is up to you.

## Logo

The Hearthforge logo (`docs/hearthforge-logo.jpg`) was made by the project's owner. The lobby logo, the emblem, the top bar mark and the browser icon are cut from it.

## Fonts

Bundled through [Fontsource](https://fontsource.org), all under the [SIL Open Font License 1.1](https://openfontlicense.org): Alegreya and Alegreya Sans (Juan Pablo del Peral, Huerta Tipográfica), and Cinzel (Natanael Gama).

## Software

Built with [PixiJS](https://pixijs.com) (MIT), [React](https://react.dev) (MIT), [ws](https://github.com/websockets/ws) (MIT) and the [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (MIT).

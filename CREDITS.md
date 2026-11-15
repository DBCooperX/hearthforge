# Credits

## Rules and monsters

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at <https://dnd.wizards.com/resources/systems-reference-document>. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

This work also includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <https://www.dndbeyond.com/srd>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

Classes, spells, equipment and monster statistics in `shared/content.ts` and `server/src/data/` are adapted from the SRD 5.1. Species, backgrounds, origin feats and most fighting styles in `shared/rules.ts` are adapted from the SRD 5.2.1; the Dueling style and the subclasses follow the SRD 5.1. All descriptions, hints and German texts are written for Hearthforge in its own words. Nothing is taken from the Player's Handbook or any other book outside the SRD. The Spell Points mana bar and the Hearth's Blessing are house rules.

Hearthforge is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC.

## Art

All sprites and tiles are original pixel art generated procedurally in `client/src/game/sprites.ts` and dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No third-party art is bundled.

No third-party art is bundled or redistributed in this repository or its Docker image. Packs are fetched by the server at the host's request, or uploaded by the host, and stay in the server's data folder. The game shows name, artist and license of the packs in use under Settings → Art & Assets.

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

No music is bundled. Unless `HEARTHFORGE_MUSIC=off`, the server downloads these tracks at runtime from [incompetech.com](https://incompetech.com). All are by Kevin MacLeod and licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/):

- Tavern: "Thatched Villagers", "Master of the Feast", "Folk Round", "Fiddles McGinty", "Celtic Impulse", "Dragon and Toast", "Spazzmatica Polka"
- Town: "Minstrel Guild", "Village Consort", "Suonatore di Liuto", "Virtutes Instrumenti", "Mystery Bazaar", "Lord of the Land", "Winter Reflections", "Evening Melodrama", "Night in Venice"
- Overworld: "Heroic Age", "Moorland", "Skye Cuillin", "Eternal Hope", "Ice Flow", "Dreamer", "Heart of Nowhere", "Echoes of Time v2", "Hidden Past", "Atlantean Twilight", "Lightless Dawn"
- Dungeon: "Ossuary 6 - Air", "Ossuary 5 - Rest", "Dark Times", "The Dread", "The Descent", "Oppressive Gloom", "Gathering Darkness", "Ghost Story", "Disquiet", "Dark Walk", "Dark Fog", "Anguish", "Ancient Rite"
- Combat: "Five Armies", "Clash Defiant", "Crossing the Chasm", "Volatile Reaction", "Faster Does It", "Prelude and Action", "Impact Moderato", "Killers", "Unholy Knight", "Crusade - Heavy Industry"
- Boss fights: "Black Vortex", "Death and Axes", "Giant Wyrm", "Epic Unease", "The Complex", "Hall of the Mountain King", "Danse Macabre"

The game shows title, artist and license of the track that is playing. If you add your own tracks or a `tracks.json`, crediting them is up to you.

## Fonts

Bundled through [Fontsource](https://fontsource.org), all under the [SIL Open Font License 1.1](https://openfontlicense.org): Alegreya and Alegreya Sans (Juan Pablo del Peral, Huerta Tipográfica), Cinzel (Natanael Gama) and Grenze Gotisch (Omnibus-Type).

## Software

Built with [PixiJS](https://pixijs.com) (MIT), [React](https://react.dev) (MIT), [ws](https://github.com/websockets/ws) (MIT) and the [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (MIT).

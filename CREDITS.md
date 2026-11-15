# Credits

## Rules and monsters

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at <https://dnd.wizards.com/resources/systems-reference-document>. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

This work also includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <https://www.dndbeyond.com/srd>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

Classes, spells, equipment and monster statistics in `shared/content.ts` and `server/src/data/` are adapted from the SRD 5.1. Species, backgrounds, origin feats and most fighting styles in `shared/rules.ts` are adapted from the SRD 5.2.1; the Dueling style and the subclasses follow the SRD 5.1. All descriptions, hints and German texts are written for Hearthforge in its own words. Nothing is taken from the Player's Handbook or any other book outside the SRD. The Spell Points mana bar and the Hearth's Blessing are house rules.

Hearthforge is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC.

## Art

All sprites and tiles are original pixel art generated procedurally in `client/src/game/sprites.ts` and dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No third-party art is bundled.

The tiles are 16×16 pixels, the same size as two CC0 packs that can optionally be downloaded at runtime (see "Art packs" in the README). They are not redistributed in this repository:

- Kenney, "Tiny Dungeon": <https://kenney.nl/assets/tiny-dungeon>
- 0x72, "DungeonTileset II": <https://0x72.itch.io/dungeontileset-ii>

Item icons are emoji rendered by the player's system font.

## Music

No music is bundled. Unless `HEARTHFORGE_MUSIC=off`, the server downloads these tracks at runtime from [incompetech.com](https://incompetech.com). All are by Kevin MacLeod and licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/):

- Tavern: "Thatched Villagers", "Master of the Feast", "Folk Round"
- Town: "Minstrel Guild", "Village Consort", "Suonatore di Liuto"
- Overworld: "Heroic Age", "Moorland", "Skye Cuillin"
- Dungeon: "Ossuary 6 - Air", "Dark Times", "The Dread"
- Combat: "Five Armies", "Clash Defiant", "Crossing the Chasm"
- Boss fights: "Black Vortex", "Death and Axes"

The game shows title, artist and license of the track that is playing. If you add your own tracks or a `tracks.json`, crediting them is up to you.

## Fonts

Bundled through [Fontsource](https://fontsource.org), all under the [SIL Open Font License 1.1](https://openfontlicense.org): Alegreya and Alegreya Sans (Juan Pablo del Peral, Huerta Tipográfica), Cinzel (Natanael Gama) and Grenze Gotisch (Omnibus-Type).

## Software

Built with [PixiJS](https://pixijs.com) (MIT), [React](https://react.dev) (MIT), [ws](https://github.com/websockets/ws) (MIT) and the [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (MIT).

# Sounds, music and icons

Back to the [README](../README.md).

Hearthforge bundles no third-party art or audio, and it downloads none. Everything you see as an icon and hear as music, an ambient loop or an effect is made by your own server, with your own keys, and kept in your data folder. Nothing is shared with other servers.

| What | Made with | Where |
| --- | --- | --- |
| Effects, ambient loops (ElevenLabs Sound Effects) and music (Eleven Music) | `ELEVENLABS_API_KEY` | Innkeeper → **Sound and voice → Library**, files in `/data/library` |
| Icons for items, skills, feats, spells and class features | The picture service under **Art → Illustrations** (Gemini by default) | Innkeeper → **Art → Icons**, sheets in `/data/icons` |
| Map tiles and figures | Drawn by the browser from the game itself (`client/src/game/sprites.ts`, CC0) | nothing to set up |

Without an ElevenLabs key the game is silent except for the effects the browser makes itself; without painted icons items show emoji. Both fill up as you make things.

## Sounds and music

- **Starter set.** The Library page can make a starter set in one go: about 124 effects (every game moment, plus doors, chests, beasts, bells), 30 ambient loops and 32 music tracks for every scene. It shows the price (about $14 at ElevenLabs' list prices) before anything is made, and does effects first.
- **Your own sounds.** Describe a track, a loop or an effect and the server makes it in the background. You can rename it, move it to another scene or game moment, switch it off, make a new take or delete it. If ElevenLabs refuses (music on an account without the right plan, say), the reason is shown on the sound.
- **The Dungeon Master.** The Dungeon Master can look through the library for a mood a scene needs (a misty harbour at night, a funeral, a chase) and put a sound on for the whole table. When nothing fits it can order a new one, which plays the closest match until it is ready and stays in the library for every table. The table pays for these like it pays for pictures; **Sound and voice → Switches and keys** has an optional daily cap per table (`HEARTHFORGE_DM_SOUND_ORDERS`, default no limit).
- **Costs.** ElevenLabs' list prices are booked as a *Sounds* line in Costs and credits.

## Icons

**Art → Icons** lists the 411 pictures the game can show. *Paint missing icons* paints them four to a sheet in one look (about 103 sheets, roughly $7 at Gemini's list price; the button shows the price first). Open any icon to ask for four new takes, optionally with a hint such as "made of bone", and pick the one you like. Switch an icon off to show the emoji again.

## Backups

- The daily backup under **Server → Backups** keeps the list of sounds and icons (titles, scenes, moments, which take is in use) next to the tables. The audio and the icon sheets stay in `/data/library` and `/data/icons`, which are part of the data volume: back that volume up, or use the zips below.
- **Download** in the Library and Icons pages saves the sounds (by kind or everything) and the icon sheets as zips with a `library.json` / `icons.json` that names every file.
- **Restore from a zip** on the same pages puts a downloaded zip back: sounds and icons that are already there are skipped, the rest comes back with its titles and choices. Restoring a backup from the Backups page brings back the lists whose files are still in the folders.

Browsers only allow sound after the first click, so music starts when a player first touches the page. A scene with no track is silent, and a failed take never breaks the game.

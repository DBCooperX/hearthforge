# Art and music

Back to the [README](../README.md).

Hearthforge bundles no third-party art or audio, and it never hosts or mirrors anything. Out of the box it draws its own 16×16 pixel art and shows items as emoji. Everything else goes from the artist's site to your server, and how depends on what the source allows:

| Source type | What happens |
| --- | --- |
| **Free license** (CC0, CC BY) | The server downloads it by itself: Kevin MacLeod's 50 music tracks (CC BY 4.0) and the game-icons.net icons for items, skills, feats, spells and class features (CC BY 3.0). Switch off with `HEARTHFORGE_MUSIC=off` or `HEARTHFORGE_AUTO_ASSETS=off`. |
| **Direct download allowed** | The owner presses **Download** in the Innkeeper, or pastes a direct link, and the server fetches it from the source (for example OpenGameArt). |
| **Login, Patreon or terms that forbid it** | The Innkeeper shows a **Get it here** link; download the file yourself and drag it onto the page (Kenney, itch.io, Freesound, Sonniss, Pixabay). Kenney's site answers automated downloads with "forbidden", so its tile pack (Tiny Dungeon) and sound packs are added the same way. |

In the Innkeeper's **Assets** page, with the tabs **Music**, **Ambient** and **Art**:

- **Music.** Every track can be played, switched off, moved to another scene (tavern, town, overworld, dungeon, combat, boss) or removed. Tracks that failed to download get a button to try again. Drop audio files or a zip onto the page, or paste a link. Files are kept in `/data/music`.
- **Ambient sound.** Quiet loops (crowd, fire, wind, rain) under the music with their own volume slider. A few free OpenGameArt loops (fire, wind, dark pad) download automatically; for the rest, paste a free Freesound API key under Settings → Playing and the server fetches CC0 crowd, town, forest and cave loops by itself (or add your own).
- **Art.** Drop a zip from itch.io, Kenney or OpenGameArt. PNG images are kept, packs are recognised by name or contents, and item icons are matched by file name, with **Assign icons** for the rest. Players see what is in use, with credits, under **Settings → Art & Assets**.

Licenses differ: CC0 needs nothing, CC BY needs a credit (the game shows title, artist and license of the playing track and the art packs in use), and a few free packs may be used but not passed on. [CREDITS.md](../CREDITS.md) lists what was checked. The Kenney and 0x72 tile mappings are experimental, since the packs could not be downloaded where this was built. To correct a Kenney tile, write numbers into `kenney-map.json`:

```bash
docker compose exec hearthforge sh -c 'echo "{\"goblin\": 111, \"fighter\": 96}" > /data/art/kenney-map.json'
```

Browsers only allow sound after the first click, so music starts when a player first touches the page. A scene with no track is silent, and a failed download never breaks the game.

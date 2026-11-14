# Hearthforge

A self-hosted Dungeons & Dragons 5e game for your browser, run by an AI Dungeon Master.

Hearthforge runs as a single Docker container on your own server. You and your friends open it in a browser, build a party, and set out into an open world: a hex map to travel, a story told in scene cards, and a tactical grid that appears only when a fight breaks out. The server owns the rules and rolls every die; Claude narrates the adventure and plays the monsters.

## What's in the game

- **Party panel** on the left: portrait, HP and mana bars, armor class and conditions for every hero.
- **Inventory overlay** (press `i`): paper-doll equipment slots, a 20-slot backpack, shared party gold, drag-and-drop, double-click to equip or drink, and drop an item on another hero to hand it over. Armor class updates as you change gear. Things the Dungeon Master invents during play (a clue, a letter, a strange key) land in the backpack too, with a fitting icon, a quest marker and their story notes; click an item to read them.
- **Open world**: a hex overworld (6 miles per hex) that you travel freely. Pick any hex to see distance, travel time, terrain and the chance of an encounter, then set out. Explored country stays on the map, and the Dungeon Master can add new places as the story finds them.
- **Story first**: narration arrives as short scene cards with a location header and a mood colour. Each scene suggests a few actions as buttons, and you can always type anything instead. Names of people, places and items are highlighted, with details on hover. Dice roll inline with the full breakdown (d20 + modifier vs AC or DC).
- **A world that remembers**: people you met, quests, deeds and places are saved with the game and given to the Dungeon Master every turn. Press `j` for the journal.
- **Progression**: XP from fights and quests, levels 1 to 5 with a level-up summary, and a full character sheet (press `c`).
- **Turn-based 5e combat** on a battle map that is generated for each fight: initiative, movement, attack rolls against AC, advantage and disadvantage, critical hits, saving throws, Sneak Attack, cantrips and 1st-level spells, potions, death saves, and short rests.
- **AI Dungeon Master**: narrates, plays every character you meet, chooses what each monster does, calls for skill checks, starts fights, hands out rewards and keeps the journal. It picks a cheaper or stronger Claude model depending on the moment (see [Configuration](#configuration)). Without an API key a scripted fallback runs travel, fights, rests and dungeons, but cannot improvise.
- **English and German**: every player picks their own interface language (EN / DE in the top bar, remembered in the browser). Whoever opens a table chooses the story language on the party screen, and the game log, the starting region and the Dungeon Master's narration follow it. German uses the terms of the official German D&D edition (Rettungswurf, Rüstungsklasse, Trefferpunkte).
- **A seat at the tavern**: dark wood, parchment scene cards, brass and candlelight, with bundled book fonts. Nothing is loaded from the internet by the browser.
- **Background music** that follows the story: tavern, town, the open road, dungeons, fights and boss fights each have their own tracks and crossfade into each other. Every player has a mute button and a volume slider in the top bar, remembered in their browser. See [Music](#music).
- **Solo or multiplayer**: one player can run up to four heroes, or friends can join the same table and each bring their own. Games are saved in SQLite and survive restarts.

Four heroes are available: Fighter, Rogue, Wizard and Cleric. The starting region, the Emberfall Vale, has a town, a village, a shrine, a ruin and the goblin warren under the old Hearthforge smithy.

## Install on Proxmox

### One command

On the Proxmox host, as root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/DBCooperX/hearthforge/main/scripts/proxmox-install.sh)"
```

The script creates an unprivileged Debian 12 LXC named `hearthforge` (nesting and keyctl enabled for Docker), installs Docker, clones this repository to `/opt/hearthforge`, asks for your Anthropic API key, writes `.env`, and runs `docker compose up -d --build`. When it finishes it prints the address to open.

**Run the same command again to update.** It finds the existing container, pulls the latest code and rebuilds.

Defaults are 2 cores, 2 GB RAM, 8 GB disk, DHCP on `vmbr0`, the next free container id and your `local-lvm` or `local-zfs` storage. Override any of them by setting variables first:

```bash
CTID=120 STORAGE=tank MEMORY=4096 IP=192.168.1.50/24 GATEWAY=192.168.1.1 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/DBCooperX/hearthforge/main/scripts/proxmox-install.sh)"
```

| Variable | Default | |
| --- | --- | --- |
| `CTID` | next free id | Container id |
| `HOSTNAME_CT` | `hearthforge` | Container name, also how a re-run finds it |
| `STORAGE` | auto | Storage for the root disk |
| `TEMPLATE_STORAGE` | `local` | Storage holding container templates |
| `BRIDGE`, `IP`, `GATEWAY` | `vmbr0`, `dhcp`, none | Networking |
| `CORES`, `MEMORY`, `SWAP`, `DISK` | `2`, `2048`, `512`, `8` | Resources (MB and GB) |
| `PORT` | `3000` | Port Hearthforge is published on |
| `ANTHROPIC_API_KEY` | prompt | Set it to skip the prompt |
| `BRANCH` | `main` | Git branch to install |

As with any script piped from the internet, read [`scripts/proxmox-install.sh`](scripts/proxmox-install.sh) first if you like; it is short.

### By hand

You need a Debian 12 (or Ubuntu) guest with Docker. Either works:

- **LXC container**: create an unprivileged Debian 12 container with 2 cores, 2 GB RAM and 8 GB disk. Under *Options → Features*, enable **nesting** and **keyctl**, which Docker needs.
- **VM**: any small Debian 12 VM. No special settings.

Then, inside the guest:

```bash
# 1. Install Docker and git
apt update && apt install -y git curl
curl -fsSL https://get.docker.com | sh

# 2. Get Hearthforge
git clone https://github.com/DBCooperX/hearthforge.git /opt/hearthforge
cd /opt/hearthforge

# 3. Configure
cp .env.example .env
nano .env        # paste your ANTHROPIC_API_KEY

# 4. Build and start
docker compose up -d --build
```

Open `http://<guest-ip>:3000` in a browser. Friends on your network use the same address and the same table name.

### Updating

Re-run the one-command installer, or inside the guest:

```bash
cd /opt/hearthforge
git pull
docker compose up -d --build
```

Saved games live in the `hearthforge-data` Docker volume and are kept across updates. `docker compose logs -f` shows the server log, including whether the AI Dungeon Master is active.

### Configuration

Set these in `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | empty | Your key from [platform.claude.com](https://platform.claude.com). Empty means the scripted fallback DM. |
| `HEARTHFORGE_DM_MODEL_BACKGROUND` | `claude-haiku-5-5` | Model for background work: memory summaries and routine beats such as short journeys and rests. |
| `HEARTHFORGE_DM_MODEL_STANDARD` | `claude-sonnet-5-5` | Model for everyday narration, conversation and monster turns. |
| `HEARTHFORGE_DM_MODEL_KEY` | `claude-opus-5-5` | Model for key moments: the opening scene, first arrival at a major place, boss fights, level-ups, defeats, and turns the DM flagged as a turning point. |
| `HEARTHFORGE_DM_FORCE_MODEL` | empty | Set to a model id to run everything on that one model and switch the automatic choice off. |
| `HEARTHFORGE_DM_EFFORT` | `low` | How hard the DM thinks per beat: `low`, `medium` or `high`. Higher is slower and costs more. |
| `HEARTHFORGE_ART` | `generated` | `generated`, `kenney` or `0x72`. See [Art packs](#art-packs). |
| `HEARTHFORGE_MUSIC` | `on` | `on` or `off`. See [Music](#music). |
| `HEARTHFORGE_PORT` | `3000` | Port on the host. |

The server decides the tier from what just happened in the game, and the DM can mark a scene as a turning point so the next reply is escalated. Every call is logged as `[dm] <purpose>: tier=<tier> model=<model>`, so `docker compose logs` shows what was used. The older `HEARTHFORGE_DM_MODEL` setting is no longer read; use `HEARTHFORGE_DM_FORCE_MODEL` if you want a single model. The DM makes roughly one API call per story beat and two per round of monster turns. With an Opus-class or Fable-class model, a declined request falls back to another Claude model automatically.

Hearthforge has no login. Anyone who can reach the port can join a table, so keep it on your LAN or behind a VPN or an authenticating reverse proxy. If you put it behind a reverse proxy, forward WebSocket upgrades for `/ws`.

## Art packs

Out of the box Hearthforge draws its own 16×16 pixel art, so it needs no downloads. You can switch to a CC0 art pack by setting `HEARTHFORGE_ART` in `.env` and restarting (`docker compose up -d`). The server fetches the pack on start into the data volume (`/data/art`), and anything it cannot get or map keeps the built-in sprite, so a failed download never breaks the game.

This is **experimental**: the packs could not be downloaded in the environment this was built in, so the pack-to-sprite mappings have not been checked against the real images.

**Kenney Tiny Dungeon** (`HEARTHFORGE_ART=kenney`): downloaded automatically from [kenney.nl](https://kenney.nl/assets/tiny-dungeon). If a hero shows up as the wrong tile, correct it without rebuilding by writing tile numbers into `kenney-map.json` in the art folder:

```bash
docker compose exec hearthforge sh -c 'echo "{\"goblin\": 111, \"fighter\": 96}" > /data/art/kenney-map.json'
```

Sprite names are `fighter`, `rogue`, `wizard`, `cleric`, `goblin`, `skeleton`, `bugbear`, `rat`, `wolf`, `bandit`, `orc`, `zombie`, `floor0`–`floor3` and `wall0`–`wall2`. The numbers are the `tile_NNNN.png` files in the pack.

**0x72 DungeonTileset II** (`HEARTHFORGE_ART=0x72`): itch.io has no direct download link, so download the zip from [0x72.itch.io](https://0x72.itch.io/dungeontileset-ii) (free, name your own price) and copy it in:

```bash
docker compose exec hearthforge mkdir -p /data/art
docker cp 0x72_DungeonTilesetII_v1.7.zip hearthforge:/data/art/
docker compose restart
```

Sprites are matched by the names in the pack's own tile list, so this one does not depend on guessed numbers.

## Music

Hearthforge ships no audio. On start the server downloads a small set of tracks by Kevin MacLeod ([incompetech.com](https://incompetech.com), CC BY 4.0, 17 tracks, roughly 100 MB) into the data volume (`/data/music`, one folder per kind of scene: `tavern`, `town`, `overworld`, `dungeon`, `combat`, `boss`). Downloads run in the background, tracks appear in the game as they arrive, and missing ones are tried again on the next start. A scene with no track is simply silent, so a failed download never breaks the game. Set `HEARTHFORGE_MUSIC=off` to skip all of this.

This is **untested against the real site**: incompetech.com could not be reached from the environment this was built in, so the track titles and links were written from memory. `docker compose logs` lists every track that could not be fetched. Playback, crossfading and the switch between scenes were tested with generated test tones.

**Your own music**: copy audio files (`.mp3`, `.ogg`, `.opus`, `.m4a`, `.wav`, `.flac`) into the folder of the scene they fit. No restart is needed; players hear them after reloading the page:

```bash
docker compose exec hearthforge mkdir -p /data/music/tavern
docker cp my-tavern-song.mp3 hearthforge:/data/music/tavern/
```

**A different download list**: write `/data/music/tracks.json` and restart. It replaces the built-in list:

```json
[{ "context": "tavern", "title": "Song name", "artist": "Who made it", "license": "CC BY 4.0", "url": "https://example.org/song.mp3" }]
```

Title, artist and license are shown in the game when a player points at the music control, which is the attribution CC BY asks for. Browsers only allow sound after the first click or key press, so the music starts when a player first touches the page. If a context has no tracks, the nearest one is used instead: boss fights fall back to combat music, taverns to town music, the road to town music.

## How to play

1. Enter your name and a table name. Everyone who enters the same table name shares one adventure.
2. Add heroes. Playing alone? Add up to four and control them all.
3. Read the scene, then click a suggested action or type what you do. The panel on the right shows where you are, who is here, the map and your quests.
4. To travel, click a hex on the map (press `m` for the big one), check the journey and press **Set out**. Places inside a town, such as the tavern, are listed under *Here*, and dungeons are entered with **Delve**.
5. When a fight starts, the battle map appears and initiative is rolled. On your hero's turn you get 30 ft of movement and one action: click an enemy to attack, or pick a spell or ability from the action bar. `Space` ends the turn.
6. Short rests take an hour, long rests eight. Camping in the wild can be interrupted; towns, taverns and shrines are safe. If the whole party goes down, survivors are dragged back to the last safe place, lighter in the purse.

| Key | Action |
| --- | --- |
| `i` | Inventory |
| `c` | Character sheet |
| `m` | Full map |
| `j` | Journal |
| `WASD`, arrows | Move the active hero in a fight |
| `1`–`9` | Action bar buttons |
| `Space` | End turn |
| `Esc` | Cancel targeting, close an overlay, clear the planned journey |

### House rules

The rules follow the 5e SRD with a few simplifications:

- Mana is the Spell Points variant: casters have 4, 6, 8, 10 and 14 points at levels 1 to 5.
- Levels stop at 5 for now. Hit points on level-up use the fixed average.
- Parties smaller than four get the Hearth's Blessing (+4 max HP per missing hero) and face fewer monsters.
- Heroes left unconscious when a fight is won get back up with 1 HP.
- A long rest is allowed once every 16 hours.
- No opportunity attacks, ammunition tracking, attunement or encumbrance yet.

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev        # server on :3000, Vite client on :5173 with hot reload
npm test           # rules engine tests, including seeded full playthroughs
npm run typecheck
npm run build && npm start
```

Layout:

- `shared/` types and content (items, abilities) used by both sides
- `shared/i18n.ts` and `shared/i18n-de.ts` translations. English text is the lookup key, so a missing entry falls back to English, and `server/test/i18n.test.ts` fails when the interface or a game term has no German
- `server/src/game/` the rules engine: dice, movement, line of sight, combat, inventory
- `server/src/game/world.ts` overworld generation, exploration and battle arenas; `shared/hex.ts` hex maths and the route planner
- `server/src/dm/` the Dungeon Master: Claude integration, model tiers and the scripted fallback
- `server/src/data/` classes, monsters and the starting region
- `client/src/` React UI, the SVG hex map and the PixiJS battle map
- `client/src/theme.css` the tavern look; `client/src/music.tsx` the music player; `shared/music.ts` decides which kind of music fits the game state; `server/src/music.ts` fetches and lists tracks

Saves from before the open world cannot be converted: such a table keeps its players and starts a new adventure.

The data model already has the hooks for what comes next: every place has a `zone` slot for generated town and tavern maps, and every character, person and place carries a `visual` record (a fixed appearance description plus an image id) so generated pictures can stay consistent.

The engine is authoritative and synchronous. The DM never changes state directly: it picks monster intents through a tool call, the engine resolves them with real dice, and the DM narrates the result.

## Credits and licenses

See [CREDITS.md](CREDITS.md). Rules content comes from the D&D 5e System Reference Document 5.1 (CC BY 4.0). The pixel art is original, generated in code, and dedicated to the public domain (CC0). Music is downloaded at runtime, not bundled, and is CC BY 4.0. The fonts are under the SIL Open Font License.

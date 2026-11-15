# Hearthforge

A self-hosted Dungeons & Dragons 5e game for your browser, run by an AI Dungeon Master.

Hearthforge runs as a single Docker container on your own server. You and your friends open it in a browser, build a party, and set out into an open world: a hex map to travel, a story told in scene cards, and a tactical grid that appears only when a fight breaks out. The server owns the rules and rolls every die; Claude narrates the adventure and plays the monsters.

## What's in the game

- **Party panel** on the left: portrait, HP and mana bars, armor class and conditions for every hero.
- **Inventory overlay** (press `i`): paper-doll equipment slots, a 20-slot backpack, shared party gold, drag-and-drop, double-click to equip or drink, and drop an item on another hero to hand it over. Armor class updates as you change gear. Things the Dungeon Master invents during play (a clue, a letter, a strange key) land in the backpack too, with a fitting icon, a quest marker and their story notes; click an item to read them. Hovering an item shows its numbers and how it compares with what the hero wears; the backpack can be filtered and sorted, and the footer shows carried weight (display only).
- **Open world**: a hex overworld (6 miles per hex) that you travel freely. Pick any hex to see distance, travel time, terrain and the chance of an encounter, then set out. Explored country stays on the map, and the Dungeon Master can add new places as the story finds them.
- **Story first**: narration arrives as short scene cards with a location header and a mood colour. Each scene suggests a few actions as buttons, and you can always type anything instead. Names of people, places and items are highlighted, with details on hover. Dice roll inline with the full breakdown (d20 + modifier vs AC or DC).
- **A world that remembers**: people you met, quests, deeds and places are saved with the game and given to the Dungeon Master every turn. Press `j` for the journal, a book with chapters for quests, people, places and lore. The gear in the top bar opens the settings: language, music, interface sounds and text size.
- **Premade heroes or your own**: eight ready-made heroes on flip cards with their story and numbers, or a guided creator: class, species, background, ability scores (standard array, point buy or dice rolled by the server), skills, talents, equipment, name, gender, looks and backstory. Every option explains what it is, what it does in numbers and who it is good for, with recommended picks per class, tooltips on rules terms and a live preview of your sheet. A premade can be used as it is or customized.
- **Heroes that look like themselves**: portraits and battle tokens are drawn in layers from the hero's species (height, build, skin, ears, tusks, horns, tail), the hair, beard and colours picked in the creator, and the armour, shield and weapon they carry. The same picture is used in the picker, the party panel, the character sheet and on the battle map, and it changes when the gear does.
- **Level-up choices**: a subclass at level 3 (Champion, Thief, Evoker, Life Domain), new spells, and a feat or ability score increase at level 4, each with the same explanations and preview.
- **Progression**: XP from fights and quests, levels 1 to 5 with a level-up summary, and a full character sheet (press `c`).
- **Monsters that look the part.** Tokens are drawn from a body shape, a size and layered extras (heads, horns, wings, colour, glowing eyes, armour, weapon, aura, mutations). The DM can restyle any creature when a fight starts, so a three-headed ogre has three heads, but its statistics always come from one of the 25 SRD stat blocks. Large and bigger creatures take 2x2 to 4x4 squares. Point at a monster for its card.
- **Turn-based 5e combat** on a battle map that is generated for each fight and matches where it breaks out (swamp, forest, plains, hills, mountains, road, bridge, camp, town streets, tavern, cave, ruin or dungeon). Mud, undergrowth, rubble and shallow water are difficult terrain; trees, boulders and furniture give half cover against shots. Also: initiative, movement, attack rolls against AC, advantage and disadvantage, critical hits, saving throws, Sneak Attack, cantrips and 1st-level spells, potions, death saves, and short rests.
- **AI Dungeon Master**: narrates, plays every character you meet, chooses what each monster does, calls for skill checks, starts fights, hands out rewards and keeps the journal. It picks a cheaper or stronger Claude model depending on the moment (see [Configuration](#configuration)). Without an API key a scripted fallback runs travel, fights, rests and dungeons, but cannot improvise.
- **English and German**: every player picks their own interface language (EN / DE in the top bar, remembered in the browser). Whoever opens a table chooses the story language on the party screen, and the game log, the starting region and the Dungeon Master's narration follow it. German uses the terms of the official German D&D edition (Rettungswurf, Rüstungsklasse, Trefferpunkte).
- **A seat at the tavern**: dark wood, parchment scene cards, brass and candlelight, with bundled book fonts. Nothing is loaded from the internet by the browser.
- **Background music** that follows the story: tavern, town, the open road, dungeons, fights and boss fights each have their own tracks and crossfade into each other. Every player has a mute button and a volume slider in the top bar, remembered in their browser. See [Music](#music).
- **Solo or multiplayer**: one player can run up to four heroes, or friends can join the same table and each bring their own. A lobby lists the tables; each table has a host, a ready check, invite links and an optional invite code, and a table talk chat with whispers that the Dungeon Master never reads. See [Playing together](#playing-together). Games are saved in SQLite and survive restarts.

Four classes are available (Fighter, Rogue, Wizard and Cleric) with nine species and four backgrounds. Each hero has a gender (female, male or neutral) that the Dungeon Master is told on every turn, so the narration never guesses or switches. The starting region, the Emberfall Vale, has a town, a village, a shrine, a ruin and the goblin warren under the old Hearthforge smithy.

## Install on Proxmox

### One command

On the Proxmox host, as root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/DBCooperX/hearthforge/main/scripts/proxmox-install.sh)"
```

The script creates an unprivileged Debian 12 LXC named `hearthforge` (nesting and keyctl enabled for Docker), installs Docker, clones this repository to `/opt/hearthforge`, asks for your Anthropic API key, writes `.env`, and runs `docker compose up -d --build`. When it finishes it prints the address to open and the first password for the [Innkeeper](#the-innkeeper), the owner's panel in the game. From then on you should not need a terminal: updates, restarts, the API key and every setting are handled there.

**Run the same command again to update** an install from before the Innkeeper existed (it adds the updater and prints the first password), or whenever you prefer the terminal. It finds the existing container, pulls the latest code and rebuilds.

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

Open `http://<guest-ip>:3000` in a browser. Friends on your network use the same address and pick your table from the list, or open the invite link you send them.

### Updating

Open the **Innkeeper → Server & updates** and press **Update now**, or switch on automatic updates there. See [The Innkeeper](#the-innkeeper) for how that works.

By hand, re-run the one-command installer, or inside the guest:

```bash
cd /opt/hearthforge
git pull
docker compose up -d --build
```

Saved games live in the `hearthforge-data` Docker volume and are kept across updates. `docker compose logs -f` shows the server log, including whether the AI Dungeon Master is active.

### Configuration

All of these can be changed in the **Innkeeper → Settings** without a terminal; a value set there wins over `.env` and takes effect after a restart, which the panel offers. To set them in `.env` instead:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | empty | Your key from [platform.claude.com](https://platform.claude.com). Empty means the scripted fallback DM. |
| `HEARTHFORGE_DM_MODEL_BACKGROUND` | `claude-haiku-5-5` | Model for background work: memory summaries and routine beats such as short journeys and rests. |
| `HEARTHFORGE_DM_MODEL_STANDARD` | `claude-sonnet-5-5` | Model for everyday narration, conversation and monster turns. |
| `HEARTHFORGE_DM_MODEL_KEY` | `claude-opus-5-5` | Model for key moments: the opening scene, first arrival at a major place, boss fights, level-ups, defeats, and turns the DM flagged as a turning point. |
| `HEARTHFORGE_DM_FORCE_MODEL` | empty | Set to a model id to run everything on that one model and switch the automatic choice off. |
| `HEARTHFORGE_DM_EFFORT` | `low` | How hard the DM thinks per beat: `low`, `medium` or `high`. Higher is slower and costs more. |
| `HEARTHFORGE_ART` | `generated` | `generated`, `kenney` or `0x72`. See [Art packs](#art-packs). |
| `HEARTHFORGE_ART_UPLOADS` | `on` | `off` stops anyone from adding or switching art packs in the browser. |
| `HEARTHFORGE_MUSIC` | `on` | `on` or `off`. See [Music](#music). |
| `HEARTHFORGE_TURN_WAIT` | `8` | Seconds the Dungeon Master waits for the other players after the first one acts. `0` answers every action at once. See [Playing together](#playing-together). |
| `HEARTHFORGE_PORT` | `3000` | Port on the host. `.env` only. |
| `HEARTHFORGE_ADMIN_PASSWORD` | generated | First password for the Innkeeper. The installer writes one. It is only read until you change the password in the panel. `.env` only. |
| `HEARTHFORGE_ADMIN` | `on` | `off` removes the Innkeeper altogether. `.env` only. |
| `HEARTHFORGE_AUTO_UPDATE` | `off` | `on` installs a new version by itself as soon as nobody sits at a table. |
| `HEARTHFORGE_TRUST_PROXY` | `off` | `on` reads the player's address from `X-Forwarded-For`. Only switch it on behind your own reverse proxy. |
| `HEARTHFORGE_BRANCH` | checked-out branch | Git branch the updater follows. `.env` only. |

The server decides the tier from what just happened in the game, and the DM can mark a scene as a turning point so the next reply is escalated. Every call is logged as `[dm] <purpose>: tier=<tier> model=<model>`, so `docker compose logs` shows what was used. The older `HEARTHFORGE_DM_MODEL` setting is no longer read; use `HEARTHFORGE_DM_FORCE_MODEL` if you want a single model. The DM makes roughly one API call per story beat and two per round of monster turns. With an Opus-class or Fable-class model, a declined request falls back to another Claude model automatically.

Players have no accounts or passwords; only the Innkeeper has one. Each browser keeps a secret token that proves a seat is its own, and a table can ask for an invite code, but anyone who can reach the port can see the list of tables and open one, so keep it on your LAN or behind a VPN or an authenticating reverse proxy. If you put it behind a reverse proxy, forward WebSocket upgrades for `/ws`.

## The Innkeeper

The Innkeeper is the owner's panel. Open it from the lobby (**Innkeeper**, bottom of the page), from **Settings → Server**, or directly at `http://<address>:3000/?innkeeper`, and sign in with the password the installer printed. If you did not set one, the server makes one up on first start and writes it to its log and to `/data/innkeeper-first-password.txt`. Change it under **Server & updates**; that file is removed when you do.

| Page | What it does |
| --- | --- |
| **Overview** | What is running, who is playing, today's AI cost, and an announcement that pops up for every player. |
| **Tables** | Every table with its players, region, world seed and last save. Pause one (players can still chat), resume it, remove a player, or delete it. |
| **Players** | Every open connection with its address, browser and how long it has been connected. Disconnect someone or ban an address. |
| **Assets** | The art library: upload packs, fetch the known ones, assign icons. Only the Innkeeper can change it. See [Art packs](#art-packs). |
| **Settings** | Everything from the configuration table above, including the API key (shown masked) with a **Test key** button that asks Anthropic whether the key works and whether your chosen models exist. Changes apply with a restart. |
| **Server & updates** | Version, update, restart (now, or with a warning to the players one or five minutes ahead) and the password. |
| **AI costs** | Calls, tokens and estimated cost per day, table and model for the last 90 days. The cost is an estimate from list prices, not your invoice. |
| **Log** | The server log, live, with a filter. |
| **Backups** | A backup of all tables and settings every day (the last 14 are kept), on demand, as a download, and restore from either. Art packs and music are not part of a backup, and neither is the API key. |

**How updating works.** The game cannot rebuild its own container, so a second small container, the *updater*, sits next to it. When you press **Update now** the game leaves the word `update` in a folder both share. The updater pulls the latest version from GitHub, builds the new image while the game keeps running, then swaps the container, which takes a few seconds. If the new version does not build, or does not come up healthy, it puts the previous version back and says so in the panel; such a version is not tried again automatically. Saved games are not touched.

The updater needs the Docker socket to do this, which is as good as root inside the guest. It opens no port, runs nothing the game sends it, and only understands the words `check` and `update`. If you would rather not have it, remove the `updater` service from `docker-compose.yml`; the panel then says that updates are done in the terminal, and everything else still works.

The Innkeeper's password travels like the rest of the game: over plain HTTP unless you put a reverse proxy with TLS in front. That is fine on your LAN or a VPN, and one more reason not to expose the port to the internet. Five wrong passwords lock an address out for five minutes.

**Forgot the password?** Delete `/data/innkeeper.json` and restart; the first password applies again (bans and paused tables are forgotten with it):

```bash
docker compose exec hearthforge rm /data/innkeeper.json && docker compose restart hearthforge
```

## Art packs

Out of the box Hearthforge draws its own 16×16 pixel art and shows items as emoji, so it needs no downloads. Everything else is added in the game: open the **Innkeeper → Assets**. Players see which packs are in use and whom to credit under **Settings → Art & Assets**.

- **Drop a zip.** Download a pack from its page (itch.io, Kenney, OpenGameArt) and drag the zip into the window. The server unpacks it into the data volume (`/data/art`), keeps only the PNG images, and switches to it. No `docker cp`, no restart.
- **Item icons.** *Game-icons.net* (CC BY 3.0) is fetched with one click and has a picture for every item. Any other zip with PNG images becomes an icon pack: pictures are matched by file name (`sword_01.png`, `potion_red.png`), and **Assign icons** lets you pick the rest by hand, also out of sprite sheets. Items without a picture keep their emoji.
- **Map tiles.** *Kenney Tiny Dungeon* is fetched with one click. *0x72 DungeonTileset II* has no direct link on itch.io: download it from [0x72.itch.io](https://0x72.itch.io/dungeontileset-ii) and drop the zip. Tile packs are recognised by their contents. New tiles show after the page is reloaded.

Licenses differ between packs. CC0 packs need nothing, CC BY packs need a credit, and some free packs may be used but not passed on. The window shows the license of the packs it knows and has fields for the credit of the ones it does not; see [CREDITS.md](CREDITS.md) for what was checked.

Setting `HEARTHFORGE_ART` in `.env` still chooses the tile pack for a fresh server; a choice made in the game wins over it. A zip copied into `/data/art` by hand is taken in on the next start. Set `HEARTHFORGE_ART_UPLOADS=off` to lock the art library against changes from the browser.

The tile mappings are **experimental**: the packs could not be downloaded in the environment this was built in, so they have not been checked against the real images.

**Kenney Tiny Dungeon** (`HEARTHFORGE_ART=kenney`): downloaded automatically from [kenney.nl](https://kenney.nl/assets/tiny-dungeon). If a hero shows up as the wrong tile, correct it without rebuilding by writing tile numbers into `kenney-map.json` in the art folder:

```bash
docker compose exec hearthforge sh -c 'echo "{\"goblin\": 111, \"fighter\": 96}" > /data/art/kenney-map.json'
```

Sprite names are `fighter`, `rogue`, `wizard`, `cleric`, `goblin`, `skeleton`, `bugbear`, `rat`, `wolf`, `bandit`, `orc`, `zombie`, `floor0`–`floor3` and `wall0`–`wall2`. The numbers are the `tile_NNNN.png` files in the pack.

**0x72 DungeonTileset II** (`HEARTHFORGE_ART=0x72`): drop the zip into Art & Assets, or copy it in by hand:

```bash
docker compose exec hearthforge mkdir -p /data/art
docker cp 0x72_DungeonTilesetII_v1.7.zip hearthforge:/data/art/
docker compose restart
```

Sprites are matched by the names in the pack's own tile list, so this one does not depend on guessed numbers.

## Music

Hearthforge ships no audio. On start the server downloads a small set of tracks by Kevin MacLeod ([incompetech.com](https://incompetech.com), CC BY 4.0, 50 tracks, roughly 300 MB) into the data volume (`/data/music`, one folder per kind of scene: `tavern`, `town`, `overworld`, `dungeon`, `combat`, `boss`). Downloads run in the background, tracks appear in the game as they arrive, and missing ones are tried again on the next start. A scene with no track is simply silent, so a failed download never breaks the game. Set `HEARTHFORGE_MUSIC=off` to skip all of this.

Every built-in link was checked on 15 November 2026 and answers with HTTP 200. Which scene a track is filed under was decided by its title and character, not by listening to all of them, so move or delete any that feel wrong (see below). `docker compose logs` lists every track that could not be fetched. Playback, crossfading and the switch between scenes were tested with generated test tones.

**Your own music**: copy audio files (`.mp3`, `.ogg`, `.opus`, `.m4a`, `.wav`, `.flac`) into the folder of the scene they fit. No restart is needed; players hear them after reloading the page:

```bash
docker compose exec hearthforge mkdir -p /data/music/tavern
docker cp my-tavern-song.mp3 hearthforge:/data/music/tavern/
```

**A different download list**: write `/data/music/tracks.json` and restart. It replaces the built-in list:

```json
[{ "context": "tavern", "title": "Song name", "artist": "Who made it", "license": "CC BY 4.0", "url": "https://example.org/song.mp3" }]
```

**Ambient sound** (crowd murmur, a crackling fire, wind, rain) plays as a quiet loop under the music and has its own volume slider next to the music one. It appears once the server has at least one loop. Nothing is downloaded for it, because the usual sources (Freesound, Sonniss) either need a login or do not allow passing the files on. Put loops, ideally seamless ones, in `/data/music/ambient/<scene>/`, with the same scene names as the music (`tavern`, `town`, `overworld`, `dungeon`). A scene without a loop is quiet, and fights keep the loop of the scene they started in:

```bash
docker compose exec hearthforge mkdir -p /data/music/ambient/tavern
docker cp tavern-crowd.ogg hearthforge:/data/music/ambient/tavern/
```

Loops with a direct download link you have tested (for example CC0 ones) can go into `tracks.json` with `"layer": "ambient"`; they are then fetched like the music.

Title, artist and license of the music and of the ambient loop are shown in the game when a player points at the music control, which is the attribution CC BY asks for. Browsers only allow sound after the first click or key press, so the music starts when a player first touches the page. If a context has no tracks, the nearest one is used instead: boss fights fall back to combat music, taverns to town music, the road to town music.

## Playing together

- **Who you are**: there are no passwords. Your browser keeps a secret token, and the seat and heroes you take at a table belong to that token. A name can sit at a table only once, so nobody can join as a second "Chris". After a reload, a dropped connection or a server restart the same browser gets its seat back; a different browser or a cleared browser storage is a new player.
- **Tables**: the first screen lists every table with its players, story language, free seats and whether the adventure has begun. Opening a table sets its name, story language, number of seats (1 to 4) and whether it needs an invite code. The table room shows an invite link to copy; with a code, the link carries it.
- **Before the adventure**: everyone picks or creates heroes and says they are ready, and the host begins. The host can remove a player, hand the table to someone else, or close the table. If the host is gone for 20 seconds while others are there, the player who has sat there longest becomes host.
- **Away players**: a player who disconnects keeps their seat and heroes and is shown as away. In a fight anyone at the table may play an away player's hero, so the turn order never stalls. In the story the Dungeon Master is told who is away and keeps their hero in the background. Removing a player after the adventure began gives their heroes to the host.
- **Table talk**: the chat button in the top bar opens an out-of-character chat between the players, with whispers to one player. The Dungeon Master does not read it. What you type into the story box is in character and goes to the Dungeon Master.
- **Whose turn it is**: in a fight the turn order decides. In the story, with more than one player, the first action opens a short window (`HEARTHFORGE_TURN_WAIT`, 8 seconds). The Dungeon Master answers as soon as every connected player has acted, or when the window closes, and resolves everyone's actions in one scene. While someone is still typing the window stays open, up to 30 seconds. Anything said while the Dungeon Master is writing goes into the next reply. Alone at the table, every action is answered at once.

## Where the adventure starts

In the table room, before the adventure begins, the host chooses the world:

- **Region.** *A new region* rolls its own country from the world seed: the kind of land (vale, coast, fens, highlands, forest or borderland), the town and its tavern, a village, a sanctuary, a lesser ruin or cave, the main threat with its four-part lair and quest, and the people who live there. *Classic* is the handcrafted Emberfall Vale. Tables opened in the lobby start with a new region.
- **How it begins.** Looking for work, shipwrecked, caravan guards, prison break, a festival gone wrong, a letter from an old friend, a surprise picked by the seed, or a sentence or two of your own. A shipwreck or a prison break opens out in the wild.
- **World seed.** Shown to everyone and written into the game log. The same seed with the same region and opening rebuilds the same map, places, people and quests, in English and in German. Type in a seed to replay or share a world. Starting a new adventure at the same table rolls a new seed.

With an API key, one short call to the background model rewords a rolled region's descriptions before the first scene, so they fit this table's opening. It never changes names, the map, quests or rewards. The story itself is told fresh every time, and dice, ambushes and battle maps stay random.

## How to play

1. Enter your name, then open a table or sit down at one from the list.
2. Add heroes: flip a premade card and add it, customize it, or create your own. Playing alone? Add up to four and control them all.
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
| `1`–`4` | In a window: switch hero, or turn to a journal chapter |
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
- Species traits and feats that the rules engine cannot enforce (darkvision, speaking with small beasts and the like) are handed to the Dungeon Master to honour in the story. The creator marks which is which.
- Each class has one subclass, the one in the SRD. Magic Initiate spells are cast with mana like any other spell.
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
- `shared/monsterLook.ts` what a monster looks like (body, size, extras the DM can request); `client/src/game/monsterArt.ts` draws the tokens; `server/src/data/monsters.ts` the SRD stat blocks
- `shared/heroLook.ts` what a hero looks like (skin, hair, beard, colours, gear); `client/src/game/heroArt.ts` draws portraits and tokens with the same painter as the monsters
- `shared/battlemap.ts` battle map layouts per kind of place, movement costs and cover; `client/src/game/battleTiles.ts` draws their tiles
- `server/src/game/world.ts` overworld generation and exploration; `shared/hex.ts` hex maths and the route planner
- `server/src/dm/` the Dungeon Master: Claude integration, model tiers and the scripted fallback
- `server/src/data/` classes, monsters and the starting region
- `client/src/` React UI, the SVG hex map and the PixiJS battle map
- `server/src/admin/` the Innkeeper: sign-in, settings laid over `.env`, usage, logs, backups and the link to the updater; `shared/admin.ts` its settings list and types; `client/src/ui/Innkeeper.tsx` the panel; `updater/` the updater container
- `client/src/theme.css` the tavern look; `client/src/music.tsx` the music player; `shared/music.ts` decides which kind of music fits the game state; `server/src/music.ts` fetches and lists tracks

Saves from before the open world cannot be converted: such a table keeps its players and starts a new adventure.

The data model already has the hooks for what comes next: every place has a `zone` slot for generated town and tavern maps, and every character, person and place carries a `visual` record (a fixed appearance description plus an image id) so generated pictures can stay consistent.

The engine is authoritative and synchronous. The DM never changes state directly: it picks monster intents through a tool call, the engine resolves them with real dice, and the DM narrates the result.

## Credits and licenses

See [CREDITS.md](CREDITS.md). Rules content comes from the D&D 5e System Reference Document 5.1 (CC BY 4.0). The pixel art is original, generated in code, and dedicated to the public domain (CC0). Music is downloaded at runtime, not bundled, and is CC BY 4.0. The fonts are under the SIL Open Font License.

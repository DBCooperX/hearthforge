# Hearthforge

A self-hosted Dungeons & Dragons 5e game for your browser, run by an AI Dungeon Master.

Hearthforge runs as a single Docker container on your own server. You and your friends open it in a browser, build a party, and explore a 2D top-down dungeon. The server owns the rules and rolls every die; Claude narrates the adventure and plays the monsters.

## What's in this milestone

- **Party panel** on the left: portrait, HP and mana bars, armor class and conditions for every hero.
- **Inventory overlay** (press `i`): paper-doll equipment slots, a 20-slot backpack, shared party gold, drag-and-drop, double-click to equip or drink, and drop an item on another hero to hand it over. Armor class updates as you change gear.
- **One dungeon**, the goblin warren under the old Hearthforge smithy: seven rooms, doors, fog of war, six chests, and four encounters ending with a bugbear chief.
- **Turn-based 5e combat**: initiative, movement, attack rolls against AC, advantage and disadvantage, critical hits, saving throws, Sneak Attack, cantrips and 1st-level spells, potions, death saves, and short rests.
- **AI Dungeon Master**: narrates scenes and fights, chooses what each monster does, answers players who talk to it, and can call for skill checks. Without an API key the game still runs with scripted monsters and canned narration.
- **Solo or multiplayer**: one player can run up to four heroes, or friends can join the same table and each bring their own. Games are saved in SQLite and survive restarts.

Four level 1 heroes are available: Fighter, Rogue, Wizard and Cleric.

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
| `HEARTHFORGE_DM_MODEL` | `claude-opus-5-5` | Claude model for the Dungeon Master. `claude-fable-5-2` is the most capable, `claude-haiku-5-5` the cheapest and fastest. |
| `HEARTHFORGE_DM_EFFORT` | `low` | How hard the DM thinks per beat: `low`, `medium` or `high`. Higher is slower and costs more. |
| `HEARTHFORGE_ART` | `generated` | `generated`, `kenney` or `0x72`. See [Art packs](#art-packs). |
| `HEARTHFORGE_PORT` | `3000` | Port on the host. |

The DM makes roughly one API call per story beat and two per round of monster turns. With an Opus-class or Fable-class model, a declined request falls back to another Claude model automatically.

Hearthforge has no login. Anyone who can reach the port can join a table, so keep it on your LAN or behind a VPN or an authenticating reverse proxy. If you put it behind a reverse proxy, forward WebSocket upgrades for `/ws`.

## Art packs

Out of the box Hearthforge draws its own 16×16 pixel art, so it needs no downloads. You can switch to a CC0 art pack by setting `HEARTHFORGE_ART` in `.env` and restarting (`docker compose up -d`). The server fetches the pack on start into the data volume (`/data/art`), and anything it cannot get or map keeps the built-in sprite, so a failed download never breaks the game.

This is **experimental**: the packs could not be downloaded in the environment this was built in, so the pack-to-sprite mappings have not been checked against the real images.

**Kenney Tiny Dungeon** (`HEARTHFORGE_ART=kenney`): downloaded automatically from [kenney.nl](https://kenney.nl/assets/tiny-dungeon). If a hero shows up as the wrong tile, correct it without rebuilding by writing tile numbers into `kenney-map.json` in the art folder:

```bash
docker compose exec hearthforge sh -c 'echo "{\"goblin\": 111, \"fighter\": 96}" > /data/art/kenney-map.json'
```

Sprite names are `fighter`, `rogue`, `wizard`, `cleric`, `goblin`, `skeleton`, `bugbear`, `rat`, `chest`, `chest_open`, `door`, `door_open`, `floor0`–`floor3` and `wall0`–`wall2`. The numbers are the `tile_NNNN.png` files in the pack.

**0x72 DungeonTileset II** (`HEARTHFORGE_ART=0x72`): itch.io has no direct download link, so download the zip from [0x72.itch.io](https://0x72.itch.io/dungeontileset-ii) (free, name your own price) and copy it in:

```bash
docker compose exec hearthforge mkdir -p /data/art
docker cp 0x72_DungeonTilesetII_v1.7.zip hearthforge:/data/art/
docker compose restart
```

Sprites are matched by the names in the pack's own tile list, so this one does not depend on guessed numbers.

## How to play

1. Enter your name and a table name. Everyone who enters the same table name shares one adventure.
2. Add heroes. Playing alone? Add up to four and control them all; your other heroes follow the one you move.
3. Click the map or use `WASD` / arrow keys to move. Click a chest to loot it and a door to open it.
4. When enemies come into view, initiative is rolled. On your hero's turn you get 30 ft of movement and one action: click an enemy to attack, or pick a spell or ability from the action bar. `Space` ends the turn.
5. Type in the box under the log to talk to the Dungeon Master.

| Key | Action |
| --- | --- |
| `i` | Open or close the inventory |
| `WASD`, arrows | Move the selected hero |
| `1`–`9` | Action bar buttons |
| `Space` | End turn |
| `Tab` | Cycle your heroes while exploring |
| `Esc` | Cancel targeting or close the inventory |

### House rules

The rules follow the 5e SRD with a few simplifications for this milestone:

- Mana is the Spell Points variant: a level 1 caster has 4 points and a 1st-level spell costs 2.
- Parties smaller than four get the Hearth's Blessing (+4 max HP per missing hero) and face fewer monsters.
- Heroes left unconscious when a fight ends get back up with 1 HP.
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
- `server/src/game/` the rules engine: dice, movement, line of sight, combat, inventory
- `server/src/dm/` the Dungeon Master: Claude integration and the scripted fallback
- `server/src/data/` classes, monsters and the dungeon map
- `client/src/` React UI and the PixiJS map renderer

The engine is authoritative and synchronous. The DM never changes state directly: it picks monster intents through a tool call, the engine resolves them with real dice, and the DM narrates the result.

## Credits and licenses

See [CREDITS.md](CREDITS.md). Rules content comes from the D&D 5e System Reference Document 5.1 (CC BY 4.0). The pixel art is original, generated in code, and dedicated to the public domain (CC0).

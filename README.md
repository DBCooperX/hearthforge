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

You need a Debian 12 (or Ubuntu) guest with Docker. Either works:

- **LXC container**: create an unprivileged Debian 12 container with 1 core, 1 GB RAM and 4 GB disk. Under *Options → Features*, enable **nesting** and **keyctl**, which Docker needs.
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

If the repository is private, clone with a [personal access token](https://github.com/settings/tokens) or a deploy key instead of the plain HTTPS URL.

### Updating

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
| `HEARTHFORGE_PORT` | `3000` | Port on the host. |

The DM makes roughly one API call per story beat and two per round of monster turns. With an Opus-class or Fable-class model, a declined request falls back to another Claude model automatically.

Hearthforge has no login. Anyone who can reach the port can join a table, so keep it on your LAN or behind a VPN or an authenticating reverse proxy. If you put it behind a reverse proxy, forward WebSocket upgrades for `/ws`.

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

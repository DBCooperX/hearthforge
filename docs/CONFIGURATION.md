# Configuration

Back to the [README](../README.md).

Everything below can be changed in the **Innkeeper → Settings**. A value set there wins over `.env` and applies after a restart, which the panel offers. To set them in `.env` instead:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | empty | Your key from [platform.claude.com](https://platform.claude.com). Empty means the scripted fallback. |
| `HEARTHFORGE_DM_MODEL_BACKGROUND` | `claude-haiku-5-5` | Background work: memory summaries, short journeys, rests. |
| `HEARTHFORGE_DM_MODEL_STANDARD` | `claude-sonnet-5-5` | Everyday narration, conversation and monster turns. |
| `HEARTHFORGE_DM_MODEL_KEY` | `claude-opus-5-5` | Key moments: opening scene, major arrivals, boss fights, level-ups, defeats, turning points. |
| `HEARTHFORGE_DM_FORCE_MODEL` | empty | A model id that replaces the automatic choice. |
| `HEARTHFORGE_DM_STORY_ON_KEY` | `off` | `on` runs every story turn outside fights on the key-moment model, for comparing dialogue quality. |
| `HEARTHFORGE_DM_EFFORT` | `low` | How hard the DM thinks per beat: `low`, `medium` or `high`. |
| `HEARTHFORGE_DM_CACHE_TTL` | `1h` | How long the DM's system prompt and tools stay in Claude's prompt cache: `1h` or `5m`. An hour costs a little more to write but survives quiet spells and rare key-moment calls. |
| `HEARTHFORGE_ART` | `generated` | Tile pack for a fresh server: `generated`, `kenney` or `0x72`. A choice made in the game wins. |
| `HEARTHFORGE_ART_UPLOADS` | `on` | `off` locks the art library against changes from the browser. |
| `HEARTHFORGE_AUTO_ASSETS` | `on` | Fetch freely licensed item icons on first start. |
| `HEARTHFORGE_MUSIC` | `on` | `off` skips the music download and the player. |
| `HEARTHFORGE_SFX` | `on` | `off` silences all effects. Kenney's CC0 packs are added by the owner under Assets → Sound effects. |
| `HEARTHFORGE_TURN_WAIT` | `8` | Seconds the DM waits for the other players after the first one acts. `0` answers every action at once. |
| `HEARTHFORGE_REACTION_WAIT` | `20` | Seconds a player gets to decide on an opportunity attack when an enemy leaves their hero's reach. After that the hero strikes. `0` never asks. |
| `HEARTHFORGE_AUTO_UPDATE` | `off` | `on` installs new versions by itself when nobody sits at a table. |
| `HEARTHFORGE_TRUST_PROXY` | `off` | Read the player's address from `X-Forwarded-For`. Only behind your own reverse proxy. |
| `HEARTHFORGE_NARRATOR` | `on` | `off` removes the narrator that reads the story aloud. The voice itself is chosen under Assets → Narrator. |
| `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` | empty | ElevenLabs for the hosted narrator voice, OpenAI for story illustrations. See [Voice and HTTPS](PICTURES-AND-VOICE.md#voice-and-https). |
| `GEMINI_API_KEY`, `FAL_KEY`, `REPLICATE_API_TOKEN` | empty | For story illustrations; can also be typed in the Innkeeper. See [Story illustrations](PICTURES-AND-VOICE.md#story-illustrations). |
| `COMPOSE_PROFILES=https`, `HEARTHFORGE_DOMAIN`, `HEARTHFORGE_LOCAL_HOSTS`, `HEARTHFORGE_DNS_PROVIDER`, `HEARTHFORGE_DNS_TOKEN`, `HEARTHFORGE_ACME_EMAIL` | off | HTTPS through Caddy (`.env` only). See [HTTPS](PICTURES-AND-VOICE.md#https). |
| `HEARTHFORGE_PORT` | `3000` | Port on the host (`.env` only). |
| `HEARTHFORGE_ADMIN_PASSWORD` | generated | First password of the `innkeeper` account; only read on the very first start (`.env` only). |
| `HEARTHFORGE_ADMIN` | `on` | `off` removes the Innkeeper (`.env` only). |
| `HEARTHFORGE_BRANCH` | checked-out branch | Git branch the updater follows (`.env` only). |

Every model call is logged as `[dm] <purpose>: tier=<tier> model=<model>`. The DM makes roughly one API call per story beat and two per round of monster turns.

Everyone signs in with an account (see [The Innkeeper](INNKEEPER.md)), and solo tables are private to their owner, but the sign-in page and the lobby are reachable by anyone who can reach the port. Keep it on your LAN, behind a VPN or behind an authenticating reverse proxy. A reverse proxy must forward WebSocket upgrades for `/ws`.

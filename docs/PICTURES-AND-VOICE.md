# Story pictures, voice and HTTPS

Back to the [README](../README.md).

## Story illustrations

At the big moments of an adventure (a boss steps out, a hard fight is won, a big secret comes out) the Dungeon Master can have a hand-drawn picture painted. It appears above that scene for everyone at the table, fades in when it is ready (a few seconds to half a minute), and opens large with a click. It is off until the Innkeeper switches it on under **Innkeeper → Art → Illustrations**, where you choose:

- **Who paints.** Google Gemini ("Nano Banana", the default), FLUX on fal.ai or Replicate, or OpenAI GPT Image, and the model. Each service needs its key under **Art → Switches and keys**; these keys work as soon as they are saved, without a restart. OpenAI shares its key with the narrator.
- **The style of the scene pictures**: black charcoal sketch on old paper (default, loose strokes and smudged shadows like the storybook sketches of classic isometric role-playing games), ink and watercolour, painted storybook, old woodcut, or your own words. **Paint a sample** makes a test picture in the current style, on your own costs.
- **Hero portraits**: every new hero gets a painted portrait from the choices in the character creator (species, class, skin, hair, beard, colours and the appearance text). All portraits share one look, in warm colour, made for the round brass frames, whatever style the scenes use. It replaces the drawn bust in the party panel, the sheet, the lobby and the tabs once it has loaded; a changed look gets a new one. It is paid by the player whose hero it is, at most 3 per player and day by default. **Paint a sample portrait** tries the look. Scene pictures take the portraits of the heroes in them along, so the heroes look the same.
- **Battle figures**: the miniatures on the battle map can be painted too (on by default once illustrations are on; Innkeeper → Art → Illustrations → Battle figures). A hero's figure is painted from their portrait, so the two match, and is paid by the player whose hero it is. Each kind of monster (catalogue creature plus the look the Dungeon Master gave it) is painted once, the first time it shows up, paid by that table, and then reused at every table of the server. Image models cannot paint a transparent background, so figures are painted on flat magenta (green for pink and purple figures) and the browser cuts the figure out. Until a figure has loaded, and when the switch is off, the drawn figures stay. At most 20 new figures a day for the whole server by default. Deleting a figure under Latest pictures has it painted anew the next time it is needed; **Paint a sample figure** tries the look on a goblin.
- **Which moments** may get a picture: boss, victory and reveal by default; a first arrival at a new place is on too (never a revisit, and the day and gap limits still apply); the opening scene and deaths or partings can be ticked on.
- **Budget**: there are no limits by count any more (no pictures per day, no minutes between pictures). The only caps are the monthly budget for the whole server in the Innkeeper's currency (10 dollars by default, 0 for none) and the players' credit. When either runs out, pictures pause and the story goes on as usual.

| Service | Key | Default model | List price per picture (Nov 2026) |
| --- | --- | --- | --- |
| Google Gemini | `GEMINI_API_KEY` | `gemini-3.1-flash-image` (Nano Banana 2) | about $0.067; Lite $0.034, Pro $0.134 |
| fal.ai | `FAL_KEY` | `fal-ai/flux-2` | about $0.015; FLUX.2 pro $0.03 |
| Replicate | `REPLICATE_API_TOKEN` | `black-forest-labs/flux-2-pro` | about $0.03 |
| OpenAI | `OPENAI_API_KEY` | `gpt-image-2.5-flare`, medium quality | about $0.02 |

Each picture is billed to the player credits like the rest of the AI, shared among the players at the table (column **Pictures** under Costs and credits). The price can be set per model where your invoice differs from the list. To keep the heroes recognisable, every picture is described from the fixed looks the game keeps (species, class, skin, hair, beard, colours, the hero's own appearance text, and the appearance fixed for each person the party meets), and models that take reference images get the table's last pictures along. Pictures are kept in `/data/pictures` (not in backups, like the art packs) and the Innkeeper can delete any of them; they are made on your own account with the service and never mirrored.

## Voice and HTTPS

**Speak instead of typing.** A microphone button sits beside the story's text box. Hold it (or hold `Ctrl+M`) and talk, let go, and the words land in the box so you can fix them before you send. A short tap starts listening and a second tap stops it. The browser does the speech recognition itself, in the player's interface language (English, or German with Swiss accents in mind), so the server needs nothing extra. Chrome, Edge and Safari can do it; Firefox cannot, and there the button is simply not shown. Browsers only allow the microphone on **https**, so switch on [HTTPS](#https) first; on plain http the button is hidden and Settings says why.

**The narrator.** The Dungeon Master's story is read aloud as it arrives, while the music steps back. Each scene card also has a small speaker to read it again or stop. Every player has their own mute button and volume slider next to the music ones. The Innkeeper picks the voice for the whole server under **Assets → Narrator**, with a **Listen** button for each:

| Voice | Cost | |
| --- | --- | --- |
| **Piper** (default) | free | Runs on the server's CPU. Part of the image; its voices (about 60 to 120 MB each) are downloaded once from [Piper's collection](https://huggingface.co/rhasspy/piper-voices) into `/data/voice`. Clear, a little like an audiobook robot. Defaults: *northern English man* and *Thorsten* for German. Each voice links to its licence card. |
| **ElevenLabs** (`ELEVENLABS_API_KEY`) | from their free plan | The most natural, like a real narrator. Your account's voices are listed; the default is *George*. Quality is *Best quality* (multilingual v2) or *Cheaper* (Flash v2.5, half the credits per character). |

Put the keys under **Settings → Voice** and restart. Speech is stored on the server (up to 400 MB, oldest first), so a scene read once is never paid for twice, and only the Dungeon Master's own story can be read, by players sitting at that table. Long scenes are read in parts, so the first sentences start while the rest is still being made. On two cores Piper needs a second or two per part.

### HTTPS

Caddy can sit in front of the game and take care of certificates. The easiest way is the Innkeeper: **Server & updates → HTTPS**. Type a domain or the server's local address, press **Switch HTTPS on**, and the updater writes the settings into `.env` and starts Caddy (the panel shows its state and log). By hand: add `COMPOSE_PROFILES=https` to `.env`, choose one of the three ways below, and run `docker compose up -d --build`. The game stays reachable on port 3000 as before.

1. **A public domain.** Point a domain at your router and forward ports 80 and 443 to the server. Set `HEARTHFORGE_DOMAIN=dnd.example.ch` (and `HEARTHFORGE_ACME_EMAIL` if you like). Caddy gets a free Let's Encrypt certificate and renews it by itself.
2. **A domain only your network knows.** Your own DNS (for example Pi-hole or your router) points `dnd.example.ch` at the server, and nothing is forwarded. Let's Encrypt then checks a DNS record instead: set `HEARTHFORGE_DNS_PROVIDER` to the plugin name from [caddy-dns](https://github.com/caddy-dns) (`cloudflare`, `duckdns`, `hetzner` or `digitalocean`, the ones that take a single token) and `HEARTHFORGE_DNS_TOKEN` to an API token that may edit DNS records. Caddy is then built with that plugin.
3. **No domain.** Set `HEARTHFORGE_LOCAL_HOSTS` to the server's address, for example `192.168.1.50` (several are separated by commas). Caddy makes its own local certificate. Each device trusts it once: open `http://192.168.1.50/hearthforge-ca.crt`, install it (on iOS and Android as a CA certificate; on Windows and macOS into the trusted roots), then use `https://192.168.1.50`. The installer sets this up by default, with the container's IP, so give the container a fixed IP or DHCP reservation.

With HTTPS on, set `HEARTHFORGE_TRUST_PROXY=on` so the Innkeeper sees each player's own address instead of Caddy's.

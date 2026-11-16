# Changelog

## Unreleased

### Playing
- **A story you can follow.** Every scene card names where it plays, the time of day and who is there. The Dungeon Master stages each scene and tags every speaker, explains what the heroes would plainly know, adds at most one new mystery per scene, and lets people answer what they are asked instead of pushing hooks. Clues the party finds are filed in a new Clues tab of the journal, grouped by open question.
- **Story and game stay in step.** When the story walks the party back to town, lets it rest, or has a hero pocket, leave behind or draw something, the game follows: map, music, clock, inventory and gear. The Dungeon Master has tools for story travel, rests and gear, and a quick background check after each reply catches what it narrated without them. Resting an hour or more is a short rest, a night's sleep a long rest, and a note says what came back. "Who is here" lists the people the scene header names.

### Server
- **Browsers pick up updates.** The server tells every browser which client build it serves. A tab that is still on the old build reloads itself when nobody sits at a table and nothing is typed, and otherwise shows an "Update ready" button. Seats and names survive the reload. A missing script or style file now answers 404 instead of the page, so an old tab can no longer load the wrong thing.

## 0.9.0 (15 November 2026): first playtest release

The first version meant for real play-testing with the live AI Dungeon Master. Features that have only been tested against the scripted fallback and the unit tests are listed in [docs/PLAYTEST.md](docs/PLAYTEST.md).

### Rules content
- **Monsters.** All 341 monsters of the SRD 5.2.1 with multiattack, breath weapons and area effects, conditions, regeneration, resistances, Magic and Legendary Resistance and legendary actions. The Dungeon Master searches the catalogue by name, type and Challenge (#28).
- **Classes.** All twelve SRD classes, levels 1 to 20, subclasses at level 3, feats, epic boons and the class features with their own counters (#29).
- **Spells and items.** All 339 spells and 239 magic items, attunement, wands and staffs with charges, hands and belt slots (#30).
- **Icons** for skills, feats, spells and class features, from game-icons.net (#32).

### Playing
- **Open world.** Hex overworld, scene cards, DM memory and progression (#2). Battle maps that match the place of the fight (#6).
- **Combat rules.** Opportunity attacks with a per-player reaction prompt, Disengage, light levels and darkvision (#27).
- **Reputation.** Faction standing, rumours, trophies and undo (#26).
- **Merchants.** Shops with real stock, buying, selling and haggling (#23).
- **Start options.** Random regions, premises and a shareable world seed (#16).
- **DM style.** Tone, rules strictness and content rating per table (#22).
- **Heroes.** Character creator, premade heroes and guided level-up (#8); heroes drawn from species, looks and gear (#12); monsters drawn from a look the DM can restyle (#10).
- **Multiplayer.** Lobby, seats, host and ready check, table talk and turn-taking (#13).
- **English and German** (#3).

### Look and sound
- New logo and the forge theme (#20), shared window system, inventory, journal and character sheet (#14), a decluttered table room, creator and settings (#24).
- Tavern look and music that follows the story (#4); 50 tracks and an ambient layer (#17); a free ambient pack from OpenGameArt (#25); CC0 ambient loops from Freesound with an API key (#31, #33).
- Art packs in the browser and icon packs for items (#15).

### Running it
- **The Innkeeper**, an owner panel for settings, updates, tables, players, backups and costs (#18), with music, ambient sounds and art sources (#19).
- One-line Proxmox installer and a Docker setup, self-updating through a small updater container.

### Fixes
- DM requests rejected with "compiled grammar is too large" (#9), the DM echoing players and hero gender (#5), items the DM invents now reach the inventory (#7), flickering inventory details (#11), a Freesound search that found nothing (#33), and a test that touched the network (#34).

### Housekeeping
- README rewritten with fresh screenshots (#21, and again for this release) and credits tidied.

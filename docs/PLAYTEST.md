# Play-test checklist for 0.9.0

These features pass their automated tests and the scripted fallback, but have **not** been played against the live AI Dungeon Master (set `ANTHROPIC_API_KEY`). Play a short session with a spellcaster and a martial hero, tick what works and note what does not (the Innkeeper's **Log** page shows every DM call).

## Spells
- [ ] Cast an attack cantrip, a saving-throw spell (Fireball on a group) and a healing spell in a fight.
- [ ] Cast at a higher level: mana drops by the right amount and the dice grow.
- [ ] Concentration: cast two concentration spells in a row, and get hurt while concentrating.
- [ ] A story-only spell (Detect Magic, Comprehend Languages) through the spellbook: the DM answers in line with the SRD text and a ritual costs no mana outside a fight.
- [ ] A reaction spell (Shield, Counterspell) fires at the right moment.

## Class features
- [ ] Rage, Wild Shape, Lay on Hands, Divine Smite, Bardic Inspiration, Sneak Attack, Channel Divinity, sorcery points: each counter on the hero card goes down, and back up after a rest.
- [ ] Level up to 3 and pick a subclass; the level-up screen offers sensible choices and spells.
- [ ] The DM does not give or take away class resources by itself.

## Monsters
- [ ] Ask the DM for an encounter by name, by type and by Challenge: it finds a fitting monster (monster search).
- [ ] A multiattack monster, a breath weapon, a condition (grapple, frightened) and a legendary action all play out in the combat log.
- [ ] The DM warns when a fight is too hard for the party.

## Story and game state
- [ ] Walk back to a nearby town by typing it ("Zurück nach Sturmholm gehen"): the map marker, the music and the side panel follow, and the clock moves on.
- [ ] Leave an item somewhere, pick one up, and switch weapons by typing it: the inventory and the hero card follow.
- [ ] Rest for a few hours in the afternoon and sleep through a night: a short and a long rest, each with a note of what came back.
- [ ] Leave a room or let people walk off: "Who is here" lists only the people the scene header names.
- [ ] The Innkeeper log shows `[dm] reconcile:` lines; check that nothing was applied twice or guessed.

## Story timing
- [ ] Ask a townsperson about the region's trouble and when it began, then ask someone else a day later: both give the same time ("vor drei Tagen"), and it fits what you have seen.
- [ ] Ask about something the person could not have seen: they say who told them, or that they do not know.
- [ ] Nobody turns up "just today" without a reason the story gives.
- [ ] A big revelation does not come out in the first conversation. Ask the Dungeon Master out of character "what are you holding back?": it should refuse kindly.
- [ ] Switch on "Every story turn on the key-moment model" in the Innkeeper for one session and compare the dialogue; the log shows `tier=key` for every `reply`.

## Reputation and merchants
- [ ] Help or wrong a faction and see the standing change in the journal; rumours turn up in conversation; **undo** takes a deed back.
- [ ] Open a shop through the DM (curio shop, road peddler) and buy, sell and haggle.

## DM style
- [ ] Change tone, rules strictness and content rating in the table room, play a few beats, and check that the narration follows them.

## Sound and art
- [ ] Combat action bar icons (Attack, spells, features) and skill, feat and spell icons show on the sheet.

## Multiplayer
- [ ] Two browsers at one table: seats, ready check, whisper in table talk, an opportunity-attack prompt that waits for the right player only.
- [ ] Reload one browser mid-fight and get the seat back.

## Test mode
Use it to reach a situation without playing up to it. Innkeeper → Tables → **Test mode** switches it on for a table (the table is saved as it stands); the host then clicks the **Test mode** badge in the top bar.
- [ ] Start a fight with picked creatures, one with a challenge budget, one with the heroes surprising the enemies (with and without a hero striking first) and one with an ambush.
- [ ] Level a hero up two levels: the level-up screen offers the new choices. Give XP to the party.
- [ ] Set hit points to 1, knock a hero out and revive them; put a condition on and lift it; refill mana.
- [ ] Jump to a place and a zone spot, move the clock to dusk, take a long rest.
- [ ] Send a scene hint ("a merchant appears"): the Dungeon Master plays it without mentioning the hint.
- [ ] Back in the Innkeeper, **Undo changes** puts the story back to how it was; **Keep changes** keeps it.

## Report
Note anything odd with the seed (`World seed:` in the game log) and the Innkeeper log lines, so it can be replayed.

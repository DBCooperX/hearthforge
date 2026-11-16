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

## Reputation and merchants
- [ ] Help or wrong a faction and see the standing change in the journal; rumours turn up in conversation; **undo** takes a deed back.
- [ ] Open a shop through the DM (curio shop, road peddler) and buy, sell and haggle.

## DM style
- [ ] Change tone, rules strictness and content rating in the table room, play a few beats, and check that the narration follows them.

## Sound and art
- [ ] Freesound: add an API key under Innkeeper → Settings → Playing and check that CC0 ambient loops are fetched and credited.
- [ ] Combat action bar icons (Attack, spells, features) and skill, feat and spell icons show on the sheet.

## Multiplayer
- [ ] Two browsers at one table: seats, ready check, whisper in table talk, an opportunity-attack prompt that waits for the right player only.
- [ ] Reload one browser mid-fight and get the seat back.

## Report
Note anything odd with the seed (`World seed:` in the game log) and the Innkeeper log lines, so it can be replayed.

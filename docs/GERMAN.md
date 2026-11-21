# German translation: rules and glossary

Hearthforge speaks English and German. English is the source language and the lookup key
(`shared/i18n.ts`); this page is the house style for the German side, so new texts read like
the rest.

## Sources

- **Game terms and names** follow the official German *Systemreferenzdokument 5.2.1*
  (Wizards of the Coast, CC BY 4.0), downloadable from dndbeyond.com/srd ("Deutsch SRD v5.2.1").
  Spells, class features, subclasses, species traits, feats, conditions, monsters and magic
  items use its names. Where the SRD has no name (Hearthforge's own items, places, people),
  write natural German in the same spirit.
- The SRD itself has a few typos; where its tables and headings disagree, use the tables
  (the spell *Light* is "Licht", not "Leicht").

## Style

- **Swiss Standard German:** "ss" instead of "ß" (gross, Strasse, schliessen). A test fails
  on any "ß" in the dictionaries.
- **du** for one player, **ihr** for the party ("Ihr erreicht das Tor"). Never "Sie".
- **Metric**, like the German rulebooks: the game counts in feet, miles and pounds, and
  `metric()` in `shared/units.ts` converts German text on its way out of `tr()`, `tagged()` and
  `loc()`. So write German strings with the English units and numbers ("Reichweite 60 ft")
  and they appear as "Reichweite 18 m". 5 ft = 1,5 m, 1 mile = 1,5 km, 1 lb = 0,5 kg.
  Decimal comma.
- **Short labels.** Buttons and stat labels have room for one or two words.
- **No word-for-word translations.** "What it does" is "Das bekommst du", not "Was es
  bewirkt". Read the German aloud: if nobody would say it at a table, rewrite it.
- **Gender:** classes have a female form in the dictionary as `"<Class> (female)"`
  (Kämpferin, Magierin). Use `classLabel()` / `heroTitle()` for a hero, never the bare class
  name. Species and class together read "Kämpferin (Ork)", so the species needs no
  inflection.
- Quests stay "Quest", not "Auftrag".
- **English words that stay English** because they carry the tavern-and-dungeon vibe: **Innkeeper**
  (the owner's panel and role, not "Wirt"; an *NPC* tavern keeper in the story is still a
  Wirt/Wirtin), **Quest**, **Party** (the party panel heading; the group of heroes in running
  text is still "Gruppe"). "Gastgeber" (host), "Spielleiter" (DM), "Tisch" (table) and
  "Erzähler" (narrator) read naturally in German and stay.

## Glossary

| English | German |
|---|---|
| Hit Points (HP) | Trefferpunkte (TP) |
| Temporary hit points | Temporäre Trefferpunkte |
| Armor Class (AC) | Rüstungsklasse (RK) |
| Difficulty Class (DC) | Schwierigkeitsgrad (SG) |
| Spell save DC | Zauberrettungswurf-SG |
| Saving throw (save) | Rettungswurf (RW) |
| Death saving throw | Todesrettungswurf |
| Ability check / skill check | Attributswurf, e.g. "Weisheitswurf (Wahrnehmung)" |
| Proficiency bonus | Übungsbonus |
| Proficient | geübt |
| Expertise | Expertise |
| Advantage / Disadvantage | Vorteil / Nachteil |
| Speed | Bewegungsrate |
| Initiative | Initiative |
| Action / Bonus action / Reaction | Aktion / Bonusaktion / Reaktion |
| Opportunity attack | Gelegenheitsangriff |
| Dash / Disengage / Dodge | Spurt / Rückzug / Ausweichen |
| Short rest / Long rest | kurze Rast / lange Rast |
| Hit Dice | Trefferwürfel |
| Heroic Inspiration | Heldische Inspiration |
| Cantrip | Zaubertrick |
| 1st-level spell | Zauber des 1. Grades |
| Spell slot | Zauberplatz |
| Concentration | Konzentration |
| Attunement | Einstimmung |
| Weapon Mastery | Waffenbeherrschung |
| Spell attack | Zauberangriff |
| Critical hit | Kritischer Treffer |
| Feat / Origin feat | Talent / Herkunftstalent |
| Species / Background | Spezies / Hintergrund |
| Subclass | Unterklasse |
| Ability scores | Attributswerte |
| STR DEX CON INT WIS CHA | STÄ GES KON INT WEI CHA |
| gp / XP | GM / EP |
| d20 | W20 |
| Dungeon Master | Spielleiter |
| Innkeeper (owner role and panel) | Innkeeper |
| Party (panel heading) | Party |

**Damage types:** Säure, Wucht, Kälte, Feuer, Energie (force), Blitz, Nekrotisch, Stich,
Gift, Psychisch, Gleissend (radiant), Hieb, Schall (thunder).

**Conditions:** blind, bezaubert, taub, verängstigt, gepackt, kampfunfähig, unsichtbar,
gelähmt, versteinert, vergiftet, liegend, festgesetzt, betäubt, bewusstlos, Erschöpfung.

**Classes:** Barbar, Barde, Druide, Hexenmeister, Kämpfer, Kleriker, Magier, Mönch, Paladin,
Schurke, Waldläufer, Zauberer (female: -in, e.g. Hexenmeisterin, Mönchin).

**Creatures** use their SRD name: Bugbear is "Grottenschrat", never "Bugbär". The German
Dungeon Master gets the names of the creatures in its adventure, and `find_monsters` returns
the German name of any creature.

## Where the German lives

| What | File |
|---|---|
| Interface, game log, Innkeeper | `shared/i18n-de.ts` |
| Classes, feats, boons | `shared/i18n-de-classes.ts`, `shared/classes.ts` |
| Class features | `shared/classFeatures.ts` (name + text) |
| Spells | `shared/spellTable.ts` (name + text), `shared/i18n-de-spells.ts` |
| Magic items | `shared/magicItemTable.ts` |
| Monsters and their actions | `shared/i18n-de-srd.ts` |
| Creator texts (classes, species, backgrounds) | `shared/rules.ts` (`L(en, de)`) |
| What the AI Dungeon Master is told about German | `server/src/dm/context.ts` (`languageNote`) |

`server/test/i18n.test.ts` checks that every interface string has German, that placeholders
survive, the metric conversion and the Swiss spelling.

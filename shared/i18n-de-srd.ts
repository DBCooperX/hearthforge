// German for the creatures of the System Reference Document 5.2.1: their names, the
// names of their attacks and special actions, and the one-line descriptions built from
// size and creature type. Written for Hearthforge; where the German editions of the game
// have an established name for a creature, that name is used.

const AGES: [string, string][] = [['Young', 'Junger'], ['Adult', 'Ausgewachsener'], ['Ancient', 'Uralter']];
const CHROMATIC: [string, string][] = [['Black', 'schwarzer'], ['Blue', 'blauer'], ['Green', 'grüner'], ['Red', 'roter'], ['White', 'weisser']];
const METALLIC: [string, string][] = [['Brass', 'Messing'], ['Bronze', 'Bronze'], ['Copper', 'Kupfer'], ['Gold', 'Gold'], ['Silver', 'Silber']];

const dragons: Record<string, string> = {};
for (const [en, de] of AGES) {
  for (const [c, cde] of CHROMATIC) dragons[`${en} ${c} Dragon`] = `${de} ${cde} Drache`;
  for (const [c, cde] of METALLIC) dragons[`${en} ${c} Dragon`] = `${de} ${cde}drache`;
}
for (const [c, cde] of CHROMATIC) dragons[`${c} Dragon Wyrmling`] = `${cde.charAt(0).toUpperCase()}${cde.slice(1)} Drachennestling`;
for (const [c, cde] of METALLIC) dragons[`${c} Dragon Wyrmling`] = `${cde}drachennestling`;

const weres: Record<string, string> = {};
for (const [en, de, beast, beastDe] of [['Werebear', 'Werbär', 'Bear', 'Bären'], ['Wereboar', 'Wereber', 'Boar', 'Eber'], ['Wererat', 'Werratte', 'Rat', 'Ratten'], ['Weretiger', 'Wertiger', 'Tiger', 'Tiger'], ['Werewolf', 'Werwolf', 'Wolf', 'Wolfs']]) {
  weres[`${en}, Human Form`] = `${de} (Menschengestalt)`;
  weres[`${en}, Hybrid Form`] = `${de} (Mischgestalt)`;
  weres[`${en}, ${beast} Form`] = `${de} (${beastDe}gestalt)`;
}

// "Huge dragon" → "Riesiger Drache". The adjective follows the gender of the type's noun.
const SIZES_DE: Record<string, [m: string, f: string, n: string]> = {
  Tiny: ['Winziger', 'Winzige', 'Winziges'], Small: ['Kleiner', 'Kleine', 'Kleines'], Medium: ['Mittelgrosser', 'Mittelgrosse', 'Mittelgrosses'],
  Large: ['Grosser', 'Grosse', 'Grosses'], Huge: ['Riesiger', 'Riesige', 'Riesiges'], Gargantuan: ['Gigantischer', 'Gigantische', 'Gigantisches'],
};
const TYPES_DE: Record<string, [noun: string, gender: 0 | 1 | 2]> = {
  aberration: ['Aberration', 1], beast: ['Tier', 2], celestial: ['Himmlischer', 0], construct: ['Konstrukt', 2], dragon: ['Drache', 0], elemental: ['Elementar', 2], fey: ['Feenwesen', 2],
  fiend: ['Unhold', 0], giant: ['Riese', 0], humanoid: ['Humanoider', 0], monstrosity: ['Monstrosität', 1], ooze: ['Schlick', 0], plant: ['Pflanze', 1], undead: ['Untoter', 0],
};
const descriptions: Record<string, string> = {};
for (const [size, forms] of Object.entries(SIZES_DE)) for (const [type, [noun, g]] of Object.entries(TYPES_DE)) descriptions[`${size} ${type}`] = `${forms[g]} ${noun}`;

export const DE_SRD: Record<string, string> = {
  ...dragons,
  ...weres,
  ...descriptions,

  // ------------------------------------------------------------ creatures
  'Aboleth': 'Aboleth', 'Air Elemental': 'Luftelementar', 'Allosaurus': 'Allosaurus', 'Animated Flying Sword': 'Belebtes fliegendes Schwert', 'Animated Rug of Smothering': 'Belebter Teppich des Erstickens',
  'Ankheg': 'Ankheg', 'Ankylosaurus': 'Ankylosaurus', 'Ape': 'Menschenaffe', 'Archelon': 'Archelon', 'Archmage': 'Erzmagier', 'Assassin': 'Assassine', 'Awakened Shrub': 'Erwachter Busch', 'Awakened Tree': 'Erwachter Baum',
  'Axe Beak': 'Axtschnabel', 'Azer Sentinel': 'Azer-Wächter', 'Baboon': 'Pavian', 'Badger': 'Dachs', 'Balor': 'Balor', 'Bandit Captain': 'Banditenhauptmann', 'Barbed Devil': 'Klingenteufel', 'Basilisk': 'Basilisk', 'Bat': 'Fledermaus',
  'Bearded Devil': 'Bartteufel', 'Behir': 'Behir', 'Berserker': 'Berserker', 'Black Bear': 'Schwarzbär', 'Black Pudding': 'Schwarzer Blob', 'Blink Dog': 'Flimmerhund', 'Blood Hawk': 'Blutfalke', 'Boar': 'Eber',
  'Bone Devil': 'Knochenteufel', 'Bugbear Stalker': 'Grottenschratpirscher', 'Bugbear Warrior': 'Grottenschratkrieger', 'Bulette': 'Landhai', 'Camel': 'Kamel', 'Cat': 'Katze', 'Centaur Trooper': 'Zentaurensoldat', 'Chain Devil': 'Kettenteufel',
  'Chimera': 'Chimäre', 'Chuul': 'Chuul', 'Clay Golem': 'Lehmgolem', 'Cloaker': 'Mantler', 'Cloud Giant': 'Wolkenriese', 'Cockatrice': 'Schreckhahn', 'Commoner': 'Gemeiner', 'Constrictor Snake': 'Würgeschlange', 'Couatl': 'Couatl',
  'Crab': 'Krabbe', 'Crocodile': 'Krokodil', 'Cultist': 'Kultist', 'Cultist Fanatic': 'Kultistenfanatiker', 'Darkmantle': 'Düstermantel', 'Death Dog': 'Todeshund', 'Deer': 'Reh', 'Deva': 'Deva', 'Djinni': 'Dschinni', 'Doppelganger': 'Doppelgänger',
  'Draft Horse': 'Zugpferd', 'Dragon Turtle': 'Drachenschildkröte', 'Drider': 'Drinne', 'Druid': 'Druide', 'Dryad': 'Dryade', 'Dust Mephit': 'Staub-Mephit', 'Eagle': 'Adler', 'Earth Elemental': 'Erdelementar', 'Efreeti': 'Ifrit',
  'Elephant': 'Elefant', 'Elk': 'Elch', 'Erinyes': 'Erinnye', 'Ettercap': 'Atterkopp', 'Ettin': 'Ettin', 'Fire Elemental': 'Feuerelementar', 'Fire Giant': 'Feuerriese', 'Flesh Golem': 'Fleischgolem', 'Flying Snake': 'Fliegende Schlange',
  'Frog': 'Frosch', 'Frost Giant': 'Frostriese', 'Gargoyle': 'Gargyl', 'Gelatinous Cube': 'Gallertwürfel', 'Ghast': 'Grul', 'Ghost': 'Geist', 'Giant Ape': 'Riesenaffe', 'Giant Badger': 'Riesendachs', 'Giant Bat': 'Riesenfledermaus',
  'Giant Boar': 'Rieseneber', 'Giant Constrictor Snake': 'Riesenwürgeschlange', 'Giant Crab': 'Riesenkrabbe', 'Giant Crocodile': 'Riesenkrokodil', 'Giant Eagle': 'Riesenadler', 'Giant Elk': 'Riesenelch',
  'Giant Fire Beetle': 'Riesenfeuerkäfer', 'Giant Frog': 'Riesenfrosch', 'Giant Goat': 'Riesenziege', 'Giant Hyena': 'Riesenhyäne', 'Giant Lizard': 'Rieseneidechse', 'Giant Octopus': 'Riesenoktopus', 'Giant Owl': 'Rieseneule',
  'Giant Scorpion': 'Riesenskorpion', 'Giant Seahorse': 'Riesenseepferdchen', 'Giant Shark': 'Riesenhai', 'Giant Toad': 'Riesenkröte', 'Giant Venomous Snake': 'Riesengiftschlange', 'Giant Vulture': 'Riesengeier',
  'Giant Wasp': 'Riesenwespe', 'Giant Weasel': 'Riesenwiesel', 'Giant Wolf Spider': 'Riesenwolfsspinne', 'Gibbering Mouther': 'Plapperndes Hundertmaul', 'Glabrezu': 'Glabrezu', 'Gladiator': 'Gladiator', 'Gnoll Warrior': 'Gnollkrieger',
  'Goat': 'Ziege', 'Goblin Boss': 'Goblin-Boss', 'Goblin Minion': 'Goblin-Scherge', 'Goblin Warrior': 'Goblinkrieger', 'Gorgon': 'Gorgone', 'Green Hag': 'Grüne Vettel', 'Grick': 'Grick', 'Griffon': 'Greif', 'Grimlock': 'Grimlock',
  'Guard': 'Wache', 'Guard Captain': 'Wachanführer', 'Guardian Naga': 'Wächternaga', 'Half-Dragon': 'Halbdrache', 'Harpy': 'Harpyie', 'Hawk': 'Falke', 'Hell Hound': 'Höllenhund', 'Hezrou': 'Hezrou', 'Hippogriff': 'Pferdegreif',
  'Hippopotamus': 'Flusspferd', 'Hobgoblin Captain': 'Hobgoblin-Hauptmann', 'Hobgoblin Warrior': 'Hobgoblin-Krieger', 'Homunculus': 'Homunkulus', 'Horned Devil': 'Hornteufel', 'Hunter Shark': 'Jagdhai', 'Hydra': 'Hydra', 'Hyena': 'Hyäne',
  'Ice Devil': 'Eisteufel', 'Ice Mephit': 'Eis-Mephit', 'Imp': 'Teufelchen', 'Incubus': 'Inkubus', 'Invisible Stalker': 'Unsichtbarer Pirscher', 'Iron Golem': 'Eisengolem', 'Jackal': 'Schakal', 'Killer Whale': 'Schwertwal', 'Knight': 'Ritter',
  'Kobold Warrior': 'Koboldkrieger', 'Kraken': 'Krake', 'Lamia': 'Lamia', 'Lemure': 'Lemure', 'Lich': 'Lich', 'Lion': 'Löwe', 'Lizard': 'Eidechse', 'Mage': 'Magier', 'Magma Mephit': 'Magma-Mephit', 'Magmin': 'Magmin', 'Mammoth': 'Mammut',
  'Manticore': 'Mantikor', 'Marilith': 'Marilith', 'Mastiff': 'Dogge', 'Medusa': 'Medusa', 'Merfolk Skirmisher': 'Meervolk-Scharmützler', 'Merrow': 'Seeoger', 'Mimic': 'Mimik', 'Minotaur Skeleton': 'Minotaurus-Skelett',
  'Minotaur of Baphomet': 'Minotaurus von Baphomet', 'Mule': 'Maultier', 'Mummy': 'Mumie', 'Mummy Lord': 'Mumienfürst', 'Nalfeshnee': 'Nalfeshnee', 'Night Hag': 'Nachtvettel', 'Nightmare': 'Nachtmahr', 'Noble': 'Adeliger',
  'Ochre Jelly': 'Ockergallerte', 'Ogre Zombie': 'Ogerzombie', 'Oni': 'Oni', 'Otyugh': 'Otyugh', 'Owl': 'Eule', 'Panther': 'Panther', 'Pegasus': 'Pegasus', 'Phase Spider': 'Phasenspinne', 'Piranha': 'Piranha', 'Pirate': 'Pirat',
  'Pirate Captain': 'Piratenkapitän', 'Pit Fiend': 'Höllenschlundteufel', 'Planetar': 'Planetar', 'Plesiosaurus': 'Plesiosaurus', 'Polar Bear': 'Eisbär', 'Pony': 'Pony', 'Priest': 'Priester', 'Priest Acolyte': 'Priester-Akolyth', 'Pseudodragon': 'Pseudodrache',
  'Pteranodon': 'Pteranodon', 'Purple Worm': 'Purpurwurm', 'Quasit': 'Quasit', 'Rakshasa': 'Rakshasa', 'Rat': 'Ratte', 'Raven': 'Rabe', 'Reef Shark': 'Riffhai', 'Remorhaz': 'Remorhaz', 'Rhinoceros': 'Nashorn', 'Riding Horse': 'Reitpferd',
  'Roc': 'Roch', 'Roper': 'Seiler', 'Rust Monster': 'Rostmonster', 'Saber-Toothed Tiger': 'Säbelzahntiger', 'Sahuagin Warrior': 'Sahuagin-Krieger', 'Salamander': 'Salamander', 'Satyr': 'Satyr', 'Scorpion': 'Skorpion', 'Scout': 'Späher',
  'Sea Hag': 'Seevettel', 'Seahorse': 'Seepferdchen', 'Shadow': 'Schatten', 'Shambling Mound': 'Modernder Schlurfer', 'Shield Guardian': 'Schildwächter', 'Shrieker Fungus': 'Kreischerpilz', 'Solar': 'Solar',
  'Sphinx of Lore': 'Sphinx des Wissens', 'Sphinx of Valor': 'Sphinx der Tapferkeit', 'Sphinx of Wonder': 'Sphinx des Wunders', 'Spider': 'Spinne', 'Spirit Naga': 'Geisternaga', 'Sprite': 'Feengeist', 'Spy': 'Spion', 'Steam Mephit': 'Dampf-Mephit',
  'Stirge': 'Blutmücke', 'Stone Giant': 'Steinriese', 'Stone Golem': 'Steingolem', 'Storm Giant': 'Sturmriese', 'Succubus': 'Sukkubus', 'Swarm of Bats': 'Fledermausschwarm', 'Swarm of Crawling Claws': 'Krabbelnde-Klauen-Schwarm',
  'Swarm of Insects': 'Insektenschwarm', 'Swarm of Piranhas': 'Piranhaschwarm', 'Swarm of Rats': 'Rattenschwarm', 'Swarm of Ravens': 'Rabenschwarm', 'Swarm of Venomous Snakes': 'Giftschlangenschwarm', 'Tarrasque': 'Tarraske',
  'Tiger': 'Tiger', 'Tough': 'Zäher', 'Tough Boss': 'Zäher Boss', 'Treant': 'Baumhirte', 'Triceratops': 'Triceratops', 'Troll Limb': 'Trollgliedmasse', 'Tyrannosaurus Rex': 'Tyrannosaurus Rex', 'Unicorn': 'Einhorn',
  'Vampire Familiar': 'Vampir-Vertrauter', 'Vampire Spawn': 'Vampirbrut', 'Vampire, Bat Form': 'Vampir (Fledermausgestalt)', 'Vampire, Mist Form': 'Vampir (Nebelgestalt)', 'Vampire, Vampire Form': 'Vampir', 'Venomous Snake': 'Giftschlange',
  'Violet Fungus': 'Violetter Pilz', 'Vrock': 'Vrock', 'Vulture': 'Geier', 'Warhorse': 'Streitross', 'Warhorse Skeleton': 'Streitross-Skelett', 'Warrior Infantry': 'Kriegerinfanterist', 'Warrior Veteran': 'Kriegerveteran',
  'Water Elemental': 'Wasserelementar', 'Weasel': 'Wiesel', 'Wight': 'Gruftschrecken', "Will-o'-Wisp": 'Irrlicht', 'Winter Wolf': 'Winterwolf', 'Worg': 'Worg', 'Wraith': 'Todesalb', 'Wyvern': 'Wyvern', 'Xorn': 'Xorn',

  // ------------------------------------------------- attacks and actions
  'Abyssal Glaive': 'Abyssische Glefe', 'Acid Breath': 'Säureodem', 'Acid Spray': 'Säurestrahl', 'Arcane Burst': 'Arkaner Ausbruch', 'Arcane Prowl': 'Arkanes Anschleichen', 'Attach': 'Festsaugen', 'Baleful Command': 'Unheilvoller Befehl',
  'Banish': 'Verbannen', 'Beak': 'Schnabel', 'Beaks': 'Schnäbel', 'Beguile': 'Betören', 'Bites': 'Bisse', 'Bladed Arm': 'Klingenarm', 'Blazing Light': 'Gleissendes Licht', 'Blinding Breath': 'Blendender Odem', 'Blinding Gaze': 'Blendender Blick',
  'Blinding Spittle': 'Blendender Speichel', 'Bone Bow': 'Knochenbogen', 'Bone Cudgel': 'Knochenkeule', 'Boulder': 'Felsbrocken', 'Burn': 'Verbrennen', 'Burning Hammer': 'Brennender Hammer', 'Cacophony': 'Kakophonie', 'Chain': 'Kette',
  'Chain Lightning': 'Kettenblitz', 'Channel Negative Energy': 'Negative Energie kanalisieren', 'Charged Tendril': 'Geladene Ranke', 'Charging Horn': 'Hornstoss', 'Charm Monster': 'Monster bezaubern', 'Charm Person': 'Person bezaubern',
  'Chill': 'Frostgriff', 'Claw': 'Klaue', 'Cloaked Flight': 'Verhüllter Flug', 'Cloud of Insects': 'Insektenwolke', 'Club': 'Knüppel', 'Cold Breath': 'Kälteodem', 'Cold Gale': 'Eisiger Sturm', 'Command': 'Befehl',
  'Commanding Presence': 'Gebieterische Präsenz', 'Cone of Cold': 'Kältekegel', 'Conjure Infernal Chain': 'Höllenkette beschwören', 'Constrict': 'Würgen', 'Consume Memories': 'Erinnerungen verzehren', 'Corrupting Touch': 'Verderbende Berührung',
  'Crush': 'Zerquetschen', 'Cursed Touch': 'Verfluchte Berührung', 'Death Burst': 'Todesexplosion', 'Death Glare': 'Todesblick', 'Death Throes': 'Todeszuckungen', 'Deathless Strike': 'Untoter Hieb', 'Deathly Teleport': 'Tödliche Teleportation',
  'Devilish Claw': 'Teufelsklaue', 'Disrupt Life': 'Leben zerrütten', 'Dissolving Pseudopod': 'Auflösendes Scheinfüsschen', 'Dominate Mind': 'Geist beherrschen', 'Draining Kiss': 'Zehrender Kuss', 'Draining Swipe': 'Zehrender Hieb',
  'Dread Command': 'Schreckensbefehl', 'Dreadful Glare': 'Schrecklicher Blick', 'Eldritch Burst': 'Schauerlicher Ausbruch', 'Enchanting Bow': 'Verzaubernder Bogen', 'Engulf': 'Verschlingen', 'Entangle': 'Verstricken',
  'Entangling Rope (Requires Magic Rope)': 'Fesselndes Seil', 'Enthralling Panache': 'Betörender Schneid', 'Fear': 'Furcht', 'Fetid Cloud': 'Stinkende Wolke', 'Fiendish Touch': 'Teuflische Berührung', 'Fiery Bolt': 'Feuriger Bolzen',
  'Fiery Mace': 'Feuriger Streitkolben', 'Fiery Rays': 'Feurige Strahlen', 'Finger of Death': 'Finger des Todes', 'Fire Breath': 'Feuerodem', 'Fireball': 'Feuerball', 'First Roar': 'Erstes Brüllen', 'Fist': 'Faust', 'Flame Spear': 'Flammenspeer',
  'Flame Strike': 'Flammenschlag', 'Flame Sword': 'Flammenschwert', 'Flame Whip': 'Flammenpeitsche', 'Flying Sword': 'Fliegendes Schwert', 'Force Bolt': 'Energiebolzen', 'Foreleg': 'Vorderbein', 'Freezing Burst': 'Eisiger Ausbruch',
  'Frightening Gaze': 'Furchterregender Blick', 'Frightful Presence': 'Furchterregende Präsenz', 'Frost Axe': 'Frostaxt', 'Frost Breath': 'Frostodem', 'Giggling Magic': 'Kichernde Magie', 'Glare': 'Starren', 'Gore': 'Aufspiessen', 'Gouge': 'Aufreissen',
  'Grab': 'Packen', 'Grave Strike': 'Grabeshieb', 'Great Bow': 'Grossbogen', 'Guiding Light': 'Leitendes Licht', 'Hail of Bark': 'Rindenhagel', 'Hammer Throw': 'Hammerwurf', 'Hand Crossbow': 'Handarmbrust', 'Harm': 'Leid', 'Harpoon': 'Harpune',
  'Heated Blade': 'Glühende Klinge', 'Heavy Crossbow': 'Schwere Armbrust', 'Hold Monster': 'Monster festhalten', 'Hold Person': 'Person festhalten', 'Holy Burst': 'Heiliger Ausbruch', 'Holy Mace': 'Heiliger Streitkolben', 'Hooves': 'Hufe',
  'Horrific Visage': 'Schreckliches Antlitz', 'Horror Nimbus': 'Schreckensnimbus', 'Hurl Flame': 'Flammenwurf', 'Hypnotic Pattern': 'Hypnotisches Muster', 'Ice Knife': 'Eismesser', 'Ice Spear': 'Eisspeer', 'Ice Storm': 'Eissturm',
  'Infernal Glaive': 'Höllenglefe', 'Infernal Sting': 'Höllenstachel', 'Infernal Tail': 'Höllenschwanz', 'Insect Plague': 'Insektenplage', 'Lash': 'Peitschenhieb', 'Light Hammer': 'Leichter Hammer', 'Lightning Blade': 'Blitzklinge',
  'Lightning Bolt': 'Blitz', 'Lightning Breath': 'Blitzodem', 'Lightning Strike': 'Blitzschlag', 'Luring Song': 'Lockgesang', 'Mind Invasion': 'Gedankeninvasion', 'Mind Jolt': 'Gedankenstoss', 'Mind Spike': 'Gedankendorn',
  'Mind-Rending Roar': 'Geistzerreissendes Brüllen', 'Moan': 'Stöhnen', 'Mockery': 'Verhöhnen', 'Moonbeam': 'Mondstrahl', 'Necrotic Bow': 'Nekrotischer Bogen', 'Necrotic Ray': 'Nekrotischer Strahl', 'Necrotic Strike': 'Nekrotischer Hieb',
  'Necrotic Sword': 'Nekrotisches Schwert', 'Needle Sword': 'Nadelschwert', 'Nightmare Ray': 'Albtraumstrahl', 'Noxious Miasma': 'Giftiges Miasma', 'Ocean Spear': 'Meeresspeer', 'Onslaught': 'Ansturm', 'Pact Blade': 'Paktklinge',
  'Paralyzing Breath': 'Lähmender Odem', 'Paralyzing Tentacles': 'Lähmende Tentakel', 'Paralyzing Touch': 'Lähmende Berührung', 'Petrifying Bite': 'Versteinernder Biss', 'Petrifying Breath': 'Versteinernder Odem',
  'Petrifying Gaze': 'Versteinernder Blick', 'Phantasmal Killer': 'Tödliches Phantom', 'Pike': 'Pike', 'Pincer': 'Schere', 'Pistol': 'Pistole', 'Poison Breath': 'Giftodem', 'Poison Burst': 'Giftexplosion', 'Poison Ray': 'Giftstrahl',
  'Poisonous Spittle': 'Giftiger Speichel', 'Possession': 'Besessenheit', 'Pounce': 'Anspringen', 'Power Word Stun': 'Wort der Macht: Betäubung', 'Proboscis': 'Rüssel', 'Psychic Drain': 'Psychischer Entzug', 'Pummel': 'Prügeln',
  'Quick Grapple': 'Schneller Griff', 'Radiant Flame': 'Gleissende Flamme', 'Radiant Horn': 'Gleissendes Horn', 'Radiant Sword': 'Gleissendes Schwert', 'Radiant Teleport': 'Gleissende Teleportation', 'Rake': 'Zerfetzen', 'Ram': 'Rammen',
  'Ray of Sickness': 'Strahl der Übelkeit', 'Rend': 'Zerreissen', 'Repulsion Breath': 'Abstossender Odem', 'Restless Touch': 'Rastlose Berührung', 'Ritual Sickle': 'Ritualsichel', 'Roar': 'Brüllen', 'Rock Launch': 'Felsschleuder',
  'Rotting Fist': 'Verrottende Faust', 'Rotting Touch': 'Verrottende Berührung', 'Scare': 'Erschrecken', 'Scorching Ray': 'Sengender Strahl', 'Scorching Sands': 'Sengender Sand', 'Scratch': 'Kratzen', 'Searing Fork': 'Sengende Gabel',
  'Second Roar': 'Zweites Brüllen', 'Shield Bash': 'Schildstoss', 'Shimmering Shield': 'Schimmernder Schild', 'Shock': 'Stromschlag', 'Shred': 'Zerfleischen', 'Slash': 'Hieb', 'Slaying Bow': 'Tötungsbogen', 'Sleep': 'Schlaf',
  'Sleep Breath': 'Schlafodem', 'Smother': 'Ersticken', 'Snake Hair': 'Schlangenhaar', 'Sonic Boom': 'Schallknall', 'Spores': 'Sporen', 'Steam Breath': 'Dampfodem', 'Stench': 'Gestank', 'Sting': 'Stachel', 'Stone Club': 'Steinkeule',
  'Storm Blade': 'Sturmklinge', 'Storm Bolt': 'Sturmbolzen', 'Storm Sword': 'Sturmschwert', 'Stunning Screech': 'Betäubender Schrei', 'Swallow': 'Verschlucken', 'Swarm of Grasping Hands': 'Schwarm greifender Hände', 'Tail': 'Schwanz',
  'Tail Spike': 'Schwanzstachel', 'Tail Stinger': 'Giftstachel', 'Tail Swipe': 'Schwanzhieb', 'Talons': 'Krallen', 'Tentacle': 'Tentakel', 'Tentacles': 'Tentakel', 'Third Roar': 'Drittes Brüllen', 'Thorn Burst': 'Dornenexplosion',
  'Thunderbolt': 'Donnerkeil', 'Thunderclap': 'Donnerschlag', 'Thundercloud': 'Gewitterwolke', 'Thunderous Bellow': 'Donnerndes Gebrüll', 'Thunderous Mace': 'Donnernder Streitkolben', 'Thunderous Slam': 'Donnernder Hieb',
  'Toxic Ink': 'Giftige Tinte', 'Trample': 'Niedertrampeln', 'Trash Lob': 'Unratwurf', 'Tree Club': 'Baumkeule', 'Tusk': 'Stosszahn', 'Umbral Dagger': 'Schattendolch', 'Unsettling Visage': 'Verstörendes Antlitz', 'Verdant Wisp': 'Grünes Irrlicht',
  'Vile Slime': 'Übler Schleim', 'Vine Lash': 'Rankenpeitsche', 'Vine Staff': 'Rankenstab', 'Vitriolic Sphere': 'Ätzkugel', 'Vortex': 'Strudel', 'Wall of Fire': 'Feuerwand', 'Web': 'Netz', 'Web Strand': 'Netzfaden',
  'Weight of Years': 'Last der Jahre', 'Whirlwind': 'Wirbelwind', 'Wind Swipe': 'Windhieb', 'Withering Sword': 'Welkendes Schwert', 'Withering Touch': 'Welkende Berührung', 'World-Shaking Movement': 'Welterschütternder Schritt',

  // -------------------------------------------- what a creature can do
  'Multiattack': 'Mehrfachangriff', 'Spellcasting': 'Zauberwirken', 'Regeneration': 'Regeneration', 'Pack Tactics': 'Rudeltaktik', 'Magic Resistance': 'Magieresistenz', 'Legendary Resistance': 'Legendäre Resistenz',
  'Undead Fortitude': 'Untote Zähigkeit', 'Parry': 'Parieren', 'Flyby': 'Vorbeiflug', 'Fire Aura': 'Feueraura', 'Legendary actions': 'Legendäre Aktionen',
  'psychic damage': 'psychischer Schaden',

  // ------------------------------------------------------------ conditions
  'blinded': 'blind', 'charmed': 'bezaubert', 'deafened': 'taub', 'frightened': 'verängstigt', 'grappled': 'gepackt', 'incapacitated': 'kampfunfähig', 'paralyzed': 'gelähmt',
  'petrified': 'versteinert', 'poisoned': 'vergiftet', 'prone': 'liegend', 'restrained': 'festgesetzt', 'stunned': 'betäubt', 'asleep': 'schlafend',
  'Cannot see. Own attacks have disadvantage, attacks against you have advantage.': 'Kann nichts sehen. Eigene Angriffe haben Nachteil, Angriffe gegen dich haben Vorteil.',
  'Cannot attack the one who charmed you.': 'Kann den nicht angreifen, der dich bezaubert hat.',
  'Cannot hear.': 'Kann nichts hören.',
  'Disadvantage on attacks while the source of the fear is near, and you cannot move closer to it.': 'Nachteil bei Angriffen, solange die Quelle der Furcht in der Nähe ist, und du kannst dich ihr nicht nähern.',
  'Held in place: speed 0. Use Break free to wrestle loose.': 'Festgehalten: Bewegungsrate 0. Mit „Losreissen“ kannst du dich befreien.',
  'Cannot act or move this turn.': 'Kann in diesem Zug weder handeln noch sich bewegen.',
  'Cannot act or move. Attacks against you have advantage, and hits from next to you are critical.': 'Kann weder handeln noch sich bewegen. Angriffe gegen dich haben Vorteil, und Treffer aus nächster Nähe sind kritisch.',
  'Turned to stone until the fight is over. Cannot act; damage is halved.': 'Bis zum Ende des Kampfes zu Stein erstarrt. Kann nicht handeln; Schaden wird halbiert.',
  'Disadvantage on attack rolls and ability checks.': 'Nachteil bei Angriffswürfen und Attributswürfen.',
  'Knocked down. Getting up costs half your movement. Melee attacks against you have advantage.': 'Zu Boden geworfen. Aufstehen kostet die halbe Bewegung. Nahkampfangriffe gegen dich haben Vorteil.',
  'Speed 0. Own attacks have disadvantage, attacks against you have advantage.': 'Bewegungsrate 0. Eigene Angriffe haben Nachteil, Angriffe gegen dich haben Vorteil.',
  'Cannot act or move. Attacks against you have advantage.': 'Kann weder handeln noch sich bewegen. Angriffe gegen dich haben Vorteil.',
  'Cannot act until woken by damage. Attacks against you have advantage.': 'Kann nicht handeln, bis Schaden dich weckt. Angriffe gegen dich haben Vorteil.',

  // ------------------------------------------------- what the log says
  'Unknown monster type "{0}".': 'Unbekannte Monsterart „{0}“.',
  'Closest in the catalogue: {0}.': 'Am ähnlichsten im Katalog: {0}.',
  '{0} is held fast and cannot move': '{0} wird festgehalten und kann sich nicht bewegen',
  '{0} is frightened of {1} and will not go closer': '{0} fürchtet sich vor {1} und geht nicht näher heran',
  '(resistant, halved)': '(resistent, halbiert)',
  '{0} refuses to fall (Undead Fortitude).': '{0} weigert sich zu fallen (Untote Zähigkeit).',
  '{0} is charmed by {1} and cannot bring themself to harm it': '{0} ist von {1} bezaubert und bringt es nicht über sich, anzugreifen',
  '{0} {1} parries the blow.': '{0} {1} pariert den Hieb.',
  '{0} is blinded and cannot aim that at {1}': '{0} ist blind und kann damit nicht auf {1} zielen',
  '{0} fails the save but shrugs it off with Legendary Resistance ({1} left).': '{0} verpatzt den Rettungswurf, schüttelt es aber mit Legendärer Resistenz ab (noch {1}).',
  "{0}'s wounds do not close this turn.": 'Die Wunden von {0} schliessen sich in diesem Zug nicht.',
  '{0} regenerates {1} HP.': '{0} regeneriert {1} TP.',
  '{0} gathers itself: {1} is ready again.': '{0} sammelt sich: {1} ist wieder bereit.',
  '{0} is seared by the aura around {1}: {2}.': '{0} wird von der Aura um {1} versengt: {2}.',
  '{0} casts {1}.': '{0} wirkt {1}.',
  '{0} casts {1}!': '{0} wirkt {1}!',
  '{0} bursts apart: {1}!': '{0} zerplatzt: {1}!',
  '{0} uses {1}!': '{0} setzt {1} ein!',
  '{0} takes half: {1}.': '{0} erleidet die Hälfte: {1}.',
  '{0} takes {1}.': '{0} erleidet {1}.',
  'Legendary action: {0} uses {1}.': 'Legendäre Aktion: {0} setzt {1} ein.',
  '{0} is no longer {1}.': '{0} ist nicht mehr {1}.',
  '{0} cannot resist {1}: the {2} save fails automatically.': '{0} kann {1} nicht widerstehen: Der {2}-Rettungswurf misslingt automatisch.',
  '{0}: {1} save against {2}, {3}{4} = {5} vs DC {6}. {7}': '{0}: {1}-Rettungswurf gegen {2}, {3}{4} = {5} gegen SG {6}. {7}',
  '{0} is hurled {1} ft back.': '{0} wird {1} Fuss zurückgeschleudert.',
  'The charge hits {0} for another {1}.': 'Der Ansturm trifft {0} für weitere {1}.',
  '{0} is now {1}.': '{0} ist jetzt {1}.',
  'Breaking free takes an action and a check against DC {0}.': 'Losreissen kostet eine Aktion und einen Wurf gegen SG {0}.',
  '{0} is {1} and loses the turn.': '{0} ist {1} und verliert den Zug.',
  '{0} gets back up, which costs half the movement.': '{0} steht wieder auf, das kostet die halbe Bewegung.',
  'It gets worse: {0} is now {1}.': 'Es wird schlimmer: {0} ist jetzt {1}.',
  '{0} is not held by anything': '{0} wird von nichts festgehalten',
  'Break free': 'Losreissen',
  '{0} strains to break free: {1}{2} = {3} vs DC {4}. {5}': '{0} stemmt sich gegen den Griff: {1}{2} = {3} gegen SG {4}. {5}',
  'Free!': 'Frei!',
  'The grip holds.': 'Der Griff hält.',
  '{0} {1} for {2}.': '{0} {1}: {2}.',
  '{0} {1}.': '{0} {1}.',
  '{0} strikes {1} unerringly:': '{0} trifft {1} unfehlbar:',

  // ------------------------------------------------------ the game screen
  'Wrestle out of the grip: a Strength (Athletics) or Dexterity (Acrobatics) check against DC {dc}. Until you are free you cannot move.': 'Reiss dich aus dem Griff los: ein Wurf auf Stärke (Athletik) oder Geschicklichkeit (Akrobatik) gegen SG {dc}. Bis du frei bist, kannst du dich nicht bewegen.',
  'Challenge {cr}': 'Herausforderung {cr}',
  'Legendary actions left this round: {left} of {uses}': 'Legendäre Aktionen in dieser Runde: noch {left} von {uses}',
};

// German for the twelve classes: what the engine writes about their features, and the
// words the creator, the sheet and the level-up screen use for them.
export const DE_CLASSES: Record<string, string> = {
  // Classes and subclasses
  'Barbarian': 'Barbar', 'Bard': 'Barde', 'Monk': 'Mönch', 'Paladin': 'Paladin', 'Ranger': 'Waldläufer', 'Sorcerer': 'Zauberer', 'Warlock': 'Hexenmeister',
  'Barbarian (female)': 'Barbarin', 'Bard (female)': 'Bardin', 'Druid (female)': 'Druidin', 'Monk (female)': 'Mönchin', 'Paladin (female)': 'Paladinin',
  'Ranger (female)': 'Waldläuferin', 'Sorcerer (female)': 'Zauberin', 'Warlock (female)': 'Hexenmeisterin',
  'Raging warrior who shrugs off blows. Greataxe and Rage.': 'Rasender Krieger, der Hiebe abschüttelt. Zweihandaxt und Kampfrausch.',
  'Inspiring performer with healing magic and a sharp tongue.': 'Mitreissender Künstler mit Heilmagie und spitzer Zunge.',
  'Nature caster who fights as a wolf or a bear.': 'Naturzauberer, der als Wolf oder Bär kämpft.',
  'Unarmored martial artist. Many fast strikes powered by focus.': 'Kampfkünstler ohne Rüstung. Viele schnelle Schläge, angetrieben von Fokus.',
  'Holy knight in heavy armor. Lay on Hands and Divine Smite.': 'Heiliger Ritter in schwerer Rüstung. Handauflegen und Göttliches Niederstrecken.',
  "Wilderness hunter with bow and Hunter's Mark.": 'Jäger der Wildnis mit Bogen und Zeichen des Jägers.',
  'Born with magic. Bends spells with sorcery points.': 'Mit Magie geboren. Formt Zauber mit Zauberpunkten.',
  'Bound to a patron. Eldritch Blast and mana that returns on a short rest.': 'An einen Schutzherrn gebunden. Schauriger Strahl und Mana, das bei einer kurzen Rast zurückkehrt.',
  'Path of the Berserker': 'Pfad des Berserkers', 'College of Lore': 'Schule des Wissens', 'Circle of the Land': 'Zirkel des Landes',
  'Warrior of the Open Hand': 'Krieger der Offenen Hand', 'Oath of Devotion': 'Schwur der Hingabe', 'Hunter': 'Jäger',
  'Draconic Sorcery': 'Drakonische Zauberei', 'Fiend Patron': 'Schutzherr: Unhold',
  'Hit die d12': 'Trefferwürfel W12',
  'Bonus action. Regain 1d10 + your level hit points.': 'Bonusaktion. Erhalte 1W10 + deine Stufe Trefferpunkte zurück.',
  'Push past your limits: take one more action this turn.': 'Geh über deine Grenzen: Führe in diesem Zug eine weitere Aktion aus.',
  'Exhale fire: the target and every enemy next to it make a DEX save (DC 8 + CON + proficiency), taking 1d10 fire damage or half on a success. 2d10 from level 5, 3d10 from 11, 4d10 from 17. Once per rest.':
    'Speie Feuer: Das Ziel und jeder Gegner daneben legen einen GES-Rettungswurf ab (SG 8 + KON + Übungsbonus) und erleiden 1W10 Feuerschaden oder die Hälfte bei Erfolg. 2W10 ab Stufe 5, 3W10 ab 11, 4W10 ab 17. Einmal pro Rast.',

  // Feats and boons
  'Grappler': 'Ringer', 'Punch and Grab': 'Schlagen und Packen',
  'Boon of Combat Prowess': 'Gabe der Kampffertigkeit', 'Peerless Aim': 'Unvergleichliches Zielen',
  'Boon of Irresistible Offense': 'Gabe des Unwiderstehlichen Angriffs', 'Overcome Defenses': 'Verteidigung überwinden', 'Overwhelming Strike': 'Überwältigender Schlag',
  'Boon of Spell Recall': 'Gabe der Zaubererinnerung', 'Free Casting': 'Freies Wirken',
  'Boon of Fate': 'Gabe des Schicksals', 'Improve Fate': 'Schicksal wenden',
  'Boon of Truesight': 'Gabe des Wahren Blicks', 'Truesight': 'Wahrer Blick',
  'Boon of the Night Spirit': 'Gabe des Nachtgeists', 'Shadowy Form': 'Schattengestalt',
  'Boon of Dimensional Travel': 'Gabe des Dimensionsreisens', 'Blink Steps': 'Flimmerschritte',
  'Grappler: +1 Strength or Dexterity; you are skilled at seizing and holding foes': 'Ringer: +1 Stärke oder Geschicklichkeit; du verstehst dich darauf, Gegner zu packen und festzuhalten',
  'Boon of Combat Prowess: once per turn, an attack that misses hits instead': 'Gabe der Kampffertigkeit: Einmal pro Zug trifft ein Angriff, der verfehlt, stattdessen doch',
  'Boon of Irresistible Offense: your weapon damage ignores resistance, and a natural 20 deals extra damage equal to your Strength or Dexterity score':
    'Gabe des Unwiderstehlichen Angriffs: Dein Waffenschaden ignoriert Resistenzen, und eine natürliche 20 verursacht Zusatzschaden in Höhe deines Stärke- oder Geschicklichkeitswerts',
  'Boon of Spell Recall: a spell of 1st to 4th level has a one in four chance to cost no mana': 'Gabe der Zaubererinnerung: Ein Zauber des 1. bis 4. Grades kostet mit einer Chance von eins zu vier kein Mana',
  'Boon of Fate: once per fight, add 2d4 to a saving throw you would fail': 'Gabe des Schicksals: Einmal pro Kampf 2W4 auf einen Rettungswurf, der misslingen würde',
  'Boon of Truesight: you see in darkness out to 60 ft': 'Gabe des Wahren Blicks: Du siehst in Dunkelheit bis 60 ft weit',
  'Boon of the Night Spirit: in dim light or darkness you resist all damage except psychic and radiant': 'Gabe des Nachtgeists: In schwachem Licht oder Dunkelheit bist du gegen allen Schaden ausser psychischem und gleissendem resistent',
  'Boon of Dimensional Travel: after an attack or a spell you may teleport up to 30 ft': 'Gabe des Dimensionsreisens: Nach einem Angriff oder Zauber darfst du dich bis zu 30 ft weit teleportieren',

  // Kits
  'Axe and Shield': 'Axt und Schild', "Troubadour's Pack": 'Troubadour-Ausrüstung', "Wanderer's Pack": 'Wanderer-Ausrüstung', 'Staff and Shield': 'Stab und Schild',
  "Herbalist's Pack": 'Kräuterkundler-Ausrüstung', 'Staff': 'Stab', 'Bare Hands': 'Blosse Hände', 'Staff and Lantern': 'Stab und Laterne', "Occultist's Pack": 'Okkultisten-Ausrüstung',

  // Trophies
  'Rising Heroes': 'Aufstrebende Helden', 'Masters of the Craft': 'Meister ihres Fachs', 'Reach level 11.': 'Erreicht Stufe 11.', 'Reach level 20.': 'Erreicht Stufe 20.',

  // Interface
  'Raise one ability by 1.': 'Erhöhe ein Attribut um 1.',
  'No spells in beast form.': 'Keine Zauber in Tiergestalt.',
  'No spells while raging.': 'Keine Zauber im Kampfrausch.',
  'None left. It comes back after a rest.': 'Aufgebraucht. Kommt nach einer Rast zurück.',
  'Free': 'Frei',
  'Choose {n}.': 'Wähle {n}.',
  'Temporary hit points': 'Temporäre Trefferpunkte',
  'Comes back after a short rest.': 'Kommt nach einer kurzen Rast zurück.',
  'Comes back after a long rest.': 'Kommt nach einer langen Rast zurück.',

  // Powers a hero switches on, and what the new conditions on monsters are called
  'raging': 'im Kampfrausch', 'reckless': 'rücksichtslos', 'sacred weapon': 'heilige Waffe', 'innate sorcery': 'angeborene Zauberei',
  'superior defense': 'überlegene Verteidigung', 'holy nimbus': 'heiliger Nimbus', 'invisible': 'unsichtbar', 'turned': 'vertrieben', 'rattled': 'erschüttert',
  'Resists bludgeoning, piercing and slashing damage, hits harder with Strength, advantage on Strength checks and saves. No spells.':
    'Resistent gegen Wucht-, Stich- und Hiebschaden, trifft mit Stärke härter, Vorteil auf Stärkeproben und -rettungswürfe. Keine Zauber.',
  'Strength-based attacks have advantage, and so do all attacks against you, until your next turn.': 'Angriffe mit Stärke haben Vorteil, alle Angriffe gegen dich aber auch, bis zu deinem nächsten Zug.',
  'Charisma is added to weapon attack rolls, and the weapon can deal radiant damage.': 'Charisma wird auf Waffenangriffswürfe addiert, und die Waffe kann gleissenden Schaden verursachen.',
  'Spell save DC +1 and advantage on spell attack rolls.': 'Zauber-SG +1 und Vorteil auf Zauberangriffswürfe.',
  'Resists all damage except force.': 'Resistent gegen allen Schaden ausser Energie.',
  'Enemies that start their turn close by take radiant damage; advantage on saves against fiends and undead.': 'Gegner, die ihren Zug in der Nähe beginnen, erleiden gleissenden Schaden; Vorteil auf Rettungswürfe gegen Unholde und Untote.',
  'Cannot be seen: own attacks have advantage, attacks against you have disadvantage.': 'Nicht zu sehen: Eigene Angriffe haben Vorteil, Angriffe gegen dich Nachteil.',

  // Levelling and choices
  '{0} improves': '{0} wird besser',
  'Choose an epic boon, a feat or raise your ability scores': 'Wähle eine epische Gabe, ein Talent oder erhöhe deine Attribute',
  'Choose {0}: {1}': 'Wähle {0}: {1}',
  'Choose: {0}': 'Wähle: {0}',
  '{0} cannot choose that': '{0} kann das nicht wählen',
  '{0} gains Expertise in {1}.': '{0} erlangt Expertise in {1}.',
  '{0} becomes proficient in {1}.': '{0} wird geübt in {1}.',

  // Attacks
  '{0} {1} for {2}{3}.{4}': '{0} {1}: {2}{3}.{4}',
  '{0} {1} for {2}.{3}': '{0} {1}: {2}.{3}',
  '{0} rages on with {1} HP.': '{0} wütet mit {1} TP weiter.',
  'Heroic Warrior: the {0} is rolled again.': 'Heldenhafter Krieger: Die {0} wird neu gewürfelt.',
  'Bardic Inspiration adds {0}.': 'Bardische Inspiration addiert {0}.',
  'Peerless Aim turns the miss into a hit.': 'Unvergleichliches Zielen macht aus dem Fehlschlag einen Treffer.',
  'Stroke of Luck turns the miss into a hit.': 'Glückstreffer macht aus dem Fehlschlag einen Treffer.',
  'Horde Breaker: {0} follows through against {1}.': 'Hordenbrecher: {0} setzt gegen {1} nach.',
  'The vibrations tear through {0} for {1} {2}.{3}': 'Die Schwingungen zerreissen {0}: {1} {2}.{3}',
  '{0} is hurled through the lower planes and returns with {1} {2}.{3}': '{0} wird durch die Niederen Ebenen geschleudert und kehrt mit {1} {2} zurück.{3}',
  "The mark's force leaps to {0} for {1} {2}.{3}": 'Die Kraft des Zeichens springt auf {0} über: {1} {2}.{3}',
  '{0} retaliates!': '{0} schlägt zurück!',
  "{0} {1}'s Cutting Words take {2} off the roll: Miss.": '{0} Die Schneidenden Worte von {1} ziehen {2} vom Wurf ab: Verfehlt.',
  "{0}'s Cutting Words take {1} off the roll, but the blow still lands.": 'Die Schneidenden Worte von {0} ziehen {1} vom Wurf ab, doch der Hieb sitzt trotzdem.',
  '{0} twists away and halves the blow.': '{0} dreht sich weg und halbiert den Treffer.',
  '{0} deflects the attack, reducing the damage by {1}.': '{0} lenkt den Angriff ab und verringert den Schaden um {1}.',
  '{0} rallies and regains {1} HP (Survivor).': '{0} rafft sich auf und erhält {1} TP zurück (Überlebender).',
  '{0} is visible again.': '{0} ist wieder sichtbar.',
  "{0} burns in {1}'s holy nimbus for {2} {3}.{4}": '{0} brennt im heiligen Nimbus von {1}: {2} {3}.{4}',

  // Spells
  '{0} cannot cast spells while raging': '{0} kann im Kampfrausch keine Zauber wirken',
  '{0} cannot cast spells in beast form': '{0} kann in Tiergestalt keine Zauber wirken',
  'Spell Recall: {0} costs {1} no mana.': 'Zaubererinnerung: {0} kostet {1} kein Mana.',
  'Seeking Spell: the attack is rolled again.': 'Suchender Zauber: Der Angriff wird neu gewürfelt.',

  // Saves and wards
  '{0} cannot be {1} ({2}).': '{0} kann nicht {1} werden ({2}).',
  '{0} cannot be {1}.': '{0} kann nicht {1} werden.',
  '{0}: {1} adds {2}, {3} vs DC {4}. {5}': '{0}: {1} addiert {2}, {3} gegen SG {4}. {5}',
  '{0}: {1} rolls the save again, {2}{3} = {4} vs DC {5}. {6}': '{0}: {1} wiederholt den Rettungswurf, {2}{3} = {4} gegen SG {5}. {6}',
  "{0}'s Countercharm": 'Bannlied von {0}',

  // Resources
  '{0}: {1} restores {2}.': '{0}: {1} stellt {2} wieder her.',
  "{0}'s Uncanny Metabolism restores all focus and {1} HP.": 'Der Unheimliche Stoffwechsel von {0} stellt allen Fokus und {1} TP wieder her.',
  '{0} has no {1} left': '{0} hat {1} aufgebraucht',
  'Choose an ally': 'Wähle einen Verbündeten',
  '{0} can be used once per turn': '{0} geht nur einmal pro Zug',
  '{0} takes a minute of quiet': '{0} braucht eine Minute Ruhe',

  // Barbarian
  '{0} cannot rage in heavy armor': '{0} kann in schwerer Rüstung nicht in Kampfrausch verfallen',
  '{0} flies into a rage!': '{0} verfällt in Kampfrausch!',
  '{0} attacks recklessly.': '{0} greift rücksichtslos an.',
  '{0} needs a Reckless Attack first': '{0} braucht zuerst einen Rücksichtslosen Angriff',
  '{0} winds up a Brutal Strike.': '{0} holt zu einem Brutalen Schlag aus.',
  '{0} lets out a terrible roar.': '{0} stösst ein furchtbares Gebrüll aus.',
  // Bard
  '{0} cannot hear it': '{0} kann es nicht hören',
  '{0} inspires {1}: a d{2} waits for the next attack or save that fails.': '{0} inspiriert {1}: Ein W{2} wartet auf den nächsten Angriff oder Rettungswurf, der misslingt.',
  // Cleric
  "{0}'s Divine Spark restores {1} HP to {2}.": 'Der Göttliche Funke von {0} gibt {2} {1} TP zurück.',
  "{0}'s Divine Spark sears {1} for {2} {3}.{4}": 'Der Göttliche Funke von {0} versengt {1}: {2} {3}.{4}',
  'There are no undead within 30 ft': 'Im Umkreis von 30 ft sind keine Untoten',
  '{0} presents the holy symbol and speaks a prayer against the undead.': '{0} erhebt das heilige Symbol und spricht ein Gebet gegen die Untoten.',
  '{0} is seared for {1} {2}.{3}': '{0} wird versengt: {1} {2}.{3}',
  'Nobody nearby is below half their hit points': 'Niemand in der Nähe hat weniger als die Hälfte der Trefferpunkte',
  '{0} channels life into the wounded: {1} HP.': '{0} lässt Leben in die Verwundeten fliessen: {1} TP.',
  // Druid
  '{0} takes the shape of a {1} (AC {2}, {3} temporary HP).': '{0} nimmt die Gestalt an: {1} (RK {2}, {3} temporäre TP).',
  '{0} is not in beast form': '{0} ist nicht in Tiergestalt',
  '{0} returns to their own shape.': '{0} kehrt in die eigene Gestalt zurück.',
  'Thorns and vines burst from the ground around {0}.': 'Dornen und Ranken brechen rings um {0} aus dem Boden.',
  '{0} takes {1} {2}.{3}': '{0} erleidet {1} {2}.{3}',
  'The land restores {0} HP to {1}.': 'Das Land gibt {1} {0} TP zurück.',
  // Monk
  '{0} settles into Patient Defense.': '{0} geht in die Geduldige Verteidigung.',
  '{0} moves with the Step of the Wind, gaining {1} ft of movement.': '{0} bewegt sich mit dem Schritt des Windes und gewinnt {1} ft Bewegung.',
  '{0} gathers focus for a Stunning Strike.': '{0} sammelt Fokus für einen Betäubenden Schlag.',
  '{0} readies the Quivering Palm.': '{0} bereitet die Vibrierende Handfläche vor.',
  '{0} hardens body and mind against all harm.': '{0} härtet Körper und Geist gegen jeden Schaden.',
  // Paladin
  '{0} lays hands on {1}, restoring {2} HP ({3} left in the pool).': '{0} legt {1} die Hände auf und stellt {2} TP wieder her (noch {3} im Vorrat).',
  '{0} follows a melee hit of yours this turn': '{0} folgt auf einen deiner Nahkampftreffer in diesem Zug',
  '{0} smites {1} for {2} {3}.{4}': '{0} streckt {1} nieder: {2} {3}.{4}',
  "{0}'s weapon blazes with sacred light.": 'Die Waffe von {0} erstrahlt in heiligem Licht.',
  '{0} raises the holy symbol against the enemy.': '{0} erhebt das heilige Symbol gegen den Feind.',
  '{0} is wreathed in a holy nimbus.': '{0} ist von einem heiligen Nimbus umhüllt.',
  // Ranger and warlock
  '{0} lays a hex on {1}.': '{0} belegt {1} mit einem Fluch.',
  '{0} marks {1} as prey.': '{0} zeichnet {1} als Beute.',
  '{0} shakes off weariness and has {1} temporary HP.': '{0} schüttelt die Müdigkeit ab und hat {1} temporäre TP.',
  '{0} fades from sight.': '{0} entschwindet dem Blick.',
  // Rogue
  '{0} only works before you move': '{0} geht nur, bevor du dich bewegst',
  '{0} takes careful aim.': '{0} zielt sorgfältig.',
  '{0} looks for a chance to trip the target.': '{0} sucht nach einer Gelegenheit, das Ziel zu Fall zu bringen.',
  '{0} readies a poisoned strike.': '{0} bereitet einen vergifteten Stich vor.',
  '{0} readies a dazing strike.': '{0} bereitet einen benommen machenden Schlag vor.',
  // Sorcerer
  "{0}'s innate magic flares up.": 'Die angeborene Magie von {0} flammt auf.',
  "{0}'s mana is already full": '{0} hat bereits volles Mana',
  '{0} turns sorcery points into mana (now {1}).': '{0} wandelt Zauberpunkte in Mana um (jetzt {1}).',
  '{0} quickens the next spell.': '{0} beschleunigt den nächsten Zauber.',
  '{0} empowers the next spell.': '{0} verstärkt den nächsten Zauber.',
  '{0} heightens the next spell.': '{0} steigert den nächsten Zauber.',
  '{0} stretches the reach of the next spell.': '{0} dehnt die Reichweite des nächsten Zaubers.',
  // Warlock and wizard
  '{0} performs an esoteric rite and has {1} mana again.': '{0} vollzieht einen geheimen Ritus und hat wieder {1} Mana.',
  '{0} opens a rift to the lower planes.': '{0} öffnet einen Riss zu den Niederen Ebenen.',
  '{0} draws more power than is wise.': '{0} zieht mehr Macht, als klug ist.',
};

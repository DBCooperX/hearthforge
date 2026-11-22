// Icons for skills, feats, spells and class features, from game-icons.net (CC BY 3.0).
//
// Nothing here is bundled: the server downloads the files it lists from the game-icons
// repository (see ArtStore.install in server/src/artLibrary.ts), the same way it does for item
// icons, and the client shows them in place of the emoji of the entry. When the icon set is not
// installed, or the owner chose another pack or "Emoji", the emoji stays.
//
// A key is "<kind>:<id>". Every entry also has a fallback, so a new spell or feature never ends
// up without a picture: a spell falls back to its school, a skill to its ability, a class
// feature to its class (see glyphKeys). Every path was checked against the repository when this
// table was written; `node scripts/check-game-icons.mjs` checks them again.
import { CLASS_FEATURES, OPTIONS, optionLine, featureLine, CLASS_IDS } from './classes';
import { EFFECT_LINES, FEATS, SPECIES, STYLES, effectLine } from './rules';
import { SKILLS } from './content';

export type GlyphKind = 'spell' | 'skill' | 'feat' | 'feature' | 'class' | 'ability' | 'school' | 'condition' | 'action' | 'place' | 'shop' | 'ui';

type Table = Record<string, string>;

const ABILITY: Table = {
  cha: 'lorc/charm', con: 'sbed/health-normal', dex: 'lorc/feather', int: 'lorc/brain', str: 'lorc/muscle-up', wis: 'lorc/owl',
};

const CLASS: Table = {
  barbarian: 'delapouite/barbarian', bard: 'lorc/lyre', cleric: 'lorc/holy-symbol', druid: 'delapouite/oak-leaf', fighter: 'lorc/crossed-swords',
  monk: 'lorc/fist', paladin: 'delapouite/templar-shield', ranger: 'delapouite/bow-arrow', rogue: 'lorc/daggers', sorcerer: 'lorc/magic-swirl',
  warlock: 'skoll/evil-eyes', wizard: 'lorc/wizard-staff',
};

const SCHOOL: Table = {
  abjuration: 'sbed/shield', conjuration: 'lorc/magic-portal', divination: 'lorc/crystal-ball', enchantment: 'lorc/charm',
  evocation: 'lorc/lightning-storm', illusion: 'lorc/domino-mask', necromancy: 'sbed/death-skull', transmutation: 'lorc/magic-swirl',
};

const SKILL: Table = {
  acrobatics: 'lorc/cartwheel', 'animal handling': 'lorc/paw-print', arcana: 'delapouite/spell-book', athletics: 'lorc/muscle-up',
  deception: 'lorc/domino-mask', history: 'delapouite/ancient-columns', insight: 'lorc/third-eye', intimidation: 'lorc/screaming',
  investigation: 'lorc/magnifying-glass', medicine: 'sbed/medical-pack', nature: 'delapouite/oak-leaf', perception: 'lorc/eyeball',
  performance: 'lorc/lyre', persuasion: 'lorc/conversation', religion: 'lorc/holy-symbol', 'sleight of hand': 'delapouite/magic-hat',
  stealth: 'lorc/ninja-mask', survival: 'lorc/campfire',
};

const FEAT: Table = {
  alert: 'delapouite/eye-target', asi: 'delapouite/upgrade', boon_combat_prowess: 'lorc/trophy', boon_dimensional_travel: 'lorc/portal',
  boon_fate: 'delapouite/dice-fire', boon_irresistible_offense: 'delapouite/sword-brandish', boon_night_spirit: 'lorc/moon',
  boon_spell_recall: 'lorc/cycle', boon_truesight: 'lorc/eye-shield', grappler: 'lorc/grab', magic_initiate_cleric: 'lorc/holy-symbol',
  magic_initiate_wizard: 'delapouite/magic-hat', savage_attacker: 'lorc/claw-slashes', skilled: 'delapouite/graduate-cap',
};

const FEATURE: Table = {
  abjure_foes: 'lorc/holy-symbol', acrobatic_movement: 'lorc/run', action_surge: 'lorc/lightning-helix', additional_fighting_style: 'lorc/sword-clash',
  adrenaline_rush: 'lorc/lightning-helix', aff_acid: 'sbed/acid', aff_cold: 'lorc/snowflake-1', aff_fire: 'carl-olsen/flame',
  aff_lightning: 'lorc/lightning-storm', aff_poison: 'lorc/poison-bottle', arcane_apotheosis: 'lorc/lightning-storm', arcane_recovery: 'lorc/cycle',
  archdruid: 'cathelineau/tree-face', aura_expansion: 'lorc/aura', aura_of_courage: 'lorc/lion', aura_of_devotion: 'lorc/aura',
  aura_of_protection: 'sbed/shield', bardic_inspiration: 'delapouite/musical-notes', beast_spells: 'lorc/paw-print', black_bear: 'delapouite/bear-head',
  blessed_healer: 'delapouite/healing', blessed_strikes: 'delapouite/sword-brandish', body_and_mind: 'lorc/brain',
  bonus_proficiencies: 'delapouite/star-medal', breath_weapon: 'lorc/dragon-breath', brown_bear: 'delapouite/bear-head',
  brutal_strike: 'lorc/battered-axe', channel: 'lorc/holy-symbol', channel_divinity: 'lorc/holy-symbol', contact_patron: 'skoll/evil-eyes',
  countercharm: 'skoll/sound-waves', cunning_action: 'lorc/run', cunning_daze: 'skoll/spinning-top', cunning_poison: 'lorc/poison-bottle',
  cunning_strike: 'lorc/backstab', cunning_trip: 'lorc/tripwire', cutting_words: 'delapouite/tongue', danger_sense: 'delapouite/alarm-clock',
  dark_luck: 'lorc/clover', dark_ones_blessing: 'lorc/dark-squad', dark_ones_own_luck: 'lorc/clover', dash: 'lorc/run',
  defensive_tactics: 'sbed/shield', deflect_attacks: 'lorc/shield-reflect', deflect_energy: 'lorc/shield-reflect', deft_explorer: 'lorc/compass',
  devious_strikes: 'lorc/dripping-knife', dire_wolf: 'lorc/wolf-head', disciple_of_life: 'delapouite/healing',
  disciplined_survivor: 'delapouite/yin-yang', divine_intervention: 'lorc/angel-wings', divine_order: 'delapouite/church',
  divine_smite: 'lorc/sunbeams', divine_spark_harm: 'lorc/sun', divine_spark_heal: 'delapouite/healing', dodge: 'lorc/dodging',
  draconic_resilience: 'lorc/dragon-head', dragon_companion: 'lorc/dragon-head', dragon_wings: 'lorc/wing-cloak', druidic: 'delapouite/oak-leaf',
  eldritch_invocations: 'lorc/tentacles-skull', eldritch_master: 'skoll/evil-eyes', elemental_affinity: 'lorc/fire-ring',
  elemental_fury: 'lorc/lightning-tree', elusive: 'lorc/ghost', empowered_evocation: 'lorc/lightning-storm', empowered_strikes: 'lorc/fist',
  evasion: 'lorc/dodging', evocation_savant: 'delapouite/fire-spell-cast', expertise: 'delapouite/star-medal', extra_attack: 'lorc/crossed-swords',
  faithful_steed: 'lorc/horse-head', fast_hands: 'delapouite/hand-grip', fast_movement: 'lorc/run', favored_enemy: 'lorc/target-arrows',
  feral_instinct: 'lorc/wolf-head', feral_senses: 'delapouite/nose-side', fiendish_resilience: 'delapouite/devil-mask',
  fighting_style: 'lorc/sword-clash', fleet_step: 'lorc/wingfoot', flurry_of_blows: 'lorc/punch', focus: 'lorc/meditation',
  foe_slayer: 'sbed/death-skull', font_of_inspiration: 'lorc/fountain', font_of_magic: 'sbed/water-drop', free_smite: 'lorc/sunbeams',
  frenzy: 'delapouite/enrage', fury_spellcasting: 'lorc/lightning-storm', fury_strike: 'lorc/wolf-head',
  greater_divine_intervention: 'lorc/angel-wings', heightened_focus: 'lorc/meditation', heroic_warrior: 'lorc/laurels', hex: 'skoll/evil-eyes',
  holy_nimbus: 'lorc/sun', hunters_lore: 'lorc/open-book', hunters_mark: 'lorc/target-arrows', hunters_prey: 'lorc/target-arrows',
  hurl: 'skoll/burning-skull', hurl_through_hell: 'skoll/burning-skull', improved_blessed_strikes: 'lorc/sun-radiations',
  improved_brutal_strike: 'lorc/battered-axe', improved_critical: 'lorc/sword-wound', improved_cunning_strike: 'lorc/dripping-knife',
  improved_elemental_fury: 'lorc/lightning-tree', indomitable: 'lorc/rock', indomitable_might: 'lorc/muscle-up',
  innate_sorcery: 'delapouite/fire-spell-cast', inspiration: 'delapouite/musical-notes', instinctive_pounce: 'sbed/pounce',
  intimidating_presence: 'lorc/screaming', inv_agonizing: 'lorc/lightning-storm', inv_armor: 'lorc/shadow-follower',
  inv_blade: 'delapouite/sword-brandish', inv_chain: 'lorc/crossed-chains', inv_leap: 'delapouite/jump-across', inv_lifedrinker: 'lorc/bleeding-heart',
  inv_mask: 'lorc/domino-mask', inv_mind: 'lorc/brain', inv_repelling: 'lorc/wind-slap', inv_shadows: 'lorc/shadow-follower',
  inv_sight: 'delapouite/devil-mask', inv_spear: 'lorc/spear-hook', inv_step: 'lorc/angel-wings', inv_thirsting: 'lorc/dripping-knife',
  inv_tome: 'lorc/evil-book', inv_vigor: 'delapouite/healing', inv_visions: 'delapouite/fog', inv_whispers: 'lorc/tombstone',
  inv_witch: 'lorc/eye-shield', jack_of_all_trades: 'delapouite/swiss-army-knife', land_arid: 'delapouite/desert', land_polar: 'lorc/snowflake-2',
  land_temperate: 'lorc/oak', land_tropical: 'delapouite/palm-tree', lands_aid: 'delapouite/oak-leaf', lay_on_hands: 'delapouite/hand-of-god',
  magical_cunning: 'lorc/cycle', magical_discoveries: 'lorc/scroll-unfurled', magical_secrets: 'delapouite/secret-book', martial_arts: 'lorc/fist',
  martial_strike: 'lorc/fist', memorize_spell: 'lorc/brain', meta_distant: 'lorc/spyglass', meta_empowered: 'lorc/lightning-storm',
  meta_extended: 'lorc/hourglass', meta_heightened: 'lorc/target-arrows', meta_quickened: 'lorc/lightning-helix', meta_seeking: 'delapouite/crosshair',
  meta_subtle: 'lorc/hidden', meta_transmuted: 'lorc/rainbow-star', metamagic: 'lorc/magic-swirl', mindless_rage: 'lorc/skull-crack',
  monks_focus: 'lorc/meditation', mystic_arcanum: 'lorc/evil-book', natural_recovery: 'lorc/sprout', natures_sanctuary: 'delapouite/tree-roots',
  natures_veil: 'delapouite/oak-leaf', natures_ward: 'delapouite/oak-leaf', nimbus: 'lorc/sun', open_hand_technique: 'skoll/open-palm',
  order_protector: 'sbed/shield', order_thaumaturge: 'lorc/holy-symbol', overchannel: 'lorc/lightning-trio', pact_magic: 'lorc/evil-book',
  paladins_smite: 'lorc/sunbeams', patient_defense: 'lorc/meditation', peerless_skill: 'delapouite/star-medal', perfect_focus: 'lorc/meditation',
  persistent_rage: 'delapouite/enrage', potent_cantrip: 'lorc/spark-spirit', precise_hunter: 'skoll/bullseye', presence: 'lorc/screaming',
  preserve_life: 'delapouite/first-aid-kit', prey_colossus: 'delapouite/giant', prey_horde: 'lorc/crossed-swords', primal_champion: 'lorc/trophy',
  primal_knowledge: 'lorc/wolf-howl', primal_magician: 'delapouite/oak-leaf', primal_order: 'delapouite/oak-leaf',
  primal_warden: 'delapouite/armor-upgrade', quivering_palm: 'lorc/fist', radiant_strikes: 'lorc/sun', rage: 'delapouite/enrage',
  reckless: 'delapouite/mighty-force', reckless_attack: 'delapouite/charging-bull', recovery: 'lorc/cycle', relentless_hunter: 'lorc/wolf-head',
  relentless_rage: 'delapouite/heart-beats', reliable_talent: 'delapouite/dice-six-faces-six', remarkable_athlete: 'lorc/muscle-up',
  res_acid: 'sbed/acid', res_cold: 'lorc/snowflake-1', res_fire: 'carl-olsen/flame', res_lightning: 'lorc/lightning-shield',
  res_necrotic: 'sbed/death-skull', res_poison: 'lorc/poison-bottle', res_psychic: 'lorc/brain', res_thunder: 'skoll/sound-waves',
  restoring_touch: 'delapouite/healing', retaliation: 'sbed/revolt', revert_form: 'lorc/cycle', ritual_adept: 'skoll/pentacle', roving: 'lorc/run',
  sacred_weapon: 'delapouite/sword-brandish', scholar: 'delapouite/graduate-cap', sculpt_spells: 'lorc/magic-swirl', sear_undead: 'lorc/sun',
  second_story_work: 'lorc/grapple', second_wind: 'sbed/health-normal', self_restoration: 'delapouite/arm-bandage', signature_spells: 'lorc/quill-ink',
  slippery_mind: 'lorc/brain-freeze', slow_fall: 'lorc/feather', smite_of_protection: 'sbed/shield', sneak_attack: 'lorc/backstab',
  sorcerous_restoration: 'lorc/cycle', sorcery: 'sbed/water-drop', sorcery_incarnate: 'lorc/lightning-storm', spell_mastery: 'delapouite/magic-hat',
  spellcasting: 'delapouite/spell-book', steady_aim: 'skoll/bullseye', step_of_the_wind: 'lorc/wingfoot', stroke_of_luck: 'lorc/clover',
  studied_attacks: 'lorc/target-arrows', stunning_strike: 'lorc/punch', style_archery: 'delapouite/bow-arrow', style_defense: 'sbed/shield',
  style_dueling: 'lorc/sword-clash', style_great_weapon: 'delapouite/two-handed-sword', superior_critical: 'lorc/sword-wound',
  superior_defense: 'sbed/shield', superior_hunters_defense: 'sbed/shield', superior_hunters_prey: 'lorc/target-arrows',
  superior_inspiration: 'delapouite/musical-notes', supreme_healing: 'delapouite/heart-wings', supreme_sneak: 'lorc/ninja-mask',
  survivor: 'delapouite/heart-beats', tactical_master: 'skoll/chess-king', tactical_mind: 'skoll/chess-knight', tactical_shift: 'lorc/tread',
  thiefs_reflexes: 'lorc/lightning-frequency', thieves_cant: 'delapouite/secret-book', three_extra_attacks: 'delapouite/swords-power',
  tireless: 'lorc/run', trait_brave: 'lorc/lion', trait_darkvision: 'delapouite/night-vision', trait_draconic_resistance: 'lorc/dragon-head',
  trait_dwarven_resilience: 'lorc/poison-bottle', trait_dwarven_toughness: 'delapouite/dwarf-face', trait_fey_ancestry: 'lorc/fairy',
  trait_fiendish_resistance: 'delapouite/devil-mask', trait_fleet_of_foot: 'lorc/wingfoot', trait_giant_ancestry: 'delapouite/giant',
  trait_gnomish_cunning: 'lorc/brain', trait_infernal_legacy: 'delapouite/devil-mask', trait_keen_senses: 'lorc/eyeball',
  trait_long_stride: 'lorc/boots', trait_luck: 'lorc/clover', trait_naturally_stealthy: 'lorc/ninja-mask',
  trait_otherworldly_presence: 'skoll/evil-eyes', trait_powerful_build: 'lorc/muscle-up', trait_relentless_endurance: 'delapouite/heart-beats',
  trait_resourceful: 'delapouite/backpack', trait_skillful: 'delapouite/graduate-cap', trait_stonecunning: 'lorc/stone-block',
  trait_tinker: 'lorc/gears', trait_trance: 'delapouite/night-sleep', trait_versatile: 'delapouite/swiss-army-knife', turn_undead: 'lorc/ankh',
  two_extra_attacks: 'delapouite/swords-power', unarmored_defense: 'lucasms/shirt', unarmored_movement: 'lorc/run', uncanny_dodge: 'lorc/dodging',
  uncanny_metabolism: 'delapouite/yin-yang', use_magic_device: 'delapouite/magic-axe', weapon_mastery: 'lorc/sword-smithing',
  wholeness: 'lorc/meditation', wholeness_of_body: 'lorc/meditation', wild_companion: 'lorc/paw-heart', wild_resurgence: 'lorc/cycle',
  wild_shape: 'lorc/wolf-howl', wild_shape_black_bear: 'delapouite/bear-head', wild_shape_brown_bear: 'delapouite/bear-head',
  wild_shape_dire_wolf: 'lorc/wolf-head', wild_shape_wolf: 'lorc/wolf-head', wolf: 'lorc/wolf-head', words_of_creation: 'lorc/open-book',
};

const SPELL: Table = {
  acid_arrow: 'sbed/acid', acid_splash: 'lorc/acid-blob', aid: 'lorc/muscle-up', alarm: 'delapouite/ringing-alarm', alter_self: 'delapouite/transform',
  animal_friendship: 'lorc/paw-heart', animal_messenger: 'lorc/raven', animal_shapes: 'lorc/werewolf', animate_dead: 'skoll/raise-zombie',
  animate_objects: 'lorc/haunting', antilife_shell: 'lorc/shield-echoes', antimagic_field: 'sbed/cancel', antipathy_sympathy: 'delapouite/heart-shield',
  arcane_eye: 'delapouite/all-seeing-eye', arcane_hand: 'lorc/magic-palm', arcane_lock: 'lorc/padlock', arcane_sword: 'delapouite/spiral-hilt',
  arcanists_magic_aura: 'lorc/magic-swirl', astral_projection: 'lorc/ghost', augury: 'lorc/rune-stone', aura_of_life: 'lorc/aura',
  awaken: 'lorc/sprout', bane: 'lorc/skull-slices', banishment: 'lorc/portal', barkskin: 'delapouite/tree-roots', beacon_of_hope: 'lorc/sunbeams',
  befuddlement: 'lorc/brain-freeze', bestow_curse: 'lorc/cursed-star', black_tentacles: 'lorc/tentacle-strike', blade_barrier: 'lorc/spinning-sword',
  bless: 'lorc/holy-grail', blight: 'lorc/dead-wood', blindness_deafness: 'lorc/eye-shield', blink: 'lorc/ghost', blur: 'lorc/ghost',
  burning_hands: 'lorc/burning-embers', call_lightning: 'lorc/lightning-tree', calm_emotions: 'delapouite/heart-wings',
  chain_lightning: 'lorc/lightning-branches', charm_monster: 'lorc/charm', charm_person: 'lorc/charm', chill_touch: 'lorc/grasping-claws',
  chromatic_orb: 'delapouite/glass-ball', circle_of_death: 'lorc/death-zone', clairvoyance: 'lorc/crystal-ball', clone: 'lorc/dna1',
  cloudkill: 'sbed/poison-cloud', color_spray: 'lorc/rainbow-star', command: 'lorc/pointing', commune: 'lorc/prayer', commune_with_nature: 'lorc/oak',
  comprehend_languages: 'lorc/conversation', compulsion: 'lorc/puppet', cone_of_cold: 'lorc/ice-bolt', confusion: 'lorc/brain-freeze',
  conjure_animals: 'lorc/wolf-head', conjure_celestial: 'lorc/angel-wings', conjure_elemental: 'lorc/fire-ring', conjure_fey: 'lorc/fairy',
  conjure_minor_elementals: 'lorc/fire-ring', conjure_woodland_beings: 'lorc/fairy', contact_other_plane: 'lorc/third-eye', contagion: 'lorc/virus',
  contingency: 'lorc/scroll-unfurled', continual_flame: 'delapouite/torch', control_water: 'lorc/water-bolt', control_weather: 'lorc/lightning-storm',
  counterspell: 'lorc/magic-shield', create_food_and_water: 'delapouite/bread', create_or_destroy_water: 'sbed/water-drop',
  create_undead: 'skoll/raise-zombie', creation: 'lorc/anvil', cure_wounds: 'sbed/health-increase', dancing_lights: 'lorc/lantern-flame',
  darkness: 'lorc/dark-squad', darkvision: 'lorc/eyeball', daylight: 'lorc/sunrise', death_ward: 'lorc/angel-wings',
  delayed_blast_fireball: 'lorc/fire-bomb', demiplane: 'delapouite/door', detect_evil_and_good: 'skoll/evil-eyes',
  detect_magic: 'lorc/magnifying-glass', detect_poison_and_disease: 'lorc/poison-bottle', detect_thoughts: 'lorc/brain',
  dimension_door: 'delapouite/door', disguise_self: 'lorc/domino-mask', disintegrate: 'lorc/disintegrate', dispel_evil_and_good: 'sbed/cancel',
  dispel_magic: 'sbed/cancel', dissonant_whispers: 'skoll/sound-waves', divination: 'lorc/crystal-ball', divine_favor: 'lorc/holy-grail',
  divine_word: 'lorc/holy-symbol', dominate_beast: 'lorc/wolf-head', dominate_monster: 'lorc/puppet', dominate_person: 'lorc/puppet',
  dragons_breath: 'lorc/dragon-breath', dream: 'delapouite/night-sleep', druidcraft: 'lorc/sprout', earthquake: 'lorc/earth-crack',
  eldritch_blast: 'lorc/magic-swirl', elementalism: 'lorc/fire-ring', enhance_ability: 'lorc/muscle-up', enlarge_reduce: 'delapouite/giant',
  ensnaring_strike: 'delapouite/vines', entangle: 'lorc/thorny-vine', enthrall: 'lorc/sing', etherealness: 'lorc/ghost-ally',
  expeditious_retreat: 'lorc/run', eyebite: 'skoll/evil-eyes', fabricate: 'lorc/anvil', faerie_fire: 'lorc/fairy',
  faithful_hound: 'delapouite/dog-bowl', false_life: 'delapouite/heart-beats', fear: 'lorc/screaming', feather_fall: 'lorc/feather',
  find_familiar: 'lorc/owl', find_steed: 'lorc/horse-head', find_the_path: 'lorc/compass', find_traps: 'lorc/tripwire',
  finger_of_death: 'lorc/pointing', fire_bolt: 'lorc/fire-ray', fire_shield: 'lorc/fire-shield', fire_storm: 'lorc/fire-ring',
  fireball: 'lorc/fireball', flame_blade: 'lorc/flame-claws', flame_strike: 'carl-olsen/flame', flaming_sphere: 'lorc/fire-ring',
  flesh_to_stone: 'lorc/rock', floating_disk: 'delapouite/floating-platforms', fly: 'lorc/wingfoot', fog_cloud: 'delapouite/fog',
  forbiddance: 'lorc/padlock', forcecage: 'delapouite/prisoner', foresight: 'lorc/crystal-ball', freedom_of_movement: 'skoll/breaking-chain',
  freezing_sphere: 'lorc/frozen-orb', gaseous_form: 'delapouite/fog', gate: 'delapouite/open-gate', geas: 'lorc/scroll-unfurled',
  gentle_repose: 'lorc/tombstone', giant_insect: 'lorc/scarab-beetle', glibness: 'delapouite/tongue', globe_of_invulnerability: 'lorc/crystal-ball',
  glyph_of_warding: 'lorc/rune-stone', goodberry: 'delapouite/berries-bowl', grease: 'lorc/oily-spiral', greater_invisibility: 'delapouite/invisible',
  greater_restoration: 'lorc/angel-outfit', guardian_of_faith: 'lorc/angel-outfit', guards_and_wards: 'lorc/castle', guidance: 'lorc/light-bulb',
  guiding_bolt: 'delapouite/magic-axe', gust_of_wind: 'lorc/wind-slap', hallow: 'delapouite/church', hallucinatory_terrain: 'delapouite/forest',
  harm: 'lorc/skull-slices', haste: 'delapouite/speedometer', heal: 'delapouite/healing-shield', healing_word: 'skoll/sound-waves',
  heat_metal: 'lorc/anvil-impact', hellish_rebuke: 'delapouite/devil-mask', heroes_feast: 'lorc/meat', heroism: 'lorc/lion',
  hideous_laughter: 'delapouite/jester-hat', hold_monster: 'delapouite/arrest', hold_person: 'delapouite/arrest', holy_aura: 'lorc/aura',
  hypnotic_pattern: 'lorc/spiral-bloom', ice_knife: 'lorc/ice-bolt', ice_storm: 'lorc/ice-bolt', identify: 'lorc/magnifying-glass',
  illusory_script: 'delapouite/scroll-quill', imprisonment: 'delapouite/prisoner', incendiary_cloud: 'lorc/smoking-orb',
  inflict_wounds: 'lorc/bleeding-wound', insect_plague: 'delapouite/fly', instant_summons: 'lorc/magic-portal', invisibility: 'delapouite/invisible',
  irresistible_dance: 'delapouite/musical-notes', jump: 'delapouite/jump-across', knock: 'lorc/key', legend_lore: 'lorc/book-cover',
  lesser_restoration: 'lorc/pill-drop', levitate: 'lorc/wingfoot', light: 'lorc/light-bulb', lightning_bolt: 'lorc/lightning-trio',
  locate_animals_or_plants: 'lorc/footprint', locate_creature: 'lorc/footprint', locate_object: 'lorc/compass', longstrider: 'lorc/boots',
  mage_armor: 'delapouite/armor-upgrade', mage_hand: 'lorc/magic-palm', magic_circle: 'skoll/pentacle', magic_jar: 'lorc/potion-ball',
  magic_missile: 'lorc/rocket', magic_mouth: 'lorc/lips', magic_weapon: 'lorc/shining-sword', magnificent_mansion: 'lorc/castle',
  major_image: 'lorc/mirror-mirror', mass_cure_wounds: 'delapouite/caduceus', mass_heal: 'delapouite/heart-wings',
  mass_healing_word: 'delapouite/heart-wings', mass_suggestion: 'lorc/brain', maze: 'lorc/maze', meld_into_stone: 'lorc/rock',
  mending: 'lorc/sewing-needle', message: 'lorc/envelope', meteor_swarm: 'lorc/meteor-impact', mind_blank: 'lorc/brain',
  mind_spike: 'delapouite/brain-tentacle', minor_illusion: 'lorc/ghost', mirage_arcane: 'delapouite/desert', mirror_image: 'lorc/mirror-mirror',
  mislead: 'lorc/ghost', misty_step: 'lorc/teleport', modify_memory: 'lorc/brainstorm', moonbeam: 'lorc/moon', move_earth: 'lorc/rock',
  nondetection: 'lorc/hidden', pass_without_trace: 'lorc/footprint', passwall: 'delapouite/door', phantasmal_force: 'lorc/spectre',
  phantasmal_killer: 'lorc/skull-crack', phantom_steed: 'lorc/ghost-ally', planar_ally: 'lorc/angel-wings', planar_binding: 'lorc/linked-rings',
  plane_shift: 'lorc/magic-portal', plant_growth: 'lorc/sprout', poison_spray: 'lorc/poison-gas', polymorph: 'delapouite/transform',
  power_word_heal: 'lorc/bandage-roll', power_word_kill: 'sbed/death-skull', power_word_stun: 'lorc/skull-slices', prayer_of_healing: 'lorc/prayer',
  prestidigitation: 'delapouite/sparkles', prismatic_spray: 'lorc/rainbow-star', prismatic_wall: 'lorc/rainbow-star', private_sanctum: 'lorc/padlock',
  produce_flame: 'carl-olsen/flame', programmed_illusion: 'lorc/ghost', project_image: 'lorc/ghost', protection_from_energy: 'lorc/magic-shield',
  protection_from_evil_and_good: 'lorc/magic-shield', protection_from_poison: 'lorc/poison-bottle', purify_food_and_drink: 'lorc/knife-fork',
  raise_dead: 'skoll/raise-zombie', ray_of_enfeeblement: 'lorc/beam-wake', ray_of_frost: 'lorc/ice-bolt', ray_of_sickness: 'lorc/poison-gas',
  regenerate: 'delapouite/medicines', reincarnate: 'lorc/cycle', remove_curse: 'lorc/cursed-star', resilient_sphere: 'lorc/bubble-field',
  resistance: 'sbed/shield', resurrection: 'lorc/ankh', reverse_gravity: 'delapouite/upgrade', revivify: 'delapouite/heart-beats',
  rope_trick: 'delapouite/rope-coil', sacred_flame: 'lorc/sun', sanctuary: 'delapouite/church', scorching_ray: 'lorc/fire-ray',
  scrying: 'lorc/crystal-ball', searing_smite: 'lorc/flame-claws', secret_chest: 'lorc/locked-chest', see_invisibility: 'lorc/eye-shield',
  seeming: 'lorc/domino-mask', sending: 'lorc/envelope', sequester: 'lorc/padlock', shapechange: 'lorc/werewolf', shatter: 'lorc/shatter',
  shield: 'sbed/shield', shield_of_faith: 'lorc/shield-echoes', shillelagh: 'delapouite/wood-club', shining_smite: 'lorc/sunbeams',
  shocking_grasp: 'lorc/lightning-frequency', silence: 'lorc/silence', silent_image: 'lorc/ghost', simulacrum: 'lorc/snowman',
  sleep: 'delapouite/night-sleep', sleet_storm: 'lorc/snowflake-2', slow: 'lorc/snail', sorcerous_burst: 'delapouite/fire-spell-cast',
  spare_the_dying: 'lorc/lotus', speak_with_animals: 'lorc/bird-twitter', speak_with_dead: 'lorc/skull-crack', speak_with_plants: 'lorc/oak',
  spider_climb: 'carl-olsen/spider-alt', spike_growth: 'delapouite/spiked-trunk', spirit_guardians: 'lorc/ghost-ally',
  spiritual_weapon: 'delapouite/spiral-hilt', starry_wisp: 'lorc/star-swirl', stinking_cloud: 'sbed/poison-cloud', stone_shape: 'lorc/stone-block',
  stoneskin: 'lorc/rock', storm_of_vengeance: 'lorc/thunder-struck', suggestion: 'lorc/brain', summon_dragon: 'lorc/dragon-head',
  sunbeam: 'lorc/sunbeams', sunburst: 'lorc/sun', symbol: 'lorc/rune-stone', telekinesis: 'lorc/magic-palm', telepathic_bond: 'lorc/linked-rings',
  teleport: 'lorc/teleport', teleportation_circle: 'lorc/magic-portal', thaumaturgy: 'lorc/echo-ripples', thunderwave: 'lorc/thunder-struck',
  time_stop: 'lorc/hourglass', tiny_hut: 'delapouite/tipi', tongues: 'lorc/conversation', transport_via_plants: 'lorc/oak', tree_stride: 'lorc/oak',
  true_polymorph: 'delapouite/transform', true_resurrection: 'lorc/ankh', true_seeing: 'delapouite/all-seeing-eye', true_strike: 'skoll/bullseye',
  tsunami: 'lorc/wave-crest', unseen_servant: 'lorc/haunting', vampiric_touch: 'delapouite/vampire-dracula', vicious_mockery: 'delapouite/tongue',
  vitriolic_sphere: 'sbed/acid', wall_of_fire: 'lorc/fire-ring', wall_of_force: 'delapouite/brick-wall', wall_of_ice: 'lorc/ice-cube',
  wall_of_stone: 'delapouite/stone-wall', wall_of_thorns: 'lorc/thorny-vine', warding_bond: 'lorc/linked-rings', water_breathing: 'lorc/bubbles',
  water_walk: 'sbed/water-drop', web: 'lorc/spider-web', weird: 'delapouite/brain-tentacle', wind_walk: 'lorc/wind-slap', wind_wall: 'lorc/wind-slap',
  wish: 'lorc/magic-lamp', word_of_recall: 'lorc/return-arrow', zone_of_truth: 'lorc/scales',
};


/** Conditions and marks, for the status icons above the tokens on the battle map. */
const CONDITION: Table = {
  blinded: 'delapouite/blindfold', charmed: 'lorc/charm', deafened: 'delapouite/sound-off', frightened: 'lorc/screaming',
  grappled: 'delapouite/hand-grip', incapacitated: 'delapouite/knocked-out-stars', paralyzed: 'lorc/brain-freeze', petrified: 'delapouite/stone-bust',
  poisoned: 'lorc/poison-bottle', prone: 'lorc/heavy-fall', restrained: 'lorc/manacles', stunned: 'delapouite/knocked-out-stars', asleep: 'lorc/sleepy',
  turned: 'lorc/ghost', rattled: 'lorc/despair', banished: 'lorc/portal', slowed: 'lorc/snail', outlined: 'lorc/sun-radiations',
  baned: 'lorc/crown-of-thorns', confused: 'lorc/back-forth', cursed: 'lorc/cursed-star', weakened: 'lorc/broken-shield', guided: 'lorc/beams-aura',
  marked: 'lorc/archery-target', concentration: 'lorc/concentration-orb', dodging: 'lorc/dodging', reckless: 'lorc/pierced-heart',
};

/** The common actions of the combat hotbar. */
const ACTION: Table = {
  attack: 'lorc/crossed-swords', disengage: 'lorc/run', escape: 'lorc/fist', light: 'delapouite/torch', potion: 'lorc/drink-me',
  spellbook: 'delapouite/spell-book', end_turn: 'lorc/hourglass', opportunity: 'lorc/shield-reflect',
};

/** Kinds of places, on the map and on the buttons that go there. */
const PLACE: Table = {
  town: 'delapouite/village', village: 'delapouite/family-house', tavern: 'lorc/beer-stein', shop: 'delapouite/shop', temple: 'delapouite/greek-temple',
  shrine: 'lorc/candle-light', camp: 'delapouite/camping-tent', dungeon: 'delapouite/dungeon-gate', ruin: 'delapouite/ancient-ruins',
  cave: 'delapouite/cave-entrance', landmark: 'delapouite/obelisk', wilds: 'lorc/compass',
};

/** Kinds of merchants. */
const SHOP: Table = {
  general: 'delapouite/shopping-cart', smith: 'lorc/anvil', alchemist: 'lorc/bubbling-flask', curio: 'lorc/crystal-ball', peddler: 'lorc/knapsack',
};

/** The rest of the interface: rests, gold, level up, inspiration and the marks of a fight. */
const UI: Table = {
  short_rest: 'lorc/campfire', long_rest: 'lorc/moon', gold: 'delapouite/two-coins', level_up: 'delapouite/upgrade', inspiration: 'delapouite/sparkles',
  ambush: 'lorc/plain-dagger', reaction: 'lorc/crossed-swords', delve: 'delapouite/stairs', book: 'delapouite/spell-book',
};

const TABLES: Record<GlyphKind, Table> = { ability: ABILITY, class: CLASS, school: SCHOOL, skill: SKILL, feat: FEAT, feature: FEATURE, spell: SPELL, condition: CONDITION, action: ACTION, place: PLACE, shop: SHOP, ui: UI };

/** Slot key ("spell:fire_bolt") to the path of its icon in github.com/game-icons/icons ("lorc/fire-ray"). */
export const GLYPH_PATHS: Record<string, string> = Object.fromEntries(
  (Object.keys(TABLES) as GlyphKind[]).flatMap((kind) => Object.entries(TABLES[kind]).map(([id, path]) => [`${kind}:${id}`, path] as const)),
);

export const isGlyphKey = (key: string) => key in GLYPH_PATHS;

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** The keys to try for an entry, most specific first. `via` names what it falls back to: a school, a class. */
export function glyphKeys(kind: GlyphKind, id: string, via?: string): string[] {
  const own = `${kind}:${id}`;
  switch (kind) {
    case 'spell': return [own, `feature:${id}`, ...(via ? [`school:${via}`] : [])];
    case 'skill': return [own, ...(SKILLS[id] ? [`ability:${SKILLS[id]}`] : [])];
    case 'feat': return [own, `feature:${id}`, ...(id.startsWith('boon_') ? ['feat:boon_fate'] : [])];
    case 'feature': return [own, ...(via ? [`class:${via}`] : [])];
    default: return [own];
  }
}

// ---- the lines on a character sheet ("Rage: Bonus action, ...") carry no id, so find it from the line

const LINE_KEYS = new Map<string, string[]>();
for (const classId of CLASS_IDS) {
  for (const f of CLASS_FEATURES[classId]) LINE_KEYS.set(featureLine(f), glyphKeys('feature', f.id, classId));
}
for (const o of Object.values(OPTIONS)) LINE_KEYS.set(optionLine(o), glyphKeys('feature', o.id, o.group === 'invocation' ? 'warlock' : undefined));
for (const s of Object.values(STYLES)) LINE_KEYS.set(s.feature, glyphKeys('feature', `style_${s.id}`, 'fighter'));
for (const f of Object.values(FEATS)) if (f.feature) LINE_KEYS.set(f.feature, glyphKeys('feat', f.id));
for (const sp of Object.values(SPECIES)) for (const e of sp.effects) LINE_KEYS.set(effectLine(e), [`feature:trait_${slug(e.name)}`, `feature:${slug(e.name)}`]);

/** Keys for a feature line of a character sheet, or the name before its colon as a last resort. */
export function featureLineKeys(line: string): string[] {
  const hit = LINE_KEYS.get(line);
  if (hit) return hit;
  const name = EFFECT_LINES[line]?.name ?? line.split(': ')[0];
  return [`feature:${slug(name)}`];
}

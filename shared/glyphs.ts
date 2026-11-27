// Pictures for skills, feats, spells and class features. Each key names an icon of the server's own set (painted by
// the server, see shared/iconLibrary.ts); the client shows it in place of the emoji of the entry, and where the
// icon is not painted yet the emoji stays.
//
// A key is "<kind>:<id>". Every entry also has a fallback, so a new spell or feature never ends up without a
// picture: a spell falls back to its school, a skill to its ability, a class feature to its class (see glyphKeys).
import { CLASS_FEATURES, OPTIONS, optionLine, featureLine, CLASS_IDS } from './classes';
import { EFFECT_LINES, FEATS, SPECIES, STYLES, effectLine } from './rules';
import { SKILLS } from './content';

export type GlyphKind = 'spell' | 'skill' | 'feat' | 'feature' | 'class' | 'ability' | 'school' | 'condition' | 'action' | 'place' | 'shop' | 'ui';

type Table = Record<string, string>;

const ABILITY: Table = {
  cha: 'charm', con: 'health-normal', dex: 'feather', int: 'brain', str: 'muscle-up', wis: 'owl',
};

const CLASS: Table = {
  barbarian: 'barbarian', bard: 'lyre', cleric: 'holy-symbol', druid: 'oak-leaf', fighter: 'crossed-swords',
  monk: 'fist', paladin: 'templar-shield', ranger: 'bow-arrow', rogue: 'daggers', sorcerer: 'magic-swirl',
  warlock: 'evil-eyes', wizard: 'wizard-staff',
};

const SCHOOL: Table = {
  abjuration: 'shield', conjuration: 'magic-portal', divination: 'crystal-ball', enchantment: 'charm',
  evocation: 'lightning-storm', illusion: 'domino-mask', necromancy: 'death-skull', transmutation: 'magic-swirl',
};

const SKILL: Table = {
  acrobatics: 'cartwheel', 'animal handling': 'paw-print', arcana: 'spell-book', athletics: 'muscle-up',
  deception: 'domino-mask', history: 'ancient-columns', insight: 'third-eye', intimidation: 'screaming',
  investigation: 'magnifying-glass', medicine: 'medical-pack', nature: 'oak-leaf', perception: 'eyeball',
  performance: 'lyre', persuasion: 'conversation', religion: 'holy-symbol', 'sleight of hand': 'magic-hat',
  stealth: 'ninja-mask', survival: 'campfire',
};

const FEAT: Table = {
  alert: 'eye-target', asi: 'upgrade', boon_combat_prowess: 'trophy', boon_dimensional_travel: 'portal',
  boon_fate: 'dice-fire', boon_irresistible_offense: 'sword-brandish', boon_night_spirit: 'moon',
  boon_spell_recall: 'cycle', boon_truesight: 'eye-shield', grappler: 'grab', magic_initiate_cleric: 'holy-symbol',
  magic_initiate_wizard: 'magic-hat', savage_attacker: 'claw-slashes', skilled: 'graduate-cap',
};

const FEATURE: Table = {
  abjure_foes: 'holy-symbol', acrobatic_movement: 'run', action_surge: 'lightning-helix', additional_fighting_style: 'sword-clash',
  adrenaline_rush: 'lightning-helix', aff_acid: 'acid', aff_cold: 'snowflake-1', aff_fire: 'flame',
  aff_lightning: 'lightning-storm', aff_poison: 'poison-bottle', arcane_apotheosis: 'lightning-storm', arcane_recovery: 'cycle',
  archdruid: 'tree-face', aura_expansion: 'aura', aura_of_courage: 'lion', aura_of_devotion: 'aura',
  aura_of_protection: 'shield', bardic_inspiration: 'musical-notes', beast_spells: 'paw-print', black_bear: 'bear-head',
  blessed_healer: 'healing', blessed_strikes: 'sword-brandish', body_and_mind: 'brain',
  bonus_proficiencies: 'star-medal', breath_weapon: 'dragon-breath', brown_bear: 'bear-head',
  brutal_strike: 'battered-axe', channel: 'holy-symbol', channel_divinity: 'holy-symbol', contact_patron: 'evil-eyes',
  countercharm: 'sound-waves', cunning_action: 'run', cunning_daze: 'spinning-top', cunning_poison: 'poison-bottle',
  cunning_strike: 'backstab', cunning_trip: 'tripwire', cutting_words: 'tongue', danger_sense: 'alarm-clock',
  dark_luck: 'clover', dark_ones_blessing: 'dark-squad', dark_ones_own_luck: 'clover', dash: 'run',
  defensive_tactics: 'shield', deflect_attacks: 'shield-reflect', deflect_energy: 'shield-reflect', deft_explorer: 'compass',
  devious_strikes: 'dripping-knife', dire_wolf: 'wolf-head', disciple_of_life: 'healing',
  disciplined_survivor: 'yin-yang', divine_intervention: 'angel-wings', divine_order: 'church',
  divine_smite: 'sunbeams', divine_spark_harm: 'sun', divine_spark_heal: 'healing', dodge: 'dodging',
  draconic_resilience: 'dragon-head', dragon_companion: 'dragon-head', dragon_wings: 'wing-cloak', druidic: 'oak-leaf',
  eldritch_invocations: 'tentacles-skull', eldritch_master: 'evil-eyes', elemental_affinity: 'fire-ring',
  elemental_fury: 'lightning-tree', elusive: 'ghost', empowered_evocation: 'lightning-storm', empowered_strikes: 'fist',
  evasion: 'dodging', evocation_savant: 'fire-spell-cast', expertise: 'star-medal', extra_attack: 'crossed-swords',
  faithful_steed: 'horse-head', fast_hands: 'hand-grip', fast_movement: 'run', favored_enemy: 'target-arrows',
  feral_instinct: 'wolf-head', feral_senses: 'nose-side', fiendish_resilience: 'devil-mask',
  fighting_style: 'sword-clash', fleet_step: 'wingfoot', flurry_of_blows: 'punch', focus: 'meditation',
  foe_slayer: 'death-skull', font_of_inspiration: 'fountain', font_of_magic: 'water-drop', free_smite: 'sunbeams',
  frenzy: 'enrage', fury_spellcasting: 'lightning-storm', fury_strike: 'wolf-head',
  greater_divine_intervention: 'angel-wings', heightened_focus: 'meditation', heroic_warrior: 'laurels', hex: 'evil-eyes',
  holy_nimbus: 'sun', hunters_lore: 'open-book', hunters_mark: 'target-arrows', hunters_prey: 'target-arrows',
  hurl: 'burning-skull', hurl_through_hell: 'burning-skull', improved_blessed_strikes: 'sun-radiations',
  improved_brutal_strike: 'battered-axe', improved_critical: 'sword-wound', improved_cunning_strike: 'dripping-knife',
  improved_elemental_fury: 'lightning-tree', indomitable: 'rock', indomitable_might: 'muscle-up',
  innate_sorcery: 'fire-spell-cast', inspiration: 'musical-notes', instinctive_pounce: 'pounce',
  intimidating_presence: 'screaming', inv_agonizing: 'lightning-storm', inv_armor: 'shadow-follower',
  inv_blade: 'sword-brandish', inv_chain: 'crossed-chains', inv_leap: 'jump-across', inv_lifedrinker: 'bleeding-heart',
  inv_mask: 'domino-mask', inv_mind: 'brain', inv_repelling: 'wind-slap', inv_shadows: 'shadow-follower',
  inv_sight: 'devil-mask', inv_spear: 'spear-hook', inv_step: 'angel-wings', inv_thirsting: 'dripping-knife',
  inv_tome: 'evil-book', inv_vigor: 'healing', inv_visions: 'fog', inv_whispers: 'tombstone',
  inv_witch: 'eye-shield', jack_of_all_trades: 'swiss-army-knife', land_arid: 'desert', land_polar: 'snowflake-2',
  land_temperate: 'oak', land_tropical: 'palm-tree', lands_aid: 'oak-leaf', lay_on_hands: 'hand-of-god',
  magical_cunning: 'cycle', magical_discoveries: 'scroll-unfurled', magical_secrets: 'secret-book', martial_arts: 'fist',
  martial_strike: 'fist', memorize_spell: 'brain', meta_distant: 'spyglass', meta_empowered: 'lightning-storm',
  meta_extended: 'hourglass', meta_heightened: 'target-arrows', meta_quickened: 'lightning-helix', meta_seeking: 'crosshair',
  meta_subtle: 'hidden', meta_transmuted: 'rainbow-star', metamagic: 'magic-swirl', mindless_rage: 'skull-crack',
  monks_focus: 'meditation', mystic_arcanum: 'evil-book', natural_recovery: 'sprout', natures_sanctuary: 'tree-roots',
  natures_veil: 'oak-leaf', natures_ward: 'oak-leaf', nimbus: 'sun', open_hand_technique: 'open-palm',
  order_protector: 'shield', order_thaumaturge: 'holy-symbol', overchannel: 'lightning-trio', pact_magic: 'evil-book',
  paladins_smite: 'sunbeams', patient_defense: 'meditation', peerless_skill: 'star-medal', perfect_focus: 'meditation',
  persistent_rage: 'enrage', potent_cantrip: 'spark-spirit', precise_hunter: 'bullseye', presence: 'screaming',
  preserve_life: 'first-aid-kit', prey_colossus: 'giant', prey_horde: 'crossed-swords', primal_champion: 'trophy',
  primal_knowledge: 'wolf-howl', primal_magician: 'oak-leaf', primal_order: 'oak-leaf',
  primal_warden: 'armor-upgrade', quivering_palm: 'fist', radiant_strikes: 'sun', rage: 'enrage',
  reckless: 'mighty-force', reckless_attack: 'charging-bull', recovery: 'cycle', relentless_hunter: 'wolf-head',
  relentless_rage: 'heart-beats', reliable_talent: 'dice-six-faces-six', remarkable_athlete: 'muscle-up',
  res_acid: 'acid', res_cold: 'snowflake-1', res_fire: 'flame', res_lightning: 'lightning-shield',
  res_necrotic: 'death-skull', res_poison: 'poison-bottle', res_psychic: 'brain', res_thunder: 'sound-waves',
  restoring_touch: 'healing', retaliation: 'revolt', revert_form: 'cycle', ritual_adept: 'pentacle', roving: 'run',
  sacred_weapon: 'sword-brandish', scholar: 'graduate-cap', sculpt_spells: 'magic-swirl', sear_undead: 'sun',
  second_story_work: 'grapple', second_wind: 'health-normal', self_restoration: 'arm-bandage', signature_spells: 'quill-ink',
  slippery_mind: 'brain-freeze', slow_fall: 'feather', smite_of_protection: 'shield', sneak_attack: 'backstab',
  sorcerous_restoration: 'cycle', sorcery: 'water-drop', sorcery_incarnate: 'lightning-storm', spell_mastery: 'magic-hat',
  spellcasting: 'spell-book', steady_aim: 'bullseye', step_of_the_wind: 'wingfoot', stroke_of_luck: 'clover',
  studied_attacks: 'target-arrows', stunning_strike: 'punch', style_archery: 'bow-arrow', style_defense: 'shield',
  style_dueling: 'sword-clash', style_great_weapon: 'two-handed-sword', superior_critical: 'sword-wound',
  superior_defense: 'shield', superior_hunters_defense: 'shield', superior_hunters_prey: 'target-arrows',
  superior_inspiration: 'musical-notes', supreme_healing: 'heart-wings', supreme_sneak: 'ninja-mask',
  survivor: 'heart-beats', tactical_master: 'chess-king', tactical_mind: 'chess-knight', tactical_shift: 'tread',
  thiefs_reflexes: 'lightning-frequency', thieves_cant: 'secret-book', three_extra_attacks: 'swords-power',
  tireless: 'run', trait_brave: 'lion', trait_darkvision: 'night-vision', trait_draconic_resistance: 'dragon-head',
  trait_dwarven_resilience: 'poison-bottle', trait_dwarven_toughness: 'dwarf-face', trait_fey_ancestry: 'fairy',
  trait_fiendish_resistance: 'devil-mask', trait_fleet_of_foot: 'wingfoot', trait_giant_ancestry: 'giant',
  trait_gnomish_cunning: 'brain', trait_infernal_legacy: 'devil-mask', trait_keen_senses: 'eyeball',
  trait_long_stride: 'boots', trait_luck: 'clover', trait_naturally_stealthy: 'ninja-mask',
  trait_otherworldly_presence: 'evil-eyes', trait_powerful_build: 'muscle-up', trait_relentless_endurance: 'heart-beats',
  trait_resourceful: 'backpack', trait_skillful: 'graduate-cap', trait_stonecunning: 'stone-block',
  trait_tinker: 'gears', trait_trance: 'night-sleep', trait_versatile: 'swiss-army-knife', turn_undead: 'ankh',
  two_extra_attacks: 'swords-power', unarmored_defense: 'shirt', unarmored_movement: 'run', uncanny_dodge: 'dodging',
  uncanny_metabolism: 'yin-yang', use_magic_device: 'magic-axe', weapon_mastery: 'sword-smithing',
  wholeness: 'meditation', wholeness_of_body: 'meditation', wild_companion: 'paw-heart', wild_resurgence: 'cycle',
  wild_shape: 'wolf-howl', wild_shape_black_bear: 'bear-head', wild_shape_brown_bear: 'bear-head',
  wild_shape_dire_wolf: 'wolf-head', wild_shape_wolf: 'wolf-head', wolf: 'wolf-head', words_of_creation: 'open-book',
};

const SPELL: Table = {
  acid_arrow: 'acid', acid_splash: 'acid-blob', aid: 'muscle-up', alarm: 'ringing-alarm', alter_self: 'transform',
  animal_friendship: 'paw-heart', animal_messenger: 'raven', animal_shapes: 'werewolf', animate_dead: 'raise-zombie',
  animate_objects: 'haunting', antilife_shell: 'shield-echoes', antimagic_field: 'cancel', antipathy_sympathy: 'heart-shield',
  arcane_eye: 'all-seeing-eye', arcane_hand: 'magic-palm', arcane_lock: 'padlock', arcane_sword: 'spiral-hilt',
  arcanists_magic_aura: 'magic-swirl', astral_projection: 'ghost', augury: 'rune-stone', aura_of_life: 'aura',
  awaken: 'sprout', bane: 'skull-slices', banishment: 'portal', barkskin: 'tree-roots', beacon_of_hope: 'sunbeams',
  befuddlement: 'brain-freeze', bestow_curse: 'cursed-star', black_tentacles: 'tentacle-strike', blade_barrier: 'spinning-sword',
  bless: 'holy-grail', blight: 'dead-wood', blindness_deafness: 'eye-shield', blink: 'ghost', blur: 'ghost',
  burning_hands: 'burning-embers', call_lightning: 'lightning-tree', calm_emotions: 'heart-wings',
  chain_lightning: 'lightning-branches', charm_monster: 'charm', charm_person: 'charm', chill_touch: 'grasping-claws',
  chromatic_orb: 'glass-ball', circle_of_death: 'death-zone', clairvoyance: 'crystal-ball', clone: 'dna1',
  cloudkill: 'poison-cloud', color_spray: 'rainbow-star', command: 'pointing', commune: 'prayer', commune_with_nature: 'oak',
  comprehend_languages: 'conversation', compulsion: 'puppet', cone_of_cold: 'ice-bolt', confusion: 'brain-freeze',
  conjure_animals: 'wolf-head', conjure_celestial: 'angel-wings', conjure_elemental: 'fire-ring', conjure_fey: 'fairy',
  conjure_minor_elementals: 'fire-ring', conjure_woodland_beings: 'fairy', contact_other_plane: 'third-eye', contagion: 'virus',
  contingency: 'scroll-unfurled', continual_flame: 'torch', control_water: 'water-bolt', control_weather: 'lightning-storm',
  counterspell: 'magic-shield', create_food_and_water: 'bread', create_or_destroy_water: 'water-drop',
  create_undead: 'raise-zombie', creation: 'anvil', cure_wounds: 'health-increase', dancing_lights: 'lantern-flame',
  darkness: 'dark-squad', darkvision: 'eyeball', daylight: 'sunrise', death_ward: 'angel-wings',
  delayed_blast_fireball: 'fire-bomb', demiplane: 'door', detect_evil_and_good: 'evil-eyes',
  detect_magic: 'magnifying-glass', detect_poison_and_disease: 'poison-bottle', detect_thoughts: 'brain',
  dimension_door: 'door', disguise_self: 'domino-mask', disintegrate: 'disintegrate', dispel_evil_and_good: 'cancel',
  dispel_magic: 'cancel', dissonant_whispers: 'sound-waves', divination: 'crystal-ball', divine_favor: 'holy-grail',
  divine_word: 'holy-symbol', dominate_beast: 'wolf-head', dominate_monster: 'puppet', dominate_person: 'puppet',
  dragons_breath: 'dragon-breath', dream: 'night-sleep', druidcraft: 'sprout', earthquake: 'earth-crack',
  eldritch_blast: 'magic-swirl', elementalism: 'fire-ring', enhance_ability: 'muscle-up', enlarge_reduce: 'giant',
  ensnaring_strike: 'vines', entangle: 'thorny-vine', enthrall: 'sing', etherealness: 'ghost-ally',
  expeditious_retreat: 'run', eyebite: 'evil-eyes', fabricate: 'anvil', faerie_fire: 'fairy',
  faithful_hound: 'dog-bowl', false_life: 'heart-beats', fear: 'screaming', feather_fall: 'feather',
  find_familiar: 'owl', find_steed: 'horse-head', find_the_path: 'compass', find_traps: 'tripwire',
  finger_of_death: 'pointing', fire_bolt: 'fire-ray', fire_shield: 'fire-shield', fire_storm: 'fire-ring',
  fireball: 'fireball', flame_blade: 'flame-claws', flame_strike: 'flame', flaming_sphere: 'fire-ring',
  flesh_to_stone: 'rock', floating_disk: 'floating-platforms', fly: 'wingfoot', fog_cloud: 'fog',
  forbiddance: 'padlock', forcecage: 'prisoner', foresight: 'crystal-ball', freedom_of_movement: 'breaking-chain',
  freezing_sphere: 'frozen-orb', gaseous_form: 'fog', gate: 'open-gate', geas: 'scroll-unfurled',
  gentle_repose: 'tombstone', giant_insect: 'scarab-beetle', glibness: 'tongue', globe_of_invulnerability: 'crystal-ball',
  glyph_of_warding: 'rune-stone', goodberry: 'berries-bowl', grease: 'oily-spiral', greater_invisibility: 'invisible',
  greater_restoration: 'angel-outfit', guardian_of_faith: 'angel-outfit', guards_and_wards: 'castle', guidance: 'light-bulb',
  guiding_bolt: 'magic-axe', gust_of_wind: 'wind-slap', hallow: 'church', hallucinatory_terrain: 'forest',
  harm: 'skull-slices', haste: 'speedometer', heal: 'healing-shield', healing_word: 'sound-waves',
  heat_metal: 'anvil-impact', hellish_rebuke: 'devil-mask', heroes_feast: 'meat', heroism: 'lion',
  hideous_laughter: 'jester-hat', hold_monster: 'arrest', hold_person: 'arrest', holy_aura: 'aura',
  hypnotic_pattern: 'spiral-bloom', ice_knife: 'ice-bolt', ice_storm: 'ice-bolt', identify: 'magnifying-glass',
  illusory_script: 'scroll-quill', imprisonment: 'prisoner', incendiary_cloud: 'smoking-orb',
  inflict_wounds: 'bleeding-wound', insect_plague: 'fly', instant_summons: 'magic-portal', invisibility: 'invisible',
  irresistible_dance: 'musical-notes', jump: 'jump-across', knock: 'key', legend_lore: 'book-cover',
  lesser_restoration: 'pill-drop', levitate: 'wingfoot', light: 'light-bulb', lightning_bolt: 'lightning-trio',
  locate_animals_or_plants: 'footprint', locate_creature: 'footprint', locate_object: 'compass', longstrider: 'boots',
  mage_armor: 'armor-upgrade', mage_hand: 'magic-palm', magic_circle: 'pentacle', magic_jar: 'potion-ball',
  magic_missile: 'rocket', magic_mouth: 'lips', magic_weapon: 'shining-sword', magnificent_mansion: 'castle',
  major_image: 'mirror-mirror', mass_cure_wounds: 'caduceus', mass_heal: 'heart-wings',
  mass_healing_word: 'heart-wings', mass_suggestion: 'brain', maze: 'maze', meld_into_stone: 'rock',
  mending: 'sewing-needle', message: 'envelope', meteor_swarm: 'meteor-impact', mind_blank: 'brain',
  mind_spike: 'brain-tentacle', minor_illusion: 'ghost', mirage_arcane: 'desert', mirror_image: 'mirror-mirror',
  mislead: 'ghost', misty_step: 'teleport', modify_memory: 'brainstorm', moonbeam: 'moon', move_earth: 'rock',
  nondetection: 'hidden', pass_without_trace: 'footprint', passwall: 'door', phantasmal_force: 'spectre',
  phantasmal_killer: 'skull-crack', phantom_steed: 'ghost-ally', planar_ally: 'angel-wings', planar_binding: 'linked-rings',
  plane_shift: 'magic-portal', plant_growth: 'sprout', poison_spray: 'poison-gas', polymorph: 'transform',
  power_word_heal: 'bandage-roll', power_word_kill: 'death-skull', power_word_stun: 'skull-slices', prayer_of_healing: 'prayer',
  prestidigitation: 'sparkles', prismatic_spray: 'rainbow-star', prismatic_wall: 'rainbow-star', private_sanctum: 'padlock',
  produce_flame: 'flame', programmed_illusion: 'ghost', project_image: 'ghost', protection_from_energy: 'magic-shield',
  protection_from_evil_and_good: 'magic-shield', protection_from_poison: 'poison-bottle', purify_food_and_drink: 'knife-fork',
  raise_dead: 'raise-zombie', ray_of_enfeeblement: 'beam-wake', ray_of_frost: 'ice-bolt', ray_of_sickness: 'poison-gas',
  regenerate: 'medicines', reincarnate: 'cycle', remove_curse: 'cursed-star', resilient_sphere: 'bubble-field',
  resistance: 'shield', resurrection: 'ankh', reverse_gravity: 'upgrade', revivify: 'heart-beats',
  rope_trick: 'rope-coil', sacred_flame: 'sun', sanctuary: 'church', scorching_ray: 'fire-ray',
  scrying: 'crystal-ball', searing_smite: 'flame-claws', secret_chest: 'locked-chest', see_invisibility: 'eye-shield',
  seeming: 'domino-mask', sending: 'envelope', sequester: 'padlock', shapechange: 'werewolf', shatter: 'shatter',
  shield: 'shield', shield_of_faith: 'shield-echoes', shillelagh: 'wood-club', shining_smite: 'sunbeams',
  shocking_grasp: 'lightning-frequency', silence: 'silence', silent_image: 'ghost', simulacrum: 'snowman',
  sleep: 'night-sleep', sleet_storm: 'snowflake-2', slow: 'snail', sorcerous_burst: 'fire-spell-cast',
  spare_the_dying: 'lotus', speak_with_animals: 'bird-twitter', speak_with_dead: 'skull-crack', speak_with_plants: 'oak',
  spider_climb: 'spider-alt', spike_growth: 'spiked-trunk', spirit_guardians: 'ghost-ally',
  spiritual_weapon: 'spiral-hilt', starry_wisp: 'star-swirl', stinking_cloud: 'poison-cloud', stone_shape: 'stone-block',
  stoneskin: 'rock', storm_of_vengeance: 'thunder-struck', suggestion: 'brain', summon_dragon: 'dragon-head',
  sunbeam: 'sunbeams', sunburst: 'sun', symbol: 'rune-stone', telekinesis: 'magic-palm', telepathic_bond: 'linked-rings',
  teleport: 'teleport', teleportation_circle: 'magic-portal', thaumaturgy: 'echo-ripples', thunderwave: 'thunder-struck',
  time_stop: 'hourglass', tiny_hut: 'tipi', tongues: 'conversation', transport_via_plants: 'oak', tree_stride: 'oak',
  true_polymorph: 'transform', true_resurrection: 'ankh', true_seeing: 'all-seeing-eye', true_strike: 'bullseye',
  tsunami: 'wave-crest', unseen_servant: 'haunting', vampiric_touch: 'vampire-dracula', vicious_mockery: 'tongue',
  vitriolic_sphere: 'acid', wall_of_fire: 'fire-ring', wall_of_force: 'brick-wall', wall_of_ice: 'ice-cube',
  wall_of_stone: 'stone-wall', wall_of_thorns: 'thorny-vine', warding_bond: 'linked-rings', water_breathing: 'bubbles',
  water_walk: 'water-drop', web: 'spider-web', weird: 'brain-tentacle', wind_walk: 'wind-slap', wind_wall: 'wind-slap',
  wish: 'magic-lamp', word_of_recall: 'return-arrow', zone_of_truth: 'scales',
};


/** Conditions and marks, for the status icons above the tokens on the battle map. */
const CONDITION: Table = {
  blinded: 'blindfold', charmed: 'charm', deafened: 'sound-off', frightened: 'screaming',
  grappled: 'hand-grip', incapacitated: 'knocked-out-stars', paralyzed: 'brain-freeze', petrified: 'stone-bust',
  poisoned: 'poison-bottle', prone: 'heavy-fall', restrained: 'manacles', stunned: 'knocked-out-stars', asleep: 'sleepy',
  turned: 'ghost', rattled: 'despair', banished: 'portal', slowed: 'snail', outlined: 'sun-radiations',
  baned: 'crown-of-thorns', confused: 'back-forth', cursed: 'cursed-star', weakened: 'broken-shield', guided: 'beams-aura',
  marked: 'archery-target', concentration: 'concentration-orb', dodging: 'dodging', reckless: 'pierced-heart',
};

/** The common actions of the combat hotbar. */
const ACTION: Table = {
  attack: 'crossed-swords', disengage: 'run', escape: 'fist', light: 'torch', potion: 'drink-me',
  spellbook: 'spell-book', end_turn: 'hourglass', opportunity: 'shield-reflect',
};

/** Kinds of places, on the map and on the buttons that go there. */
const PLACE: Table = {
  town: 'village', village: 'family-house', tavern: 'beer-stein', shop: 'shop', temple: 'greek-temple',
  shrine: 'candle-light', camp: 'camping-tent', dungeon: 'dungeon-gate', ruin: 'ancient-ruins',
  cave: 'cave-entrance', landmark: 'obelisk', wilds: 'compass',
};

/** Kinds of merchants. */
const SHOP: Table = {
  general: 'shopping-cart', smith: 'anvil', alchemist: 'bubbling-flask', curio: 'crystal-ball', peddler: 'knapsack',
};

/** The rest of the interface: rests, gold, level up, inspiration and the marks of a fight. */
const UI: Table = {
  short_rest: 'campfire', long_rest: 'moon', gold: 'two-coins', level_up: 'upgrade', inspiration: 'sparkles',
  ambush: 'plain-dagger', reaction: 'crossed-swords', delve: 'stairs', book: 'spell-book',
};

const TABLES: Record<GlyphKind, Table> = { ability: ABILITY, class: CLASS, school: SCHOOL, skill: SKILL, feat: FEAT, feature: FEATURE, spell: SPELL, condition: CONDITION, action: ACTION, place: PLACE, shop: SHOP, ui: UI };

/** Slot key ("spell:fire_bolt") to the name of its icon ("fire-ray"). */
export const GLYPH_ICON_NAMES: Record<string, string> = Object.fromEntries(
  (Object.keys(TABLES) as GlyphKind[]).flatMap((kind) => Object.entries(TABLES[kind]).map(([id, path]) => [`${kind}:${id}`, path] as const)),
);

export const isGlyphKey = (key: string) => key in GLYPH_ICON_NAMES;

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

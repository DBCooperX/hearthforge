// What every creature of the SRD really is: its anatomy in words. The image model paints from this, not from the
// procedural look (body shape, arms, weapon), which is a rough sketch: a Warhorse Skeleton is a skeletal horse, not a
// humanoid skeleton with a horse head on its shield. The same table corrects the drawn look where the importer guessed
// the wrong body. Rules are tried in order and the first match wins; every SRD creature must match one (a test checks).

import type { Body, MonsterLook } from '../../../shared/monsterLook';

export interface Anatomy {
  /** The creature as a painter should see it, without size and colour, which come from the look. */
  form: string;
  /** Whether it can hold a weapon and wear armour. The look's weapon and armour are dropped when it can't. */
  gear: boolean;
  /** Stands upright, so the picture is tall; everything else is painted in a square. */
  tall: boolean;
  /** The body the drawn figure should have, where the catalogue's guess is wrong. */
  body?: Body;
  /** Other corrections to the drawn look. */
  patch?: Partial<MonsterLook>;
}

const biped = (form: string, more: Partial<Anatomy> = {}): Anatomy => ({ form, gear: true, tall: true, ...more });
const beast = (form: string, more: Partial<Anatomy> = {}): Anatomy => ({ form, gear: false, tall: false, ...more });
const upright = (form: string, more: Partial<Anatomy> = {}): Anatomy => ({ form, gear: false, tall: true, ...more });

const NO_RIDER = 'with no rider';
const DRAGON = (extra = '') => beast(`a classic dragon seen from the side: four strong legs on the ground, a long neck, a horned head, a long tail and two large wings${extra}, ${NO_RIDER}, holding no weapon`, { body: 'dragon', patch: { wings: 'bat', tail: true, horns: true } });
const WERE = (animal: string) => upright(`a werecreature caught half-way: an upright, fur-covered, muscular humanoid with the head of a ${animal} and clawed hands, standing on two legs, in torn clothes`, { body: 'humanoid' });
const SWARM = (what: string) => beast(`a swarm: a dense, swirling mass of dozens of tiny ${what} filling the whole picture, no single large animal`, { patch: { arms: 2 } });
const FISH = (what: string, body: Body = 'beast') => beast(`${what}, seen from the side, swimming, with fins and no legs`, { body });

const RULES: [RegExp, Anatomy][] = [
  // --- Skeletons and mounts of the dead -------------------------------------------------------------------------------
  [/^warhorse_skeleton$/, beast(`a skeletal war horse: the bare bones of a horse standing on four legs, an empty skull with glowing eyes, ribs showing, tattered scraps of barding, ${NO_RIDER}; the whole creature is one horse`, { body: 'beast', patch: { mutation: 'skeletal', tail: true, weapon: null } })],
  [/^minotaur_skeleton$/, biped('a skeletal minotaur: an upright skeleton with the horned skull of a bull, a huge bony frame and a great axe', { body: 'humanoid' })],
  [/^skeleton$/, biped('an animated human skeleton, bare bones and an empty skull, holding a rusty weapon')],
  [/^(zombie|ogre_zombie)$/, biped('a shambling, rotting corpse with torn flesh, slack jaw and reaching arms, standing upright', { gear: false })],
  [/^ghoul$/, biped('a gaunt, grey, ghoulish humanoid with long claws, a lolling tongue and sunken eyes, hunched', { gear: false })],
  [/^ghast$/, biped('a foul, hunched ghast: a gaunt, grey humanoid with long claws, a gaping mouth and a rotten stench', { gear: false })],
  [/^(wight)$/, biped('a wight: a gaunt, withered undead warrior in tattered armour, with glowing eyes')],
  [/^(mummy|mummy_lord)$/, biped('a mummy wrapped in old bandages, with glowing eyes, arms reaching forward', { gear: false })],
  [/^(ghost|specter|wraith|shadow)$/, upright('a ghostly, translucent humanoid spirit that fades into wisps below the waist, no legs, no weapon', { body: 'ghost' })],
  [/^invisible_stalker$/, upright('a swirling, vaguely humanoid whirl of air and dust, with no clear face', { body: 'ghost' })],
  [/^will_o_wisp$/, beast('a small, floating ball of pale ghostly light with a faint grinning face, no body, no limbs', { body: 'ghost' })],
  [/^lich$/, biped('a lich: a skeletal sorcerer in rich, tattered robes with a crown, glowing eyes and a staff')],
  [/^vampire_vampire$/, biped('a pale vampire in dark noble clothes and a high-collared cloak, with fangs and red eyes', { body: 'humanoid', patch: { weapon: null } })],
  [/^vampire_spawn$/, biped('a pale, feral vampire spawn in ragged clothes, with long fangs and clawed hands', { body: 'humanoid', patch: { weapon: null } })],
  [/^vampire_familiar$/, biped('a pale, hollow-eyed servant of a vampire in dark, plain clothes, with small fangs', { body: 'humanoid', patch: { weapon: null } })],
  [/^vampire_mist$/, beast('a swirling cloud of red-tinged mist with two faint glowing eyes, no body, no limbs', { body: 'ghost' })],
  [/^vampire_bat$/, beast('a large vampire bat in flight seen from the front, wings spread wide, fanged mouth open, red eyes', { body: 'rodent' })],
  [/^troll_limb$/, beast('a severed troll arm crawling by itself over the ground on its clawed green fingers, ragged at the stump, just the limb and nothing else', { body: 'beast', patch: { arms: 2 } })],

  // --- Horses and other mounts -----------------------------------------------------------------------------------------
  [/^nightmare$/, beast(`a nightmare: a black horse with a mane and tail of flame, burning hooves and glowing eyes, standing on four legs, ${NO_RIDER}`, { body: 'beast', patch: { tail: true, aura: 'fire', weapon: null } })],
  [/^pegasus$/, beast(`a pegasus: a white winged horse standing on four legs with large feathered wings, ${NO_RIDER}`, { body: 'beast', patch: { wings: 'feather', tail: true, weapon: null } })],
  [/^unicorn$/, beast(`a unicorn: a white horse with a single spiralled horn on its forehead and a flowing mane, standing on four legs, ${NO_RIDER}`, { body: 'beast', patch: { horns: true, tail: true, weapon: null } })],
  [/^(draft_horse|riding_horse|warhorse|pony|mule)$/, beast(`a plain {name} standing on four legs, ${NO_RIDER}, no saddle`, { body: 'beast', patch: { tail: true } })],
  [/^camel$/, beast('a camel with a single hump, standing on four long legs', { body: 'beast' })],
  [/^elephant$/, beast('an elephant with tusks and a trunk, standing on four thick legs', { body: 'beast' })],
  [/^mammoth$/, beast('a woolly mammoth with huge curved tusks and shaggy brown fur, standing on four thick legs', { body: 'beast' })],
  [/^rhinoceros$/, beast('a rhinoceros with a heavy horn on its snout, standing on four stout legs', { body: 'beast', patch: { horns: true } })],
  [/^hippopotamus$/, beast('a hippopotamus with a huge open mouth, standing on four short legs', { body: 'beast' })],
  [/^(boar|giant_boar)$/, beast('a wild boar with tusks and bristly fur, standing on four legs', { body: 'beast' })],
  [/^(goat|giant_goat)$/, beast('a goat with curved horns, standing on four legs', { body: 'beast', patch: { horns: true } })],
  [/^(deer|elk|giant_elk)$/, beast('a deer-like animal with large branching antlers, standing on four slender legs', { body: 'beast', patch: { horns: true } })],
  [/^(ape|giant_ape|baboon)$/, beast('a powerful ape hunched on its knuckles, with long arms and a fierce face', { body: 'beast', patch: { arms: 2 } })],

  // --- Dogs, cats, bears and other hunters -----------------------------------------------------------------------------
  [/^(wolf|dire_wolf|winter_wolf|jackal|mastiff|hyena|giant_hyena)$/, beast('a {name}: a four-legged canine predator mid-snarl, with bared teeth', { body: 'beast', patch: { tail: true } })],
  [/^worg$/, beast('a worg: a huge, cruel wolf on four legs with a shaggy coat and bared fangs', { body: 'beast', patch: { tail: true } })],
  [/^blink_dog$/, beast('a blink dog: a sleek, intelligent hunting dog on four legs with a shimmering, slightly translucent coat', { body: 'beast', patch: { tail: true } })],
  [/^death_dog$/, beast('a death dog: a two-headed, scarred, mangy hound on four legs, each head snarling', { body: 'beast', patch: { heads: 2, tail: true } })],
  [/^hell_hound$/, beast('a hell hound: a fire-breathing black hound with red-glowing fur, smoke curling from its jaws, on four legs', { body: 'beast', patch: { tail: true, aura: 'fire' } })],
  [/^(cat|lion|tiger|panther|saber_toothed_tiger)$/, beast('a {name}: a big cat crouched on four legs, ready to pounce, with bared teeth and claws', { body: 'beast', patch: { tail: true } })],
  [/^(black_bear|brown_bear|polar_bear)$/, beast('a {name} standing on four legs, rearing its head, with bared teeth and claws', { body: 'bear' })],
  [/^owlbear$/, beast('an owlbear: a huge bear body covered in feathers and fur, with the head and beak of an owl and sharp claws', { body: 'owlbear' })],
  [/^(badger|giant_badger)$/, beast('a badger with a striped face, strong digging claws, standing on four short legs', { body: 'rodent' })],
  [/^(weasel|giant_weasel)$/, beast('a long, slender weasel with a pointed face, standing on four short legs', { body: 'rodent' })],
  [/^(rat|giant_rat)$/, beast('a rat with a long bare tail and sharp front teeth, on four legs', { body: 'rodent', patch: { tail: true } })],
  [/^(bat|giant_bat)$/, beast('a bat in flight seen from the front, wings spread wide, fangs showing', { body: 'rodent' })],
  [/^(frog|giant_frog|giant_toad)$/, beast('a {name}, squatting on four limbs, with a wide mouth and bulging eyes', { body: 'beast' })],

  // --- Lycanthropes: three forms ---------------------------------------------------------------------------------------
  [/^were\w+_human$/, biped('an ordinary-looking human in plain clothes, with a hint of the beast in the eyes', { body: 'humanoid', patch: { weapon: null, armor: null } })],
  [/^werebear_hybrid$/, WERE('bear')],
  [/^wereboar_hybrid$/, WERE('boar, with tusks')],
  [/^wererat_hybrid$/, WERE('rat')],
  [/^weretiger_hybrid$/, WERE('tiger')],
  [/^werewolf_hybrid$/, WERE('wolf')],
  [/^werebear_bear$/, beast('a huge bear on four legs, rearing, with bared teeth', { body: 'bear' })],
  [/^wereboar_boar$/, beast('a huge wild boar with tusks, on four legs', { body: 'beast' })],
  [/^wererat_rat$/, beast('a giant rat with a long bare tail, on four legs', { body: 'rodent', patch: { tail: true } })],
  [/^weretiger_tiger$/, beast('a large tiger crouched on four legs, with bared teeth', { body: 'beast', patch: { tail: true } })],
  [/^werewolf_wolf$/, beast('a large wolf on four legs, snarling', { body: 'beast', patch: { tail: true } })],

  // --- Birds and winged beasts -----------------------------------------------------------------------------------------
  [/^(eagle|giant_eagle|hawk|blood_hawk|owl|giant_owl|raven|vulture|giant_vulture|roc|axe_beak)$/, beast('a {name}: a bird with feathers, a beak and talons, perched ready to strike, wings half open', { body: 'bird', patch: { wings: 'feather', weapon: null, armor: null } })],
  [/^stirge$/, beast('a stirge: a small flying creature like a mosquito crossed with a bat, with leathery wings, a long needle-like snout and a bloated body', { body: 'bird', patch: { wings: 'bat' } })],
  [/^pteranodon$/, beast('a pteranodon: a flying reptile with leathery wings, a long beak and a head crest', { body: 'bird', patch: { wings: 'bat' } })],
  [/^cockatrice$/, beast('a cockatrice: a small creature with the body of a rooster, a lizard\'s tail and leathery wings, with a bright red comb', { body: 'bird', patch: { wings: 'bat', tail: true } })],
  [/^griffon$/, beast('a griffon: the body of a lion with the head, front talons and large feathered wings of an eagle, standing on four legs', { body: 'beast', patch: { wings: 'feather', tail: true } })],
  [/^hippogriff$/, beast('a hippogriff: the front half of an eagle with the hindquarters of a horse, feathered wings, standing on four legs', { body: 'beast', patch: { wings: 'feather', tail: true } })],
  [/^harpy$/, biped('a harpy: a woman\'s torso and face with feathered wings for arms and the legs and talons of a bird', { gear: false, body: 'humanoid', patch: { wings: 'feather', weapon: null } })],
  [/^(manticore)$/, beast('a manticore: a lion\'s body with a bearded human face, bat wings and a tail studded with spikes, standing on four legs', { body: 'beast', patch: { wings: 'bat', tail: true } })],
  [/^chimera$/, beast('a chimera: a lion\'s body with a lion head, a goat head and a dragon head, bat wings and a snake-headed tail, standing on four legs', { body: 'beast', patch: { heads: 3, wings: 'bat', tail: true } })],
  [/^wyvern$/, beast(`a wyvern: a dragon-like creature walking on two legs with two huge bat wings that double as front legs, and a long tail with a venomous stinger, ${NO_RIDER}`, { body: 'dragon', patch: { wings: 'bat', tail: true } })],
  [/^sphinx_of_(lore|valor|wonder)$/, beast('a sphinx: a lion\'s body with a calm human face, large feathered wings and a long tail, seated or standing on four legs', { body: 'beast', patch: { wings: 'feather', tail: true, weapon: null } })],

  // --- Dragons and reptiles --------------------------------------------------------------------------------------------
  [/_dragon_wyrmling$|^(young|adult|ancient)_\w+_dragon$/, DRAGON()],
  [/^pseudodragon$/, beast('a pseudodragon: a tiny dragon the size of a cat, with a barbed tail, small horns and small wings, perched on four legs', { body: 'dragon', patch: { wings: 'bat', tail: true, horns: true } })],
  [/^dragon_turtle$/, beast('a dragon turtle: a huge sea turtle with a dragon\'s head, a heavy shell and flippers, with steam rising from its jaws', { body: 'dragon', patch: { tail: true } })],
  [/^half_dragon$/, biped('a half-dragon: an upright, scaled humanoid warrior with a dragon\'s face, small horns and a tail', { body: 'humanoid', patch: { tail: true, horns: true } })],
  [/^kobold_warrior$/, biped('a kobold: a small, scaly, reptilian humanoid with a dog-like snout, small horns and a thin tail, holding a spear', { body: 'humanoid', patch: { tail: true, horns: true } })],
  [/^(lizard|giant_lizard)$/, beast('a lizard: a long, scaled reptile with a tail, on four short splayed legs', { body: 'dragon', patch: { tail: true } })],
  [/^(crocodile|giant_crocodile)$/, beast('a crocodile: a long, armoured reptile with a wide, tooth-filled snout and a thick tail, on four short legs', { body: 'dragon', patch: { tail: true } })],
  [/^allosaurus$/, beast('an allosaurus: a large theropod dinosaur walking on two powerful hind legs, with a big head full of teeth, small arms and a heavy tail', { body: 'dragon', patch: { tail: true } })],
  [/^tyrannosaurus_rex$/, beast('a tyrannosaurus rex: a huge dinosaur on two powerful hind legs, with a massive head, tiny arms and a heavy tail', { body: 'dragon', patch: { tail: true } })],
  [/^triceratops$/, beast('a triceratops: a heavy four-legged dinosaur with a bony frill and three horns on its face', { body: 'dragon', patch: { tail: true, horns: true } })],
  [/^ankylosaurus$/, beast('an ankylosaurus: a four-legged dinosaur armoured in bony plates, with a heavy club at the end of its tail', { body: 'dragon', patch: { tail: true } })],
  [/^bulette$/, beast('a bulette: a huge armoured land-shark with a dorsal fin, bony plates and a wide mouth of teeth, on four short legs', { body: 'dragon', patch: { tail: true } })],
  [/^plesiosaurus$/, beast('a plesiosaurus: a marine reptile with a long neck, a small head, a broad body and four flippers', { body: 'dragon', patch: { tail: true } })],
  [/^archelon$/, beast('an archelon: a giant sea turtle with a broad shell and four flippers, seen from above and the side', { body: 'beast' })],
  [/^tarrasque$/, beast('the tarrasque: an enormous horned, armoured dragon-like monster with a long tail and spiked carapace, on four legs', { body: 'dragon', patch: { tail: true, horns: true } })],

  // --- Creatures of the water ------------------------------------------------------------------------------------------
  [/^(giant_shark|hunter_shark|reef_shark)$/, FISH('a shark with a dorsal fin and rows of teeth')],
  [/^killer_whale$/, FISH('a killer whale, black and white, with a tall dorsal fin')],
  [/^piranha$/, FISH('a piranha with a blunt head and sharp teeth')],
  [/^(seahorse|giant_seahorse)$/, beast('a seahorse: a curled tail, a snout and a head like a horse, drifting upright in the water, no legs', { body: 'beast', patch: { tail: true } })],
  [/^(crab|giant_crab)$/, beast('a crab with a broad shell, eight legs and two big pincers raised', { body: 'insect' })],
  [/^giant_octopus$/, beast('an octopus with a bulbous head and eight long tentacles', { body: 'aberration' })],
  [/^kraken$/, beast('a kraken: a gigantic squid-like sea monster with a huge head and many thick tentacles', { body: 'aberration' })],
  [/^merfolk_skirmisher$/, upright('a merfolk: a humanoid from the waist up with a fish\'s tail instead of legs, holding a spear, with fins at the ears', { body: 'humanoid', gear: true, patch: { tail: true, weapon: 'spear' } })],
  [/^merrow$/, upright('a merrow: a large, hulking sea-ogre with green skin, a fish\'s tail instead of legs and long arms with claws', { body: 'giant', patch: { tail: true, weapon: null } })],
  [/^sahuagin_warrior$/, biped('a sahuagin: a fish-like humanoid with scaled green skin, fins, webbed hands, gills and a toothy mouth, holding a trident', { body: 'humanoid', patch: { weapon: 'spear' } })],
  [/^aboleth$/, beast('an aboleth: a gigantic, slimy, fish-like creature with a long body, three glowing eyes in a column and four long tentacles', { body: 'aberration' })],

  // --- Spiders, insects and crawlers -----------------------------------------------------------------------------------
  [/^(spider|giant_spider|giant_wolf_spider|phase_spider)$/, beast('a spider with eight legs, many eyes and large fangs', { body: 'spider' })],
  [/^drider$/, beast('a drider: a dark-skinned elf-like torso and head rising from the body of a giant spider with eight legs', { body: 'spider', patch: { arms: 2 } })],
  [/^ettercap$/, biped('an ettercap: a hunched, spider-like humanoid with a bulbous body, long arms and spinnerets, covered in webs', { gear: false, body: 'humanoid', patch: { weapon: null } })],
  [/^(scorpion|giant_scorpion)$/, beast('a scorpion with two pincers and a curved, stinging tail raised over its back', { body: 'insect', patch: { tail: true } })],
  [/^giant_centipede$/, beast('a centipede: a long, segmented body with many legs and large pincers', { body: 'insect' })],
  [/^giant_fire_beetle$/, beast('a giant beetle with a shell and glowing glands, on six legs, with large mandibles', { body: 'insect' })],
  [/^giant_wasp$/, beast('a huge wasp in flight with a striped body, a stinger and translucent wings', { body: 'insect', patch: { wings: 'feather' } })],
  [/^ankheg$/, beast('an ankheg: a large, burrowing, insect-like creature with six legs, a segmented armoured body and large mandibles', { body: 'insect' })],
  [/^chuul$/, beast('a chuul: a large, lobster-like crustacean with a hard shell, two big pincers and tentacles around its mouth', { body: 'insect' })],
  [/^rust_monster$/, beast('a rust monster: an armadillo-like creature with a long tail, a plated body, and two feathery antennae on its head', { body: 'insect', patch: { tail: true } })],
  [/^remorhaz$/, beast('a remorhaz: a huge, centipede-like arctic monster with a hot, glowing back, many legs and a wide mouth', { body: 'insect' })],
  [/^swarm_of_bats$/, SWARM('bats')],
  [/^swarm_of_insects$/, SWARM('crawling and flying insects')],
  [/^swarm_of_piranhas$/, SWARM('piranhas in the water')],
  [/^swarm_of_rats$/, SWARM('rats')],
  [/^swarm_of_ravens$/, SWARM('ravens')],
  [/^swarm_of_venomous_snakes$/, SWARM('writhing snakes')],
  [/^swarm_of_crawling_claws$/, SWARM('severed hands crawling on their fingers')],

  // --- Snakes, worms and serpentine things -----------------------------------------------------------------------------
  [/^(constrictor_snake|giant_constrictor_snake|venomous_snake|giant_venomous_snake)$/, beast('a {name}: a long snake coiled, head raised, with its tongue out', { body: 'serpent' })],
  [/^flying_snake$/, beast('a small, brightly coloured snake with bat-like wings gliding in the air', { body: 'serpent', patch: { wings: 'bat' } })],
  [/^basilisk$/, beast('a basilisk: a stocky, eight-legged lizard with a stone-grey hide and a gaze of glowing eyes', { body: 'serpent', patch: { tail: true } })],
  [/^hydra$/, beast('a hydra: a huge, many-headed reptilian beast with five serpentine heads on long necks, on four legs', { body: 'serpent', patch: { heads: 3, tail: true } })],
  [/^behir$/, beast('a behir: a huge, long, blue serpentine body with twelve short legs and a horned crocodile-like head', { body: 'serpent', patch: { horns: true } })],
  [/^purple_worm$/, beast('a purple worm: a gigantic, segmented worm with a huge round mouth of teeth and a stinging tail', { body: 'serpent', patch: { tail: true } })],
  [/^(guardian_naga|spirit_naga)$/, upright('a naga: the long coiled body of a serpent with the head and torso of a human woman, a cobra-like hood', { body: 'serpent', patch: { weapon: null } })],
  [/^couatl$/, beast('a couatl: a long, feathered serpent with huge rainbow-feathered wings and a gentle face', { body: 'serpent', patch: { wings: 'feather' } })],
  [/^salamander$/, upright('a fire salamander: a lizard-like humanoid with a serpent\'s coiled lower body, wreathed in flames, holding a spear', { body: 'humanoid', gear: true, patch: { tail: true, aura: 'fire', weapon: 'spear' } })],
  [/^lamia$/, upright('a lamia: a woman\'s torso and head on the body of a lion, with a dark mane, horns and a snake tail, on four legs', { body: 'beast', patch: { tail: true, horns: true, weapon: null } })],
  [/^medusa$/, biped('a medusa: a woman with a head of living snakes for hair, a petrifying gaze, in a long robe, holding a bow', { body: 'humanoid', patch: { weapon: 'bow' } })],
  [/^gorgon$/, beast('a gorgon: a heavy, bull-like beast covered in dark metal plates with a horned head, snorting a green breath, on four legs', { body: 'beast', patch: { horns: true, tail: true } })],

  // --- Aberrations, oozes and things without shape ---------------------------------------------------------------------
  [/^(gray_ooze|black_pudding|ochre_jelly)$/, beast('an ooze: a shapeless, glistening puddle of slime with a rounded mound, no head, no limbs', { body: 'ooze' })],
  [/^gelatinous_cube$/, beast('a gelatinous cube: a transparent, wobbling cube of jelly with bones and coins suspended inside it', { body: 'ooze' })],
  [/^gibbering_mouther$/, beast('a gibbering mouther: a lumpy mound of flesh covered in mouths and eyes, no limbs', { body: 'ooze' })],
  [/^mimic$/, beast('a mimic: a wooden treasure chest that has sprung open with sharp teeth, a long tongue and pseudopods', { body: 'ooze' })],
  [/^cloaker$/, beast('a cloaker: a manta-ray-like creature shaped like a black cloak with two wing-like edges, a pale face and a whip-like tail', { body: 'aberration', patch: { tail: true } })],
  [/^darkmantle$/, beast('a darkmantle: a squid-like creature with a round mantle and tentacles, hanging from above', { body: 'aberration' })],
  [/^grick$/, beast('a grick: a worm-like creature with a thick grey body and four sharp tentacles around a beak', { body: 'aberration' })],
  [/^roper$/, beast('a roper: a tall, rocky stalagmite-like creature with a single eye, a wide mouth and long ropy tentacles', { body: 'aberration' })],
  [/^otyugh$/, beast('an otyugh: a heavy, filthy creature on three legs with a barrel body, two long tentacles and a round, toothy mouth', { body: 'aberration' })],
  [/^grimlock$/, biped('a grimlock: a blind, grey-skinned humanoid with no eyes, a bony face and a crude weapon', { body: 'humanoid' })],
  [/^doppelganger$/, biped('a doppelganger: a pale, smooth-skinned, androgynous humanoid, a shapeshifter in plain clothes', { body: 'humanoid', patch: { weapon: null } })],

  // --- Plants ------------------------------------------------------------------------------------------------------------
  [/^awakened_shrub$/, upright('an awakened shrub: a small bush with twiggy arms and legs and a face in the leaves', { body: 'plant' })],
  [/^awakened_tree$/, upright('an awakened tree: a tall tree with a thick trunk, a face in the bark, branch-like arms and root-like legs', { body: 'plant' })],
  [/^treant$/, upright('a treant: a giant walking tree with a face in the bark, long branch arms and root-like legs', { body: 'plant' })],
  [/^shambling_mound$/, upright('a shambling mound: a heap of rotting vegetation, vines and moss in the rough shape of a hunched giant', { body: 'plant' })],
  [/^shrieker_fungus$/, beast('a shrieker: a large purple mushroom with a thick stalk, a wide cap and no limbs', { body: 'plant' })],
  [/^violet_fungus$/, beast('a violet fungus: a squat purple mushroom with a stalk and several long, thorny tentacles waving from it', { body: 'plant' })],
  [/^dryad$/, biped('a dryad: a slender woman with bark-like skin, leaves in her hair, in a dress of leaves', { gear: false, body: 'humanoid', patch: { weapon: null } })],

  // --- Constructs and elementals ---------------------------------------------------------------------------------------
  [/^animated_armor$/, biped('an animated suit of plate armour with no one inside, glowing eyes in the visor, a sword in a gauntlet', { body: 'construct' })],
  [/^animated_flying_sword$/, beast('a single sword floating blade-first in the air, with no hand holding it', { body: 'construct', patch: { weapon: null, armor: null } })],
  [/^animated_rug_of_smothering$/, beast('an animated rug: a patterned carpet rising off the floor with its corners curled like arms, flat, no head', { body: 'construct', patch: { weapon: null, armor: null } })],
  [/^(clay_golem|flesh_golem|iron_golem|stone_golem)$/, upright('a {name}: a huge, heavy humanoid made of its material, with a blank face, thick limbs and glowing eyes', { body: 'construct', patch: { weapon: null, armor: null } })],
  [/^shield_guardian$/, upright('a shield guardian: a hulking, armoured construct of stone and metal with a glowing amulet on its chest and a large shield-like arm', { body: 'construct', patch: { weapon: null } })],
  [/^homunculus$/, beast('a homunculus: a tiny, winged, impish creature the size of a cat, with a small fanged mouth and bat-like wings', { body: 'construct', patch: { wings: 'bat', tail: true, weapon: null, armor: null } })],
  [/^gargoyle$/, upright('a gargoyle: a stone winged demon statue come to life, crouching with horns, bat wings and claws', { body: 'humanoid', patch: { wings: 'bat', horns: true, tail: true, weapon: null } })],
  [/^(air_elemental)$/, upright('an air elemental: a towering whirlwind of dust and wind in a rough humanoid shape, with two glowing eyes', { body: 'elemental' })],
  [/^(earth_elemental)$/, upright('an earth elemental: a hulking humanoid of rock and soil, with glowing crystals for eyes', { body: 'elemental' })],
  [/^(fire_elemental)$/, upright('a fire elemental: a roaring column of flame shaped like a humanoid, with two glowing eyes', { body: 'elemental', patch: { aura: 'fire' } })],
  [/^(water_elemental)$/, upright('a water elemental: a churning mass of water in a rough humanoid shape, with two glowing eyes', { body: 'elemental' })],
  [/^(dust_mephit|ice_mephit|magma_mephit|steam_mephit)$/, beast('a mephit: a small, winged, impish creature the size of a cat, made of its element, hovering', { body: 'elemental', patch: { wings: 'bat', weapon: null, armor: null } })],
  [/^magmin$/, upright('a magmin: a small, burning humanoid of dark rock cracked with glowing lava, wreathed in flames', { body: 'elemental', patch: { aura: 'fire' } })],
  [/^xorn$/, upright('a xorn: a rock-like creature with a round, three-eyed head on a barrel-shaped body, three arms and three legs', { body: 'elemental' })],
  [/^azer_sentinel$/, biped('an azer: a short dwarf-like humanoid made of brass, with flames for hair and beard, holding a hammer', { body: 'elemental', patch: { aura: 'fire' } })],
  [/^(djinni|efreeti)$/, upright('a genie: a muscular, powerful humanoid whose lower body is a swirling funnel of smoke, with no legs', { body: 'elemental', patch: { weapon: null } })],

  // --- Fiends and celestials -------------------------------------------------------------------------------------------
  [/^balor$/, biped('a balor: a towering, winged, horned demon wreathed in flame, with a flaming sword and a whip', { body: 'humanoid', patch: { wings: 'bat', horns: true, aura: 'fire' } })],
  [/^pit_fiend$/, biped('a pit fiend: a huge, winged, horned devil with a barbed tail, in dark plate, holding a mace', { body: 'humanoid', patch: { wings: 'bat', horns: true, tail: true } })],
  [/^(barbed_devil|bearded_devil|bone_devil|chain_devil|horned_devil|ice_devil|erinyes)$/, biped('a {name}: a horned, red-skinned devil with a tail, clawed hands and a menacing grin', { body: 'humanoid', patch: { horns: true, tail: true } })],
  [/^dretch$/, biped('a dretch: a small, pale, rotund demon with a fanged mouth, bulging eyes, thin arms and a squat body', { gear: false, body: 'humanoid', patch: { weapon: null } })],
  [/^lemure$/, biped('a lemure: a shapeless, melting devil of grey flesh, a lumpy blob with a face and stubby arms', { gear: false, body: 'humanoid', patch: { weapon: null } })],
  [/^imp$/, beast('an imp: a tiny, red devil the size of a cat, with bat wings, small horns, a barbed tail and a smirk, hovering', { body: 'humanoid', patch: { wings: 'bat', horns: true, tail: true, weapon: null } })],
  [/^quasit$/, beast('a quasit: a tiny, clawed demon the size of a cat, with bat wings, small horns and a tail, hovering', { body: 'humanoid', patch: { wings: 'bat', horns: true, tail: true, weapon: null } })],
  [/^(vrock)$/, biped('a vrock: a vulture-like demon with a long neck, a beak and ragged wings, with long taloned arms and legs', { gear: false, body: 'humanoid', patch: { wings: 'bat', weapon: null } })],
  [/^hezrou$/, biped('a hezrou: a hulking, toad-like demon with a wide mouth, bulging eyes and spines, hunched upright', { gear: false, body: 'humanoid', patch: { weapon: null } })],
  [/^glabrezu$/, biped('a glabrezu: a huge demon with four arms, two with giant crab-like pincers, a dog-like head and a tail', { gear: false, body: 'humanoid', patch: { arms: 4, weapon: null } })],
  [/^nalfeshnee$/, biped('a nalfeshnee: a huge, fat demon with a boar\'s head, small wings and a bulky body, upright', { gear: false, body: 'humanoid', patch: { wings: 'bat', weapon: null } })],
  [/^marilith$/, upright('a marilith: a demon with the torso and head of a six-armed woman, each hand holding a sword, and the long coiled body of a snake', { body: 'serpent', patch: { weapon: null, arms: 4 } })],
  [/^(succubus|incubus)$/, biped('a succubus or incubus: a beautiful humanoid fiend with small horns and bat wings, in dark clothes', { gear: false, body: 'humanoid', patch: { wings: 'bat', horns: true, weapon: null } })],
  [/^(solar|planetar|deva)$/, biped('an angel: a radiant humanoid with large white feathered wings, in gleaming armour, holding a sword', { body: 'humanoid', patch: { wings: 'feather', aura: 'holy' } })],
  [/^rakshasa$/, biped('a rakshasa: a humanoid with the head of a tiger, in rich robes, with backwards palms and clawed hands', { body: 'humanoid', patch: { weapon: null } })],
  [/^oni$/, biped('an oni: a huge, blue-skinned ogre with two horns, tusks and a topknot, holding a big blade', { body: 'giant' })],
  [/^(night_hag|green_hag|sea_hag)$/, biped('a hag: a hunched, old, witch-like woman with warts, a long nose, tattered robes and claw-like fingers', { gear: false, body: 'humanoid', patch: { weapon: null } })],
  [/^minotaur_of_baphomet$/, biped('a minotaur: a huge, muscular man with the head of a bull, horns, a ring in its nose and a great axe', { body: 'humanoid', patch: { horns: true, weapon: 'axe' } })],
  [/^centaur_trooper$/, upright('a centaur: a humanoid torso from the waist up growing from the body of a horse, with four legs, holding a bow or spear', { body: 'beast', gear: true, patch: { tail: true, weapon: 'spear' } })],
  [/^satyr$/, biped('a satyr: a humanoid with a goat\'s legs and hooves, small horns, pointed ears and a bearded face, playing pipes', { body: 'humanoid', patch: { horns: true, weapon: null } })],
  [/^sprite$/, beast('a sprite: a tiny winged fey the size of a mouse, with butterfly-like wings, flying with a tiny sword and bow', { body: 'humanoid', patch: { wings: 'feather', weapon: null } })],

  // --- Giants and the like ---------------------------------------------------------------------------------------------
  [/^(cloud_giant|fire_giant|frost_giant|hill_giant|stone_giant|storm_giant)$/, upright('a {name}: a towering human-shaped giant with massive limbs, holding a huge club or weapon', { gear: true, body: 'giant' })],
  [/^ettin$/, upright('an ettin: a hulking, two-headed giant with two heads, thick limbs and a spiked club', { gear: true, body: 'giant', patch: { heads: 2 } })],
  [/^ogre$/, upright('an ogre: a huge, fat, brutish humanoid with a heavy club and a coarse face', { gear: true, body: 'giant' })],
  [/^troll$/, upright('a troll: a tall, gangly, green-skinned humanoid with long arms, a hunched back, long claws and a crooked nose', { body: 'giant', patch: { weapon: null } })],

  // --- People ---------------------------------------------------------------------------------------------------------------
  [/^(archmage|mage|priest|priest_acolyte|druid|cultist|cultist_fanatic)$/, biped('a {name}: a robed human spellcaster with a staff and a focused expression', { body: 'humanoid' })],
  [/^(goblin_minion|goblin_warrior|goblin_boss)$/, biped('a {name}: a small, green-skinned, pointy-eared goblin with a crooked nose and sharp teeth, in ragged armour', { body: 'humanoid' })],
  [/^(hobgoblin_captain|hobgoblin_warrior)$/, biped('a {name}: a tall, orange-skinned, disciplined goblinoid soldier in matching armour', { body: 'humanoid' })],
  [/^(bugbear_stalker|bugbear_warrior)$/, biped('a {name}: a large, hairy, long-armed goblinoid with a flat nose and a morningstar', { body: 'humanoid' })],
  [/^gnoll_warrior$/, biped('a gnoll: a hyena-headed humanoid, tall and thin, with spotted fur, a mane and a cruel grin', { body: 'humanoid' })],
  [/^(bandit|bandit_captain|berserker|commoner|gladiator|guard|guard_captain|knight|noble|pirate|pirate_captain|scout|spy|assassin|tough|tough_boss|warrior_infantry|warrior_veteran)$/, biped('a {name}: a human', { body: 'humanoid' })],
];

const GENERIC: Record<string, Anatomy> = {
  humanoid: biped('an upright humanoid'),
  giant: upright('a huge humanoid giant', { gear: true }),
  beast: beast('a four-legged animal'),
  rodent: beast('a small furry animal on four legs'),
  insect: beast('a large insect-like creature with many legs'),
  spider: beast('a spider with eight legs'),
  serpent: beast('a long serpent'),
  dragon: beast('a dragon-like reptile on four legs'),
  bird: beast('a bird'),
  ooze: beast('a shapeless ooze'),
  elemental: upright('an elemental made of its element'),
  plant: upright('a plant creature'),
  aberration: beast('a strange, many-limbed aberration'),
  construct: upright('a construct of stone and metal'),
  ghost: upright('a ghostly spirit'),
  bear: beast('a bear on four legs'),
  owlbear: beast('an owlbear'),
};

/** Whether an explicit rule describes this creature. Every SRD creature should have one. */
export const hasAnatomy = (id: string) => RULES.some(([re]) => re.test(id));

/** A creature's anatomy: the first rule that fits its id, else a generic one from its body. `{name}` becomes its name. */
export function anatomyOf(id: string, name: string, look: MonsterLook): Anatomy {
  const rule = RULES.find(([re]) => re.test(id));
  const a = rule ? rule[1] : GENERIC[look.body] ?? GENERIC.humanoid;
  return { ...a, form: a.form.replace(/\{name\}/g, name.toLowerCase()) };
}

/** The drawn look with the corrections of the creature's anatomy: the right body, and no weapon for a horse. */
export function fixLook(id: string, look: MonsterLook): MonsterLook {
  const rule = RULES.find(([re]) => re.test(id))?.[1];
  if (!rule) return look;
  const out: MonsterLook = { ...look, ...(rule.body ? { body: rule.body } : {}), ...rule.patch };
  if (!rule.gear) { out.weapon = null; out.armor = null; }
  return out;
}

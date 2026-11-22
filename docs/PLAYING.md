# Playing Hearthforge

Back to the [README](../README.md).

## Playing together

- **Who you are.** You sign in with your own account, and the seat and heroes you take belong to it, so you can pick them up on any device. A name can sit at a table only once. After a reload, a dropped connection or a server restart you get your seat back.
- **Tables.** The lobby lists every table with its players, story language, free seats and whether the adventure has begun. A table has 1 to 4 seats and can ask for an invite code. The table room shows an invite link to copy.
- **Before the adventure.** Everyone picks or creates heroes and says they are ready, then the host begins. The host can remove a player, hand the table over, or close it. If the host is gone for 20 seconds, the player who has sat longest takes over.
- **Away players.** A disconnected player keeps their seat. In a fight anyone may play an away hero so the order never stalls; in the story the Dungeon Master keeps them in the background.
- **Table talk.** An out-of-character chat with whispers, which the Dungeon Master never reads. What you type into the story box is in character.
- **Whose turn.** In a fight the initiative order decides. In the story the first action opens a short window (`HEARTHFORGE_TURN_WAIT`), and the Dungeon Master answers once everyone has acted or the window closes, resolving all actions in one scene.
- **Reactions.** When an enemy leaves a hero's reach, the fight pauses for that hero's player only: strike or let it go (`HEARTHFORGE_REACTION_WAIT`). Each hero can be set to ask, always strike or never; a player who is away never holds up the table.

## Where the adventure starts

In the table room the host chooses the world:

- **Region.** *A new region* rolls a country from the world seed (vale, coast, fens, highlands, forest or borderland) with its town and tavern, village, sanctuary, ruin, main threat with lair and quest, and the people who live there. *Classic* is the handcrafted Emberfall Vale.
- **How it begins.** Looking for work, shipwrecked, caravan guards, prison break, a festival gone wrong, a letter from an old friend, a surprise, or a sentence or two of your own.
- **World seed.** Shown to everyone and written to the game log. The same seed with the same region and opening rebuilds the same map, places, people and quests, in English and German. Type one in to replay or share a world.

With an API key, one short call to the background model rewords a rolled region before the first scene so it fits the opening. It never changes names, the map, quests or rewards.

### Campaign books

Under **Where**, the host can also pick a published adventure for the Dungeon Master to run. Drop a PDF, a `.txt` or a Markdown file (up to 64 MB) into the picker, or take one from the list of free adventures. A book from the list is fetched by your server straight from its source when you press Download; where the source needs a sign-in (DMs Guild, D&D Beyond, itch.io), "Get it here" opens its page, and you drop the file you downloaded there. Hearthforge itself hosts no adventures.

The server reads a book once when it arrives. It splits the text into sections along the PDF's bookmarks (or every two pages), the background model takes notes part by part, and the standard model writes a digest: the hidden story, how it opens, the home town, the first places, people and quest (in English and German), and the chapters. Reading a short adventure costs a few cents, a whole campaign book more; the cost goes to the credit of the player who brought it. During play the Dungeon Master gets the digest and the index of sections with every turn, and reads the section the party is in with a `campaign` tool; that section stays in the cached part of the prompt until the party moves on, so the book is never sent whole. The table's map starts with the book's town, places and people on it, and the Dungeon Master adds the rest as the story gets there.

A book you upload is visible to you and the Innkeeper only. Scanned PDFs without a text layer cannot be read. Books are kept in `/data/campaigns` and are not part of the backups; a table keeps its own copy of the digest, so a game goes on if its book is removed.

## How to play

1. Sign in (the Innkeeper makes your account or sends you an invite link), then open a table or sit down at one.
2. Add heroes: flip a premade card, customize it, or create your own. Alone, you can add up to four.
3. Read the scene, then click a suggested action or type what you do.
4. To travel, click a hex (press `m` for the big map), check the journey and press **Set out**. Places inside a town are listed under *Here*, and dungeons are entered with **Delve**.
5. In a fight your hero gets 30 ft of movement and one action: click an enemy to attack or pick from the action bar. `Space` ends the turn.
6. Short rests take an hour, long rests eight. Camping in the wild can be interrupted; towns, taverns and shrines are safe. If the party falls, survivors wake at the last safe place, lighter in the purse.

| Key | Action |
| --- | --- |
| `i` / `c` / `m` / `j` | Inventory / character sheet / full map / journal |
| `t` | Trade, where there is a merchant |
| `1`–`4` | In a window: switch hero or journal chapter |
| `WASD`, arrows | Move the active hero in a fight |
| `1`–`9` | Action bar buttons |
| `Space` | End turn |
| `Esc` | Cancel targeting, close an overlay, clear the planned journey |

### Rules and house rules

The rules follow the 5e System Reference Document with simplifications:

- Mana is the Spell Points variant: a caster's mana is the point value of the spell slots in their class table (a wizard has 4, 6, 14, 17 and 27 points at levels 1 to 5, and 133 at level 20). A spell costs 2, 3, 5, 6, 7, 9, 10, 11 and 13 points at levels 1 to 9. A warlock's mana comes back on a short rest.
- Levels run to 20, with fixed-average hit points on level-up. Each class has the one SRD subclass.
- Spells are simplified where the battle map needs it: an area is centred on the enemy you click, zones strike at the start of the caster's turn rather than when an enemy enters, reactions fire on their own, Misty Step gives 30 ft of movement that draws no opportunity attacks instead of a teleport, and spells of minutes or hours (Revivify's one minute, a buff cast before a fight) last until the next fight ends or the next rest.
- Magic items: the engine runs their numbers (armor class, saves, ability scores, resistances, speed, darkvision, extra damage, the spells of wands and staffs); the rest of an item's rules is told by the Dungeon Master. A wand's or staff's save DC is the wielder's own, at least 15.
- Weapon Mastery and multiclassing are not in the game. Wild Shape offers four beasts (wolf, black bear, dire wolf, brown bear). Class features that only matter in the story (Thieves' Cant, Primal Knowledge, a warlock's familiar) are handed to the Dungeon Master.
- Parties smaller than four get the Hearth's Blessing (+4 max HP per missing hero) and face fewer monsters.
- Heroes left unconscious when a fight is won get up with 1 HP. A long rest is allowed once every 16 hours.
- Traits the engine cannot enforce (darkvision, speaking with small beasts) are handed to the Dungeon Master to honour in the story; the creator marks which is which.
- No ammunition or encumbrance yet.

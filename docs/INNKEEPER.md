# The Innkeeper

Back to the [README](../README.md).

The Innkeeper is the owner's panel. Everyone who plays signs in with an account; accounts with the **Innkeeper** role see the panel's door in the lobby and under **Settings → Table & server**, or open it at `http://<address>:3000/?innkeeper`. The first account is called `innkeeper`. Sign in with the password the installer printed (or the one the server wrote to its log and to `/data/innkeeper-first-password.txt`) and choose your own under **Your account**. On a server from before accounts, the `innkeeper` account keeps the Innkeeper password you already had.

**Accounts.** Under **Players** the Innkeeper makes accounts (the server makes up a first password to pass on, which the player then changes) or copies an invite link that works once for 7 days, where the player picks name and password. There is no email. The Innkeeper sets each account's role (Player or Innkeeper), gives a new password to someone who forgot theirs, or deletes an account. "Stay signed in on this device" keeps a browser signed in for 30 days; otherwise it lasts the browser session, at most a day. Passwords are stored only as scrypt hashes in `/data/accounts.json`.

Heroes, seats and saves belong to the account, so a player picks up their hero on any device. Seats taken before accounts move to the account by themselves when the player signs in from the browser they played in; the Innkeeper can hand any other one over under **Players → Seats from before accounts**. Each account and each hero counts sessions, play time, killing blows, critical hits, deaths and gold earned, shown under **Your account** (test mode does not count).

| Tab | What it does |
| --- | --- |
| **Overview** | What is running, who is playing, today's AI cost, and an announcement for every player. |
| **Tables** | Every table with players, region, seed and last save. Pause, resume, remove a player or delete a table; the bin holds the last ten deleted tables per host. **Fresh stories** shows which names and quests the Dungeon Master is asked to avoid and can forget them. |
| **Players** | Accounts, roles and invite links; seats from before accounts; open connections with address and browser. Disconnect someone or ban an address. |
| **Costs and credits** | Each player's credit and top-ups, the one currency (dollars, or another currency at a fixed rate you enter), and calls, tokens and estimated cost per day, table and model for 90 days. An estimate from list prices, not your invoice. |
| **Dungeon Master** | The models for each kind of moment, how hard the Dungeon Master thinks, prompt caching, how strongly people play it up and the other table defaults. |
| **Sound and voice** | Music, ambient loops, sound effects and the narrator voice. See [Art and music](ART-AND-MUSIC.md) and [Story pictures, voice and HTTPS](PICTURES-AND-VOICE.md). |
| **Art** | Art packs, story illustrations (hero and people portraits, battle figures, scene pictures) with the picture library, and the keys for the picture services. See [Story pictures](PICTURES-AND-VOICE.md#story-illustrations). |
| **Server** | Version, update now or automatic, restart (now or with a warning to players), HTTPS, your password, the live log and daily backups (the last 14 are kept, also on demand, as a download, and restore). Art, music, pictures, campaign books and the API key are not included. |

**How updating works.** A second small container, the *updater*, sits next to the game. When you press **Update now** the game leaves a request in a folder they share. The updater pulls the latest code, builds the new image while the game keeps running, and swaps the container in a few seconds. If the build fails or the new version does not come up healthy, it puts the previous one back and the panel says so. Saved games are not touched. The updater needs the Docker socket, which is as good as root in the guest. It opens no port and only understands `check` and `update`. To go without it, remove the `updater` service from `docker-compose.yml`; the panel then says updates are done in the terminal.

Passwords travel over plain HTTP unless you switch on [HTTPS](PICTURES-AND-VOICE.md#https). Five wrong passwords lock an address out for five minutes. If you forget the `innkeeper` password, leave an empty file named `innkeeper-reset` in the data folder and restart; the server makes up a new one and prints it in its log (and in `/data/innkeeper-first-password.txt`). Everyone else keeps their account:

```bash
docker compose exec hearthforge touch /data/innkeeper-reset && docker compose restart hearthforge
```

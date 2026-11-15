# The updater: a small container next to Hearthforge that can pull the latest version from
# GitHub and rebuild the game's container when the owner asks for it in the Innkeeper.
# It needs the Docker socket for that, so it listens to nothing on the network and takes
# only two fixed words as requests. See updater/updater.sh.
# The stock image already brings docker, docker compose and git; nothing is installed on top.
FROM docker:cli
# The script is run from the checkout, so an update also updates the updater.
CMD ["sh", "-c", "while true; do sh /repo/updater/updater.sh; sleep 3; done"]

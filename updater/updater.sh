#!/bin/sh
# Hearthforge updater. Runs inside the updater container (see docker-compose.yml), which is the
# stock Docker command line image: it brings docker, docker compose and git, and this script
# needs nothing else.
#
# The game server cannot rebuild its own container. It leaves a request in the data volume
# (control/request, containing the word "check" or "update") and this script does the work:
#
#   check    fetch from GitHub and report how many changes are waiting
#   update   fast-forward the checkout, build the new image, swap the container, and go
#            back to the old version if the new one does not come up healthy
#
# Nothing the server writes is ever executed. Progress is reported in plain files in the
# control folder: status (key=value lines), incoming and recent (one commit per line),
# updater.log and build.log (the output of the last build).
set -u

REPO="${HEARTHFORGE_REPO_DIR:-/repo}"
CONTROL="${HEARTHFORGE_CONTROL_DIR:-/data/control}"
SERVICE="${HEARTHFORGE_SERVICE:-hearthforge}"
CHECK_EVERY="${HEARTHFORGE_CHECK_SECONDS:-21600}"   # look for a new version every six hours
HEALTH_WAIT="${HEARTHFORGE_HEALTH_SECONDS:-180}"
LOG="$CONTROL/updater.log"

# The game server creates the control folder when it starts. Wait for it, so that a brand-new
# data volume is first set up by the game (with the right owner) and not by this container.
for _ in $(seq 1 30); do [ -d "$CONTROL" ] && break; sleep 2; done
mkdir -p "$CONTROL"
# The game server runs as an ordinary user and must be able to leave its request here.
chown "$(stat -c %u:%g "$(dirname "$CONTROL")")" "$CONTROL" 2>/dev/null || true
git config --global --add safe.directory "$REPO" 2>/dev/null
cd "$REPO" || { echo "The checkout is not mounted at $REPO." >&2; sleep 30; exit 1; }

PROJECT="$(docker inspect "$(hostname)" --format '{{ index .Config.Labels "com.docker.compose.project" }}' 2>/dev/null)"
PROJECT="${PROJECT:-hearthforge}"
BRANCH="${HEARTHFORGE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then BRANCH=main; fi

STATE=idle
# Keep the message of the last job across a restart of this script, such as "Updated to abc1234".
MESSAGE="$(sed -n 's/^message=//p' "$CONTROL/status" 2>/dev/null | head -n 1)"
CHECKED_AT=""

# Run from the checkout, so compose reads the same files (docker-compose.yml, an override, .env) as on the host.
compose() { ( cd "$REPO" && docker compose -p "$PROJECT" "$@" ); }

say() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" >> "$LOG"; }

# Write a file in one step, so the server never reads half of it.
put() { cat > "$CONTROL/$1.tmp" && chmod 644 "$CONTROL/$1.tmp" && mv "$CONTROL/$1.tmp" "$CONTROL/$1"; }

one_line() { tr '\r\n' '  '; }

report() {
  git log -n 50 --format='%h%x09%cI%x09%s' "HEAD..origin/$BRANCH" 2>/dev/null | put incoming
  git log -n 15 --format='%h%x09%cI%x09%s' HEAD 2>/dev/null | put recent
  {
    echo "state=$STATE"
    echo "message=$(printf '%s' "$MESSAGE" | one_line)"
    echo "branch=$BRANCH"
    echo "commit=$(git rev-parse --short HEAD 2>/dev/null)"
    echo "commitDate=$(git log -1 --format=%cI 2>/dev/null)"
    echo "subject=$(git log -1 --format=%s 2>/dev/null | one_line)"
    echo "behind=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)"
    echo "checkedAt=$CHECKED_AT"
    # The last version that did not build or start. It is not tried again on its own.
    echo "failed=$(cat "$CONTROL/failed" 2>/dev/null | tr -cd '0-9a-f')"
  } | put status
}

set_state() {
  STATE="$1"; MESSAGE="${2:-}"
  if [ -n "$MESSAGE" ]; then say "$MESSAGE"; fi
  report
}

fetch() {
  if git fetch --quiet origin "$BRANCH" >> "$LOG" 2>&1; then
    CHECKED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    return 0
  fi
  return 1
}

check() {
  STATE=checking; report
  # A successful check keeps the message of the last job.
  if fetch; then STATE=idle; report; else set_state failed "GitHub could not be reached."; fi
}

container() { compose ps -q "$SERVICE" 2>/dev/null | head -n 1; }

healthy() {
  waited=0
  while [ "$waited" -lt "$HEALTH_WAIT" ]; do
    id="$(container)"
    status="$(docker inspect --format '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}{{ .State.Status }}{{ end }}' "$id" 2>/dev/null)"
    case "$status" in healthy|running) return 0 ;; esac
    # A version that keeps crashing will not get better by waiting.
    restarts="$(docker inspect --format '{{ .RestartCount }}' "$id" 2>/dev/null)"
    if [ "${restarts:-0}" -ge 3 ]; then return 1; fi
    sleep 3; waited=$((waited + 3))
  done
  return 1
}

update() {
  STATE=checking; report
  if ! fetch; then set_state failed "GitHub could not be reached."; return; fi
  old="$(git rev-parse HEAD)"
  if [ "$(git rev-list --count "HEAD..origin/$BRANCH")" = "0" ]; then set_state idle "Already up to date."; return; fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    set_state failed "Files in the checkout were changed by hand, so the update was not applied."
    return
  fi
  if ! git merge --quiet --ff-only "origin/$BRANCH" >> "$LOG" 2>&1; then
    set_state failed "The checkout has commits of its own, so the update was not applied."
    return
  fi
  new="$(git rev-parse --short HEAD)"
  # Keep the image that runs now, to go back to if the new one does not start.
  image="$(docker inspect --format '{{ .Config.Image }}' "$(container)" 2>/dev/null)"
  if [ -n "$image" ]; then docker image tag "$image" "$image-previous" >> "$LOG" 2>&1 || image=""; fi

  set_state building "Building version $new. The game keeps running meanwhile."
  if ! compose build "$SERVICE" > "$CONTROL/build.log" 2>&1; then
    git reset --quiet --hard "$old"
    tail -n 15 "$CONTROL/build.log" >> "$LOG"
    echo "$new" | put failed
    set_state failed "The build of $new failed. The old version keeps running."
    return
  fi

  set_state restarting "Starting version $new."
  compose up -d --no-deps "$SERVICE" >> "$LOG" 2>&1
  if healthy; then
    docker image prune -f > /dev/null 2>&1
    rm -f "$CONTROL/failed"
    set_state idle "Updated to $new."
    # Leave, so the loop around this script starts its new version.
    exit 0
  fi

  say "Version $new did not come up. Going back to the previous version."
  git reset --quiet --hard "$old"
  if [ -n "$image" ]; then
    docker image tag "$image-previous" "$image" >> "$LOG" 2>&1
  else
    compose build "$SERVICE" > "$CONTROL/build.log" 2>&1
  fi
  compose up -d --no-deps --force-recreate "$SERVICE" >> "$LOG" 2>&1
  echo "$new" | put failed
  set_state failed "Version $new did not start, so the previous version was put back."
}

# A sign of life the server can see even while a long build keeps this script busy.
( while true; do date +%s | put heartbeat; sleep 10; done ) &
HEARTBEAT=$!
trap 'kill "$HEARTBEAT" 2>/dev/null' EXIT

# Keep the log short.
if [ -f "$LOG" ]; then tail -n 400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
rm -f "$CONTROL/request"
say "Updater ready: project $PROJECT, branch $BRANCH."
check
last_check="$(date +%s)"

while true; do
  if [ -f "$CONTROL/request" ]; then
    job="$(head -c 16 "$CONTROL/request" | tr -cd 'a-z')"
    rm -f "$CONTROL/request"
    case "$job" in
      check) check ;;
      update) update ;;
      *) say "Ignored an unknown request." ;;
    esac
    last_check="$(date +%s)"
  elif [ $(( $(date +%s) - last_check )) -ge "$CHECK_EVERY" ]; then
    check; last_check="$(date +%s)"
  fi
  sleep 2
done

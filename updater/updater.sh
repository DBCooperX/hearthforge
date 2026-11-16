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
#   https    take the HTTPS settings the Innkeeper left in control/https.request, check every
#            value against a strict pattern, write them into .env and (re)start Caddy
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

# ------------------------------------------------------------------------------------------ HTTPS
# The Innkeeper sets HTTPS up in the game; Caddy is a container of its own and reads .env, so the
# settings are written there. Every value is checked against a strict pattern first, and nothing
# from the request is ever run: it only ends up as KEY=value lines in .env.
ENV_FILE="$REPO/.env"
HTTPS_STATE=idle
HTTPS_MESSAGE="$(sed -n 's/^message=//p' "$CONTROL/https" 2>/dev/null | head -n 1)"

env_get() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -n 1; }

# Replace or remove one KEY=value line. The file keeps its owner and permissions (it holds secrets).
env_set() {
  touch "$ENV_FILE"
  grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  if [ -n "$2" ]; then printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE.tmp"; fi
  cat "$ENV_FILE.tmp" > "$ENV_FILE"
  rm -f "$ENV_FILE.tmp"
}

caddy_id() { docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=caddy" 2>/dev/null | head -n 1; }

https_report() {
  id="$(caddy_id)"
  {
    echo "state=$HTTPS_STATE"
    echo "message=$(printf '%s' "$HTTPS_MESSAGE" | one_line)"
    case "$(env_get COMPOSE_PROFILES)" in *https*) echo "on=1" ;; *) echo "on=0" ;; esac
    echo "domain=$(env_get HEARTHFORGE_DOMAIN)"
    echo "local=$(env_get HEARTHFORGE_LOCAL_HOSTS)"
    echo "email=$(env_get HEARTHFORGE_ACME_EMAIL)"
    echo "dnsProvider=$(env_get HEARTHFORGE_DNS_PROVIDER)"
    if [ -n "$(env_get HEARTHFORGE_DNS_TOKEN)" ]; then echo "dnsToken=1"; else echo "dnsToken=0"; fi
    if [ -n "$id" ]; then echo "caddy=$(docker inspect --format '{{ .State.Status }}' "$id" 2>/dev/null)"; else echo "caddy=none"; fi
  } | put https
  if [ -n "$id" ]; then docker logs --tail 40 "$id" 2>&1 | put https.log; fi
}

https_fail() { HTTPS_STATE=failed; HTTPS_MESSAGE="$1"; say "$1"; https_report; }

# Value of KEY in the request, or nothing. "present KEY" tells an empty value from a missing one.
req_get() { sed -n "s/^$1=//p" "$CONTROL/https.request" 2>/dev/null | head -n 1 | tr -d '\r'; }
present() { grep -q "^$1=" "$CONTROL/https.request" 2>/dev/null; }
matches() { [ "$(printf '%s' "$1" | wc -l)" -eq 0 ] && printf '%s\n' "$1" | grep -Eqx "$2"; }

https_job() {
  if [ ! -f "$CONTROL/https.request" ]; then https_fail "The HTTPS settings did not arrive."; return; fi
  mode="$(req_get mode)"; domain="$(req_get domain)"; hosts="$(req_get local)"; email="$(req_get email)"
  provider="$(req_get dnsProvider)"; token="$(req_get dnsToken)"; set_token=0
  if present dnsToken; then set_token=1; fi
  rm -f "$CONTROL/https.request"
  case "$mode" in on|off) ;; *) https_fail "HTTPS: unknown request."; return ;; esac
  matches "$domain" '([A-Za-z0-9-]+\.)+[A-Za-z]{2,}|' || { https_fail "HTTPS: the domain is not valid."; return; }
  matches "$hosts" '[A-Za-z0-9.:,-]*' || { https_fail "HTTPS: the local addresses are not valid."; return; }
  matches "$email" '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?' || { https_fail "HTTPS: the email address is not valid."; return; }
  matches "$provider" '(cloudflare|duckdns|hetzner|digitalocean)?' || { https_fail "HTTPS: unknown DNS provider."; return; }
  matches "$token" '[A-Za-z0-9._~+/=:-]*' || { https_fail "HTTPS: the DNS token has characters it cannot have."; return; }

  HTTPS_STATE=working
  if [ "$mode" = off ]; then
    env_set COMPOSE_PROFILES ""
    id="$(caddy_id)"
    if [ -n "$id" ]; then docker rm -f "$id" >> "$LOG" 2>&1; fi
    HTTPS_STATE=idle; HTTPS_MESSAGE="HTTPS is off."; say "$HTTPS_MESSAGE"; https_report
    return
  fi
  if [ -z "$domain" ] && [ -z "$hosts" ]; then https_fail "HTTPS needs a domain or a local address."; return; fi
  env_set COMPOSE_PROFILES https
  env_set HEARTHFORGE_DOMAIN "$domain"
  env_set HEARTHFORGE_LOCAL_HOSTS "$hosts"
  env_set HEARTHFORGE_ACME_EMAIL "$email"
  env_set HEARTHFORGE_DNS_PROVIDER "$provider"
  if [ "$set_token" = 1 ]; then env_set HEARTHFORGE_DNS_TOKEN "$token"; fi
  HTTPS_MESSAGE="Starting Caddy for ${domain:-$hosts}."; say "$HTTPS_MESSAGE"; https_report
  # Built afresh only when the DNS plugin changed; otherwise compose reuses the image.
  if compose --profile https up -d --build --no-deps caddy > "$CONTROL/https.build.log" 2>&1; then
    sleep 5
    HTTPS_STATE=idle; HTTPS_MESSAGE="Caddy runs for ${domain:-$hosts}."
  else
    tail -n 15 "$CONTROL/https.build.log" >> "$LOG"
    HTTPS_STATE=failed; HTTPS_MESSAGE="Caddy could not be started. The HTTPS log says why."
  fi
  say "$HTTPS_MESSAGE"
  https_report
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
https_report
last_check="$(date +%s)"

while true; do
  if [ -f "$CONTROL/request" ]; then
    job="$(head -c 16 "$CONTROL/request" | tr -cd 'a-z')"
    rm -f "$CONTROL/request"
    case "$job" in
      check) check ;;
      update) update ;;
      https) https_job ;;
      *) say "Ignored an unknown request." ;;
    esac
    last_check="$(date +%s)"
  elif [ $(( $(date +%s) - last_check )) -ge "$CHECK_EVERY" ]; then
    check; https_report; last_check="$(date +%s)"
  fi
  sleep 2
done

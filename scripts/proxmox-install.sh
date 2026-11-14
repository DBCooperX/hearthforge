#!/usr/bin/env bash
# Hearthforge installer for Proxmox VE.
#
# Run on the Proxmox host as root:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/DBCooperX/hearthforge/main/scripts/proxmox-install.sh)"
#
# First run: creates a Debian 12 LXC with Docker, clones Hearthforge into it, asks for
# your Anthropic API key and starts the stack. Later runs: update the existing container.
#
# Override any default by setting the variable first, for example:
#   CTID=120 STORAGE=local-zfs MEMORY=4096 bash -c "$(curl -fsSL .../proxmox-install.sh)"
set -euo pipefail

HOSTNAME_CT="${HOSTNAME_CT:-hearthforge}"       # container hostname, also used to find it again
CTID="${CTID:-}"                                # container id, default: next free id
STORAGE="${STORAGE:-}"                          # storage for the root disk, default: auto-detect
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"   # storage that holds container templates
BRIDGE="${BRIDGE:-vmbr0}"                       # network bridge
IP="${IP:-dhcp}"                                # "dhcp" or a CIDR such as 192.168.1.50/24
GATEWAY="${GATEWAY:-}"                          # gateway, only with a static IP
CORES="${CORES:-2}"
MEMORY="${MEMORY:-2048}"                        # MB. The image build needs about 1.5 GB.
SWAP="${SWAP:-512}"
DISK="${DISK:-8}"                               # GB
PORT="${PORT:-3000}"                            # port Hearthforge listens on inside the container
REPO="${REPO:-https://github.com/DBCooperX/hearthforge.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/hearthforge"

say() { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root on the Proxmox host."
command -v pct >/dev/null 2>&1 || die "pct not found. This script must run on a Proxmox VE host, not inside a guest."

in_ct() { pct exec "$CTID" -- bash -lc "$1"; }

ct_ip() { pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}'; }

wait_for_network() {
  say "Waiting for the container's network"
  for _ in $(seq 1 30); do
    if pct exec "$CTID" -- bash -c 'getent hosts github.com >/dev/null 2>&1'; then return 0; fi
    sleep 2
  done
  die "The container has no working network or DNS. Check BRIDGE ($BRIDGE) and IP ($IP)."
}

compose_up() {
  say "Building and starting Hearthforge (the first build takes a few minutes)"
  in_ct "cd $APP_DIR && docker compose up -d --build"
}

finish() {
  local ip
  ip="$(ct_ip || true)"
  say "Hearthforge is running in container $CTID"
  echo "    Open:    http://${ip:-<container-ip>}:${PORT}"
  echo "    Logs:    pct exec $CTID -- docker compose -f $APP_DIR/docker-compose.yml logs -f"
  echo "    Config:  pct exec $CTID -- nano $APP_DIR/.env   (then run this installer again)"
  echo "    Update:  run this installer again"
}

# ---------------------------------------------------------------- update path
EXISTING="$(pct list 2>/dev/null | awk -v h="$HOSTNAME_CT" 'NR>1 && $NF==h {print $1; exit}')"
if [ -n "$EXISTING" ]; then
  CTID="$EXISTING"
  say "Found existing container $CTID ($HOSTNAME_CT), updating it"
  pct status "$CTID" | grep -q running || pct start "$CTID"
  wait_for_network
  in_ct "cd $APP_DIR && git pull --ff-only"
  compose_up
  in_ct "docker image prune -f >/dev/null" || true
  finish
  exit 0
fi

# --------------------------------------------------------------- install path
[ -n "$CTID" ] || CTID="$(pvesh get /cluster/nextid)"

if [ -z "$STORAGE" ]; then
  STORAGE="$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {print $1}' | grep -m1 -E '^(local-lvm|local-zfs)$' || true)"
  [ -n "$STORAGE" ] || STORAGE="$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')"
  [ -n "$STORAGE" ] || die "No storage that can hold container disks was found. Set STORAGE=<name>."
fi

# Ask for the API key up front so the rest can run unattended. Reads from the terminal
# because stdin may be the piped script.
API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$API_KEY" ] && [ -r /dev/tty ]; then
  printf '\nAnthropic API key for the AI Dungeon Master (input hidden, Enter to skip): ' > /dev/tty
  read -rs API_KEY < /dev/tty || true
  printf '\n' > /dev/tty
fi
[ -n "$API_KEY" ] || echo "No API key given. Hearthforge will use the scripted Dungeon Master until you add one to $APP_DIR/.env."

say "Finding the Debian 12 container template"
pveam update >/dev/null 2>&1 || true
TEMPLATE="$(pveam available --section system | awk '$2 ~ /^debian-12-standard/ {print $2}' | sort -V | tail -n1)"
[ -n "$TEMPLATE" ] || die "No debian-12-standard template is available from pveam."
if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  say "Downloading $TEMPLATE"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

NET="name=eth0,bridge=${BRIDGE},ip=${IP}"
[ -n "$GATEWAY" ] && NET="${NET},gw=${GATEWAY}"

say "Creating container $CTID ($HOSTNAME_CT) on $STORAGE: ${CORES} cores, ${MEMORY} MB RAM, ${DISK} GB disk"
pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOSTNAME_CT" \
  --ostype debian \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --cores "$CORES" --memory "$MEMORY" --swap "$SWAP" \
  --rootfs "${STORAGE}:${DISK}" \
  --net0 "$NET" \
  --onboot 1 \
  --description "Hearthforge: self-hosted D&D with an AI Dungeon Master. https://github.com/DBCooperX/hearthforge"
pct start "$CTID"
wait_for_network

say "Installing Docker and git inside the container"
in_ct "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq ca-certificates curl git nano >/dev/null && curl -fsSL https://get.docker.com | sh >/dev/null"

say "Cloning Hearthforge"
in_ct "git clone --branch '$BRANCH' '$REPO' $APP_DIR"

say "Writing $APP_DIR/.env"
in_ct "cd $APP_DIR && cp -n .env.example .env && chmod 600 .env"
# Pass the key on stdin so it never appears in a process list or shell history.
printf '%s' "$API_KEY" | pct exec "$CTID" -- bash -c "key=\$(cat); cd $APP_DIR && sed -i \"s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=\${key}|; s|^HEARTHFORGE_PORT=.*|HEARTHFORGE_PORT=${PORT}|\" .env"

compose_up
finish

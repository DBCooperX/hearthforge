#!/bin/sh
# Writes the Caddyfile from the settings in .env, then starts Caddy.
#   HEARTHFORGE_DOMAIN        a domain that points at this server: a free Let's Encrypt certificate
#   HEARTHFORGE_DNS_PROVIDER  with HEARTHFORGE_DNS_TOKEN: get it through a DNS record instead (LAN-only domains)
#   HEARTHFORGE_LOCAL_HOSTS   addresses (IPs or names) that get a certificate from Caddy's own local authority;
#                             each device trusts it once, from http://<address>/hearthforge-ca.crt
#   HEARTHFORGE_ACME_EMAIL    optional, for Let's Encrypt's expiry notices
set -eu

UPSTREAM="${HEARTHFORGE_UPSTREAM:-hearthforge:3000}"
DOMAIN="$(echo "${HEARTHFORGE_DOMAIN:-}" | tr -d ' ')"
LOCAL="$(echo "${HEARTHFORGE_LOCAL_HOSTS:-}" | tr ',' ' ')"
DNS="${HEARTHFORGE_DNS_PROVIDER:-}"
FILE="${HEARTHFORGE_CADDYFILE:-/etc/caddy/Caddyfile}"

if [ -z "$DOMAIN" ] && [ -z "$LOCAL" ]; then
  echo "hearthforge-caddy: neither HEARTHFORGE_DOMAIN nor HEARTHFORGE_LOCAL_HOSTS is set; serving https://localhost only." >&2
  LOCAL="localhost"
fi

sites() { # "a b" -> "https://a, https://b"
  out=""
  for h in $1; do out="${out:+$out, }$2$h"; done
  echo "$out"
}
first() { set -- $1; echo "${1:-}"; }

{
  echo "{"
  [ -n "${HEARTHFORGE_ACME_EMAIL:-}" ] && echo "  email ${HEARTHFORGE_ACME_EMAIL}"
  # Browsers send no name when they open an address like https://192.168.1.50, so Caddy needs to know which
  # certificate to show then.
  [ -n "$LOCAL" ] && echo "  default_sni $(first "$LOCAL")"
  echo "}"
  echo
  echo "(hearthforge) {"
  echo "  encode zstd gzip"
  echo "  reverse_proxy ${UPSTREAM}"
  echo "}"
  if [ -n "$DOMAIN" ]; then
    echo
    echo "${DOMAIN} {"
    if [ -n "$DNS" ]; then
      echo "  tls {"
      echo "    dns ${DNS} {env.HEARTHFORGE_DNS_TOKEN}"
      echo "  }"
    fi
    echo "  import hearthforge"
    echo "}"
  fi
  if [ -n "$LOCAL" ]; then
    echo
    echo "$(sites "$LOCAL" https://) {"
    echo "  tls internal"
    echo "  handle /hearthforge-ca.crt {"
    echo "    root * /data/caddy/pki/authorities/local"
    echo "    rewrite * /root.crt"
    echo "    header Content-Type application/x-x509-ca-cert"
    echo "    file_server"
    echo "  }"
    echo "  import hearthforge"
    echo "}"
    echo
    # Over plain http only the certificate is handed out, so a device can trust it before its first https visit.
    echo "$(sites "$LOCAL" http://) {"
    echo "  handle /hearthforge-ca.crt {"
    echo "    root * /data/caddy/pki/authorities/local"
    echo "    rewrite * /root.crt"
    echo "    header Content-Type application/x-x509-ca-cert"
    echo "    header Content-Disposition \"attachment; filename=hearthforge-ca.crt\""
    echo "    file_server"
    echo "  }"
    echo "  handle {"
    echo "    redir https://{host}{uri} 308"
    echo "  }"
    echo "}"
  fi
} > "$FILE"

echo "hearthforge-caddy: HTTPS for ${DOMAIN:+$DOMAIN }${LOCAL:+(local certificate) $LOCAL}" >&2
exec caddy run --config "$FILE" --adapter caddyfile

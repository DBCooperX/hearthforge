# HTTPS in front of Hearthforge. Browsers only allow the microphone (voice input) on https, and it keeps
# passwords off the network in plain text. Started only with COMPOSE_PROFILES=https; see "HTTPS" in the README.
#
# Plain Caddy gets certificates from Let's Encrypt over ports 80/443, or makes its own local ones. For a domain
# that is only reachable inside your network, Let's Encrypt has to check a DNS record instead, which needs a
# Caddy with your DNS provider's plugin built in: set HEARTHFORGE_DNS_PROVIDER (cloudflare, duckdns, hetzner,
# digitalocean), and this file builds one from github.com/caddy-dns/<provider>.
ARG CADDY_FLAVOUR=plain

FROM caddy:2.10-builder AS dns-build
ARG CADDY_DNS=
RUN xcaddy build --with "github.com/caddy-dns/${CADDY_DNS}"

FROM caddy:2.10 AS caddy-dns
COPY --from=dns-build /usr/bin/caddy /usr/bin/caddy

FROM caddy:2.10 AS caddy-plain

FROM caddy-${CADDY_FLAVOUR:-plain}
COPY entrypoint.sh /usr/local/bin/hearthforge-caddy
RUN chmod +x /usr/local/bin/hearthforge-caddy
ENTRYPOINT ["/usr/local/bin/hearthforge-caddy"]

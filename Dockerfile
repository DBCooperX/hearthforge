FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Piper, the narrator's voice on this server: a small speech program that runs on the CPU. Fetched from its own
# GitHub release while the image is built. Its voices are not part of the image: the server downloads the ones the
# Innkeeper picks from Piper's collection into the data volume. Build with --build-arg PIPER=off to leave it out.
FROM node:22-bookworm-slim AS piper
ARG PIPER=on
ARG PIPER_VERSION=2023.11.14-2
RUN mkdir -p /opt/piper && if [ "$PIPER" != "off" ]; then \
      arch="$(uname -m)"; \
      node -e "fetch(process.argv[1]).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()}).then(b=>require('fs').writeFileSync('/tmp/piper.tgz',Buffer.from(b)))" \
        "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_${arch}.tar.gz" \
      && tar xzf /tmp/piper.tgz -C /opt && rm /tmp/piper.tgz \
      || echo "Piper could not be fetched; the narrator can still use OpenAI or ElevenLabs."; \
    fi

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
# The server bundle is self-contained, so the runtime image needs no node_modules.
COPY --from=build /app/dist/server.js dist/server.js
COPY --from=build /app/client/dist client/dist
COPY --from=piper /opt/piper /opt/piper
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.js"]

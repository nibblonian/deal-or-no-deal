# ---- build stage: bundle client TS ----
FROM oven/bun:1.1 AS builder
WORKDIR /app

# copy minimal files first for cache
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# copy source
COPY public/ public/
COPY server.ts tsconfig.json* ./
COPY prizes.json ./prizes.json

# bundle client TS -> JS (esbuild via bunx)
RUN bunx --bun esbuild public/script.ts \
  --bundle \
  --outfile=public/script.js \
  --target=es2020 \
  --platform=browser \
  --sourcemap=inline \
  --sources-content
  
# ---- runtime ----
FROM oven/bun:1.1
WORKDIR /app

# copy built app
COPY --from=builder /app /app

# Prizes live on a mounted volume so the manager view can edit them and the
# changes survive restarts. The baked-in ./prizes.json is only the first-run
# seed (used until config/prizes.json exists).
RUN mkdir -p /app/config
VOLUME /app/config

# PRIZES_PATH is both the preferred file to load and where the manager view
# saves. ADMIN_TOKEN is intentionally empty here — set it at `docker run` to
# enable editing (no token => /admin can view but not save).
ENV PORT=3000 NODE_ENV=production TZ=America/Los_Angeles \
    PRIZES_PATH=/app/config/prizes.json \
    ADMIN_TOKEN=

EXPOSE 3000

CMD ["bun","run","server.ts"]
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

# default port
ENV PORT=3000 NODE_ENV=production TZ=America/Los_Angeles
EXPOSE 3000

# You can override prizes.json via a bind mount on QNAP
CMD ["bun","run","server.ts"]
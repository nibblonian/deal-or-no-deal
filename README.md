# Deal or No Deal 🎁

A self-hostable, "Deal or No Deal"–style party game where each case holds a
real prize with a dollar value. Pick a case to keep, eliminate the rest in
rounds, and take (or refuse) the Bank's offer to stop early.

Built for a kid's birthday, but it works for any prize giveaway — just edit the
prize list.

## How it plays

1. **Pick your case.** Click one case; it flies down into the *Your Case* tray
   and stays sealed until the very end.
2. **Eliminate cases in rounds.** Each round you open a set number of cases
   (6, then 5, then 4 … the requirement shrinks each round). Every opened case
   flips over to reveal its prize and value. The *Values in play* list in the
   top-right crosses off values as they leave the board — you see the amounts
   still live, never which gift is where.
3. **The Bank calls.** After each round you get an offer to stop now and collect
   roughly that value in prizes. **Deal** ends the game; **No Deal** keeps going.
4. **The finale.** If you never deal, you eventually open *your own* case for
   the reveal.

**Lucky bonus:** eliminate the lowest-value case still on the board and the
remaining cases dance while confetti rains down.

> The dollar offer is deliberately tuned to stay well below the top prizes, so
> "taking the deal" is a one-nice-item-plus-a-couple-small-ones budget, not a
> shopping spree. How you hand out the actual gifts is up to you off-screen.

## Configure the prizes

The board shows **one case per prize** you define, so the number of cases and
the round pacing adapt automatically to your list.

Prizes are loaded from the first of these that exists (highest priority first):

1. `$PRIZES_PATH` — an absolute path set via environment variable
2. `./config/prizes.json` — relative to the working directory
3. `./prizes.json` — the copy baked in next to the server (the default)

Format is a simple JSON array:

```json
[
  { "name": "Nintendo Switch", "value": 300 },
  { "name": "AirPods Pro", "value": 250 },
  { "name": "Bluetooth Speaker", "value": 60 }
]
```

Roughly 8–26 prizes works well. Check what's loaded at `GET /debug/prizes`.

## Run locally

Requires [Bun](https://bun.com).

```bash
bun install

# dev: rebuild the client on change + run the server
bun run dev

# or build the client once, then start the server
bun run build:client
bun run start
```

Then open <http://localhost:3000>.

> The browser runs the bundled `public/script.js`. If you edit
> `public/script.ts`, rebuild it with `bun run build:client` (or use `bun run
> dev`, which watches for you).

## Self-host with Docker

```bash
docker build -t deal-or-no-deal .
docker run -p 3000:3000 deal-or-no-deal

# override the prize list without rebuilding the image:
docker run -p 3000:3000 \
  -v /path/to/your/prizes.json:/app/config/prizes.json:ro \
  deal-or-no-deal
```

The server listens on port 3000 and exposes `GET /healthz` for health checks.

`deploy.sh` is a convenience script that rsyncs the project to a Raspberry Pi —
edit `PI_HOST`/`PI_PATH` at the top for your setup.

## Tuning

Both live in `public/script.ts` (rebuild the client after editing):

- **Bank offer** — see `computeOffer()`. The `factor` (≈40% of the average
  remaining value early, rising to ≈90% late) controls how generous the Bank is.
- **Celebration trigger** — see `isBottomQuarter()`. It fires when the
  eliminated case is in the bottom quarter (by value) of the cases still on the
  board; change the `/ 4` to widen (e.g. `/ 2` for bottom-half) or narrow it.
- **Reveal prominence** — `REVEAL_MS` controls how long an opened case stays
  popped/enlarged; the pop scale lives in `.case.revealing` in `style.css`.

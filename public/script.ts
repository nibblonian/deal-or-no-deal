export {};

/* ------------------------------------------------------------------ *
 * Deal or No Deal — self-hosted birthday edition
 *
 * Flow:
 *   1. Player picks ONE case to be "their case" (flies into the tray).
 *   2. Rounds of eliminating cases, with a diminishing number to open
 *      each round. Every opened case flips to reveal its prize.
 *   3. After each round the Bank makes an offer (~half of what's left).
 *      DEAL ends the game; NO DEAL keeps going.
 *   4. When only the player's case remains, they open it for the finale.
 *
 * Bonus: eliminating the LOWEST-value case still on the board is lucky,
 * so the remaining cases dance and confetti falls.
 * ------------------------------------------------------------------ */

interface Prize { name: string; value: number; }
interface Caze extends Prize { id: number; opened: boolean; isOwn: boolean; }

type Phase = "pickOwn" | "eliminating" | "offer" | "finalReveal" | "done";

const state = {
  cases: [] as Caze[],
  rounds: [] as number[], // how many to open in each round
  roundIndex: 0,          // which round we're on (0-based)
  remainingThisRound: 0,  // opens left in the current round
  phase: "pickOwn" as Phase,
};

let PRIZES: Prize[] = [];

// How long a freshly opened case stays "popped" and prominent before it
// shrinks back into the grid.
const REVEAL_MS = 1100;

/* ---------- tiny helpers ---------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const money = (n: number): string =>
  "$" + Math.round(n).toLocaleString("en-US");

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Build a diminishing elimination schedule that opens `toOpen` cases total.
 * e.g. 11 -> [4,3,2,1,1]   24 -> [6,5,4,3,2,1,1,1,1]
 * The player gets an offer after each round except the last.
 */
function buildRounds(toOpen: number): number[] {
  const rounds: number[] = [];
  let left = toOpen;
  let chunk = Math.max(1, Math.round(Math.sqrt(toOpen * 1.5)));
  while (left > 0) {
    const take = Math.min(chunk, left);
    rounds.push(take);
    left -= take;
    if (chunk > 1) chunk--;
  }
  return rounds;
}

/* ---------- setup ---------- */

async function loadPrizes(): Promise<void> {
  const res = await fetch("/api/prizes");
  PRIZES = (await res.json()) as Prize[];
}

function newGame(): void {
  hide($("offer-overlay"));
  hide($("result-overlay"));

  // One case per prize; shuffle so case numbers don't hint at value.
  state.cases = shuffle(PRIZES).map((p, i) => ({
    id: i + 1,
    name: p.name,
    value: p.value,
    opened: false,
    isOwn: false,
  }));
  state.rounds = [];
  state.roundIndex = 0;
  state.remainingThisRound = 0;
  state.phase = "pickOwn";

  // reset the tray
  const slot = $("own-slot");
  slot.className = "";
  slot.innerHTML = '<span class="own-placeholder">?</span>';

  buildBoard();
  renderTracker();
  setStatus("Pick a case to keep as YOUR case!", "");
}

/* ---------- rendering ---------- */

function caseMarkup(c: Caze): string {
  return `
    <div class="case-inner">
      <div class="case-face case-front"><span class="num">${c.id}</span></div>
      <div class="case-face case-back">
        <div class="prize-name">${c.name}</div>
        <div class="prize-val">${money(c.value)}</div>
      </div>
    </div>`;
}

function buildBoard(): void {
  const board = $("board");
  board.innerHTML = "";
  for (const c of state.cases) {
    const el = document.createElement("div");
    el.className = "case";
    el.dataset.id = String(c.id);
    el.innerHTML = caseMarkup(c);
    el.addEventListener("click", () => onCaseClick(c.id));
    board.appendChild(el);
  }
}

function boardEl(id: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#board .case[data-id="${id}"]`);
}

function renderTracker(): void {
  // Show every value still on the board (including the player's own,
  // which is why we never label which one is theirs). Struck when opened.
  const list = $("tracker-list");
  const entries = [...state.cases].sort((a, b) => b.value - a.value);
  list.innerHTML = entries
    .map((c) => `<li class="${c.opened ? "gone" : ""}">${money(c.value)}</li>`)
    .join("");
}

function setStatus(line: string, round: string): void {
  $("status-line").textContent = line;
  $("round-line").textContent = round;
}

function roundStatus(): void {
  const n = state.remainingThisRound;
  setStatus(
    n === 1 ? "Choose 1 case to open." : `Choose ${n} cases to open.`,
    `Round ${state.roundIndex + 1} of ${state.rounds.length}`,
  );
}

function hide(el: HTMLElement): void { el.classList.add("hidden"); }
function show(el: HTMLElement): void { el.classList.remove("hidden"); }

/* ---------- interaction ---------- */

function onCaseClick(id: number): void {
  const c = state.cases.find((x) => x.id === id);
  if (!c || c.opened || c.isOwn) return;

  if (state.phase === "pickOwn") pickOwn(c);
  else if (state.phase === "eliminating") eliminate(c);
}

function pickOwn(c: Caze): void {
  c.isOwn = true;
  const source = boardEl(c.id);
  const slot = $("own-slot");

  const finishPick = () => {
    // Put a face-down case into the tray.
    slot.className = "filled";
    slot.innerHTML = `<div class="case" data-own="1">${caseMarkup(c)}</div>`;
    const boardCase = boardEl(c.id);
    if (boardCase) boardCase.remove(); // it now lives in the tray only

    state.rounds = buildRounds(state.cases.length - 1);
    state.roundIndex = 0;
    state.remainingThisRound = state.rounds[0] ?? 0;

    // Tiny prize list: nothing to eliminate, go straight to the finale.
    if (state.rounds.length === 0) {
      startFinalReveal();
      return;
    }
    state.phase = "eliminating";
    roundStatus();
  };

  if (source) flyToTray(source, slot, finishPick);
  else finishPick();
}

/**
 * True if `target` sits in the bottom quarter (by value) of the cases still
 * eligible for elimination — losing one of those keeps the big prizes alive,
 * so it's a lucky pick worth celebrating.
 */
function isBottomQuarter(target: Caze): boolean {
  const vals = state.cases
    .filter((x) => !x.opened && !x.isOwn) // includes `target`, still unopened here
    .map((x) => x.value)
    .sort((a, b) => a - b);
  if (vals.length === 0) return false;
  const cutoffIdx = Math.max(0, Math.ceil(vals.length / 4) - 1);
  const threshold = vals[cutoffIdx]!;
  return target.value <= threshold; // <= so ties on the boundary also count
}

function eliminate(c: Caze): void {
  // Ignore clicks that land in the brief pause between a round ending and
  // the Bank calling (an eager player mashing cases shouldn't over-open).
  if (state.remainingThisRound <= 0) return;

  const lucky = isBottomQuarter(c);

  c.opened = true;
  const el = boardEl(c.id);
  if (el) {
    // Pop it big and glowing, then let it settle back into the grid.
    el.classList.add("opened", "disabled", "revealing");
    window.setTimeout(() => el.classList.remove("revealing"), REVEAL_MS);
  }
  renderTracker();
  state.remainingThisRound--;

  if (lucky) celebrate();

  if (state.remainingThisRound <= 0) {
    // Let the prominent reveal (and any celebration) play before the Bank calls.
    setStatus("…", `Round ${state.roundIndex + 1} of ${state.rounds.length}`);
    window.setTimeout(endRound, REVEAL_MS + 150);
  } else {
    roundStatus();
  }
}

function endRound(): void {
  state.roundIndex++;
  const othersLeft = state.cases.filter((c) => !c.opened && !c.isOwn).length;
  if (othersLeft === 0) startFinalReveal();
  else showOffer();
}

/* ---------- the Bank ---------- */

function computeOffer(): number {
  // Average value of everything still unopened (the player's case counts,
  // its value just isn't known). Scaled up as the game progresses so early
  // offers are tempting-but-low and later ones get serious. Tuned to stay
  // well under the top prizes — see factor below.
  const unopened = state.cases.filter((c) => !c.opened);
  const avg = unopened.reduce((s, c) => s + c.value, 0) / unopened.length;
  const progress = state.roundIndex / state.rounds.length; // 0..~1
  const factor = 0.4 + 0.5 * progress; // ~40% early → ~90% of the average late
  const raw = avg * factor;
  return Math.max(5, Math.round(raw / 5) * 5); // round to a tidy $5
}

function showOffer(): void {
  state.phase = "offer";
  const offer = computeOffer();
  $("offer-amount").textContent = money(offer);
  $("offer-amount").dataset.value = String(offer);
  show($("offer-overlay"));
}

function onDeal(): void {
  const offer = Number($("offer-amount").dataset.value || "0");
  state.phase = "done";
  hide($("offer-overlay"));
  revealAll();
  const own = state.cases.find((c) => c.isOwn)!;
  showResult(
    `DEAL! 🤝 ${money(offer)}`,
    `You stopped with an offer of <b>${money(offer)}</b>.<br/>` +
      `Your case actually held <b>${own.name}</b> (${money(own.value)}).`,
  );
}

function onNoDeal(): void {
  hide($("offer-overlay"));
  state.phase = "eliminating";
  state.remainingThisRound = state.rounds[state.roundIndex] ?? 1;
  roundStatus();
}

/* ---------- finale ---------- */

function startFinalReveal(): void {
  state.phase = "finalReveal";
  setStatus("This is it — open YOUR case!", "");
  const slot = $("own-slot");
  slot.classList.add("pickable");
  slot.onclick = revealOwn;
}

function revealOwn(): void {
  if (state.phase !== "finalReveal") return;
  state.phase = "done";
  const slot = $("own-slot");
  slot.classList.remove("pickable");
  slot.onclick = null;

  const own = state.cases.find((c) => c.isOwn)!;
  own.opened = true;
  const caseInTray = slot.querySelector<HTMLElement>(".case");
  if (caseInTray) caseInTray.classList.add("opened");
  renderTracker();

  window.setTimeout(() => {
    showResult(
      `🎉 You won ${own.name}!`,
      `Your case held <b>${own.name}</b>, worth <b>${money(own.value)}</b>.`,
    );
  }, 650);
}

function revealAll(): void {
  // Flip open every remaining case (including the player's) so nothing's a mystery.
  for (const c of state.cases) {
    if (c.opened) continue;
    c.opened = true;
    if (c.isOwn) {
      const caseInTray = $("own-slot").querySelector<HTMLElement>(".case");
      if (caseInTray) caseInTray.classList.add("opened");
    } else {
      boardEl(c.id)?.classList.add("opened", "disabled");
    }
  }
  renderTracker();
}

function showResult(headline: string, detailHtml: string): void {
  $("result-headline").textContent = headline;
  $("result-detail").innerHTML = detailHtml;
  show($("result-overlay"));
}

/* ---------- celebration ---------- */

function celebrate(): void {
  dropConfetti();
  const dancers = document.querySelectorAll<HTMLElement>(
    "#board .case:not(.opened)",
  );
  dancers.forEach((d) => {
    d.classList.remove("dancing");
    // force reflow so the animation restarts if triggered twice
    void d.offsetWidth;
    d.classList.add("dancing");
    window.setTimeout(() => d.classList.remove("dancing"), 1600);
  });
}

function dropConfetti(): void {
  const layer = $("confetti-layer");
  const colors = ["#f6c945", "#35d07f", "#ff6b6b", "#4d8bff", "#c86bff", "#fff"];
  const count = 90;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("div");
    bit.className = "confetti";
    bit.style.left = Math.random() * 100 + "vw";
    bit.style.background = colors[i % colors.length]!;
    bit.style.animationDuration = 2 + Math.random() * 1.8 + "s";
    bit.style.animationDelay = Math.random() * 0.4 + "s";
    bit.style.transform = `translateY(-10px) rotate(${Math.random() * 360}deg)`;
    if (Math.random() < 0.5) bit.style.borderRadius = "50%";
    layer.appendChild(bit);
    window.setTimeout(() => bit.remove(), 4200);
  }
}

/* ---------- the pick-your-case fly animation ---------- */

function flyToTray(source: HTMLElement, target: HTMLElement, done: () => void): void {
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();

  const clone = document.createElement("div");
  clone.className = "fly-clone";
  clone.textContent = source.querySelector(".num")?.textContent ?? "?";
  clone.style.width = from.width + "px";
  clone.style.height = from.height + "px";
  clone.style.left = from.left + "px";
  clone.style.top = from.top + "px";
  document.body.appendChild(clone);

  source.style.visibility = "hidden";

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  requestAnimationFrame(() => {
    clone.style.transform = `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`;
  });

  window.setTimeout(() => {
    clone.remove();
    done();
  }, 560);
}

/* ---------- wiring ---------- */

async function start(): Promise<void> {
  await loadPrizes();
  $("reset").addEventListener("click", newGame);
  $("deal-btn").addEventListener("click", onDeal);
  $("nodeal-btn").addEventListener("click", onNoDeal);
  $("result-again").addEventListener("click", newGame);
  newGame();
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", start);
}

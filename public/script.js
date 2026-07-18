// public/script.ts
var state = {
  cases: [],
  rounds: [],
  roundIndex: 0,
  remainingThisRound: 0,
  phase: "pickOwn"
};
var PRIZES = [];
var REVEAL_MS = 1100;
var $ = (id) => document.getElementById(id);
var money = (n) => "$" + Math.round(n).toLocaleString("en-US");
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1;i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function buildRounds(toOpen) {
  const rounds = [];
  let left = toOpen;
  let chunk = Math.max(1, Math.round(Math.sqrt(toOpen * 1.5)));
  while (left > 0) {
    const take = Math.min(chunk, left);
    rounds.push(take);
    left -= take;
    if (chunk > 1)
      chunk--;
  }
  return rounds;
}
async function loadPrizes() {
  const res = await fetch("/api/prizes");
  PRIZES = await res.json();
}
function newGame() {
  hide($("offer-overlay"));
  hide($("result-overlay"));
  state.cases = shuffle(PRIZES).map((p, i) => ({
    id: i + 1,
    name: p.name,
    value: p.value,
    opened: false,
    isOwn: false
  }));
  state.rounds = [];
  state.roundIndex = 0;
  state.remainingThisRound = 0;
  state.phase = "pickOwn";
  const slot = $("own-slot");
  slot.className = "";
  slot.innerHTML = '<span class="own-placeholder">?</span>';
  buildBoard();
  renderTracker();
  setStatus("Pick a case to keep as YOUR case!", "");
}
function caseMarkup(c) {
  return `
    <div class="case-inner">
      <div class="case-face case-front"><span class="num">${c.id}</span></div>
      <div class="case-face case-back">
        <div class="prize-name">${c.name}</div>
        <div class="prize-val">${money(c.value)}</div>
      </div>
    </div>`;
}
function buildBoard() {
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
function boardEl(id) {
  return document.querySelector(`#board .case[data-id="${id}"]`);
}
function renderTracker() {
  const list = $("tracker-list");
  const entries = [...state.cases].sort((a, b) => b.value - a.value);
  list.innerHTML = entries.map((c) => `<li class="${c.opened ? "gone" : ""}">${money(c.value)}</li>`).join("");
}
function setStatus(line, round) {
  $("status-line").textContent = line;
  $("round-line").textContent = round;
}
function roundStatus() {
  const n = state.remainingThisRound;
  setStatus(n === 1 ? "Choose 1 case to open." : `Choose ${n} cases to open.`, `Round ${state.roundIndex + 1} of ${state.rounds.length}`);
}
function hide(el) {
  el.classList.add("hidden");
}
function show(el) {
  el.classList.remove("hidden");
}
function onCaseClick(id) {
  const c = state.cases.find((x) => x.id === id);
  if (!c || c.opened || c.isOwn)
    return;
  if (state.phase === "pickOwn")
    pickOwn(c);
  else if (state.phase === "eliminating")
    eliminate(c);
}
function pickOwn(c) {
  c.isOwn = true;
  const source = boardEl(c.id);
  const slot = $("own-slot");
  const finishPick = () => {
    slot.className = "filled";
    slot.innerHTML = `<div class="case" data-own="1">${caseMarkup(c)}</div>`;
    const boardCase = boardEl(c.id);
    if (boardCase)
      boardCase.remove();
    state.rounds = buildRounds(state.cases.length - 1);
    state.roundIndex = 0;
    state.remainingThisRound = state.rounds[0] ?? 0;
    if (state.rounds.length === 0) {
      startFinalReveal();
      return;
    }
    state.phase = "eliminating";
    roundStatus();
  };
  if (source)
    flyToTray(source, slot, finishPick);
  else
    finishPick();
}
function isBottomQuarter(target) {
  const vals = state.cases.filter((x) => !x.opened && !x.isOwn).map((x) => x.value).sort((a, b) => a - b);
  if (vals.length === 0)
    return false;
  const cutoffIdx = Math.max(0, Math.ceil(vals.length / 4) - 1);
  const threshold = vals[cutoffIdx];
  return target.value <= threshold;
}
function eliminate(c) {
  if (state.remainingThisRound <= 0)
    return;
  const lucky = isBottomQuarter(c);
  c.opened = true;
  const el = boardEl(c.id);
  if (el) {
    el.classList.add("opened", "disabled", "revealing");
    window.setTimeout(() => el.classList.remove("revealing"), REVEAL_MS);
  }
  renderTracker();
  state.remainingThisRound--;
  if (lucky)
    celebrate();
  if (state.remainingThisRound <= 0) {
    setStatus("…", `Round ${state.roundIndex + 1} of ${state.rounds.length}`);
    window.setTimeout(endRound, REVEAL_MS + 150);
  } else {
    roundStatus();
  }
}
function endRound() {
  state.roundIndex++;
  const othersLeft = state.cases.filter((c) => !c.opened && !c.isOwn).length;
  if (othersLeft === 0)
    startFinalReveal();
  else
    showOffer();
}
function computeOffer() {
  const unopened = state.cases.filter((c) => !c.opened);
  const avg = unopened.reduce((s, c) => s + c.value, 0) / unopened.length;
  const progress = state.roundIndex / state.rounds.length;
  const factor = 0.4 + 0.5 * progress;
  const raw = avg * factor;
  return Math.max(5, Math.round(raw / 5) * 5);
}
function showOffer() {
  state.phase = "offer";
  const offer = computeOffer();
  $("offer-amount").textContent = money(offer);
  $("offer-amount").dataset.value = String(offer);
  show($("offer-overlay"));
}
function onDeal() {
  const offer = Number($("offer-amount").dataset.value || "0");
  state.phase = "done";
  hide($("offer-overlay"));
  revealAll();
  const own = state.cases.find((c) => c.isOwn);
  showResult(`DEAL! \uD83E\uDD1D ${money(offer)}`, `You stopped with an offer of <b>${money(offer)}</b>.<br/>` + `Your case actually held <b>${own.name}</b> (${money(own.value)}).`);
}
function onNoDeal() {
  hide($("offer-overlay"));
  state.phase = "eliminating";
  state.remainingThisRound = state.rounds[state.roundIndex] ?? 1;
  roundStatus();
}
function startFinalReveal() {
  state.phase = "finalReveal";
  setStatus("This is it — open YOUR case!", "");
  const slot = $("own-slot");
  slot.classList.add("pickable");
  slot.onclick = revealOwn;
}
function revealOwn() {
  if (state.phase !== "finalReveal")
    return;
  state.phase = "done";
  const slot = $("own-slot");
  slot.classList.remove("pickable");
  slot.onclick = null;
  const own = state.cases.find((c) => c.isOwn);
  own.opened = true;
  const caseInTray = slot.querySelector(".case");
  if (caseInTray)
    caseInTray.classList.add("opened");
  renderTracker();
  window.setTimeout(() => {
    showResult(`\uD83C\uDF89 You won ${own.name}!`, `Your case held <b>${own.name}</b>, worth <b>${money(own.value)}</b>.`);
  }, 650);
}
function revealAll() {
  for (const c of state.cases) {
    if (c.opened)
      continue;
    c.opened = true;
    if (c.isOwn) {
      const caseInTray = $("own-slot").querySelector(".case");
      if (caseInTray)
        caseInTray.classList.add("opened");
    } else {
      boardEl(c.id)?.classList.add("opened", "disabled");
    }
  }
  renderTracker();
}
function showResult(headline, detailHtml) {
  $("result-headline").textContent = headline;
  $("result-detail").innerHTML = detailHtml;
  show($("result-overlay"));
}
function celebrate() {
  dropConfetti();
  const dancers = document.querySelectorAll("#board .case:not(.opened)");
  dancers.forEach((d) => {
    d.classList.remove("dancing");
    d.offsetWidth;
    d.classList.add("dancing");
    window.setTimeout(() => d.classList.remove("dancing"), 1600);
  });
}
function dropConfetti() {
  const layer = $("confetti-layer");
  const colors = ["#f6c945", "#35d07f", "#ff6b6b", "#4d8bff", "#c86bff", "#fff"];
  const count = 90;
  for (let i = 0;i < count; i++) {
    const bit = document.createElement("div");
    bit.className = "confetti";
    bit.style.left = Math.random() * 100 + "vw";
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = 2 + Math.random() * 1.8 + "s";
    bit.style.animationDelay = Math.random() * 0.4 + "s";
    bit.style.transform = `translateY(-10px) rotate(${Math.random() * 360}deg)`;
    if (Math.random() < 0.5)
      bit.style.borderRadius = "50%";
    layer.appendChild(bit);
    window.setTimeout(() => bit.remove(), 4200);
  }
}
function flyToTray(source, target, done) {
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
async function start() {
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

// public/script.ts
var tiles = [];
var mainCase = null;
var compareCases = [];
var phase = "selectMain";
var discardPile = [];
async function loadPrizes() {
  const res = await fetch("/api/prizes");
  PRIZES = await res.json();
}
var PRIZES = [];
var shuffle = (arr) => {
  const a = [...arr];
  return a.sort(() => Math.random() - 0.5);
};
function initGame() {
  mainCase = null;
  compareCases = [];
  phase = "selectMain";
  discardPile = [];
  tiles = shuffle(PRIZES).slice(0, 26).map((p, i) => ({
    id: i + 1,
    name: p.name,
    value: p.value,
    opened: false
  }));
  render();
  renderHeld();
  renderDiscard();
}
function render() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  tiles.forEach((tile) => {
    if (tile.opened)
      return;
    if (mainCase && tile.id === mainCase.id)
      return;
    if (compareCases.find((c) => c.id === tile.id))
      return;
    if (discardPile.find((d) => d.id === tile.id))
      return;
    const btn = document.createElement("div");
    btn.className = "tile" + (tile.opened ? " opened" : "");
    btn.textContent = tile.opened ? `${tile.name} ($${tile.value})` : String(tile.id);
    btn.onclick = (e) => onTileClick(tile.id, e.currentTarget);
    board.appendChild(btn);
  });
  const info = document.getElementById("info");
  if (phase === "selectMain") {
    info.textContent = "Pick your main case!";
  } else if (phase === "selectComp1") {
    info.textContent = `Main case selected (#${mainCase?.id}). Pick first comparison case.`;
  } else if (phase === "selectComp2") {
    info.textContent = `First comparison case selected (#${compareCases[0]?.id}). Pick second comparison case.`;
  } else if (phase === "chooseDiscard") {
    info.textContent = `Compare ${compareCases[0]?.name || ""} vs ${compareCases[1]?.name || ""}. Click one to discard.`;
  }
}
function renderDiscard() {
  const discDiv = document.getElementById("discard");
  if (!discDiv)
    return;
  discDiv.innerHTML = "";
  discardPile.forEach((tile) => {
    const div = document.createElement("div");
    div.className = "discard-tile";
    div.textContent = `${tile.name} ($${tile.value})`;
    discDiv.appendChild(div);
  });
}
function renderHeld() {
  const mainCaseDiv = document.getElementById("main-case");
  if (mainCaseDiv && mainCase) {
    mainCaseDiv.innerHTML = "";
    const div = document.createElement("div");
    div.className = "held-tile";
    div.textContent = String(mainCase.id);
    mainCaseDiv.appendChild(div);
  }
  const heldDiv = document.getElementById("held");
  if (!heldDiv)
    return;
  heldDiv.innerHTML = "";
  compareCases.forEach((tile, idx) => {
    const div = document.createElement("div");
    div.className = "held-tile";
    div.textContent = `${tile.name} ($${tile.value})`;
    if (phase === "chooseDiscard") {
      div.addEventListener("click", () => {
        discardPile.push(tile);
        compareCases.splice(idx, 1);
        phase = "selectComp2";
        document.getElementById("info").textContent = `Discarded ${tile.name} ($${tile.value}). Pick next comparison case.`;
        render();
        renderHeld();
        renderDiscard();
      });
    }
    heldDiv.appendChild(div);
  });
}
function animateTile(elem, tile, targetId) {
  const start = elem.getBoundingClientRect();
  const targetArea = document.getElementById(targetId);
  if (!targetArea)
    return;
  const clone = elem.cloneNode(true);
  clone.classList.add("animating");
  clone.style.width = `${start.width}px`;
  clone.style.height = `${start.height}px`;
  clone.style.top = `${start.top}px`;
  clone.style.left = `${start.left}px`;
  document.body.appendChild(clone);
  elem.style.visibility = "hidden";
  const target = targetArea.getBoundingClientRect();
  requestAnimationFrame(() => {
    clone.style.transform = `translate(
      ${target.left - start.left + (target.width / 2 - start.width / 2)}px,
      ${target.top - start.top + (target.height / 2 - start.height / 2)}px
    )`;
  });
  setTimeout(() => {
    clone.remove();
    elem.style.visibility = "visible";
    render();
    renderHeld();
  }, 300);
}
function onTileClick(id, elem) {
  const tile = tiles.find((t) => t.id === id);
  if (!tile || tile.opened || !elem)
    return;
  if (phase === "selectMain") {
    mainCase = tile;
    phase = "selectComp1";
    animateTile(elem, tile, "main-case");
  } else if (phase === "selectComp1") {
    tile.opened = true;
    compareCases.push(tile);
    phase = "selectComp2";
    animateTile(elem, tile, "held");
    document.getElementById("info").textContent = `First comparison case selected (#${tile.id}). Pick second comparison case.`;
  } else if (phase === "selectComp2") {
    tile.opened = true;
    compareCases.push(tile);
    phase = "chooseDiscard";
    animateTile(elem, tile, "held");
    document.getElementById("info").textContent = `Compare ${compareCases[0]?.name || ""} vs ${compareCases[1]?.name || ""}. Click one to discard.`;
  }
  render();
  renderHeld();
  renderDiscard();
}
document.getElementById("reset").addEventListener("click", initGame);
console.log("Client script loaded");
async function start() {
  console.log("Starting game initialization");
  await loadPrizes();
  console.log("Prizes loaded:", PRIZES);
  tiles = shuffle(PRIZES).slice(0, 26).map((p, i) => ({ id: i + 1, name: p.name, value: p.value, opened: false }));
  initGame();
  const resetBtn = document.getElementById("reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      console.log("Reset clicked");
      initGame();
    });
  } else {
    console.warn("Reset button not found");
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", start);
}

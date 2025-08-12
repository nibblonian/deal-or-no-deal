export {};

interface Prize { name: string; value: number }
interface Tile extends Prize { id: number; opened: boolean }

let tiles: Tile[] = [];
let mainCase: Tile | null = null;
let compareCases: Tile[] = [];
let phase: 'selectMain' | 'selectComp1' | 'selectComp2' | 'chooseDiscard' = 'selectMain';
let discardPile: Tile[] = [];

// fetch prize configuration
async function loadPrizes(): Promise<any> {
  const res = await fetch("/api/prizes");
  PRIZES = await res.json();
}

let PRIZES: Prize[] = [];

// Shuffle helper: Generic arrow to avoid JSX parsing issues
const shuffle = <T,>(arr: T[]): T[] => {
  // copy before shuffle to avoid mutating original
  const a = [...arr];
  return a.sort(() => Math.random() - 0.5);
};

function initGame(): void {
  // Reset state
  mainCase = null;
  compareCases = [];
  phase = 'selectMain';
  discardPile = [];

  // Build a fresh board of 26 cases
  tiles = shuffle(PRIZES)
    .slice(0, 26)
    .map((p, i) => ({
      id: i + 1,
      name: p.name,
      value: p.value,
      opened: false
    }));

  // Render everything
  render();
  renderHeld();
  renderDiscard();
}
function render(): void {
  const board = document.getElementById("board")!;
  board.innerHTML = "";
  tiles.forEach(tile => {
    if (tile.opened) return;
    if (mainCase && tile.id === mainCase.id) return;
    if (compareCases.find(c => c.id === tile.id)) return;
    if (discardPile.find(d => d.id === tile.id)) return;

    const btn = document.createElement("div");
    btn.className = "tile" + (tile.opened ? " opened" : "");
    btn.textContent = tile.opened
      ? `${ tile.name } ($${ tile.value })`
      : String(tile.id);
    btn.onclick = (e) => onTileClick(tile.id, e.currentTarget as HTMLElement);
    board.appendChild(btn);
  });
  const info = document.getElementById("info")!;
  if (phase === 'selectMain') {
    info.textContent = 'Pick your main case!';
  } else if (phase === 'selectComp1') {
    info.textContent = `Main case selected (#${mainCase?.id}). Pick first comparison case.`;
  } else if (phase === 'selectComp2') {
    info.textContent = `First comparison case selected (#${compareCases[0]?.id}). Pick second comparison case.`;
  } else if (phase === 'chooseDiscard') {
    info.textContent = `Compare ${compareCases[0]?.name || ''} vs ${compareCases[1]?.name || ''}. Click one to discard.`;
  }
}

// Renders the discarded pile
function renderDiscard(): void {
  const discDiv = document.getElementById("discard");
  if (!discDiv) return;
  // Append recently discarded tiles
  discDiv.innerHTML = "";
  discardPile.forEach(tile => {
    const div = document.createElement("div");
    div.className = "discard-tile";
    div.textContent = `${tile.name} ($${tile.value})`;
    discDiv.appendChild(div);
  });
}

/**
 * Renders the currently held cases into the #held container.
 */
function renderHeld(): void {
  // Render main case
  const mainCaseDiv = document.getElementById("main-case");
  if (mainCaseDiv && mainCase) {
    mainCaseDiv.innerHTML = "";
    const div = document.createElement("div");
    div.className = "held-tile";
    div.textContent = String(mainCase.id);
    mainCaseDiv.appendChild(div);
  }

  // Render comparison cases
  const heldDiv = document.getElementById("held");
  if (!heldDiv) return;
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
        document.getElementById("info")!.textContent =
          `Discarded ${tile.name} ($${tile.value}). Pick next comparison case.`;
        render();
        renderHeld();
        renderDiscard();
      });
    }
    heldDiv.appendChild(div);
  });
}

function animateTile(elem: HTMLElement, tile: Tile, targetId: string): void {
  const start = elem.getBoundingClientRect();
  const targetArea = document.getElementById(targetId);
  if (!targetArea) return;

  const clone = elem.cloneNode(true) as HTMLElement;
  clone.classList.add('animating');
  clone.style.width = `${start.width}px`;
  clone.style.height = `${start.height}px`;
  clone.style.top = `${start.top}px`;
  clone.style.left = `${start.left}px`;
  document.body.appendChild(clone);

  elem.style.visibility = 'hidden';
  
  const target = targetArea.getBoundingClientRect();
  requestAnimationFrame(() => {
    clone.style.transform = `translate(
      ${target.left - start.left + (target.width/2 - start.width/2)}px,
      ${target.top - start.top + (target.height/2 - start.height/2)}px
    )`;
  });

  setTimeout(() => {
    clone.remove();
    elem.style.visibility = 'visible';
    render();
    renderHeld();
  }, 300);
}

function onTileClick(id: number, elem?: HTMLElement): void {
  const tile = tiles.find(t => t.id === id);
  if (!tile || tile.opened || !elem) return;

  if (phase === 'selectMain') {
    mainCase = tile;
    phase = 'selectComp1';
    animateTile(elem, tile, 'main-case');
  }
  else if (phase === 'selectComp1') {
    tile.opened = true;
    compareCases.push(tile);
    phase = 'selectComp2';
    animateTile(elem, tile, 'held');
    document.getElementById('info')!.textContent =
      `First comparison case selected (#${tile.id}). Pick second comparison case.`;
  }
  else if (phase === 'selectComp2') {
    tile.opened = true;
    compareCases.push(tile);
    phase = 'chooseDiscard';
    animateTile(elem, tile, 'held');
    document.getElementById('info')!.textContent =
      `Compare ${compareCases[0]?.name || ''} vs ${compareCases[1]?.name || ''}. Click one to discard.`;
  }
  // do nothing on chooseDiscard phase for tile clicks here

  render();
  renderHeld();
  renderDiscard();
}


document.getElementById("reset")!.addEventListener("click", initGame);

// Confirm script is loaded
console.log('Client script loaded');

async function start() {
  console.log('Starting game initialization');
  await loadPrizes();
  console.log('Prizes loaded:', PRIZES);
  tiles = shuffle(PRIZES)
    .slice(0, 26)
    .map((p, i) => ({ id: i + 1, name: p.name, value: p.value, opened: false }));
  initGame();
  // Wire up reset button after DOM exists
  const resetBtn = document.getElementById('reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      console.log('Reset clicked');
      initGame();
    });
  } else {
    console.warn('Reset button not found');
  }
}

// Kick off once DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', start);
}
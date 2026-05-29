'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 20;
const CELL = 30;           // pixels per cell on the board canvas
const PREVIEW_CELL = 24;   // pixels per cell in side panels

// Tetromino shapes (4 rotations each, stored as [row][col] offsets from pivot)
const PIECES = {
  I: {
    color: '#00e5ff',
    glow:  '#00e5ff',
    shapes: [
      [[0,0],[0,1],[0,2],[0,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,1],[1,1],[2,1],[3,1]],
    ],
    spawnOffset: [-1, 3],
  },
  O: {
    color: '#ffd600',
    glow:  '#ffd600',
    shapes: [
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
    ],
    spawnOffset: [0, 4],
  },
  T: {
    color: '#e040fb',
    glow:  '#e040fb',
    shapes: [
      [[0,1],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[1,2],[2,1]],
      [[0,1],[1,0],[1,1],[2,1]],
    ],
    spawnOffset: [0, 3],
  },
  S: {
    color: '#69f0ae',
    glow:  '#69f0ae',
    shapes: [
      [[0,1],[0,2],[1,0],[1,1]],
      [[0,1],[1,1],[1,2],[2,2]],
      [[1,1],[1,2],[2,0],[2,1]],
      [[0,0],[1,0],[1,1],[2,1]],
    ],
    spawnOffset: [0, 3],
  },
  Z: {
    color: '#ff5252',
    glow:  '#ff5252',
    shapes: [
      [[0,0],[0,1],[1,1],[1,2]],
      [[0,2],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[2,1],[2,2]],
      [[0,1],[1,0],[1,1],[2,0]],
    ],
    spawnOffset: [0, 3],
  },
  J: {
    color: '#448aff',
    glow:  '#448aff',
    shapes: [
      [[0,0],[1,0],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[2,1]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,0],[2,1]],
    ],
    spawnOffset: [0, 3],
  },
  L: {
    color: '#ff9100',
    glow:  '#ff9100',
    shapes: [
      [[0,2],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[2,1],[2,2]],
      [[1,0],[1,1],[1,2],[2,0]],
      [[0,0],[0,1],[1,1],[2,1]],
    ],
    spawnOffset: [0, 3],
  },
};

const PIECE_KEYS = Object.keys(PIECES);

// Super Rotation System wall-kick data (J, L, S, T, Z)
const KICKS_JLSTZ = [
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], // 0→1
  [[0,0],[1,0],[1,-1],[0,2],[1,2]],      // 1→2
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]],     // 2→3
  [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  // 3→0
];

// SRS wall-kick data for I piece
const KICKS_I = [
  [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],   // 0→1
  [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   // 1→2
  [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   // 2→3
  [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   // 3→0
];

// Scoring table [lines cleared - 1] × level
const LINE_SCORE = [100, 300, 500, 800];

// Lock delay and other timing (ms)
const LOCK_DELAY = 500;
const LOCK_MOVES_MAX = 15;

// Drop speed per level (ms per row)
function dropInterval(level) {
  // Standard Tetris speed curve (approx Guideline)
  const t = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  return Math.max(50, Math.round(t * 1000));
}

// ── State ────────────────────────────────────────────────────────────────────

let board;         // 2D array [row][col] → color string or null
let bag;           // randomizer bag
let current;       // { type, rot, row, col }
let next3;         // array of up to 3 upcoming piece types
let held;          // piece type or null
let canHold;       // bool
let score, level, lines;
let gameRunning, paused, gameOver;
let lockTimer, lockMoves;
let lastTime;
let dropAccum;
let rafId;
let animatingLines; // rows being cleared (for flash animation)
let animFrame;

// ── Canvas setup ─────────────────────────────────────────────────────────────

const boardCanvas  = document.getElementById('board-canvas');
const holdCanvas   = document.getElementById('hold-canvas');
const nextCanvas   = document.getElementById('next-canvas');
const bctx  = boardCanvas.getContext('2d');
const hctx  = holdCanvas.getContext('2d');
const nctx  = nextCanvas.getContext('2d');

// Resize canvases to match constants
boardCanvas.width  = COLS * CELL;
boardCanvas.height = ROWS * CELL;
holdCanvas.width   = 5 * PREVIEW_CELL;
holdCanvas.height  = 5 * PREVIEW_CELL;
nextCanvas.width   = 5 * PREVIEW_CELL;
nextCanvas.height  = 15 * PREVIEW_CELL;

// ── Bag randomizer ────────────────────────────────────────────────────────────

function fillBag() {
  const b = [...PIECE_KEYS];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function nextFromBag() {
  if (bag.length === 0) bag = fillBag();
  return bag.pop();
}

function refillNext3() {
  while (next3.length < 3) next3.push(nextFromBag());
}

// ── Piece helpers ─────────────────────────────────────────────────────────────

function cells(type, rot, row, col) {
  return PIECES[type].shapes[rot].map(([dr, dc]) => [row + dr, col + dc]);
}

function isValid(type, rot, row, col) {
  for (const [r, c] of cells(type, rot, row, col)) {
    if (r >= ROWS || c < 0 || c >= COLS) return false;
    if (r >= 0 && board[r][c]) return false;
  }
  return true;
}

function spawnPiece(type) {
  const [dr, dc] = PIECES[type].spawnOffset;
  const rot = 0;
  const r = dr, c = dc;
  if (!isValid(type, rot, r, c)) {
    triggerGameOver();
    return false;
  }
  current = { type, rot, row: r, col: c };
  lockTimer = null;
  lockMoves = 0;
  return true;
}

// ── Rotation ──────────────────────────────────────────────────────────────────

function rotate(dir) {
  if (!current) return;
  const { type, rot, row, col } = current;
  const newRot = (rot + (dir > 0 ? 1 : 3)) % 4;
  const kicks = type === 'I' ? KICKS_I : KICKS_JLSTZ;
  const kickSet = dir > 0
    ? kicks[rot]
    : kicks[newRot].map(([kr, kc]) => [-kr, -kc]);

  for (const [kr, kc] of kickSet) {
    const nr = row + kr, nc = col + kc;
    if (isValid(type, newRot, nr, nc)) {
      current = { type, rot: newRot, row: nr, col: nc };
      onPieceMove();
      return true;
    }
  }
  return false;
}

// ── Movement ──────────────────────────────────────────────────────────────────

function moveH(dir) {
  if (!current) return;
  const { type, rot, row, col } = current;
  if (isValid(type, rot, row, col + dir)) {
    current.col += dir;
    onPieceMove();
  }
}

function softDrop() {
  if (!current) return;
  const { type, rot, row, col } = current;
  if (isValid(type, rot, row + 1, col)) {
    current.row++;
    dropAccum = 0;
    score += 1; // soft drop bonus
    updateScoreDisplay();
    onPieceMove();
    return true;
  }
  return false;
}

function hardDrop() {
  if (!current) return;
  let dropped = 0;
  while (softDrop()) dropped++;
  score += dropped; // already added 1 per row above; add the extra
  lockPiece();
}

function ghostRow() {
  if (!current) return current.row;
  const { type, rot, row, col } = current;
  let r = row;
  while (isValid(type, rot, r + 1, col)) r++;
  return r;
}

// ── Lock / clear ──────────────────────────────────────────────────────────────

function onPieceMove() {
  // reset lock delay when piece moves or rotates on the floor
  const { type, rot, row, col } = current;
  if (!isValid(type, rot, row + 1, col)) {
    // on ground
    if (lockMoves < LOCK_MOVES_MAX) {
      lockTimer = performance.now() + LOCK_DELAY;
      lockMoves++;
    }
  } else {
    lockTimer = null;
  }
}

function lockPiece() {
  if (!current) return;
  const { type, rot, row, col } = current;
  for (const [r, c] of cells(type, rot, row, col)) {
    if (r < 0) { triggerGameOver(); return; }
    board[r][c] = PIECES[type].color;
  }
  current = null;
  lockTimer = null;

  const cleared = clearLines();
  if (cleared > 0) {
    score += LINE_SCORE[cleared - 1] * level;
    lines += cleared;
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel > level) level = newLevel;
    updateScoreDisplay();
  }

  canHold = true;
  spawnNext();
}

function clearLines() {
  const full = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(c => c !== null)) full.push(r);
  }
  if (full.length === 0) return 0;

  // Flash animation
  animatingLines = full;
  animFrame = 0;

  // Remove rows after short delay (handled in render loop)
  setTimeout(() => {
    for (const r of [...full].reverse()) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(null));
    }
    animatingLines = [];
  }, 180);

  return full.length;
}

// ── Hold ──────────────────────────────────────────────────────────────────────

function holdPiece() {
  if (!canHold || !current) return;
  const type = current.type;
  if (held) {
    current = null;
    spawnPiece(held);
  } else {
    current = null;
    spawnNext();
  }
  held = type;
  canHold = false;
  drawHold();
}

function spawnNext() {
  refillNext3();
  const type = next3.shift();
  refillNext3();
  spawnPiece(type);
  drawNext();
}

// ── Game flow ─────────────────────────────────────────────────────────────────

function initGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bag = fillBag();
  next3 = [];
  held = null;
  canHold = true;
  score = 0;
  level = 1;
  lines = 0;
  gameOver = false;
  paused = false;
  animatingLines = [];
  dropAccum = 0;
  lockTimer = null;
  lockMoves = 0;
  lastTime = null;

  updateScoreDisplay();
  refillNext3();
  spawnNext();
}

function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  initGame();
  gameRunning = true;
  rafId = requestAnimationFrame(loop);
}

function triggerGameOver() {
  gameRunning = false;
  gameOver = true;
  cancelAnimationFrame(rafId);
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-level').textContent = level;
  document.getElementById('final-lines').textContent = lines;
  document.getElementById('gameover-screen').classList.remove('hidden');
}

function restartGame() {
  document.getElementById('gameover-screen').classList.add('hidden');
  initGame();
  gameRunning = true;
  lastTime = null;
  rafId = requestAnimationFrame(loop);
}

function togglePause() {
  if (gameOver || !gameRunning) return;
  paused = !paused;
  if (paused) {
    document.getElementById('pause-screen').classList.remove('hidden');
    cancelAnimationFrame(rafId);
  } else {
    document.getElementById('pause-screen').classList.add('hidden');
    lastTime = null;
    rafId = requestAnimationFrame(loop);
  }
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function loop(ts) {
  if (!gameRunning || paused) return;

  if (lastTime === null) lastTime = ts;
  const dt = ts - lastTime;
  lastTime = ts;

  // Gravity
  dropAccum += dt;
  const interval = dropInterval(level);
  if (dropAccum >= interval) {
    dropAccum -= interval;
    if (current) {
      const { type, rot, row, col } = current;
      if (isValid(type, rot, row + 1, col)) {
        current.row++;
        onPieceMove();
      } else if (lockTimer === null) {
        lockTimer = ts + LOCK_DELAY;
      }
    }
  }

  // Lock timer
  if (current && lockTimer !== null && ts >= lockTimer) {
    lockPiece();
  }

  // Animation frames for line clear
  if (animatingLines.length > 0) {
    animFrame = (animFrame + 1) % 6;
  }

  drawBoard();
  drawHold();
  drawNext();

  rafId = requestAnimationFrame(loop);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function drawCell(ctx, r, c, color, size, glow) {
  const x = c * size, y = r * size;
  const s = size;

  // Background fill
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);

  // Highlight (top-left)
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 1, y + 1, s - 2, 3);
  ctx.fillRect(x + 1, y + 1, 3, s - 2);

  // Shadow (bottom-right)
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x + 1, y + s - 4, s - 2, 3);
  ctx.fillRect(x + s - 4, y + 1, 3, s - 2);

  // Glow
  if (glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.restore();
  }
}

function drawBoard() {
  bctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  // Grid lines
  bctx.strokeStyle = 'rgba(255,255,255,0.03)';
  bctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    bctx.beginPath();
    bctx.moveTo(0, r * CELL);
    bctx.lineTo(COLS * CELL, r * CELL);
    bctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    bctx.beginPath();
    bctx.moveTo(c * CELL, 0);
    bctx.lineTo(c * CELL, ROWS * CELL);
    bctx.stroke();
  }

  // Locked cells
  for (let r = 0; r < ROWS; r++) {
    const flashing = animatingLines.includes(r) && (animFrame % 2 === 0);
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        const color = flashing ? '#ffffff' : board[r][c];
        drawCell(bctx, r, c, color, CELL, flashing ? null : board[r][c]);
      }
    }
  }

  if (!current) return;

  // Ghost piece
  const gr = ghostRow();
  const { type, rot, row, col } = current;
  const ghostColor = PIECES[type].color;
  if (gr !== row) {
    bctx.globalAlpha = 0.2;
    for (const [dr, dc] of PIECES[type].shapes[rot]) {
      const r = gr + dr, c = col + dc;
      if (r >= 0) drawCell(bctx, r, c, ghostColor, CELL, null);
    }
    bctx.globalAlpha = 1;
  }

  // Active piece
  for (const [dr, dc] of PIECES[type].shapes[rot]) {
    const r = row + dr, c = col + dc;
    if (r >= 0) drawCell(bctx, r, c, PIECES[type].color, CELL, PIECES[type].glow);
  }
}

function drawPieceInPanel(ctx, type, canvasW, canvasH, cellSize) {
  if (!type) return;

  const shape = PIECES[type].shapes[0];
  let minR = 4, maxR = 0, minC = 4, maxC = 0;
  for (const [r, c] of shape) {
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  const pw = (maxC - minC + 1) * cellSize;
  const ph = (maxR - minR + 1) * cellSize;
  const ox = Math.floor((canvasW - pw) / 2);
  const oy = Math.floor((canvasH - ph) / 2);

  ctx.save();
  ctx.translate(ox, oy);
  for (const [r, c] of shape) {
    drawCell(ctx, r - minR, c - minC, PIECES[type].color, cellSize, PIECES[type].glow);
  }
  ctx.restore();
}

function drawHold() {
  hctx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  drawPieceInPanel(hctx, held, holdCanvas.width, holdCanvas.height, PREVIEW_CELL);
}

function drawNext() {
  nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const slotH = nextCanvas.height / 3;
  for (let i = 0; i < Math.min(3, next3.length); i++) {
    nctx.save();
    nctx.translate(0, i * slotH);
    drawPieceInPanel(nctx, next3[i], nextCanvas.width, slotH, PREVIEW_CELL);
    nctx.restore();
  }
}

// ── Score display ─────────────────────────────────────────────────────────────

function updateScoreDisplay() {
  document.getElementById('score').textContent = score.toLocaleString();
  document.getElementById('level').textContent = level;
  document.getElementById('lines').textContent = lines;
}

// ── Input ─────────────────────────────────────────────────────────────────────

// DAS (Delayed Auto Shift) state
const DAS_DELAY = 170;
const DAS_PERIOD = 50;
const dasState = { ArrowLeft: null, ArrowRight: null };

function clearDAS(key) {
  if (dasState[key]) {
    clearInterval(dasState[key].interval);
    clearTimeout(dasState[key].timeout);
    dasState[key] = null;
  }
}

function startDAS(key, dir) {
  clearDAS(key);
  moveH(dir);
  const timeout = setTimeout(() => {
    if (!dasState[key]) return;
    dasState[key].interval = setInterval(() => {
      if (!gameRunning || paused || !current) return;
      moveH(dir);
    }, DAS_PERIOD);
  }, DAS_DELAY);
  dasState[key] = { timeout, interval: null };
}

document.addEventListener('keydown', (e) => {
  if (!gameRunning || gameOver) return;

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault();
      if (!dasState.ArrowLeft) startDAS('ArrowLeft', -1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (!dasState.ArrowRight) startDAS('ArrowRight', 1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (!paused) softDrop();
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (!paused) rotate(1);
      break;
    case 'KeyZ':
      e.preventDefault();
      if (!paused) rotate(-1);
      break;
    case 'Space':
      e.preventDefault();
      if (!paused) hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      e.preventDefault();
      if (!paused) holdPiece();
      break;
    case 'KeyP':
    case 'Escape':
      e.preventDefault();
      togglePause();
      break;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') clearDAS('ArrowLeft');
  if (e.code === 'ArrowRight') clearDAS('ArrowRight');
});

// ── Button bindings ───────────────────────────────────────────────────────────

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('resume-btn').addEventListener('click', togglePause);

// ── Initial draw ──────────────────────────────────────────────────────────────

// Clear canvases on load
bctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
hctx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

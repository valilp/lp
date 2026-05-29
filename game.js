'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 20;
const CELL = 30;
const PREVIEW_CELL = 24;

// Lollipop candy colors
const PIECES = {
  I: {
    color: '#ff3d7f', dark: '#cc1a5e',
    shapes: [
      [[0,0],[0,1],[0,2],[0,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,1],[1,1],[2,1],[3,1]],
    ],
    spawnOffset: [-1, 3],
  },
  O: {
    color: '#ffe000', dark: '#ccb200',
    shapes: [
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
    ],
    spawnOffset: [0, 4],
  },
  T: {
    color: '#aa44ff', dark: '#7722cc',
    shapes: [
      [[0,1],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[1,2],[2,1]],
      [[0,1],[1,0],[1,1],[2,1]],
    ],
    spawnOffset: [0, 3],
  },
  S: {
    color: '#00dd88', dark: '#00aa66',
    shapes: [
      [[0,1],[0,2],[1,0],[1,1]],
      [[0,1],[1,1],[1,2],[2,2]],
      [[1,1],[1,2],[2,0],[2,1]],
      [[0,0],[1,0],[1,1],[2,1]],
    ],
    spawnOffset: [0, 3],
  },
  Z: {
    color: '#ff6600', dark: '#cc4400',
    shapes: [
      [[0,0],[0,1],[1,1],[1,2]],
      [[0,2],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[2,1],[2,2]],
      [[0,1],[1,0],[1,1],[2,0]],
    ],
    spawnOffset: [0, 3],
  },
  J: {
    color: '#0099ff', dark: '#0066cc',
    shapes: [
      [[0,0],[1,0],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[2,1]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,0],[2,1]],
    ],
    spawnOffset: [0, 3],
  },
  L: {
    color: '#ff9900', dark: '#cc6600',
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

const KICKS_JLSTZ = [
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
];

const KICKS_I = [
  [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
];

const LINE_SCORE = [100, 300, 500, 800];
const LOCK_DELAY = 500;
const LOCK_MOVES_MAX = 15;

function dropInterval(level) {
  return Math.max(50, Math.round(Math.pow(0.8 - (level - 1) * 0.007, level - 1) * 1000));
}

// ── Particles ─────────────────────────────────────────────────────────────────

let particles = [];

const SPLASH_COLORS = [
  '#ff8fab', '#ffb3c6', '#ff6b9d', '#ffc8dd',
  '#ff85a1', '#ffffff', '#ffd6e0', '#ffccd5',
  '#f9a8d4', '#fbb6ce', '#ff5fa0',
];

function spawnSplash(lockedCells) {
  for (const [r, c] of lockedCells) {
    const cx = (c + 0.5) * CELL;
    const cy = (r + 0.5) * CELL;
    const count = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      // Spray mostly upward and sideways (hitting the ground)
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 1.4;
      const speed = 1.5 + Math.random() * 3.5;
      const life = 0.7 + Math.random() * 0.5;
      particles.push({
        x: cx + (Math.random() - 0.5) * CELL * 0.6,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2.5 + Math.random() * 4,
        color: SPLASH_COLORS[Math.floor(Math.random() * SPLASH_COLORS.length)],
      });
    }
  }
}

function updateParticles(dt) {
  const decay = dt * 0.0018;
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22;
    p.life -= decay;
  }
  particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
  for (const p of particles) {
    const alpha = Math.min(1, p.life / p.maxLife);
    bctx.globalAlpha = alpha;
    bctx.fillStyle = p.color;
    bctx.beginPath();
    bctx.arc(p.x, p.y, p.size * alpha + 0.5, 0, Math.PI * 2);
    bctx.fill();
  }
  bctx.globalAlpha = 1;
}

// ── State ────────────────────────────────────────────────────────────────────

let board, bag, current, next3, held, canHold;
let score, level, lines;
let gameRunning, paused, gameOver;
let lockTimer, lockMoves;
let lastTime, dropAccum, rafId;
let animatingLines, animFrame;

// ── Canvas ────────────────────────────────────────────────────────────────────

const boardCanvas = document.getElementById('board-canvas');
const holdCanvas  = document.getElementById('hold-canvas');
const nextCanvas  = document.getElementById('next-canvas');
const bctx = boardCanvas.getContext('2d');
const hctx = holdCanvas.getContext('2d');
const nctx = nextCanvas.getContext('2d');

boardCanvas.width  = COLS * CELL;
boardCanvas.height = ROWS * CELL;
holdCanvas.width   = 5 * PREVIEW_CELL;
holdCanvas.height  = 5 * PREVIEW_CELL;
nextCanvas.width   = 5 * PREVIEW_CELL;
nextCanvas.height  = 15 * PREVIEW_CELL;

// ── Bag randomizer ─────────────────────────────────────────────────────────────

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

// ── Piece helpers ──────────────────────────────────────────────────────────────

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
  if (!isValid(type, 0, dr, dc)) { triggerGameOver(); return false; }
  current = { type, rot: 0, row: dr, col: dc };
  lockTimer = null;
  lockMoves = 0;
  return true;
}

// ── Rotation ───────────────────────────────────────────────────────────────────

function rotate(dir) {
  if (!current) return;
  const { type, rot, row, col } = current;
  const newRot = (rot + (dir > 0 ? 1 : 3)) % 4;
  const kicks = type === 'I' ? KICKS_I : KICKS_JLSTZ;
  const kickSet = dir > 0
    ? kicks[rot]
    : kicks[newRot].map(([kr, kc]) => [-kr, -kc]);

  for (const [kr, kc] of kickSet) {
    if (isValid(type, newRot, row + kr, col + kc)) {
      current = { type, rot: newRot, row: row + kr, col: col + kc };
      onPieceMove();
      return true;
    }
  }
  return false;
}

// ── Movement ───────────────────────────────────────────────────────────────────

function moveH(dir) {
  if (!current) return;
  const { type, rot, row, col } = current;
  if (isValid(type, rot, row, col + dir)) {
    current.col += dir;
    onPieceMove();
  }
}

function softDrop() {
  if (!current) return false;
  const { type, rot, row, col } = current;
  if (isValid(type, rot, row + 1, col)) {
    current.row++;
    dropAccum = 0;
    score += 1;
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
  lockPiece();
}

function ghostRow() {
  if (!current) return current.row;
  const { type, rot, row, col } = current;
  let r = row;
  while (isValid(type, rot, r + 1, col)) r++;
  return r;
}

// ── Lock / clear ───────────────────────────────────────────────────────────────

function onPieceMove() {
  const { type, rot, row, col } = current;
  if (!isValid(type, rot, row + 1, col)) {
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
  const lockedCells = cells(type, rot, row, col);

  for (const [r, c] of lockedCells) {
    if (r < 0) { triggerGameOver(); return; }
    board[r][c] = PIECES[type].color;
  }

  spawnSplash(lockedCells);

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

  animatingLines = full;
  animFrame = 0;

  setTimeout(() => {
    for (const r of [...full].reverse()) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(null));
    }
    animatingLines = [];
  }, 180);

  return full.length;
}

// ── Hold ───────────────────────────────────────────────────────────────────────

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

// ── Game flow ──────────────────────────────────────────────────────────────────

function initGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bag = fillBag();
  next3 = [];
  held = null;
  canHold = true;
  score = 0; level = 1; lines = 0;
  gameOver = false; paused = false;
  animatingLines = []; dropAccum = 0;
  lockTimer = null; lockMoves = 0;
  lastTime = null;
  particles = [];
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
  document.getElementById('final-score').textContent = score.toLocaleString();
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

// ── Game loop ──────────────────────────────────────────────────────────────────

function loop(ts) {
  if (!gameRunning || paused) return;

  if (lastTime === null) lastTime = ts;
  const dt = ts - lastTime;
  lastTime = ts;

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

  if (current && lockTimer !== null && ts >= lockTimer) lockPiece();

  if (animatingLines.length > 0) animFrame = (animFrame + 1) % 6;

  updateParticles(dt);
  drawBoard();
  drawHold();
  drawNext();

  rafId = requestAnimationFrame(loop);
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawCell(ctx, r, c, color, size, alpha) {
  const x = c * size;
  const y = r * size;
  const pad = 2;
  const inner = size - pad * 2;
  const rad = inner * 0.3;

  ctx.globalAlpha = alpha !== undefined ? alpha : 1;

  // Main fill
  ctx.fillStyle = color;
  roundRect(ctx, x + pad, y + pad, inner, inner, rad);

  // Bottom shadow to give depth
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  roundRect(ctx, x + pad, y + pad + inner * 0.55, inner, inner * 0.45, rad * 0.5);

  // Big glassy top highlight (candy shine)
  const grad = ctx.createLinearGradient(x + pad, y + pad, x + pad, y + pad + inner * 0.58);
  grad.addColorStop(0, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  roundRect(ctx, x + pad, y + pad, inner, inner * 0.58, rad);

  // Small bright shine spot
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(
    x + pad + inner * 0.3,
    y + pad + inner * 0.2,
    inner * 0.18, inner * 0.1,
    -0.3, 0, Math.PI * 2
  );
  ctx.fill();

  ctx.globalAlpha = 1;
}

function drawBoard() {
  // White candy board background
  bctx.fillStyle = '#fff8fb';
  bctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  // Soft pink grid
  bctx.strokeStyle = 'rgba(255, 107, 174, 0.1)';
  bctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    bctx.beginPath(); bctx.moveTo(0, r * CELL); bctx.lineTo(COLS * CELL, r * CELL); bctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    bctx.beginPath(); bctx.moveTo(c * CELL, 0); bctx.lineTo(c * CELL, ROWS * CELL); bctx.stroke();
  }

  // Locked cells
  for (let r = 0; r < ROWS; r++) {
    const flashing = animatingLines.includes(r) && (animFrame % 2 === 0);
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        drawCell(bctx, r, c, flashing ? '#ffffff' : board[r][c], CELL);
      }
    }
  }

  if (!current) {
    drawParticles();
    return;
  }

  // Ghost piece
  const gr = ghostRow();
  const { type, rot, row, col } = current;
  if (gr !== row) {
    for (const [dr, dc] of PIECES[type].shapes[rot]) {
      const rr = gr + dr, cc = col + dc;
      if (rr >= 0) drawCell(bctx, rr, cc, PIECES[type].color, CELL, 0.18);
    }
  }

  // Active piece
  for (const [dr, dc] of PIECES[type].shapes[rot]) {
    const rr = row + dr, cc = col + dc;
    if (rr >= 0) drawCell(bctx, rr, cc, PIECES[type].color, CELL);
  }

  drawParticles();
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
    drawCell(ctx, r - minR, c - minC, PIECES[type].color, cellSize);
  }
  ctx.restore();
}

function drawHold() {
  hctx.fillStyle = '#fff8fb';
  hctx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
  drawPieceInPanel(hctx, held, holdCanvas.width, holdCanvas.height, PREVIEW_CELL);
}

function drawNext() {
  nctx.fillStyle = '#fff8fb';
  nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  const slotH = nextCanvas.height / 3;
  for (let i = 0; i < Math.min(3, next3.length); i++) {
    nctx.save();
    nctx.translate(0, i * slotH);
    drawPieceInPanel(nctx, next3[i], nextCanvas.width, slotH, PREVIEW_CELL);
    nctx.restore();
  }
}

// ── Score display ──────────────────────────────────────────────────────────────

function updateScoreDisplay() {
  document.getElementById('score').textContent = score.toLocaleString();
  document.getElementById('level').textContent = level;
  document.getElementById('lines').textContent = lines;
}

// ── Input ──────────────────────────────────────────────────────────────────────

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
    case 'ArrowLeft':  e.preventDefault(); if (!dasState.ArrowLeft)  startDAS('ArrowLeft', -1); break;
    case 'ArrowRight': e.preventDefault(); if (!dasState.ArrowRight) startDAS('ArrowRight', 1); break;
    case 'ArrowDown':  e.preventDefault(); if (!paused) softDrop(); break;
    case 'ArrowUp':    e.preventDefault(); if (!paused) rotate(1);  break;
    case 'KeyZ':       e.preventDefault(); if (!paused) rotate(-1); break;
    case 'Space':      e.preventDefault(); if (!paused) hardDrop(); break;
    case 'KeyC': case 'ShiftLeft': case 'ShiftRight':
      e.preventDefault(); if (!paused) holdPiece(); break;
    case 'KeyP': case 'Escape':
      e.preventDefault(); togglePause(); break;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft')  clearDAS('ArrowLeft');
  if (e.code === 'ArrowRight') clearDAS('ArrowRight');
});

// ── Button bindings ────────────────────────────────────────────────────────────

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('resume-btn').addEventListener('click', togglePause);

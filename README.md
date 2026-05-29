# Tetris

A fully playable classic Tetris game built with vanilla HTML, CSS, and JavaScript.

![Screenshot placeholder](screenshot.png)

**Live demo:** `https://YOUR_USERNAME.github.io/tetris/`

---

## How to Play

### Controls

| Key | Action |
|-----|--------|
| ← / → | Move left / right |
| ↑ | Rotate clockwise |
| Z | Rotate counter-clockwise |
| ↓ | Soft drop |
| Space | Hard drop |
| C / Shift | Hold piece |
| P / Escape | Pause / Resume |

### Scoring

| Lines cleared | Points |
|---------------|--------|
| Single | 100 × level |
| Double | 300 × level |
| Triple | 500 × level |
| Tetris (4) | 800 × level |

- Soft drop: +1 per row
- Level increases every 10 lines
- Speed increases with each level

---

## Features

- All 7 tetrominoes (I, O, T, S, Z, J, L) with correct SRS rotation
- Wall kicks (Super Rotation System)
- Ghost piece preview
- Next 3 pieces preview
- Hold piece
- Delayed Auto Shift (DAS) for smooth movement
- Line clear flash animation
- Dark neon UI

---

## Local Development

No build step needed — just open the file:

```bash
# Option 1: open directly
open index.html

# Option 2: serve with any static file server
npx serve .
# or
python3 -m http.server 8080
```

---

## Deployment

This repo deploys automatically to GitHub Pages on every push to `main` via GitHub Actions.

To enable:
1. Push this repo to GitHub
2. Go to **Settings → Pages → Source**
3. Set source to **GitHub Actions**
4. The next push to `main` will deploy the game

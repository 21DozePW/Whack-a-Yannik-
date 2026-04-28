# Whack-a-Yannik

An elegant browser game of reflexes. Tap Yannik when he appears for points; avoid Oliver, who debits your score.

## Gameplay

- **Yannik** (smiling): tap him for +1 point. Successive hits within 1.4s build a streak (×2 → ×9).
- **Oliver** (smiling, bald): appears unannounced. Tap him and you lose 5 points and your streak.
- 30 seconds per round. Best score is preserved per device.
- Switch tier mid-round to abandon the current game and start a fresh one.

## Run locally

Static site, no build step:

```
python3 -m http.server 8000
```

Then open http://localhost:8000

## Deploy

Pushed to `main` → Vercel auto-deploys to https://whack-a-yannik.vercel.app

## Assets

- `yannik-smile.png`, `yannik-surprised.png` — Yannik idle and reaction
- `oliver-smile.png`, `oliver-frown.png` — Oliver idle and reaction
- `thumbnail.png` — 1200×630 OG image for sharing

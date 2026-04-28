# Whack-a-Yannik

A simple browser-based whack-a-mole game. Click or tap Yannik when he pops out of a hole — score as many hits as you can in 30 seconds.

## Run locally

It's a static site, so any static server works:

```
python3 -m http.server 8000
```

Then open http://localhost:8000

## Deploy on Vercel

1. Push this repo to GitHub.
2. Go to https://vercel.com/new and import the repo.
3. Vercel auto-detects it as a static site — no build step needed.
4. Click **Deploy**. You'll get a free `*.vercel.app` URL.

## Assets

Drop these files in the project root to customize the game:

- `mole.png` — the Yannik character art (square image works best, transparent PNG ideal)
- `thumbnail.png` — used as the favicon and Open Graph preview image

If `mole.png` is missing, the game falls back to a CSS-drawn face so it still works.

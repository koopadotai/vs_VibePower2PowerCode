# Vibe Extractor

Downloads the React/TypeScript source code from a Power Apps Vibe project (make.powerapp.com) to your local machine.

## How It Works

The extractor opens a real Chromium browser using Playwright, monitors all network requests made by the Vibe editor, captures source file responses, and saves them to disk.

## Setup

```powershell
npm install
npx playwright install chromium
```

## Usage

### Option 1 — Automatic (recommended)

```powershell
node index.js
```

Prompts for:
- **Project name** — used as output folder name
- **Vibe app URL** — the URL from your browser when the app is open in make.powerapp.com

Log in with your Microsoft account when the browser opens. The extractor runs automatically.

### Option 2 — Manual fallback

```powershell
node extract.js ./vibe-source
```

Opens the browser and waits. Click through each file in the Vibe editor file tree. Press ENTER in the terminal when done.

### Option 3 — Browser console script

Open your Vibe app in Chrome/Edge DevTools (F12 → Console tab).
Paste the contents of `console-extract.js` and press Enter.
The script expands the file tree and clicks through files automatically, then copies all content to clipboard as JSON.
Then run `node save-files.js` to write the clipboard content to disk.

## Output

All methods write files to `./vibe-source/` (or the folder name you specified):

```
vibe-source/
└── src/
    ├── app.tsx
    ├── main.tsx
    ├── index.css
    ├── pages/
    ├── components/
    ├── hooks/
    ├── lib/
    └── generated/
        ├── models/
        ├── services/
        └── hooks/
```

## Notes

- Files are Vite-transformed (HMR code injected) — this is normal
- The AI migration step handles extraction of original TypeScript from the inline source maps
- The `generated/` folder contains Vibe's abstraction layer — it will be replaced during migration

# @pulsedock/extension

Chrome MV3 browser extension for PulseDock. Create monitors with one click from any webpage.

## Features

- **One-click monitor creation** — Right-click any page → "Monitor with PulseDock"
- **Context menu integration** — Add the current page URL directly to your monitor list
- **API key authentication** — Connects to your self-hosted PulseDock instance
- **Settings panel** — Configure your PulseDock URL and API key
- **Dashboard shortcut** — Quick link to your PulseDock dashboard
- **Dark theme popup**

## Installation (Development)

1. Build the extension:

```bash
cd packages/extension
npm run build
```

2. Open `chrome://extensions/` in Chrome
3. Enable **Developer Mode**
4. Click **Load unpacked** → select the `packages/extension/dist/` directory

## Configuration

After installing:
1. Click the PulseDock icon in the toolbar
2. Open Settings (gear icon)
3. Enter your PulseDock instance URL (e.g. `https://status.example.com`)
4. Enter your API key (create one in Account → API Keys)

## Development

```bash
cd packages/extension
npm run dev     # Watch mode — rebuilds on change
npm run build   # Production build
```

## Structure

```
src/
  popup.ts         Main popup logic
  background.ts    Service worker (context menu, API calls)
  settings.ts      Settings page logic
popup.html         Popup UI
manifest.json      Extension manifest (MV3)
```

See [docs/EXTENSION.md](../../docs/EXTENSION.md) for full documentation.

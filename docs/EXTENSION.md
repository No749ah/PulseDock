# PulseDock Browser Extension

One-click monitor creation from any browser tab. Instantly add any URL to your PulseDock dashboard without leaving the page.

## Features

- **One-click monitor creation** — detects the current tab URL and title automatically
- **Quick check presets** — choose from 30s to 1-hour polling intervals
- **Monitor type support** — HTTP uptime, Git Release, Docker Image
- **Context menu integration** — right-click any page or link → "Add to PulseDock Monitors"
- **Dashboard shortcut** — open the PulseDock dashboard directly from the extension
- **Dark theme** — matches the PulseDock design language

## Installation (Developer Mode)

The extension is not yet published to the Chrome Web Store. Install in developer mode:

1. Build the extension (from the repo root):
   ```bash
   npm run build -w @pulsedock/extension
   ```

2. Open Chrome → `chrome://extensions`

3. Enable **Developer mode** (top-right toggle)

4. Click **Load unpacked** → select `packages/extension/dist/`

5. The PulseDock icon appears in your toolbar.

## Setup

1. Click the PulseDock extension icon
2. Click the ⚙ (settings) icon
3. Enter your **PulseDock API URL** (e.g. `http://localhost:4321` or your hosted domain)
4. Enter your **API Key** — generate one in PulseDock → Account → API Keys
5. Click **Test Connection** to verify, then **Save**

## Usage

### Add a monitor from the current tab

1. Navigate to the URL you want to monitor
2. Click the PulseDock extension icon
3. The URL and page title are auto-filled
4. Adjust the monitor name, type, and check interval as needed
5. Click **Add Monitor**

### Add a monitor via context menu

1. Right-click any page or link
2. Select **Add to PulseDock Monitors**
3. The popup opens with the URL pre-filled

### Open the dashboard

Click the ↗ icon in the extension header to jump to the PulseDock Monitors page.

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| API URL | Base URL of your PulseDock API | `http://localhost:4321` |
| API Key | Bearer token for API authentication | _(required)_ |

## Architecture

```
packages/extension/
├── manifest.json          # Chrome Extension Manifest V3
├── popup.html             # Extension popup UI
├── popup.css              # Dark theme styles
├── icons/                 # Extension icons (16/48/128px)
├── src/
│   ├── popup.ts           # Popup logic
│   ├── background.ts      # Service worker (context menu + tab info)
│   ├── api.ts             # PulseDock API client
│   ├── storage.ts         # chrome.storage wrapper
│   ├── types.ts           # Shared TypeScript types
│   └── chrome.d.ts        # Chrome Extension API declarations
└── dist/                  # Compiled extension (load this in Chrome)
```

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 88+ | ✅ Full | Primary target (MV3) |
| Edge 88+ | ✅ Full | Chromium-based |
| Firefox | ⚠ Partial | MV3 support varies |
| Safari | ❌ Not supported | Different extension API |

## Future Plans

- Chrome Web Store publication
- Firefox-compatible MV3 build
- Quick status badge (green/red) showing monitor health for the current tab
- Auto-detect GitHub/Docker Hub URLs and suggest the correct monitor type

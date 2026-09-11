# @pulsedock/web

Next.js 15 frontend for PulseDock. Apple-like landing page, dark-first dashboard, responsive on all devices.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS v4
- **Animations:** CSS keyframes + Intersection Observer (React 19 compatible)
- **Charts:** Recharts (AreaChart, BarChart, MiniSparkline)
- **Icons:** lucide-react
- **Auth:** JWT stored in httpOnly cookies (managed by API)

## Development

```bash
# From repo root
npm run dev:web

# From this directory
npm run dev
```

Runs on port `1234`. Proxies `/api/*` → API at `:4321`.

## Build

```bash
# From repo root
npm run build -w @pulsedock/web

# From this directory
npm run build
```

Output: `.next/` directory, standalone mode.

## Production Start

```bash
npm run start:web    # from repo root
npm run start        # from this directory
```

After any build, restart the server so new CSS/JS hashes are served:
```bash
npm run restart:web
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | API base URL — leave empty to use same-host `/api` proxy (recommended) |
| `NEXT_PUBLIC_APP_VERSION` | App version shown in UI (set by CI/CD, optional) |
| `WEB_PORT` | Port to listen on (default: `1234`) |

## Page Structure

```
app/
  page.tsx              Landing page (marketing)
  login/                Auth (login + setup)
  dashboard/            Main dashboard with live stats
  monitors/             Monitor list + detail
  alerts/               Alert channel management
  incidents/            Incident management
  maintenance/          Maintenance windows
  projects/             Project grouping
  folders/              Folder organization
  versions/             Version check monitors + tool picker
  status/[slug]/        Public status pages (unauthenticated)
  status/[id]/edit/     Status page drag-and-drop editor
  account/              User profile, API keys, 2FA
  admin/                Admin panel (system stats, users)
```

## Key Components

```
app/components/
  FadeIn.tsx            Scroll-triggered fade-in animation
  GradientText.tsx      Animated gradient text
  CountUp.tsx           Number count-up animation
  Badge.tsx             Status/severity badges
  Card.tsx              Glassmorphic card container
  Button.tsx            Styled button
  Table.tsx             Data table with sorting
  Breadcrumbs.tsx       Navigation breadcrumbs
  OnboardingChecklist.tsx   First-run checklist
  NotificationBell.tsx  Live notification center
  CommandPalette.tsx    Ctrl+K command palette

components/
  app-frame.tsx         Main app layout (sidebar + header)
  auth.tsx              Auth utilities (getUser, etc.)
  charts.tsx            MiniSparkline and chart components
```

## i18n

Lightweight built-in i18n (no external deps). Translations in `lib/i18n/messages.ts`. Supports EN + DE. Language auto-detected from browser, stored in localStorage. Switcher in nav and login page.

Full documentation: [docs/](../../docs/)

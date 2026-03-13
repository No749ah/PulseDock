import { loadSettings, saveSettings } from './storage';
import { createMonitor, verifyApiKey } from './api';
import type { MonitorType } from './types';

// ─── DOM helpers ────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing element #${id}`);
  return e as T;
}

function showView(name: 'settings' | 'create' | 'success' | 'error'): void {
  for (const v of ['view-settings', 'view-create', 'view-success', 'view-error']) {
    const elem = document.getElementById(v);
    if (elem) elem.style.display = v === `view-${name}` ? 'flex' : 'none';
  }
}

function setStatus(msg: string, type: 'info' | 'error' | 'success' = 'info'): void {
  const s = el<HTMLDivElement>('status-msg');
  s.textContent = msg;
  s.className = `status-msg status-${type}`;
  s.style.display = msg ? 'block' : 'none';
}

// ─── State ───────────────────────────────────────────────────────────────────

let currentUrl = '';
let currentTitle = '';

// ─── Boot ────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const settings = await loadSettings();

  // Wire up settings view
  el<HTMLInputElement>('input-api-url').value = settings.apiUrl;
  el<HTMLInputElement>('input-api-key').value = settings.apiKey;

  el('btn-save-settings').addEventListener('click', () => saveSettingsAndReturn());
  el('btn-cancel-settings').addEventListener('click', () => showView('create'));
  el('btn-settings-icon').addEventListener('click', () => showView('settings'));
  el('btn-open-dashboard').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    window.close();
  });

  // Settings saved → test connection
  el('btn-test-connection').addEventListener('click', async () => {
    const testSettings = {
      apiUrl: el<HTMLInputElement>('input-api-url').value.trim(),
      apiKey: el<HTMLInputElement>('input-api-key').value.trim(),
    };
    const statusEl = el<HTMLDivElement>('settings-status');
    statusEl.textContent = 'Testing…';
    statusEl.className = 'settings-status';
    const ok = await verifyApiKey(testSettings);
    statusEl.textContent = ok ? '✓ Connected' : '✗ Could not connect — check URL and API key';
    statusEl.className = ok ? 'settings-status settings-ok' : 'settings-status settings-err';
  });

  // Load tab info
  chrome.runtime.sendMessage({ type: 'GET_TAB_INFO' }, (info: unknown) => {
    const tabInfo = info as { url?: string; title?: string };
    currentUrl = tabInfo?.url ?? '';
    currentTitle = tabInfo?.title ?? '';

    // Check for context-menu prefill
    chrome.storage.local.get('pulsedock_prefill_url', (r: Record<string, unknown>) => {
      if (r['pulsedock_prefill_url']) {
        currentUrl = r['pulsedock_prefill_url'] as string;
        chrome.storage.local.remove('pulsedock_prefill_url');
      }
      el<HTMLInputElement>('input-url').value = currentUrl;
      el<HTMLInputElement>('input-name').value = deriveMonitorName(currentTitle, currentUrl);
    });
  });

  // Wire up create form
  el('btn-create').addEventListener('click', () => handleCreate());
  el('btn-success-view-monitor').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    window.close();
  });
  el('btn-success-add-another').addEventListener('click', () => {
    showView('create');
    setStatus('');
  });
  el('btn-error-retry').addEventListener('click', () => showView('create'));

  // Quick-check interval display
  el<HTMLSelectElement>('input-interval').addEventListener('change', updateIntervalLabel);

  // Show correct view
  if (!settings.apiKey) {
    showView('settings');
    el<HTMLDivElement>('settings-status').textContent = 'Enter your PulseDock API key to get started.';
  } else {
    showView('create');
  }
}

async function saveSettingsAndReturn(): Promise<void> {
  const settings = {
    apiUrl: el<HTMLInputElement>('input-api-url').value.trim(),
    apiKey: el<HTMLInputElement>('input-api-key').value.trim(),
  };
  if (!settings.apiUrl) {
    el<HTMLDivElement>('settings-status').textContent = 'API URL is required.';
    return;
  }
  await saveSettings(settings);
  showView('create');
}

function updateIntervalLabel(): void {
  const val = parseInt(el<HTMLSelectElement>('input-interval').value, 10);
  const labels: Record<number, string> = {
    30: 'every 30s',
    60: 'every min',
    300: 'every 5 min',
    600: 'every 10 min',
    1800: 'every 30 min',
    3600: 'every hour',
  };
  const label = el<HTMLSpanElement>('interval-label');
  if (label) label.textContent = labels[val] ?? '';
}

function deriveMonitorName(title: string, url: string): string {
  if (title && title.length > 0 && title.length <= 80) return title;
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url.substring(0, 80);
  }
}

async function handleCreate(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.apiKey) {
    showView('settings');
    return;
  }

  const urlInput = el<HTMLInputElement>('input-url').value.trim();
  const nameInput = el<HTMLInputElement>('input-name').value.trim();
  const typeInput = el<HTMLSelectElement>('input-type').value as MonitorType;
  const intervalInput = parseInt(el<HTMLSelectElement>('input-interval').value, 10);

  if (!urlInput) {
    setStatus('URL is required.', 'error');
    return;
  }

  const btn = el<HTMLButtonElement>('btn-create');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  setStatus('');

  try {
    const monitor = await createMonitor(settings, {
      name: nameInput || deriveMonitorName('', urlInput),
      target: urlInput,
      type: typeInput,
      intervalSec: intervalInput,
      timeoutMs: 10000,
    });

    // Success
    el<HTMLDivElement>('success-name').textContent = monitor.name;
    el<HTMLDivElement>('success-url').textContent = monitor.target;
    showView('success');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    el<HTMLDivElement>('error-msg').textContent = msg;
    showView('error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Monitor';
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => void init());

import type { ExtensionSettings } from './types';

const STORAGE_KEY = 'pulsedock_settings';

const DEFAULTS: ExtensionSettings = {
  apiUrl: 'http://localhost:4321',
  apiKey: '',
};

export async function loadSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result: Record<string, unknown>) => {
      const saved = result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
      resolve({ ...DEFAULTS, ...saved });
    });
  });
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: settings }, resolve);
  });
}

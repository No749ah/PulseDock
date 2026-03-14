// PulseDock extension service worker
// Handles messages from popup and context menu actions

import type { ExtensionSettings } from './types';

interface TabInfo {
  url: string;
  title: string;
  favIconUrl: string;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as { type: string };

  if (msg.type === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
      const tab = tabs[0];
      const info: TabInfo = {
        url: tab?.url ?? '',
        title: tab?.title ?? '',
        favIconUrl: tab?.favIconUrl ?? '',
      };
      sendResponse(info);
    });
    return true; // async response
  }

  if (msg.type === 'OPEN_DASHBOARD') {
    chrome.storage.local.get('pulsedock_settings', (result: Record<string, unknown>) => {
      const settings = result['pulsedock_settings'] as ExtensionSettings | undefined;
      const baseUrl = settings?.apiUrl?.replace(':4321', ':1234') ?? 'http://localhost:1234';
      const dashUrl = `${baseUrl}/monitors`;
      chrome.tabs.create({ url: dashUrl });
      sendResponse({ ok: true });
    });
    return true;
  }
});

// Context menu: right-click → "Monitor this page"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'pulsedock-add-monitor',
    title: 'Add to PulseDock Monitors',
    contexts: ['page', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (info.menuItemId === 'pulsedock-add-monitor') {
    const url = info.linkUrl ?? info.pageUrl ?? tab?.url ?? '';
    // Open popup with pre-filled URL via storage
    chrome.storage.local.set({ pulsedock_prefill_url: url }, () => {
      void chrome.action.openPopup();
    });
  }
});

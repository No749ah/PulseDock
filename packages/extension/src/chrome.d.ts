// Minimal Chrome Extension API type declarations for PulseDock extension
// Covers the subset of APIs used in this extension (MV3)

declare namespace chrome {
  namespace runtime {
    function sendMessage(message: unknown, callback?: (response: unknown) => void): void;
    function sendMessage<T>(message: unknown, callback?: (response: T) => void): void;
    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };
    interface MessageSender {
      tab?: chrome.tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
    }
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      favIconUrl?: string;
      active?: boolean;
      windowId?: number;
    }
    function query(
      queryInfo: { active?: boolean; currentWindow?: boolean },
      callback: (tabs: Tab[]) => void,
    ): void;
    function create(properties: { url: string }): void;
  }

  namespace storage {
    const local: {
      get(keys: string | string[] | null, callback: (result: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
      remove(keys: string | string[], callback?: () => void): void;
    };
  }

  namespace contextMenus {
    interface CreateProperties {
      id?: string;
      title?: string;
      contexts?: Array<'page' | 'link' | 'selection' | 'image' | 'all'>;
    }
    interface OnClickData {
      menuItemId: string | number;
      pageUrl?: string;
      linkUrl?: string;
      selectionText?: string;
    }
    function create(properties: CreateProperties): void;
    const onClicked: {
      addListener(
        callback: (info: OnClickData, tab?: chrome.tabs.Tab) => void,
      ): void;
    };
  }

  namespace action {
    function openPopup(): Promise<void>;
  }
}

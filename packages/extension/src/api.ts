import type { CreateMonitorPayload, ExtensionSettings, MonitorResponse, ApiError } from './types';

export async function createMonitor(
  settings: ExtensionSettings,
  payload: CreateMonitorPayload,
): Promise<MonitorResponse> {
  const url = `${settings.apiUrl.replace(/\/$/, '')}/v1/monitors`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as ApiError;
      if (Array.isArray(err.message)) {
        errMsg = err.message.join('; ');
      } else if (typeof err.message === 'string') {
        errMsg = err.message;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<MonitorResponse>;
}

export async function quickCheck(
  settings: ExtensionSettings,
  url: string,
): Promise<{ status: number; latencyMs: number; ok: boolean }> {
  const endpoint = `${settings.apiUrl.replace(/\/$/, '')}/v1/monitors/run`;
  // Quick check endpoint doesn't exist for arbitrary URLs; use a lite proxy endpoint
  // For a real quick check we just ping the URL directly from the extension background
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
    // no-cors means we can't read status for cross-origin; we just check reachability
    const latencyMs = Date.now() - start;
    // If response is opaque (no-cors), status === 0 but fetch succeeded → reachable
    const ok = res.type === 'opaque' || res.ok;
    return { status: res.status || 0, latencyMs, ok };
  } catch {
    const latencyMs = Date.now() - start;
    return { status: 0, latencyMs, ok: false };
  }

  void endpoint; // suppress unused warning
}

export async function verifyApiKey(settings: ExtensionSettings): Promise<boolean> {
  try {
    const url = `${settings.apiUrl.replace(/\/$/, '')}/v1/monitors`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

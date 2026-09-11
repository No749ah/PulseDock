// Pure helper functions for ShareTokenCard

/** Build the public status page URL path for a share token. */
export function buildShareTokenPath(token: string): string {
  return `/public/monitor/${token}`;
}

/** Build the JSON status endpoint path for a share token. */
export function buildShareJsonPath(token: string): string {
  return `/v1/public/monitor/${token}/status.json`;
}

/** Get button label based on copy state. */
export function copyButtonLabel(copied: boolean): string {
  return copied ? "Copied!" : "Copy JSON URL";
}

/** Determine if generate/revoke button should be shown as loading. */
export function isTokenActionDisabled(shareTokenLoading: boolean): boolean {
  return shareTokenLoading;
}

/** Get generate button label. */
export function generateButtonLabel(loading: boolean): string {
  return loading ? "Generating…" : "Generate Share Token";
}

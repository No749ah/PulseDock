/**
 * Pure helper functions for the Login page.
 * Extracted for testability — no browser/React dependencies.
 */

// ── Flow detection ────────────────────────────────────────────────────────────

/** Returns true if the page is in the invite acceptance flow. */
export function isInviteFlow(inviteToken: string): boolean {
  return Boolean(inviteToken);
}

/** Returns true if the page is in the password-reset flow. */
export function isResetFlow(resetToken: string): boolean {
  return Boolean(resetToken);
}

// ── Display labels ────────────────────────────────────────────────────────────

export interface LoginFlowState {
  inInviteFlow: boolean;
  inResetFlow: boolean;
  forgotMode: boolean;
  totpStep: boolean;
}

/**
 * Returns the subtitle translation key for the current login flow state.
 */
export function subtitleKey(state: LoginFlowState): string {
  if (state.inInviteFlow) return "login.subtitleInvite";
  if (state.inResetFlow) return "login.subtitleReset";
  if (state.forgotMode) return "login.subtitleForgot";
  return "login.subtitleSignIn";
}

/**
 * Returns the submit button translation key for the current login flow state.
 */
export function buttonLabelKey(state: LoginFlowState): string {
  if (state.inInviteFlow) return "login.acceptInvite";
  if (state.inResetFlow) return "login.setNewPassword";
  if (state.forgotMode) return "login.requestResetLink";
  return "login.signIn";
}

// ── Submit action ─────────────────────────────────────────────────────────────

export type LoginAction =
  | "verifyTotp"
  | "acceptInvite"
  | "confirmReset"
  | "requestReset"
  | "login";

/**
 * Determine which async action to dispatch on form submit.
 * Pure: no I/O, no side effects.
 */
export function resolveSubmitAction(state: LoginFlowState): LoginAction {
  if (state.totpStep) return "verifyTotp";
  if (state.inInviteFlow) return "acceptInvite";
  if (state.inResetFlow) return "confirmReset";
  if (state.forgotMode) return "requestReset";
  return "login";
}

// ── Setup form validation ─────────────────────────────────────────────────────

/**
 * Returns an error message if setup passwords are invalid, or null if ok.
 * Depends on passwordMeetsPolicy for strength check.
 */
export function validateSetupPasswords(
  password: string,
  confirm: string,
  meetsPolicy: (p: string) => boolean
): string | null {
  if (password !== confirm) return "Passwords do not match";
  if (!meetsPolicy(password)) return "Password does not meet the security policy";
  return null;
}

// ── User display name derivation ──────────────────────────────────────────────

/**
 * Derives a display name from an email address.
 * Falls back to "user" when email is empty or only "@domain".
 */
export function deriveDisplayName(email: string): string {
  return (email?.split("@")[0] || "user").trim() || "user";
}

// ── Error classification ──────────────────────────────────────────────────────

/**
 * Returns true when the error message indicates the email needs verification.
 */
export function isEmailNotVerifiedError(msg: string): boolean {
  return msg === "email_not_verified";
}

/**
 * Extracts a human-readable error message from an unknown error value.
 */
export function extractErrorMessage(
  e: unknown,
  fallback: string
): string {
  return e instanceof Error ? e.message : fallback;
}

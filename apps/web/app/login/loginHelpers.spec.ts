import { describe, it, expect } from "vitest";
import {
  isInviteFlow,
  isResetFlow,
  subtitleKey,
  buttonLabelKey,
  resolveSubmitAction,
  validateSetupPasswords,
  deriveDisplayName,
  isEmailNotVerifiedError,
  extractErrorMessage,
  type LoginFlowState,
} from "./loginHelpers";

// ── isInviteFlow ──────────────────────────────────────────────────────────────

describe("isInviteFlow", () => {
  it("non-empty token → true", () =>
    expect(isInviteFlow("some-token")).toBe(true));
  it("empty string → false", () => expect(isInviteFlow("")).toBe(false));
});

// ── isResetFlow ───────────────────────────────────────────────────────────────

describe("isResetFlow", () => {
  it("non-empty token → true", () =>
    expect(isResetFlow("reset-token")).toBe(true));
  it("empty string → false", () => expect(isResetFlow("")).toBe(false));
});

// ── subtitleKey ───────────────────────────────────────────────────────────────

const base: LoginFlowState = {
  inInviteFlow: false,
  inResetFlow: false,
  forgotMode: false,
  totpStep: false,
};

describe("subtitleKey", () => {
  it("invite flow → invite subtitle", () =>
    expect(subtitleKey({ ...base, inInviteFlow: true })).toBe(
      "login.subtitleInvite"
    ));

  it("reset flow → reset subtitle", () =>
    expect(subtitleKey({ ...base, inResetFlow: true })).toBe(
      "login.subtitleReset"
    ));

  it("forgot mode → forgot subtitle", () =>
    expect(subtitleKey({ ...base, forgotMode: true })).toBe(
      "login.subtitleForgot"
    ));

  it("default → sign-in subtitle", () =>
    expect(subtitleKey(base)).toBe("login.subtitleSignIn"));

  it("invite takes precedence over reset", () =>
    expect(
      subtitleKey({ ...base, inInviteFlow: true, inResetFlow: true })
    ).toBe("login.subtitleInvite"));

  it("reset takes precedence over forgot", () =>
    expect(
      subtitleKey({ ...base, inResetFlow: true, forgotMode: true })
    ).toBe("login.subtitleReset"));
});

// ── buttonLabelKey ────────────────────────────────────────────────────────────

describe("buttonLabelKey", () => {
  it("invite flow → accept invite key", () =>
    expect(buttonLabelKey({ ...base, inInviteFlow: true })).toBe(
      "login.acceptInvite"
    ));

  it("reset flow → set new password key", () =>
    expect(buttonLabelKey({ ...base, inResetFlow: true })).toBe(
      "login.setNewPassword"
    ));

  it("forgot mode → request reset link key", () =>
    expect(buttonLabelKey({ ...base, forgotMode: true })).toBe(
      "login.requestResetLink"
    ));

  it("default → sign in key", () =>
    expect(buttonLabelKey(base)).toBe("login.signIn"));

  it("invite takes precedence over reset", () =>
    expect(
      buttonLabelKey({ ...base, inInviteFlow: true, inResetFlow: true })
    ).toBe("login.acceptInvite"));
});

// ── resolveSubmitAction ───────────────────────────────────────────────────────

describe("resolveSubmitAction", () => {
  it("totpStep → verifyTotp (highest priority)", () =>
    expect(
      resolveSubmitAction({
        ...base,
        totpStep: true,
        inInviteFlow: true,
      })
    ).toBe("verifyTotp"));

  it("invite flow → acceptInvite", () =>
    expect(resolveSubmitAction({ ...base, inInviteFlow: true })).toBe(
      "acceptInvite"
    ));

  it("reset flow → confirmReset", () =>
    expect(resolveSubmitAction({ ...base, inResetFlow: true })).toBe(
      "confirmReset"
    ));

  it("forgot mode → requestReset", () =>
    expect(resolveSubmitAction({ ...base, forgotMode: true })).toBe(
      "requestReset"
    ));

  it("default → login", () => expect(resolveSubmitAction(base)).toBe("login"));

  it("invite takes precedence over reset", () =>
    expect(
      resolveSubmitAction({ ...base, inInviteFlow: true, inResetFlow: true })
    ).toBe("acceptInvite"));

  it("totp takes precedence over forgot", () =>
    expect(
      resolveSubmitAction({ ...base, totpStep: true, forgotMode: true })
    ).toBe("verifyTotp"));
});

// ── validateSetupPasswords ────────────────────────────────────────────────────

const alwaysPasses = () => true;
const alwaysFails = () => false;

describe("validateSetupPasswords", () => {
  it("matching passwords that pass policy → null", () =>
    expect(validateSetupPasswords("Secret123!", "Secret123!", alwaysPasses)).toBeNull());

  it("mismatched passwords → mismatch error", () =>
    expect(
      validateSetupPasswords("abc", "def", alwaysPasses)
    ).toBe("Passwords do not match"));

  it("matching passwords that fail policy → policy error", () =>
    expect(
      validateSetupPasswords("weak", "weak", alwaysFails)
    ).toBe("Password does not meet the security policy"));

  it("mismatch checked before policy", () =>
    expect(
      validateSetupPasswords("a", "b", alwaysFails)
    ).toBe("Passwords do not match"));

  it("empty passwords both empty → policy check runs", () =>
    expect(
      validateSetupPasswords("", "", alwaysFails)
    ).toBe("Password does not meet the security policy"));

  it("empty passwords both empty + policy passes → null", () =>
    expect(validateSetupPasswords("", "", alwaysPasses)).toBeNull());
});

// ── deriveDisplayName ─────────────────────────────────────────────────────────

describe("deriveDisplayName", () => {
  it("normal email → username part", () =>
    expect(deriveDisplayName("alice@example.com")).toBe("alice"));

  it("email with dots → keeps dots", () =>
    expect(deriveDisplayName("john.doe@example.com")).toBe("john.doe"));

  it("empty string → user", () =>
    expect(deriveDisplayName("")).toBe("user"));

  it("@domain-only → user (empty username part)", () =>
    expect(deriveDisplayName("@domain.com")).toBe("user"));

  it("plain username no @", () =>
    expect(deriveDisplayName("adminuser")).toBe("adminuser"));

  it("whitespace-only username part → user", () =>
    expect(deriveDisplayName("   @domain.com")).toBe("user"));
});

// ── isEmailNotVerifiedError ───────────────────────────────────────────────────

describe("isEmailNotVerifiedError", () => {
  it("exact match → true", () =>
    expect(isEmailNotVerifiedError("email_not_verified")).toBe(true));
  it("different message → false", () =>
    expect(isEmailNotVerifiedError("Account locked")).toBe(false));
  it("empty string → false", () =>
    expect(isEmailNotVerifiedError("")).toBe(false));
  it("case-sensitive check — uppercase → false", () =>
    expect(isEmailNotVerifiedError("EMAIL_NOT_VERIFIED")).toBe(false));
});

// ── extractErrorMessage ───────────────────────────────────────────────────────

describe("extractErrorMessage", () => {
  it("Error instance → its message", () =>
    expect(extractErrorMessage(new Error("Something went wrong"), "fallback")).toBe(
      "Something went wrong"
    ));

  it("string (non-Error) → fallback", () =>
    expect(extractErrorMessage("raw string error", "Login failed")).toBe("Login failed"));

  it("null → fallback", () =>
    expect(extractErrorMessage(null, "Login failed")).toBe("Login failed"));

  it("undefined → fallback", () =>
    expect(extractErrorMessage(undefined, "Login failed")).toBe("Login failed"));

  it("number → fallback", () =>
    expect(extractErrorMessage(404, "Login failed")).toBe("Login failed"));

  it("object without message → fallback", () =>
    expect(extractErrorMessage({ code: 500 }, "fallback")).toBe("fallback"));
});

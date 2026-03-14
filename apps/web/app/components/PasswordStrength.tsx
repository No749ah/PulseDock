"use client";

interface Rule {
  label: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  { label: "At least 12 characters", test: (p) => p.length >= 12 },
  { label: "Uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { label: "Lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { label: "Number (0–9)", test: (p) => /\d/.test(p) },
  { label: "Special character (!@#$…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function getScore(password: string): number {
  return RULES.filter((r) => r.test(password)).length;
}

const LEVELS = [
  { label: "Too weak", color: "bg-danger" },
  { label: "Weak", color: "bg-danger" },
  { label: "Fair", color: "bg-warning" },
  { label: "Good", color: "bg-success/70" },
  { label: "Strong", color: "bg-success" },
];

interface Props {
  password: string;
  className?: string;
}

export function PasswordStrength({ password, className = "" }: Props) {
  if (!password) return null;

  const score = getScore(password);
  const level = LEVELS[score] ?? LEVELS[0];

  return (
    <div className={`mt-2 space-y-2 ${className}`}>
      {/* Strength bar */}
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? level.color : "bg-border"
            }`}
          />
        ))}
      </div>

      {/* Label */}
      <p className="text-xs text-text-secondary">
        Strength:{" "}
        <span
          className={
            score <= 1
              ? "text-danger font-medium"
              : score === 2
                ? "text-warning font-medium"
                : score === 3
                  ? "text-success/70 font-medium"
                  : "text-success font-medium"
          }
        >
          {level.label}
        </span>
      </p>

      {/* Rules checklist */}
      <ul className="space-y-0.5">
        {RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.label} className="flex items-center gap-1.5 text-xs">
              <span
                className={`w-3 h-3 rounded-full flex items-center justify-center shrink-0 ${
                  ok ? "bg-success/20 text-success" : "bg-border text-text-muted"
                }`}
              >
                {ok ? "✓" : "·"}
              </span>
              <span className={ok ? "text-text-secondary" : "text-text-muted"}>
                {rule.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Returns true when all policy rules pass. Use to gate the submit button. */
export function passwordMeetsPolicy(password: string): boolean {
  return getScore(password) === RULES.length;
}

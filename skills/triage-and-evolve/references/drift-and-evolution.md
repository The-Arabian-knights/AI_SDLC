# Spec-vs-Code Drift & Continuous Improvement Protocol

## 1. Drift Classification (`egm-drift-report` Compatible)

| Drift Type | Example | Resolution |
| --- | --- | --- |
| **Contract Drift** | Endpoint/IPC schema changed without updating `SPEC-*` | Update `SPEC-*` + contract tests or revert breaking change |
| **Boundary / Auth Drift** | New route/handler bypasses authZ or validation defined in `THR-*` | Restore guard immediately + add negative test |
| **Invariant Drift** | State lifecycle, retry, or budget rule violated in code | Fix implementation or amend `ADR-*` with `arch-reviewer` sign-off |
| **Proof Drift** | New module added without updating `Proof Checklist` / CI gate | Add test + gate command to `SPEC-*` and `profile.json` |

## 2. Promotion Ladder (Feedback -> Permanent Guardrail)

Never fix the same class of mistake twice manually. Promote every recurring finding up the enforcement ladder:

1. **Level 1 — Documentation (`lessons-learned.md`):** Capture failure symptom, root cause, and detection signal.
2. **Level 2 — Rule (`rules/*.md`):** Encode a short, actionable invariant scoped by `always_on` or `glob` where the mistake occurs.
3. **Level 3 — Proof / Profile Gate (`profile.json`, `SPEC-*`):** Add an automated test assertion, SAST rule, or verification script check.
4. **Level 4 — Lifecycle Hook (`hooks.json`):** Enforce deterministic blocking or fast-check feedback at `PreToolUse`, `PostToolUse`, or `Stop`.

---
name: triage-and-evolve
description: >-
  Reproduce bugs before fixing, detect spec-to-architecture drift (`egm-drift-report`),
  synchronize ADRs/specs/tests with behavior changes, and promote recurring mistakes
  into permanent rules, scripts, or proof checks.
---

# Maintenance, Drift Detection & Continuous Evolution

Keep the codebase and `.sdlc/` governance aligned over time—never patch symptoms blindly or let specs rot.

## 1. Repro-First Bug Triage

1. **Reproduce first:** Write or run a minimal failing test or deterministic repro script proving the bug exists before editing production code.
2. **Isolate root cause:** Query `graphify-out/` (if available) or trace call paths to locate the broken invariant, boundary check, or state assumption.
3. **Check threat/spec impact:** Determine whether the defect exposed a missing `THR-*` abuse case or `SPEC-*` ambiguity.
4. **Fix & prove:** Implement the minimal fix, confirm the new regression test passes, and run full profile verification (`verify-profile.mjs`).

## 2. Spec & Architecture Drift Detection (`egm-drift-report`)

1. If upstream `egm-drift-report` is installed, run it against approved `ADR-*` / `SPEC-*` files; otherwise follow [references/drift-and-evolution.md](references/drift-and-evolution.md).
2. Invoke `arch-reviewer` to compare on-disk `ADR-*` / `SPEC-*` contracts against current symbols, configs, and tests.
3. Reconcile drift immediately: either update code to honor the approved invariant, or explicitly amend the `ADR-*` / `SPEC-*` / `THREAT-*` + Proof Checklist with maintainer review.

## 3. Continuous Evolution (Promote Every Recurring Mistake)

After any postmortem, security finding, or repeated review comment:
1. Record the root cause in `.sdlc/07_release_maintenance/output/POSTMORTEM-NNN.md` and `.sdlc/_shared/lessons-learned.md`.
2. **Promote the lesson into enforcement** (prefer deterministic checks over prose reminders):
   - *Rule:* Add a concise invariant to `.agents/rules/` or plugin `rules/`.
   - *Hook / Script:* Add a check to `scripts/hooks/pre-tool-guard.mjs`, `post-tool-check.mjs`, or `scripts/check-contracts.mjs`.
   - *Proof Check:* Add a permanent regression test or profile gate command to `.sdlc/profile.json`.
3. Re-run `npx github:The-Arabian-knights/AIToolbox check --plugin <plugin-dir> --strict` (when updating the plugin itself) and call `sdlc_check_traceability` / `--sdlc <repo>` (when updating project governance).

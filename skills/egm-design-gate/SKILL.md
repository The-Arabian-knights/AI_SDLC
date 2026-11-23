---
name: egm-design-gate
description: >-
  Run a no-code architecture design, trade-off analysis, and fresh-context review
  gate inspired by the Elephant-Goldfish Model (EGM) before writing production code.
  Use when designing new features, subsystems, refactors, or checking design-to-code drift.
---

# EGM No-Code Design & Architecture Gate

Prevent premature coding by separating **deep design exploration** ("elephant" memory on disk) from **fresh-context adversarial review** ("goldfish" clean-slate verification).

## Gate Rule

**Do NOT modify production code during this skill.** Emit only design/ADR artifacts under `.sdlc/02_architecture/output/` (or `docs/sdlc/architecture/` if `.sdlc/` is not initialized).

## Workflow

1. **Load context selectively:** Read `.sdlc/01_requirements/output/` for active `REQ-*` items and run `/graphify-context` on impacted components.
2. **Optional upstream EGM integration:** Read [references/egm-protocol.md](references/egm-protocol.md). If standalone `egm-brainstorm` / `egm-draft` / `egm-review` skills are installed in the workspace or user environment, chain them cleanly; otherwise execute the built-in 4-step protocol below.
3. **Brainstorm & Trade-offs:** Explore at least 2 viable architectural options, compare failure modes, coupling, performance, security, and operational complexity, and record why rejected options were ruled out.
4. **Draft Design / ADR (`ADR-NNN`):** Use [references/design-doc-template.md](references/design-doc-template.md) to define module boundaries, explicit invariants, data/control flow, error/rollback strategy, and impacted blast radius. Keep artifacts concise and decision-focused (target `<= 12 KB`; reference schemas rather than pasting boilerplate).
5. **Fresh-Context Review Pass:** Invoke the read-only `arch-reviewer` subagent (`invoke_subagent` with `TypeName: "arch-reviewer"`, clean isolated context). Pass ONLY the `REQ-*`, `ADR-*`, and relevant file paths—never conversation reasoning.
6. **Resolve Findings (Max 2 Automated Rounds):** Fix every `CRITICAL` or `HIGH` finding in the design doc and re-run `arch-reviewer` at most once (2 rounds max). Log `MEDIUM`/`LOW` items as non-blocking notes without blocking approval. If a `CRITICAL`/`HIGH` blocker remains after round 2, stop and escalate to the human maintainer instead of looping. Pause for the human check when architecture changes public APIs, schemas, or trust boundaries.

# Elephant-Goldfish Model (EGM) SDLC Protocol

The **Elephant-Goldfish Model** prevents confirmation bias and context rot by enforcing durable written designs on disk paired with clean-slate reviews.

## Phase Mapping

| EGM Stage | SDLC Equivalent | Action |
| --- | --- | --- |
| `egm-brainstorm` | Requirements + Trade-off Exploration | Clarify constraints, non-goals, blast radius, and >= 2 architectural alternatives |
| `egm-draft` | Architecture Decision (`ADR-NNN`) | Document boundaries, contracts, invariants, failure modes, and migration/rollback plan |
| `egm-review` | Fresh-Context Review (`arch-reviewer`) | Isolated subagent inspects artifacts cold with zero chat history to catch hidden assumptions and vague specs |
| `egm-drift-report` | Drift Audit (`/triage-and-evolve`) | Diff approved `ADR-*` / `SPEC-*` contracts against actual repository code and tests |

## Integrating Installed EGM Skills (Optional)

If the user's environment also installs standalone EGM skills (`egm-brainstorm`, `egm-draft`, `egm-review`, `egm-resolve`, `egm-drift-report`):
1. Run `egm-brainstorm` -> capture output into `.sdlc/02_architecture/output/`.
2. Run `egm-draft` -> ensure every section in `design-doc-template.md` (`ADR-*`, boundaries, invariants, alternatives) is present.
3. Run `egm-review` or invoke this plugin's `arch-reviewer` subagent so the fresh-context pass produces a recorded `APPROVED` verdict before Stage 03 (`Threat Model`) or Stage 04 (`Specification`).

If upstream EGM skills are not installed, this plugin's `/egm-design-gate`, `arch-reviewer`, and `/triage-and-evolve` implement the full protocol natively.

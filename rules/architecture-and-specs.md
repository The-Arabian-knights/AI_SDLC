---
trigger: glob
globs: "docs/sdlc/**/*.md, .sdlc/**/*.md, **/CONTEXT.md, **/ADR-*.md, **/SPEC-*.md, **/THREAT-*.md"
description: "Enforces ICM folder contracts, consistent REQ/ADR/THR/SPEC traceability IDs, and no-vague-spec standards in SDLC artifacts."
---

# Architecture, ICM Contracts & Spec Standards

1. **ICM Contract Discipline:** Every `.sdlc/` stage `CONTEXT.md` must declare `Inputs`, `Process`, `Outputs`, `Do NOT load`, and `Human check`. Never store run-specific drafts inside `_shared/` or `_templates/`.
2. **Stable Identifiers:** Assign sequential, cross-linked IDs across stages:
   - Requirements: `REQ-NNN`
   - Architecture Decisions: `ADR-NNN`
   - Threats & Mitigations: `THR-NNN`
   - Specifications: `SPEC-NNN`
3. **Required Design Fields:** Architecture docs and ADRs must state system boundaries, invariants, alternatives considered (with rejection rationale), and failure/rollback modes.
4. **Actionable Proof Section:** Every `SPEC-*` must include concrete verification commands, negative/abuse test cases, and measurable acceptance criteria—never generic "verify it works" placeholders.
5. **Fresh-Context Review:** Before approving an ADR or SPEC for implementation, run a fresh-context review pass via the `arch-reviewer` subagent (and `security-reviewer` when trust boundaries change).

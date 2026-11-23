# Architecture Design Record: ADR-NNN — <Title>

- **Status:** Proposed | In Review | Approved | Superseded
- **Requirement IDs:** `REQ-NNN`
- **Project Profile:** `web-enterprise | backend-api | mobile | desktop | game-engine`
- **Context Sources:** `graphify-out/` (`EXTRACTED` / `INFERRED`) or static search refs

## 1. Problem & Non-Goals

- **Goal:** What invariant or capability this design establishes.
- **Non-Goals:** Explicit exclusions preventing scope creep.

## 2. System Boundaries & Blast Radius

- **Components Touched:** Exact file/module paths and confidence tags (`EXTRACTED` vs `INFERRED`).
- **Boundaries Crossed:** Process, network, persistence, IPC, or privilege boundaries.
- **Public Contracts Changed:** APIs, schemas, events, CLI flags, or save formats.

## 3. Core Invariants

1. State invariants (e.g., idempotency, ordering, ownership, memory/frame budget).
2. Failure invariants (fail-fast rules, transaction/rollback boundaries, degraded behavior).

## 4. Alternatives Considered

| Option | Pros | Cons / Risks | Decision & Rationale |
| --- | --- | --- | --- |
| Option A (Chosen) | ... | ... | Chosen because ... |
| Option B (Rejected) | ... | ... | Rejected because ... |

## 5. Fresh-Context Review Sign-Off

- **Reviewer:** `arch-reviewer`
- **Verdict:** `APPROVED | REVISE | BLOCKED`
- **Resolved Findings:** Summary of findings fixed prior to approval.
- **Human Gate Sign-Off:** Confirmed by maintainer / author (date).

---
name: spec-and-proof
description: >-
  Author traceable implementation specifications (`SPEC-NNN`) with explicit
  module contracts and a mandatory Proof Checklist, and verify completion proof
  via `proof-auditor` and `.sdlc/06_verification/output/proof-status.json`.
---

# Traceable Specifications & Verifiable Proof

Bridge approved designs (`ADR-*`) and threat models (`THR-*`) to unambiguous, testable implementation specifications and executable proof.

## Stage 04 — Authoring a Specification (`SPEC-NNN`)

1. **Read upstream stage outputs:** Load only the active `REQ-*`, approved `ADR-*`, and mitigated `THR-*` artifacts from `.sdlc/01_requirements/output/`, `02_architecture/output/`, and `03_threat_model/output/`.
2. **Draft `SPEC-NNN`:** Follow [references/spec-template.md](references/spec-template.md) and write into `.sdlc/04_specification/output/SPEC-NNN-<slug>.md` (keep concise and contract-focused, target `<= 12 KB`).
3. **Define exact contracts:** State input/output schemas, trust-boundary validation rules, explicit error types/codes, state transitions, and observability hooks (structured logs/metrics/traces).
4. **Mandate a Proof Checklist:** Define every `PROOF-NNN` check required before done using **portable commands** (never hardcoded user-home paths like `C:/Users/...` or `/home/...`). Activate `.sdlc/06_verification/output/proof-status.json` per [references/proof-contract.md](references/proof-contract.md).

## Stage 06 — Proof Verification Before Completion

1. **Run every Proof item:** Execute baseline + profile checks (`npx github:The-Arabian-knights/AIToolbox verify --target <repo> --write-proof`, or `node ~/.gemini/config/plugins/universal-sdlc/scripts/verify-profile.mjs --target <repo> --write-proof`) and spec-specific test commands.
2. **Update `proof-status.json`:** Record exact exit status, executed command, scope, and observed output summary for each `PROOF-NNN`.
3. **Audit via `proof-auditor`:** Invoke the read-only `proof-auditor` subagent to confirm `REQ -> ADR -> THR -> SPEC -> PROOF` completeness and ensure no skipped or relaxed assertions.
4. **Contract gate:** Call `sdlc_check_traceability` / `sdlc_status` from `sdlc-ledger` MCP (or run `npx github:The-Arabian-knights/AIToolbox check --sdlc <repo>`) and resolve any gaps before declaring work complete.

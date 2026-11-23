# Specification: SPEC-NNN — <Title>

- **Status:** Draft | Ready | Implemented | Verified
- **Traceability:** `REQ-NNN` -> `ADR-NNN` -> `THR-NNN`
- **Target Profile:** `web-enterprise | backend-api | mobile | desktop | game-engine`

## 1. Scope & Exact Module Contracts

| Component / Symbol | Responsibility | Inputs & Validation | Outputs & Error Contract |
| --- | --- | --- | --- |
| `path/to/module` | ... | Schema / bounds / auth checks | Return shape + explicit errors |

## 2. State Transitions & Side Effects

- Persistence/schema changes and backward-compatible migration/rollback steps.
- Concurrency, idempotency keys, resource/memory caps, and cleanup guarantees.

## 3. Observability & Error-Handling Hooks

- Structured log events emitted at failure/security boundaries (no secrets/PII).
- Telemetry/metrics/crash-reporting counters and failure alert conditions.

## 4. Mandatory Proof Checklist

| Proof ID | Type | Threat / Req Ref | Exact Command or Test Case | Pass Criterion |
| --- | --- | --- | --- | --- |
| `PROOF-001` | Unit / Integration | `REQ-001` | `...` | Exit 0, deterministic assertions pass |
| `PROOF-002` | Negative / Abuse | `THR-001` | `...` | Unauthorized/malformed input rejected cleanly |
| `PROOF-003` | Profile Gate | `SPEC-001` | `node scripts/verify-profile.mjs ...` | Baseline + profile gates pass or explicit waiver |

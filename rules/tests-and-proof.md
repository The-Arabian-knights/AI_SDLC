---
trigger: glob
globs: "**/*test*, **/*spec*, **/tests/**/*, **/__tests__/**/*"
description: "Verification standards requiring repro-first regression tests, negative/abuse cases, and deterministic proof execution."
---

# Tests & Proof Standards

1. **Reproduce Before Fixing:** For bug fixes, write or run a failing test/repro case confirming the defect before applying the implementation fix.
2. **Cover Failure & Abuse Paths:** Include boundary inputs, malformed payloads, unauthorized callers, and concurrency/error paths mapped to `THR-*` and `SPEC-*` IDs—not just happy paths.
3. **Deterministic Assertions:** Avoid wall-clock sleeps, external live network dependencies, or order-dependent state in unit/integration tests; use explicit fakes, clocks, or fixtures.
4. **No Relaxed Assertions:** Never delete, skip, or weaken assertions to make a failing suite pass; fix the underlying defect or update the spec via the governance gate first.
5. **Update Proof Status:** Record exact executed commands and results in `.sdlc/06_verification/output/proof-status.json`.

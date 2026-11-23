---
trigger: always_on
description: "Core SDLC governance invariants: traceability, zero-trust validation, fail-fast error handling, and verifiable proof before completion."
---

# SDLC Governance Invariants

1. **No Silent Assumptions:** When requirements, trust boundaries, or invariants are ambiguous, surface the ambiguity in stage artifacts or ask the user before writing production code.
2. **Design Before Implementation:** For any change affecting architecture, data models, auth/authz, network boundaries, or cross-module contracts, pass `/egm-design-gate` and `/threat-and-verify` before editing production files.
3. **Zero-Trust Boundaries:** Validate and sanitize all external, IPC, network, file, and client inputs at trust boundaries. Reject invalid states early with explicit, structured error paths; never swallow errors silently.
4. **Secret Hygiene:** Never hardcode API keys, tokens, private keys, or credentials. Read secrets from environment variables or approved secret stores.
5. **Traceable Specs & Proof:** Every non-trivial change must map to a `SPEC-*` artifact containing an explicit **Proof Checklist** (exact commands, test cases, and acceptance criteria) verified before reporting completion.
6. **Honest Reporting:** Report only directly observed file paths, symbol names, and post-edit command outputs. Never infer passing tests from unrun checks or stale runs.

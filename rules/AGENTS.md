# Universal AI SDLC Router

Enforce the 7-stage engineering pipeline:
`Requirements -> Architecture -> Threat Model -> Specification -> Implementation -> Verification -> Release & Maintenance`

## Stage & Capability Routing

| Stage / Need | Skill | Reviewer / Script |
| --- | --- | --- |
| Onboard repo & ICM layout | `/sdlc-init` | `sdlc_init` MCP / `scripts/init-sdlc.mjs` |
| Configure modules & add-ons | `/sdlc-addons` | `sdlc_list_addons` / `scripts/cli.mjs addons` |
| Codebase discovery & blast radius | `/graphify-context` | `graphify-out/` or targeted grep |
| No-code design & trade-off gate | `/egm-design-gate` | `arch-reviewer` subagent |
| Threat model & security gates | `/threat-and-verify` | `security-reviewer`, `scripts/verify-profile.mjs` |
| Traceable specs & Proof checklist | `/spec-and-proof` | `proof-auditor`, `proof-status.json` |
| Bug repro, drift & rule promotion | `/triage-and-evolve` | `scripts/check-contracts.mjs` |

## Core Invariants

1. **Discover before editing:** Check `.sdlc/profile.json` and query `graphify-out/` first when available; preserve `EXTRACTED` vs `INFERRED` vs `AMBIGUOUS` provenance.
2. **Design & threat gate before code:** Non-trivial work completes Architecture + Threat Model + Specification (`Proof Checklist`) before modifying production code.
3. **Traceability end to end:** Link `REQ-* -> ADR-* -> THR-* -> SPEC-* -> CODE -> PROOF` across `.sdlc/` artifacts.
4. **ICM factory vs. product separation:** Keep stable rules/templates in `.sdlc/_shared/` and `_templates/`; emit per-run artifacts in numbered stage `output/` folders.
5. **Zero-trust & no hardcoded secrets:** Validate trust boundaries, permissions, and inputs; never commit secrets or disable security gates silently.
6. **Verifiable proof before done:** Run required baseline + profile checks and record evidence in `.sdlc/06_verification/output/proof-status.json`.

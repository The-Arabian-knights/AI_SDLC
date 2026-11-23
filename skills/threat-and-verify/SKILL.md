---
name: threat-and-verify
description: >-
  Conduct lightweight or formal threat modeling before coding and run
  profile-scaled verification gates (`web-enterprise`, `backend-api`, `mobile`,
  `desktop`, `game-engine`). Use before implementing trust-boundary changes or verifying releases.
---

# Threat Modeling & Profile-Adaptive Verification

Enforce **security by design** prior to implementation and **profile-scaled verification** before release.

## Phase A — Pre-Code Threat Model (Stage 03)

1. **Assess scale:** Use a **lightweight threat model** (single-feature/bug change touching local logic) or **formal threat model** (new auth, external API, multi-tenant data, payments, IPC, or infra change).
2. **Draft `THR-*` artifacts:** Use [references/threat-model-template.md](references/threat-model-template.md) and write into `.sdlc/03_threat_model/output/THREAT-NNN-<slug>.md`. Cover:
   - Protected assets & data sensitivity / secret stores
   - Trust boundaries & entry points
   - Authentication, authorization, and permission checks
   - Injection / input validation & path/deserialization safety
   - Failure, abuse, and denial-of-service cases
3. **Audit via `security-reviewer`:** Invoke the read-only `security-reviewer` subagent (`invoke_subagent` with `TypeName: "security-reviewer"`) to verify mitigations and extract required negative test cases into Stage 04 (`SPEC-*`).

## Phase B — Profile-Based Verification Gates (Stage 06)

1. **Consult matrix:** Read [references/verification-matrix.md](references/verification-matrix.md) for Baseline Gates + Profile-Specific Gates matching `.sdlc/profile.json`.
2. **Inspect plan (dry-run):**
   ```bash
   npx github:The-Arabian-knights/AIToolbox verify --target <repo-path> --dry-run
   ```
   *(Or run `node ~/.gemini/config/plugins/universal-sdlc/scripts/verify-profile.mjs --target <repo-path> --dry-run`.)*
3. **Execute verification gates:**
   ```bash
   npx github:The-Arabian-knights/AIToolbox verify --target <repo-path> --write-proof
   ```
4. **Enforce honesty:** Report missing external scanners (`gitleaks`, `trufflehog`, `semgrep`, `trivy`, `zap`) explicitly as `skipped`—never fabricate security passes.

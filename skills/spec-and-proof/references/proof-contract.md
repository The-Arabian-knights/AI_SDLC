# Proof Contract & `proof-status.json` Schema

The `Stop` lifecycle hook (`scripts/hooks/stop-proof-gate.mjs`) inspects `.sdlc/06_verification/output/proof-status.json` in the active workspace to block premature termination while an implementation task has incomplete required proof checks.

## Schema

```json
{
  "schemaVersion": "1.0.0",
  "active": true,
  "enforceOnStop": true,
  "specId": "SPEC-001",
  "updatedAt": "2026-11-22T10:00:00Z",
  "items": [
    {
      "id": "PROOF-001",
      "description": "Unit and negative boundary tests for auth middleware",
      "command": "npm test -- auth.spec.ts",
      "required": true,
      "status": "passed",
      "evidence": "14 passed, 0 failed, 0 skipped after final edit"
    },
    {
      "id": "PROOF-002",
      "description": "Profile verification gate (lint, typecheck, secret scan)",
      "command": "npx github:The-Arabian-knights/AIToolbox verify --target . --write-proof",
      "required": true,
      "status": "pending",
      "evidence": ""
    }
  ]
}
```

## Field Rules

- `active` (`boolean`): Set `true` when Stage 05 (`Implementation`) begins for a spec; set `false` when idle between tasks or after verified release.
- `enforceOnStop` (`boolean`, default `true`): Allows emergency override if set `false` with documented justification.
- `items[].command`: Must be portable across developer machines and OSes (`npx github:The-Arabian-knights/AIToolbox verify --target . --write-proof`, `universal-sdlc verify --write-proof`, or repo-local scripts). **Never** hardcode workstation-specific home paths (`C:/Users/...`, `/Users/...`, `/home/...`).
- `items[].status`: One of `"pending" | "passed" | "failed" | "skipped"`. Any `required !== false` item whose status is not `"passed"` causes `stop-proof-gate.mjs` to return `{"decision": "continue", ...}` once per turn (`continuationActive` prevents infinite loops).
- Never mark `"passed"` without an executed command and observed `evidence` after the last code edit.

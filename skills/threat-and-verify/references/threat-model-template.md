# Threat Model: THREAT-NNN — <Title>

- **Tier:** Lightweight | Formal
- **Linked Artifacts:** `REQ-NNN`, `ADR-NNN`
- **Target Profile:** `web-enterprise | backend-api | mobile | desktop | game-engine`

## 1. Assets & Data Sensitivity

| Asset | Sensitivity | Storage / Transit Protection |
| --- | --- | --- |
| Credentials / Keys / PII | Restricted | Secret store / env var / TLS / redacted logs |

## 2. Trust Boundaries & Entry Points

- **Untrusted Inputs:** HTTP/GraphQL/gRPC payloads, UI forms, CLI flags, IPC messages, save files, asset bundles.
- **Privilege Transitions:** Auth middleware, tenant scoping, DB row ownership, sandbox/IPC bridge, OS permissions.

## 3. Threat & Mitigation Register

| Threat ID | Category (STRIDE) | Attack / Abuse Scenario | Mitigation & Control | Required Proof / Negative Test |
| --- | --- | --- | --- | --- |
| `THR-001` | Elevation of Privilege | Missing ownership check on resource ID | Explicit tenant/owner guard in service layer | Unauthorized caller receives 403/denied |
| `THR-002` | Tampering / Injection | Unvalidated external input or path traversal | Schema allowlist + canonical path containment | Malformed/traversal payload rejected (400) |
| `THR-003` | Info Disclosure | Secrets or stack traces leaked in logs/errors | Structured error redaction + secret scan | Log assertion + `gitleaks`/`trufflehog` clean |
| `THR-004` | Denial of Service / Fail-Open | Unbounded payload/loop or silent exception swallow | Size/rate caps + fail-closed error path | Oversized/fault test trips bounded failure |

## 4. Security Reviewer Sign-Off

- **Reviewer:** `security-reviewer`
- **Verdict:** `APPROVED | REVISE | BLOCKED`
- **Unresolved Waivers (if any):** Explicit owner + expiry date.

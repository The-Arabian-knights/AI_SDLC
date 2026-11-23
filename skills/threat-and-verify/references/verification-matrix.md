# Baseline & Profile-Specific Verification Matrix

## 1. Baseline Gates (Mandatory Across Every Profile)

| Gate | Purpose | Typical Tooling / Hooks |
| --- | --- | --- |
| **Secret Scanning** | Detect leaked keys, tokens, private certs | `gitleaks`, `trufflehog`, built-in `pre-tool-guard.mjs` |
| **Dependency & Vuln Audit** | Flag vulnerable or unapproved dependencies | `npm audit`, `pip-audit`, `cargo audit`, `govulncheck`, `trivy fs` |
| **Static Analysis & Typecheck** | Catch type mismatches, unsafe constructs, lint violations | ESLint, `tsc --noEmit`, `ruff`/`mypy`, `clippy`, `golangci-lint` |
| **Unit & Integration Tests** | Verify domain invariants, contracts, and negative/abuse cases | Repo test runner mapped to `SPEC-*` Proof Checklist |
| **Observability & Error Hooks** | Confirm structured error paths, health/log redaction, telemetry | Spec checks + runtime/smoke verification |

## 2. Profile-Specific Gates

| Profile | SAST / Container / DAST | Functional / Platform / Integrity Checks |
| --- | --- | --- |
| `web-enterprise` | `semgrep` / `codeql`, `trivy` (fs/image), `owasp-zap` baseline/API scan | API/schema contract tests, browser E2E, CSP/CORS/cookie & a11y/CWV checks |
| `backend-api` | `semgrep` / `codeql`, `trivy` (image/deps), `owasp-zap` / API fuzzer | OpenAPI/Protobuf contract tests, DB migration rollback, idempotency/concurrency tests |
| `mobile` | Mobile static/secret scan (`semgrep`), dependency lock verification | `flutter analyze`/`test`, `gradle`/`xcodebuild` harness, permission & ATS/cleartext audit, crash/telemetry hooks |
| `desktop` | SAST (`semgrep`), dependency audit, Electron fuses / code-signing check | IPC validation & sandbox audit, native/desktop test harness, memory/handle leak & crash/telemetry hooks |
| `game-engine` | Static/memory-safety analysis (`clang-tidy`, `clippy`, engine analyzer) | Headless build/sim tests, frame-time & memory budget checks, asset/save-state & network state-integrity checks, crash/telemetry hooks |

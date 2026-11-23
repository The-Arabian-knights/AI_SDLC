# Project Profiles & Gate Scaling

All profiles inherit the **Baseline Gates** and add target-specific verification gates defined in `scripts/lib/profiles.mjs`.

## Supported Profiles

| Profile | Target Systems | Key Profile-Specific Gates & Focus |
| --- | --- | --- |
| `web-enterprise` | SaaS web apps, SPAs, SSR/enterprise portals, BFFs | SAST (`semgrep`/`codeql`), container/dep audit (`trivy`), DAST (`owasp-zap`), contract & browser E2E tests, a11y/CWV sanity, CSP/CSRF/session checks |
| `backend-api` | REST/GraphQL/gRPC services, workers, distributed systems | SAST (`semgrep`/`codeql`), container/dep audit (`trivy`), API security/DAST (`owasp-zap`), OpenAPI/proto contract tests, DB migration rollback & concurrency tests |
| `mobile` | iOS, Android, Flutter, React Native apps | Platform build/test harness (`flutter`/`gradle`/`xcodebuild`), manifest permissions & ATS/cleartext checks, offline/lifecycle/deep-link checks, crash & telemetry hooks |
| `desktop` | Electron, Tauri, Qt, WinUI, macOS/Linux native apps | Native/bundle build & Electron fuses/sandbox checks, IPC trust-boundary audit, memory/handle leak checks, crash & telemetry hooks |
| `game-engine` | Unity, Unreal, Godot, Bevy, custom C++/Rust/WebGL engines | Headless build/simulation test harness, frame-time & memory budget checks, asset/save-state & multiplayer state-integrity checks, crash/telemetry hooks |

## `.sdlc/profile.json` Schema

```json
{
  "schemaVersion": "1.0.0",
  "projectName": "my-service",
  "profile": "backend-api",
  "strictDesignGate": false,
  "enforceProofOnStop": true,
  "commands": {
    "lint": "",
    "typecheck": "",
    "test": "",
    "integrationTest": "",
    "build": "",
    "secretScan": "gitleaks detect --no-git -s .",
    "depAudit": "",
    "sast": "",
    "containerScan": "",
    "dast": "",
    "contractTest": "",
    "e2eTest": "",
    "platformCheck": "",
    "performanceCheck": ""
  },
  "fastChecks": [
    {
      "extensions": [".ts", ".tsx", ".js", ".mjs"],
      "command": "",
      "timeoutMs": 8000
    }
  ],
  "observability": {
    "structuredLogging": true,
    "errorTrackingHook": true,
    "telemetrySchemaRef": ".sdlc/_shared/observability-standards.md"
  }
}
```

Leave unconfigured commands as `""` until wired to the repo's tooling. `scripts/verify-profile.mjs` auto-detects installed security CLIs (`gitleaks`, `trufflehog`, `semgrep`, `trivy`) and reports missing tools honestly as `skipped` instead of claiming passes.

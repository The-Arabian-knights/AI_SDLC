---
trigger: model_decision
description: "Apply when selecting or running verification, SAST/DAST, dependency, or platform-specific quality gates for a project profile."
---

# Profile-Adaptive Verification Policy

Select and scale verification gates according to `.sdlc/profile.json` (`web-enterprise`, `backend-api`, `mobile`, `desktop`, or `game-engine`):

1. **Baseline Gates (All Profiles):** Secret scanning (`gitleaks` / `trufflehog`), dependency & license/vulnerability audit, static analysis/lint/typecheck, unit & integration tests, and structured error/observability checks.
2. **Profile-Scaled Gates:**
   - `web-enterprise`: SAST (`semgrep` / `codeql`), container/dep scan (`trivy`), API/DAST checks (`owasp-zap`), contract & browser/E2E tests, accessibility & web-vitals sanity.
   - `backend-api`: SAST (`semgrep` / `codeql`), container/dep scan (`trivy`), DAST/API fuzzing (`owasp-zap`), OpenAPI/gRPC contract tests, migration rollback & concurrency tests.
   - `mobile`: Platform build/lint/test harness (`flutter`, `xcodebuild`, `gradle`), permission/manifest & ATS/network-security checks, offline/lifecycle & crash/telemetry hooks.
   - `desktop`: Native/Electron build & code-signing/fuse checks, IPC boundary & sandboxing audit, memory/resource leak checks, crash/telemetry hooks.
   - `game-engine`: Engine build/headless test harness, deterministic frame-time/memory budget checks, asset/save-state integrity & anti-tamper checks, telemetry/crash hooks.
3. **Graceful Degradation:** When an external scanner is absent locally, report it explicitly as `skipped (tool unavailable)` in `proof-status.json` rather than claiming it passed.

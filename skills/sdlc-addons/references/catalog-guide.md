# Curated SDLC Add-ons & Update-Safe Tweaks

The authoritative catalog lives at [../../../catalog/addons.json](../../../catalog/addons.json).

## Built-in Modules (Toggleable Except Core)

- **`core-icm` (Required):** 7-stage `.sdlc/` governance, `/sdlc-init`, `/spec-and-proof`, `/sdlc-addons`, `proof-auditor`, and `sdlc-ledger` MCP server.
- **`egm-design-gate`:** No-code design & trade-off gate plus fresh-context `arch-reviewer` before coding.
- **`graphify-context`:** Queries `graphify-out/` knowledge graphs first with `EXTRACTED` / `INFERRED` tags and static fallback.
- **`threat-and-verify`:** Pre-code threat modeling, `security-reviewer`, and profile-scaled verification gates.
- **`triage-and-evolve`:** Repro-first debugging, spec-vs-code drift checks, and promotion of recurring findings into permanent checks.
- **`lifecycle-hooks`:** `SessionStart`, `PreToolUse` (destructive/secret guard), `PostToolUse` audit log, and `Stop` proof gate.

## Optional Upstream Companion Tools

- **`companion-graphify` (`Apache-2.0`):** External Python AST/semantic graph CLI (`uv tool install graphifyy`).
- **`companion-egm` (`Apache-2.0`):** Google's full Elephant-Goldfish Model plugin alongside Universal SDLC.
- **`companion-icm-architect` (`MIT`):** Jake Van Clief's standalone ICM workspace & vault architect skill.
- **`companion-gitleaks` (`MIT`):** Git history and working-tree secret scanner.
- **`companion-semgrep` (`LGPL-2.1`):** Multi-language SAST rule scanner.
- **`companion-trivy` (`Apache-2.0`):** Dependency, container, and IaC vulnerability scanner.

## Update-Safe Tweaks (`universal-sdlc-overrides/`)

Instead of editing bundled plugin files directly (which get replaced on update), store team/user rules in `universal-sdlc-overrides/rules/*.md` via `sdlc_tweak_addon` or `addons tweak --create-rule <name>`. They automatically sync into `rules/custom-*.md` on every `addons sync` or `install --force`.

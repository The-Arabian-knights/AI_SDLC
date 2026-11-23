---
name: sdlc-init
description: >-
  Initialize stack-agnostic ICM SDLC governance (`.sdlc/`) and select a project
  profile (`web-enterprise`, `backend-api`, `mobile`, `desktop`, `game-engine`).
  Use when onboarding a repository to Universal AI SDLC or auditing `.sdlc/` setup.
---

# SDLC Initialization & Project Profile Setup

Onboard any repository into an auditable **Interpretable Context Methodology (ICM)** SDLC workspace without coupling to a specific programming language or framework.

## Steps

1. **Inspect target workspace:** Check whether `.sdlc/profile.json` already exists. Never overwrite existing stage `output/` artifacts unless the user explicitly requests `--force`.
2. **Select project profile:** Read [references/profiles.md](references/profiles.md) and choose the matching profile (`web-enterprise`, `backend-api`, `mobile`, `desktop`, or `game-engine`). Ask the user only if the repo is genuinely ambiguous (e.g., monorepo spanning mobile + backend).
3. **Review ICM layout:** Read [references/icm-layout.md](references/icm-layout.md) to understand factory (`_shared/`, `_templates/`) vs. product (`01_requirements/` through `07_release_maintenance/`) separation.
4. **Run deterministic bootstrapper:** Call the `sdlc-ledger` MCP tool `sdlc_init` (`workspacePath`, `profile`, optional `projectName`, `strictDesignGate`, `force`). If the MCP server is unavailable, run via CLI in the target repo:
   ```bash
   npx github:The-Arabian-knights/AIToolbox init --profile <profile> --name <project-name>
   ```
   (Or run `node ~/.gemini/config/plugins/universal-sdlc/scripts/init-sdlc.mjs --target <repo-path> --profile <profile> --name <project-name>`). Add `--strict-design-gate` (or `strictDesignGate: true`) when `PreToolUse` should ask for confirmation before production edits made without an ADR/threat artifact.
5. **Configure stack commands:** Populate `.sdlc/profile.json` `commands` (`lint`, `typecheck`, `test`, `build`, `sast`, `depAudit`, etc.) and optional `fastChecks` matching the repo's toolchain (e.g., `npm`, `pytest`, `cargo`, `go`, `flutter`, `dotnet`).
6. **Verify contracts:** Call the `sdlc_status` / `sdlc_check_traceability` MCP tools (or run `npx github:The-Arabian-knights/AIToolbox check --sdlc <repo-path>`). Confirm `ok: true` / exit code `0` and summarize the active profile, stage directories, and enabled gates.

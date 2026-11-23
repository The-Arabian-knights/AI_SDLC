# Universal AI SDLC (`universal-sdlc`)

A lightweight, stack-agnostic **Universal AI SDLC Plugin** for **Google Antigravity** (App, CLI, and IDE). Installs into its own isolated plugin folder (`~/.gemini/config/plugins/universal-sdlc/` or `.agents/plugins/universal-sdlc/`) and creates only a single `.sdlc/` governance folder per onboarded project—leaving your application source code clean.

## Quick Install (Interactive Setup Wizard)

Run the interactive setup wizard with Node.js >= 18. It walks through the 7-stage SDLC flow, explains **each module and optional companion tool's SDLC role and benefit**, and lets you choose exactly what to include or exclude:

```bash
# Interactive wizard (installs into ~/.gemini/config/plugins/universal-sdlc by default)
npx github:The-Arabian-knights/AIToolbox install

# Non-interactive defaults (or pin inside a team repo's .agents/plugins/universal-sdlc)
npx github:The-Arabian-knights/AIToolbox install --yes
npx github:The-Arabian-knights/AIToolbox install --scope workspace --exclude graphify-context,lifecycle-hooks

# Or install directly via Antigravity CLI
agy plugin install https://github.com/The-Arabian-knights/AIToolbox
```

## Launch in Any Project

Open any repository (web, API, mobile, desktop, or game) in Antigravity and type `/sdlc-init` (uses the `sdlc_init` MCP tool), or run from that project's root:

```bash
npx github:The-Arabian-knights/AIToolbox init --profile backend-api --name my-service
```

Supported profiles: `web-enterprise`, `backend-api`, `mobile`, `desktop`, `game-engine`. Add `--strict-design-gate` to require confirmation in `PreToolUse` before editing production code without an `ADR-*` and `THREAT-*` artifact.

## Add, Remove & Customize Add-ons (Update-Safe)

Manage built-in modules, upstream companion tools, custom plugins/skills, or team overrides anytime—in chat with `/sdlc-addons` or in your terminal:

```bash
# Inspect all modules, companion tools, roles, benefits, and install status
npx github:The-Arabian-knights/AIToolbox addons list

# Enable/install or remove any optional module, companion, or custom HTTPS plugin/skill
npx github:The-Arabian-knights/AIToolbox addons add companion-egm
npx github:The-Arabian-knights/AIToolbox addons add https://github.com/org/custom-skill --kind skill --role "Domain checks" --benefit "Adds custom team checks"
npx github:The-Arabian-knights/AIToolbox addons remove lifecycle-hooks

# Create update-safe custom rules in universal-sdlc-overrides/ (survive `install --force`)
npx github:The-Arabian-knights/AIToolbox addons tweak --create-rule team-clarity --description "Explain trade-offs in plain language" --body "Always summarize trade-offs before requesting approval."
```

## How the 7-Stage SDLC Works

`Requirements -> Architecture -> Threat Model -> Specification -> Implementation -> Verification -> Release & Maintenance`

| Module / Companion (`catalog/addons.json`) | SDLC Role | Benefit to You |
| --- | --- | --- |
| **`core-icm`** *(Required)* | `.sdlc/` stages, traceable specs, `proof-auditor`, `sdlc-ledger` MCP, `/sdlc-addons` | Single auditable on-disk truth from `REQ` to `PROOF` |
| **`egm-design-gate`** *(Optional)* | No-code design gate + fresh-context `arch-reviewer` | Catches hidden assumptions and vague specs before coding |
| **`graphify-context`** *(Optional)* | Queries `graphify-out/` first with static fallback | Maps blast radius and dependencies with fewer wasted tokens |
| **`threat-and-verify`** *(Optional)* | Pre-code threat models, `security-reviewer`, profile gates | Catches auth/secret/injection gaps and scales checks to your stack |
| **`triage-and-evolve`** *(Optional)* | Repro-first fixes, drift audit, rule promotion | Turns bugs and review findings into permanent guardrails |
| **`lifecycle-hooks`** *(Optional)* | `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` | Blocks destructive commands/secrets and incomplete stops |
| **`companion-graphify`** *(External CLI)* | `uv tool install graphifyy` (`Apache-2.0`) | Builds structural AST + semantic graphs for larger repos |
| **`companion-egm`** *(Upstream Plugin)* | Google's standalone EGM suite (`Apache-2.0`) | Adds multi-critic review loops alongside Universal SDLC |
| **`companion-icm-architect`** *(Upstream Skill)* | Jake Van Clief's standalone ICM skill (`MIT`) | Restructures messy docs/vaults into walkable ICM workspaces |
| **`companion-gitleaks` / `semgrep` / `trivy`** | External secret, SAST & dep/container scanners | Auto-detected by `verify-profile.mjs` when installed on `PATH` |

## Bundled Components & Validation

- **Rules (`rules/`):** `AGENTS.md` (always-on router), `sdlc-governance.md`, `architecture-and-specs.md`, `security-and-secrets.md`, `tests-and-proof.md`, `profile-adaptive-verification.md`.
- **Skills (`skills/`):** `/sdlc-init`, `/sdlc-addons`, `/graphify-context`, `/egm-design-gate`, `/spec-and-proof`, `/threat-and-verify`, `/triage-and-evolve`.
- **Read-Only Subagents (`agents/`):** `arch-reviewer`, `security-reviewer`, `proof-auditor` (`commandExecutionPolicy: off`, isolated context).
- **MCP Server (`mcp_config.json`):** `sdlc-ledger` (`sdlc_init`, `sdlc_status`, `sdlc_check_traceability`, `sdlc_list_profiles`, `sdlc_list_addons`, `sdlc_tweak_addon`).

```bash
agy plugin validate --strict .
node scripts/check-contracts.mjs --plugin . --strict
```

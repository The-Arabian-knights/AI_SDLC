---
name: sdlc-addons
description: >-
  Walk users through the 7-stage Universal SDLC, explain each module and
  companion tool's role and benefit, include or exclude components, add/remove
  plugins, and create update-safe customization overrides.
---

# SDLC Add-on & Customization Manager

Help the user understand how Universal AI SDLC works and tailor which modules, companion tools, and custom plugins or rules are active—without cluttering their application folders.

## Workflow

1. **Inspect current installation & catalog:** Call `sdlc_list_addons` from the `sdlc-ledger` MCP server (or inspect [references/catalog-guide.md](references/catalog-guide.md)).
2. **Present the plain-English SDLC overview:**
   - Explain the 7-stage pipeline: `Requirements -> Architecture -> Threat Model -> Specification -> Implementation -> Verification -> Release & Maintenance`.
   - Confirm isolation: plugin files live in `~/.gemini/config/plugins/universal-sdlc/` (or `.agents/plugins/universal-sdlc/`), user tweaks live in `universal-sdlc-overrides/`, and target repos only get `.sdlc/`.
3. **Explain each module & tool with Role + Benefit before asking:**
   - For every optional built-in module and companion tool, state **what SDLC stage it serves** and **how it benefits the user** in plain language.
   - Ask the user what they want to **keep**, **exclude**, **install**, **remove**, or **tweak** (clear up ambiguities rather than guessing).
4. **Apply changes cleanly:**
   - **Include / Exclude / Add / Remove modules or plugins:** Guide or execute via `npx github:The-Arabian-knights/AIToolbox addons add <id-or-https-url>` or `addons remove <id>` (always test external installs with `--dry-run` first if unsure).
   - **Tweak explanations, terminology, or team rules safely:** Call `sdlc_tweak_addon` (writes into `universal-sdlc-overrides/rules/` and syncs `rules/custom-*.md` so customizations survive every future plugin upgrade).
5. **Confirm integrity:** Re-run `sdlc_list_addons` (or `npx github:The-Arabian-knights/AIToolbox check --plugin <install-dir> --strict`) to verify zero errors and list active modules and synced override rules.

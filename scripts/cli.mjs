#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { auditSdlcWorkspace, validatePluginDir } from "./check-contracts.mjs";
import { initSdlcWorkspace } from "./init-sdlc.mjs";
import {
  createOverrideRule,
  ensureOverridesDir,
  installCompanionOrCustom,
  installModularPlugin,
  listAddonStatus,
  loadCatalog,
  removeAddon,
  resolveInstallLayout,
  syncOverrides
} from "./lib/addons.mjs";
import { PROFILES } from "./lib/profiles.mjs";

const PLUGIN_SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function printHelp() {
  console.log(`Universal AI SDLC CLI

Usage:
  universal-sdlc install [--scope global|workspace] [--dest <dir>] [--overrides-dir <dir>] [--include <csv>] [--exclude <csv>] [--yes] [--interactive] [--force] [--dry-run]
  universal-sdlc addons list [--scope global|workspace] [--dest <dir>] [--overrides-dir <dir>] [--json]
  universal-sdlc addons add <id-or-https-url> [--kind plugin|skill] [--name <name>] [--role <text>] [--benefit <text>] [--scope ...] [--dest <dir>] [--overrides-dir <dir>] [--dry-run] [--execute]
  universal-sdlc addons remove <id> [--scope ...] [--dest <dir>] [--overrides-dir <dir>] [--dry-run]
  universal-sdlc addons tweak [--create-rule <name>] [--trigger <mode>] [--description <text>] [--body <text>] [--scope ...] [--dest <dir>] [--overrides-dir <dir>]
  universal-sdlc addons sync [--scope ...] [--dest <dir>] [--overrides-dir <dir>]
  universal-sdlc init --profile <name> [--target <dir>] [--name <project>] [--strict-design-gate] [--force]
  universal-sdlc check [--plugin <dir> [--strict] | --sdlc <dir>] [--json]
  universal-sdlc verify [--target <dir>] [--profile <name>] [--dry-run] [--strict] [--write-proof] [--json]

Profiles: ${Object.keys(PROFILES).join(" | ")}
`);
}

function parseCsvFlag(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function printSdlcOverview(catalog) {
  console.log("\n=== Universal AI SDLC — Overview ===");
  console.log(`Pipeline: ${catalog.sdlcOverview.pipeline}`);
  console.log(`${catalog.sdlcOverview.summary}`);
  console.log(`Plugin folder:   ${catalog.sdlcOverview.isolation.globalPluginDir} (or ${catalog.sdlcOverview.isolation.workspacePluginDir})`);
  console.log(`Overrides folder: ${catalog.sdlcOverview.isolation.overridesDir}`);
  console.log(`Per-project data: ${catalog.sdlcOverview.isolation.projectStateDir}\n`);
}

async function createPromptSession() {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return {
      async ask(question, defaultValue = "") {
        try {
          const answer = await rl.question(question);
          return answer.trim() || defaultValue;
        } catch {
          return defaultValue;
        }
      },
      close() {
        rl.close();
      }
    };
  }

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const lines = Buffer.concat(chunks).toString("utf8").replace(/\r\n/g, "\n").split("\n");
  let idx = 0;
  return {
    async ask(question, defaultValue = "") {
      process.stdout.write(question);
      const val = idx < lines.length ? lines[idx++].trim() : "";
      process.stdout.write(`${val || defaultValue}\n`);
      return val || defaultValue;
    },
    close() {}
  };
}

function parseBoolAnswer(answer, defaultBool) {
  const norm = String(answer || "").trim().toLowerCase();
  if (!norm) return defaultBool;
  if (["y", "yes", "true", "1"].includes(norm)) return true;
  if (["n", "no", "false", "0"].includes(norm)) return false;
  return defaultBool;
}

async function runInstall(argv) {
  let scope = "global";
  let scopeExplicit = false;
  let dest = "";
  let overridesDir = "";
  let force = false;
  let yes = false;
  let interactiveFlag = false;
  let dryRun = false;
  let executeCompanions = false;
  let includeModules = null;
  let excludeModules = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return 0;
    } else if (arg === "--force") force = true;
    else if (arg === "--yes" || arg === "-y") yes = true;
    else if (arg === "--interactive" || arg === "-i") interactiveFlag = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--execute") executeCompanions = true;
    else if (arg === "--scope" && argv[i + 1]) {
      scope = argv[++i];
      scopeExplicit = true;
    } else if (arg === "--dest" && argv[i + 1]) dest = argv[++i];
    else if (arg === "--overrides-dir" && argv[i + 1]) overridesDir = argv[++i];
    else if (arg === "--include" && argv[i + 1]) includeModules = parseCsvFlag(argv[++i]);
    else if (arg === "--exclude" && argv[i + 1]) excludeModules = parseCsvFlag(argv[++i]);
    else throw new Error(`Unknown or incomplete option for install: ${arg}`);
  }

  const catalog = loadCatalog(PLUGIN_SOURCE_ROOT);
  const runWizard =
    interactiveFlag ||
    (process.stdin.isTTY && !yes && includeModules === null && excludeModules.length === 0);

  let selectedCompanions = [];

  if (runWizard) {
    const prompt = await createPromptSession();
    try {
      printSdlcOverview(catalog);

      if (!scopeExplicit && !dest) {
        const chosenScope = await prompt.ask(
          "Install scope — global (~/.gemini/config/plugins) or workspace (.agents/plugins)? [global/workspace] (default: global): ",
          "global"
        );
        scope = chosenScope.toLowerCase() === "workspace" ? "workspace" : "global";
      }

      console.log("\n--- Optional Built-in SDLC Modules ---");
      const chosenBuiltins = [];
      for (const mod of catalog.addons.filter((a) => a.kind === "builtin-module")) {
        if (mod.required) {
          console.log(`[REQUIRED] ${mod.name} (${mod.id})\n  Role:    ${mod.sdlcRole}\n  Benefit: ${mod.benefit}\n`);
          chosenBuiltins.push(mod.id);
          continue;
        }
        console.log(`[OPTIONAL] ${mod.name} (${mod.id}) — ${mod.sdlcStage}\n  Role:    ${mod.sdlcRole}\n  Benefit: ${mod.benefit}`);
        const ans = await prompt.ask(`  Include "${mod.id}"? [Y/n]: `, "y");
        if (parseBoolAnswer(ans, true)) chosenBuiltins.push(mod.id);
        else excludeModules.push(mod.id);
      }
      includeModules = chosenBuiltins;

      console.log("\n--- Optional Upstream Companion Tools & Scanners ---");
      for (const comp of catalog.addons.filter((a) => a.kind !== "builtin-module")) {
        console.log(`[COMPANION] ${comp.name} (${comp.id}, ${comp.license || "OSS"}) — ${comp.sdlcStage}\n  Role:    ${comp.sdlcRole}\n  Benefit: ${comp.benefit}`);
        const ans = await prompt.ask(`  Install/Enable "${comp.id}"? [y/N]: `, "n");
        if (parseBoolAnswer(ans, false)) selectedCompanions.push(comp.id);
      }
    } finally {
      prompt.close();
    }
  }

  const layout = resolveInstallLayout({ scope, dest, overridesDir, cwd: process.cwd() });
  const installResult = installModularPlugin({
    sourceRoot: PLUGIN_SOURCE_ROOT,
    destination: layout.destination,
    overridesDir: layout.overridesDir,
    scope: layout.scope,
    includeModules,
    excludeModules,
    force,
    dryRun
  });

  const companionResults = [];
  for (const compId of selectedCompanions) {
    try {
      companionResults.push(
        installCompanionOrCustom({
          sourceRoot: PLUGIN_SOURCE_ROOT,
          layout,
          idOrUrl: compId,
          dryRun,
          execute: executeCompanions
        })
      );
    } catch (err) {
      companionResults.push({ id: compId, status: "error", error: err.message });
    }
  }

  console.log(JSON.stringify({ ...installResult, companions: companionResults }, null, 2));
  return 0;
}

function formatAddonStatusHuman(status) {
  console.log("\n=== Universal AI SDLC — Add-on Inventory ===");
  console.log(`Pipeline:  ${status.sdlcOverview.pipeline}`);
  console.log(`Installed: ${status.installed ? status.destination : `Not installed at ${status.destination}`}`);
  console.log(`Overrides: ${status.overridesDir} (${status.overrideRules.length} rule file(s))`);

  console.log("\n[Built-in Modules]");
  for (const m of status.builtinModules) {
    const tag = m.required ? "REQUIRED" : m.status.toUpperCase();
    console.log(`- [${tag}] ${m.id} — ${m.name} (${m.sdlcStage})`);
    console.log(`    Role:    ${m.sdlcRole}`);
    console.log(`    Benefit: ${m.benefit}`);
  }

  console.log("\n[Optional Companion Tools]");
  for (const c of status.companions) {
    console.log(`- [${c.status.toUpperCase()}] ${c.id} — ${c.name} (${c.license || "OSS"}, ${c.sdlcStage})`);
    console.log(`    Role:    ${c.sdlcRole}`);
    console.log(`    Benefit: ${c.benefit}`);
    if (c.status !== "installed" && Object.keys(c.installCommands).length > 0) {
      console.log(`    Install: ${Object.values(c.installCommands).join("  OR  ")}`);
    }
  }

  if (status.customAddons.length > 0) {
    console.log("\n[Custom User Add-ons]");
    for (const u of status.customAddons) {
      console.log(`- ${u.id} (${u.kind}) -> ${u.targetPath}`);
      console.log(`    Role:    ${u.sdlcRole}`);
      console.log(`    Benefit: ${u.benefit}`);
    }
  }
  console.log("");
}

function parseLayoutArgs(argv) {
  const opts = {
    scope: "global",
    dest: "",
    overridesDir: "",
    json: false,
    dryRun: false,
    execute: false,
    kind: "plugin",
    name: "",
    role: "",
    benefit: "",
    createRule: "",
    trigger: "always_on",
    description: "",
    body: "",
    positional: []
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--execute") opts.execute = true;
    else if (a === "--scope" && argv[i + 1]) opts.scope = argv[++i];
    else if (a === "--dest" && argv[i + 1]) opts.dest = argv[++i];
    else if (a === "--overrides-dir" && argv[i + 1]) opts.overridesDir = argv[++i];
    else if (a === "--kind" && argv[i + 1]) opts.kind = argv[++i];
    else if (a === "--name" && argv[i + 1]) opts.name = argv[++i];
    else if (a === "--role" && argv[i + 1]) opts.role = argv[++i];
    else if (a === "--benefit" && argv[i + 1]) opts.benefit = argv[++i];
    else if (a === "--create-rule" && argv[i + 1]) opts.createRule = argv[++i];
    else if (a === "--trigger" && argv[i + 1]) opts.trigger = argv[++i];
    else if (a === "--description" && argv[i + 1]) opts.description = argv[++i];
    else if (a === "--body" && argv[i + 1]) opts.body = argv[++i];
    else if (a.startsWith("-")) throw new Error(`Unknown or incomplete option: ${a}`);
    else opts.positional.push(a);
  }
  return opts;
}

function runAddons(argv) {
  const [sub, ...rest] = argv;
  if (!sub || sub === "--help" || sub === "-h") {
    printHelp();
    return 0;
  }
  const opts = parseLayoutArgs(rest);
  if (opts.help) {
    printHelp();
    return 0;
  }

  const layout = resolveInstallLayout({
    scope: opts.scope,
    dest: opts.dest,
    overridesDir: opts.overridesDir,
    cwd: process.cwd()
  });

  if (sub === "list") {
    const status = listAddonStatus({ sourceRoot: PLUGIN_SOURCE_ROOT, ...layout });
    if (opts.json) console.log(JSON.stringify(status, null, 2));
    else formatAddonStatusHuman(status);
    return 0;
  }

  if (sub === "add") {
    const target = opts.positional[0];
    if (!target) throw new Error("Provide a catalog add-on ID or https:// repository URL to add.");
    const res = installCompanionOrCustom({
      sourceRoot: PLUGIN_SOURCE_ROOT,
      layout,
      idOrUrl: target,
      kind: opts.kind,
      name: opts.name,
      role: opts.role || undefined,
      benefit: opts.benefit || undefined,
      dryRun: opts.dryRun,
      execute: opts.execute
    });
    console.log(JSON.stringify(res, null, 2));
    return 0;
  }

  if (sub === "remove") {
    const target = opts.positional[0];
    if (!target) throw new Error("Provide an add-on ID to remove.");
    const res = removeAddon({ sourceRoot: PLUGIN_SOURCE_ROOT, layout, id: target, dryRun: opts.dryRun });
    console.log(JSON.stringify(res, null, 2));
    return 0;
  }

  if (sub === "tweak") {
    if (!opts.createRule) {
      ensureOverridesDir(layout.overridesDir);
      console.log(JSON.stringify({ status: "ready", overridesDir: layout.overridesDir, hint: "Add rules in rules/*.md or pass --create-rule <name>, then run addons sync." }, null, 2));
      return 0;
    }
    const res = createOverrideRule({
      overridesDir: layout.overridesDir,
      destination: layout.destination,
      name: opts.createRule,
      trigger: opts.trigger,
      description: opts.description,
      body: opts.body
    });
    console.log(JSON.stringify(res, null, 2));
    return 0;
  }

  if (sub === "sync") {
    const res = syncOverrides({ destination: layout.destination, overridesDir: layout.overridesDir });
    console.log(JSON.stringify({ status: "synced", ...res }, null, 2));
    return 0;
  }

  throw new Error(`Unknown addons subcommand "${sub}". Expected: list | add | remove | tweak | sync`);
}

function runInit(argv) {
  let target = process.cwd();
  let profile = "";
  let projectName = "";
  let strictDesignGate = false;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return 0;
    } else if (arg === "--strict-design-gate") strictDesignGate = true;
    else if (arg === "--force") force = true;
    else if (arg === "--target" && argv[i + 1]) target = argv[++i];
    else if (arg === "--profile" && argv[i + 1]) profile = argv[++i];
    else if (arg === "--name" && argv[i + 1]) projectName = argv[++i];
    else throw new Error(`Unknown or incomplete option for init: ${arg}`);
  }

  if (!profile) {
    throw new Error(`--profile is required. Expected one of: ${Object.keys(PROFILES).join(" | ")}`);
  }

  const result = initSdlcWorkspace({
    target,
    profile,
    projectName: projectName || undefined,
    strictDesignGate,
    force
  });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

function runCheck(argv) {
  let pluginDir = "";
  let sdlcDir = "";
  let strict = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return 0;
    } else if (arg === "--strict") strict = true;
    else if (arg === "--json") json = true;
    else if (arg === "--plugin" && argv[i + 1]) pluginDir = argv[++i];
    else if (arg === "--sdlc" && argv[i + 1]) sdlcDir = argv[++i];
    else throw new Error(`Unknown or incomplete option for check: ${arg}`);
  }

  if (!pluginDir && !sdlcDir) sdlcDir = process.cwd();
  const result = pluginDir ? validatePluginDir(pluginDir, strict) : auditSdlcWorkspace(sdlcDir);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[${result.mode.toUpperCase()}] ok=${result.ok} errors=${result.errors} warnings=${result.warnings}`);
    for (const f of result.findings) {
      console.log(`  ${f.severity.toUpperCase()} [${f.file}] ${f.message}`);
    }
  }
  return result.ok ? 0 : 1;
}

function runVerify(argv) {
  const verifyScript = path.join(PLUGIN_SOURCE_ROOT, "scripts", "verify-profile.mjs");
  const hasHelp = argv.includes("--help") || argv.includes("-h");
  const hasTarget = argv.includes("--target");
  const forwardArgs = hasHelp || hasTarget ? argv : ["--target", process.cwd(), ...argv];
  const proc = spawnSync(process.execPath, [verifyScript, ...forwardArgs], { stdio: "inherit" });
  return proc.status ?? 1;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    printHelp();
    return 0;
  }
  if (cmd === "install") return await runInstall(rest);
  if (cmd === "addons") return runAddons(rest);
  if (cmd === "init") return runInit(rest);
  if (cmd === "check") return runCheck(rest);
  if (cmd === "verify") return runVerify(rest);
  throw new Error(`Unknown command "${cmd}". Run with --help to see available commands.`);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  });

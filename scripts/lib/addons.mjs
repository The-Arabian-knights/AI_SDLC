import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isToolAvailable, parseJsonFile, readJsonSafe } from "./hook-io.mjs";

const BASE_FILES = [
  "plugin.json",
  "mcp_config.json",
  "README.md",
  "LICENSE",
  "package.json",
  "assets",
  "catalog",
  "scripts"
];

export function loadCatalog(pluginRoot) {
  const catalogPath = path.join(pluginRoot, "catalog", "addons.json");
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Missing catalog/addons.json in ${pluginRoot}`);
  }
  return parseJsonFile(catalogPath);
}

export function resolveInstallLayout({
  scope = "global",
  dest = "",
  overridesDir = "",
  cwd = process.cwd()
} = {}) {
  if (scope !== "global" && scope !== "workspace") {
    throw new Error(`Invalid scope "${scope}". Expected "global" or "workspace".`);
  }

  const baseRoot =
    scope === "workspace"
      ? path.join(path.resolve(cwd), ".agents")
      : path.join(os.homedir(), ".gemini", "config");

  const pluginsRoot = path.join(baseRoot, "plugins");
  const skillsRoot = path.join(baseRoot, "skills");
  const destination = dest ? path.resolve(dest) : path.join(pluginsRoot, "universal-sdlc");
  const resolvedOverrides = overridesDir
    ? path.resolve(overridesDir)
    : path.join(baseRoot, "universal-sdlc-overrides");

  return {
    scope,
    pluginsRoot,
    skillsRoot,
    destination,
    overridesDir: resolvedOverrides
  };
}

export function ensureOverridesDir(overridesDir) {
  fs.mkdirSync(path.join(overridesDir, "rules"), { recursive: true });
  fs.mkdirSync(path.join(overridesDir, "templates"), { recursive: true });

  const configPath = path.join(overridesDir, "overrides.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      `${JSON.stringify({ schemaVersion: "1.0.0", notes: "", customAddons: [] }, null, 2)}\n`,
      "utf8"
    );
  }

  const readmePath = path.join(overridesDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `# Universal AI SDLC — Persistent Overrides

Files stored in this folder survive \`universal-sdlc\` plugin updates (\`install --force\`):

- \`rules/*.md\`: Custom Antigravity rules synced automatically into the installed plugin as \`rules/custom-*.md\`.
- \`templates/\`: Custom artifact templates referenced by your override rules or workflows.
- \`overrides.json\`: Tracks custom user-added plugins and skills across updates.
`,
      "utf8"
    );
  }
}

export function syncOverrides({ destination, overridesDir }) {
  ensureOverridesDir(overridesDir);
  const syncedRules = [];
  if (!destination || !fs.existsSync(destination)) {
    return { syncedRules };
  }

  const destRulesDir = path.join(destination, "rules");
  fs.mkdirSync(destRulesDir, { recursive: true });

  for (const entry of fs.readdirSync(destRulesDir, { withFileTypes: true })) {
    if (entry.isFile() && /^custom-.*\.md$/i.test(entry.name)) {
      fs.unlinkSync(path.join(destRulesDir, entry.name));
    }
  }

  const srcRulesDir = path.join(overridesDir, "rules");
  if (fs.existsSync(srcRulesDir)) {
    for (const entry of fs.readdirSync(srcRulesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      const raw = fs.readFileSync(path.join(srcRulesDir, entry.name), "utf8").replace(/\r\n/g, "\n");
      const content = raw.startsWith("---\n")
        ? raw
        : `---\ntrigger: always_on\ndescription: "User override rule (${entry.name})"\n---\n\n${raw}`;
      const targetName = `custom-${entry.name}`;
      fs.writeFileSync(path.join(destRulesDir, targetName), content, "utf8");
      syncedRules.push(`rules/${targetName}`);
    }
  }

  return { syncedRules };
}

function countFiles(entryPath) {
  if (!fs.existsSync(entryPath)) return 0;
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) return 1;
  let total = 0;
  for (const child of fs.readdirSync(entryPath, { withFileTypes: true })) {
    total += countFiles(path.join(entryPath, child.name));
  }
  return total;
}

function copyEntry(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, force: true });
  return countFiles(dst);
}

function removeEntry(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

export function installModularPlugin({
  sourceRoot,
  destination,
  overridesDir,
  scope = "global",
  includeModules = null,
  excludeModules = [],
  force = false,
  dryRun = false
}) {
  const srcRoot = path.resolve(sourceRoot);
  const dstRoot = path.resolve(destination);
  const catalog = loadCatalog(srcRoot);
  const builtinModules = catalog.addons.filter((a) => a.kind === "builtin-module");
  const validIds = new Set(builtinModules.map((m) => m.id));

  for (const id of excludeModules || []) {
    if (!validIds.has(id)) throw new Error(`Unknown built-in module "${id}".`);
    const mod = builtinModules.find((m) => m.id === id);
    if (mod?.required) throw new Error(`Cannot exclude required module "${id}".`);
  }
  if (Array.isArray(includeModules)) {
    for (const id of includeModules) {
      if (!validIds.has(id)) throw new Error(`Unknown built-in module "${id}".`);
    }
  }

  const excludeSet = new Set(excludeModules || []);
  const includeSet = Array.isArray(includeModules) ? new Set(includeModules) : null;

  const activeModules = builtinModules.filter((m) => {
    if (m.required) return true;
    if (includeSet) return includeSet.has(m.id) && !excludeSet.has(m.id);
    return m.defaultIncluded !== false && !excludeSet.has(m.id);
  });

  const activeIds = activeModules.map((m) => m.id);
  const inactiveModules = builtinModules.filter((m) => !activeIds.includes(m.id));
  const inactiveIds = inactiveModules.map((m) => m.id);

  if (dryRun) {
    return {
      status: "planned",
      scope,
      destination: dstRoot,
      overridesDir,
      includedModules: activeIds,
      excludedModules: inactiveIds
    };
  }

  if (dstRoot === srcRoot) {
    throw new Error(`Refusing to install onto source plugin directory: ${dstRoot}`);
  }
  if (fs.existsSync(dstRoot) && !force) {
    throw new Error(`Destination already exists: ${dstRoot}. Pass --force to update/overwrite.`);
  }

  const manifestPath = path.join(dstRoot, ".sdlc-install-manifest.json");
  const previousManifest = readJsonSafe(manifestPath);

  fs.mkdirSync(dstRoot, { recursive: true });
  let filesCopied = 0;

  for (const baseItem of BASE_FILES) {
    const src = path.join(srcRoot, baseItem);
    if (!fs.existsSync(src)) continue;
    filesCopied += copyEntry(src, path.join(dstRoot, baseItem));
  }

  for (const mod of inactiveModules) {
    for (const comp of mod.components || []) {
      removeEntry(path.join(dstRoot, comp));
    }
  }

  for (const mod of activeModules) {
    for (const comp of mod.components || []) {
      const src = path.join(srcRoot, comp);
      if (!fs.existsSync(src)) continue;
      filesCopied += copyEntry(src, path.join(dstRoot, comp));
    }
  }

  const manifest = {
    schemaVersion: "1.0.0",
    installedAt: new Date().toISOString(),
    scope,
    overridesDir,
    includedModules: activeIds,
    excludedModules: inactiveIds,
    companions: Array.isArray(previousManifest?.companions) ? previousManifest.companions : []
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const { syncedRules } = syncOverrides({ destination: dstRoot, overridesDir });

  return {
    status: "installed",
    scope,
    destination: dstRoot,
    overridesDir,
    includedModules: activeIds,
    excludedModules: inactiveIds,
    syncedOverrideRules: syncedRules,
    filesCopied
  };
}

export function listAddonStatus({
  sourceRoot,
  destination,
  overridesDir,
  pluginsRoot,
  skillsRoot
}) {
  const catalog = loadCatalog(sourceRoot);
  const manifest = readJsonSafe(path.join(destination, ".sdlc-install-manifest.json"));
  const overridesCfg = readJsonSafe(path.join(overridesDir, "overrides.json"));
  const isInstalled = fs.existsSync(path.join(destination, "plugin.json"));

  const includedSet = new Set(
    manifest?.includedModules ||
      catalog.addons.filter((a) => a.kind === "builtin-module" && a.defaultIncluded !== false).map((a) => a.id)
  );

  const builtinModules = catalog.addons
    .filter((a) => a.kind === "builtin-module")
    .map((a) => ({
      id: a.id,
      name: a.name,
      required: Boolean(a.required),
      sdlcStage: a.sdlcStage,
      sdlcRole: a.sdlcRole,
      benefit: a.benefit,
      status: isInstalled ? (includedSet.has(a.id) ? "included" : "excluded") : "available",
      components: a.components
    }));

  const companions = catalog.addons
    .filter((a) => a.kind !== "builtin-module")
    .map((a) => {
      let installed = false;
      let installedPath = "";
      if (a.kind === "companion-cli") {
        installed = (a.detectBinaries || []).some((bin) => isToolAvailable(bin));
      } else if (a.kind === "companion-plugin" && pluginsRoot && a.folderName) {
        const p = path.join(pluginsRoot, a.folderName);
        if (fs.existsSync(p)) {
          installed = true;
          installedPath = p;
        }
      } else if (a.kind === "companion-skill" && skillsRoot && a.folderName) {
        const p = path.join(skillsRoot, a.folderName);
        if (fs.existsSync(p)) {
          installed = true;
          installedPath = p;
        }
      }
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        license: a.license || "",
        repository: a.repository || "",
        sdlcStage: a.sdlcStage,
        sdlcRole: a.sdlcRole,
        benefit: a.benefit,
        status: installed ? "installed" : "not-installed",
        installedPath,
        installCommands: a.installCommands || {}
      };
    });

  const overrideRulesDir = path.join(overridesDir, "rules");
  const overrideRules = fs.existsSync(overrideRulesDir)
    ? fs.readdirSync(overrideRulesDir).filter((n) => n.toLowerCase().endsWith(".md"))
    : [];

  return {
    sdlcOverview: catalog.sdlcOverview,
    installed: isInstalled,
    destination,
    overridesDir,
    overrideRules,
    builtinModules,
    companions,
    customAddons: Array.isArray(overridesCfg?.customAddons) ? overridesCfg.customAddons : []
  };
}

export function toggleBuiltinModule({ sourceRoot, destination, overridesDir, moduleId, enable }) {
  if (!fs.existsSync(path.join(destination, "plugin.json"))) {
    throw new Error(`Universal SDLC is not installed at ${destination}. Run install first.`);
  }
  const srcRoot = path.resolve(sourceRoot);
  const catalog = loadCatalog(srcRoot);
  const mod = catalog.addons.find((a) => a.kind === "builtin-module" && a.id === moduleId);
  if (!mod) throw new Error(`Unknown built-in module "${moduleId}".`);
  if (!enable && mod.required) {
    throw new Error(`Module "${moduleId}" is required and cannot be removed.`);
  }

  for (const comp of mod.components || []) {
    const dst = path.join(destination, comp);
    if (enable) {
      const src = path.join(srcRoot, comp);
      if (fs.existsSync(src)) copyEntry(src, dst);
    } else {
      removeEntry(dst);
    }
  }

  const manifestPath = path.join(destination, ".sdlc-install-manifest.json");
  const manifest = readJsonSafe(manifestPath) || {
    schemaVersion: "1.0.0",
    installedAt: new Date().toISOString(),
    overridesDir,
    includedModules: catalog.addons
      .filter((a) => a.kind === "builtin-module" && a.defaultIncluded !== false)
      .map((a) => a.id),
    excludedModules: [],
    companions: []
  };

  const included = new Set(manifest.includedModules || []);
  const excluded = new Set(manifest.excludedModules || []);
  if (enable) {
    included.add(moduleId);
    excluded.delete(moduleId);
  } else {
    included.delete(moduleId);
    excluded.add(moduleId);
  }

  manifest.includedModules = [...included];
  manifest.excludedModules = [...excluded];
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const { syncedRules } = syncOverrides({ destination, overridesDir });
  return {
    status: enable ? "enabled" : "disabled",
    id: moduleId,
    kind: "builtin-module",
    destination,
    syncedOverrideRules: syncedRules
  };
}

function assertSafeFolderName(rawName) {
  const cleaned = String(rawName || "")
    .trim()
    .toLowerCase()
    .replace(/\.git$/i, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleaned)) {
    throw new Error(`Invalid add-on folder name "${rawName}". Expected kebab-case.`);
  }
  return cleaned;
}

function assertSafeHttpsUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== "https:" || /[;&|`$<>\\]/.test(rawUrl)) {
    throw new Error(`Only clean https:// repository URLs are allowed: ${rawUrl}`);
  }
  return parsed;
}

function isContainedInside(parentDir, targetPath) {
  const rel = path.relative(path.resolve(parentDir), path.resolve(targetPath));
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function installCompanionOrCustom({
  sourceRoot,
  layout,
  idOrUrl,
  kind = "plugin",
  name = "",
  role = "Custom workflow add-on",
  benefit = "User-installed SDLC extension",
  dryRun = false,
  execute = false
}) {
  const catalog = loadCatalog(sourceRoot);
  const builtin = catalog.addons.find((a) => a.kind === "builtin-module" && a.id === idOrUrl);
  if (builtin) {
    if (dryRun) {
      return { status: "planned", action: "enable-builtin", id: builtin.id, components: builtin.components };
    }
    return toggleBuiltinModule({
      sourceRoot,
      destination: layout.destination,
      overridesDir: layout.overridesDir,
      moduleId: builtin.id,
      enable: true
    });
  }

  const companion = catalog.addons.find((a) => a.kind !== "builtin-module" && a.id === idOrUrl);
  if (companion) {
    if (companion.kind === "companion-cli") {
      const already = (companion.detectBinaries || []).some((bin) => isToolAvailable(bin));
      if (already) {
        return { status: "already-installed", id: companion.id, binaries: companion.detectBinaries };
      }
      if (!execute || dryRun) {
        return {
          status: "planned",
          id: companion.id,
          kind: companion.kind,
          sdlcRole: companion.sdlcRole,
          benefit: companion.benefit,
          installCommands: companion.installCommands,
          note: "Run one of the installCommands above (or pass --execute for uv/pip packages)."
        };
      }
      if (companion.installCommands?.uv && isToolAvailable("uv")) {
        const pkg = companion.installCommands.uv.split(/\s+/).pop();
        const res = spawnSync("uv", ["tool", "install", pkg], { encoding: "utf8" });
        if (res.status !== 0) throw new Error(res.stderr || res.stdout || "uv tool install failed");
        return { status: "installed", id: companion.id, installer: "uv", package: pkg };
      }
      if (companion.installCommands?.pip && isToolAvailable("pip")) {
        const pkg = companion.installCommands.pip.split(/\s+/).pop();
        const res = spawnSync("pip", ["install", pkg], { encoding: "utf8" });
        if (res.status !== 0) throw new Error(res.stderr || res.stdout || "pip install failed");
        return { status: "installed", id: companion.id, installer: "pip", package: pkg };
      }
      return {
        status: "manual-install-required",
        id: companion.id,
        installCommands: companion.installCommands
      };
    }

    const baseDir = companion.kind === "companion-plugin" ? layout.pluginsRoot : layout.skillsRoot;
    const targetPath = path.join(baseDir, companion.folderName);
    if (dryRun) {
      return {
        status: "planned",
        id: companion.id,
        kind: companion.kind,
        repository: companion.repository,
        targetPath,
        command: `git clone --depth 1 ${companion.repository} "${targetPath}"`
      };
    }
    if (fs.existsSync(targetPath)) {
      return { status: "already-installed", id: companion.id, targetPath };
    }
    fs.mkdirSync(baseDir, { recursive: true });
    const clone = spawnSync("git", ["clone", "--depth", "1", companion.repository, targetPath], {
      encoding: "utf8"
    });
    if (clone.status !== 0) {
      throw new Error(`git clone failed: ${clone.stderr || clone.stdout || "unknown error"}`);
    }
    return { status: "installed", id: companion.id, kind: companion.kind, targetPath };
  }

  // Custom external plugin/skill via https:// URL
  if (!String(idOrUrl).startsWith("https://")) {
    throw new Error(`Unknown catalog add-on "${idOrUrl}". Provide a catalog ID or an https:// git repository URL.`);
  }
  const parsed = assertSafeHttpsUrl(idOrUrl);
  const rawSlug = name || path.posix.basename(parsed.pathname) || "custom-addon";
  const id = assertSafeFolderName(rawSlug);
  const targetKind = kind === "skill" ? "skill" : "plugin";
  const baseDir = targetKind === "plugin" ? layout.pluginsRoot : layout.skillsRoot;
  const targetPath = path.join(baseDir, id);

  if (dryRun) {
    return {
      status: "planned",
      id,
      kind: `custom-${targetKind}`,
      repository: idOrUrl,
      targetPath,
      sdlcRole: role,
      benefit,
      command: `git clone --depth 1 ${idOrUrl} "${targetPath}"`
    };
  }
  if (fs.existsSync(targetPath)) {
    throw new Error(`Target already exists: ${targetPath}`);
  }

  fs.mkdirSync(baseDir, { recursive: true });
  const clone = spawnSync("git", ["clone", "--depth", "1", idOrUrl, targetPath], { encoding: "utf8" });
  if (clone.status !== 0) {
    throw new Error(`git clone failed: ${clone.stderr || clone.stdout || "unknown error"}`);
  }

  ensureOverridesDir(layout.overridesDir);
  const cfgPath = path.join(layout.overridesDir, "overrides.json");
  const cfg = readJsonSafe(cfgPath) || { schemaVersion: "1.0.0", notes: "", customAddons: [] };
  const list = Array.isArray(cfg.customAddons) ? cfg.customAddons.filter((c) => c.id !== id) : [];
  list.push({
    id,
    kind: targetKind,
    repository: idOrUrl,
    targetPath,
    sdlcRole: role,
    benefit,
    addedAt: new Date().toISOString()
  });
  cfg.customAddons = list;
  fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");

  return { status: "installed", id, kind: `custom-${targetKind}`, targetPath };
}

export function removeAddon({ sourceRoot, layout, id, dryRun = false }) {
  const catalog = loadCatalog(sourceRoot);
  const builtin = catalog.addons.find((a) => a.kind === "builtin-module" && a.id === id);
  if (builtin) {
    if (builtin.required) throw new Error(`Module "${id}" is required and cannot be removed.`);
    if (dryRun) {
      return { status: "planned-remove", id, kind: "builtin-module", components: builtin.components };
    }
    return toggleBuiltinModule({
      sourceRoot,
      destination: layout.destination,
      overridesDir: layout.overridesDir,
      moduleId: id,
      enable: false
    });
  }

  const companion = catalog.addons.find(
    (a) => (a.kind === "companion-plugin" || a.kind === "companion-skill") && (a.id === id || a.folderName === id)
  );
  if (companion) {
    const baseDir = companion.kind === "companion-plugin" ? layout.pluginsRoot : layout.skillsRoot;
    const targetPath = path.join(baseDir, companion.folderName);
    if (!isContainedInside(baseDir, targetPath)) {
      throw new Error(`Refusing to remove path outside ${baseDir}`);
    }
    if (dryRun) return { status: "planned-remove", id: companion.id, targetPath };
    removeEntry(targetPath);
    return { status: "removed", id: companion.id, targetPath };
  }

  const cfgPath = path.join(layout.overridesDir, "overrides.json");
  const cfg = readJsonSafe(cfgPath);
  const custom = Array.isArray(cfg?.customAddons) ? cfg.customAddons.find((c) => c.id === id) : null;
  if (!custom) {
    throw new Error(`Add-on "${id}" not found as a removable built-in module, companion, or custom add-on.`);
  }
  const baseDir = custom.kind === "skill" ? layout.skillsRoot : layout.pluginsRoot;
  if (!isContainedInside(baseDir, custom.targetPath)) {
    throw new Error(`Refusing to remove path outside ${baseDir}: ${custom.targetPath}`);
  }
  if (dryRun) return { status: "planned-remove", id, targetPath: custom.targetPath };

  removeEntry(custom.targetPath);
  cfg.customAddons = cfg.customAddons.filter((c) => c.id !== id);
  fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  return { status: "removed", id, targetPath: custom.targetPath };
}

export function createOverrideRule({
  overridesDir,
  destination,
  name,
  trigger = "always_on",
  description = "",
  body = ""
}) {
  const safeName = assertSafeFolderName(name);
  if (!["always_on", "model_decision", "glob", "manual"].includes(trigger)) {
    throw new Error(`Invalid trigger "${trigger}". Expected always_on | model_decision | glob | manual.`);
  }
  ensureOverridesDir(overridesDir);

  const desc = description || `Custom SDLC rule (${safeName})`;
  const bodyText = (body || `# ${safeName}\n\n- Add project or team-specific SDLC guidance here.\n`).replace(/\\n/g, "\n");
  const content = `---\ntrigger: ${trigger}\ndescription: "${desc.replace(/"/g, '\\"')}"\n---\n\n${bodyText.trim()}\n`;

  const overridePath = path.join(overridesDir, "rules", `${safeName}.md`);
  fs.writeFileSync(overridePath, content, "utf8");
  const { syncedRules } = syncOverrides({ destination, overridesDir });

  return {
    status: "updated",
    overrideRulePath: overridePath,
    syncedRules
  };
}

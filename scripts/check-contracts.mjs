import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonFile, readJsonSafe } from "./lib/hook-io.mjs";
import { PROFILES, STAGE_DIRS } from "./lib/profiles.mjs";

const ALLOWED_MANIFEST_KEYS = new Set([
  "$schema",
  "name",
  "displayName",
  "display_name",
  "description",
  "version",
  "disabled",
  "logo",
  "suggestedPrompts",
  "suggested_prompts",
  "skills",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
  "source",
  "sourcePath",
  "source_path"
]);

const KNOWN_AGENT_TOOLS = new Set([
  "view_file",
  "write_to_file",
  "replace_file_content",
  "multi_replace_file_content",
  "list_dir",
  "find_by_name",
  "grep_search",
  "search_web",
  "read_url_content",
  "run_command",
  "manage_task",
  "schedule",
  "list_permissions",
  "ask_permission",
  "invoke_subagent",
  "define_subagent",
  "send_message",
  "manage_subagents",
  "ask_question",
  "generate_image",
  "read_file",
  "write_file",
  "edit_file",
  "browser_subagent"
]);

const VALID_RULE_TRIGGERS = new Set(["always_on", "model_decision", "glob", "manual"]);
const VALID_HOOK_EVENTS = new Set([
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PreInvocation",
  "PostInvocation",
  "Stop"
]);
const GROUPED_HOOK_EVENTS = new Set(["PreToolUse", "PostToolUse"]);
const LOGO_REL_REGEX = /^(?![A-Za-z][A-Za-z0-9+.-]*:)(?!\/)\S.*\.([Pp][Nn][Gg]|[Ss][Vv][Gg]|[Jj][Pp][Ee]?[Gg]|[Ww][Ee][Bb][Pp])$/;

/**
 * Minimal deterministic YAML frontmatter parser covering scalars, block scalars (>-, |),
 * and simple dash lists used in Antigravity SKILL.md, rule, and agent files.
 */
function parseFrontmatter(text) {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return null;
  const endIdx = norm.indexOf("\n---\n", 4);
  const altEndIdx = endIdx === -1 ? norm.indexOf("\n---", 4) : endIdx;
  if (altEndIdx === -1) return null;

  const block = norm.slice(4, altEndIdx);
  const lines = block.split("\n");
  const data = {};
  let currentKey = null;
  let mode = null; // "list" | "scalar"
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    if (mode === "list") {
      data[currentKey] = buffer.slice();
    } else if (mode === "scalar") {
      data[currentKey] = buffer.join(" ").trim();
    }
    currentKey = null;
    mode = null;
    buffer = [];
  };

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && currentKey && mode === "list") {
      buffer.push(listMatch[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    if (/^\s+/.test(line) && currentKey && mode === "scalar") {
      buffer.push(line.trim());
      continue;
    }
    flush();
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    const val = rawVal.trim();
    if (val === ">-" || val === ">" || val === "|-" || val === "|") {
      currentKey = key;
      mode = "scalar";
      buffer = [];
    } else if (val === "") {
      currentKey = key;
      mode = "list";
      buffer = [];
    } else if (val.startsWith("[") && val.endsWith("]")) {
      data[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (val === "true" || val === "false") {
      data[key] = val === "true";
    } else {
      data[key] = val.replace(/^["']|["']$/g, "");
    }
  }
  flush();
  return { data, body: norm.slice(altEndIdx + 4) };
}

function collectMarkdownFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".sdlc") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdownFiles(full, out);
    else if (entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

function addFinding(findings, severity, file, message) {
  findings.push({ severity, file, message });
}

function validateManifest(pluginRoot, findings) {
  const manifestPath = path.join(pluginRoot, "plugin.json");
  if (!fs.existsSync(manifestPath)) {
    addFinding(findings, "error", "plugin.json", "Missing plugin.json at plugin root.");
    return null;
  }
  let manifest;
  try {
    manifest = parseJsonFile(manifestPath);
  } catch (err) {
    addFinding(findings, "error", "plugin.json", `Invalid JSON: ${err.message}`);
    return null;
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_MANIFEST_KEYS.has(key)) {
      addFinding(findings, "warning", "plugin.json", `Unrecognized top-level key "${key}" (additionalProperties: false).`);
    }
  }

  if (typeof manifest.name !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name)) {
    addFinding(findings, "warning", "plugin.json", 'Plugin "name" should be lowercase kebab-case matching ^[a-z0-9]+(-[a-z0-9]+)*$.');
  }
  for (const rec of ["displayName", "description", "version", "author", "license", "keywords"]) {
    if (!manifest[rec]) {
      addFinding(findings, "warning", "plugin.json", `Recommended/Marketplace field "${rec}" is missing.`);
    }
  }
  if (manifest.repository !== undefined && typeof manifest.repository !== "string") {
    addFinding(findings, "error", "plugin.json", '"repository" must be a string URL per schemas/v1/plugin.json.');
  }
  if (manifest.author !== undefined) {
    if (typeof manifest.author === "object" && manifest.author !== null) {
      for (const k of Object.keys(manifest.author)) {
        if (!["name", "email", "url"].includes(k)) {
          addFinding(findings, "error", "plugin.json", `Unexpected key "${k}" inside author object.`);
        }
      }
    } else if (typeof manifest.author !== "string") {
      addFinding(findings, "error", "plugin.json", '"author" must be a string or {name, email, url} object.');
    }
  }
  if (manifest.logo) {
    if (typeof manifest.logo !== "string" || !LOGO_REL_REGEX.test(manifest.logo)) {
      addFinding(findings, "warning", "plugin.json", `Invalid relative logo path "${manifest.logo}".`);
    } else {
      const logoFile = path.join(pluginRoot, manifest.logo);
      if (!fs.existsSync(logoFile) || fs.statSync(logoFile).size === 0) {
        addFinding(findings, "warning", "plugin.json", `Logo file "${manifest.logo}" is missing or empty.`);
      }
    }
  }
  if (manifest.suggestedPrompts !== undefined) {
    if (!Array.isArray(manifest.suggestedPrompts) || manifest.suggestedPrompts.length > 3) {
      addFinding(findings, "error", "plugin.json", '"suggestedPrompts" must be an array with at most 3 items.');
    }
  }

  for (const shadowed of ["AGENTS.md", "GEMINI.md", ".mcp.json", "mcp.json", "hooks/hooks.json"]) {
    if (fs.existsSync(path.join(pluginRoot, shadowed))) {
      addFinding(findings, "warning", shadowed, `Shadowed/other-tool file "${shadowed}" triggers strict validation warnings.`);
    }
  }
  if (!fs.existsSync(path.join(pluginRoot, "README.md"))) {
    addFinding(findings, "warning", "README.md", "Missing README.md at plugin root.");
  }
  return manifest;
}

function validateRules(pluginRoot, findings) {
  const rulesDir = path.join(pluginRoot, "rules");
  if (!fs.existsSync(rulesDir)) return;
  for (const entry of fs.readdirSync(rulesDir, { withFileTypes: true })) {
    const rel = `rules/${entry.name}`;
    if (entry.isDirectory()) {
      addFinding(findings, "warning", rel, "Nested directories in rules/ are ignored unless registered via rules.json.");
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(rulesDir, entry.name), "utf8");
    if (Buffer.byteLength(raw, "utf8") > 24000) {
      addFinding(findings, "warning", rel, "Rule exceeds 24,000 byte limit and will be truncated.");
    }
    if (entry.name === "AGENTS.md" || entry.name === "GEMINI.md") {
      if (raw.replace(/\r\n/g, "\n").startsWith("---\n")) {
        addFinding(findings, "warning", rel, `${entry.name} should not contain YAML frontmatter.`);
      }
      continue;
    }
    const parsed = parseFrontmatter(raw);
    if (!parsed || !VALID_RULE_TRIGGERS.has(parsed.data.trigger)) {
      addFinding(findings, "error", rel, "Named rule missing valid YAML frontmatter `trigger` (always_on|model_decision|glob|manual).");
      continue;
    }
    if (parsed.data.trigger === "glob") {
      const globs = parsed.data.globs ?? parsed.data.glob;
      if (typeof globs !== "string" || !globs.trim()) {
        addFinding(findings, "error", rel, "`glob` rule requires a comma-separated string `globs:` field.");
      }
    }
    if (parsed.data.trigger === "model_decision" && !parsed.data.description) {
      addFinding(findings, "error", rel, "`model_decision` rule requires a `description` field.");
    }
  }
}

function validateSkills(pluginRoot, findings) {
  const skillsDir = path.join(pluginRoot, "skills");
  if (!fs.existsSync(skillsDir)) return;
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `skills/${entry.name}/SKILL.md`;
    const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      addFinding(findings, "error", rel, "Skill directory is missing SKILL.md.");
      continue;
    }
    const parsed = parseFrontmatter(fs.readFileSync(skillPath, "utf8"));
    if (!parsed) {
      addFinding(findings, "error", rel, "SKILL.md is missing YAML frontmatter.");
      continue;
    }
    if (parsed.data.name !== entry.name) {
      addFinding(findings, "error", rel, `Skill frontmatter name "${parsed.data.name}" must match folder "${entry.name}".`);
    }
    if (typeof parsed.data.description !== "string" || !parsed.data.description.trim() || parsed.data.description.length > 1024) {
      addFinding(findings, "error", rel, "SKILL.md requires a non-empty description <= 1024 characters.");
    }
  }
}

function validateAgents(pluginRoot, findings) {
  const agentsDir = path.join(pluginRoot, "agents");
  if (!fs.existsSync(agentsDir)) return;
  for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const rel = `agents/${entry.name}`;
    const parsed = parseFrontmatter(fs.readFileSync(path.join(agentsDir, entry.name), "utf8"));
    if (!parsed) {
      addFinding(findings, "error", rel, "Agent definition missing YAML frontmatter.");
      continue;
    }
    if (!parsed.data.name || !parsed.data.description) {
      addFinding(findings, "error", rel, "Agent definition requires `name` and `description`.");
    }
    if (parsed.data.model && !["inherit", "flash_lite", "flash", "pro"].includes(parsed.data.model)) {
      addFinding(findings, "error", rel, `Invalid agent model "${parsed.data.model}".`);
    }
    if (
      parsed.data.commandExecutionPolicy &&
      !["off", "auto", "eager", "sandbox"].includes(parsed.data.commandExecutionPolicy)
    ) {
      addFinding(findings, "error", rel, `Invalid commandExecutionPolicy "${parsed.data.commandExecutionPolicy}".`);
    }
    if (Array.isArray(parsed.data.tools)) {
      for (const tool of parsed.data.tools) {
        if (!KNOWN_AGENT_TOOLS.has(tool)) {
          addFinding(findings, "error", rel, `Unverified/unknown tool name "${tool}" in tools allowlist.`);
        }
      }
    }
  }
}

function validateHooks(pluginRoot, findings) {
  const hooksPath = path.join(pluginRoot, "hooks.json");
  if (!fs.existsSync(hooksPath)) return;
  let hooks;
  try {
    hooks = parseJsonFile(hooksPath);
  } catch (err) {
    addFinding(findings, "error", "hooks.json", `Invalid JSON: ${err.message}`);
    return;
  }

  for (const [hookName, cfg] of Object.entries(hooks)) {
    if (!cfg || typeof cfg !== "object") {
      addFinding(findings, "error", "hooks.json", `Hook group "${hookName}" must be an object.`);
      continue;
    }
    for (const [key, value] of Object.entries(cfg)) {
      if (key === "enabled") continue;
      if (!VALID_HOOK_EVENTS.has(key)) {
        addFinding(findings, "error", "hooks.json", `Unsupported lifecycle event "${key}" in "${hookName}".`);
        continue;
      }
      if (!Array.isArray(value)) {
        addFinding(findings, "error", "hooks.json", `Event "${key}" in "${hookName}" must be an array.`);
        continue;
      }
      const handlers = [];
      if (GROUPED_HOOK_EVENTS.has(key)) {
        for (const group of value) {
          if (typeof group?.matcher !== "string" || !Array.isArray(group?.hooks)) {
            addFinding(findings, "error", "hooks.json", `${key} entries in "${hookName}" must have string "matcher" and array "hooks".`);
            continue;
          }
          handlers.push(...group.hooks);
        }
      } else {
        for (const item of value) {
          if (item && "matcher" in item) {
            addFinding(findings, "error", "hooks.json", `${key} in "${hookName}" must be a flat handler array without "matcher".`);
          }
          handlers.push(item);
        }
      }
      for (const handler of handlers) {
        if (typeof handler?.command !== "string" || !handler.command.trim()) {
          addFinding(findings, "error", "hooks.json", `Missing "command" in ${hookName}.${key}.`);
          continue;
        }
        if (handler.command.includes("${PLUGIN_ROOT}")) {
          addFinding(findings, "warning", "hooks.json", `Use relative paths instead of \${PLUGIN_ROOT} in hooks.json (${hookName}.${key}).`);
        }
        const scriptMatch = handler.command.match(/\.\/([^\s"']+)/);
        if (scriptMatch) {
          const targetScript = path.join(pluginRoot, scriptMatch[1]);
          if (!fs.existsSync(targetScript)) {
            addFinding(findings, "error", "hooks.json", `Hook command script not found: ./${scriptMatch[1]}`);
          }
        }
      }
    }
  }
}

function validateMcp(pluginRoot, findings) {
  const mcpPath = path.join(pluginRoot, "mcp_config.json");
  if (!fs.existsSync(mcpPath)) return;
  let cfg;
  try {
    cfg = parseJsonFile(mcpPath);
  } catch (err) {
    addFinding(findings, "error", "mcp_config.json", `Invalid JSON: ${err.message}`);
    return;
  }
  if (!cfg || typeof cfg.mcpServers !== "object" || Array.isArray(cfg.mcpServers)) {
    addFinding(findings, "error", "mcp_config.json", 'Top-level "mcpServers" object is required.');
    return;
  }
  for (const [serverName, server] of Object.entries(cfg.mcpServers)) {
    if (!server.command && !server.serverUrl && !server.url) {
      addFinding(findings, "error", "mcp_config.json", `Server "${serverName}" must define command or serverUrl/url.`);
    }
    if (server.env && ("PLUGIN_ROOT" in server.env || "PLUGIN_DATA" in server.env)) {
      addFinding(findings, "warning", "mcp_config.json", `Do not duplicate PLUGIN_ROOT/PLUGIN_DATA in env for "${serverName}".`);
    }
    for (const arg of server.args || []) {
      if (typeof arg !== "string") continue;
      if (arg.startsWith("${PLUGIN_ROOT}/")) {
        const rel = arg.slice("${PLUGIN_ROOT}/".length);
        if (!fs.existsSync(path.join(pluginRoot, rel))) {
          addFinding(findings, "error", "mcp_config.json", `Referenced MCP script missing: ${rel}`);
        }
      } else if (/^[A-Za-z]:\\|^\/Users\/|^\/home\//.test(arg)) {
        addFinding(findings, "error", "mcp_config.json", `Machine-specific absolute path disallowed in mcp_config.json: ${arg}`);
      }
    }
  }
}

function validateMarkdownLinks(pluginRoot, findings) {
  const files = collectMarkdownFiles(pluginRoot);
  const linkRe = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const file of files) {
    const relFile = path.relative(pluginRoot, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    let m;
    while ((m = linkRe.exec(content)) !== null) {
      const target = m[1].trim().split(/\s+/)[0].split("#")[0];
      if (!target || /^(?:https?:|mailto:|customization:\/\/|@)/i.test(target)) continue;
      const resolved = path.resolve(path.dirname(file), target);
      if (!fs.existsSync(resolved)) {
        addFinding(findings, "error", relFile, `Broken relative link: ${target}`);
      }
    }
  }
}

function validateCatalog(pluginRoot, findings) {
  const catalogPath = path.join(pluginRoot, "catalog", "addons.json");
  if (!fs.existsSync(catalogPath)) return;

  let catalog;
  try {
    catalog = parseJsonFile(catalogPath);
  } catch (err) {
    addFinding(findings, "error", "catalog/addons.json", `Invalid JSON: ${err.message}`);
    return;
  }

  if (!catalog.sdlcOverview || !Array.isArray(catalog.addons)) {
    addFinding(findings, "error", "catalog/addons.json", "Catalog requires `sdlcOverview` and `addons` array.");
    return;
  }

  const installManifest = readJsonSafe(path.join(pluginRoot, ".sdlc-install-manifest.json"));
  const excluded = new Set(Array.isArray(installManifest?.excludedModules) ? installManifest.excludedModules : []);

  for (const addon of catalog.addons) {
    for (const field of ["id", "name", "kind", "sdlcRole", "benefit"]) {
      if (typeof addon?.[field] !== "string" || !addon[field].trim()) {
        addFinding(findings, "error", "catalog/addons.json", `Addon "${addon?.id || "unknown"}" missing required "${field}".`);
      }
    }
    if (addon?.kind === "builtin-module") {
      if (!Array.isArray(addon.components)) {
        addFinding(findings, "error", "catalog/addons.json", `Built-in module "${addon.id}" missing components array.`);
        continue;
      }
      if (!excluded.has(addon.id)) {
        for (const comp of addon.components) {
          if (!fs.existsSync(path.join(pluginRoot, comp))) {
            addFinding(findings, "error", "catalog/addons.json", `Component "${comp}" for active module "${addon.id}" not found.`);
          }
        }
      }
    }
  }
}

export function validatePluginDir(pluginDir, strict = false) {
  const pluginRoot = path.resolve(pluginDir);
  const findings = [];
  validateManifest(pluginRoot, findings);
  validateRules(pluginRoot, findings);
  validateSkills(pluginRoot, findings);
  validateAgents(pluginRoot, findings);
  validateHooks(pluginRoot, findings);
  validateMcp(pluginRoot, findings);
  validateCatalog(pluginRoot, findings);
  validateMarkdownLinks(pluginRoot, findings);

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const ok = errors.length === 0 && (!strict || warnings.length === 0);
  return { mode: "plugin", pluginRoot, strict, ok, errors: errors.length, warnings: warnings.length, findings };
}

export function auditSdlcWorkspace(repoDir) {
  const root = path.resolve(repoDir);
  const sdlcRoot = path.join(root, ".sdlc");
  const findings = [];

  if (!fs.existsSync(sdlcRoot)) {
    addFinding(findings, "error", ".sdlc", "Missing .sdlc directory. Run scripts/init-sdlc.mjs first.");
    return { mode: "sdlc", workspaceRoot: root, ok: false, errors: 1, warnings: 0, findings, stages: {}, traceability: {} };
  }

  if (!fs.existsSync(path.join(sdlcRoot, "CONTEXT.md"))) {
    addFinding(findings, "error", ".sdlc/CONTEXT.md", "Missing root ICM CONTEXT.md.");
  }

  const profilePath = path.join(sdlcRoot, "profile.json");
  let profile = null;
  if (!fs.existsSync(profilePath)) {
    addFinding(findings, "error", ".sdlc/profile.json", "Missing profile.json.");
  } else {
    try {
      profile = parseJsonFile(profilePath);
      if (!PROFILES[profile.profile]) {
        addFinding(findings, "error", ".sdlc/profile.json", `Unknown profile "${profile.profile}".`);
      }
    } catch (err) {
      addFinding(findings, "error", ".sdlc/profile.json", `Invalid JSON: ${err.message}`);
    }
  }

  for (const factoryDir of ["_shared", "_templates"]) {
    if (!fs.existsSync(path.join(sdlcRoot, factoryDir))) {
      addFinding(findings, "error", `.sdlc/${factoryDir}`, `Missing ICM factory directory ${factoryDir}/.`);
    }
  }

  const stages = {};
  const definedIds = { REQ: new Set(), ADR: new Set(), THR: new Set(), SPEC: new Set() };
  const referencedIds = { REQ: new Set(), ADR: new Set(), THR: new Set(), SPEC: new Set() };

  for (const stage of STAGE_DIRS) {
    const stagePath = path.join(sdlcRoot, stage.dir);
    const contextPath = path.join(stagePath, "CONTEXT.md");
    const outputPath = path.join(stagePath, "output");
    if (!fs.existsSync(contextPath)) {
      addFinding(findings, "error", `.sdlc/${stage.dir}/CONTEXT.md`, "Missing stage CONTEXT.md contract.");
    } else {
      const ctx = fs.readFileSync(contextPath, "utf8");
      for (const section of ["## Inputs", "## Process", "## Outputs", "## Human check"]) {
        if (!ctx.includes(section)) {
          addFinding(findings, "warning", `.sdlc/${stage.dir}/CONTEXT.md`, `Stage contract missing "${section}".`);
        }
      }
    }
    const outputFiles = fs.existsSync(outputPath)
      ? fs.readdirSync(outputPath).filter((f) => f !== ".gitkeep" && !f.startsWith("."))
      : [];
    stages[stage.dir] = outputFiles;

    for (const fileName of outputFiles) {
      if (!fileName.toLowerCase().endsWith(".md")) continue;
      const body = fs.readFileSync(path.join(outputPath, fileName), "utf8");
      const matches = body.match(/\b(?:REQ|ADR|THR|SPEC)-\d+\b/g) || [];
      for (const id of matches) {
        const prefix = id.split("-")[0];
        if (
          (stage.dir === "01_requirements" && prefix === "REQ") ||
          (stage.dir === "02_architecture" && prefix === "ADR") ||
          (stage.dir === "03_threat_model" && prefix === "THR") ||
          (stage.dir === "04_specification" && prefix === "SPEC")
        ) {
          definedIds[prefix].add(id);
        } else {
          referencedIds[prefix].add(id);
        }
      }
    }
  }

  const proofPath = path.join(sdlcRoot, "06_verification", "output", "proof-status.json");
  let proofStatus = null;
  if (!fs.existsSync(proofPath)) {
    addFinding(findings, "warning", ".sdlc/06_verification/output/proof-status.json", "Missing proof-status.json.");
  } else {
    try {
      proofStatus = parseJsonFile(proofPath);
      if (typeof proofStatus.active !== "boolean" || !Array.isArray(proofStatus.items)) {
        addFinding(findings, "error", ".sdlc/06_verification/output/proof-status.json", "proof-status.json requires boolean `active` and array `items`.");
      } else {
        for (const item of proofStatus.items) {
          if (typeof item?.command === "string" && /(?:[A-Za-z]:[\\/]+Users[\\/]+|\/Users\/|\/home\/)/i.test(item.command)) {
            addFinding(
              findings,
              "warning",
              ".sdlc/06_verification/output/proof-status.json",
              `Proof item "${item.id || "PROOF"}" uses a machine-specific user path in command; prefer portable "npx github:The-Arabian-knights/AIToolbox verify --target . --write-proof" or "universal-sdlc verify".`
            );
          }
        }
      }
    } catch (err) {
      addFinding(findings, "error", ".sdlc/06_verification/output/proof-status.json", `Invalid JSON: ${err.message}`);
    }
  }

  for (const [prefix, refs] of Object.entries(referencedIds)) {
    for (const ref of refs) {
      if (!definedIds[prefix].has(ref)) {
        addFinding(findings, "warning", ".sdlc", `Referenced ${ref} has no defining artifact in its source stage output/.`);
      }
    }
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  return {
    mode: "sdlc",
    workspaceRoot: root,
    profile: profile?.profile || null,
    ok: errors.length === 0,
    errors: errors.length,
    warnings: warnings.length,
    stages,
    proofActive: Boolean(proofStatus?.active),
    traceability: {
      defined: Object.fromEntries(Object.entries(definedIds).map(([k, v]) => [k, [...v]])),
      referenced: Object.fromEntries(Object.entries(referencedIds).map(([k, v]) => [k, [...v]]))
    },
    findings
  };
}

function parseCliArgs(argv) {
  const opts = { strict: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--plugin" && argv[i + 1]) opts.plugin = argv[++i];
    else if (a === "--sdlc" && argv[i + 1]) opts.sdlc = argv[++i];
    else throw new Error(`Unknown or incomplete option: ${a}`);
  }
  return opts;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help || (!opts.plugin && !opts.sdlc)) {
    console.log(`Usage:
  node scripts/check-contracts.mjs --plugin <plugin-dir> [--strict] [--json]
  node scripts/check-contracts.mjs --sdlc <repo-dir> [--json]`);
    if (!opts.help) process.exit(1);
    return;
  }

  const result = opts.plugin
    ? validatePluginDir(opts.plugin, opts.strict)
    : auditSdlcWorkspace(opts.sdlc);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[${result.mode.toUpperCase()}] ok=${result.ok} errors=${result.errors} warnings=${result.warnings}`);
    for (const f of result.findings) {
      console.log(`  ${f.severity.toUpperCase()} [${f.file}] ${f.message}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try {
    main();
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

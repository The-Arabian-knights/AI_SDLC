import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSdlcWorkspace } from "./check-contracts.mjs";
import { initSdlcWorkspace } from "./init-sdlc.mjs";
import { createOverrideRule, listAddonStatus, resolveInstallLayout } from "./lib/addons.mjs";
import { BASELINE_GATES, PROFILES } from "./lib/profiles.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TOOLS = [
  {
    name: "sdlc_init",
    description: "Initialize an isolated ICM .sdlc/ workspace and profile.json inside an existing target repository.",
    inputSchema: {
      type: "object",
      required: ["workspacePath", "profile"],
      properties: {
        workspacePath: { type: "string", description: "Absolute path to the target project workspace." },
        profile: {
          type: "string",
          enum: ["web-enterprise", "backend-api", "mobile", "desktop", "game-engine"],
          description: "Project verification profile."
        },
        projectName: { type: "string", description: "Optional project name (defaults to folder name)." },
        strictDesignGate: { type: "boolean", description: "Require ADR + THREAT confirmation before editing production files." },
        force: { type: "boolean", description: "Overwrite existing .sdlc/ contracts and profile.json." }
      }
    }
  },
  {
    name: "sdlc_status",
    description: "Inspect a repository's .sdlc/ profile, ICM stage outputs, Graphify index status, and Proof Checklist completion.",
    inputSchema: {
      type: "object",
      required: ["workspacePath"],
      properties: {
        workspacePath: { type: "string", description: "Absolute path to the target project workspace." }
      }
    }
  },
  {
    name: "sdlc_check_traceability",
    description: "Audit REQ -> ADR -> THR -> SPEC cross-references and ICM CONTEXT.md contracts in a repository.",
    inputSchema: {
      type: "object",
      required: ["workspacePath"],
      properties: {
        workspacePath: { type: "string", description: "Absolute path to the target project workspace." }
      }
    }
  },
  {
    name: "sdlc_list_profiles",
    description: "List supported Universal SDLC project profiles and their baseline + profile-specific verification gates.",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", description: "Optional profile name filter (web-enterprise, backend-api, mobile, desktop, game-engine)." }
      }
    }
  },
  {
    name: "sdlc_list_addons",
    description: "List all built-in SDLC modules, optional companion tools, their SDLC roles/benefits, and active override rules.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["global", "workspace"], description: "Plugin install scope (default: global)." },
        workspacePath: { type: "string", description: "Optional workspace path for workspace-scoped installs." },
        installDir: { type: "string", description: "Optional explicit plugin install directory override." },
        overridesDir: { type: "string", description: "Optional explicit overrides directory path." }
      }
    }
  },
  {
    name: "sdlc_tweak_addon",
    description: "Create or update an update-safe custom SDLC rule/explanation override and sync it into the active plugin.",
    inputSchema: {
      type: "object",
      required: ["name", "body"],
      properties: {
        name: { type: "string", description: "Kebab-case rule identifier (e.g. team-clarity)." },
        description: { type: "string", description: "Short summary of when the override rule applies." },
        body: { type: "string", description: "Markdown rule or custom SDLC guidance body." },
        trigger: { type: "string", enum: ["always_on", "model_decision", "glob", "manual"], description: "Rule activation mode (default: always_on)." },
        scope: { type: "string", enum: ["global", "workspace"], description: "Plugin install scope (default: global)." },
        workspacePath: { type: "string", description: "Optional workspace path for workspace-scoped installs." },
        installDir: { type: "string", description: "Optional explicit plugin install directory override." },
        overridesDir: { type: "string", description: "Optional explicit overrides directory path." }
      }
    }
  }
];

function parseCliArgs(argv) {
  let dataDir = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--data-dir" && argv[i + 1]) dataDir = argv[++i];
  }
  return { dataDir };
}

function sendMessage(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function sendResult(id, result) {
  sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  sendMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function runTool(name, args) {
  if (name === "sdlc_init") {
    const workspacePath = args?.workspacePath;
    if (!workspacePath || typeof workspacePath !== "string" || !fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
      return {
        isError: true,
        data: { error: `Workspace directory does not exist: ${workspacePath || "(empty)"}` }
      };
    }
    try {
      const result = initSdlcWorkspace({
        target: workspacePath,
        profile: args.profile,
        projectName: args.projectName,
        strictDesignGate: Boolean(args.strictDesignGate),
        force: Boolean(args.force)
      });
      return { isError: false, data: result };
    } catch (err) {
      return { isError: true, data: { error: err.message } };
    }
  }

  if (name === "sdlc_list_profiles") {
    if (args?.profile) {
      const def = PROFILES[args.profile];
      if (!def) {
        return { isError: true, data: { error: `Unknown profile: ${args.profile}`, available: Object.keys(PROFILES) } };
      }
      return { isError: false, data: { baselineGates: BASELINE_GATES, profile: def } };
    }
    return { isError: false, data: { baselineGates: BASELINE_GATES, profiles: Object.values(PROFILES) } };
  }

  if (name === "sdlc_status" || name === "sdlc_check_traceability") {
    const workspacePath = args?.workspacePath;
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      return { isError: true, data: { error: `Workspace path does not exist: ${workspacePath || "(empty)"}` } };
    }
    const audit = auditSdlcWorkspace(workspacePath);
    if (name === "sdlc_check_traceability") {
      return {
        isError: false,
        data: {
          ok: audit.ok,
          traceability: audit.traceability,
          findings: audit.findings
        }
      };
    }
    const hasGraphify =
      fs.existsSync(path.join(workspacePath, "graphify-out", "graph.json")) ||
      fs.existsSync(path.join(workspacePath, "graphify-out", "GRAPH_REPORT.md"));
    return {
      isError: false,
      data: {
        ...audit,
        hasGraphify
      }
    };
  }

  if (name === "sdlc_list_addons") {
    try {
      const layout = resolveInstallLayout({
        scope: args?.scope || "global",
        dest: args?.installDir || (args?.scope ? "" : PLUGIN_ROOT),
        overridesDir: args?.overridesDir || "",
        cwd: args?.workspacePath || process.cwd()
      });
      return {
        isError: false,
        data: listAddonStatus({ sourceRoot: PLUGIN_ROOT, ...layout })
      };
    } catch (err) {
      return { isError: true, data: { error: err.message } };
    }
  }

  if (name === "sdlc_tweak_addon") {
    try {
      const layout = resolveInstallLayout({
        scope: args?.scope || "global",
        dest: args?.installDir || (args?.scope ? "" : PLUGIN_ROOT),
        overridesDir: args?.overridesDir || "",
        cwd: args?.workspacePath || process.cwd()
      });
      const result = createOverrideRule({
        overridesDir: layout.overridesDir,
        destination: layout.destination,
        name: args?.name,
        trigger: args?.trigger || "always_on",
        description: args?.description || "",
        body: args?.body || ""
      });
      return { isError: false, data: result };
    } catch (err) {
      return { isError: true, data: { error: err.message } };
    }
  }

  return { isError: true, data: { error: `Unknown tool: ${name}` } };
}

function handleRequest(req, dataDir) {
  if (!req || typeof req !== "object") return;
  const hasId = req.id !== undefined && req.id !== null;
  const method = req.method;

  if (method === "initialize") {
    if (dataDir) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {
        // Ignore non-writable dataDir if unmounted during test
      }
    }
    sendResult(req.id, {
      protocolVersion: req.params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "universal-sdlc-ledger", version: "1.0.0" }
    });
    return;
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return;
  }

  if (method === "ping") {
    if (hasId) sendResult(req.id, {});
    return;
  }

  if (method === "tools/list") {
    sendResult(req.id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const toolName = req.params?.name;
    const toolArgs = req.params?.arguments || {};
    const outcome = runTool(toolName, toolArgs);
    sendResult(req.id, {
      content: [{ type: "text", text: JSON.stringify(outcome.data, null, 2) }],
      isError: outcome.isError
    });
    return;
  }

  if (hasId) {
    sendError(req.id, -32601, `Method not found: ${method}`);
  }
}

function main() {
  const { dataDir } = parseCliArgs(process.argv.slice(2));
  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) break;
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      if (line.toLowerCase().startsWith("content-length:")) continue;
      try {
        handleRequest(JSON.parse(line), dataDir);
      } catch (err) {
        sendError(null, -32700, `Parse error: ${err.message}`);
      }
    }
  });
}

main();

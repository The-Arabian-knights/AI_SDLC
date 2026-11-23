import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { auditSdlcWorkspace, validatePluginDir } from "./check-contracts.mjs";
import { initSdlcWorkspace } from "./init-sdlc.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "universal-sdlc-test-"));

after(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

function runNode(scriptRelPath, args = [], { cwd = REPO_ROOT, input = undefined } = {}) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, scriptRelPath), ...args], {
    cwd,
    input,
    encoding: "utf8",
    timeout: 20000
  });
}

function collectMjsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMjsFiles(full, out);
    else if (entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

describe("Universal AI SDLC Plugin", () => {
  it("passes syntax checks for all scripts/*.mjs files", () => {
    const files = collectMjsFiles(path.join(REPO_ROOT, "scripts"));
    assert.ok(files.length >= 12);
    for (const file of files) {
      const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
      assert.equal(res.status, 0, `Syntax failure in ${file}: ${res.stderr}`);
    }
  });

  it("passes strict plugin contract validation with 0 errors and 0 warnings", () => {
    const result = validatePluginDir(REPO_ROOT, true);
    assert.equal(result.ok, true, JSON.stringify(result.findings, null, 2));
    assert.equal(result.errors, 0);
    assert.equal(result.warnings, 0);
  });

  it("scaffolds .sdlc/, audits traceability, and warns on non-portable proof commands", () => {
    const repo = path.join(TMP_ROOT, "web-proj");
    fs.mkdirSync(repo, { recursive: true });
    const init = initSdlcWorkspace({
      target: repo,
      profile: "web-enterprise",
      projectName: "demo-web",
      strictDesignGate: true
    });
    assert.equal(init.status, "initialized");
    assert.equal(init.filesWritten, 27);

    const auditClean = auditSdlcWorkspace(repo);
    assert.equal(auditClean.ok, true);
    assert.equal(auditClean.errors, 0);
    assert.equal(auditClean.warnings, 0);

    // Inject a machine-specific home path into proof-status.json and assert portability warning fires
    const proofPath = path.join(repo, ".sdlc", "06_verification", "output", "proof-status.json");
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    proof.items.push({
      id: "PROOF-999",
      description: "Non-portable path check",
      command: "node C:/Users/example/.gemini/config/plugins/universal-sdlc/scripts/verify-profile.mjs --target .",
      required: true,
      status: "pending"
    });
    fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

    const auditWarn = auditSdlcWorkspace(repo);
    assert.equal(auditWarn.ok, true);
    assert.equal(auditWarn.warnings, 1);
    assert.match(auditWarn.findings[0].message, /machine-specific user path/i);

    const dryVerify = runNode("scripts/verify-profile.mjs", ["--target", repo, "--dry-run"]);
    assert.equal(dryVerify.status, 0, dryVerify.stderr);
    const verifyReport = JSON.parse(dryVerify.stdout);
    assert.equal(verifyReport.profile, "web-enterprise");
    assert.equal(verifyReport.summary.total, 10);
  });

  it("enforces SessionStart, PreToolUse, PostToolUse, and Stop hook contracts", () => {
    const repo = path.join(TMP_ROOT, "hook-proj");
    fs.mkdirSync(repo, { recursive: true });
    initSdlcWorkspace({ target: repo, profile: "backend-api", projectName: "hook-api", strictDesignGate: true });

    const ss = runNode("scripts/hooks/session-start.mjs", [], {
      input: JSON.stringify({ cwd: repo, workspacePaths: [repo], hookEventName: "SessionStart" })
    });
    assert.equal(ss.status, 0);
    assert.match(ss.stdout, /backend-api/);

    const rmDeny = runNode("scripts/hooks/pre-tool-guard.mjs", [], {
      input: JSON.stringify({ cwd: repo, toolCall: { name: "run_command", args: { CommandLine: "rm -rf /" } } })
    });
    assert.equal(JSON.parse(rmDeny.stdout).decision, "deny");

    const npmAllow = runNode("scripts/hooks/pre-tool-guard.mjs", [], {
      input: JSON.stringify({ cwd: repo, toolCall: { name: "run_command", args: { CommandLine: "npm test" } } })
    });
    assert.equal(JSON.parse(npmAllow.stdout).decision, "allow");

    const envDeny = runNode("scripts/hooks/pre-tool-guard.mjs", [], {
      input: JSON.stringify({
        cwd: repo,
        toolCall: { name: "write_to_file", args: { TargetFile: path.join(repo, ".env"), CodeContent: "KEY=1" } }
      })
    });
    assert.equal(JSON.parse(envDeny.stdout).decision, "deny");

    const fakeAwsKey = "AKIA" + "IOSFODNN7EXAMPLE";
    const secretDeny = runNode("scripts/hooks/pre-tool-guard.mjs", [], {
      input: JSON.stringify({
        cwd: repo,
        toolCall: { name: "write_to_file", args: { TargetFile: path.join(repo, "src/a.ts"), CodeContent: fakeAwsKey } }
      })
    });
    assert.equal(JSON.parse(secretDeny.stdout).decision, "deny");

    const gateAsk = runNode("scripts/hooks/pre-tool-guard.mjs", [], {
      input: JSON.stringify({
        cwd: repo,
        toolCall: { name: "write_to_file", args: { TargetFile: path.join(repo, "src/app.ts"), CodeContent: "export const ok = 1;" } }
      })
    });
    assert.equal(JSON.parse(gateAsk.stdout).decision, "ask");

    const post = runNode("scripts/hooks/post-tool-check.mjs", [], {
      input: JSON.stringify({ cwd: repo, toolCall: { name: "write_to_file", args: { TargetFile: path.join(repo, ".sdlc/CONTEXT.md") } } })
    });
    assert.equal(post.status, 0);
    assert.equal(fs.existsSync(path.join(repo, ".sdlc", ".runtime", "hook-audit.jsonl")), true);

    const stopInactive = runNode("scripts/hooks/stop-proof-gate.mjs", [], {
      input: JSON.stringify({ cwd: repo, continuationActive: false, terminationReason: "NO_TOOL_CALL" })
    });
    assert.equal(JSON.parse(stopInactive.stdout).decision, "allow");

    const proofPath = path.join(repo, ".sdlc", "06_verification", "output", "proof-status.json");
    fs.writeFileSync(
      proofPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        active: true,
        enforceOnStop: true,
        specId: "SPEC-001",
        items: [{ id: "PROOF-001", description: "Unit tests", command: "npm test", required: true, status: "pending" }]
      }),
      "utf8"
    );

    const stopPending = runNode("scripts/hooks/stop-proof-gate.mjs", [], {
      input: JSON.stringify({ cwd: repo, continuationActive: false, terminationReason: "NO_TOOL_CALL" })
    });
    assert.equal(JSON.parse(stopPending.stdout).decision, "continue");

    const stopLoopGuard = runNode("scripts/hooks/stop-proof-gate.mjs", [], {
      input: JSON.stringify({ cwd: repo, continuationActive: true, terminationReason: "NO_TOOL_CALL" })
    });
    assert.equal(JSON.parse(stopLoopGuard.stdout).decision, "allow");
  });

  it("supports interactive wizard, modular add/remove, update-safe overrides, and dry-run companions", () => {
    const wizDest = path.join(TMP_ROOT, "wiz-plugin");
    const wizOverrides = path.join(TMP_ROOT, "wiz-overrides");
    const answers = ["y", "n", "y", "y", "n", "n", "n", "n", "n", "n", "n"].join("\n") + "\n";

    const wizRes = runNode(
      "scripts/cli.mjs",
      ["install", "--interactive", "--dest", wizDest, "--overrides-dir", wizOverrides],
      { input: answers }
    );
    assert.equal(wizRes.status, 0, wizRes.stderr);
    assert.match(wizRes.stdout, /Pipeline:/);
    assert.match(wizRes.stdout, /Role:/);
    assert.match(wizRes.stdout, /Benefit:/);
    assert.equal(fs.existsSync(path.join(wizDest, "skills", "graphify-context")), false);
    assert.equal(fs.existsSync(path.join(wizDest, "hooks.json")), false);
    assert.equal(validatePluginDir(wizDest, true).ok, true);

    const modDest = path.join(TMP_ROOT, "mod-plugin");
    const modOverrides = path.join(TMP_ROOT, "mod-overrides");

    const modInit = runNode("scripts/cli.mjs", [
      "install", "--yes", "--exclude", "graphify-context,triage-and-evolve", "--dest", modDest, "--overrides-dir", modOverrides
    ]);
    assert.equal(modInit.status, 0, modInit.stderr);
    assert.equal(validatePluginDir(modDest, true).ok, true);

    const tweak = runNode("scripts/cli.mjs", [
      "addons", "tweak", "--create-rule", "team-clarity", "--description", "Plain English", "--body", "Explain trade-offs.",
      "--dest", modDest, "--overrides-dir", modOverrides
    ]);
    assert.equal(tweak.status, 0, tweak.stderr);
    assert.equal(fs.existsSync(path.join(modDest, "rules", "custom-team-clarity.md")), true);

    const forceUpdate = runNode("scripts/cli.mjs", [
      "install", "--yes", "--force", "--dest", modDest, "--overrides-dir", modOverrides
    ]);
    assert.equal(forceUpdate.status, 0, forceUpdate.stderr);
    assert.equal(fs.existsSync(path.join(modDest, "rules", "custom-team-clarity.md")), true);
    assert.equal(validatePluginDir(modDest, true).ok, true);

    const dryCompanion = runNode("scripts/cli.mjs", [
      "addons", "add", "companion-graphify", "--dry-run", "--dest", modDest, "--overrides-dir", modOverrides
    ]);
    assert.equal(dryCompanion.status, 0, dryCompanion.stderr);
  });

  it("handles MCP JSON-RPC requests across all 6 tools", () => {
    const mcpProj = path.join(TMP_ROOT, "mcp-proj");
    const mcpInstall = path.join(TMP_ROOT, "mcp-plugin");
    const mcpOverrides = path.join(TMP_ROOT, "mcp-overrides");
    const mcpData = path.join(TMP_ROOT, "mcp-data");
    fs.mkdirSync(mcpProj, { recursive: true });

    runNode("scripts/cli.mjs", ["install", "--yes", "--dest", mcpInstall, "--overrides-dir", mcpOverrides]);

    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "sdlc_init", arguments: { workspacePath: mcpProj, profile: "mobile", projectName: "demo-mobile" } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "sdlc_status", arguments: { workspacePath: mcpProj } } },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "sdlc_list_addons", arguments: { installDir: mcpInstall, overridesDir: mcpOverrides } } },
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "sdlc_tweak_addon", arguments: { name: "ci-rule", description: "CI test rule", body: "# CI Rule\nKeep tests fast.", installDir: mcpInstall, overridesDir: mcpOverrides } } }
    ];

    const res = runNode("scripts/mcp-sdlc-server.mjs", ["--data-dir", mcpData], {
      input: requests.map((r) => JSON.stringify(r)).join("\n") + "\n"
    });
    assert.equal(res.status, 0, res.stderr);
    const lines = res.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(lines.length, 6);
    const toolNames = lines[1].result.tools.map((t) => t.name);
    assert.deepEqual(toolNames, [
      "sdlc_init",
      "sdlc_status",
      "sdlc_check_traceability",
      "sdlc_list_profiles",
      "sdlc_list_addons",
      "sdlc_tweak_addon"
    ]);
    assert.equal(JSON.parse(lines[2].result.content[0].text).profile, "mobile");
    assert.equal(JSON.parse(lines[3].result.content[0].text).ok, true);
    assert.equal(JSON.parse(lines[4].result.content[0].text).installed, true);
    assert.equal(fs.existsSync(path.join(mcpInstall, "rules", "custom-ci-rule.md")), true);
  });
});

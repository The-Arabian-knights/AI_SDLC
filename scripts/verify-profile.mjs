import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isToolAvailable, parseJsonFile } from "./lib/hook-io.mjs";
import { BASELINE_GATES, PROFILES } from "./lib/profiles.mjs";

function parseArgs(argv) {
  const opts = { dryRun: false, strict: false, writeProof: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--write-proof") opts.writeProof = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--target" && argv[i + 1]) opts.target = argv[++i];
    else if (a === "--profile" && argv[i + 1]) opts.profile = argv[++i];
    else throw new Error(`Unknown or incomplete option: ${a}`);
  }
  return opts;
}

function defaultScannerCommand(tool) {
  if (tool === "gitleaks") return "gitleaks detect --no-git -s .";
  if (tool === "trufflehog") return "trufflehog filesystem . --fail";
  if (tool === "semgrep") return "semgrep --config auto --error .";
  if (tool === "trivy") return "trivy fs --exit-code 1 --severity HIGH,CRITICAL .";
  return "";
}

function runCommandSafe(command, cwd) {
  const started = Date.now();
  try {
    const out = execSync(command, { cwd, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
    return { status: "passed", exitCode: 0, durationMs: Date.now() - started, summary: out.trim().split("\n").slice(-5).join(" | ") };
  } catch (err) {
    const combined = `${err?.stdout || ""}\n${err?.stderr || ""}`.trim();
    return {
      status: "failed",
      exitCode: err?.status ?? 1,
      durationMs: Date.now() - started,
      summary: combined.split("\n").slice(-8).join(" | ") || err.message
    };
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.target) {
    console.log(`Usage: node scripts/verify-profile.mjs --target <dir> [--profile <name>] [--dry-run] [--strict] [--write-proof] [--json]`);
    if (!opts.help) process.exit(1);
    return;
  }

  const targetRoot = path.resolve(opts.target);
  const profilePath = path.join(targetRoot, ".sdlc", "profile.json");
  let loadedProfile = null;
  if (fs.existsSync(profilePath)) {
    loadedProfile = parseJsonFile(profilePath);
  }

  const profileName = opts.profile || loadedProfile?.profile || "backend-api";
  const profileDef = PROFILES[profileName];
  if (!profileDef) {
    throw new Error(`Unknown profile "${profileName}". Expected one of: ${Object.keys(PROFILES).join(", ")}`);
  }

  const commands = { ...profileDef.defaultCommands, ...(loadedProfile?.commands || {}) };
  const allGates = [
    ...BASELINE_GATES.map((g) => ({ ...g, scope: "baseline" })),
    ...profileDef.specificGates.map((g) => ({ ...g, scope: `profile:${profileName}` }))
  ];

  const results = [];
  for (const gate of allGates) {
    let command = (commands[gate.commandKey] || "").trim();
    let source = "configured";

    if (!command && Array.isArray(gate.autoDetectTools) && gate.autoDetectTools.length > 0) {
      const detected = gate.autoDetectTools.find((t) => isToolAvailable(t));
      if (detected) {
        command = defaultScannerCommand(detected);
        source = `auto-detected (${detected})`;
      }
    }

    if (!command) {
      const missingMsg =
        gate.autoDetectTools?.length > 0
          ? `not configured and none of [${gate.autoDetectTools.join(", ")}] installed on PATH`
          : "command not configured in .sdlc/profile.json";
      results.push({ id: gate.id, title: gate.title, scope: gate.scope, status: "skipped", reason: missingMsg });
      continue;
    }

    if (opts.dryRun) {
      results.push({ id: gate.id, title: gate.title, scope: gate.scope, status: "planned", source, command });
      continue;
    }

    const execResult = runCommandSafe(command, targetRoot);
    results.push({ id: gate.id, title: gate.title, scope: gate.scope, source, command, ...execResult });
  }

  const failedCount = results.filter((r) => r.status === "failed").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const passedCount = results.filter((r) => r.status === "passed").length;
  const ok = failedCount === 0 && (!opts.strict || skippedCount === 0);

  const report = {
    generatedAt: new Date().toISOString(),
    targetRoot,
    profile: profileName,
    dryRun: opts.dryRun,
    ok,
    summary: { passed: passedCount, failed: failedCount, skipped: skippedCount, total: results.length },
    gates: results
  };

  if (opts.writeProof && !opts.dryRun) {
    const outDir = path.join(targetRoot, ".sdlc", "06_verification", "output");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "profile-gate-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (opts.json || opts.dryRun) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[VERIFY:${profileName}] ok=${ok} passed=${passedCount} failed=${failedCount} skipped=${skippedCount}`);
    for (const r of results) {
      console.log(`  ${r.status.toUpperCase()} [${r.id}] ${r.reason || r.summary || r.command || ""}`);
    }
  }
  process.exit(ok ? 0 : 1);
}

try {
  main();
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}

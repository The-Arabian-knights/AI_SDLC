import fs from "node:fs";
import path from "node:path";
import { STAGE_DIRS } from "../lib/profiles.mjs";
import {
  loadSdlcProfile,
  readJsonSafe,
  readStdinJson,
  resolveWorkspaceRoot,
  writeStdoutJson
} from "../lib/hook-io.mjs";

function countStageArtifacts(workspaceRoot) {
  const counts = [];
  for (const stage of STAGE_DIRS) {
    const outDir = path.join(workspaceRoot, ".sdlc", stage.dir, "output");
    if (!fs.existsSync(outDir)) continue;
    const files = fs
      .readdirSync(outDir)
      .filter((name) => name !== ".gitkeep" && !name.startsWith("."));
    if (files.length > 0) counts.push(`${stage.dir}:${files.length}`);
  }
  return counts;
}

async function main() {
  const payload = await readStdinJson();
  const workspaceRoot = resolveWorkspaceRoot(payload);
  if (!workspaceRoot) {
    writeStdoutJson({});
    return;
  }

  const profile = loadSdlcProfile(workspaceRoot);
  const hasGraphJson = fs.existsSync(path.join(workspaceRoot, "graphify-out", "graph.json"));
  const hasGraphReport = fs.existsSync(path.join(workspaceRoot, "graphify-out", "GRAPH_REPORT.md"));
  const graphStatus = hasGraphJson || hasGraphReport
    ? "present (query graphify-out/ first via /graphify-context)"
    : "absent (use targeted static search fallback)";

  let message;
  if (!profile) {
    message = [
      `Universal SDLC active in ${workspaceRoot}.`,
      "No .sdlc/profile.json found yet; run /sdlc-init for full ICM stage artifacts & profile gates.",
      `Graphify: ${graphStatus}.`
    ].join(" ");
  } else {
    const stageCounts = countStageArtifacts(workspaceRoot);
    const proofPath = path.join(workspaceRoot, ".sdlc", "06_verification", "output", "proof-status.json");
    let proofSummary = "inactive";
    if (fs.existsSync(proofPath)) {
      const proof = readJsonSafe(proofPath);
      if (!proof) {
        proofSummary = "unreadable proof-status.json";
      } else if (proof.active) {
        const items = Array.isArray(proof.items) ? proof.items : [];
        const pending = items.filter((i) => i.required !== false && i.status !== "passed").length;
        proofSummary = `active (${proof.specId || "SPEC"}, ${pending} required item(s) pending)`;
      }
    }
    message = [
      `Universal SDLC [${profile.profile}] active for "${profile.projectName || "project"}"`,
      `(strictDesignGate=${Boolean(profile.strictDesignGate)}, enforceProofOnStop=${profile.enforceProofOnStop !== false}).`,
      `Graphify: ${graphStatus}.`,
      `Stage outputs: ${stageCounts.length > 0 ? stageCounts.join(", ") : "none yet"}.`,
      `Proof gate: ${proofSummary}.`
    ].join(" ");
  }

  writeStdoutJson({
    injectSteps: [
      {
        systemMessage: {
          systemMessage: message
        }
      }
    ]
  });
}

main().catch(() => {
  writeStdoutJson({});
});

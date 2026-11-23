import path from "node:path";
import {
  appendHookAudit,
  loadSdlcProfile,
  readJsonSafe,
  readStdinJson,
  resolveWorkspaceRoot,
  writeStdoutJson
} from "../lib/hook-io.mjs";

const BYPASS_TERMINATION_REASONS = new Set([
  "USER_CANCELED",
  "ERROR",
  "MAX_INVOCATIONS",
  "MAX_FORCED_INVOCATIONS",
  "MAX_TOKEN_BUDGET_EXCEEDED",
  "TERMINAL_CUSTOM_HOOK"
]);

async function main() {
  const payload = await readStdinJson();

  // Prevent infinite continuation loops or blocking user/system interrupts
  if (payload?.continuationActive === true || BYPASS_TERMINATION_REASONS.has(payload?.terminationReason)) {
    writeStdoutJson({ decision: "allow" });
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot(payload);
  if (!workspaceRoot) {
    writeStdoutJson({ decision: "allow" });
    return;
  }

  const profile = loadSdlcProfile(workspaceRoot);
  if (profile?.enforceProofOnStop === false) {
    writeStdoutJson({ decision: "allow" });
    return;
  }

  const proofPath = path.join(workspaceRoot, ".sdlc", "06_verification", "output", "proof-status.json");
  const proof = readJsonSafe(proofPath);
  if (!proof || proof?.active !== true || proof?.enforceOnStop === false) {
    writeStdoutJson({ decision: "allow" });
    return;
  }

  const items = Array.isArray(proof.items) ? proof.items : [];
  const incomplete = items.filter((item) => item && item.required !== false && item.status !== "passed");
  if (incomplete.length === 0) {
    writeStdoutJson({ decision: "allow" });
    return;
  }

  const summary = incomplete
    .map((item) => `${item.id || "PROOF"} (${item.status || "pending"}): ${item.description || item.command || "required check"}`)
    .join("; ");

  const response = {
    decision: "continue",
    reason: `Required Proof Checklist items are incomplete for ${proof.specId || "active task"}: ${summary}. Run the checks and update .sdlc/06_verification/output/proof-status.json before finishing.`
  };
  appendHookAudit(workspaceRoot, { hook: "Stop", ...response });
  writeStdoutJson(response);
}

main().catch(() => {
  writeStdoutJson({ decision: "allow" });
});

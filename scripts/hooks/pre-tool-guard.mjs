import fs from "node:fs";
import path from "node:path";
import {
  appendHookAudit,
  classifyDangerousCommand,
  detectSecretPatterns,
  isProductionCodePath,
  isProtectedSecretPath,
  loadSdlcProfile,
  readStdinJson,
  resolveWorkspaceRoot,
  writeStdoutJson
} from "../lib/hook-io.mjs";

function extractWriteContent(args) {
  if (!args || typeof args !== "object") return "";
  const parts = [];
  for (const key of ["CodeContent", "Content", "ReplacementContent", "Replacement"]) {
    if (typeof args[key] === "string") parts.push(args[key]);
  }
  if (Array.isArray(args.ReplacementChunks)) {
    for (const chunk of args.ReplacementChunks) {
      if (chunk && typeof chunk.ReplacementContent === "string") {
        parts.push(chunk.ReplacementContent);
      }
    }
  }
  return parts.join("\n");
}

function hasDesignAndThreatArtifacts(workspaceRoot) {
  const archDir = path.join(workspaceRoot, ".sdlc", "02_architecture", "output");
  const threatDir = path.join(workspaceRoot, ".sdlc", "03_threat_model", "output");
  const hasMd = (dir) =>
    fs.existsSync(dir) &&
    fs.readdirSync(dir).some((name) => name.toLowerCase().endsWith(".md"));
  return hasMd(archDir) && hasMd(threatDir);
}

async function main() {
  const payload = await readStdinJson();
  const toolName = payload?.toolCall?.name || "";
  const args = payload?.toolCall?.args || {};
  const workspaceRoot = resolveWorkspaceRoot(payload);

  if (toolName === "run_command") {
    const verdict = classifyDangerousCommand(args.CommandLine);
    if (verdict.decision !== "allow") {
      appendHookAudit(workspaceRoot, {
        hook: "PreToolUse",
        toolName,
        decision: verdict.decision,
        reason: verdict.reason
      });
    }
    writeStdoutJson(verdict);
    return;
  }

  const writeTools = new Set([
    "write_to_file",
    "replace_file_content",
    "multi_replace_file_content",
    "edit_file",
    "write_file"
  ]);

  if (writeTools.has(toolName)) {
    const targetPath = args.TargetFile ?? args.Path ?? args.AbsolutePath ?? "";
    if (isProtectedSecretPath(targetPath)) {
      const result = {
        decision: "deny",
        reason: `Blocked direct write to sensitive secret/key path "${path.basename(targetPath)}". Use environment variables or an example template instead.`
      };
      appendHookAudit(workspaceRoot, { hook: "PreToolUse", toolName, targetPath, ...result });
      writeStdoutJson(result);
      return;
    }

    const content = extractWriteContent(args);
    const secretHit = detectSecretPatterns(content);
    if (secretHit) {
      const result = {
        decision: "deny",
        reason: `Blocked write containing high-confidence secret pattern (${secretHit}). Read credentials from environment variables or a secret store.`
      };
      appendHookAudit(workspaceRoot, { hook: "PreToolUse", toolName, targetPath, ...result });
      writeStdoutJson(result);
      return;
    }

    const profile = loadSdlcProfile(workspaceRoot);
    if (
      profile?.strictDesignGate === true &&
      isProductionCodePath(targetPath) &&
      workspaceRoot &&
      !hasDesignAndThreatArtifacts(workspaceRoot)
    ) {
      const result = {
        decision: "ask",
        reason:
          "Strict design gate is enabled, and .sdlc/02_architecture/output/ or .sdlc/03_threat_model/output/ has no approved design/threat artifact yet. Confirm before editing production code."
      };
      appendHookAudit(workspaceRoot, { hook: "PreToolUse", toolName, targetPath, ...result });
      writeStdoutJson(result);
      return;
    }
  }

  writeStdoutJson({ decision: "allow" });
}

main().catch(() => {
  writeStdoutJson({ decision: "allow" });
});

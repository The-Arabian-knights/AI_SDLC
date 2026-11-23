import { execSync } from "node:child_process";
import path from "node:path";
import {
  appendHookAudit,
  loadSdlcProfile,
  readStdinJson,
  resolveWorkspaceRoot,
  writeStdoutJson
} from "../lib/hook-io.mjs";

async function main() {
  const payload = await readStdinJson();
  const toolName = payload?.toolCall?.name || "";
  const args = payload?.toolCall?.args || {};
  const targetPath = args.TargetFile ?? args.Path ?? args.AbsolutePath ?? "";
  const workspaceRoot = resolveWorkspaceRoot(payload);
  const profile = loadSdlcProfile(workspaceRoot);

  let fastCheckResult = null;
  if (!payload?.error && targetPath && workspaceRoot && Array.isArray(profile?.fastChecks)) {
    const ext = path.extname(String(targetPath)).toLowerCase();
    const matched = profile.fastChecks.find(
      (check) =>
        check &&
        typeof check.command === "string" &&
        check.command.trim() &&
        Array.isArray(check.extensions) &&
        check.extensions.map((e) => String(e).toLowerCase()).includes(ext)
    );
    if (matched) {
      const timeout = Math.min(Number(matched.timeoutMs) || 8000, 9500);
      try {
        execSync(matched.command, { cwd: workspaceRoot, timeout, stdio: "pipe" });
        fastCheckResult = { command: matched.command, status: "passed" };
      } catch (err) {
        fastCheckResult = {
          command: matched.command,
          status: "failed",
          code: err?.status ?? 1
        };
      }
    }
  }

  appendHookAudit(workspaceRoot, {
    hook: "PostToolUse",
    toolName,
    targetPath,
    toolError: payload?.error || "",
    fastCheck: fastCheckResult
  });

  writeStdoutJson({});
}

main().catch(() => {
  writeStdoutJson({});
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pure-Node cross-platform check for whether an executable exists on PATH.
 */
export function isToolAvailable(binName) {
  if (!binName || typeof binName !== "string") return false;
  const envPath = process.env.PATH || process.env.Path || "";
  const dirs = envPath.split(path.delimiter).filter(Boolean);
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate =
        process.platform === "win32" && !path.extname(binName)
          ? path.join(dir, `${binName}${ext}`)
          : path.join(dir, binName);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return true;
        }
      } catch {
        // Ignore unreadable PATH segments
      }
    }
  }
  return false;
}

/**
 * Reads and parses the Antigravity hook payload from stdin.
 * Returns {} on empty or malformed input so hooks never crash the agent loop.
 */
export async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeStdoutJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function normalizeCandidatePath(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return null;
  if (rawPath.startsWith("file://")) {
    try {
      return fileURLToPath(rawPath);
    } catch {
      return null;
    }
  }
  return path.resolve(rawPath);
}

/**
 * Resolves the workspace root from hook metadata, walking upward to find `.sdlc/`
 * or `.git/` when `cwd` is a subdirectory.
 */
export function resolveWorkspaceRoot(payload) {
  const candidates = [];
  if (payload?.cwd) candidates.push(payload.cwd);
  if (Array.isArray(payload?.workspacePaths)) {
    for (const wp of payload.workspacePaths) candidates.push(wp);
  }

  for (const raw of candidates) {
    const resolved = normalizeCandidatePath(raw);
    if (!resolved || !fs.existsSync(resolved)) continue;
    let cursor = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
    const startDir = cursor;
    while (true) {
      if (fs.existsSync(path.join(cursor, ".sdlc")) || fs.existsSync(path.join(cursor, ".git"))) {
        return cursor;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    return startDir;
  }
  return null;
}

export function parseJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

export function readJsonSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return parseJsonFile(filePath);
  } catch {
    return null;
  }
}

export function loadSdlcProfile(workspaceRoot) {
  if (!workspaceRoot) return null;
  return readJsonSafe(path.join(workspaceRoot, ".sdlc", "profile.json"));
}

export function appendHookAudit(workspaceRoot, entry) {
  if (!workspaceRoot) return;
  const sdlcDir = path.join(workspaceRoot, ".sdlc");
  if (!fs.existsSync(sdlcDir)) return;
  try {
    const runtimeDir = path.join(sdlcDir, ".runtime");
    fs.mkdirSync(runtimeDir, { recursive: true });
    const record = { ts: new Date().toISOString(), ...entry };
    fs.appendFileSync(path.join(runtimeDir, "hook-audit.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Non-fatal: audit logging must never block hook execution
  }
}

const DENY_CMD_RULES = [
  { re: /\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*[fF]\s+(?:\/(?:\s|$|\*)|~(?:\/|\s|$)|\*)/i, reason: "Blocked destructive recursive deletion against root, home, or wildcard." },
  { re: /\b(?:rmdir|rd)\s+\/s\s+\/q\s+[a-zA-Z]:\\(?:\s|$)/i, reason: "Blocked destructive recursive Windows drive deletion." },
  { re: /\bdel\s+\/[fFsSqQ\s]+[a-zA-Z]:\\(?:\s|$|\*)/i, reason: "Blocked destructive recursive Windows file deletion." },
  { re: /\bRemove-Item\b[^;\n]*\b-Recurse\b[^;\n]*\b-Force\b[^;\n]*[a-zA-Z]:\\(?:\s|$|\*)/i, reason: "Blocked destructive PowerShell drive wipe." },
  { re: /\b(?:mkfs(?:\.[a-z0-9]+)?|Format-Volume|dd\s+if=[^\n]*\bof=\/dev\/)\b/i, reason: "Blocked raw disk formatting or block-device overwrite." },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "Blocked shell fork bomb." },
  { re: /\bDROP\s+(?:DATABASE|SCHEMA)\b/i, reason: "Blocked destructive database/schema drop command." },
  { re: /\bgit\s+push\b[^\n]*(?:--force|-f)\b[^\n]*\b(?:main|master)\b/i, reason: "Blocked force-push to protected main/master branch." },
  { re: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash|zsh|pwsh|powershell)\b/i, reason: "Blocked remote pipe-to-shell execution." },
  { re: /\b(?:Invoke-Expression|iex)\s*\([^\n]*(?:Invoke-WebRequest|iwr|curl|wget)\b/i, reason: "Blocked remote download-and-execute PowerShell pattern." },
  { re: /\b(?:curl|wget|Invoke-WebRequest)\b[^\n]*(?:\.env\b|id_rsa|id_ed25519)/i, reason: "Blocked potential secret or private key exfiltration over network." }
];

const ASK_CMD_RULES = [
  { re: /\bgit\s+reset\s+--hard\b/i, reason: "Destructive git reset --hard discards uncommitted work." },
  { re: /\bgit\s+clean\s+-[a-zA-Z]*f/i, reason: "git clean -f permanently deletes untracked files." },
  { re: /\bgit\s+push\b[^\n]*(?:--force(?:-with-lease)?|-f)\b/i, reason: "Force push rewrites remote history." },
  { re: /\bterraform\s+(?:apply|destroy)\b/i, reason: "Terraform state mutation requires explicit operator confirmation." },
  { re: /\bkubectl\s+(?:delete|apply|replace)\b/i, reason: "Cluster mutation via kubectl requires explicit operator confirmation." },
  { re: /\b(?:prisma\s+migrate\s+deploy|alembic\s+upgrade|flyway\s+migrate)\b/i, reason: "Database schema migration requires explicit confirmation." }
];

export function classifyDangerousCommand(commandLine) {
  const cmd = String(commandLine || "").trim();
  if (!cmd) return { decision: "allow" };
  for (const rule of DENY_CMD_RULES) {
    if (rule.re.test(cmd)) return { decision: "deny", reason: rule.reason };
  }
  for (const rule of ASK_CMD_RULES) {
    if (rule.re.test(cmd)) return { decision: "force_ask", reason: rule.reason };
  }
  return { decision: "allow" };
}

const SECRET_PATTERNS = [
  { name: "AWS Access Key ID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "GitHub Personal Access Token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { name: "GitHub Fine-Grained PAT", re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { name: "Private Key Block", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "Slack API Token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: "Google API Key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: "Stripe Live Secret Key", re: /\bsk_live_[0-9A-Za-z]{16,}\b/ }
];

export function detectSecretPatterns(text) {
  const content = String(text || "");
  if (!content) return null;
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.re.test(content)) return pattern.name;
  }
  return null;
}

export function isProtectedSecretPath(filePath) {
  if (!filePath) return false;
  const normalized = String(filePath).replace(/\\/g, "/");
  const base = path.posix.basename(normalized).toLowerCase();
  if (
    base === ".env" ||
    (base.startsWith(".env.") && !/\.(?:example|sample|template|dist)$/i.test(base))
  ) {
    return true;
  }
  return /^(?:id_rsa|id_ed25519|id_ecdsa)$|\.(?:pem|key|p12|pfx|kdbx)$/i.test(base);
}

const PRODUCTION_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".kts",
  ".swift", ".cs", ".cpp", ".cc", ".cxx", ".c", ".h", ".hpp",
  ".dart", ".rb", ".php", ".vue", ".svelte"
]);

export function isProductionCodePath(filePath) {
  if (!filePath) return false;
  const normalized = String(filePath).replace(/\\/g, "/");
  const ext = path.posix.extname(normalized).toLowerCase();
  if (!PRODUCTION_EXTENSIONS.has(ext)) return false;
  if (/\/(?:\.sdlc|\.agents|docs|tests?|__tests__|spec|examples?)\//i.test(`/${normalized}`)) {
    return false;
  }
  const base = path.posix.basename(normalized).toLowerCase();
  if (/(?:\.test\.|\.spec\.|_test\.|test_)/i.test(base)) return false;
  return true;
}

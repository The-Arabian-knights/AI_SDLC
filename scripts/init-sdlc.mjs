import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProfileConfig, PROFILES, STAGE_DIRS } from "./lib/profiles.mjs";

function printHelp() {
  console.log(`Usage: node scripts/init-sdlc.mjs --target <dir> --profile <name> [options]

Options:
  --target <dir>          Target repository root to initialize (required)
  --profile <name>        Profile: ${Object.keys(PROFILES).join(" | ")} (required)
  --name <project>        Human-readable project name (defaults to directory name)
  --strict-design-gate    Enable PreToolUse confirmation before edits lacking ADR+THREAT
  --force                 Overwrite existing .sdlc/ contracts and profile.json
  --help                  Show this help message
`);
}

function parseArgs(argv) {
  const opts = { strictDesignGate: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--strict-design-gate") {
      opts.strictDesignGate = true;
    } else if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--target" && argv[i + 1]) {
      opts.target = argv[++i];
    } else if (arg === "--profile" && argv[i + 1]) {
      opts.profile = argv[++i];
    } else if (arg === "--name" && argv[i + 1]) {
      opts.name = argv[++i];
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return opts;
}

function writeFileSafe(filePath, content, force) {
  if (!force && fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function buildRootContext(projectName, profileName) {
  const stageRows = STAGE_DIRS.map(
    (s) => `| \`${s.dir}/\` | ${s.title} | \`${s.dir}/CONTEXT.md\` | \`${s.dir}/output/\` |`
  ).join("\n");
  return `# ${projectName} — Universal SDLC Workspace (${profileName})

## Pipeline Router (ICM)

| Stage | Purpose | Contract | Product Output |
| --- | --- | --- | --- |
${stageRows}

## Factory vs. Product Separation

- **Factory (stable across runs):** \`_shared/\` (invariants, observability, lessons learned) and \`_templates/\` (copyable starters).
- **Product (per change/run):** \`01_requirements/output/\` through \`07_release_maintenance/output/\` and \`profile.json\`.
- **State Machine:** Inspect stage \`output/\` directories and \`06_verification/output/proof-status.json\`.
`;
}

function buildStageContext(stage) {
  return `# ${stage.dir} — ${stage.title}

One job: ${stage.summary}

## Inputs
${stage.inputs.map((i) => `- ${i}`).join("\n")}

Do NOT load: ${stage.doNotLoad.join("; ")}.

## Process
${stage.processSteps.map((p, idx) => `${idx + 1}. ${p}`).join("\n")}

## Outputs
${stage.outputs.map((o) => `- ${o}`).join("\n")}

## Human check
${stage.humanCheck}
`;
}

const SHARED_FILES = {
  "sdlc-invariants.md": `# Project SDLC Invariants

1. Traceability: Every non-trivial change links \`REQ-NNN -> ADR-NNN -> THR-NNN -> SPEC-NNN -> PROOF-NNN\`.
2. Design Gate: Pass \`/egm-design-gate\` (\`arch-reviewer\`) and \`/threat-and-verify\` (\`security-reviewer\`) before production edits.
3. Zero-Trust Boundaries: Validate inputs, enforce authN/authZ, reject invalid state early, and never commit secrets.
4. Verifiable Proof: Record executed command results in \`06_verification/output/proof-status.json\` after the final edit.
`,
  "observability-standards.md": `# Observability & Error-Handling Standards

1. Emit structured logs (JSON or key-value) with correlation/request IDs at trust boundaries and failures.
2. Never log secrets, authorization headers, private keys, or unredacted sensitive PII.
3. Surface actionable error codes/reasons; never swallow exceptions silently.
4. Record telemetry/crash-reporting hooks appropriate to the active project profile.
`,
  "lessons-learned.md": `# Lessons Learned & Promoted Guardrails

Log recurring defects, drift incidents, and review findings below along with the permanent rule, script, or proof check added to prevent recurrence.

| Date | Incident / Finding | Root Cause | Promoted Rule / Check |
| --- | --- | --- | --- |
`
};

const TEMPLATE_FILES = {
  "req-template.md": `# Requirement: REQ-NNN — <Title>\n\n- **Status:** Draft | Approved\n- **Actors:** ...\n- **Scope & Acceptance Criteria:**\n  1. ...\n- **Explicit Non-Goals:**\n  1. ...\n`,
  "adr-template.md": `# Architecture Decision: ADR-NNN — <Title>\n\n- **Status:** Proposed | Approved\n- **Linked REQ:** REQ-NNN\n- **Boundaries & Blast Radius:** ...\n- **Invariants:** ...\n- **Alternatives Considered:** ...\n- **Fresh-Context Review (\`arch-reviewer\`):** PENDING\n`,
  "threat-template.md": `# Threat Model: THREAT-NNN — <Title>\n\n- **Tier:** Lightweight | Formal\n- **Linked ADR:** ADR-NNN\n- **Assets & Trust Boundaries:** ...\n- **Threats & Mitigations (\`THR-NNN\`):** ...\n- **Security Review (\`security-reviewer\`):** PENDING\n`,
  "spec-template.md": `# Specification: SPEC-NNN — <Title>\n\n- **Traceability:** REQ-NNN -> ADR-NNN -> THR-NNN\n- **Module Contracts:** ...\n- **Observability Hooks:** ...\n- **Mandatory Proof Checklist:**\n  - \`PROOF-001\`: ...\n`,
  "proof-template.md": `# Verification Proof: PROOF-NNN — <Title>\n\n- **Spec:** SPEC-NNN\n- **Commands Executed (Post-Final-Edit):** ...\n- **Observed Output Summary:** ...\n- **Proof Auditor Verdict:** PENDING\n`,
  "release-notes-template.md": `# Release Summary: RELEASE-NNN — <Title>\n\n- **Included Specs:** SPEC-NNN\n- **Proof Status:** Verified\n- **Migration / Rollback Notes:** ...\n`,
  "postmortem-template.md": `# Postmortem & Evolution: POSTMORTEM-NNN — <Title>\n\n- **Repro Test:** ...\n- **Root Cause & Drift Finding:** ...\n- **Promoted Permanent Guardrail:** Rule / Script / Proof check\n`
};

export function initSdlcWorkspace({
  target,
  profile,
  projectName,
  strictDesignGate = false,
  force = false
}) {
  if (!target || !profile) {
    throw new Error("Both target and profile are required.");
  }

  const targetRoot = path.resolve(target);
  const resolvedName = projectName || path.basename(targetRoot);
  const profileConfig = buildProfileConfig(profile, {
    projectName: resolvedName,
    strictDesignGate: Boolean(strictDesignGate)
  });

  const sdlcRoot = path.join(targetRoot, ".sdlc");
  let created = 0;

  if (writeFileSafe(path.join(sdlcRoot, "CONTEXT.md"), buildRootContext(resolvedName, profile), force)) created++;
  if (writeFileSafe(path.join(sdlcRoot, "profile.json"), `${JSON.stringify(profileConfig, null, 2)}\n`, force)) created++;

  for (const [name, body] of Object.entries(SHARED_FILES)) {
    if (writeFileSafe(path.join(sdlcRoot, "_shared", name), body, force)) created++;
  }
  for (const [name, body] of Object.entries(TEMPLATE_FILES)) {
    if (writeFileSafe(path.join(sdlcRoot, "_templates", name), body, force)) created++;
  }

  for (const stage of STAGE_DIRS) {
    if (writeFileSafe(path.join(sdlcRoot, stage.dir, "CONTEXT.md"), buildStageContext(stage), force)) created++;
    if (writeFileSafe(path.join(sdlcRoot, stage.dir, "output", ".gitkeep"), "", false)) created++;
  }

  const starterProof = {
    schemaVersion: "1.0.0",
    active: false,
    enforceOnStop: true,
    specId: "",
    updatedAt: new Date().toISOString(),
    items: []
  };
  if (
    writeFileSafe(
      path.join(sdlcRoot, "06_verification", "output", "proof-status.json"),
      `${JSON.stringify(starterProof, null, 2)}\n`,
      force
    )
  ) {
    created++;
  }

  return {
    status: "initialized",
    target: targetRoot,
    sdlcRoot,
    profile,
    projectName: resolvedName,
    strictDesignGate: Boolean(strictDesignGate),
    filesWritten: created
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (!opts.target || !opts.profile) {
    printHelp();
    throw new Error("Both --target and --profile are required.");
  }

  const summary = initSdlcWorkspace({
    target: opts.target,
    profile: opts.profile,
    projectName: opts.name,
    strictDesignGate: opts.strictDesignGate,
    force: opts.force
  });
  console.log(JSON.stringify(summary, null, 2));
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

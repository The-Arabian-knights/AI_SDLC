/**
 * Canonical definitions for Universal AI SDLC project profiles, baseline gates,
 * and ICM numbered stage contracts.
 */

export const STAGE_DIRS = [
  {
    dir: "01_requirements",
    title: "Requirements & Scope",
    summary: "Capture unambiguous functional, non-functional, and non-goal requirements (REQ-NNN).",
    inputs: ["User request and repository context", "../_shared/sdlc-invariants.md"],
    doNotLoad: ["Other stages' drafts unless resolving cross-stage change requests"],
    processSteps: [
      "Clarify actors, acceptance criteria, constraints, and explicit non-goals.",
      "Assign sequential REQ-NNN identifiers using ../_templates/req-template.md.",
      "Flag open ambiguities before entering Stage 02."
    ],
    outputs: ["REQ-NNN-<slug>.md in output/"],
    humanCheck: "Confirm scope, non-goals, and acceptance criteria accurately reflect intent."
  },
  {
    dir: "02_architecture",
    title: "Architecture & EGM Design Gate",
    summary: "Produce ADRs with boundaries, invariants, alternatives, and fresh-context review (ADR-NNN).",
    inputs: ["../01_requirements/output/", "../_shared/sdlc-invariants.md", "graphify-out/GRAPH_REPORT.md (if present)"],
    doNotLoad: ["Unrelated implementation files outside the impacted blast radius"],
    processSteps: [
      "Discover dependencies via /graphify-context (or static search fallback) with EXTRACTED/INFERRED tags.",
      "Evaluate >= 2 architectural alternatives and document explicit rejection rationale.",
      "Author ADR-NNN-<slug>.md and pass fresh-context review via arch-reviewer."
    ],
    outputs: ["ADR-NNN-<slug>.md in output/"],
    humanCheck: "Verify system boundaries, invariants, and arch-reviewer APPROVED sign-off."
  },
  {
    dir: "03_threat_model",
    title: "Threat Modeling & Trust Boundaries",
    summary: "Identify assets, entry points, trust boundaries, auth/authz, and abuse cases (THR-NNN).",
    inputs: ["../01_requirements/output/", "../02_architecture/output/"],
    doNotLoad: ["Tests or UI assets unrelated to trust boundaries"],
    processSteps: [
      "Select lightweight or formal threat model depth based on blast radius.",
      "Enumerate assets, entry points, auth/authz checks, secret stores, and injection/abuse paths.",
      "Author THREAT-NNN-<slug>.md and pass audit via security-reviewer."
    ],
    outputs: ["THREAT-NNN-<slug>.md in output/"],
    humanCheck: "Confirm every HIGH/CRITICAL threat has an explicit mitigation and required negative test."
  },
  {
    dir: "04_specification",
    title: "Traceable Specification & Proof Checklist",
    summary: "Define exact module contracts, observability hooks, and runnable Proof Checklist (SPEC-NNN).",
    inputs: ["../01_requirements/output/", "../02_architecture/output/", "../03_threat_model/output/"],
    doNotLoad: ["Historical postmortems unless directly referenced by an ADR"],
    processSteps: [
      "Map REQ-* -> ADR-* -> THR-* into concrete module schemas, state transitions, and error contracts.",
      "Specify logging, metrics, and error/telemetry hooks in ../_shared/observability-standards.md.",
      "Define mandatory PROOF-NNN checks and initialize ../06_verification/output/proof-status.json."
    ],
    outputs: ["SPEC-NNN-<slug>.md in output/"],
    humanCheck: "Verify every requirement and threat mitigation has a concrete, runnable Proof check."
  },
  {
    dir: "05_implementation",
    title: "Controlled Implementation",
    summary: "Implement approved specifications cleanly without unapproved design drift.",
    inputs: ["../04_specification/output/", "../_shared/sdlc-invariants.md"],
    doNotLoad: ["Brainstorming transcripts not captured in approved ADR/SPEC files"],
    processSteps: [
      "Set .sdlc/06_verification/output/proof-status.json active=true for the active SPEC-NNN.",
      "Write modular, validated code honoring zero-trust boundaries and error paths.",
      "Record any spec deviations or implementation notes under output/IMPL-NNN-<slug>.md."
    ],
    outputs: ["Code changes in repo + optional IMPL-NNN-<slug>.md in output/"],
    humanCheck: "Confirm diff matches SPEC-NNN contracts with zero unapproved boundary bypasses."
  },
  {
    dir: "06_verification",
    title: "Verification & Proof Evidence",
    summary: "Execute baseline + profile gates and record verifiable proof results.",
    inputs: ["../04_specification/output/", "../profile.json"],
    doNotLoad: ["Draft design notes superseded by approved SPEC-NNN"],
    processSteps: [
      "Run scripts/verify-profile.mjs --target . --write-proof and all SPEC Proof Checklist commands.",
      "Update output/proof-status.json with observed exit statuses and exact output evidence.",
      "Invoke proof-auditor subagent to confirm full REQ-to-PROOF coverage."
    ],
    outputs: ["output/proof-status.json", "output/profile-gate-report.json", "PROOF-NNN-<slug>.md"],
    humanCheck: "Confirm all required proof items passed after the final edit with no relaxed assertions."
  },
  {
    dir: "07_release_maintenance",
    title: "Release, Drift Audit & Continuous Evolution",
    summary: "Document release notes, run drift audits, and promote lessons into permanent guardrails.",
    inputs: ["../06_verification/output/", "../_shared/lessons-learned.md"],
    doNotLoad: ["Transient runtime logs in ../.runtime/"],
    processSteps: [
      "Emit release/change summary and mark proof-status.json active=false once released.",
      "On defects or drift, reproduce first, run egm-drift-report / arch-reviewer, and update ADR/SPEC/tests.",
      "Promote recurring findings into rules, scripts, or proof checks and log in lessons-learned.md."
    ],
    outputs: ["RELEASE-NNN-<slug>.md or POSTMORTEM-NNN-<slug>.md in output/"],
    humanCheck: "Verify release checklist, drift reconciliation, and rule/test promotion are recorded."
  }
];

export const BASELINE_GATES = [
  {
    id: "secret-scan",
    commandKey: "secretScan",
    title: "Secret Scanning",
    category: "security",
    description: "Scan repo/diff for hardcoded credentials, API keys, and private keys.",
    autoDetectTools: ["gitleaks", "trufflehog"]
  },
  {
    id: "dep-audit",
    commandKey: "depAudit",
    title: "Dependency & Vulnerability Audit",
    category: "security",
    description: "Check dependencies for known CVEs and license compliance.",
    autoDetectTools: ["trivy"]
  },
  {
    id: "static-analysis",
    commandKey: "lint",
    title: "Static Analysis & Linting",
    category: "quality",
    description: "Run language linter and static analyzer.",
    autoDetectTools: []
  },
  {
    id: "typecheck",
    commandKey: "typecheck",
    title: "Type & Contract Checking",
    category: "quality",
    description: "Run compiler or static type-checker.",
    autoDetectTools: []
  },
  {
    id: "unit-integration",
    commandKey: "test",
    title: "Unit & Integration Tests",
    category: "verification",
    description: "Run deterministic unit and integration test suites including negative/abuse cases.",
    autoDetectTools: []
  }
];

export const PROFILES = {
  "web-enterprise": {
    name: "web-enterprise",
    description: "Web applications, SaaS portals, SPAs, SSR frontends, and BFFs.",
    focusAreas: [
      "CSP, CORS, cookie/CSRF protection, and HTML sanitization",
      "API schema contracts and browser E2E flows",
      "Accessibility (a11y) and Core Web Vitals sanity"
    ],
    defaultCommands: {
      lint: "",
      typecheck: "",
      test: "",
      integrationTest: "",
      build: "",
      secretScan: "",
      depAudit: "",
      sast: "",
      containerScan: "",
      dast: "",
      contractTest: "",
      e2eTest: "",
      platformCheck: "",
      performanceCheck: ""
    },
    specificGates: [
      { id: "sast", commandKey: "sast", title: "SAST (Semgrep / CodeQL)", autoDetectTools: ["semgrep", "codeql"] },
      { id: "container-scan", commandKey: "containerScan", title: "Container & FS Scan (Trivy)", autoDetectTools: ["trivy"] },
      { id: "dast", commandKey: "dast", title: "Dynamic Web/API Security (OWASP ZAP)", autoDetectTools: ["zap-baseline.py", "zaproxy"] },
      { id: "contract-test", commandKey: "contractTest", title: "API / Schema Contract Tests", autoDetectTools: [] },
      { id: "e2e-test", commandKey: "e2eTest", title: "Browser / E2E & Accessibility Tests", autoDetectTools: [] }
    ]
  },
  "backend-api": {
    name: "backend-api",
    description: "REST, GraphQL, gRPC services, distributed workers, and data pipelines.",
    focusAreas: [
      "AuthN/AuthZ, tenant isolation, SSRF, and injection prevention",
      "OpenAPI/Protobuf contract compatibility and migration rollback safety",
      "Concurrency, idempotency, rate limiting, and structured telemetry"
    ],
    defaultCommands: {
      lint: "",
      typecheck: "",
      test: "",
      integrationTest: "",
      build: "",
      secretScan: "",
      depAudit: "",
      sast: "",
      containerScan: "",
      dast: "",
      contractTest: "",
      e2eTest: "",
      platformCheck: "",
      performanceCheck: ""
    },
    specificGates: [
      { id: "sast", commandKey: "sast", title: "SAST (Semgrep / CodeQL)", autoDetectTools: ["semgrep", "codeql"] },
      { id: "container-scan", commandKey: "containerScan", title: "Container & Image Scan (Trivy)", autoDetectTools: ["trivy"] },
      { id: "dast", commandKey: "dast", title: "API Security / DAST (OWASP ZAP)", autoDetectTools: ["zap-api-scan.py", "zaproxy"] },
      { id: "contract-test", commandKey: "contractTest", title: "Service Contract & Migration Tests", autoDetectTools: [] },
      { id: "integration-test", commandKey: "integrationTest", title: "Integration & Concurrency Tests", autoDetectTools: [] }
    ]
  },
  "mobile": {
    name: "mobile",
    description: "iOS, Android, Flutter, and React Native mobile applications.",
    focusAreas: [
      "Platform keystore/keychain storage, ATS/cleartext, and deep-link validation",
      "Offline sync, lifecycle state restoration, and permission minimization",
      "Platform build harness and crash/telemetry hooks"
    ],
    defaultCommands: {
      lint: "",
      typecheck: "",
      test: "",
      integrationTest: "",
      build: "",
      secretScan: "",
      depAudit: "",
      sast: "",
      containerScan: "",
      dast: "",
      contractTest: "",
      e2eTest: "",
      platformCheck: "",
      performanceCheck: ""
    },
    specificGates: [
      { id: "sast", commandKey: "sast", title: "Mobile Static Security Scan (Semgrep)", autoDetectTools: ["semgrep"] },
      { id: "platform-check", commandKey: "platformCheck", title: "Platform Build & Manifest/Permission Harness", autoDetectTools: [] },
      { id: "e2e-test", commandKey: "e2eTest", title: "Device / Emulator UI & Lifecycle Harness", autoDetectTools: [] },
      { id: "performance-check", commandKey: "performanceCheck", title: "Startup, Memory & Crash/Telemetry Hook Check", autoDetectTools: [] }
    ]
  },
  "desktop": {
    name: "desktop",
    description: "Electron, Tauri, Qt, WinUI, and native cross-platform desktop applications.",
    focusAreas: [
      "IPC trust-boundary validation, context isolation, and sandbox/Electron fuses",
      "Code-signing, auto-updater integrity, and safe local file/path handling",
      "Memory/handle leak checks and crash/telemetry hooks"
    ],
    defaultCommands: {
      lint: "",
      typecheck: "",
      test: "",
      integrationTest: "",
      build: "",
      secretScan: "",
      depAudit: "",
      sast: "",
      containerScan: "",
      dast: "",
      contractTest: "",
      e2eTest: "",
      platformCheck: "",
      performanceCheck: ""
    },
    specificGates: [
      { id: "sast", commandKey: "sast", title: "Desktop SAST & IPC Audit", autoDetectTools: ["semgrep"] },
      { id: "platform-check", commandKey: "platformCheck", title: "Native Build, Sandbox & Signing Harness", autoDetectTools: [] },
      { id: "e2e-test", commandKey: "e2eTest", title: "Desktop Integration & IPC Boundary Tests", autoDetectTools: [] },
      { id: "performance-check", commandKey: "performanceCheck", title: "Memory/Resource Leak & Crash Hook Check", autoDetectTools: [] }
    ]
  },
  "game-engine": {
    name: "game-engine",
    description: "Unity, Unreal, Godot, Bevy, and custom C++/Rust/WebGL game engines.",
    focusAreas: [
      "Deterministic simulation loops, save-state/asset integrity, and multiplayer authority checks",
      "Frame-time budget, allocation/GC pressure, and resource lifetime safety",
      "Headless simulation harness and crash/telemetry hooks"
    ],
    defaultCommands: {
      lint: "",
      typecheck: "",
      test: "",
      integrationTest: "",
      build: "",
      secretScan: "",
      depAudit: "",
      sast: "",
      containerScan: "",
      dast: "",
      contractTest: "",
      e2eTest: "",
      platformCheck: "",
      performanceCheck: ""
    },
    specificGates: [
      { id: "platform-check", commandKey: "platformCheck", title: "Engine Build & Headless Simulation Harness", autoDetectTools: [] },
      { id: "performance-check", commandKey: "performanceCheck", title: "Frame-Time, Memory Budget & Leak Checks", autoDetectTools: [] },
      { id: "contract-test", commandKey: "contractTest", title: "Save-State, Asset & Netcode Integrity Checks", autoDetectTools: [] }
    ]
  }
};

export function buildProfileConfig(profileName, options = {}) {
  const profile = PROFILES[profileName];
  if (!profile) {
    const valid = Object.keys(PROFILES).join(", ");
    throw new Error(`Unknown profile "${profileName}". Expected one of: ${valid}`);
  }
  return {
    schemaVersion: "1.0.0",
    projectName: options.projectName || "project",
    profile: profile.name,
    strictDesignGate: Boolean(options.strictDesignGate),
    enforceProofOnStop: options.enforceProofOnStop !== false,
    commands: { ...profile.defaultCommands },
    fastChecks: [],
    observability: {
      structuredLogging: true,
      errorTrackingHook: true,
      telemetrySchemaRef: ".sdlc/_shared/observability-standards.md"
    }
  };
}

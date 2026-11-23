---
name: graphify-context
description: >-
  Perform architecture discovery, dependency tracing, and blast-radius impact
  analysis using Graphify (`graphify-out/`) when present, with a deterministic
  fallback when Graphify is absent or on small repositories.
---

# Graphify Context Intelligence

Query structural knowledge graphs before reading files wholesale so architecture discovery stays high-signal, low-token, and honest about provenance.

## Decision Tree

1. **Check for existing graph:** Look for `graphify-out/graph.json` or `graphify-out/GRAPH_REPORT.md` in the target repo root.
2. **If graph exists:**
   - Read `graphify-out/GRAPH_REPORT.md` (God Nodes, Community structure, Surprising Connections) or run `graphify query` / `graphify path` / `graphify explain` per [references/confidence-and-queries.md](references/confidence-and-queries.md).
   - If the graph looks stale after major code edits and `graphify` CLI is installed, refresh incrementally with `graphify . --update --no-viz` (or `/graphify . --update` if using the Graphify skill).
3. **If graph does NOT exist:**
   - If `graphify` CLI (`graphifyy`) is installed and the repo is medium/large (>= ~30 source files), optionally build a structural AST graph (`graphify . --no-viz` or `/graphify . --no-viz`).
   - Otherwise (small repo or `graphify` unavailable), execute the **Static Fallback Protocol** in [references/confidence-and-queries.md](references/confidence-and-queries.md): search entry points, module manifests, call sites (`grep_search` / `rg`), and config boundaries directly.

## Mandatory Provenance Rule

Every dependency or architectural claim surfaced to design docs (`ADR-*`) or specs (`SPEC-*`) MUST carry its confidence tag:
- `EXTRACTED`: Directly observed in AST/graph edges or source file lines read in this session.
- `INFERRED`: Reasoned across indirect boundaries, dynamic dispatch, or Graphify semantic inference (must be verified in code before editing).
- `AMBIGUOUS`: Unclear call target or dynamic wiring; flag as an open question for human or design review.

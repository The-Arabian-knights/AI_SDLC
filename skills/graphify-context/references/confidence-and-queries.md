# Graphify Queries, Confidence Rubric & Static Fallback

## 1. Fast-Path Graphify CLI Commands

When `graphify-out/graph.json` exists and `graphify` CLI is installed:

```bash
# Broad architectural neighborhood (BFS)
graphify query "<question>" --budget 1500

# Specific execution/data flow trace (DFS)
graphify query "<question>" --dfs --budget 1500

# Shortest dependency path between two components
graphify path "AuthService" "SessionStore"

# Plain-language node summary + degree/community
graphify explain "PaymentGateway"

# Incremental refresh after edits
graphify . --update --no-viz
```

If the `graphify` CLI binary is not on `PATH` but `graphify-out/GRAPH_REPORT.md` or `graphify-out/graph.json` exists on disk, inspect `GRAPH_REPORT.md` first and query `graph.json` directly with `node` or `python` scripts rather than failing.

## 2. Blast-Radius Analysis Protocol

Before proposing an `ADR-*` or `SPEC-*`:
1. Identify target nodes/modules and list 1-hop and 2-hop callers/callees.
2. Check community boundaries crossed (crossing communities signals a trust boundary, public API, or coupling risk).
3. Record impacted modules and test surfaces into `.sdlc/02_architecture/output/`.
4. Tag every edge (`EXTRACTED` vs `INFERRED` vs `AMBIGUOUS`) and verify any `INFERRED` critical path by reading the exact source lines before implementation.

## 3. Small-Repo / No-Graphify Fallback Protocol

When `graphify-out/` and `graphify` CLI are absent:
1. Inspect top-level build/package manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pubspec.yaml`, `*.csproj`, `CMakeLists.txt`).
2. Locate entry points and public interfaces (`find_by_name` / `list_dir`).
3. Trace incoming/outgoing references with targeted `grep_search` (`rg -n`).
4. Mark all directly read symbols/imports as `EXTRACTED` and unresolved dynamic hooks/DI bindings as `INFERRED` or `AMBIGUOUS`.

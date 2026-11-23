---
trigger: glob
globs: "**/*.env*, **/*.tf, **/*.tfvars, **/Dockerfile*, **/docker-compose*.yml, **/docker-compose*.yaml, **/*.sql, **/auth/**/*, **/security/**/*"
description: "Security and secrets invariants for infrastructure, environment configs, database schemas, and auth/security modules."
---

# Security, Secrets & Infrastructure Invariants

1. **Zero Secret Material in VCS:** Never write plaintext credentials, bearer tokens, private keys, connection strings with passwords, or `.env` files containing real secrets into tracked files.
2. **Least Privilege & Deny-by-Default:** Enforce explicit authentication, authorization, and tenant/ownership checks on every privileged endpoint, storage rule, and IAM policy. Never grant wildcard `*` admin permissions or `0.0.0.0/0` ingress without a documented waiver.
3. **Parameterized Queries & Safe Parsing:** Prevent SQL, command, path-traversal, SSRF, XSS, and deserialization injections by using parameterized queries, strict allowlists, and canonical path checks.
4. **Migration & Infra Safety:** Database and IaC changes require backward compatibility, explicit rollback notes, and non-destructive validation (`plan` / dry-run) before applying.
5. **Threat Mapping:** Link every security-sensitive change to its corresponding `THR-NNN` mitigation and negative test case in `.sdlc/03_threat_model/output/`.

# `scripts` folder

This folder contains **helper scripts** for the monorepo: development automation, maintenance utilities, repetitive tasks (setup, lint, migrations, data generation, etc.), and internal tooling.

- **Main purpose**: group support tools that do not belong to a specific app, agent, or pipeline but make the team’s work easier.
- **Recommendation**: document each script (what it does, parameters, requirements, usage examples) and keep them reproducible (and safe) across environments.

The incident CSV tools are documented in [INCIDENT_ANALYZER.md](./INCIDENT_ANALYZER.md).
Run `python3 scripts/seed_incidents.py` to idempotently seed historical customer
incidents into the backoffice API's TinyDB store.

Caching measurements and safe synthetic data generation are documented in
[CACHING_REPORT.md](../CACHING_REPORT.md). `profile_caching.py` benchmarks small
and large temporary datasets without opening application databases;
`profile_frontend_caching.cjs` measures supplier draft-edit React commits using
Playwright and a development/profiling build.

> _Spanish version: [README.es.md](./README.es.md)._

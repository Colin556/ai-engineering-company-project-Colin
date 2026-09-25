# Incident File Analyzer — scripts

Phase 1 of the Incident File Analyzer: a CLI script that validates and
summarizes an after-sales incidents CSV export.

> No `CONTEXT-company.md` existed for this feature in the repo, so the CSV
> schema below was defined by the developer and confirmed with the user
> before implementation. Update this doc if the real spec differs.

## CSV schema

Required fields: `incident_id`, `customer_id`, `customer_name`, `email`,
`category`, `status`, `created_at`.
Optional fields: `phone`, `satisfaction_score`.

- Valid `category` values: `billing`, `technical`, `shipping`, `product`, `other`.
- Valid `status` values: `open`, `closed`, `discarded`.
- `satisfaction_score` (1-5) is only meaningful for `closed` incidents.

A record is **invalid** if it's missing any required field, or if
`category`/`status` hold a value outside the allowed sets above. Invalid
records are counted and excluded from the metrics, never silently dropped.

## Files

- `analyze.py` — CLI entry point. Adds `services/api` to `sys.path` and
  imports `incident_analysis.py` from there, so the CLI and the backend API
  share the exact same validation/metrics logic.
- `../services/api/incident_analysis.py` — canonical analysis logic.
- `generate_sample_data.py` — deterministic generator for the 100-record
  sample file (fixed seed, includes 6 deliberately invalid rows).
- `incidents-brasaland.csv` — the generated 100-record sample file.

## Usage

```bash
cd scripts
python3 analyze.py incidents-brasaland.csv
```

Prints a readable summary (totals, invalid breakdown, category/status
breakdown, average satisfaction for closed cases) and prompts:

```
Export results to CSV? [y/n]:
```

Answering `y` writes `results.csv` (one row per metric) next to the script.

## Expected values for the sample file (100 records, seed=42)

- Total valid: 94, invalid: 6
- Invalid reasons: 2 `invalid_category`, 1 `invalid_status`, 1 each of
  `missing_field:customer_name`, `missing_field:email`, `missing_field:incident_id`
- Category breakdown (valid): billing 18, other 21, product 14, shipping 15, technical 26
- Status breakdown (valid): closed 26, discarded 33, open 35
- Closed cases with recorded score: 21, average satisfaction: 3.33

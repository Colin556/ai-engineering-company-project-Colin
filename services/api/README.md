# Incident File Analyzer API (`services/api`)

FastAPI backend exposing the incident analysis logic used by
`scripts/analyze.py`. See [scripts/INCIDENT_ANALYZER.md](../../scripts/INCIDENT_ANALYZER.md)
for the CSV schema and validation rules.

## Run locally

```bash
cd services/api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Endpoints

- `POST /api/incidents/analyze` — multipart/form-data upload with a `file`
  field containing the CSV. Returns the analysis summary as JSON. Returns
  `400` for empty files, non-CSV files, or unparsable CSV content.
- `GET /api/incidents/results/export` — downloads the last analysis as
  `results.csv` (one row per metric). Returns `404` if no analysis has run
  yet in this process.

The last analysis is kept in memory only (no persistence); restarting the
server clears it.

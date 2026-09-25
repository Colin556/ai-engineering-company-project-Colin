# Backoffice (`uis/backoffice`)

Internal Next.js app for Brasaland Digital operations tools. Currently
includes the **Incident Analysis** page.

## Run locally

```bash
cd uis/backoffice
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` if the backend isn't at the default
`http://127.0.0.1:8000` (see `services/api`).

## Pages

- `/` — landing/menu.
- `/incidents` — upload the incidents CSV (drag & drop or file picker), view
  the summary (general metrics, category/status breakdown, satisfaction
  index, invalid record counts), and download the results as CSV.

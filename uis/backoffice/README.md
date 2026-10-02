# Backoffice (`uis/backoffice`)

Internal Next.js app for Brasaland Digital operations tools. Currently
includes the **Incident Manager** for registering, tracking, and summarizing operational incidents.

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
- `/incidents` — filter incidents, update lifecycle status, and view aggregated metrics.
- `/incidents/new` — register customer, branch, or internal incidents.

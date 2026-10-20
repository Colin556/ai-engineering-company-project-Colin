# Backoffice (`uis/backoffice`)

Internal Next.js app for Brasaland Digital operations tools. Currently
includes the **Incident Manager** for registering, tracking, and summarizing operational incidents.

## Run locally

```bash
cd uis/backoffice
npm install
npm run dev
```

Browser API requests use the same-origin `/backend` route. Next.js proxies that
route to the Docker host gateway on port 8000 in development and to the API
service in production. Set `NEXT_PUBLIC_API_BASE_URL` to override the browser
API route or `API_INTERNAL_URL` to override the proxy destination.

## Pages

- `/` — landing/menu.
- `/incidents` — filter incidents, update lifecycle status, and view aggregated metrics.
- `/incidents/new` — register customer, branch, or internal incidents.

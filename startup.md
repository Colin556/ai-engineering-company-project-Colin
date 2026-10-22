# Start the Website and Backoffice

These instructions launch the two frontend development servers. Run commands
from the repository root using two separate terminals.

## Prerequisites

- Install Node.js and npm, or use the project's VS Code dev container.
- On first use, install the dependencies from the repository root:

  ```bash
  npm --prefix uis/website install
  npm --prefix uis/backoffice install
  ```

## Launch the Website

In the first terminal, run:

```bash
cd uis/website
npm start -- --host 0.0.0.0 --port 3000
```

Open [http://localhost:3000](http://localhost:3000).

## Launch the Backoffice

In the second terminal, run:

```bash
cd uis/backoffice
npm run dev -- --hostname 0.0.0.0 --port 3001
```

Open [http://localhost:3001](http://localhost:3001).

Keep both terminals running while using the sites. In VS Code remote containers
or Codespaces, forward ports **3000** and **3001** in the **Ports** panel and use
their forwarded URLs if the localhost links are unavailable.

## Verify Startup

Wait for both servers to report that they are ready. From another terminal, run:

```bash
curl --silent --output /dev/null --write-out 'Website HTTP %{http_code}\n' http://localhost:3000/
curl --silent --output /dev/null --write-out 'Backoffice HTTP %{http_code}\n' http://localhost:3001/
```

Both should return **HTTP 200**. The backoffice's first request may take longer
while Next.js compiles the page.

## Stop or Change Ports

Press **Ctrl+C** in each server terminal to stop it.

If a port is already occupied, use the existing server or replace the port in
the corresponding startup command with a free port, such as `3002` or `3003`.
Open the URL with that new port.

## Backend Features

These commands start only the frontends. Authentication and other API-backed
features also need the backend service and its environment configuration.
See [services/api/README.md](services/api/README.md) for backend setup.
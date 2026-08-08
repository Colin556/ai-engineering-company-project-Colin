# Brasaland Website (Milestone 1)

Two-page, Tailwind CSS website for Brasaland:

- `index.html`: Landing page with brand presentation, sections requested in `CONTEXT.md`, and Schema.org JSON-LD.
- `signup.html`: Brasa Points registration form with dynamic fields and full JavaScript validation.
- `app.js`: Form dependency logic and validation rules.
- `src/types.ts`: Shared TypeScript aliases for milestone entities.
- `src/utils/collections.ts`: Required collection filtering and sorting helpers.
- `src/utils/search.ts`: Required linear and binary search helpers.
- `src/utils/transformations.ts`: Required financial transformation helpers.

## Run locally

From this folder you can open `index.html` directly in a browser, or run any static server.

Example with Python:

```bash
python3 -m http.server 5500
```

Then visit:

- `http://localhost:5500/index.html`
- `http://localhost:5500/signup.html`

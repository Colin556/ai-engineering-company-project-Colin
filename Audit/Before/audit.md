# Frontend Performance Audit

## Plan and Scope

1. Measure the supplied Lighthouse reports before changing source.
2. Run Lighthouse against both production frontends to establish a comparable baseline.
3. Attribute weak metrics to audits, network resources, and source code.
4. Identify duplicated UI/data-loading logic and choose a targeted refactor.

The measured routes were the corporate homepage (`/`, ports 3000/3100) and the backoffice landing page (`/`, ports 3001/3101). Lighthouse audits one route at a time; this does not represent table-heavy backoffice routes or every corporate page.

## Evidence and Baselines

The four supplied reports are Lighthouse 13.4.1 runs against Codespaces-forwarded development URLs. Their filenames use `UI` for the corporate site and `Backend` for the backoffice, although the latter points to port 3001. These are retained as the requested initial scores:

| Supplied report | Performance | Accessibility | Best Practices | SEO | LCP | TTFB | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|
| Corporate desktop | 91 | 100 | 100 | 58 | 1.53 s | 464 ms | 0.00 |
| Corporate mobile | 72 | 100 | 100 | 58 | 6.06 s | 187 ms | 0.00 |
| Backoffice desktop | 96 | 100 | 100 | 60 | 1.20 s | 501 ms | 0.00 |
| Backoffice mobile | 80 | 100 | 100 | 60 | 5.01 s | 131 ms | 0.00 |

Before source corrections, the production image was also measured with Lighthouse 13.5.0. These localhost production runs are the valid comparison baseline for the post-change production runs; they are not directly comparable to the supplied 13.4.1 Codespaces reports.

| Production baseline | Performance | Accessibility | Best Practices | SEO | LCP | TTFB | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|
| Corporate desktop | 98 | 100 | 100 | 100 | 1.04 s | 0.00 s* | 0.00 |
| Corporate mobile | 76 | 100 | 100 | 100 | 5.27 s | 0.00 s* | 0.00 |
| Backoffice desktop | 100 | 100 | 100 | 100 | 0.53 s | 0.00 s* | 0.00 |
| Backoffice mobile | 97 | 100 | 96 | 100 | 2.13 s | 0.01 s | 0.00 |

\*Lighthouse rounded the measured local TTFB values of 0-4 ms to effectively zero; this is a local lab result, not production field data.

The production mobile runs used Lighthouse's mobile emulation (412 × 823, simulated 4× CPU slowdown, 150 ms RTT, approximately 1.5 Mbps download). Desktop used the Lighthouse desktop preset. Lighthouse 13.5.0 ran with Chromium 136. CrUX/field data was unavailable, INP was not measured, and post-change desktop runs are not present.

## Findings and Root Causes

| Finding | Evidence | Root cause and assessment |
|---|---|---|
| Corporate mobile LCP is poor | Production baseline LCP 5.27 s; Performance 76. The hero image was the LCP element and lacked `fetchpriority="high"`. The image-delivery audit estimated about 496 KB savings across images. | The first viewport depends on a remote Unsplash image without an explicit priority hint; image candidates and dimensions were not tuned for the rendered slot. This is the primary user-facing performance risk. |
| Corporate first render is delayed | The production baseline estimated 1.47 s of render-blocking savings. The page loaded Tailwind from `cdn.tailwindcss.com` and Google Fonts CSS from another origin. | Runtime CSS generation and third-party stylesheet/font requests added network and style work to the critical rendering path. |
| Supplied corporate SEO score is low | Lighthouse 13.4.1 reported SEO 58 and `is-crawlable` failure; its `robots-txt` audit reported 299 parse errors. | The forwarded URL was blocked from indexing and `/robots.txt` returned invalid content in that environment. The production-image audit scored SEO 100, so this difference is environment/version-specific and must not be presented as a measured production SEO gain. |
| Supplied backoffice SEO score is low | Lighthouse 13.4.1 reported SEO 60 and `is-crawlable` failure on the forwarded URL. | The Codespaces-forwarded response was marked non-indexable. Backoffice is an internal authenticated tool; it should remain private in production rather than be made crawlable merely to improve a public SEO score. |
| Backoffice dev mobile score is misleading for production | The supplied/dev mobile run scored 53 in the controlled local run, with 6.51 s LCP, 1,070 ms TBT, and roughly 848 KB transferred. It included Next devtools/client chunks. The production baseline scored 97 with 2.13 s LCP. | Turbopack/Next development tooling and unminified development chunks inflate lab cost. Evaluate the production build for release performance; retain the dev result only as a development-experience observation. |
| Backoffice Best Practices had a small issue | The production baseline score was 96. Lighthouse reported a missing `/favicon.ico`; an app icon route was added. | The app had no icon at the URL requested by the browser/audit. This is a small quality issue, not the source of its LCP. |
| TTFB and CLS are not the bottlenecks | Local production TTFB was low and CLS was 0 for both routes. | No evidence supports server-latency or layout-shift work in this audit. Avoid claiming those metrics improved materially from the frontend changes. |

## Refactor Analysis

1. **Abortable list loading in backoffice tables.** `inventory/products/page.tsx` and `suppliers/page.tsx` each maintained loading, error, cancellation, and promise-finalization state in an effect. This is duplicated behavior with the same lifecycle requirements. It was extracted to `lib/useAsyncList.ts`; both pages now supply their key, loader, and fallback error while retaining page-specific filters and mutations.
2. **Corporate header/navigation repeated across static pages.** The logo and primary/mobile navigation are repeated in `website/index.html`, `website/operations.html`, and `website/signup.html`. A shared HTML partial or Vite HTML transform could keep labels, links, and responsive markup in one place. This remains a candidate; it was not implemented to avoid an architecture change during a targeted performance audit.

## Skill-Guided Analysis

Installed and applied the `core-web-vitals` and `performance` skills from `addyosmani/web-quality-skills`. They reinforced the evidence-led sequence used here: identify the LCP element, separate lab results from field data, prioritize its discovery/transfer and render-blocking resources, and repeat equivalent Lighthouse runs. Their recommendations were treated as hypotheses until verified by the reports and source.

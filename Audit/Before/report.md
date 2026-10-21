# Frontend Performance Audit Report

## Outcome

The measured production changes are modest and mobile run-to-run variance is material. The corporate page remains above the 2.5 s LCP target after the changes. The backoffice dashboard is already near the target and remains healthy. Treat Lighthouse results below as lab evidence, not a promise of field-user improvement.

## Production Score Comparison

The following comparison uses the same production image setup and Lighthouse 13.5.0. Scores are Lighthouse points (0-100); metric values are seconds unless noted.

| Page / device | Before: Perf / A11y / BP / SEO | Before LCP | After R3: Perf / A11y / BP / SEO | After R3 LCP | Other observed changes |
|---|---|---:|---|---:|---|
| Corporate mobile | 76 / 100 / 100 / 100 | 5.269 s | 78 / 100 / 100 / 100 | 5.114 s | FCP 2.646 → 2.322 s; TTFB 1 → 2 ms; CLS 0 → 0 |
| Backoffice mobile | 97 / 100 / 96 / 100 | 2.134 s | 98 / 100 / 100 / 100 | 2.075 s | FCP 0.799 → 0.761 s; TBT 143 → 118 ms; TTFB 13 → 6 ms; CLS 0 → 0 |

Desktop production baselines were Corporate 98 / 100 / 100 / 100 and Backoffice 100 / 100 / 100 / 100 (Performance / Accessibility / Best Practices / SEO). No post-change desktop reports were captured, so desktop improvements are not claimed.

The supplied Lighthouse 13.4.1 Codespaces reports are recorded separately in [audit.md](audit.md). They are not used for these before/after deltas because the Lighthouse version, URL/forwarding environment, and dev-versus-production build differ.

## Corrections Applied

| Correction | Rationale | Verification / measured impact |
|---|---|---|
| Replaced runtime Tailwind CDN usage with a Vite-built local stylesheet; moved the corporate fonts to local Fontsource WOFF2 assets, including Latin Extended glyphs. | Remove third-party stylesheet/script work from the initial render path while preserving existing design classes and accented text. | Production Vite build emitted one local CSS asset and local fonts. Corporate FCP improved by 324 ms in the selected before/R3 runs. However, R3 still reports render-blocking requests, with an estimated 1.51 s opportunity; the Lighthouse diagnostics do not show that the full bottleneck is resolved. |
| Added responsive image candidates and explicit dimensions, prioritized the corporate hero image, and lazy-loaded the below-fold story image. | The hero is the mobile LCP element; the original pages downloaded large remote images without priority/dimension hints and fetched below-fold media early. | The corporate LCP moved from 5.269 s to 5.114 s in R3 (155 ms, about 2.9%). R3 still reports an image-delivery opportunity of about 496 KB and an LCP-discovery finding, so additional image optimization remains necessary. |
| Added `robots.txt` and `sitemap.xml` to the corporate static site. | The supplied forwarded-site audit reported malformed `robots.txt` and blocked crawling. | Both files are emitted by the Vite production build. The controlled production baseline already scored SEO 100, so no SEO score increase is attributed to this change. |
| Added the Next.js app icon route. | The production backoffice baseline had a missing favicon request and Best Practices score 96. | The post-change mobile Best Practices score is 100. This is a small quality improvement, not a performance driver. |
| Extracted the shared abortable list state into `backoffice/lib/useAsyncList.ts` and applied it to the products and supplier lists. | Remove duplicated loading/error/cancellation effects without changing each page's filter and mutation behavior. | Backoffice production build and TypeScript validation passed. This maintainability refactor is not expected to materially change the static dashboard Lighthouse score. |

## Repeatability and Remaining Work

Two post-change mobile reports are available per app. Corporate Performance was 76 and 78, with LCP 5.169 s and 5.114 s. Backoffice Performance was 94 and 98, with LCP 2.168 s and 2.075 s. The R3 values above are the final recorded runs, not medians; the spread means the small score changes are not strong evidence of a stable gain. The single baseline run per app also limits statistical confidence.

The largest measured selected-run change was corporate FCP (-324 ms), followed by corporate LCP (-155 ms). Despite those changes, mobile corporate LCP remains poor (>4 s), and Lighthouse still estimates substantial render-blocking and image-delivery savings. The next evidence-led iteration should verify that the production HTML references the intended responsive hero candidate, reduce the actual transferred hero/story image bytes, and inspect the final stylesheet/font requests in a trace. Do not claim the page meets the LCP target yet.

Backoffice mobile LCP remains under 2.5 s in the production runs; the remaining flagged JavaScript/render-blocking diagnostics are lower priority than the corporate LCP issue. INP/field Core Web Vitals were not measured, and neither page has CrUX data in this local audit.

## Artifact and Test Index

- Initial user-supplied Lighthouse JSON and before screenshots: this `Audit/Before` directory (`LightHouse_Audit_*.json`, `Corporate_*_before.jpg`, and `Backoffice_*_before.jpg`).
- Controlled development and production baselines and final mobile reports: `Measured_*.json` and `Production_*.json` in this directory. R3 JSON reports include their Lighthouse screenshots.
- Validation recorded during the audit: Vite production build passed; Next.js production build passed; backoffice Jest passed (18 tests); TypeScript check passed; production UI image build passed.
- Lighthouse screenshot JSONs and scores are the source of truth; generated R3 screenshots have not been copied into a separate `Audit/After` image directory.

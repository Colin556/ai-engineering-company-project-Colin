# Frontend Performance Corrections Report

## Outcome

The October 22, 2026 Lighthouse exports show higher Performance scores for both
frontends on desktop and mobile. Website mobile LCP improves substantially but
still misses the 2.5 s good threshold. The new backoffice results measure direct
navigation to the login page, not authenticated operational workflows.

This report documents corrections applied in the earlier performance session.
For this follow-up, only this file and the [comparison audit](audit.md) were
created. No application code or frontend architecture was changed.

## After Scores

Scores are 0-100. Changes are Lighthouse points against the original supplied
Codespaces reports, not against the separate localhost production baseline.

| Frontend / profile | Performance after | Change | Accessibility after | Best Practices after | SEO after | LCP after |
|---|---:|---:|---:|---:|---:|---:|
| Website desktop | 99 | +8 | 100 | 100 | 69 | 0.736 s |
| Website mobile | 92 | +20 | 100 | 100 | 69 | 3.091 s |
| Backoffice desktop | 100 | +4 | 100 | 100 | 60 | 0.504 s |
| Backoffice mobile | 99 | +19 | 100 | 100 | 60 | 1.765 s |

After sources: [website desktop](ui_after_lighthouse_desktop.json),
[website mobile](ui_after_lighthouse_mobile.json),
[backoffice desktop](backoffice_after_lighthouse_desktop.json), and
[backoffice mobile](backoffice_after_lighthouse_mobile.json).
The [audit](audit.md) links the matching original reports and provides the full
metric tables, root causes, and measurement settings.

## Corrections Applied Previously

### 1. Replace Runtime Tailwind with Local Build-Time Styling

**Correction:** The website's runtime Tailwind CDN dependency was replaced with
Tailwind integrated into the existing Vite build. Pages reference a local
stylesheet. This preserves the static-page architecture and existing design
classes rather than migrating the website to a different frontend framework.

**Reason:** Runtime CSS generation and third-party stylesheet/script discovery
were part of the original critical-rendering-path findings.

**Result:** Website Performance is now 99 desktop and 92 mobile. Mobile FCP falls
3.009 -> 1.993 s, an improvement of 1.016 s; desktop FCP falls
1.085 -> 0.593 s. The new resource list confirms `/src/styles.css`.
These are combined outcomes, not an isolated measurement of Tailwind's impact.
Development CSS and Vite tooling still produce minification diagnostics.

### 2. Self-Host the Website Fonts

**Correction:** Google Fonts stylesheet requests were replaced with local
Fontsource WOFF2 assets for Barlow Condensed and Source Sans 3. Latin Extended
imports preserve accented-character coverage. The imports reside in
[styles.css](../../uis/website/src/styles.css).

**Reason:** Remove external stylesheet/font-origin dependencies from the initial
render path without changing the intended typography.

**Result:** Website scores remain the same combined 99 desktop / 92 mobile
results above. Local font delivery is part of the rendering-path correction,
but no font-only experiment quantifies its individual timing contribution.
New website CLS is low but nonzero, so a claim of perfect font/layout stability
would be unsupported.

### 3. Tune Responsive Images and Loading Priority

**Correction:** The website gained responsive image candidates and `sizes`,
explicit hero/story dimensions, high priority for the hero, and lazy loading
with asynchronous decoding for the below-fold story image.

**Reason:** The original mobile LCP bottleneck was the hero image; oversized
remote media and early below-fold requests competed for loading resources.

**Result:** With the other changes, website mobile LCP improves
6.060 -> 3.091 s: 2.969 s, or 49.0%. Mobile transfer falls
864,473 -> 693,991 bytes: 170,482 bytes, or 19.7%. Desktop LCP improves
1.534 -> 0.736 s, but desktop transfer is nearly unchanged.

**Limit:** The after reports still estimate image-delivery savings of 206 KiB
mobile and 369 KiB desktop. These include the story image, not just the hero.
The mobile image insight estimates 150 ms LCP savings; it is not a guarantee
that image changes alone would bring LCP below 2.5 s. Remote image/cache and
viewport differences can also affect transfer and timings.

### 4. Add Corporate Robots and Sitemap Files

**Correction:** The website received static
[robots.txt](../../uis/website/public/robots.txt) and
[sitemap.xml](../../uis/website/public/sitemap.xml).

**Reason:** The original website report had an invalid robots response, with
299 parsing errors recorded in the earlier audit, and poor crawlability.

**Result:** Website SEO increases 58 -> 69 on both devices, and the new
`robots-txt` audit has no parsing errors. This supports correction of robots
delivery. Sitemap discovery/indexing is not independently established by these
navigation exports.

**Limit:** The forwarded response still carries
`x-robots-tag: noindex, nofollow`, so `is-crawlable` still fails. These files
cannot override that header. The earlier production baseline already had SEO
100; the +11-point development result must not be presented as a new production
SEO gain. Backoffice SEO remains 60, and its private pages should not be made
publicly indexable just to improve the score.

### 5. Add a Backoffice App Icon

**Correction:** An [app icon route](../../uis/backoffice/app/icon.svg) was added
to provide icon metadata/resources after the earlier production audit recorded
a missing favicon request.

**Reason:** Resolve a small resource/quality issue, unrelated to login rendering
or the main JavaScript loading path.

**Result:** New backoffice Best Practices is 100 on both devices. The original
supplied Codespaces runs were also 100, so there is no gain in that primary
comparison. Separately, the earlier controlled production mobile comparison
improved Best Practices 96 -> 100. That historical result supports the quality
correction, not an explanation for the new +19 mobile Performance points.

### 6. Consolidate Abortable Backoffice List Loading

**Correction:** Shared loading, error, items, and cancellation state was extracted
into [useAsyncList.ts](../../uis/backoffice/lib/useAsyncList.ts) and used by the
products and suppliers lists. Each page retains its domain-specific filters and
mutation logic. The hook uses an AbortController and effect cleanup for requests.

**Reason:** Reduce duplicated asynchronous lifecycle handling within the existing
Next.js architecture; improve consistency and maintainability.

**Result:** Backoffice after scores are 100 desktop / 99 mobile, but neither
login audit exercises the affected lists. No Performance increase is attributed
to this refactor. The earlier report records successful production build and
TypeScript validation; this documentation-only review did not rerun those tests
or establish authenticated list behavior.

## Biggest Impact

**The strongest supported application-level improvement is the website's
initial rendering and image delivery, considered together.** The website keeps
the same homepage route and improves mobile Performance by 20 points, FCP by
1.016 s, and LCP by 2.969 s while transferring 19.7% fewer bytes. Removing runtime
styling/external font dependencies and prioritizing responsive media plausibly
contributed to that result. The reports do not isolate which correction supplied
the largest causal share, so assigning the whole improvement to one is unjustified.

The largest absolute LCP decrease across the four pairs is backoffice mobile:
3.247 s (64.8%). However, the new run starts at `/login` rather than `/`, FCP
barely changes, TBT increases slightly, and transferred bytes increase. A
different authentication/navigation path and page state are therefore more
credible contributors than a smaller bundle or the unexercised list hook.
The data cannot quantify the contribution of that route difference.

The robots fix has the clearest distinct category signal: website SEO rises by
11 points and robots parsing errors disappear, although indexing stays blocked.
The icon and list refactor are quality/maintainability corrections, not major
loading-performance drivers.

## Qualification Against Earlier Production Results

The [previous report](../Before/report.md) recorded much smaller selected-run
production mobile changes: website Performance 76 -> 78 with LCP
5.269 -> 5.114 s, and backoffice Performance 97 -> 98 with LCP
2.134 -> 2.075 s. Those runs used Lighthouse 13.5.0 and Chromium 136 on localhost;
the new files use Lighthouse 13.4.1 and Chrome 155 through Codespaces and contain
development assets. The two sets are separate evidence, not interchangeable
before/after samples. The stronger new development scores do not supersede the
remaining production LCP concern without new production measurements.

## Remaining Risks and Verification Boundary

- Website mobile LCP is 3.091 s, still in the needs-improvement range. Residual
  image efficiency, development JavaScript, and document-compression diagnostics
  remain; no further correction was implemented during this review.
- Website CLS is 0.02724 desktop / 0.00659 mobile, versus zero before. These are
  good values but small regressions. The desktop unsized-logo warning is a risk
  indicator, not conclusive attribution of all shifts.
- All four new reports warn about stored IndexedDB data. Each device/app has
  only one new sample, and screen emulation is disabled in the exports. Repeated
  measurements with matched viewport, route, profile, and cache conditions would
  be needed to establish a stable gain.
- Backoffice still ships development tooling in these runs. Authentication,
  API calls, protected tables, and interaction responsiveness were not validated.
  Its 99 mobile score is not evidence of good field INP.
- No new Lighthouse runs, builds, application tests, or field-data collection
  were performed. Source inspection and saved JSON analysis support this report;
  the earlier report's validation claims remain historical.

No architecture restructuring is needed to interpret these findings. Any later
work should remain targeted and be verified against equivalent production routes
and measurement conditions. This delivery changes documentation only.
# Frontend Lighthouse Audit: Before and After

## Scope and Evidence

This is a read-only analysis of the supplied Lighthouse exports. Only this audit
and the accompanying [report](report.md) were written; no application code,
configuration, dependencies, or frontend architecture was changed for this review.
The directory is named `Audit/After/` in the repository, with a capital `A`.

The primary comparison uses the original Codespaces reports from October 20,
2026, and the new Codespaces reports from October 22, 2026. `UI` means the public
website; the original filenames containing `Backend` actually measure the
backoffice frontend on port 3001, not FastAPI.

| Profile | Before source | After source |
|---|---|---|
| Website desktop | [Original JSON](../Before/LightHouse_Audit_UI_Desktop.json) | [New JSON](ui_after_lighthouse_desktop.json) |
| Website mobile | [Original JSON](../Before/LightHouse_Audit_UI_Mobile.json) | [New JSON](ui_after_lighthouse_mobile.json) |
| Backoffice desktop | [Original JSON](../Before/LightHouse_Audit_Backend_Desktop.json) | [New JSON](backoffice_after_lighthouse_desktop.json) |
| Backoffice mobile | [Original JSON](../Before/LightHouse_Audit_Backend_Mobile.json) | [New JSON](backoffice_after_lighthouse_mobile.json) |

The [previous audit](../Before/audit.md) and [previous report](../Before/report.md)
record the implemented corrections and the separate controlled production runs.
The [code journal](../../Context%20Files/code_journal.md) provides integration
history through October 20 but has no entry describing the performance session.
Consequently, the earlier audit/report, current source, and JSON diagnostics are
the evidence for those corrections, not an inferred journal entry.

## Score Comparison

Scores are on Lighthouse's 0-100 scale; deltas are points, not percentages.
Accessibility and Best Practices were already 100 in the original supplied runs.

| Profile | Performance before -> after | Change | Accessibility before -> after | Best Practices before -> after | SEO before -> after |
|---|---:|---:|---:|---:|---:|
| Website desktop | 91 -> 99 | +8 | 100 -> 100 | 100 -> 100 | 58 -> 69 |
| Website mobile | 72 -> 92 | +20 | 100 -> 100 | 100 -> 100 | 58 -> 69 |
| Backoffice desktop | 96 -> 100 | +4 | 100 -> 100 | 100 -> 100 | 60 -> 60 |
| Backoffice mobile | 80 -> 99 | +19 | 100 -> 100 | 100 -> 100 | 60 -> 60 |

The additional Agentic Browsing category is unchanged: website 67 and backoffice
100 on both devices. It is distinct from SEO and the four headline categories.

## Timing and Transfer Comparison

Times below are seconds except TBT and TTFB, which are milliseconds. CLS is
unitless. Values are rounded for display; calculations use JSON numeric values.

| Profile | FCP before -> after | LCP before -> after | LCP reduction | Speed Index before -> after |
|---|---:|---:|---:|---:|
| Website desktop | 1.085 -> 0.593 | 1.534 -> 0.736 | 0.798 s | 1.463 -> 0.769 |
| Website mobile | 3.009 -> 1.993 | 6.060 -> 3.091 | 2.969 s (49.0%) | 3.009 -> 1.993 |
| Backoffice desktop | 0.746 -> 0.500 | 1.197 -> 0.504 | 0.692 s | 1.407 -> 0.544 |
| Backoffice mobile | 1.770 -> 1.750 | 5.012 -> 1.765 | 3.247 s (64.8%) | 2.314 -> 1.750 |

| Profile | TBT before -> after | TTFB before -> after | CLS before -> after | Transferred bytes before -> after |
|---|---:|---:|---:|---:|
| Website desktop | 0 -> 0 | 464 -> 85 | 0 -> 0.02724 | 864,246 -> 862,651 |
| Website mobile | 0 -> 22 | 187 -> 70 | 0 -> 0.00659 | 864,473 -> 693,991 |
| Backoffice desktop | 0 -> 0 | 501 -> 107 | 0 -> 0 | 804,886 -> 810,469 |
| Backoffice mobile | 30 -> 32.5 | 131 -> 138 | 0 -> 0 | 803,372 -> 808,757 |

The website mobile transfer reduction is 170,482 bytes (19.7%). Desktop website
transfer is almost unchanged; backoffice transfer slightly increases. It would
therefore be incorrect to describe these results as a general bundle-size win.

## Comparability and Limitations

- The primary pairs use Lighthouse 13.4.1, Chrome 155 on Windows, and the same
  Codespaces forwarding origin/port per app. These are more relevant pairs for
  the new exports than the Lighthouse 13.5.0 localhost production runs.
- Website URLs remain `/`. The original backoffice reports request and report
  `/`, whereas the new reports request and report `/login`. The previous local
  runs also show unauthenticated `/` navigation ending at `/login`. Direct login
  navigation avoids the root-route authentication/navigation path; its effect
  cannot be separated from code changes using these samples.
- Mobile uses simulated 150 ms RTT, 1,638.4 Kbps throughput, and 4x CPU slowdown;
  desktop uses 40 ms RTT, 10,240 Kbps, and 1x CPU. The exports mark screen emulation
  as disabled, even though the stored screen configuration lists 412 x 823.
  Do not assume that configuration enforced identical viewport conditions.
- Every new run, and the inspected original mobile runs, warns that stored
  IndexedDB data may affect loading. `disableStorageReset` is false, but that
  does not cancel the explicit warning or establish a pristine browser profile.
- The new website requests `/@vite/client`; the backoffice loads Turbopack HMR
  and Next devtools chunks. These are development runs, not production builds.
- There is one new observation per device/app, not a repeated-run median.
  Forwarding latency, resource-cache state, viewport, server warm-up, and remote
  image delivery can contribute to the differences. No causal share can be
  assigned to an individual correction from these measurements alone.
- These are navigation lab measurements. No CrUX/RUM p75 or INP evidence was
  supplied. TBT and maximum potential FID are not INP. Only the public homepage
  and unauthenticated backoffice entry are covered, not authenticated inventory,
  suppliers, incidents, or API workflows.

## Findings and Root Causes

### 1. Website Mobile LCP Still Needs Improvement

**Evidence:** LCP improves from 6.060 s to 3.091 s, moving from poor (>4 s) to
needs improvement, but remains above the good threshold of 2.5 s. The new
`lcp-breakdown-insight` identifies the homepage hero image as the LCP element.
`image-delivery-insight` still estimates 206 KiB savings on mobile and 369 KiB
on desktop, including the below-fold story image.

**Root cause:** The homepage still depends on remote Unsplash media, with image
encoding/candidate sizing opportunities left after adding responsive markup.
The earlier audit also identified runtime Tailwind and external font stylesheets
on the render path; those dependencies were replaced, not the image origin.
The image findings support remaining delivery inefficiency, but aggregate
image savings include non-LCP content and are not all hero-image savings.

**Assessment:** The targeted changes are directionally supported by faster FCP,
LCP, and lower mobile transfer. The remaining image diagnostic estimates 150 ms
mobile LCP savings, so image bytes alone are not proven to explain the whole
591 ms gap to 2.5 s. Insight subpart durations describe observed trace timings
and must not be summed as though they were the simulated 3.091 s LCP.

### 2. Development Assets Still Inflate Diagnostics

**Evidence:** The website mobile report estimates 209 KiB of unminified JS,
370 KiB of unused JS, and 8 KiB of unminified CSS. It assigns approximately
700 ms of LCP savings to unminified JS. Backoffice mobile estimates 94 KiB of
unminified JS and 416 KiB of unused JS, with 1.4 s JavaScript execution time.
Both apps still flag render-blocking/network dependency diagnostics, although
the new render-blocking insight estimates zero FCP/LCP savings.

**Root cause:** Vite's development client and Next.js development/HMR tooling
are present in the resource lists. Development output is not the minified,
optimized production artifact. Some unused/legacy framework code also remains;
these reports cannot determine its production cost.

**Assessment:** Do not rewrite either frontend or remove framework infrastructure
to satisfy development-only diagnostics. The estimated opportunities overlap
and must not be added as guaranteed savings. A production build under matched
conditions is the appropriate later verification, not a change made here.

### 3. Backoffice LCP Gain Is Confounded by the Entry Route

**Evidence:** Mobile LCP falls 5.012 -> 1.765 s while FCP changes only
1.770 -> 1.750 s, TBT increases 30 -> 32.5 ms, and transfer increases by
5,385 bytes. The new LCP element is the login page's account-registration text.

**Root cause:** The after run enters `/login` directly instead of navigating
through `/` and its client-side authentication path. Different content and
navigation state can change the last/largest painted element independently of
bundle execution. Development server/cache variability is another confounder.

**Assessment:** The after login result is good in this sample, but attributing
the +19 Performance points to the list hook or icon would be unsupported. The
new mobile maximum potential FID diagnostic is 870 ms despite low TBT, reinforcing
that a high navigation score does not establish responsive authenticated usage.

### 4. Crawling Remains Blocked by the Forwarded Response

**Evidence:** All four new reports fail `is-crawlable` with the explicit source
`x-robots-tag: noindex, nofollow`. Website SEO rises 58 -> 69, and its
`robots-txt` diagnostic now contains no parse errors, versus 299 recorded in the
original audit. Backoffice SEO stays at 60.

**Root cause:** The indexing directive is in an HTTP response header on the
forwarded environment; an HTML `index, follow` meta tag or a valid robots file
cannot override that restriction. Adding a valid website robots file fixes the
parse issue but does not make the forwarded response indexable.

**Assessment:** The website SEO improvement is consistent with repaired robots
delivery, not proof of production indexing. The private backoffice should not
be made publicly crawlable to raise this score. The website also retains a
separate failed `llms-txt` Agentic Browsing check; it is not a Core Web Vital or
the cause of the SEO header failure.

### 5. Small Website Layout Shifts Remain

**Evidence:** Website CLS changes from zero to 0.02724 desktop and 0.00659
mobile; both remain below the 0.1 good threshold. The desktop `unsized-images`
audit identifies the header `logo.svg`, which lacks intrinsic HTML dimensions.

**Root cause:** Hero/story dimensions were added, but the desktop logo still
relies on CSS height and automatic width. Font/image loading is a plausible
remaining stability risk. The logo finding does not by itself establish that
the logo caused every recorded shift.

**Assessment:** This is a small measured regression, not a CLS failure. Do not
claim that the corrections eliminated all layout shifts or treat the image
dimension warning as definitive shift attribution.

### 6. Delivery and Developer-Experience Findings Remain

**Evidence:** Both website reports flag uncompressed document delivery, estimating
11 KiB savings. Both backoffice reports flag source-map validity. Backoffice
desktop records two back/forward-cache failure reasons: `cache-control:no-store`
and WebSocket use. TTFB falls on three profiles but rises 131 -> 138 ms on
backoffice mobile.

**Root cause:** Development serving/forwarding does not necessarily apply
production compression; HMR uses WebSockets, and the document uses no-store
caching. Source-map failures relate to generated development artifacts rather
than a confirmed application runtime failure.

**Assessment:** These are environment/developer-experience limitations, not a
reason to weaken authentication caching or restructure routing. Lower observed
TTFB on the other profiles is not evidence of a backend correction. Production
compression, source maps, and back/forward navigation remain unverified here.

## Refactor Analysis

| Change or candidate | Analysis | Verification boundary |
|---|---|---|
| Shared abortable list hook | [useAsyncList.ts](../../uis/backoffice/lib/useAsyncList.ts) consolidates items, loading, errors, effect cleanup, and AbortController handling for the products and suppliers lists. The hook accepts a key, loader, and fallback error, keeping domain filters and mutations in their pages. | A small maintainability refactor within the existing Next.js app. Neither list is exercised by these login audits; no Lighthouse gain is assigned to it. The earlier report records successful build/TypeScript validation, not new tests run for this review. |
| Local website styling/fonts | [styles.css](../../uis/website/src/styles.css) imports Tailwind and local Fontsource assets rather than runtime CDN styling and Google Fonts CSS. | A targeted build/resource-delivery correction within the existing Vite static-page architecture. The new resource list confirms the local stylesheet, but a development export cannot verify final minified production output. |
| Responsive images and loading hints | The [homepage](../../uis/website/index.html) uses responsive hero/story markup; priority, dimensions, and below-fold lazy loading were recorded in the earlier correction report and appear in the supplied diagnostics. | Preserves layout and static pages. Residual image-delivery warnings show the work is not a complete image-performance solution. |
| Shared website header/navigation | Header markup is repeated across the static HTML pages, as documented in the earlier audit. | Still an unimplemented maintainability candidate. No component migration, shared rendering system, or other architecture change is required or proposed as an audit prerequisite. |

## Separate Production Evidence

The earlier controlled production measurements use Lighthouse 13.5.0 with
Chromium 136 on localhost ports 3100/3101. They must not be mixed into the new
Codespaces/Chrome 155 score deltas above.

| Earlier production mobile comparison | Performance before -> final R3 | LCP before -> final R3 | Best Practices before -> final R3 |
|---|---:|---:|---:|
| Website | 76 -> 78 | 5.269 -> 5.114 s | 100 -> 100 |
| Backoffice | 97 -> 98 | 2.134 -> 2.075 s | 96 -> 100 |

Sources: [website baseline](../Before/Production_Corporate_Mobile.json),
[website R3](../Before/Production_Corporate_Mobile_R3.json),
[backoffice baseline](../Before/Production_Backoffice_Mobile.json), and
[backoffice R3](../Before/Production_Backoffice_Mobile_R3.json).
Earlier R2/R3 Performance ranged 76-78 for website and 94-98 for backoffice,
illustrating variance. No new production run was performed for this analysis.

## Conclusion

All four supplied profiles show higher Performance scores, with the strongest
website evidence being lower mobile FCP, LCP, and transfer size. The website
still needs mobile LCP work; the backoffice login is fast in the new samples,
but the route difference prevents clean causal attribution. Accessibility and
Best Practices remain 100; indexing restrictions remain environment-specific.
No production or field Core Web Vitals pass is established by these exports.
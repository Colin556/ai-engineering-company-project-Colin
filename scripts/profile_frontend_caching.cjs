const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function main() {
  const output = process.argv[2];
  if (!output) throw new Error("Usage: node scripts/profile_frontend_caching.cjs OUTPUT.json");
  const origin = process.env.PROFILE_UI_URL || "http://localhost:3001";
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    await page.addInitScript(() => {
      window.__profileCommits = [];
      window.__profileStarted = Infinity;
      let rendererId = 0;
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        renderers: new Map(),
        inject(renderer) {
          rendererId += 1;
          this.renderers.set(rendererId, renderer);
          return rendererId;
        },
        onCommitFiberRoot(identifier, root) {
          if (window.__profileStarted === Infinity) return;
          let rowsRendered = 0;
          const visit = (fiber) => {
            if (!fiber) return;
            if (fiber.type?.name === "SupplierRow" && fiber.actualStartTime >= window.__profileStarted) {
              rowsRendered += 1;
            }
            visit(fiber.child);
            visit(fiber.sibling);
          };
          visit(root.current);
          window.__profileCommits.push({ durationMs: root.current.actualDuration || 0, rowsRendered });
        },
        onCommitFiberUnmount() {},
        onPostCommitFiberRoot() {},
      };
    });
    await page.goto(`${origin}/login`);
    await page.evaluate(async () => {
      const response = await fetch("/backend/auth/login/json", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "profile-0@example.com", password: "LocalProfile123!" }),
      });
      if (!response.ok) throw new Error(`Synthetic login failed: ${response.status}`);
      localStorage.setItem("brasaland_access_token", (await response.json()).access_token);
    });
    await page.goto(`${origin}/suppliers`);
    await page.locator("tbody tr").filter({ hasText: "Supply 01199" }).waitFor({ timeout: 60000 });
    const rowCount = await page.locator("tbody tr").count();
    assert(rowCount >= 1200, `Expected realistic supplier data, got ${rowCount}`);
    const input = page.getByRole("textbox", { name: "Name", exact: true });
    await input.scrollIntoViewIfNeeded();
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await settle();
    const requests = [];
    page.on("request", request => {
      if (request.url().includes("/backend/")) requests.push(new URL(request.url()).pathname);
    });
    const interactions = [];
    for (const name of ["Coastal", "Coastal foods", "Coastal foods group", "Coastal foods group CO", "Coastal foods group Colombia"]) {
      await page.evaluate(() => {
        window.__profileStarted = performance.now();
        window.__profileCommits = [];
      });
      await input.fill(name);
      await settle();
      interactions.push(await page.evaluate(() => ({
        elapsedMs: performance.now() - window.__profileStarted,
        commits: window.__profileCommits,
      })));
    }
    assert.equal(requests.length, 0, "Editing a draft must not fetch suppliers again");
    assert(interactions.every(item => item.commits.some(commit => commit.durationMs > 0)),
      "React profiling data is unavailable; use a development/profiling build");
    const median = values => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)];
    const result = {
      url: `${origin}/suppliers`, browser: await browser.version(),
      conditions: "development React profiling, 1440x1000, 4x CPU, unthrottled loopback network, authenticated, loaded table",
      rows: rowCount, interactions, apiRequestsDuringEditing: requests.length,
      medianInteractionMs: median(interactions.map(item => item.elapsedMs)),
      medianRenderMs: median(interactions.map(item => item.commits.reduce((total, commit) => total + commit.durationMs, 0))),
      medianSupplierRowsRendered: median(interactions.map(item => item.commits.reduce((total, commit) => total + commit.rowsRendered, 0))),
    };
    if (process.env.EXPECT_ISOLATED_FORM === "1") {
      assert.equal(result.medianSupplierRowsRendered, 0, "Draft edits rerendered supplier rows");
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
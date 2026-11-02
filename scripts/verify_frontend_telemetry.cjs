const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const Ajv = require("../uis/backoffice/node_modules/ajv");

const root = path.resolve(__dirname, "..");
const api = "http://localhost:8000";
const ui = "http://localhost:3001";
const validate = new Ajv().compile(JSON.parse(fs.readFileSync(path.join(root, "docs/event-schemas.json"), "utf8")));
const mandatory = ["inbound_order_created", "outbound_order_created", "stock_waste_registered", "stock_threshold_triggered", "direct_stock_edit_rejected", "ingredient_price_variance_detected"];

async function main() {
  assert.equal(process.env.TELEMETRY_VERIFY_ISOLATED, "1", "Run only against the documented disposable verification servers.");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const batches = [];
    const validateBatch = (body) => {
      assert.deepEqual(Object.keys(body), ["events"]);
      assert.ok(body.events.length > 0);
      for (const event of body.events) {
        assert.ok(validate(event), JSON.stringify(validate.errors));
        assert.ok(Date.parse(event.timestamp) <= Date.now());
        assert.ok(!JSON.stringify(event).includes("private-value-never-capture"));
        assert.ok(!JSON.stringify(event).includes("capture-verification@example.com"));
      }
      batches.push(body.events);
    };
    await context.exposeBinding("recordTelemetryBeacon", (_, body) => validateBatch(body));
    await context.addInitScript(() => {
      const parts = new WeakMap();
      const OriginalBlob = Blob;
      window.Blob = class extends OriginalBlob {
        constructor(values, options) { super(values, options); parts.set(this, values); }
      };
      const original = navigator.sendBeacon.bind(navigator);
      window.telemetryBeaconCount = 0;
      navigator.sendBeacon = (...args) => {
        window.telemetryBeaconCount++;
        const values = parts.get(args[1]);
        if (values && args[0].endsWith("/telemetry/events")) void window.recordTelemetryBeacon(JSON.parse(values.join("")));
        return original(...args);
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    let receivedResponses = 0;
    let countChecks = 0;
    page.on("request", (request) => {
      if (request.url() === `${api}/telemetry/events` && request.method() === "POST") {
        const body = request.postDataJSON();
        if (body) validateBatch(body);
      }
    });
    page.on("response", (response) => {
      if (response.url() === `${api}/telemetry/events` && response.request().method() === "POST") {
        assert.equal(response.status(), 200);
        receivedResponses++;
      }
    });
    page.on("pageerror", () => {});
    const waitForCaptured = async (type) => {
      if (batches.flat().some((event) => event.event_type === type)) return;
      const response = await page.waitForResponse((response) => response.url() === `${api}/telemetry/events` && response.request().postDataJSON()?.events.some((event) => event.event_type === type), { timeout: 20_000 });
      const body = await response.json();
      assert.equal(body.received, response.request().postDataJSON().events.length);
      countChecks++;
    };

    const tokenResponse = await context.request.post(`${api}/auth/login`, { form: { username: "capture-verification@example.com", password: "VerificationPass42!" } });
    assert.equal(tokenResponse.status(), 200);
    const token = (await tokenResponse.json()).access_token;
    const headers = { Authorization: `Bearer ${token}` };
    const sku = `TELEMETRY-${randomUUID()}`;
    const created = await context.request.post(`${api}/inventory/products`, { headers, data: { name: "Telemetry Verification Ingredient", sku, category: "meat", unit: "kg", country: "CO" } });
    assert.equal(created.status(), 201);
    const product = await created.json();
    const suppliers = await (await context.request.get(`${api}/suppliers`, { headers })).json();
    const supplier = suppliers.find((item) => item.country === "CO" && item.status === "active");
    const configured = await context.request.put(`${api}/inventory/products/${product.id}/locations/1/settings`, { headers, data: { minimum_quantity: 5 } });
    assert.equal(configured.status(), 200);

    console.log("Verifying authentication");
    await page.goto(`${ui}/login`);
    await page.locator('input[type="email"]').fill("capture-verification@example.com");
    await page.locator('input[type="password"]').fill("private-value-never-capture");
    await Promise.all([page.waitForResponse((response) => response.url().endsWith("/auth/login") && response.status() === 401), page.locator('button[type="submit"]').click()]);
    await waitForCaptured("auth_login_failed");
    await page.locator('input[type="password"]').fill("VerificationPass42!");
    await Promise.all([page.waitForURL(`${ui}/`), page.locator('button[type="submit"]').click()]);
    await waitForCaptured("auth_login_succeeded");

    console.log("Verifying inbound orders and price variance");
    await page.goto(`${ui}/inventory/orders/inbound?ingredient_id=${product.id}`);
    for (const cost of [100, 100, 100, 120]) {
      await page.locator("#quantity").fill("10");
      await page.locator("#supplier_name").selectOption(String(supplier.id));
      await page.locator("#unit_cost").fill(String(cost));
      const [response] = await Promise.all([
        page.waitForResponse((response) => response.url().endsWith("/inventory/orders/inbound") && response.request().method() === "POST"),
        page.locator('button[type="submit"]').click(),
      ]);
      assert.equal(response.status(), 201, await response.text());
      await page.waitForFunction(() => document.querySelector("#quantity")?.value === "", { timeout: 10_000 });
    }

    await waitForCaptured("ingredient_price_variance_detected");
    console.log("Verifying consumption, waste, and minimum crossing");
    await page.goto(`${ui}/inventory/orders/outbound?ingredient_id=${product.id}`);
    await page.locator("#quantity").fill("36");
    const [consumed] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/inventory/orders/outbound") && response.request().method() === "POST"),
      page.locator('button[type="submit"]').click(),
    ]);
    assert.equal(consumed.status(), 201, await consumed.text());
    await page.locator("#reason").selectOption("waste");
    await page.locator("#quantity").fill("1");
    await page.locator("#waste_cause").selectOption("expired");
    await page.locator("#unit_cost").fill("100");
    const [wasted] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/inventory/orders/outbound") && response.request().method() === "POST"),
      page.locator('button[type="submit"]').click(),
    ]);
    assert.equal(wasted.status(), 201, await wasted.text());
    await waitForCaptured("stock_waste_registered");

    console.log("Verifying rejected stock editing");
    await page.goto(`${ui}/inventory/products`);
    await page.getByRole("row").filter({ hasText: sku }).getByRole("button", { name: "Controls" }).click();
    const [rejected] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/inventory/products/${product.id}/stock`)),
      page.getByLabel("Total Stock (kg)").evaluate((input) => {
        const data = new DataTransfer();
        data.setData("text", "900");
        input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      }),
    ]);
    assert.equal(rejected.status(), 403);
    await waitForCaptured("direct_stock_edit_rejected");
    await page.getByRole("button", { name: "Close", exact: true }).click();

    console.log("Verifying navigation and technical events");
    for (const route of ["/suppliers", "/incidents", "/account/profile", "/account/change-password", "/inventory/orders"]) {
      await page.goto(`${ui}${route}`);
      await page.locator("main").waitFor();
    }
    await page.evaluate(() => {
      setTimeout(() => { throw new Error("private-value-never-capture"); }, 0);
      void Promise.reject(new Error("private-value-never-capture"));
    });
    await page.waitForResponse((response) => response.url() === `${api}/telemetry/events` && response.request().postDataJSON()?.events.some((event) => event.event_type === "frontend_error_captured"), { timeout: 20_000 });
    const hiddenResponse = page.waitForResponse((response) => response.url() === `${api}/telemetry/events`, { timeout: 20_000 });
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent("error"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await hiddenResponse;
    assert.ok(await page.evaluate(() => window.telemetryBeaconCount > 0));
    const events = batches.flat();
    const types = new Set(events.map((event) => event.event_type));
    for (const type of [...mandatory, "auth_login_succeeded", "auth_login_failed", "navigation_section_viewed", "frontend_error_captured", "web_vital_recorded"]) assert.ok(types.has(type), `Missing browser event ${type}`);
    for (const event of events.filter((event) => mandatory.includes(event.event_type))) {
      assert.match(event.userId, /^[a-f0-9]{64}$/);
      assert.ok(event.sessionId);
    }
    const stored = await (await context.request.get(`${api}/inventory/products/${product.id}`, { headers })).json();
    assert.equal(stored.current_stock, 3);
    await page.goto(`${ui}/inventory/products`);
    await page.getByRole("row").filter({ hasText: sku }).waitFor();
    await page.screenshot({ path: "/tmp/telemetry-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("row").filter({ hasText: sku }).getByRole("button", { name: "Controls" }).click();
    await page.screenshot({ path: "/tmp/telemetry-mobile.png", fullPage: true });
    const bounds = await page.getByRole("dialog").boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert.ok(countChecks > 0);
    console.log(JSON.stringify({ batches: batches.length, events: events.length, received_responses: receivedResponses, received_count_checks: countChecks, event_types: [...types].sort(), mandatory: mandatory.length, status: "all receiver responses 200", beacon: "verified", screenshots: ["/tmp/telemetry-desktop.png", "/tmp/telemetry-mobile.png"] }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
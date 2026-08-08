import {
  calculateLocationPerformanceScores,
  calculateWasteCostTotal,
  filterSalesByDateRange,
  filterSalesByLocation,
  filterSalesByProduct,
  formatCountMap,
  generateOperationsReport,
  searchSalesByDateBinary,
  searchSalesLinear,
  sortCollection,
  validateOperationsDataset
} from "./brasaland";
import {
  exchangeRates,
  menuItems,
  restaurantLocations,
  sales,
  wasteRecords
} from "./sampleData";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(amount);
}

function renderMetricCard(title: string, value: string, detail: string): string {
  return `
    <article class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">${title}</p>
      <p class="mt-3 font-display text-3xl text-white">${value}</p>
      <p class="mt-2 text-sm text-stone-300">${detail}</p>
    </article>
  `;
}

function renderCountList(title: string, rows: Array<{ label: PropertyKey; count: number }>): string {
  const items = rows
    .map(
      ({ label, count }) => `
        <li class="flex items-center justify-between border-b border-stone-800 py-3 text-sm text-stone-200 last:border-b-0">
          <span>${String(label)}</span>
          <span class="font-semibold text-amber-200">${count}</span>
        </li>
      `
    )
    .join("");

  return `
    <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
      <h3 class="font-display text-2xl text-white">${title}</h3>
      <ul class="mt-4">${items}</ul>
    </section>
  `;
}

function renderSandbox(): void {
  const sandbox = document.getElementById("operations-sandbox");

  if (!sandbox) {
    return;
  }

  const reportUsd = generateOperationsReport({
    locations: restaurantLocations,
    menuItems,
    sales,
    wasteRecords,
    exchangeRates,
    currency: "USD"
  });
  const reportCop = generateOperationsReport({
    locations: restaurantLocations,
    menuItems,
    sales,
    wasteRecords,
    exchangeRates,
    currency: "COP"
  });
  const validationIssues = validateOperationsDataset({
    locations: restaurantLocations,
    employees: [],
    inventoryItems: [],
    loyaltyMembers: [],
    menuItems,
    sales,
    wasteRecords,
    exchangeRates
  });

  const sortedSales = sortCollection(sales, (left, right) =>
    left.timestamp.toISOString().localeCompare(right.timestamp.toISOString())
  );

  const locationSales = filterSalesByLocation(sales, "LOC-MEDELLIN-01");
  const productSales = filterSalesByProduct(sales, "menu-churrasco");
  const dateRangeSales = filterSalesByDateRange(sales, {
    startDate: "2026-08-06",
    endDate: "2026-08-07"
  });

  const linearSalesSearch = searchSalesLinear(sales, {
    locationId: "LOC-MEDELLIN-01",
    menuItemId: "menu-churrasco",
    soldOn: "2026-08-06"
  });

  const dateSearch = searchSalesByDateBinary(
    sortedSales,
    "2026-08-07"
  );

  const locationPerformance = calculateLocationPerformanceScores({
    locations: restaurantLocations,
    sales,
    menuItems
  });

  sandbox.innerHTML = `
    <div class="grid gap-5 lg:grid-cols-3">
      ${renderMetricCard(
        "Revenue (USD)",
        formatCurrency(reportUsd.totals.revenue),
        `${sales.length} sales records across Brasaland locations and menu items.`
      )}
      ${renderMetricCard(
        "Margin (COP)",
        new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(reportCop.totals.margin),
        `Multi-currency margin conversion uses the typed exchange-rate utility.`
      )}
      ${renderMetricCard(
        "Validation Issues",
        String(validationIssues.length),
        validationIssues.length === 0
          ? "Sample data passes the current Brasaland business rules."
          : "Some sample records need review before processing."
      )}
    </div>
    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      ${renderCountList("Sales By Payment Method", formatCountMap(reportUsd.salesByPaymentMethod))}
      ${renderCountList("Waste By Reason", formatCountMap(reportUsd.wasteByReason))}
    </div>
    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      ${renderCountList(
        "Location Performance Scores",
        locationPerformance.map((score) => ({ label: score.locationName, count: score.score }))
      )}
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <h3 class="font-display text-2xl text-white">Waste Snapshot</h3>
        <ul class="mt-4 space-y-3 text-sm text-stone-200">
          <li>Total waste records: <span class="font-semibold text-amber-200">${wasteRecords.length}</span></li>
          <li>Total waste cost (USD): <span class="font-semibold text-amber-200">${formatCurrency(calculateWasteCostTotal(wasteRecords, "USD"))}</span></li>
          <li>Total waste cost (COP): <span class="font-semibold text-amber-200">${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(reportCop.totalWasteCost)}</span></li>
        </ul>
      </section>
    </div>
    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <h3 class="font-display text-2xl text-white">Collection Management Checks</h3>
        <dl class="mt-4 space-y-3 text-sm text-stone-200">
          <div class="flex items-start justify-between gap-4">
            <dt>Sales filtered by location</dt>
            <dd class="text-right text-amber-200">${locationSales.length}</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt>Sales filtered by product</dt>
            <dd class="text-right text-amber-200">${productSales.length}</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt>Sales filtered by date range</dt>
            <dd class="text-right text-amber-200">${dateRangeSales.length}</dd>
          </div>
        </dl>
      </section>
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <h3 class="font-display text-2xl text-white">Operational Highlights</h3>
        <ul class="mt-4 space-y-3 text-sm text-stone-200">
          <li>Linear sales search: <span class="font-semibold text-amber-200">${linearSalesSearch.item?.id ?? "Not found"}</span></li>
          <li>Binary date search: <span class="font-semibold text-amber-200">${dateSearch.item?.id ?? "Not found"}</span></li>
          <li>Top revenue location: <span class="font-semibold text-amber-200">${reportUsd.topLocation?.locationName ?? "None"}</span></li>
        </ul>
      </section>
    </div>
    <div class="mt-8 rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
      <h3 class="font-display text-2xl text-white">Aggregated Product Report</h3>
      <ul class="mt-4 grid gap-3 md:grid-cols-2">
        ${reportUsd.unitsSoldByProduct
          .map(
            (product) => `
              <li class="flex items-center justify-between rounded-lg border border-stone-800 px-4 py-3 text-sm text-stone-200">
                <span>${product.menuItemName}</span>
                <span class="font-semibold text-amber-200">${product.unitsSold} units</span>
              </li>
            `
          )
          .join("")}
      </ul>
    </div>
  `;
}

renderSandbox();
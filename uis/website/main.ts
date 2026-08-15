import {
  calculateFinancialMetrics,
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

type SelectOption = {
  value: string;
  label: string;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(amount);
}

function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(amount);
}

function createOptionsHtml(options: SelectOption[]): string {
  return options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function renderRows(
  rows: Array<{ label: string; count: number }>,
  emptyMessage: string
): string {
  if (rows.length === 0) {
    return `<li class="py-3 text-sm text-stone-400">${emptyMessage}</li>`;
  }

  return rows
    .map(
      ({ label, count }) => `
        <li class="flex items-center justify-between border-b border-stone-800 py-3 text-sm text-stone-200 last:border-b-0">
          <span>${label}</span>
          <span class="font-semibold text-amber-200">${count}</span>
        </li>
      `
    )
    .join("");
}

function renderMiniBarChart(
  rows: Array<{ label: string; value: number }>,
  emptyMessage: string,
  valueFormatter: (value: number) => string
): string {
  if (rows.length === 0) {
    return `<p class="text-xs text-stone-400">${emptyMessage}</p>`;
  }

  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);

  return `
    <div class="space-y-2" role="img" aria-label="Mini chart">
      ${rows
        .map((row) => {
          const percentage = totalValue === 0 ? 0 : (row.value / totalValue) * 100;
          const percentageLabel = `${percentage.toFixed(1)}%`;

          return `
            <div class="grid grid-cols-[72px_1fr_auto] items-center gap-2 text-xs">
              <span class="text-stone-400">${row.label}</span>
              <div class="h-2 rounded-full bg-stone-800">
                <div class="h-2 rounded-full bg-amber-400/80" style="width: ${percentage}%;"></div>
              </div>
              <span class="text-amber-200">${percentageLabel}</span>
            </div>
            <div class="-mt-1 grid grid-cols-[72px_1fr_auto] items-center gap-2 text-[11px]">
              <span></span>
              <span></span>
              <span class="text-stone-500">${valueFormatter(row.value)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function getSortedDateBuckets(scopedSales: typeof sales): string[] {
  return Array.from(
    new Set(scopedSales.map((sale) => sale.timestamp.toISOString().slice(0, 10)))
  ).sort((left, right) => left.localeCompare(right));
}

function renderSandbox(): void {
  const sandbox = document.getElementById("operations-sandbox");

  if (!sandbox) {
    return;
  }

  const locationNameById = new Map(
    restaurantLocations.map((location) => [location.id, location.name])
  );
  const menuNameById = new Map(menuItems.map((item) => [item.id, item.name]));
  const availableDates = Array.from(
    new Set(sales.map((sale) => sale.timestamp.toISOString().slice(0, 10)))
  ).sort((left, right) => left.localeCompare(right));
  const availableCountries = Array.from(
    new Set(restaurantLocations.map((location) => location.country))
  ).sort((left, right) => left.localeCompare(right));

  const locationOptions: SelectOption[] = [
    { value: "all", label: "All locations" },
    ...restaurantLocations.map((location) => ({
      value: location.id,
      label: `${location.name} (${location.city})`
    }))
  ];
  const productOptions: SelectOption[] = [
    { value: "all", label: "All products" },
    ...menuItems.map((item) => ({ value: item.id, label: item.name }))
  ];
  const dateOptions: SelectOption[] = [
    { value: "all", label: "All days" },
    ...availableDates.map((dateValue) => ({ value: dateValue, label: dateValue }))
  ];
  const validationScopeOptions: SelectOption[] = [
    { value: "all", label: "All validations" },
    { value: "locations", label: "Locations" },
    { value: "sales", label: "Sales" },
    { value: "waste", label: "Waste" },
    { value: "menu", label: "Menu" }
  ];
  const productCategoryOptions: SelectOption[] = [
    { value: "all", label: "All categories" },
    ...Array.from(new Set(menuItems.map((item) => item.category))).map((category) => ({
      value: category,
      label: category
    }))
  ];
  const countryOptions: SelectOption[] = [
    { value: "all", label: "All markets" },
    ...availableCountries.map((country) => ({ value: country, label: country }))
  ];

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

  const classifyIssueScope = (entityName: string): string => {
    if (entityName.startsWith("LOC-")) {
      return "locations";
    }
    if (entityName.startsWith("TXN-")) {
      return "sales";
    }
    if (entityName.startsWith("WASTE-")) {
      return "waste";
    }
    if (entityName.startsWith("menu-")) {
      return "menu";
    }

    return "all";
  };

  sandbox.innerHTML = `
    <div class="grid gap-5 lg:grid-cols-3">
      <article class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Revenue (USD)</p>
          <label class="text-xs text-stone-400">
            Location
            <select id="revenue-location-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(locationOptions)}
            </select>
          </label>
        </div>
        <p id="revenue-value" class="mt-3 font-display text-3xl text-white">${formatCurrency(reportUsd.totals.revenue)}</p>
        <p id="revenue-detail" class="mt-2 text-sm text-stone-300"></p>
        <div id="revenue-trend" class="mt-4"></div>
      </article>

      <article class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Margin (COP)</p>
          <label class="text-xs text-stone-400">
            Product
            <select id="margin-product-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(productOptions)}
            </select>
          </label>
        </div>
        <p id="margin-value" class="mt-3 font-display text-3xl text-white">${formatCop(reportCop.totals.margin)}</p>
        <p id="margin-detail" class="mt-2 text-sm text-stone-300"></p>
        <div id="margin-trend" class="mt-4"></div>
      </article>

      <article class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Validation Issues</p>
          <label class="text-xs text-stone-400">
            Scope
            <select id="validation-scope-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(validationScopeOptions)}
            </select>
          </label>
        </div>
        <p id="validation-value" class="mt-3 font-display text-3xl text-white">${validationIssues.length}</p>
        <p id="validation-detail" class="mt-2 text-sm text-stone-300"></p>
      </article>
    </div>

    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <h3 class="font-display text-2xl text-white">Sales By Payment Method</h3>
          <label class="text-xs text-stone-400">
            Location
            <select id="payment-location-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(locationOptions)}
            </select>
          </label>
        </div>
        <ul id="payment-list" class="mt-4"></ul>
        <div id="payment-trend" class="mt-4"></div>
      </section>

      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <h3 class="font-display text-2xl text-white">Waste By Reason</h3>
          <label class="text-xs text-stone-400">
            Location
            <select id="waste-location-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(locationOptions)}
            </select>
          </label>
        </div>
        <ul id="waste-list" class="mt-4"></ul>
        <div id="waste-trend" class="mt-4"></div>
      </section>
    </div>

    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <h3 class="font-display text-2xl text-white">Location Performance Scores</h3>
          <label class="text-xs text-stone-400">
            Market
            <select id="performance-country-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(countryOptions)}
            </select>
          </label>
        </div>
        <ul id="performance-list" class="mt-4"></ul>
        <div id="performance-trend" class="mt-4"></div>
      </section>

      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <h3 class="font-display text-2xl text-white">Waste Snapshot</h3>
        <label class="mt-2 block text-xs text-stone-400">
          Location
          <select id="waste-snapshot-location-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
            ${createOptionsHtml(locationOptions)}
          </select>
        </label>
        <ul id="waste-snapshot-list" class="mt-4 space-y-3 text-sm text-stone-200"></ul>
      </section>
    </div>

    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <h3 class="font-display text-2xl text-white">Collection Management Checks</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <label class="text-xs text-stone-400">
            Location
            <select id="checks-location-select" class="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(locationOptions)}
            </select>
          </label>
          <label class="text-xs text-stone-400">
            Product
            <select id="checks-product-select" class="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(productOptions)}
            </select>
          </label>
          <label class="text-xs text-stone-400">
            Date
            <select id="checks-date-select" class="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${createOptionsHtml(dateOptions)}
            </select>
          </label>
        </div>
        <dl id="checks-details" class="mt-4 space-y-3 text-sm text-stone-200"></dl>
        <div id="checks-trend" class="mt-4"></div>
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
      <div class="flex items-end justify-between gap-4">
        <h3 class="font-display text-2xl text-white">Aggregated Product Report</h3>
        <label class="text-xs text-stone-400">
          Category
          <select id="product-category-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
            ${createOptionsHtml(productCategoryOptions)}
          </select>
        </label>
      </div>
      <ul id="product-report-list" class="mt-4 grid gap-3 md:grid-cols-2"></ul>
    </div>
  `;

  const revenueLocationSelect = document.getElementById("revenue-location-select") as HTMLSelectElement;
  const marginProductSelect = document.getElementById("margin-product-select") as HTMLSelectElement;
  const validationScopeSelect = document.getElementById("validation-scope-select") as HTMLSelectElement;
  const paymentLocationSelect = document.getElementById("payment-location-select") as HTMLSelectElement;
  const wasteLocationSelect = document.getElementById("waste-location-select") as HTMLSelectElement;
  const performanceCountrySelect = document.getElementById("performance-country-select") as HTMLSelectElement;
  const wasteSnapshotLocationSelect = document.getElementById("waste-snapshot-location-select") as HTMLSelectElement;
  const checksLocationSelect = document.getElementById("checks-location-select") as HTMLSelectElement;
  const checksProductSelect = document.getElementById("checks-product-select") as HTMLSelectElement;
  const checksDateSelect = document.getElementById("checks-date-select") as HTMLSelectElement;
  const productCategorySelect = document.getElementById("product-category-select") as HTMLSelectElement;

  const updateRevenueCard = (): void => {
    const selectedLocationId = revenueLocationSelect.value;
    const scopedSales = selectedLocationId === "all"
      ? sales
      : filterSalesByLocation(sales, selectedLocationId);
    const scopedReport = generateOperationsReport({
      locations: restaurantLocations,
      menuItems,
      sales: scopedSales,
      wasteRecords,
      exchangeRates,
      currency: "USD"
    });
    const averageTicket = scopedSales.length === 0 ? 0 : scopedReport.totals.revenue / scopedSales.length;
    const selectedLabel = selectedLocationId === "all"
      ? "all locations"
      : locationNameById.get(selectedLocationId) ?? selectedLocationId;

    const revenueValue = document.getElementById("revenue-value");
    const revenueDetail = document.getElementById("revenue-detail");
    const revenueTrend = document.getElementById("revenue-trend");

    if (revenueValue && revenueDetail) {
      revenueValue.textContent = formatCurrency(scopedReport.totals.revenue);
      revenueDetail.textContent = `${scopedSales.length} transactions in ${selectedLabel}. Avg ticket ${formatCurrency(averageTicket)}.`;
    }

    if (revenueTrend) {
      const buckets = getSortedDateBuckets(scopedSales);
      const trendRows = buckets.map((date) => {
        const dailyRevenue = scopedSales
          .filter((sale) => sale.timestamp.toISOString().slice(0, 10) === date)
          .reduce((sum, sale) => sum + sale.totalPrice.USD, 0);

        return { label: date.slice(5), value: dailyRevenue };
      });

      revenueTrend.innerHTML = renderMiniBarChart(
        trendRows,
        "No daily revenue trend for this filter.",
        (value) => `$${value.toFixed(0)}`
      );
    }
  };

  const updateMarginCard = (): void => {
    const selectedProductId = marginProductSelect.value;
    const scopedSales = selectedProductId === "all"
      ? sales
      : filterSalesByProduct(sales, selectedProductId);
    const scopedMetrics = calculateFinancialMetrics(
      scopedSales,
      menuItems,
      "COP",
      exchangeRates
    );
    const unitsSold = scopedSales.reduce((sum, sale) => sum + sale.quantity, 0);
    const selectedLabel = selectedProductId === "all"
      ? "all products"
      : menuNameById.get(selectedProductId) ?? selectedProductId;

    const marginValue = document.getElementById("margin-value");
    const marginDetail = document.getElementById("margin-detail");
    const marginTrend = document.getElementById("margin-trend");

    if (marginValue && marginDetail) {
      marginValue.textContent = formatCop(scopedMetrics.margin);
      marginDetail.textContent = `${unitsSold} units sold for ${selectedLabel}. Margin ${scopedMetrics.marginPercentage.toFixed(1)}%.`;
    }

    if (marginTrend) {
      const buckets = getSortedDateBuckets(scopedSales);
      const trendRows = buckets.map((date) => {
        const dailySales = scopedSales.filter(
          (sale) => sale.timestamp.toISOString().slice(0, 10) === date
        );
        const dailyMargin = calculateFinancialMetrics(
          dailySales,
          menuItems,
          "COP",
          exchangeRates
        ).margin;

        return { label: date.slice(5), value: dailyMargin };
      });

      marginTrend.innerHTML = renderMiniBarChart(
        trendRows,
        "No daily margin trend for this filter.",
        (value) => formatCop(value)
      );
    }
  };

  const updateValidationCard = (): void => {
    const selectedScope = validationScopeSelect.value;
    const scopedIssues = selectedScope === "all"
      ? validationIssues
      : validationIssues.filter((issue) => classifyIssueScope(issue.entityName) === selectedScope);

    const validationValue = document.getElementById("validation-value");
    const validationDetail = document.getElementById("validation-detail");

    if (validationValue && validationDetail) {
      validationValue.textContent = String(scopedIssues.length);
      validationDetail.textContent = scopedIssues.length === 0
        ? "No issues found for this validation scope."
        : `First issue: ${scopedIssues[0].field} on ${scopedIssues[0].entityName}.`;
    }
  };

  const updatePaymentCard = (): void => {
    const selectedLocationId = paymentLocationSelect.value;
    const scopedSales = selectedLocationId === "all"
      ? sales
      : filterSalesByLocation(sales, selectedLocationId);
    const paymentRows = formatCountMap(
      generateOperationsReport({
        locations: restaurantLocations,
        menuItems,
        sales: scopedSales,
        wasteRecords,
        exchangeRates,
        currency: "USD"
      }).salesByPaymentMethod
    ).map((row) => ({ label: String(row.label), count: row.count }));

    const paymentList = document.getElementById("payment-list");
    const paymentTrend = document.getElementById("payment-trend");
    if (paymentList) {
      paymentList.innerHTML = renderRows(
        paymentRows,
        "No sales for this location filter."
      );
    }

    if (paymentTrend) {
      paymentTrend.innerHTML = renderMiniBarChart(
        paymentRows.map((row) => ({ label: row.label, value: row.count })),
        "No payment-method distribution for this filter.",
        (value) => `${value}`
      );
    }
  };

  const updateWasteReasonCard = (): void => {
    const selectedLocationId = wasteLocationSelect.value;
    const scopedWasteRecords = selectedLocationId === "all"
      ? wasteRecords
      : wasteRecords.filter((waste) => waste.locationId === selectedLocationId);
    const wasteRows = formatCountMap(
      generateOperationsReport({
        locations: restaurantLocations,
        menuItems,
        sales,
        wasteRecords: scopedWasteRecords,
        exchangeRates,
        currency: "USD"
      }).wasteByReason
    ).map((row) => ({ label: String(row.label), count: row.count }));

    const wasteList = document.getElementById("waste-list");
    const wasteTrend = document.getElementById("waste-trend");
    if (wasteList) {
      wasteList.innerHTML = renderRows(
        wasteRows,
        "No waste records for this location filter."
      );
    }

    if (wasteTrend) {
      wasteTrend.innerHTML = renderMiniBarChart(
        wasteRows.map((row) => ({ label: row.label, value: row.count })),
        "No waste-reason trend for this filter.",
        (value) => `${value}`
      );
    }
  };

  const updatePerformanceCard = (): void => {
    const selectedCountry = performanceCountrySelect.value;
    const scopedLocations = selectedCountry === "all"
      ? restaurantLocations
      : restaurantLocations.filter((location) => location.country === selectedCountry);
    const scopedLocationIds = new Set(scopedLocations.map((location) => location.id));
    const scopedSales = sales.filter((sale) => scopedLocationIds.has(sale.locationId));
    const scopedScores = calculateLocationPerformanceScores({
      locations: scopedLocations,
      sales: scopedSales,
      menuItems
    }).map((score) => ({ label: score.locationName, count: score.score }));

    const performanceList = document.getElementById("performance-list");
    const performanceTrend = document.getElementById("performance-trend");
    if (performanceList) {
      performanceList.innerHTML = renderRows(
        scopedScores,
        "No locations available for this market filter."
      );
    }

    if (performanceTrend) {
      performanceTrend.innerHTML = renderMiniBarChart(
        scopedScores.map((row) => ({ label: row.label.slice(0, 10), value: row.count })),
        "No performance comparison for this filter.",
        (value) => `${value}`
      );
    }
  };

  const updateWasteSnapshotCard = (): void => {
    const selectedLocationId = wasteSnapshotLocationSelect.value;
    const scopedWasteRecords = selectedLocationId === "all"
      ? wasteRecords
      : wasteRecords.filter((waste) => waste.locationId === selectedLocationId);
    const scopedWasteCostUsd = calculateWasteCostTotal(scopedWasteRecords, "USD");
    const scopedWasteCostCop = calculateWasteCostTotal(scopedWasteRecords, "COP");

    const snapshotList = document.getElementById("waste-snapshot-list");
    if (snapshotList) {
      snapshotList.innerHTML = `
        <li>Total waste records: <span class="font-semibold text-amber-200">${scopedWasteRecords.length}</span></li>
        <li>Total waste cost (USD): <span class="font-semibold text-amber-200">${formatCurrency(scopedWasteCostUsd)}</span></li>
        <li>Total waste cost (COP): <span class="font-semibold text-amber-200">${formatCop(scopedWasteCostCop)}</span></li>
      `;
    }
  };

  const updateCollectionChecksCard = (): void => {
    const selectedLocationId = checksLocationSelect.value;
    const selectedProductId = checksProductSelect.value;
    const selectedDate = checksDateSelect.value;

    let filteredSales = selectedLocationId === "all"
      ? sales
      : filterSalesByLocation(sales, selectedLocationId);

    if (selectedProductId !== "all") {
      filteredSales = filterSalesByProduct(filteredSales, selectedProductId);
    }

    if (selectedDate !== "all") {
      filteredSales = filterSalesByDateRange(filteredSales, {
        startDate: selectedDate,
        endDate: selectedDate
      });
    }

    const scopedRevenue = filteredSales.reduce((total, sale) => total + sale.totalPrice.USD, 0);
    const scopedUnits = filteredSales.reduce((total, sale) => total + sale.quantity, 0);

    const checksDetails = document.getElementById("checks-details");
    const checksTrend = document.getElementById("checks-trend");
    if (checksDetails) {
      checksDetails.innerHTML = `
        <div class="flex items-start justify-between gap-4">
          <dt>Matched transactions</dt>
          <dd class="text-right text-amber-200">${filteredSales.length}</dd>
        </div>
        <div class="flex items-start justify-between gap-4">
          <dt>Total units sold</dt>
          <dd class="text-right text-amber-200">${scopedUnits}</dd>
        </div>
        <div class="flex items-start justify-between gap-4">
          <dt>Total revenue (USD)</dt>
          <dd class="text-right text-amber-200">${formatCurrency(scopedRevenue)}</dd>
        </div>
      `;
    }

    if (checksTrend) {
      const buckets = getSortedDateBuckets(filteredSales);
      const trendRows = buckets.map((date) => {
        const txCount = filteredSales.filter(
          (sale) => sale.timestamp.toISOString().slice(0, 10) === date
        ).length;

        return { label: date.slice(5), value: txCount };
      });

      checksTrend.innerHTML = renderMiniBarChart(
        trendRows,
        "No transaction-volume trend for this filter.",
        (value) => `${value}`
      );
    }
  };

  const updateProductReportCard = (): void => {
    const selectedCategory = productCategorySelect.value;
    const scopedItems = selectedCategory === "all"
      ? menuItems
      : menuItems.filter((item) => item.category === selectedCategory);

    const rows = scopedItems
      .map((item) => {
        const units = sales
          .filter((sale) => sale.itemId === item.id)
          .reduce((total, sale) => total + sale.quantity, 0);

        return `
          <li class="flex items-center justify-between rounded-lg border border-stone-800 px-4 py-3 text-sm text-stone-200">
            <span>${item.name}</span>
            <span class="font-semibold text-amber-200">${units} units</span>
          </li>
        `;
      })
      .join("");

    const productList = document.getElementById("product-report-list");
    if (productList) {
      productList.innerHTML = rows || `<li class="py-3 text-sm text-stone-400">No products in this category.</li>`;
    }
  };

  revenueLocationSelect.addEventListener("change", updateRevenueCard);
  marginProductSelect.addEventListener("change", updateMarginCard);
  validationScopeSelect.addEventListener("change", updateValidationCard);
  paymentLocationSelect.addEventListener("change", updatePaymentCard);
  wasteLocationSelect.addEventListener("change", updateWasteReasonCard);
  performanceCountrySelect.addEventListener("change", updatePerformanceCard);
  wasteSnapshotLocationSelect.addEventListener("change", updateWasteSnapshotCard);
  checksLocationSelect.addEventListener("change", updateCollectionChecksCard);
  checksProductSelect.addEventListener("change", updateCollectionChecksCard);
  checksDateSelect.addEventListener("change", updateCollectionChecksCard);
  productCategorySelect.addEventListener("change", updateProductReportCard);

  updateRevenueCard();
  updateMarginCard();
  updateValidationCard();
  updatePaymentCard();
  updateWasteReasonCard();
  updatePerformanceCard();
  updateWasteSnapshotCard();
  updateCollectionChecksCard();
  updateProductReportCard();
}

renderSandbox();
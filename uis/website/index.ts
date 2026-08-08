import {
  calculateWasteCostTotal,
  calculateFinancialMetrics,
  calculateLocationPerformanceScores,
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
  restaurantLocations
  ,sales,
  wasteRecords
} from "./sampleData";

const sortedSalesByDate = sortCollection(sales, (left, right) =>
  left.timestamp.toISOString().localeCompare(right.timestamp.toISOString())
);

const salesAtMedellin = filterSalesByLocation(sales, "LOC-MEDELLIN-01");
const churrascoSales = filterSalesByProduct(sales, "menu-churrasco");
const salesInRange = filterSalesByDateRange(sales, {
  startDate: "2026-08-06",
  endDate: "2026-08-07"
});

const linearSalesSearch = searchSalesLinear(sales, {
  locationId: "LOC-MIAMI-01",
  menuItemId: "menu-guava-soda",
  soldOn: "2026-08-07"
});

const binaryDateSearch = searchSalesByDateBinary(sortedSalesByDate, "2026-08-07");

const locationPerformance = calculateLocationPerformanceScores({
  locations: restaurantLocations,
  sales,
  menuItems
});

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

const churrascoFinancialsCop = calculateFinancialMetrics(
  churrascoSales,
  menuItems,
  "COP",
  exchangeRates
);
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

console.log("Brasaland console test runner");
console.log("Sales by Medellin location:", salesAtMedellin.length);
console.log("Sales for churrasco product:", churrascoSales.length);
console.log("Sales between 2026-08-06 and 2026-08-07:", salesInRange.length);
console.log("Linear search result:", linearSalesSearch);
console.log("Binary date search result:", binaryDateSearch);
console.table(
  reportUsd.revenueByLocation.map((locationSummary) => ({
    location: locationSummary.locationName,
    revenueUsd: locationSummary.metrics.revenue.toFixed(2),
    marginUsd: locationSummary.metrics.margin.toFixed(2),
    unitsSold: locationSummary.unitsSold
  }))
);
console.table(
  reportUsd.unitsSoldByProduct.map((productSummary) => ({
    product: productSummary.menuItemName,
    unitsSold: productSummary.unitsSold
  }))
);
console.table(
  formatCountMap(reportUsd.salesByPaymentMethod).map(({ label, count }) => ({
    paymentMethod: label,
    salesCount: count
  }))
);
console.table(
  formatCountMap(reportUsd.wasteByReason).map(({ label, count }) => ({
    wasteReason: label,
    records: count
  }))
);
console.table(locationPerformance);
console.log("USD totals:", reportUsd.totals);
console.log("COP totals:", reportCop.totals);
console.log("Churrasco financials in COP:", churrascoFinancialsCop);
console.log("Total waste cost in USD:", calculateWasteCostTotal(wasteRecords, "USD"));
console.log("Top location:", reportUsd.topLocation?.locationName ?? "None");
console.log("Validation issues:", validationIssues);
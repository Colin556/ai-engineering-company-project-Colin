export type Country = "Colombia" | "USA";

export type City =
  | "Medellín"
  | "Bogotá"
  | "Cali"
  | "Miami"
  | "Orlando";

export type Department = "FOH" | "BOH" | "BAR" | "Management" | "Corporate";

export type EmployeeRole =
  | "Bartender"
  | "Server"
  | "Line Cook"
  | "Prep Cook"
  | "General Manager"
  | "Operations Analyst"
  | "Inventory Lead"
  | "Marketing Coordinator";

export type InventoryCategory = "Protein" | "Produce" | "Beverage" | "Dry Goods";

export type DiscoveryChannel =
  | "Social media"
  | "Recommendation"
  | "Walked by"
  | "Internet search"
  | "Other";

export type DietaryPreference =
  | "No restrictions"
  | "Vegetarian"
  | "Gluten-free"
  | "Other";

export type MenuCategory = "Meat" | "Side" | "Beverage" | "Dessert" | "Combo";

export type MenuItemStatus = "Active" | "Seasonal" | "Discontinued";

export type branchStatus = "Active" | "Temporarily closed" | "Under renovation";

export type CurrencyCode = "USD" | "COP";

export type PaymentMethod = "Cash" | "Credit card" | "Debit card" | "Digital wallet";

export type WasteReason =
  | "Expired"
  | "Cooking error"
  | "Customer return"
  | "Damage"
  | "Other";

export interface ExchangeRate {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  country: Country;
  openingYear: number;
  seatingCapacity: number;
  staffCount: number;
  monthlyRentCost: Price;
  averageMonthlyUtilities: Price;
  manager: string;
  status: branchStatus;
}

export type RestaurantLocation = Branch;

export interface Price {
  USD: number;
  COP: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  basePrice: Price;
  ingredientCost: Price;
  prepTimeMinutes: number;
  isAvailableInColombia: boolean;
  isAvailableInUSA: boolean;
  allergens: string[];
  status: MenuItemStatus;
}

export interface SaleTransaction {
  id: string;
  locationId: string;
  itemId: string;
  quantity: number;
  totalPrice: Price;
  paymentMethod: PaymentMethod;
  timestamp: Date;
  waiterName: string;
}

export interface WasteRecord {
  id: string;
  locationId: string;
  itemId: string;
  quantity: number;
  reason: WasteReason;
  cost: Price;
  timestamp: Date;
  reportedBy: string;
}

export interface SalesSearchCriteria {
  locationId?: string;
  menuItemId?: string;
  soldOn?: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface FinancialMetrics {
  currency: CurrencyCode;
  revenue: number;
  cost: number;
  margin: number;
  marginPercentage: number;
}

export interface LocationPerformanceScore {
  locationId: string;
  locationName: string;
  score: number;
  revenueWeight: number;
  marginWeight: number;
  salesVolumeWeight: number;
}

export interface LocationOperationsSummary {
  locationId: string;
  locationName: string;
  salesCount: number;
  unitsSold: number;
  metrics: FinancialMetrics;
}

export interface OperationsReport {
  currency: CurrencyCode;
  totals: FinancialMetrics;
  revenueByLocation: LocationOperationsSummary[];
  unitsSoldByProduct: Array<{ menuItemName: string; unitsSold: number }>;
  salesByPaymentMethod: Map<PaymentMethod, number>;
  wasteByReason: Map<WasteReason, number>;
  totalWasteCost: number;
  dailyRevenue: Array<{ date: string; revenue: number }>;
  topLocation: LocationOperationsSummary | null;
}

export interface EmployeeProfile {
  id: string;
  fullName: string;
  department: Department;
  trainedRoles: EmployeeRole[];
  weeklyHourLimit: number;
  scheduledHours: number;
  hourlyRateUsd: number;
  managementApprovedOvertime: boolean;
  startDate: string;
  endDate?: string;
  primaryLocationId: string;
  isManager: boolean;
  isActive(referenceDate?: string): boolean;
  canPickUpShift(additionalHours: number, requiredRole: EmployeeRole): boolean;
}

export interface InventoryItem {
  sku: string;
  name: string;
  category: InventoryCategory;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostUsd: number;
  preferredVendor: string;
  lastRestockedOn: string;
  expirationDate?: string;
  totalValue(): number;
  needsReorder(): boolean;
  isWithinCostRange(minimumCost: number, maximumCost: number): boolean;
}

export interface LoyaltyMember {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: Country;
  city: City;
  favoriteLocationId?: string;
  dietaryPreferences: DietaryPreference[];
  discoveryChannel: DiscoveryChannel;
  dateOfBirth: string;
  acceptedTerms: boolean;
  wantsOffers: boolean;
  createdAt: string;
  isAdult(referenceDate?: string): boolean;
  hasRequiredProfile(): boolean;
}

export interface ValidationIssue {
  entityName: string;
  field: string;
  message: string;
}

export interface SearchResult<T> {
  found: boolean;
  index: number;
  item: T | null;
}

export function getAgeInYears(dateOfBirth: string, referenceDate: string = getTodayIsoDate()): number {
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  const comparisonDate = new Date(`${referenceDate}T00:00:00`);

  if (Number.isNaN(birthDate.getTime()) || Number.isNaN(comparisonDate.getTime())) {
    return -1;
  }

  let age = comparisonDate.getFullYear() - birthDate.getFullYear();
  const monthDifference = comparisonDate.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && comparisonDate.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeIsoDate(date: string): string {
  return date.slice(0, 10);
}

export function getPriceAmount(price: Price, currency: CurrencyCode): number {
  return price[currency];
}

export function getMenuItemBaseMargin(menuItem: MenuItem, currency: CurrencyCode): number {
  return getPriceAmount(menuItem.basePrice, currency) - getPriceAmount(menuItem.ingredientCost, currency);
}

export function getMenuItemBaseMarginPercentage(menuItem: MenuItem, currency: CurrencyCode): number {
  const basePriceAmount = getPriceAmount(menuItem.basePrice, currency);

  if (basePriceAmount === 0) {
    return 0;
  }

  return (getMenuItemBaseMargin(menuItem, currency) / basePriceAmount) * 100;
}

export function isMenuItemAvailableInCountry(menuItem: MenuItem, country: Country): boolean {
  return country === "Colombia" ? menuItem.isAvailableInColombia : menuItem.isAvailableInUSA;
}

export function getBranchDisplayLabel(branch: Branch): string {
  return `${branch.name} - ${branch.city}, ${branch.country}`;
}

export function branchMatchesMarket(branch: Branch, country: Country, city: string): boolean {
  return branch.country === country && branch.city === city;
}

export function isMenuItemAvailableAtLocation(
  menuItem: MenuItem,
  location: Branch
): boolean {
  return isMenuItemAvailableInCountry(menuItem, location.country);
}

export function getSaleTransactionRevenue(
  saleTransaction: SaleTransaction,
  currency: CurrencyCode
): number {
  return getPriceAmount(saleTransaction.totalPrice, currency);
}

export function getSaleTransactionCost(
  saleTransaction: SaleTransaction,
  menuItems: MenuItem[],
  currency: CurrencyCode
): number {
  const menuItemResult = linearSearch(menuItems, (menuItem) => menuItem.id === saleTransaction.itemId);

  if (!menuItemResult.item) {
    return 0;
  }

  return getPriceAmount(menuItemResult.item.ingredientCost, currency) * saleTransaction.quantity;
}

export function getSaleTransactionMargin(
  saleTransaction: SaleTransaction,
  menuItems: MenuItem[],
  currency: CurrencyCode
): number {
  return (
    getSaleTransactionRevenue(saleTransaction, currency) -
    getSaleTransactionCost(saleTransaction, menuItems, currency)
  );
}

export function getWasteRecordCost(wasteRecord: WasteRecord, currency: CurrencyCode): number {
  return getPriceAmount(wasteRecord.cost, currency);
}

export function calculateWasteCostTotal(
  wasteRecords: WasteRecord[],
  currency: CurrencyCode
): number {
  return sumNumericValues(wasteRecords, (wasteRecord) => getWasteRecordCost(wasteRecord, currency));
}

export function filterCollection<T>(items: T[], predicate: (item: T) => boolean): T[] {
  if (items.length === 0) {
    return [];
  }

  return items.filter(predicate);
}

export function sortCollection<T>(items: T[], compare: (left: T, right: T) => number): T[] {
  if (items.length === 0) {
    return [];
  }

  return [...items].sort(compare);
}

export function linearSearch<T>(items: T[], predicate: (item: T) => boolean): SearchResult<T> {
  if (items.length === 0) {
    return { found: false, index: -1, item: null };
  }

  for (let index = 0; index < items.length; index += 1) {
    if (predicate(items[index])) {
      return { found: true, index, item: items[index] };
    }
  }

  return { found: false, index: -1, item: null };
}

export function binarySearch<T, TValue>(
  items: T[],
  target: TValue,
  selectValue: (item: T) => TValue,
  compareValues: (left: TValue, right: TValue) => number
): SearchResult<T> {
  if (items.length === 0) {
    return { found: false, index: -1, item: null };
  }

  let low = 0;
  let high = items.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const selectedValue = selectValue(items[middle]);
    const comparison = compareValues(selectedValue, target);

    if (comparison === 0) {
      return { found: true, index: middle, item: items[middle] };
    }

    if (comparison < 0) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return { found: false, index: -1, item: null };
}

export function groupElements<T, TKey extends PropertyKey>(
  items: T[],
  getKey: (item: T) => TKey
): Map<TKey, T[]> {
  const groupedItems = new Map<TKey, T[]>();

  items.forEach((item) => {
    const key = getKey(item);
    const existingItems = groupedItems.get(key) ?? [];
    existingItems.push(item);
    groupedItems.set(key, existingItems);
  });

  return groupedItems;
}

export function countElementsByCategory<T, TKey extends PropertyKey>(
  items: T[],
  getKey: (item: T) => TKey
): Map<TKey, number> {
  const counts = new Map<TKey, number>();

  items.forEach((item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return counts;
}

export function sumNumericValues<T>(items: T[], getValue: (item: T) => number): number {
  return items.reduce((total, item) => total + getValue(item), 0);
}

export function findMaximumBy<T>(items: T[], getValue: (item: T) => number): T | null {
  if (items.length === 0) {
    return null;
  }

  return items.reduce((currentMaximum, item) =>
    getValue(item) > getValue(currentMaximum) ? item : currentMaximum
  );
}

export function findMinimumBy<T>(items: T[], getValue: (item: T) => number): T | null {
  if (items.length === 0) {
    return null;
  }

  return items.reduce((currentMinimum, item) =>
    getValue(item) < getValue(currentMinimum) ? item : currentMinimum
  );
}

export function calculateAverage<T>(items: T[], getValue: (item: T) => number): number | null {
  if (items.length === 0) {
    return null;
  }

  return sumNumericValues(items, getValue) / items.length;
}

function createIssue(entityName: string, field: string, message: string): ValidationIssue {
  return { entityName, field, message };
}

function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPhoneNumber(phone: string, country: Country): boolean {
  const trimmedPhone = phone.trim();
  const basePattern = /^\+\d{1,3}\s[\d\s-]{6,}$/;

  if (!basePattern.test(trimmedPhone)) {
    return false;
  }

  return country === "Colombia"
    ? trimmedPhone.startsWith("+57")
    : trimmedPhone.startsWith("+1");
}

export function getExchangeRate(
  exchangeRates: ExchangeRate[],
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) {
    return 1;
  }

  const directRate = linearSearch(
    exchangeRates,
    (exchangeRate) => exchangeRate.from === from && exchangeRate.to === to
  );

  if (directRate.item) {
    return directRate.item.rate;
  }

  const inverseRate = linearSearch(
    exchangeRates,
    (exchangeRate) => exchangeRate.from === to && exchangeRate.to === from
  );

  if (inverseRate.item) {
    return 1 / inverseRate.item.rate;
  }

  throw new Error(`Missing exchange rate from ${from} to ${to}`);
}

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  exchangeRates: ExchangeRate[]
): number {
  return amount * getExchangeRate(exchangeRates, from, to);
}

export function filterSalesByLocation(
  sales: SaleTransaction[],
  locationId: string
): SaleTransaction[] {
  return filterCollection(sales, (saleTransaction) => saleTransaction.locationId === locationId);
}

export function filterSalesByDateRange(
  sales: SaleTransaction[],
  dateRange: DateRange
): SaleTransaction[] {
  return filterCollection(sales, (saleTransaction) => {
    const saleDate = normalizeIsoDate(saleTransaction.timestamp.toISOString());
    return saleDate >= dateRange.startDate && saleDate <= dateRange.endDate;
  });
}

export function filterSalesByProduct(
  sales: SaleTransaction[],
  itemId: string
): SaleTransaction[] {
  return filterCollection(sales, (saleTransaction) => saleTransaction.itemId === itemId);
}

export function searchSalesLinear(
  sales: SaleTransaction[],
  criteria: SalesSearchCriteria
): SearchResult<SaleTransaction> {
  return linearSearch(sales, (saleTransaction) => {
    const matchesLocation = !criteria.locationId || saleTransaction.locationId === criteria.locationId;
    const matchesProduct = !criteria.menuItemId || saleTransaction.itemId === criteria.menuItemId;
    const matchesDate =
      !criteria.soldOn || normalizeIsoDate(saleTransaction.timestamp.toISOString()) === criteria.soldOn;

    return matchesLocation && matchesProduct && matchesDate;
  });
}

export function searchSalesByDateBinary(
  sortedSales: SaleTransaction[],
  soldOn: string
): SearchResult<SaleTransaction> {
  return binarySearch(
    sortedSales,
    soldOn,
    (saleTransaction) => normalizeIsoDate(saleTransaction.timestamp.toISOString()),
    (left, right) => left.localeCompare(right)
  );
}

export function calculateFinancialMetrics(
  sales: SaleTransaction[],
  menuItems: MenuItem[],
  currency: CurrencyCode,
  exchangeRates: ExchangeRate[]
): FinancialMetrics {
  const revenue = sumNumericValues(sales, (saleTransaction) =>
    getSaleTransactionRevenue(saleTransaction, currency)
  );
  const cost = sumNumericValues(sales, (saleTransaction) =>
    getSaleTransactionCost(saleTransaction, menuItems, currency)
  );
  const margin = revenue - cost;

  return {
    currency,
    revenue,
    cost,
    margin,
    marginPercentage: revenue === 0 ? 0 : (margin / revenue) * 100
  };
}

export function calculateLocationPerformanceScores(data: {
  locations: RestaurantLocation[];
  sales: SaleTransaction[];
  menuItems: MenuItem[];
}): LocationPerformanceScore[] {
  const salesByLocation = groupElements(data.sales, (sale) => sale.locationId);
  const locationStats = data.locations.map((location) => {
    const locationSales = salesByLocation.get(location.id) ?? [];
    return {
      location,
      revenue: sumNumericValues(locationSales, (saleTransaction) =>
        getSaleTransactionRevenue(saleTransaction, "USD")
      ),
      margin: sumNumericValues(locationSales, (saleTransaction) =>
        getSaleTransactionMargin(saleTransaction, data.menuItems, "USD")
      ),
      volume: sumNumericValues(locationSales, (saleTransaction) => saleTransaction.quantity)
    };
  });

  const maxRevenue = Math.max(...locationStats.map((stat) => stat.revenue), 1);
  const maxMargin = Math.max(...locationStats.map((stat) => stat.margin), 1);
  const maxVolume = Math.max(...locationStats.map((stat) => stat.volume), 1);

  return locationStats.map((stat) => {
    const revenueWeight = (stat.revenue / maxRevenue) * 45;
    const marginWeight = (stat.margin / maxMargin) * 35;
    const salesVolumeWeight = (stat.volume / maxVolume) * 20;

    return {
      locationId: stat.location.id,
      locationName: stat.location.name,
      score: Number((revenueWeight + marginWeight + salesVolumeWeight).toFixed(2)),
      revenueWeight: Number(revenueWeight.toFixed(2)),
      marginWeight: Number(marginWeight.toFixed(2)),
      salesVolumeWeight: Number(salesVolumeWeight.toFixed(2))
    };
  });
}

export function validateBranch(branch: Branch): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!branch.id.trim()) {
    issues.push(createIssue(branch.name, "id", "Branch id is required."));
  }

  if (!branch.name.trim()) {
    issues.push(createIssue(branch.id, "name", "Branch name is required."));
  }

  if (branch.openingYear < 2008 || branch.openingYear > new Date().getFullYear()) {
    issues.push(createIssue(branch.name, "openingYear", "Opening year must be between 2008 and the current year."));
  }

  if (branch.seatingCapacity <= 0) {
    issues.push(createIssue(branch.name, "seatingCapacity", "Seating capacity must be greater than zero."));
  }

  if (branch.staffCount <= 0) {
    issues.push(createIssue(branch.name, "staffCount", "Staff count must be greater than zero."));
  }

  if (branch.monthlyRentCost.USD <= 0 || branch.monthlyRentCost.COP <= 0) {
    issues.push(createIssue(branch.name, "monthlyRentCost", "Both rent values must be greater than zero."));
  }

  if (branch.averageMonthlyUtilities.USD <= 0 || branch.averageMonthlyUtilities.COP <= 0) {
    issues.push(createIssue(branch.name, "averageMonthlyUtilities", "Both utilities values must be greater than zero."));
  }

  if (!branch.manager.trim()) {
    issues.push(createIssue(branch.name, "manager", "Branch manager name is required."));
  }

  return issues;
}

export function validateRestaurantLocation(location: RestaurantLocation): ValidationIssue[] {
  return validateBranch(location);
}

export function validateMenuItem(
  menuItem: MenuItem,
  locations: Branch[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!menuItem.id.trim()) {
    issues.push(createIssue(menuItem.name, "id", "Menu item id is required."));
  }

  if (!menuItem.name.trim()) {
    issues.push(createIssue(menuItem.id, "name", "Menu item name is required."));
  }

  if (!menuItem.name.trim()) {
    issues.push(createIssue(menuItem.id, "name", "Menu item name is required."));
  }

  if (menuItem.basePrice.USD <= 0) {
    issues.push(createIssue(menuItem.name, "basePrice.USD", "USD price must be greater than zero."));
  }

  if (menuItem.basePrice.COP <= 0) {
    issues.push(createIssue(menuItem.name, "basePrice.COP", "COP price must be greater than zero."));
  }

  if (menuItem.ingredientCost.USD <= 0) {
    issues.push(createIssue(menuItem.name, "ingredientCost.USD", "USD ingredient cost must be greater than zero."));
  }

  if (menuItem.ingredientCost.COP <= 0) {
    issues.push(createIssue(menuItem.name, "ingredientCost.COP", "COP ingredient cost must be greater than zero."));
  }

  if (menuItem.prepTimeMinutes <= 0 || menuItem.prepTimeMinutes > 60) {
    issues.push(createIssue(menuItem.name, "prepTimeMinutes", "Preparation time must be greater than zero and no more than 60 minutes."));
  }

  if (!menuItem.isAvailableInColombia && !menuItem.isAvailableInUSA) {
    issues.push(createIssue(menuItem.name, "availability", "Menu item must be available in at least one country."));
  }

  const availableCountries = new Set<Country>();
  if (menuItem.isAvailableInColombia) {
    availableCountries.add("Colombia");
  }
  if (menuItem.isAvailableInUSA) {
    availableCountries.add("USA");
  }

  if (availableCountries.size > 0) {
    const hasMatchingLocation = locations.some((location) => availableCountries.has(location.country));
    if (!hasMatchingLocation) {
      issues.push(createIssue(menuItem.name, "availability", "Menu item availability must match at least one configured location country."));
    }
  }

  return issues;
}

export function validateSaleTransaction(
  saleTransaction: SaleTransaction,
  menuItems: MenuItem[],
  locations: Branch[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!saleTransaction.id.trim()) {
    issues.push(createIssue("Sale", "id", "Sale id is required."));
  }

  if (saleTransaction.quantity <= 0) {
    issues.push(createIssue(saleTransaction.id, "quantity", "Sale quantity must be greater than zero."));
  }

  if (saleTransaction.totalPrice.USD <= 0) {
    issues.push(createIssue(saleTransaction.id, "totalPrice.USD", "USD price must be greater than zero."));
  }

  if (saleTransaction.totalPrice.COP <= 0) {
    issues.push(createIssue(saleTransaction.id, "totalPrice.COP", "COP price must be greater than zero."));
  }

  if (!saleTransaction.waiterName.trim()) {
    issues.push(createIssue(saleTransaction.id, "waiterName", "Waiter name is required."));
  }

  if (!(saleTransaction.timestamp instanceof Date) || Number.isNaN(saleTransaction.timestamp.getTime())) {
    issues.push(createIssue(saleTransaction.id, "timestamp", "Sale date must be a valid Date."));
  }

  const locationResult = linearSearch(locations, (location) => location.id === saleTransaction.locationId);
  if (!locationResult.found) {
    issues.push(createIssue(saleTransaction.id, "locationId", "Sale location must exist."));
  }

  const menuItemResult = linearSearch(menuItems, (menuItem) => menuItem.id === saleTransaction.itemId);
  if (!menuItemResult.found) {
    issues.push(createIssue(saleTransaction.id, "itemId", "Sale product must exist."));
  }

  if (
    menuItemResult.item &&
    locationResult.item &&
    !isMenuItemAvailableAtLocation(menuItemResult.item, locationResult.item)
  ) {
    issues.push(createIssue(saleTransaction.id, "itemId", "Menu item is not available at the recorded location."));
  }

  return issues;
}

export function validateWasteRecord(
  wasteRecord: WasteRecord,
  menuItems: MenuItem[],
  locations: Branch[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!wasteRecord.id.trim()) {
    issues.push(createIssue("Waste", "id", "Waste record id is required."));
  }

  if (wasteRecord.quantity <= 0) {
    issues.push(createIssue(wasteRecord.id, "quantity", "Waste quantity must be greater than zero."));
  }

  if (wasteRecord.cost.USD <= 0) {
    issues.push(createIssue(wasteRecord.id, "cost.USD", "USD waste cost must be greater than zero."));
  }

  if (wasteRecord.cost.COP <= 0) {
    issues.push(createIssue(wasteRecord.id, "cost.COP", "COP waste cost must be greater than zero."));
  }

  if (!wasteRecord.reportedBy.trim()) {
    issues.push(createIssue(wasteRecord.id, "reportedBy", "Waste record reporter name is required."));
  }

  if (!(wasteRecord.timestamp instanceof Date) || Number.isNaN(wasteRecord.timestamp.getTime())) {
    issues.push(createIssue(wasteRecord.id, "timestamp", "Waste record date must be a valid Date."));
  }

  const locationResult = linearSearch(locations, (location) => location.id === wasteRecord.locationId);
  if (!locationResult.found) {
    issues.push(createIssue(wasteRecord.id, "locationId", "Waste record location must exist."));
  }

  const menuItemResult = linearSearch(menuItems, (menuItem) => menuItem.id === wasteRecord.itemId);
  if (!menuItemResult.found) {
    issues.push(createIssue(wasteRecord.id, "itemId", "Waste record item must exist."));
  }

  if (
    menuItemResult.item &&
    locationResult.item &&
    !isMenuItemAvailableAtLocation(menuItemResult.item, locationResult.item)
  ) {
    issues.push(createIssue(wasteRecord.id, "itemId", "Waste item is not available at the recorded location."));
  }

  return issues;
}

export function validateExchangeRates(exchangeRates: ExchangeRate[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  exchangeRates.forEach((exchangeRate, index) => {
    if (exchangeRate.rate <= 0) {
      issues.push(createIssue(`exchangeRates[${index}]`, "rate", "Exchange rate must be greater than zero."));
    }
  });

  return issues;
}

export function validateEmployeeProfile(employee: EmployeeProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!employee.fullName.trim()) {
    issues.push(createIssue(employee.id, "fullName", "Employee full name is required."));
  }

  if (employee.trainedRoles.length === 0) {
    issues.push(createIssue(employee.fullName, "trainedRoles", "Employee must be trained for at least one role."));
  }

  if (employee.weeklyHourLimit <= 0) {
    issues.push(createIssue(employee.fullName, "weeklyHourLimit", "Weekly hour limit must be greater than zero."));
  }

  if (employee.scheduledHours < 0) {
    issues.push(createIssue(employee.fullName, "scheduledHours", "Scheduled hours cannot be negative."));
  }

  if (employee.hourlyRateUsd <= 0) {
    issues.push(createIssue(employee.fullName, "hourlyRateUsd", "Hourly rate must be greater than zero."));
  }

  if (
    employee.scheduledHours > employee.weeklyHourLimit &&
    !employee.managementApprovedOvertime
  ) {
    issues.push(
      createIssue(
        employee.fullName,
        "scheduledHours",
        "Scheduled hours cannot exceed the weekly cap without management approval."
      )
    );
  }

  if (employee.endDate && employee.endDate < employee.startDate) {
    issues.push(createIssue(employee.fullName, "endDate", "End date must be after the start date."));
  }

  return issues;
}

export function validateInventoryItem(item: InventoryItem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!item.name.trim()) {
    issues.push(createIssue(item.sku, "name", "Inventory item name is required."));
  }

  if (item.quantityOnHand < 0) {
    issues.push(createIssue(item.name, "quantityOnHand", "Quantity on hand cannot be negative."));
  }

  if (item.reorderLevel < 0) {
    issues.push(createIssue(item.name, "reorderLevel", "Reorder level cannot be negative."));
  }

  if (item.unitCostUsd <= 0) {
    issues.push(createIssue(item.name, "unitCostUsd", "Unit cost must be greater than zero."));
  }

  if (item.expirationDate && item.expirationDate < item.lastRestockedOn) {
    issues.push(
      createIssue(item.name, "expirationDate", "Expiration date must be later than the last restock date.")
    );
  }

  return issues;
}

export function validateLoyaltyMember(
  member: LoyaltyMember,
  locations: Branch[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (member.fullName.trim().split(/\s+/).length < 2) {
    issues.push(
      createIssue(member.id, "fullName", "Member must include first and last name.")
    );
  }

  if (!isValidEmailAddress(member.email)) {
    issues.push(createIssue(member.fullName, "email", "Email format is invalid."));
  }

  if (!isValidPhoneNumber(member.phone, member.country)) {
    issues.push(createIssue(member.fullName, "phone", "Phone must match the selected country code."));
  }

  if (!member.acceptedTerms) {
    issues.push(createIssue(member.fullName, "acceptedTerms", "Program terms must be accepted."));
  }

  if (!member.isAdult()) {
    issues.push(createIssue(member.fullName, "dateOfBirth", "Member must be 18 or older."));
  }

  if (member.favoriteLocationId) {
    const locationResult = linearSearch(locations, (location) => location.id === member.favoriteLocationId);

    if (
      !locationResult.found ||
      !locationResult.item ||
      !branchMatchesMarket(locationResult.item, member.country, member.city)
    ) {
      issues.push(
        createIssue(
          member.fullName,
          "favoriteLocationId",
          "Favorite location must belong to the selected country and city."
        )
      );
    }
  }

  return issues;
}

export function validateOperationsDataset(data: {
  locations: Branch[];
  employees: EmployeeProfile[];
  inventoryItems: InventoryItem[];
  loyaltyMembers: LoyaltyMember[];
  menuItems?: MenuItem[];
  sales?: SaleTransaction[];
  wasteRecords?: WasteRecord[];
  exchangeRates?: ExchangeRate[];
}): ValidationIssue[] {
  return [
    ...data.locations.flatMap((location) => validateBranch(location)),
    ...data.employees.flatMap((employee) => validateEmployeeProfile(employee)),
    ...data.inventoryItems.flatMap((item) => validateInventoryItem(item)),
    ...data.loyaltyMembers.flatMap((member) => validateLoyaltyMember(member, data.locations)),
    ...(data.menuItems ?? []).flatMap((menuItem) => validateMenuItem(menuItem, data.locations)),
    ...(data.sales ?? []).flatMap((saleTransaction) =>
      validateSaleTransaction(saleTransaction, data.menuItems ?? [], data.locations)
    ),
    ...(data.wasteRecords ?? []).flatMap((wasteRecord) =>
      validateWasteRecord(wasteRecord, data.menuItems ?? [], data.locations)
    ),
    ...validateExchangeRates(data.exchangeRates ?? [])
  ];
}

export function formatCountMap<TKey extends PropertyKey>(counts: Map<TKey, number>): Array<{ label: TKey; count: number }> {
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}

export function buildOperationsReports(data: {
  employees: EmployeeProfile[];
  inventoryItems: InventoryItem[];
  loyaltyMembers: LoyaltyMember[];
}) {
  const employeeCountsByDepartment = countElementsByCategory(
    data.employees,
    (employee) => employee.department
  );

  const inventoryValueByCategory = new Map<InventoryCategory, number>();
  const inventoryGroups = groupElements(data.inventoryItems, (item) => item.category);

  inventoryGroups.forEach((items, category) => {
    inventoryValueByCategory.set(category, sumNumericValues(items, (item) => item.totalValue()));
  });

  const memberCountsBySource = countElementsByCategory(
    data.loyaltyMembers,
    (member) => member.discoveryChannel
  );

  return {
    employeeCountsByDepartment,
    inventoryValueByCategory,
    memberCountsBySource,
    averageScheduledHours: calculateAverage(data.employees, (employee) => employee.scheduledHours),
    totalInventoryValue: sumNumericValues(data.inventoryItems, (item) => item.totalValue()),
    highestValueItem: findMaximumBy(data.inventoryItems, (item) => item.totalValue()),
    lowestStockItem: findMinimumBy(data.inventoryItems, (item) => item.quantityOnHand)
  };
}

export function generateOperationsReport(data: {
  locations: Branch[];
  menuItems: MenuItem[];
  sales: SaleTransaction[];
  wasteRecords?: WasteRecord[];
  exchangeRates: ExchangeRate[];
  currency: CurrencyCode;
}): OperationsReport {
  const wasteRecords = data.wasteRecords ?? [];
  const totals = calculateFinancialMetrics(data.sales, data.menuItems, data.currency, data.exchangeRates);
  const salesByLocation = groupElements(data.sales, (sale) => sale.locationId);
  const revenueByLocation = data.locations.map((location) => {
    const locationSales = salesByLocation.get(location.id) ?? [];
    return {
      locationId: location.id,
      locationName: location.name,
      salesCount: locationSales.length,
      unitsSold: sumNumericValues(locationSales, (sale) => sale.quantity),
      metrics: calculateFinancialMetrics(locationSales, data.menuItems, data.currency, data.exchangeRates)
    };
  });

  const salesByMenuItem = groupElements(data.sales, (sale) => sale.itemId);
  const unitsSoldByProduct = data.menuItems.map((menuItem) => ({
    menuItemName: menuItem.name,
    unitsSold: sumNumericValues(salesByMenuItem.get(menuItem.id) ?? [], (sale) => sale.quantity)
  }));

  const salesByPaymentMethod = countElementsByCategory(data.sales, (sale) => sale.paymentMethod);
  const wasteByReason = countElementsByCategory(wasteRecords, (wasteRecord) => wasteRecord.reason);
  const salesByDay = groupElements(data.sales, (sale) => normalizeIsoDate(sale.timestamp.toISOString()));
  const dailyRevenue = sortCollection(
    Array.from(salesByDay.entries()).map(([date, sales]) => ({
      date,
      revenue: calculateFinancialMetrics(sales, data.menuItems, data.currency, data.exchangeRates).revenue
    })),
    (left, right) => left.date.localeCompare(right.date)
  );

  const topLocation = findMaximumBy(revenueByLocation, (locationSummary) => locationSummary.metrics.revenue);

  return {
    currency: data.currency,
    totals,
    revenueByLocation,
    unitsSoldByProduct,
    salesByPaymentMethod,
    wasteByReason,
    totalWasteCost: calculateWasteCostTotal(wasteRecords, data.currency),
    dailyRevenue,
    topLocation
  };
}
import type { MenuItem, SaleTransaction, WasteRecord } from "../types";

const USD_TO_COP_RATE = 4000;

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function isSameCalendarDate(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

export function calculateDailyRevenue(
  sales: SaleTransaction[],
  date: Date,
  currency: "USD" | "COP"
): number {
  const total = sales.reduce((sum, sale) => {
    return isSameCalendarDate(sale.timestamp, date) ? sum + sale.totalPrice[currency] : sum;
  }, 0);

  return roundToTwoDecimals(total);
}

export function calculateLocationMargin(
  sales: SaleTransaction[],
  menuItems: MenuItem[],
  locationId: string,
  currency: "USD" | "COP"
): number {
  const locationSales = sales.filter((sale) => sale.locationId === locationId);
  const totalRevenue = locationSales.reduce((sum, sale) => sum + sale.totalPrice[currency], 0);

  if (totalRevenue === 0) {
    return 0;
  }

  const totalIngredientCost = locationSales.reduce((sum, sale) => {
    const menuItem = menuItems.find((item) => item.id === sale.itemId);

    if (!menuItem) {
      return sum;
    }

    return sum + menuItem.ingredientCost[currency] * sale.quantity;
  }, 0);

  const margin = ((totalRevenue - totalIngredientCost) / totalRevenue) * 100;
  return roundToTwoDecimals(margin);
}

export function calculateWasteCost(
  wasteRecords: WasteRecord[],
  locationId: string,
  currency: "USD" | "COP"
): number {
  const total = wasteRecords.reduce((sum, wasteRecord) => {
    return wasteRecord.locationId === locationId ? sum + wasteRecord.cost[currency] : sum;
  }, 0);

  return roundToTwoDecimals(total);
}

export function convertCurrency(
  amount: number,
  fromCurrency: "USD" | "COP",
  toCurrency: "USD" | "COP"
): number {
  if (fromCurrency === toCurrency) {
    return roundToTwoDecimals(amount);
  }

  if (fromCurrency === "USD" && toCurrency === "COP") {
    return roundToTwoDecimals(amount * USD_TO_COP_RATE);
  }

  return roundToTwoDecimals(amount / USD_TO_COP_RATE);
}
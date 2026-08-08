import type { Location, MenuItem } from "../types";

export function findLocationById(locations: Location[], id: string): Location | null {
  for (const location of locations) {
    if (location.id === id) {
      return location;
    }
  }

  return null;
}

export function findMenuItemByName(items: MenuItem[], name: string): MenuItem | null {
  const normalizedName = name.trim().toLowerCase();

  for (const item of items) {
    if (item.name.trim().toLowerCase() === normalizedName) {
      return item;
    }
  }

  return null;
}

export function binarySearchLocationByCapacity(
  sortedLocations: Location[],
  targetCapacity: number
): number {
  let low = 0;
  let high = sortedLocations.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const capacity = sortedLocations[middle].seatingCapacity;

    if (capacity === targetCapacity) {
      return middle;
    }

    if (capacity < targetCapacity) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return -1;
}
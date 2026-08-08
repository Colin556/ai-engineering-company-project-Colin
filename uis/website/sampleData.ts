import {
  Branch,
  EmployeeProfile,
  ExchangeRate,
  InventoryItem,
  LoyaltyMember,
  MenuItem,
  SaleTransaction,
  WasteRecord,
  getAgeInYears,
  getTodayIsoDate
} from "./brasaland";

export const restaurantLocations: Branch[] = [
  {
    id: "LOC-MEDELLIN-01",
    name: "Brasaland El Poblado",
    city: "Medellín",
    country: "Colombia",
    openingYear: 2008,
    seatingCapacity: 120,
    staffCount: 28,
    monthlyRentCost: { USD: 4200, COP: 17010000 },
    averageMonthlyUtilities: { USD: 850, COP: 3442500 },
    manager: "Lucia Herrera",
    status: "Active"
  },
  {
    id: "LOC-BOGOTA-01",
    name: "Brasaland Usaquén",
    city: "Bogotá",
    country: "Colombia",
    openingYear: 2013,
    seatingCapacity: 96,
    staffCount: 24,
    monthlyRentCost: { USD: 3900, COP: 15795000 },
    averageMonthlyUtilities: { USD: 780, COP: 3159000 },
    manager: "Camila Ospina",
    status: "Active"
  },
  {
    id: "LOC-CALI-01",
    name: "Brasaland Granada",
    city: "Cali",
    country: "Colombia",
    openingYear: 2016,
    seatingCapacity: 88,
    staffCount: 21,
    monthlyRentCost: { USD: 3100, COP: 12555000 },
    averageMonthlyUtilities: { USD: 690, COP: 2794500 },
    manager: "Mateo Salazar",
    status: "Under renovation"
  },
  {
    id: "LOC-MIAMI-01",
    name: "Brasaland Brickell",
    city: "Miami",
    country: "USA",
    openingYear: 2021,
    seatingCapacity: 110,
    staffCount: 26,
    monthlyRentCost: { USD: 8800, COP: 35640000 },
    averageMonthlyUtilities: { USD: 1200, COP: 4860000 },
    manager: "Jacob Reed",
    status: "Active"
  },
  {
    id: "LOC-ORLANDO-01",
    name: "Brasaland Downtown",
    city: "Orlando",
    country: "USA",
    openingYear: 2022,
    seatingCapacity: 104,
    staffCount: 23,
    monthlyRentCost: { USD: 7600, COP: 30780000 },
    averageMonthlyUtilities: { USD: 980, COP: 3969000 },
    manager: "Sofia Rojas",
    status: "Temporarily closed"
  }
];

export const employees: EmployeeProfile[] = [
  {
    id: "emp-004",
    fullName: "Jacob Reed",
    department: "FOH",
    trainedRoles: ["Server", "Bartender"],
    weeklyHourLimit: 40,
    scheduledHours: 38,
    hourlyRateUsd: 16.5,
    managementApprovedOvertime: false,
    startDate: "2024-04-10",
    primaryLocationId: "LOC-MIAMI-01",
    isManager: false,
    isActive(this: EmployeeProfile, referenceDate = getTodayIsoDate()): boolean {
      return this.startDate <= referenceDate && (!this.endDate || this.endDate >= referenceDate);
    },
    canPickUpShift(this: EmployeeProfile, additionalHours, requiredRole): boolean {
      const hasRole = this.trainedRoles.includes(requiredRole);
      const nextHours = this.scheduledHours + additionalHours;
      return hasRole && (nextHours <= this.weeklyHourLimit || this.managementApprovedOvertime);
    }
  },
  {
    id: "emp-001",
    fullName: "Lucia Herrera",
    department: "Management",
    trainedRoles: ["General Manager", "Inventory Lead"],
    weeklyHourLimit: 45,
    scheduledHours: 44,
    hourlyRateUsd: 28,
    managementApprovedOvertime: true,
    startDate: "2021-02-01",
    primaryLocationId: "LOC-MEDELLIN-01",
    isManager: true,
    isActive(this: EmployeeProfile, referenceDate = getTodayIsoDate()): boolean {
      return this.startDate <= referenceDate && (!this.endDate || this.endDate >= referenceDate);
    },
    canPickUpShift(this: EmployeeProfile, additionalHours, requiredRole): boolean {
      const hasRole = this.trainedRoles.includes(requiredRole);
      const nextHours = this.scheduledHours + additionalHours;
      return hasRole && (nextHours <= this.weeklyHourLimit || this.managementApprovedOvertime);
    }
  },
  {
    id: "emp-002",
    fullName: "Camila Ospina",
    department: "Corporate",
    trainedRoles: ["Marketing Coordinator"],
    weeklyHourLimit: 40,
    scheduledHours: 40,
    hourlyRateUsd: 24,
    managementApprovedOvertime: false,
    startDate: "2022-07-11",
    primaryLocationId: "LOC-MEDELLIN-01",
    isManager: false,
    isActive(this: EmployeeProfile, referenceDate = getTodayIsoDate()): boolean {
      return this.startDate <= referenceDate && (!this.endDate || this.endDate >= referenceDate);
    },
    canPickUpShift(this: EmployeeProfile, additionalHours, requiredRole): boolean {
      const hasRole = this.trainedRoles.includes(requiredRole);
      const nextHours = this.scheduledHours + additionalHours;
      return hasRole && (nextHours <= this.weeklyHourLimit || this.managementApprovedOvertime);
    }
  },
  {
    id: "emp-003",
    fullName: "Mateo Salazar",
    department: "BOH",
    trainedRoles: ["Line Cook", "Prep Cook"],
    weeklyHourLimit: 40,
    scheduledHours: 36,
    hourlyRateUsd: 17.75,
    managementApprovedOvertime: false,
    startDate: "2023-03-18",
    primaryLocationId: "LOC-CALI-01",
    isManager: false,
    isActive(this: EmployeeProfile, referenceDate = getTodayIsoDate()): boolean {
      return this.startDate <= referenceDate && (!this.endDate || this.endDate >= referenceDate);
    },
    canPickUpShift(this: EmployeeProfile, additionalHours, requiredRole): boolean {
      const hasRole = this.trainedRoles.includes(requiredRole);
      const nextHours = this.scheduledHours + additionalHours;
      return hasRole && (nextHours <= this.weeklyHourLimit || this.managementApprovedOvertime);
    }
  },
  {
    id: "emp-005",
    fullName: "Sofia Rojas",
    department: "BAR",
    trainedRoles: ["Bartender"],
    weeklyHourLimit: 40,
    scheduledHours: 32,
    hourlyRateUsd: 18.25,
    managementApprovedOvertime: false,
    startDate: "2024-01-09",
    primaryLocationId: "LOC-ORLANDO-01",
    isManager: false,
    isActive(this: EmployeeProfile, referenceDate = getTodayIsoDate()): boolean {
      return this.startDate <= referenceDate && (!this.endDate || this.endDate >= referenceDate);
    },
    canPickUpShift(this: EmployeeProfile, additionalHours, requiredRole): boolean {
      const hasRole = this.trainedRoles.includes(requiredRole);
      const nextHours = this.scheduledHours + additionalHours;
      return hasRole && (nextHours <= this.weeklyHourLimit || this.managementApprovedOvertime);
    }
  }
];

export const inventoryItems: InventoryItem[] = [
  {
    sku: "PRO-001",
    name: "Skirt Steak",
    category: "Protein",
    quantityOnHand: 82,
    reorderLevel: 45,
    unitCostUsd: 8.6,
    preferredVendor: "Andes Prime Supply",
    lastRestockedOn: "2026-08-05",
    expirationDate: "2026-08-11",
    totalValue(this: InventoryItem): number {
      return this.quantityOnHand * this.unitCostUsd;
    },
    needsReorder(this: InventoryItem): boolean {
      return this.quantityOnHand <= this.reorderLevel;
    },
    isWithinCostRange(this: InventoryItem, minimumCost, maximumCost): boolean {
      return this.unitCostUsd >= minimumCost && this.unitCostUsd <= maximumCost;
    }
  },
  {
    sku: "PROD-010",
    name: "Plantains",
    category: "Produce",
    quantityOnHand: 140,
    reorderLevel: 70,
    unitCostUsd: 0.48,
    preferredVendor: "Mercado Verde",
    lastRestockedOn: "2026-08-06",
    expirationDate: "2026-08-14",
    totalValue(this: InventoryItem): number {
      return this.quantityOnHand * this.unitCostUsd;
    },
    needsReorder(this: InventoryItem): boolean {
      return this.quantityOnHand <= this.reorderLevel;
    },
    isWithinCostRange(this: InventoryItem, minimumCost, maximumCost): boolean {
      return this.unitCostUsd >= minimumCost && this.unitCostUsd <= maximumCost;
    }
  },
  {
    sku: "BEV-009",
    name: "Guava Soda",
    category: "Beverage",
    quantityOnHand: 54,
    reorderLevel: 36,
    unitCostUsd: 1.2,
    preferredVendor: "Miami Beverage Group",
    lastRestockedOn: "2026-08-04",
    totalValue(this: InventoryItem): number {
      return this.quantityOnHand * this.unitCostUsd;
    },
    needsReorder(this: InventoryItem): boolean {
      return this.quantityOnHand <= this.reorderLevel;
    },
    isWithinCostRange(this: InventoryItem, minimumCost, maximumCost): boolean {
      return this.unitCostUsd >= minimumCost && this.unitCostUsd <= maximumCost;
    }
  },
  {
    sku: "DRY-022",
    name: "House Spice Rub",
    category: "Dry Goods",
    quantityOnHand: 18,
    reorderLevel: 20,
    unitCostUsd: 14.75,
    preferredVendor: "Sabores Central",
    lastRestockedOn: "2026-07-30",
    expirationDate: "2027-01-30",
    totalValue(this: InventoryItem): number {
      return this.quantityOnHand * this.unitCostUsd;
    },
    needsReorder(this: InventoryItem): boolean {
      return this.quantityOnHand <= this.reorderLevel;
    },
    isWithinCostRange(this: InventoryItem, minimumCost, maximumCost): boolean {
      return this.unitCostUsd >= minimumCost && this.unitCostUsd <= maximumCost;
    }
  },
  {
    sku: "PRO-014",
    name: "Chicken Thigh",
    category: "Protein",
    quantityOnHand: 64,
    reorderLevel: 40,
    unitCostUsd: 3.15,
    preferredVendor: "Andes Prime Supply",
    lastRestockedOn: "2026-08-05",
    expirationDate: "2026-08-10",
    totalValue(this: InventoryItem): number {
      return this.quantityOnHand * this.unitCostUsd;
    },
    needsReorder(this: InventoryItem): boolean {
      return this.quantityOnHand <= this.reorderLevel;
    },
    isWithinCostRange(this: InventoryItem, minimumCost, maximumCost): boolean {
      return this.unitCostUsd >= minimumCost && this.unitCostUsd <= maximumCost;
    }
  }
];

export const loyaltyMembers: LoyaltyMember[] = [
  {
    id: "mem-001",
    fullName: "Daniela Perez",
    email: "daniela.perez@example.com",
    phone: "+57 300 123 4567",
    country: "Colombia",
    city: "Medellín",
    favoriteLocationId: "LOC-MEDELLIN-01",
    dietaryPreferences: ["No restrictions"],
    discoveryChannel: "Social media",
    dateOfBirth: "1995-11-09",
    acceptedTerms: true,
    wantsOffers: true,
    createdAt: "2026-08-02",
    isAdult(this: LoyaltyMember, referenceDate = getTodayIsoDate()): boolean {
      return getAgeInYears(this.dateOfBirth, referenceDate) >= 18;
    },
    hasRequiredProfile(this: LoyaltyMember): boolean {
      return this.fullName.trim().split(/\s+/).length >= 2 && this.acceptedTerms;
    }
  },
  {
    id: "mem-002",
    fullName: "Anthony Diaz",
    email: "anthony.diaz@example.com",
    phone: "+1 305 555 0188",
    country: "USA",
    city: "Miami",
    favoriteLocationId: "LOC-MIAMI-01",
    dietaryPreferences: ["Gluten-free"],
    discoveryChannel: "Recommendation",
    dateOfBirth: "1990-05-21",
    acceptedTerms: true,
    wantsOffers: false,
    createdAt: "2026-08-03",
    isAdult(this: LoyaltyMember, referenceDate = getTodayIsoDate()): boolean {
      return getAgeInYears(this.dateOfBirth, referenceDate) >= 18;
    },
    hasRequiredProfile(this: LoyaltyMember): boolean {
      return this.fullName.trim().split(/\s+/).length >= 2 && this.acceptedTerms;
    }
  },
  {
    id: "mem-003",
    fullName: "Valentina Gomez",
    email: "valentina.gomez@example.com",
    phone: "+57 310 555 0166",
    country: "Colombia",
    city: "Bogotá",
    favoriteLocationId: "LOC-BOGOTA-01",
    dietaryPreferences: ["Vegetarian"],
    discoveryChannel: "Internet search",
    dateOfBirth: "1998-02-14",
    acceptedTerms: true,
    wantsOffers: true,
    createdAt: "2026-08-04",
    isAdult(this: LoyaltyMember, referenceDate = getTodayIsoDate()): boolean {
      return getAgeInYears(this.dateOfBirth, referenceDate) >= 18;
    },
    hasRequiredProfile(this: LoyaltyMember): boolean {
      return this.fullName.trim().split(/\s+/).length >= 2 && this.acceptedTerms;
    }
  },
  {
    id: "mem-004",
    fullName: "Marcus Bennett",
    email: "marcus.bennett@example.com",
    phone: "+1 407 555 0123",
    country: "USA",
    city: "Orlando",
    favoriteLocationId: "LOC-ORLANDO-01",
    dietaryPreferences: ["Other"],
    discoveryChannel: "Walked by",
    dateOfBirth: "1987-08-30",
    acceptedTerms: true,
    wantsOffers: true,
    createdAt: "2026-08-05",
    isAdult(this: LoyaltyMember, referenceDate = getTodayIsoDate()): boolean {
      return getAgeInYears(this.dateOfBirth, referenceDate) >= 18;
    },
    hasRequiredProfile(this: LoyaltyMember): boolean {
      return this.fullName.trim().split(/\s+/).length >= 2 && this.acceptedTerms;
    }
  }
];

export const menuItems: MenuItem[] = [
  {
    id: "menu-churrasco",
    name: "Signature Churrasco",
    category: "Meat",
    basePrice: { USD: 24, COP: 97200 },
    ingredientCost: { USD: 9.4, COP: 38070 },
    prepTimeMinutes: 18,
    isAvailableInColombia: true,
    isAvailableInUSA: true,
    allergens: [],
    status: "Active"
  },
  {
    id: "menu-family-combo",
    name: "Brasa Family Combo",
    category: "Combo",
    basePrice: { USD: 38, COP: 153900 },
    ingredientCost: { USD: 15.6, COP: 63180 },
    prepTimeMinutes: 24,
    isAvailableInColombia: true,
    isAvailableInUSA: true,
    allergens: ["Dairy"],
    status: "Active"
  },
  {
    id: "menu-arepas",
    name: "Smoked Arepas",
    category: "Side",
    basePrice: { USD: 7, COP: 28350 },
    ingredientCost: { USD: 2.1, COP: 8505 },
    prepTimeMinutes: 10,
    isAvailableInColombia: true,
    isAvailableInUSA: true,
    allergens: ["Corn"],
    status: "Seasonal"
  },
  {
    id: "menu-guava-soda",
    name: "Guava Soda",
    category: "Beverage",
    basePrice: { USD: 4, COP: 16200 },
    ingredientCost: { USD: 1, COP: 4050 },
    prepTimeMinutes: 3,
    isAvailableInColombia: true,
    isAvailableInUSA: true,
    allergens: [],
    status: "Active"
  }
];

export const sales: SaleTransaction[] = [
  {
    id: "TXN-2026-1005",
    locationId: "LOC-ORLANDO-01",
    itemId: "menu-family-combo",
    quantity: 7,
    totalPrice: { USD: 266, COP: 1077300 },
    paymentMethod: "Credit card",
    timestamp: new Date("2026-08-05T18:20:00Z"),
    waiterName: "Sofia Rojas"
  },
  {
    id: "TXN-2026-1001",
    locationId: "LOC-MEDELLIN-01",
    itemId: "menu-churrasco",
    quantity: 12,
    totalPrice: { USD: 288, COP: 1166400 },
    paymentMethod: "Cash",
    timestamp: new Date("2026-08-06T17:45:00Z"),
    waiterName: "Lucia Herrera"
  },
  {
    id: "TXN-2026-1002",
    locationId: "LOC-BOGOTA-01",
    itemId: "menu-churrasco",
    quantity: 8,
    totalPrice: { USD: 184, COP: 745200 },
    paymentMethod: "Digital wallet",
    timestamp: new Date("2026-08-06T19:10:00Z"),
    waiterName: "Camila Ospina"
  },
  {
    id: "TXN-2026-1003",
    locationId: "LOC-CALI-01",
    itemId: "menu-family-combo",
    quantity: 6,
    totalPrice: { USD: 228, COP: 923400 },
    paymentMethod: "Debit card",
    timestamp: new Date("2026-08-07T20:00:00Z"),
    waiterName: "Mateo Salazar"
  },
  {
    id: "TXN-2026-1004",
    locationId: "LOC-MIAMI-01",
    itemId: "menu-guava-soda",
    quantity: 18,
    totalPrice: { USD: 72, COP: 291600 },
    paymentMethod: "Credit card",
    timestamp: new Date("2026-08-07T21:15:00Z"),
    waiterName: "Jacob Reed"
  },
  {
    id: "TXN-2026-1006",
    locationId: "LOC-MEDELLIN-01",
    itemId: "menu-arepas",
    quantity: 20,
    totalPrice: { USD: 140, COP: 567000 },
    paymentMethod: "Cash",
    timestamp: new Date("2026-08-08T12:05:00Z"),
    waiterName: "Lucia Herrera"
  }
];

export const exchangeRates: ExchangeRate[] = [
  { from: "USD", to: "COP", rate: 4050 },
  { from: "COP", to: "USD", rate: 1 / 4050 }
];

export const wasteRecords: WasteRecord[] = [
  {
    id: "WASTE-2026-001",
    locationId: "LOC-MEDELLIN-01",
    itemId: "menu-churrasco",
    quantity: 2,
    reason: "Cooking error",
    cost: { USD: 18.8, COP: 76140 },
    timestamp: new Date("2026-08-06T18:05:00Z"),
    reportedBy: "Lucia Herrera"
  },
  {
    id: "WASTE-2026-002",
    locationId: "LOC-MIAMI-01",
    itemId: "menu-guava-soda",
    quantity: 3,
    reason: "Damage",
    cost: { USD: 3, COP: 12150 },
    timestamp: new Date("2026-08-07T21:40:00Z"),
    reportedBy: "Jacob Reed"
  },
  {
    id: "WASTE-2026-003",
    locationId: "LOC-BOGOTA-01",
    itemId: "menu-arepas",
    quantity: 4,
    reason: "Expired",
    cost: { USD: 8.4, COP: 34020 },
    timestamp: new Date("2026-08-08T10:10:00Z"),
    reportedBy: "Camila Ospina"
  }
];
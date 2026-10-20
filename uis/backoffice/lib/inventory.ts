import { clearToken, getToken } from "./auth";
import {
  Ingredient,
  IngredientCountry,
  IngredientEntryInput,
  IngredientEntryResponse,
  IngredientExitInput,
  IngredientExitResponse,
  InventoryOrder,
} from "./types";

export class InventoryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {}
  ) {
    super(message);
    this.name = "InventoryApiError";
  }
}

function inventoryApiBaseUrl(): string {
  const envValue =
    process.env.NEXT_PUBLIC_INVENTORY_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "/backend";
  return envValue.trim().replace(/\/$/, "");
}

async function parseApiError(response: Response): Promise<InventoryApiError> {
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response
  }

  const detail = body?.detail;

  if (response.status >= 500) {
    const serverMessage =
      typeof detail === "string"
        ? detail
        : "The inventory service encountered an internal error. Please try again later.";
    return new InventoryApiError(serverMessage, response.status);
  }

  if (typeof detail === "string") {
    return new InventoryApiError(detail, response.status);
  }

  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    const messages: string[] = [];

    for (const item of detail) {
      const fieldLoc = Array.isArray(item?.loc) ? item.loc : [];
      // E.g. ['body', 'quantity'] -> 'quantity'
      const fieldName =
        fieldLoc.length > 1 && fieldLoc[0] === "body"
          ? String(fieldLoc[1])
          : String(fieldLoc[fieldLoc.length - 1] || "");
      const msg = item?.msg || "Invalid value";

      if (fieldName && !fieldErrors[fieldName]) {
        fieldErrors[fieldName] = msg;
      }
      messages.push(fieldName ? `${fieldName}: ${msg}` : msg);
    }

    const combinedMessage = messages.length > 0 ? messages.join("; ") : "Invalid input parameters.";
    return new InventoryApiError(combinedMessage, response.status, fieldErrors);
  }

  if (detail && typeof detail === "object") {
    const message = detail.message || JSON.stringify(detail);
    const fieldErrors: Record<string, string> = {};
    if (typeof detail.field === "string" && typeof detail.message === "string") {
      fieldErrors[detail.field] = detail.message;
    }
    return new InventoryApiError(message, response.status, fieldErrors);
  }

  return new InventoryApiError(
    `Inventory request failed with status ${response.status}.`,
    response.status
  );
}

async function inventoryFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${inventoryApiBaseUrl()}${path}`, {
      ...init,
      headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new InventoryApiError(
      "Unable to reach the Brasaland inventory service. Please check your network or verify the backend is running.",
      0
    );
  }

  if (response.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
    throw new InventoryApiError("Your session has expired. Please sign in again.", 401);
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response;
}

async function inventoryJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await inventoryFetch(path, init);
  return response.json();
}

/**
 * Fetch all ingredients (products) with their current computed stock.
 */
export async function getProducts(country?: IngredientCountry): Promise<Ingredient[]> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return inventoryJson<Ingredient[]>(`/inventory/products${query}`);
}

/**
 * Fetch a single ingredient by ID with its current computed stock.
 */
export async function getProduct(id: number): Promise<Ingredient> {
  return inventoryJson<Ingredient>(`/inventory/products/${id}`);
}

/**
 * Register an inbound ingredient delivery (IngredientEntry).
 */
export async function createInboundOrder(
  data: IngredientEntryInput
): Promise<IngredientEntryResponse> {
  return inventoryJson<IngredientEntryResponse>("/inventory/orders/inbound", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Register an outbound ingredient consumption or waste exit (IngredientExit).
 */
export async function createOutboundOrder(
  data: IngredientExitInput
): Promise<IngredientExitResponse> {
  return inventoryJson<IngredientExitResponse>("/inventory/orders/outbound", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Fetch all inventory orders (deliveries and exits) with ingredient details.
 */
export async function getOrders(params?: {
  country?: IngredientCountry;
  location_id?: number;
}): Promise<InventoryOrder[]> {
  const searchParams = new URLSearchParams();
  if (params?.country) {
    searchParams.set("country", params.country);
  }
  if (params?.location_id) {
    searchParams.set("location_id", params.location_id.toString());
  }
  const queryString = searchParams.toString();
  const path = `/inventory/orders${queryString ? `?${queryString}` : ""}`;
  return inventoryJson<InventoryOrder[]>(path);
}

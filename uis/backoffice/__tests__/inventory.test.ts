import {
  createInboundOrder,
  createOutboundOrder,
  getOrders,
  getProduct,
  getProducts,
  InventoryApiError,
  rejectDirectStockEdit,
} from "../lib/inventory";
import { track } from "../lib/services/telemetry";

jest.mock("../lib/services/telemetry", () => ({ track: jest.fn() }));

describe("Inventory API client (lib/inventory.ts)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("attaches Authorization header if token is present", async () => {
    localStorage.setItem("brasaland_access_token", "fake-jwt-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ id: 1, name: "Beef brisket", current_stock: 70 }],
    });

    const products = await getProducts();
    expect(products).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers.get("Authorization")).toBe("Bearer fake-jwt-token");
  });

  it("extracts 400 string detail message on insufficient stock", async () => {
    localStorage.setItem("brasaland_access_token", "fake-jwt-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        detail:
          "Insufficient stock for ingredient 'Beef brisket'. Available: 70.0, requested: 80.0.",
      }),
    });

    await expect(
      createOutboundOrder({
        ingredient_id: 1,
        quantity: 80,
        reason: "consumption",
        location_id: 1,
      })
    ).rejects.toThrow(
      "Insufficient stock for ingredient 'Beef brisket'. Available: 70.0, requested: 80.0."
    );
  });

  it("extracts validation errors array into readable messages and field errors", async () => {
    localStorage.setItem("brasaland_access_token", "fake-jwt-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [
          {
            loc: ["body", "quantity"],
            msg: "Input should be greater than 0",
            type: "greater_than",
          },
        ],
      }),
    });

    try {
      await createInboundOrder({
        ingredient_id: 1,
        quantity: 0,
        supplier_name: "Carnes S.A.",
        location_id: 1,
      });
      fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InventoryApiError);
      const apiErr = err as InventoryApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.message).toContain("quantity: Input should be greater than 0");
      expect(apiErr.fieldErrors.quantity).toBe("Input should be greater than 0");
    }
  });

  it("handles 500 server errors gracefully with readable message", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Database connection failed" }),
    });

    await expect(getProduct(1)).rejects.toThrow("Database connection failed");
  });

  it("queries products with country filter", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await getProducts("CO");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/inventory/products?country=CO"),
      expect.anything()
    );
  });

  it("queries orders with filters", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await getOrders({ country: "US", location_id: 11 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/inventory/orders?country=US&location_id=11"),
      expect.anything()
    );
  });

  it("clears token and redirects on 401 Unauthorized", async () => {
    localStorage.setItem("brasaland_access_token", "expired-token");
    const replaceMock = jest.fn();
    delete (window as any).location;
    window.location = { replace: replaceMock } as any;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Token expired" }),
    });

    await expect(getProducts()).rejects.toThrow("Your session has expired. Please sign in again.");
    expect(localStorage.getItem("brasaland_access_token")).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("handles network failure gracefully", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(getProducts()).rejects.toThrow(
      "Unable to reach the Brasaland inventory service. Please check your network or verify the backend is running."
    );
  });

  it("captures only committed response drafts with correlation", async () => {
    const properties = { location_id: 1, country: "CO", product_id: 1, product_category: "meat", quantity: 2, unit: "kg", currency: "COP", reason: "consumption" };
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true, status: 201, headers: new Headers({ "X-Request-ID": "f01fdb23-bac8-49d5-a581-1d3533f82dac" }),
      json: async () => ({ telemetry_events: [{ event_type: "outbound_order_created", properties }] }),
    });
    await createOutboundOrder({ ingredient_id: 1, quantity: 2, reason: "consumption", location_id: 1 });
    expect(track).toHaveBeenCalledWith("outbound_order_created", properties);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("captures a rejected stock edit without a created event", async () => {
    const properties = { location_id: 1, country: "CO", product_id: 1, product_category: "meat", quantity: 900, unit: "kg", currency: "COP", rejection_code: "order_required" };
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false, status: 403, headers: new Headers({ "X-Request-ID": "f01fdb23-bac8-49d5-a581-1d3533f82dac" }),
      json: async () => ({ detail: { message: "Order required.", telemetry_event: { event_type: "direct_stock_edit_rejected", properties } } }),
    });
    await expect(rejectDirectStockEdit(1, 1, 900)).rejects.toThrow("Order required.");
    expect(track).toHaveBeenCalledWith("direct_stock_edit_rejected", properties);
    expect(track).not.toHaveBeenCalledWith("outbound_order_created", expect.anything());
  });
});


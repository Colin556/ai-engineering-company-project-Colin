import { track } from "./telemetry";

const sections: Record<string, string> = {
  "/": "home", "/inventory/products": "inventory_products",
  "/inventory/orders": "inventory_orders", "/inventory/orders/inbound": "inventory_orders",
  "/inventory/orders/outbound": "inventory_orders", "/suppliers": "suppliers",
  "/incidents": "incidents", "/incidents/new": "incidents",
  "/account/profile": "account_profile", "/account/change-password": "account_password",
};

export function sectionId(pathname: string): string | undefined {
  return sections[pathname];
}

export function routeId(): string {
  return sectionId(window.location.pathname) ?? "authentication";
}

export function deviceClass(): "mobile" | "tablet" | "desktop" {
  return window.innerWidth < 768 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop";
}

export function captureFrontendError(errorCode: string): void {
  const release = process.env.NEXT_PUBLIC_RELEASE_ID || "development";
  track("frontend_error_captured", {
    route_id: routeId(), error_code: errorCode,
    release_id: /^[a-zA-Z0-9._-]{1,80}$/.test(release) ? release : "unknown",
    fatal: true, device_class: deviceClass(),
  });
}
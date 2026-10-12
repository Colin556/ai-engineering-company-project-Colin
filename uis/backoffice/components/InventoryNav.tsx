"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/inventory/products", label: "Ingredients & Stock" },
  { href: "/inventory/orders", label: "Order History" },
  { href: "/inventory/orders/inbound", label: "Register Delivery (Inbound)" },
  { href: "/inventory/orders/outbound", label: "Log Exit / Waste (Outbound)" },
];

export function InventoryNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Inventory navigation" className="border-b border-stone-200 mb-6">
      <div className="flex flex-wrap gap-2 sm:gap-6">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/inventory/products" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-amber-600 text-amber-900 font-semibold"
                  : "border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

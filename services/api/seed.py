from __future__ import annotations

from tinydb import Query

from database import db_lock, suppliers_table
from suppliers import SupplierCreate, utc_now


INITIAL_SUPPLIERS = (
    SupplierCreate(
        name="Carnes del Valle S.A.",
        country="CO",
        product_categories=["meat"],
        rate_per_unit=18.50,
        status="active",
    ),
    SupplierCreate(
        name="MiamiMeat Co.",
        country="US",
        product_categories=["meat"],
        rate_per_unit=22.75,
        status="active",
    ),
    SupplierCreate(
        name="Salsas Artesanales Ltda.",
        country="CO",
        product_categories=["sauce"],
        rate_per_unit=9.50,
        status="active",
    ),
)


def seed_suppliers() -> int:
    supplier_query = Query()
    inserted = 0

    with db_lock:
        for supplier in INITIAL_SUPPLIERS:
            if suppliers_table.contains(supplier_query.name == supplier.name):
                continue
            suppliers_table.insert(
                {
                    **supplier.model_dump(mode="json"),
                    "updated_at": utc_now().isoformat(),
                }
            )
            inserted += 1

    return inserted


def main() -> None:
    inserted = seed_suppliers()
    print(f"Supplier seeding complete: {inserted} record(s) inserted.")


if __name__ == "__main__":
    main()